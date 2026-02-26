/**
 * Flow Video Provider - Automação do Google Flow (Veo 3) via Puppeteer
 * 
 * Gerencia a geração de vídeos usando o Google Flow (labs.google/fx/flow).
 * 
 * ESTRATÉGIA DE COOKIES:
 * 1. Tenta reaproveitar o browser já aberto de um GeminiProvider logado
 *    (abre nova aba no mesmo browser = cookies compartilhados automaticamente)
 * 2. Se não houver browser ativo, abre um novo browser usando o mesmo
 *    userDataDir do provider Gemini (compartilha cookies por diretório)
 * 3. Busca automaticamente o primeiro provider Gemini logado via ProviderManager
 * 
 * Fluxo:
 * 1. Encontra provider Gemini logado → pega cookies/browser
 * 2. Navega para o Flow (text-to-video)
 * 3. Insere o prompt
 * 4. Aguarda a geração (polling por vídeo pronto)
 * 5. Baixa o vídeo gerado
 */

import { Browser, Page } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import https from 'https';
import http from 'http';

// Addon stealth para evitar detecção
puppeteerExtra.use(StealthPlugin());

// ========================================
// INTERFACES
// ========================================

export interface FlowVideoConfig {
  /** Mostrar o navegador (false = headless) */
  headless?: boolean;
  /** Diretório de saída para vídeos baixados */
  outputDir?: string;
  /** Timeout máximo para geração (ms) - padrão 10 min */
  generationTimeoutMs?: number;
  /** ID do provider Gemini a usar (se não informado, busca automaticamente) */
  geminiProviderId?: string;
}

export interface FlowGenerationResult {
  success: boolean;
  videoPath?: string;
  error?: string;
  durationMs?: number;
  /** Créditos restantes na conta após a geração */
  credits?: number;
}

export interface FlowImageResult {
  success: boolean;
  /** Caminhos locais das imagens geradas (até 4) */
  imagePaths?: string[];
  error?: string;
  durationMs?: number;
}

export type FlowProgressCallback = (progress: {
  stage: 'opening' | 'navigating' | 'submitting' | 'generating' | 'downloading' | 'complete' | 'error';
  message: string;
  percent?: number;
}) => void;

// ========================================
// FLOW VIDEO PROVIDER CLASS
// ========================================

export class FlowVideoProvider {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private config: FlowVideoConfig;
  private outputDir: string;
  /** Se true, o browser veio do GeminiProvider e NÃO deve ser fechado por nós */
  private usingSharedBrowser: boolean = false;

  // URLs do Flow
  private static readonly FLOW_URL = 'https://labs.google/fx/flow';

  constructor(config: FlowVideoConfig = {}) {
    this.config = {
      headless: config.headless ?? false,
      generationTimeoutMs: config.generationTimeoutMs ?? 600000, // 10 min
      ...config,
    };

    // Diretório de saída na pasta de projetos de vídeo
    this.outputDir = this.config.outputDir ||
      path.join(app.getPath('userData'), 'video-projects', 'flow-videos');

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  // ========================================
  // MÉTODOS PRIVADOS - SETUP
  // ========================================

  private findChromePath(): string | undefined {
    const possiblePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
    ];

    for (const chromePath of possiblePaths) {
      if (chromePath && fs.existsSync(chromePath)) {
        return chromePath;
      }
    }
    return undefined;
  }

  private async randomDelay(min: number = 500, max: number = 1500): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Verifica se o browser e a page ainda estão vivos/conectados.
   * Se não estiverem, reseta o estado para permitir re-inicialização.
   */
  public isBrowserAlive(): boolean {
    try {
      // Verifica browser
      if (!this.browser) return false;
      if (!this.browser.isConnected()) {
        console.log('⚠️ [Flow] Browser desconectado, resetando estado...');
        this.browser = null;
        this.page = null;
        this.usingSharedBrowser = false;
        return false;
      }

      // Verifica page
      if (!this.page) return false;
      if (this.page.isClosed()) {
        console.log('⚠️ [Flow] Page fechada, resetando estado...');
        this.page = null;
        // Se era browser compartilhado, não tenta fechar
        if (!this.usingSharedBrowser) {
          // browser ainda conectado mas page morreu — pode recriar page
        }
        return false;
      }

      return true;
    } catch (err) {
      console.warn('⚠️ [Flow] Erro ao verificar browser:', err);
      this.browser = null;
      this.page = null;
      this.usingSharedBrowser = false;
      return false;
    }
  }

  /**
   * Encontra o userDataDir de um provider Gemini logado via ProviderManager.
   * Retorna o caminho do userDataDir ou null se nenhum provider Gemini existir.
   */
  private findGeminiUserDataDir(): { userDataDir: string; providerId: string } | null {
    try {
      const { getProviderManager } = require('./PuppeteerProvider');
      const manager = getProviderManager();
      
      const geminiProviders = manager.listProvidersByPlatform('gemini');
      
      if (geminiProviders.length === 0) {
        console.log('⚠️ [Flow] Nenhum provider Gemini encontrado no ProviderManager');
        return null;
      }

      // Prioriza: primeiro o ID específico (se configurado), depois o logado mais recente
      let targetProvider = geminiProviders[0];
      
      if (this.config.geminiProviderId) {
        const specific = geminiProviders.find((p: any) => p.id === this.config.geminiProviderId);
        if (specific) {
          targetProvider = specific;
        } else {
          console.warn(`⚠️ [Flow] Provider Gemini "${this.config.geminiProviderId}" não encontrado, usando "${targetProvider.id}"`);
        }
      } else {
        // Busca o que está logado (prioridade) ou o mais recente
        const loggedIn = geminiProviders.find((p: any) => p.isLoggedIn);
        if (loggedIn) {
          targetProvider = loggedIn;
        }
      }

      const userDataDir = path.join(
        app.getPath('userData'),
        'provider-cookies',
        'profiles',
        targetProvider.id
      );

      console.log(`🔑 [Flow] Usando cookies do provider Gemini: "${targetProvider.name}" (${targetProvider.id})`);
      console.log(`📁 [Flow] UserDataDir: ${userDataDir}`);

      return { userDataDir, providerId: targetProvider.id };
    } catch (err: any) {
      console.error('❌ [Flow] Erro ao buscar provider Gemini:', err.message);
      return null;
    }
  }

  /**
   * Tenta reaproveitar o browser já aberto de um GeminiProvider ativo.
   * Se conseguir, abre uma nova aba no mesmo browser (cookies compartilhados).
   * Retorna true se conseguiu reaproveitar.
   */
  private tryReuseGeminiBrowser(): boolean {
    try {
      const { getProviderManager } = require('./PuppeteerProvider');
      const manager = getProviderManager();
      
      const geminiProviders = manager.listProvidersByPlatform('gemini');
      
      // Procura um provider Gemini ativo (com browser aberto)
      for (const config of geminiProviders) {
        const providerId = this.config.geminiProviderId || config.id;
        const activeProvider = manager.getGeminiProvider(providerId);
        
        if (activeProvider) {
          const existingBrowser = activeProvider.getBrowser?.();
          
          if (existingBrowser && existingBrowser.isConnected()) {
            this.browser = existingBrowser;
            this.usingSharedBrowser = true;
            console.log(`🔗 [Flow] Reutilizando browser do GeminiProvider "${config.name}" (${config.id})`);
            return true;
          }
        }
      }
      
      return false;
    } catch (err: any) {
      console.warn('⚠️ [Flow] Erro ao tentar reutilizar browser:', err.message);
      return false;
    }
  }

  // ========================================
  // MÉTODOS PÚBLICOS - CONEXÃO
  // ========================================

  /**
   * Inicializa o navegador usando os cookies do provider Gemini logado.
   * 
   * Estratégia:
   * 1. Tenta reusar o browser já aberto do GeminiProvider (nova aba)
   * 2. Se não disponível, abre novo browser com o mesmo userDataDir
   */
  async init(): Promise<void> {
    // Verifica se o browser/page REALMENTE estão vivos
    if (this.isBrowserAlive()) {
      console.log(`⚠️ [Flow] Browser já inicializado e conectado`);
      return;
    }

    // Se chegou aqui, browser/page estão mortos ou nunca iniciados
    // Garante que o estado está limpo
    this.browser = null;
    this.page = null;
    this.usingSharedBrowser = false;

    try {
      console.log(`🚀 [Flow] Inicializando navegador...`);

      // ESTRATÉGIA 1: Reutilizar browser do GeminiProvider ativo
      if (!this.browser) {
        const reused = this.tryReuseGeminiBrowser();
        
        if (reused && this.browser) {
          // Abre nova aba no browser existente
          this.page = await this.browser.newPage();
          
          await this.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
              get: () => undefined,
            });
            // @ts-ignore
            window.navigator.chrome = { runtime: {} };
          });

