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
    aspectRatio?: string
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

      // 4. Garantir que o modo "Texto para vídeo" está selecionado
      emitProgress('submitting', 'Verificando modo de geração...');
      await this.ensureTextToVideo();
      await this.randomDelay(500, 1000);

      // 4b. Definir aspect ratio
      if (aspectRatio) {
        emitProgress('submitting', `Definindo proporção ${aspectRatio}...`);
        await this.ensureAspectRatio(aspectRatio);
        await this.randomDelay(300, 500);
      }

      // 5. Procurar e submeter o prompt
      emitProgress('submitting', 'Localizando campo de prompt...');
      await this.randomDelay(1000, 2000);

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

  /**
   * Seleciona o aspect ratio no Flow (portrait 9:16 ou landscape 16:9)
   * O dropdown de proporção fica dentro do painel de Configurações (ícone tune).
   */
  private async ensureAspectRatio(aspectRatio: string): Promise<void> {
    if (!this.page) return;

    const isPortrait = aspectRatio === '9:16' || aspectRatio === '4:5' || aspectRatio === '3:4';
    const targetIcon = isPortrait ? 'crop_portrait' : 'crop_landscape';
    const targetLabel = isPortrait ? 'Retrato (9:16)' : 'Paisagem (16:9)';

    try {
      // 1. Abrir painel de Configurações clicando no botão com ícone "tune"
      let settingsBtn: import('puppeteer').ElementHandle | null = null;
      const buttons = await this.page.$$('button');
      for (const btn of buttons) {
        const icons = await btn.$$('i');
        for (const icon of icons) {
          const iconText = (await this.getTextContent(icon)).trim();
          if (iconText === 'tune') {
            if (await this.isVisible(btn)) {
              settingsBtn = btn;
              break;
            }
          }
        }
        if (settingsBtn) break;
      }

      if (!settingsBtn) {
        console.warn('⚠️ [Flow] Botão de Configurações (tune) não encontrado');
        return;
      }

      console.log('🔧 [Flow] Abrindo painel de Configurações...');
      await settingsBtn.click();
      await this.randomDelay(800, 1200);

      // 2. Dentro do painel, procurar o combobox de Proporção
      //    Ele contém um ícone crop_landscape ou crop_portrait e texto "Proporção"
      const comboboxes = await this.page.$$('button[role="combobox"]');
      let ratioCombo: import('puppeteer').ElementHandle | null = null;
      let currentIcon = '';

      for (const combo of comboboxes) {
        if (!(await this.isVisible(combo))) continue;

        const comboText = (await this.getTextContent(combo)).toLowerCase();
        // Verificar se contém "proporção" / "aspect" OU ícone crop_*
        if (comboText.includes('proporção') || comboText.includes('aspect') || comboText.includes('ratio')) {
          ratioCombo = combo;
          // Descobrir qual ícone está ativo
          const icons = await combo.$$('i');
          for (const icon of icons) {
            const iconText = (await this.getTextContent(icon)).trim();
            if (iconText === 'crop_portrait' || iconText === 'crop_landscape') {
              currentIcon = iconText;
              break;
            }
          }
          break;
        }

        // Fallback: buscar pelo ícone crop_*
        const icons = await combo.$$('i');
        for (const icon of icons) {
          const iconText = (await this.getTextContent(icon)).trim();
          if (iconText === 'crop_portrait' || iconText === 'crop_landscape') {
            ratioCombo = combo;
            currentIcon = iconText;
            break;
          }
        }
        if (ratioCombo) break;
      }

      if (!ratioCombo) {
        console.warn('⚠️ [Flow] Combobox de Proporção não encontrado no painel');
        // Fechar configurações
        await settingsBtn.click().catch(() => {});
        return;
      }

      // Já está correto?
      if (currentIcon === targetIcon) {
        console.log(`✅ [Flow] Aspect ratio já é ${targetLabel}`);
        // Fechar configurações
        await settingsBtn.click().catch(() => {});
        return;
      }

      // 3. Abrir dropdown e selecionar a opção correta
      console.log(`⚠️ [Flow] Proporção atual: ${currentIcon || 'desconhecida'}, trocando para ${targetLabel}...`);
      await ratioCombo.click();
      await this.randomDelay(500, 800);

      const options = await this.page.$$('div[role="option"]');
      let optionClicked = false;

      for (const opt of options) {
        const optIcons = await opt.$$('i');
        for (const optIcon of optIcons) {
          const optIconText = (await this.getTextContent(optIcon)).trim();
          if (optIconText === targetIcon) {
            if (await this.isVisible(opt)) {
              await opt.click();
              optionClicked = true;
              console.log(`✅ [Flow] Proporção definida para ${targetLabel}`);
              break;
            }
          }
        }
        if (optionClicked) break;
      }

      if (!optionClicked) {
        console.warn(`⚠️ [Flow] Opção ${targetLabel} não encontrada no menu`);
        await this.page.keyboard.press('Escape');
      }

      await this.randomDelay(300, 500);

      // 4. Fechar painel de Configurações
      await settingsBtn.click().catch(() => {});
      await this.randomDelay(300, 500);

    } catch (error: any) {
      console.warn(`⚠️ [Flow] Erro ao definir aspect ratio:`, error.message);
    }
  }

  /**
   * Garante que o combobox do Flow está no modo "Texto para vídeo" / "Text to video"
   */
  private async ensureTextToVideo(): Promise<void> {
    if (!this.page) return;

    try {
      // Procurar o combobox (role="combobox")
      const comboboxes = await this.page.$$('button[role="combobox"]');

      for (const combo of comboboxes) {
        if (!(await this.isVisible(combo))) continue;

        const text = (await this.getTextContent(combo)).toLowerCase();
        console.log(`🔍 [Flow] Combobox encontrado: "${text}"`);

        // Já está no modo correto
        if (text.includes('texto para vídeo') || text.includes('text to video')) {
          console.log(`✅ [Flow] Modo já é "Texto para vídeo"`);
          return;
        }

        // Precisa trocar — clicar para abrir o dropdown
        console.log(`⚠️ [Flow] Modo atual: "${text}", trocando para "Texto para vídeo"...`);
        await combo.click();
        await this.randomDelay(500, 1000);

        // Procurar a opção "Texto para vídeo" no menu aberto
        // O Radix UI usa div[role="option"] ou div[data-radix-collection-item]
        const optionSelectors = [
          '[role="option"]',
          '[role="listbox"] [role="option"]',
          '[data-radix-collection-item]',
          '[role="menuitem"]',
          '[role="menuitemradio"]',
        ];

        let optionClicked = false;

        for (const selector of optionSelectors) {
          const options = await this.page.$$(selector);
          for (const opt of options) {
            const optText = (await this.getTextContent(opt)).toLowerCase();
            if (optText.includes('texto para vídeo') || optText.includes('text to video')) {
              if (await this.isVisible(opt)) {
                await opt.click();
                optionClicked = true;
                console.log(`✅ [Flow] Opção "Texto para vídeo" selecionada`);
                break;
              }
            }
          }
          if (optionClicked) break;
        }

        if (!optionClicked) {
          console.warn(`⚠️ [Flow] Opção "Texto para vídeo" não encontrada no menu, tentando fechar...`);
          // Pressionar Escape para fechar o dropdown
          await this.page.keyboard.press('Escape');
        }

        await this.randomDelay(300, 500);
        return;
      }

      console.log(`ℹ️ [Flow] Nenhum combobox de modo encontrado (pode já estar no modo correto)`);
    } catch (error: any) {
      console.warn(`⚠️ [Flow] Erro ao verificar modo:`, error.message);
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

      console.log(`✅ [Flow] Botão clicado, aguardando 5 segundos...`);
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Verificar se está na rota /project/
      const newUrl = this.page.url();
      if (newUrl.includes('/project/')) {
        console.log(`✅ [Flow] Navegou para página de projeto: ${newUrl}`);
        return true;
      }

      // Retry após mais 3 segundos
      console.warn(`⚠️ [Flow] URL atual não contém /project/: ${newUrl}`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const retryUrl = this.page.url();
      if (retryUrl.includes('/project/')) {
        console.log(`✅ [Flow] Navegou para projeto (após retry): ${retryUrl}`);
        return true;
      }

      console.error(`❌ [Flow] URL não contém /project/: ${retryUrl}`);
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
          if (src && (src.includes('.mp4') || src.includes('blob:') || src.includes('video') || src.includes('googleusercontent') || src.includes('storage.googleapis'))) {
            console.log(`✅ [Flow] Vídeo encontrado! URL: ${src.substring(0, 100)}`);
            return src;
          }
        }

        // 2. Procurar link de download
        const downloadLinks = await this.page.$$('a[download], a[href*=".mp4"], a[href*="download"]');
        for (const link of downloadLinks) {
          const hrefProp = await link.getProperty('href');
          const href = (await hrefProp.jsonValue()) as string;
          if (href) {
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
        if (err.message.includes('Flow reportou erro') || err.message.includes('Rate limit')) {
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

  getBrowser(): Browser | null {
    return this.browser;
  }

  getOutputDir(): string {
    return this.outputDir;
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