          await this.page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
          });

          console.log(`✅ [Flow] Nova aba aberta no browser do Gemini (cookies compartilhados)`);
          return;
        }
      }

      // ESTRATÉGIA 2: Abrir novo browser com o mesmo userDataDir do provider Gemini
      const geminiData = this.findGeminiUserDataDir();
      
      if (!geminiData) {
        throw new Error(
          'Nenhum provider Gemini encontrado. Crie um provider Gemini e faça login na conta Google primeiro.'
        );
      }

      const chromePath = this.findChromePath();
      console.log(`🔍 [Flow] Chrome path: ${chromePath || 'using bundled Chromium'}`);

      const launchOptions: any = {
        headless: this.config.headless,
        userDataDir: geminiData.userDataDir,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1366,768',
          '--lang=en-US',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-site-isolation-trials',
          '--disable-infobars',
        ],
        ignoreDefaultArgs: ['--enable-automation'],
        defaultViewport: { width: 1366, height: 768 },
      };

      if (chromePath) {
        launchOptions.executablePath = chromePath;
      }

      this.browser = await puppeteerExtra.launch(launchOptions);
      this.usingSharedBrowser = false;

      const pages = await this.browser.pages();
      this.page = pages[0] || await this.browser.newPage();

      // Remove webdriver property
      await this.page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
        // @ts-ignore
        window.navigator.chrome = { runtime: {} };
      });

      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
      });

      console.log(`✅ [Flow] Navegador inicializado com cookies do Gemini (provider: ${geminiData.providerId})`);
    } catch (error) {
      console.error(`❌ [Flow] Erro ao inicializar navegador:`, error);
      throw error;
    }
  }

  /**
   * Gera um vídeo usando o Google Flow (Veo 3)
   * 
   * @param prompt - Prompt descritivo em inglês para geração do vídeo
   * @param onProgress - Callback opcional de progresso
   * @param aspectRatio - Proporção do vídeo ('9:16' para portrait, '16:9' para landscape)
   * @returns Resultado com caminho do vídeo baixado
   */
  async generateVideo(
    prompt: string,
    onProgress?: FlowProgressCallback,
    aspectRatio?: string,
    model: string = 'Veo 3.1 - Fast',
    count: number = 1
  ): Promise<FlowGenerationResult> {
    const startTime = Date.now();

    const emitProgress = (stage: any, message: string, percent?: number) => {
      console.log(`🎬 [Flow] ${message}`);
      onProgress?.({ stage, message, percent });
    };

    try {
      // 1. Inicializar navegador se necessário (verifica se está vivo)
      if (!this.isBrowserAlive()) {
        emitProgress('opening', 'Abrindo navegador com cookies do Gemini...');
        await this.init();
      }

      if (!this.page) {
        throw new Error('Página não disponível');
      }

      // 1b. Verificar créditos antes de iniciar
      emitProgress('navigating', 'Verificando créditos...');
      const creditsBefore = await this.getCredits();
      const videoCost = 20; // Custo padrão do Veo 3
      if (creditsBefore !== null && creditsBefore < videoCost) {
        throw new Error(`Créditos insuficientes: ${creditsBefore} disponíveis, ${videoCost} necessários para gerar um vídeo.`);
      }
      if (creditsBefore !== null) {
        console.log(`💰 [Flow] Créditos disponíveis: ${creditsBefore}`);
      }

      // 2. Verificar se já está numa página de projeto do Flow
      const currentUrl = this.page.url();
      const alreadyInProject = currentUrl.includes('/project/');

      if (alreadyInProject) {
        console.log(`✅ [Flow] Já está numa página de projeto: ${currentUrl}`);
        emitProgress('navigating', 'Já na página de projeto, preparando novo prompt...');
      } else {
        // Navegar para o Flow
        emitProgress('navigating', 'Navegando para o Google Flow...');
        await this.page.goto(FlowVideoProvider.FLOW_URL, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });

        await this.randomDelay(2000, 4000);

        // Verificar se está logado
        const urlAfterNav = this.page.url();
        if (urlAfterNav.includes('accounts.google.com')) {
          throw new Error(
            'Usuário não está logado na conta Google. Faça login pelo GeminiProvider primeiro ' +
            '(Configurações → Providers → Criar Gemini → Login).'
          );
        }

        // 3. Clicar em "Novo projeto" / "New Project" para abrir o editor
        emitProgress('navigating', 'Clicando em Novo Projeto...');
        const projectOpened = await this.clickNewProject();
        
        if (!projectOpened) {
          throw new Error('Não foi possível abrir um novo projeto no Flow. A interface pode ter mudado.');
        }
      }

      // 4. Definir modelo via menu dropdown
      emitProgress('submitting', `Selecionando modelo "${model}"...`);
      await this.setFlowModel(model, 'video');
      await this.randomDelay(300, 500);

      // 5. Definir aspect ratio via menu dropdown
      if (aspectRatio) {
        emitProgress('submitting', `Definindo proporção ${aspectRatio}...`);
        await this.setAspectRatio(aspectRatio);
        await this.randomDelay(300, 500);
      }

      // 5b. Definir quantidade de vídeos por geração
      if (count > 1) {
        emitProgress('submitting', `Definindo ${count} vídeos por geração...`);
        await this.setResponseCount(count);
        await this.randomDelay(300, 500);
      }

      // 6. Procurar e submeter o prompt
      emitProgress('submitting', 'Localizando campo de prompt...');
      await this.randomDelay(1000, 2000);

      // Coletar as URLs dos vídeos já existentes na página antes de gerar
      const knownVideoUrls = await this.getExistingVideoUrls();
      emitProgress('submitting', `Verificadas ${knownVideoUrls.length} mídias anteriores...`);

      // Tentar encontrar o campo de prompt de diversas formas
      const promptSubmitted = await this.submitPrompt(prompt);
      
      if (!promptSubmitted) {
        throw new Error('Não foi possível encontrar o campo de prompt no Flow. A interface pode ter mudado.');
      }

      emitProgress('submitting', 'Prompt enviado! Aguardando geração...');

      // 4. Aguardar geração do vídeo
      emitProgress('generating', 'Gerando vídeo com Veo 3...', 10);
      
      const videoUrl = await this.waitForVideoGeneration(
        this.config.generationTimeoutMs!,
        knownVideoUrls,
        (percent) => {
          emitProgress('generating', `Gerando vídeo... ${percent}%`, percent);
        }
      );

      if (!videoUrl) {
        throw new Error('Timeout: O vídeo não foi gerado no tempo limite.');
      }

      // 5. Baixar o vídeo
      emitProgress('downloading', 'Baixando vídeo gerado...', 90);
      
      const outputFileName = `veo3-${Date.now()}.mp4`;
      const outputPath = path.join(this.outputDir, outputFileName);
      
      await this.downloadVideo(videoUrl, outputPath);

      const durationMs = Date.now() - startTime;
      
      // Ler créditos restantes após geração
      const creditsAfter = await this.getCredits();
      if (creditsAfter !== null) {
        console.log(`💰 [Flow] Créditos restantes após geração: ${creditsAfter}`);
      }
      
      emitProgress('complete', `Vídeo gerado com sucesso! (${Math.round(durationMs / 1000)}s)`, 100);

      return {
        success: true,
        videoPath: outputPath,
        durationMs,
        credits: creditsAfter ?? undefined,
      };

    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      emitProgress('error', `Erro: ${error.message}`);
      console.error(`❌ [Flow] Erro na geração:`, error);

      return {
        success: false,
        error: error.message,
        durationMs,
      };
    }
  }

  // ========================================
  // MÉTODOS PRIVADOS - AUTOMAÇÃO DOM
  // Usa APIs nativas do Puppeteer para evitar problemas com transpilação Babel
  // ========================================

  /**
   * Obtém o textContent de um ElementHandle sem usar page.evaluate()
   */
  private async getTextContent(handle: import('puppeteer').ElementHandle): Promise<string> {
    const prop = await handle.getProperty('textContent');
    return ((await prop.jsonValue()) as string || '').trim();
  }

  /**
   * Verifica se um ElementHandle está visível na página
   */
  private async isVisible(handle: import('puppeteer').ElementHandle): Promise<boolean> {
    const box = await handle.boundingBox();
    return box !== null && box.width > 0 && box.height > 0;
  }

  /**
   * Lê os créditos de IA do Flow.
   * Caminho: clica no botão de perfil → lê "X Créditos de IA" → fecha menu.
   * Retorna null se não conseguir ler.
   */
  async getCredits(): Promise<number | null> {
    if (!this.page) return null;

    try {
      // 1. Encontrar e clicar no botão de perfil (contém imagem + badge PRO)
      let profileBtn: import('puppeteer').ElementHandle | null = null;
      const buttons = await this.page.$$('button');
      for (const btn of buttons) {
        if (!(await this.isVisible(btn))) continue;
        // Buscar botão que contém <img alt="...perfil..."> ou classe com profile
        const imgs = await btn.$$('img');
        for (const img of imgs) {
          const altProp = await img.getProperty('alt');
          const alt = ((await altProp.jsonValue()) as string || '').toLowerCase();
          if (alt.includes('perfil') || alt.includes('profile')) {
            profileBtn = btn;
            break;
          }
        }
        if (profileBtn) break;
        // Fallback: buscar botão com badge PRO
        const text = await this.getTextContent(btn);
        if (text.includes('PRO') && imgs.length > 0) {
          profileBtn = btn;
          break;
        }
      }

      if (!profileBtn) {
        console.warn('⚠️ [Flow] Botão de perfil não encontrado para ler créditos');
        return null;
      }

      // 2. Clicar para abrir menu
      await profileBtn.click();
      await this.randomDelay(800, 1200);

      // 3. Procurar texto de créditos no menu aberto
      //    Formato: "960 Créditos de IA" ou "960 AI Credits"
      let credits: number | null = null;
      const allLinks = await this.page.$$('a');
      for (const link of allLinks) {
        const text = await this.getTextContent(link);
        // Procurar padrão "<número> Créditos" ou "<número> Credits"
        const match = text.match(/(\d[\d.,]*)\s*(Créditos|Credits)/i);
        if (match) {
          // Remover pontos/vírgulas de separador de milhares
          credits = parseInt(match[1].replace(/[.,]/g, ''), 10);
          console.log(`💰 [Flow] Créditos lidos: ${credits} (texto: "${text}")`);
          break;
        }
      }

      // Também procurar em divs e spans caso não esteja em <a>
      if (credits === null) {
        const allDivs = await this.page.$$('div, span');
        for (const el of allDivs) {
          const text = await this.getTextContent(el);
          const match = text.match(/^(\d[\d.,]*)\s*(Créditos|Credits)/i);
          if (match) {
            credits = parseInt(match[1].replace(/[.,]/g, ''), 10);
            console.log(`💰 [Flow] Créditos lidos (div): ${credits} (texto: "${text}")`);
            break;
          }
        }
      }

      // 4. Fechar menu clicando no botão de perfil novamente ou Escape
      await this.page.keyboard.press('Escape');
      await this.randomDelay(300, 500);

      return credits;
    } catch (error: any) {
      console.warn(`⚠️ [Flow] Erro ao ler créditos:`, error.message);
      // Tentar fechar qualquer menu aberto
      try { await this.page.keyboard.press('Escape'); } catch (_) {}
      return null;
    }
  }

  // ========================================
  // CONFIGURAÇÕES VIA MENU DROPDOWN
  // ========================================

  /**
   * Abre o dropdown de configurações.
   * O botão correto tem aria-haspopup="menu" e contém ícone crop_* ou texto xN.
   * Ignora o botão "Ordenar e filtrar" (ícone filter_list).
   */
  private async openSettingsDropdownMenu(): Promise<boolean> {
    if (!this.page) return false;
    try {
      const menuBtns = await this.page.$$('button[aria-haspopup="menu"]');
      for (const btn of menuBtns) {
        if (!(await this.isVisible(btn))) continue;

        const icons = await btn.$$('i');
        let isFilterBtn = false;
        let hasSettingsIcon = false;
        for (const icon of icons) {
          const iconText = (await this.getTextContent(icon)).trim();
          if (iconText === 'filter_list') { isFilterBtn = true; break; }
          if (iconText.startsWith('crop_') || iconText === 'arrow_drop_down') {
            hasSettingsIcon = true;
          }
        }
        if (isFilterBtn) continue;

        const btnText = (await this.getTextContent(btn)).trim();
        const hasCount = /x[1-4]/.test(btnText);

        if (hasSettingsIcon || hasCount) {
          await btn.click();
          await this.randomDelay(500, 900);
          const menu = await this.page.$('[role="menu"]');
          if (menu) {
            const box = await (menu as any).boundingBox();
            if (box && box.width > 0) {
              console.log('✅ [Flow] Dropdown de configurações aberto');
              return true;
            }
          }
        }
      }
      return false;
    } catch (err: any) {
      console.warn('⚠️ [Flow] Erro ao abrir dropdown:', err.message);
      return false;
    }
  }

  /** Fecha o dropdown de configurações (Escape) */
  private async closeSettingsDropdownMenu(): Promise<void> {
    if (!this.page) return;
    try {
      await this.page.keyboard.press('Escape');
      await this.randomDelay(300, 500);
    } catch {}
  }

  /**
   * Clica em um button[role="tab"] dentro do menu dropdown aberto.
   * matchIcon: valor do ícone (ex: 'crop_16_9', 'crop_9_16')
   * matchText:  texto exato (ex: 'x1', 'x2', 'x3', 'x4')
   */
  private async clickMenuTab(matchText?: string, matchIcon?: string): Promise<boolean> {
    if (!this.page) return false;
    try {
      const tabs = await this.page.$$('button[role="tab"]');
      for (const tab of tabs) {
        if (!(await this.isVisible(tab))) continue;

        if (matchIcon) {
          const icons = await tab.$$('i');
          for (const icon of icons) {
            if ((await this.getTextContent(icon)).trim() === matchIcon) {
              await tab.click();
              await this.randomDelay(200, 400);
              console.log(`✅ [Flow] Tab "${matchIcon}" clicado`);
              return true;
            }
          }
        }

        if (matchText) {
          const tabText = (await this.getTextContent(tab)).trim();
          if (tabText === matchText) {
            await tab.click();
            await this.randomDelay(200, 400);
            console.log(`✅ [Flow] Tab "${matchText}" clicado`);
            return true;
          }
        }
      }
      console.warn(`⚠️ [Flow] Tab não encontrado (icon=${matchIcon}, text=${matchText})`);
      return false;
    } catch (err: any) {
      console.warn('⚠️ [Flow] Erro ao clicar tab:', err.message);
      return false;
    }
  }

  /**
   * Define o aspect ratio via o menu dropdown de configurações.
   * Tabs: crop_16_9 = Paisagem, crop_9_16 = Retrato
   */
  private async setAspectRatio(aspectRatio: string): Promise<void> {
    const isPortrait = aspectRatio === '9:16' || aspectRatio === '4:5' || aspectRatio === '3:4';
    const targetIcon = isPortrait ? 'crop_9_16' : 'crop_16_9';
    const label = isPortrait ? 'Retrato (9:16)' : 'Paisagem (16:9)';
    try {
      const opened = await this.openSettingsDropdownMenu();
      if (!opened) {
        console.warn('⚠️ [Flow] Não foi possível abrir menu para definir aspect ratio');
        return;
      }
      await this.clickMenuTab(undefined, targetIcon);
      await this.randomDelay(300, 500);
      await this.closeSettingsDropdownMenu();
      console.log(`✅ [Flow] Aspect ratio definido: ${label}`);
    } catch (err: any) {
      console.warn('⚠️ [Flow] Erro ao definir aspect ratio:', err.message);
    }
  }

  /**
   * Seleciona o tipo de mídia e o modelo dentro do dropdown de configurações.
   *
   * mediaType: 'video' → clica no tab Video (ícone videocam) antes de selecionar o modelo
   *            'image' → clica no tab Image (ícone image)
   *
   * modelLabel exemplos:
   *   - 'Veo 2 - Fast'       → vídeo
   *   - 'Veo 3.1 - Fast'     → vídeo
   *   - '🍌 Nano Banana Pro'  → imagem
   */
  private async setFlowModel(modelLabel: string, mediaType: 'video' | 'image' = 'image'): Promise<void> {
    if (!this.page) return;
    try {
      // 1. Abrir o menu de configurações principal
      const opened = await this.openSettingsDropdownMenu();
      if (!opened) {
        console.warn('⚠️ [Flow] Não foi possível abrir menu para definir modelo');
        return;
      }

      // 2. Selecionar o tab de mídia correto (Image ou Video)
      //    Os tabs têm aria-controls contendo 'IMAGE' ou 'VIDEO'
      const tabIcon = mediaType === 'video' ? 'videocam' : 'image';
      const tabs = await this.page.$$('button[role="tab"]');
      let tabClicked = false;
      for (const tab of tabs) {
        if (!(await this.isVisible(tab))) continue;
        const ariaControlsProp = await tab.getProperty('ariaControls');
        const ariaControls = ((await ariaControlsProp?.jsonValue()) as string || '').toUpperCase();
        const isCorrectTab = mediaType === 'video'
          ? ariaControls.includes('VIDEO')
          : ariaControls.includes('IMAGE');

        if (isCorrectTab) {
          // Verificar se já está ativo
          const stateProp = await tab.getProperty('ariaSelected');
          const isSelected = (await stateProp?.jsonValue()) === 'true';
          if (!isSelected) {
            await tab.click();
            await this.randomDelay(400, 600);
            console.log(`✅ [Flow] Tab "${mediaType}" selecionado`);
          } else {
            console.log(`ℹ️ [Flow] Tab "${mediaType}" já estava ativo`);
          }
          tabClicked = true;
          break;
        }
      }
      if (!tabClicked) {
        // Fallback: buscar por ícone
        await this.clickMenuTab(undefined, tabIcon);
        await this.randomDelay(400, 600);
      }

      // 3. Encontrar o botão do modelo (tem aria-haspopup="menu" e arrow_drop_down)
      let modelBtn: import('puppeteer').ElementHandle | null = null;
      const menuBtns = await this.page.$$('button[aria-haspopup="menu"]');
      for (const btn of menuBtns) {
        if (!(await this.isVisible(btn))) continue;
        const icons = await btn.$$('i');
        let hasArrow = false;
        for (const icon of icons) {
          if ((await this.getTextContent(icon)).trim() === 'arrow_drop_down') {
            hasArrow = true;
            break;
          }
        }
        if (hasArrow) {
          modelBtn = btn;
          const currentModel = (await this.getTextContent(btn)).replace('arrow_drop_down', '').trim();
          console.log(`🔍 [Flow] Modelo atual: "${currentModel}"`);
          if (currentModel.includes(modelLabel) || currentModel === modelLabel) {
            console.log(`✅ [Flow] Modelo já é "${modelLabel}"`);
            await this.closeSettingsDropdownMenu();
            return;
          }
          break;
        }
      }

      if (!modelBtn) {
        console.warn('⚠️ [Flow] Botão de modelo não encontrado no menu');
        await this.closeSettingsDropdownMenu();
        return;
      }

      // 4. Clicar no botão do modelo → abre submenu
      await modelBtn.click();
      await this.randomDelay(500, 800);

      // 5. Selecionar o modelo alvo
      const optionSelectors = ['[role="menuitem"]', '[role="menuitemradio"]', '[role="option"]'];
      let modelSelected = false;
      for (const selector of optionSelectors) {
        const options = await this.page.$$(selector);
        for (const opt of options) {
          if (!(await this.isVisible(opt))) continue;
          const optText = (await this.getTextContent(opt)).trim();
          if (optText.includes(modelLabel) || optText === modelLabel) {
            await opt.click();
            modelSelected = true;
            console.log(`✅ [Flow] Modelo selecionado: "${modelLabel}"`);
            break;
          }
        }
        if (modelSelected) break;
      }

      if (!modelSelected) {
        console.warn(`⚠️ [Flow] Modelo "${modelLabel}" não encontrado no submenu`);
        await this.page.keyboard.press('Escape');
      }

      await this.randomDelay(300, 500);
      await this.page.keyboard.press('Escape').catch(() => {});

    } catch (err: any) {
      console.warn('⚠️ [Flow] Erro ao definir modelo:', err.message);
      try { await this.page.keyboard.press('Escape'); } catch {}
    }
  }

  /**
   * Clica no botão "Novo projeto" / "New Project" e verifica se navega para /project/
   */
  private async clickNewProject(): Promise<boolean> {
    if (!this.page) return false;

    try {
      // Verifica se já está numa rota /project/
      const currentUrl = this.page.url();
      if (currentUrl.includes('/project/')) {
        console.log(`✅ [Flow] Já está numa página de projeto: ${currentUrl}`);
        return true;
      }

      console.log(`🔍 [Flow] Procurando botão "Novo projeto" / "New Project"...`);

      let clicked = false;

      // Estratégia 1: Buscar por texto do botão
      const buttons = await this.page.$$('button');
      for (const btn of buttons) {
        const text = (await this.getTextContent(btn)).toLowerCase();
        if (text.includes('novo projeto') || text.includes('new project')) {
          if (await this.isVisible(btn)) {
            await btn.click();
            clicked = true;
            console.log(`✅ [Flow] Botão encontrado pelo texto: "${text}"`);
            break;
          }
        }
      }

      // Estratégia 2: Buscar pelo ícone add_2
      if (!clicked) {
        const icons = await this.page.$$('i.google-symbols');
        for (const icon of icons) {
          const text = await this.getTextContent(icon);
          if (text === 'add_2') {
            if (await this.isVisible(icon)) {
              await icon.click(); // Click bubbles up para o button pai
              clicked = true;
              console.log(`✅ [Flow] Botão encontrado pelo ícone add_2`);
              break;
            }
          }
        }
      }

      // Estratégia 3: Buscar em links (<a>)
      if (!clicked) {
        const links = await this.page.$$('a');
        for (const link of links) {
          const text = (await this.getTextContent(link)).toLowerCase();
          if (text.includes('novo projeto') || text.includes('new project')) {
            if (await this.isVisible(link)) {
              await link.click();
              clicked = true;
              console.log(`✅ [Flow] Link encontrado pelo texto: "${text}"`);
              break;
            }
          }
        }
      }

      if (!clicked) {
        console.error('❌ [Flow] Botão "Novo projeto" não encontrado');
        try {
          const debugPath = path.join(this.outputDir, `flow-new-project-debug-${Date.now()}.png`);
          await this.page.screenshot({ path: debugPath, fullPage: true });
          console.log(`📸 [Flow] Screenshot de debug: ${debugPath}`);
        } catch {}
        return false;
      }

      console.log(`✅ [Flow] Botão clicado, aguardando página de projeto carregar...`);

      // Espera dinâmica: polling até o botão "filter_list" (Ordenar e filtrar) aparecer,
      // que é um indicador confiável de que a página de projeto foi carregada.
      const projectReadyTimeoutMs = 20000;
      const pollIntervalMs = 500;
      const projectReadyStart = Date.now();
      let projectReady = false;

      while (Date.now() - projectReadyStart < projectReadyTimeoutMs) {
        // Critério 1: URL contém /project/
        const currentUrl = this.page.url();
        if (currentUrl.includes('/project/')) {
          // Critério 2: botão filter_list está visível (página totalmente carregada)
          try {
            const filterBtns = await this.page.$$('button');
            for (const btn of filterBtns) {
              const icons = await btn.$$('i');
              for (const icon of icons) {
                if ((await this.getTextContent(icon)).trim() === 'filter_list') {
                  if (await this.isVisible(btn)) {
                    projectReady = true;
                    break;
                  }
                }
              }
              if (projectReady) break;
            }
          } catch {}

          if (projectReady) {
            const elapsed = Math.round((Date.now() - projectReadyStart) / 100) / 10;
            console.log(`✅ [Flow] Página de projeto pronta em ${elapsed}s: ${currentUrl}`);
            return true;
          }
        }
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }

      // Timeout: verificar mesmo sem o filter_list (pode ter mudado o layout)
      const finalUrl = this.page.url();
      if (finalUrl.includes('/project/')) {
        console.warn(`⚠️ [Flow] Projeto aberto mas filter_list não encontrado: ${finalUrl}`);
        return true;
      }

      console.error(`❌ [Flow] Timeout: URL não contém /project/ após ${projectReadyTimeoutMs / 1000}s: ${finalUrl}`);
      try {
        const debugPath = path.join(this.outputDir, `flow-route-debug-${Date.now()}.png`);
        await this.page.screenshot({ path: debugPath, fullPage: true });
        console.log(`📸 [Flow] Screenshot: ${debugPath}`);
      } catch {}
      return false;

    } catch (error: any) {
      console.error(`❌ [Flow] Erro ao clicar em novo projeto:`, error.message);
      return false;
    }
  }

  /**
   * Submete o prompt no Flow
   */
  private async submitPrompt(prompt: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      const promptSelectors = [
        'textarea[placeholder*="Describe"]',
        'textarea[placeholder*="describe"]',
        'textarea[placeholder*="prompt"]',
        'textarea[placeholder*="Enter"]',
        'textarea[aria-label*="prompt"]',
        'textarea[aria-label*="Prompt"]',
        'textarea[aria-label*="video"]',
        'div[contenteditable="true"][aria-label*="prompt"]',
        'div[contenteditable="true"][aria-label*="Prompt"]',
        'div[contenteditable="true"][role="textbox"]',
        'textarea',
        'input[type="text"][placeholder*="Describe"]',
        'input[type="text"][placeholder*="prompt"]',
      ];

      let inputElement: import('puppeteer').ElementHandle | null = null;
      let usedSelector = '';

      for (const selector of promptSelectors) {
        const el = await this.page.$(selector);
        if (el && await this.isVisible(el)) {
          inputElement = el;
          usedSelector = selector;
          break;
        }
      }

      if (!inputElement) {
        console.error(`❌ [Flow] Nenhum campo de prompt encontrado`);
        try {
          const debugPath = path.join(this.outputDir, `flow-debug-${Date.now()}.png`);
          await this.page.screenshot({ path: debugPath, fullPage: true });
          console.log(`📸 [Flow] Screenshot: ${debugPath}`);
        } catch {}
        return false;
      }

      console.log(`✅ [Flow] Campo de prompt encontrado: ${usedSelector}`);

      // Clicar, selecionar tudo e digitar
      await inputElement.click();
      await this.randomDelay(300, 600);
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('A');
      await this.page.keyboard.up('Control');
      await this.randomDelay(100, 200);
      await this.page.keyboard.type(prompt, { delay: 15 });
      await this.randomDelay(500, 1000);

      console.log(`📝 [Flow] Prompt digitado: "${prompt.substring(0, 80)}..."`);

      // Procurar botão de submit
      const submitSelectors = [
        'button[aria-label*="Generate"]',
        'button[aria-label*="generate"]',
        'button[aria-label*="Create"]',
        'button[aria-label*="create"]',
        'button[aria-label*="Submit"]',
        'button[aria-label*="submit"]',
        'button[aria-label*="Send"]',
        'button[type="submit"]',
      ];

      let submitClicked = false;
      for (const selector of submitSelectors) {
        const btn = await this.page.$(selector);
        if (btn && await this.isVisible(btn)) {
          await btn.click();
          submitClicked = true;
          console.log(`✅ [Flow] Botão de submit clicado: ${selector}`);
          break;
        }
      }

      if (!submitClicked) {
        console.log(`⚠️ [Flow] Botão de submit não encontrado, tentando Enter...`);
        await this.page.keyboard.press('Enter');
      }

      await this.randomDelay(2000, 3000);
      return true;

    } catch (error: any) {
      console.error(`❌ [Flow] Erro ao submeter prompt:`, error.message);
      return false;
    }
  }

  /**
   * Aguarda a geração do vídeo monitorando o DOM via APIs nativas do Puppeteer.
   * Lê o progresso real do Flow (ex: "36%") e sincroniza com o callback.
   */
  private async waitForVideoGeneration(
    timeoutMs: number,
    knownVideoUrls: string[],
    onPercent?: (percent: number) => void
  ): Promise<string | null> {
    if (!this.page) return null;

    const startTime = Date.now();
    const pollInterval = 3000;
    let lastPercent = 10;

    console.log(`⏳ [Flow] Aguardando geração do vídeo (timeout: ${timeoutMs / 1000}s)...`);

    while (Date.now() - startTime < timeoutMs) {
      try {
        // 1. Procurar <video> com src (vídeo pronto)
        const videos = await this.page.$$('video[src], video source[src]');
        for (const v of videos) {
          const srcProp = await v.getProperty('src');
          const src = (await srcProp.jsonValue()) as string;
          if (src && !knownVideoUrls.includes(src) && (src.includes('.mp4') || src.includes('blob:') || src.includes('video') || src.includes('googleusercontent') || src.includes('storage.googleapis'))) {
            console.log(`✅ [Flow] Vídeo encontrado! URL: ${src.substring(0, 100)}`);
            return src;
          }
        }

        // 2. Procurar link de download
        const downloadLinks = await this.page.$$('a[download], a[href*=".mp4"], a[href*="download"]');
        for (const link of downloadLinks) {
          const hrefProp = await link.getProperty('href');
          const href = (await hrefProp.jsonValue()) as string;
          if (href && !knownVideoUrls.includes(href)) {
            console.log(`✅ [Flow] Link de download encontrado: ${href.substring(0, 100)}`);
            return href;
          }
        }

        // 3. Verificar erros via toasts (policy error, rate limit, queue full)
        const toasts = await this.page.$$('li[data-sonner-toast]');
        for (const toast of toasts) {
          const text = (await this.getTextContent(toast)).toLowerCase();
          const icons = await toast.$$('i');
          let hasErrorIcon = false;
          for (const icon of icons) {
            const iconText = (await this.getTextContent(icon)).trim();
            if (iconText === 'error') {
              hasErrorIcon = true;
              break;
            }
          }
          if (hasErrorIcon) {
            if (text.includes('too quickly')) {
              throw new Error('Rate limit: gerando vídeos muito rápido. Aguarde um pouco.');
            }
            throw new Error(`Flow reportou erro: ${text.substring(0, 200)}`);
          }
        }

        // 3b. Verificar card de falha (ícone 'warning' + "Falha" / "Algo deu errado")
        const warningIcons = await this.page.$$('i');
        for (const icon of warningIcons) {
          if ((await this.getTextContent(icon)).trim() !== 'warning') continue;
          if (!(await this.isVisible(icon))) continue;
          const parentProp = await this.page.evaluateHandle(
            (el: Element) => el.closest('[class*="f112b7ef"]') || el.parentElement?.parentElement || el.parentElement,
            icon
          );
          const parentText = parentProp
            ? (await this.getTextContent(parentProp as any)).trim()
            : '';
          console.error(`❌ [Flow] Card de falha detectado na geração de vídeo: "${parentText.substring(0, 100)}"`);
          throw new Error(`Flow retornou falha: ${parentText.substring(0, 150) || 'Algo deu errado.'}`);
        }

        // 4. Ler progresso real do Flow (elemento com texto "%")
        let realPercent = 0;
        const allElements = await this.page.$$('div');
        for (const el of allElements) {
          const text = (await this.getTextContent(el)).trim();
          const percentMatch = text.match(/^(\d{1,3})%$/);
          if (percentMatch) {
            realPercent = parseInt(percentMatch[1], 10);
            break;
          }
        }

        if (realPercent > 0 && realPercent > lastPercent) {
          lastPercent = realPercent;
          onPercent?.(realPercent);
          console.log(`📊 [Flow] Progresso real: ${realPercent}%`);
        } else if (realPercent === 0) {
          // Fallback: estimar por tempo se não encontrar o elemento de progresso
          const elapsed = Date.now() - startTime;
          const estimatedPercent = Math.min(85, Math.round(10 + (elapsed / timeoutMs) * 75));
          if (estimatedPercent > lastPercent) {
            lastPercent = estimatedPercent;
            onPercent?.(estimatedPercent);
          }
        }

      } catch (err: any) {
        if (err.message.includes('Flow reportou erro') || err.message.includes('Rate limit') || err.message.includes('Flow retornou falha')) {
          throw err;
        }
        console.warn(`⚠️ [Flow] Erro ao verificar status:`, err.message);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    console.error(`❌ [Flow] Timeout: Vídeo não foi gerado em ${timeoutMs / 1000}s`);
    return null;
  }

  /**
   * Baixa o vídeo da URL para o caminho especificado
   */
  private async downloadVideo(videoUrl: string, outputPath: string): Promise<void> {
    if (videoUrl.startsWith('blob:')) {
      await this.downloadBlobVideo(outputPath);
      return;
    }

    return new Promise((resolve, reject) => {
      const protocol = videoUrl.startsWith('https') ? https : http;
      const file = fs.createWriteStream(outputPath);
      
      protocol.get(videoUrl, (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          fs.unlinkSync(outputPath);
          this.downloadVideo(response.headers.location, outputPath).then(resolve).catch(reject);
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          const stats = fs.statSync(outputPath);
          console.log(`✅ [Flow] Vídeo baixado: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
          resolve();
        });
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        reject(new Error(`Erro ao baixar vídeo: ${err.message}`));
      });
    });
  }

  /**
   * Captura vídeo de blob URL via página do navegador
   * Nota: Este é o único evaluate necessário (precisa rodar fetch no browser)
   */
  private async downloadBlobVideo(outputPath: string): Promise<void> {
    if (!this.page) throw new Error('Página não disponível');

    try {
      const base64Data = await this.page.evaluate(`
        (async function() {
          var videoEl = document.querySelector('video[src^="blob:"]');
          if (!videoEl || !videoEl.src) return null;
          try {
            var response = await fetch(videoEl.src);
            var blob = await response.blob();
            return new Promise(function(resolve) {
              var reader = new FileReader();
              reader.onloadend = function() {
                resolve(reader.result.split(',')[1]);
              };
              reader.onerror = function() { resolve(null); };
              reader.readAsDataURL(blob);
            });
          } catch(e) { return null; }
        })()
      `);

      if (!base64Data) {
        throw new Error('Não foi possível capturar o blob do vídeo');
      }

      const buffer = Buffer.from(base64Data as string, 'base64');
      fs.writeFileSync(outputPath, buffer);
      console.log(`✅ [Flow] Vídeo (blob) salvo: ${outputPath} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

    } catch (error: any) {
      console.error(`❌ [Flow] Erro ao capturar blob:`, error.message);
      throw error;
    }
  }

  // ========================================
  // MÉTODOS PÚBLICOS - CLEANUP
  // ========================================

  /**
   * Fecha a aba do Flow.
   * Se estiver usando browser compartilhado do Gemini, NÃO fecha o browser inteiro.
   */
  async close(): Promise<void> {
    try {
      if (this.usingSharedBrowser) {
        // Só fecha a aba, não o browser (pertence ao GeminiProvider)
        if (this.page && !this.page.isClosed()) {
          await this.page.close();
          console.log(`🔌 [Flow] Aba fechada (browser compartilhado mantido)`);
        }
        this.page = null;
        this.browser = null;
        this.usingSharedBrowser = false;
      } else {
        // Browser próprio - fecha tudo
        if (this.browser) {
          try {
            if (this.browser.isConnected()) {
              await this.browser.close();
            }
          } catch {}
          this.browser = null;
          this.page = null;
          console.log(`🔌 [Flow] Navegador fechado`);
        }
      }
    } catch (error) {
      console.error(`❌ [Flow] Erro ao fechar:`, error);
      // Garante que o estado é resetado mesmo em caso de erro
      this.browser = null;
      this.page = null;
      this.usingSharedBrowser = false;
    }
  }

  getPage(): Page | null {
    return this.page;
  }

  /**
   * Obtém as URLs dos vídeos que já existem na página.
   * Útil para evitar pegar resultados antigos em vez da geração atual.
   */
  private async getExistingVideoUrls(): Promise<string[]> {
    if (!this.page) return [];
    
    const existingUrls: string[] = [];
    try {
      const videos = await this.page.$$('video[src], video source[src]');
      for (const v of videos) {
        const srcProp = await v.getProperty('src');
        const src = (await srcProp.jsonValue()) as string;
        if (src) existingUrls.push(src);
      }
      
      const downloadLinks = await this.page.$$('a[download], a[href*=".mp4"], a[href*="download"]');
      for (const link of downloadLinks) {
        const hrefProp = await link.getProperty('href');
        const href = (await hrefProp.jsonValue()) as string;
        if (href) existingUrls.push(href);
      }
    } catch (e: any) {
      console.warn('⚠️ [Flow] Erro ao buscar URLs existentes:', e.message);
    }
    
    return existingUrls;
  }

  getBrowser(): Browser | null {
    return this.browser;
  }

  getOutputDir(): string {
    return this.outputDir;
  }

  // ========================================
  // GERAÇÃO DE IMAGENS VIA FLOW
  // ========================================

  /**
   * Define a quantidade de respostas por comando dentro do painel tune.
   * "Respostas por comando" é um combobox com opções 1, 2, 3, 4.
   * Mesmo painel de configurações do aspect ratio (botão 'tune').
   */
  private async setResponseCount(target: number): Promise<void> {
    if (!this.page) return;
    const clampedTarget = Math.max(1, Math.min(4, target));
    if (clampedTarget === 1) {
      console.log(`ℹ️ [Flow/Img] Quantidade já é 1 (padrão), pulando ajuste`);
      return;
    }

    try {
      // 1. Abrir painel tune
      let settingsBtn: import('puppeteer').ElementHandle | null = null;
      const buttons = await this.page.$$('button');
      for (const btn of buttons) {
        const icons = await btn.$$('i');
        for (const icon of icons) {
          if ((await this.getTextContent(icon)).trim() === 'tune' && (await this.isVisible(btn))) {
            settingsBtn = btn;
            break;
          }
        }
        if (settingsBtn) break;
      }

      if (!settingsBtn) {
        console.warn('⚠️ [Flow/Img] Botão tune não encontrado — tentando layout 2 para responseCount...');
        try {
          const opened = await this.openSettingsDropdownMenu();
          if (opened) {
            // No layout 2 a contagem usa tabs com texto 'x1', 'x2', 'x3', 'x4'
            await this.clickMenuTab(`x${clampedTarget}`);
            await this.randomDelay(300, 500);
            await this.closeSettingsDropdownMenu();
          }
        } catch {}
        return;
      }

      await settingsBtn.click();
      await this.randomDelay(800, 1200);
      console.log(`🔧 [Flow/Img] Painel tune aberto → definindo responseCount=${clampedTarget}`);

      // 2. Encontrar o combobox de "Respostas por comando"
      //    Ele contém o texto da label + o número atual (ex: "Respostas por comando1")
      //    O div com pointer-events:none está DENTRO do button[role="combobox"]
      let responseCombo: import('puppeteer').ElementHandle | null = null;

      const comboboxes = await this.page.$$('button[role="combobox"]');
      for (const combo of comboboxes) {
        if (!(await this.isVisible(combo))) continue;
        const comboText = (await this.getTextContent(combo)).toLowerCase();
        console.log(`🔍 [Flow/Img] Combobox no tune: "${comboText}"`);

        if (
          comboText.includes('respostas por comando') ||
          comboText.includes('responses per prompt') ||
          comboText.includes('respostas') ||
          comboText.includes('responses')
        ) {
          responseCombo = combo;
          break;
        }
      }

      if (!responseCombo) {
        console.warn('⚠️ [Flow/Img] Combobox "Respostas por comando" não encontrado no painel');
        await settingsBtn.click().catch(() => {});
        return;
      }

      // 3. Verificar o valor atual (evitar clique desnecessário)
      const comboText = (await this.getTextContent(responseCombo)).trim();
      const currentMatch = comboText.match(/(\d+)\s*$/);
      const currentCount = currentMatch ? parseInt(currentMatch[1], 10) : 1;
      console.log(`🔢 [Flow/Img] Valor atual: ${currentCount}, target: ${clampedTarget}`);

      if (currentCount === clampedTarget) {
        console.log(`✅ [Flow/Img] Quantidade já é ${clampedTarget}`);
        await settingsBtn.click().catch(() => {});
        return;
      }

      // 4. Abrir dropdown do combobox
      await responseCombo.click();
      await this.randomDelay(400, 700);

      // 5. Selecionar a opção com o número alvo
      //    Opções são div[role="option"] com texto "1", "2", "3" ou "4"
      const options = await this.page.$$('div[role="option"]');
      let optionClicked = false;

      for (const opt of options) {
        if (!(await this.isVisible(opt))) continue;
        const optText = (await this.getTextContent(opt)).trim();
        // Texto exato do número: "1", "2", "3" ou "4"
        if (optText === String(clampedTarget)) {
          await opt.click();
          optionClicked = true;
          console.log(`✅ [Flow/Img] Opção "${clampedTarget}" selecionada em Respostas por comando`);
          break;
        }
      }

      if (!optionClicked) {
        console.warn(`⚠️ [Flow/Img] Opção "${clampedTarget}" não encontrada no dropdown`);
        await this.page.keyboard.press('Escape');
      }

      await this.randomDelay(300, 500);

      // 6. Fechar painel tune
      await settingsBtn.click().catch(() => {});
      await this.randomDelay(300, 500);

    } catch (error: any) {
      console.warn(`⚠️ [Flow/Img] Erro em setResponseCount:`, error.message);
      try { await this.page.keyboard.press('Escape'); } catch {}
    }
  }


  /**
   * Garante que o combobox do Flow está no modo "Criar imagens" / "Create images"
   */
  private async ensureCreateImages(): Promise<void> {
    if (!this.page) return;
    try {
      const comboboxes = await this.page.$$('button[role="combobox"]');
      for (const combo of comboboxes) {
        if (!(await this.isVisible(combo))) continue;
        const text = (await this.getTextContent(combo)).toLowerCase();
        console.log(`🔍 [Flow/Img] Combobox encontrado: "${text}"`);

        if (text.includes('criar imagens') || text.includes('create images')) {
          console.log(`✅ [Flow/Img] Modo já é "Criar imagens"`);
          return;
        }

        // Abrir dropdown e selecionar "Criar imagens"
        console.log(`⚠️ [Flow/Img] Modo atual: "${text}", trocando para "Criar imagens"...`);
        await combo.click();
        await this.randomDelay(500, 1000);

        const optionSelectors = ['[role="option"]', '[data-radix-collection-item]', '[role="menuitem"]'];
        let optionClicked = false;
        for (const selector of optionSelectors) {
          const options = await this.page!.$$(selector);
          for (const opt of options) {
            const optText = (await this.getTextContent(opt)).toLowerCase();
            if (optText.includes('criar imagens') || optText.includes('create images')) {
              if (await this.isVisible(opt)) {
                await opt.click();
                optionClicked = true;
                console.log(`✅ [Flow/Img] Opção "Criar imagens" selecionada`);
                break;
              }
            }
          }
          if (optionClicked) break;
        }

        if (!optionClicked) {
          console.warn(`⚠️ [Flow/Img] Opção "Criar imagens" não encontrada, fechando dropdown...`);
          await this.page!.keyboard.press('Escape');
        }

        await this.randomDelay(300, 500);
        return;
      }
      console.log(`ℹ️ [Flow/Img] Nenhum combobox encontrado — tentando layout 2 (menu dropdown)...`);
      // Layout 2: abre o dropdown e clica no tab "Image"
      const opened = await this.openSettingsDropdownMenu();
      if (opened) {
        await this.clickMenuTab(undefined, 'image');
        await this.randomDelay(300, 500);
        await this.closeSettingsDropdownMenu();
      }
    } catch (error: any) {
      console.warn(`⚠️ [Flow/Img] Erro ao trocar modo:`, error.message);
    }
  }

  /**
   * Navega para o tab "Imagens" na página de projeto do Flow
   */
  private async clickImagesTab(): Promise<void> {
    if (!this.page) return;
    try {
      // Grupo de tabs [Vídeos | Imagens] usando role="group" com buttons radio
      const buttons = await this.page.$$('button[role="radio"]');
      for (const btn of buttons) {
        if (!(await this.isVisible(btn))) continue;
        const text = (await this.getTextContent(btn)).trim().toLowerCase();
        // Procura o botão que contenha o ícone "image" ou texto "imagens"/"images"
        const icons = await btn.$$('i');
        for (const icon of icons) {
          const iconText = (await this.getTextContent(icon)).trim();
          if (iconText === 'image') {
            await btn.click();
            console.log(`✅ [Flow/Img] Tab "Imagens" clicado`);
            await this.randomDelay(500, 1000);
            return;
          }
        }
        if (text.includes('imagens') || text.includes('images')) {
          await btn.click();
          console.log(`✅ [Flow/Img] Tab "Imagens" clicado pelo texto`);
          await this.randomDelay(500, 1000);
          return;
        }
      }
      console.warn(`⚠️ [Flow/Img] Tab "Imagens" não encontrado via radio — tentando layout 2...`);
      // Layout 2: no dropdown menu o tab Imagens usa button[role="tab"] com ícone 'image'
      // (o menu já pode estar aberto ou não)
      await this.clickMenuTab(undefined, 'image');
      await this.randomDelay(200, 400);
    } catch (err: any) {
      console.warn(`⚠️ [Flow/Img] Erro ao clicar no tab Imagens:`, err.message);
    }
  }

  /**
   * Coleta as src/href de imagens já presentes na página (para comparar antes/depois)
   */
  private async getExistingImageUrls(): Promise<string[]> {
    if (!this.page) return [];
    const urls: string[] = [];
    try {
      const imgs = await this.page.$$('img[src]');
      for (const img of imgs) {
        const srcProp = await img.getProperty('src');
        const src = (await srcProp.jsonValue()) as string;
        if (src && (src.startsWith('http') || src.startsWith('blob'))) {
          urls.push(src);
        }
      }
    } catch {}
    return urls;
  }

  /**
   * Gera imagens usando o Google Flow no modo "Criar imagens".
   * Retorna até `count` imagens baixadas como arquivos locais.
   */
  async generateImages(
    prompt: string,
    count: number = 1,
    onProgress?: FlowProgressCallback,
    model: string = '🍌 Nano Banana Pro'
  ): Promise<FlowImageResult> {
    const startTime = Date.now();

    const emit = (stage: any, message: string, percent?: number) => {
      console.log(`🖼️ [Flow/Img] ${message}`);
      onProgress?.({ stage, message, percent });
    };

    // Diretório de imagens
    const imgOutputDir = path.join(this.outputDir, 'flow-images');
    if (!fs.existsSync(imgOutputDir)) {
      fs.mkdirSync(imgOutputDir, { recursive: true });
    }

    try {
      // 1. Inicializar navegador
      if (!this.isBrowserAlive()) {
        emit('opening', 'Abrindo navegador...');
        await this.init();
      }
      if (!this.page) throw new Error('Página não disponível');

      // 2. Navegar para o Flow se necessário
      const currentUrl = this.page.url();
      const alreadyInProject = currentUrl.includes('/project/');

      if (!alreadyInProject) {
        emit('navigating', 'Navegando para o Google Flow...');
        await this.page.goto(FlowVideoProvider.FLOW_URL, { waitUntil: 'networkidle2', timeout: 30000 });
        await this.randomDelay(2000, 4000);

        if (this.page.url().includes('accounts.google.com')) {
          throw new Error('Usuário não está logado. Faça login pelo GeminiProvider primeiro.');
        }

        emit('navigating', 'Abrindo novo projeto...');
        const opened = await this.clickNewProject();
        if (!opened) throw new Error('Não foi possível abrir um novo projeto no Flow.');
      }

      // 3. Selecionar modelo
      emit('submitting', `Selecionando modelo "${model}"...`, 4);
      await this.setFlowModel(model, 'image');
      await this.randomDelay(300, 500);

      // 3b. Definir quantidade de respostas
      if (count > 1) {
        emit('submitting', `Definindo ${count} imagens por geração...`, 8);
        await this.setResponseCount(count);
        await this.randomDelay(500, 800);
      }

      // 5. Capturar imagens existentes (para detectar as novas)
      const knownImageUrls = await this.getExistingImageUrls();
      emit('submitting', `${knownImageUrls.length} imagens anteriores detectadas`, 15);

      // 6. Submeter prompt
      emit('submitting', 'Digitando prompt...', 20);
      const submitted = await this.submitPrompt(prompt);
      if (!submitted) throw new Error('Não foi possível localizar o campo de prompt no Flow.');
      emit('generating', 'Prompt enviado! Aguardando geração...', 25);

      // 7. Aguardar novas imagens aparecerem no DOM
      const timeoutMs = this.config.generationTimeoutMs!;
      const pollInterval = 2000;
      let elapsed = 0;
      let newImageUrls: string[] = [];

      while (elapsed < timeoutMs) {
        await new Promise(r => setTimeout(r, pollInterval));
        elapsed += pollInterval;

        // Ler progresso real do DOM
        // Layout 2: div com texto '8%' é irmão do <i>image</i> ou <i>videocam</i>
        // Layout 1: div isolado com texto '36%'
        let realPercent = 0;
        try {
          const allDivs = await this.page!.$$('div');
          for (const div of allDivs) {
            const text = (await this.getTextContent(div)).trim();
            const match = text.match(/^(\d{1,3})%$/);
            if (match) {
              const val = parseInt(match[1], 10);
              if (val > realPercent) realPercent = val;
            }
          }
        } catch {}

        if (realPercent > 0) {
          // Mapeia 0-100% do Flow para 25-85% da nossa barra de progresso
          const mappedPercent = Math.min(85, 25 + Math.round(realPercent * 0.6));
          emit('generating', `Gerando imagens... ${realPercent}%`, mappedPercent);
        } else {
          // Fallback: estimativa por tempo decorrido
          const percent = Math.min(85, 25 + Math.round((elapsed / timeoutMs) * 60));
          emit('generating', `Gerando imagens... (${Math.round(elapsed / 1000)}s)`, percent);
        }

        try {
          const allImgs = await this.page!.$$('img[src]');
          const newUrls: string[] = [];
          for (const img of allImgs) {
            const srcProp = await img.getProperty('src');
            const src = (await srcProp.jsonValue()) as string;
            // Filtra: URL HTTP que não era conhecida antes, que parece ser imagem gerada
            if (
              src &&
              !knownImageUrls.includes(src) &&
              (src.includes('googleusercontent') || src.includes('storage.googleapis') ||
               src.includes('usercontent') || src.includes('blob:') ||
               /\.(jpg|jpeg|png|webp)/i.test(src))
            ) {
              if (!newUrls.includes(src)) newUrls.push(src);
            }
          }

          if (newUrls.length > 0) {
            console.log(`✅ [Flow/Img] ${newUrls.length} nova(s) imagem(ns) detectada(s)!`);
            newImageUrls = newUrls.slice(0, Math.max(count, 4)); // até max 4
            break;
          }

          // Verificar erros por toast (ícone 'error')
          const toasts = await this.page!.$$('li[data-sonner-toast]');
          for (const toast of toasts) {
            const icons = await toast.$$('i');
            for (const icon of icons) {
              if ((await this.getTextContent(icon)).trim() === 'error') {
                const msg = await this.getTextContent(toast);
                throw new Error(`Flow reportou erro: ${msg.substring(0, 200)}`);
              }
            }
          }

          // Verificar card de falha (ícone 'warning' + "Falha" / "Algo deu errado")
          // Estrutura: <i>warning</i> + <div>Falha</div> + <div>Algo deu errado.</div>
          const warningIcons = await this.page!.$$('i');
          for (const icon of warningIcons) {
            if ((await this.getTextContent(icon)).trim() !== 'warning') continue;
            if (!(await this.isVisible(icon))) continue;
            // Ler o texto do container pai para pegar a mensagem de erro
            const parentProp = await this.page!.evaluateHandle(
              (el: Element) => el.closest('[class*="f112b7ef"]') || el.parentElement?.parentElement || el.parentElement,
              icon
            );
            const parentText = parentProp
              ? (await this.getTextContent(parentProp as any)).trim()
              : '';
            console.error(`❌ [Flow/Img] Card de falha detectado: "${parentText.substring(0, 100)}"`);
            throw new Error(`Flow retornou falha: ${parentText.substring(0, 150) || 'Algo deu errado.'}`);
          }
        } catch (err: any) {
          if (err.message.includes('Flow reportou erro') || err.message.includes('Flow retornou falha')) throw err;
          console.warn(`⚠️ [Flow/Img] Erro ao verificar imagens:`, err.message);
        }
      }

      if (newImageUrls.length === 0) {
        throw new Error('Timeout: nenhuma imagem foi gerada no tempo limite.');
      }

      // 8. Baixar imagens para disco
      emit('downloading', `Baixando ${newImageUrls.length} imagem(ns)...`, 90);
      const localPaths: string[] = [];

      for (let i = 0; i < newImageUrls.length; i++) {
        const imgUrl = newImageUrls[i];
        const ext = imgUrl.includes('.png') ? '.png' : imgUrl.includes('.webp') ? '.webp' : '.jpg';
        const filename = `flow-image-${Date.now()}-${i + 1}${ext}`;
        const outputPath = path.join(imgOutputDir, filename);

        try {
          if (imgUrl.startsWith('blob:')) {
            // Baixar blob via página
            const base64 = await this.page!.evaluate(`
              (async function() {
                var imgs = document.querySelectorAll('img[src^="blob:"]');
                var img = imgs[${i}];
                if (!img) return null;
                try {
                  var res = await fetch(img.src);
                  var blob = await res.blob();
                  return new Promise(function(resolve) {
                    var reader = new FileReader();
                    reader.onloadend = function() { resolve(reader.result.split(',')[1]); };
                    reader.readAsDataURL(blob);
                  });
                } catch(e) { return null; }
              })()
            `) as string | null;
            if (base64) {
              fs.writeFileSync(outputPath, Buffer.from(base64, 'base64'));
              localPaths.push(outputPath);
            }
          } else {
            // Download HTTP
            await new Promise<void>((resolve, reject) => {
              const protocol = imgUrl.startsWith('https') ? https : http;
              const file = fs.createWriteStream(outputPath);
              protocol.get(imgUrl, (res) => {
                if (res.statusCode && res.statusCode >= 400) {
                  reject(new Error(`HTTP ${res.statusCode} ao baixar imagem`));
                  return;
                }
                res.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
              }).on('error', reject);
            });
            const stats = fs.statSync(outputPath);
            if (stats.size > 1000) { // arquivo válido (> 1 KB)
              localPaths.push(outputPath);
              console.log(`✅ [Flow/Img] Imagem ${i + 1} baixada: ${outputPath} (${Math.round(stats.size / 1024)} KB)`);
            }
          }
        } catch (dlErr: any) {
          console.warn(`⚠️ [Flow/Img] Erro ao baixar imagem ${i + 1}:`, dlErr.message);
        }
      }

      if (localPaths.length === 0) {
        throw new Error('Imagens detectadas mas não foi possível baixá-las.');
      }

      const durationMs = Date.now() - startTime;
      emit('complete', `${localPaths.length} imagem(ns) gerada(s) com sucesso!`, 100);

      return { success: true, imagePaths: localPaths, durationMs };

    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      emit('error', `Erro: ${error.message}`);
      console.error(`❌ [Flow/Img] Erro na geração:`, error);
      return { success: false, error: error.message, durationMs };
    }
  }
}

// ========================================
// FACTORY & SINGLETON
// ========================================

let flowProviderInstance: FlowVideoProvider | null = null;

/**
 * Cria ou retorna instância do FlowVideoProvider.
 * Usa automaticamente os cookies do provider Gemini logado via ProviderManager.
 */
export function getFlowVideoProvider(options?: Partial<FlowVideoConfig>): FlowVideoProvider {
  if (!flowProviderInstance) {
    flowProviderInstance = new FlowVideoProvider(options);
  }
  return flowProviderInstance;
}

export async function destroyFlowVideoProvider(): Promise<void> {
  if (flowProviderInstance) {
    await flowProviderInstance.close();
    flowProviderInstance = null;
  }
}
