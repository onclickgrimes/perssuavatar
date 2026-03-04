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
   * Injeta JavaScript de stealth na página para evitar deteção pelo reCAPTCHA Enterprise do Google.
   * Deve ser chamado logo após criar uma nova página, ANTES de navegar.
   */
  private async injectPageStealth(page: import('puppeteer').Page): Promise<void> {
    // 1. User-Agent do Chrome 131 real no Windows 10
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    // 2. Viewport realistéco
    await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });

    // 3. HTTP Headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    });

    // 4. Stealth JavaScript injetado antes de qualquer script da página
    await page.evaluateOnNewDocument(() => {
      // -- navigator.webdriver --
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      // -- chrome runtime (páginas Google esperam isso) --
      // @ts-ignore
      if (!window.chrome) window.chrome = {};
      // @ts-ignore
      if (!window.chrome.runtime) window.chrome.runtime = {
        connect: () => { },
        sendMessage: () => { },
        PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
      };

      // -- Plugins (Chrome real tem vários plugins) --
      const fakePlugin = (name: string, filename: string, mimeTypes: string[]) => ({
        name, filename,
        description: name,
        length: mimeTypes.length,
        item: (i: number) => ({ type: mimeTypes[i] }),
        namedItem: (n: string) => ({ type: n }),
        [Symbol.iterator]: function* () { for (const m of mimeTypes) yield { type: m }; },
      });
      const fakeMimeTypes: any = [
        { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: { name: 'PDF Viewer' } },
      ];

      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const arr = [
            fakePlugin('PDF Viewer', 'internal-pdf-viewer', ['application/pdf', 'text/pdf']),
            fakePlugin('Chrome PDF Viewer', 'internal-pdf-viewer', ['application/pdf', 'text/pdf']),
            fakePlugin('Chromium PDF Viewer', 'internal-pdf-viewer', ['application/pdf', 'text/pdf']),
            fakePlugin('Microsoft Edge PDF Viewer', 'internal-pdf-viewer', ['application/pdf', 'text/pdf']),
            fakePlugin('WebKit built-in PDF', 'internal-pdf-viewer', ['application/pdf', 'text/pdf']),
          ] as any;
          arr.length = 5;
          arr.item = (i: number) => arr[i];
          arr.namedItem = (name: string) => arr.find((p: any) => p.name === name);
          arr.refresh = () => { };
          return arr;
        },
      });

      Object.defineProperty(navigator, 'mimeTypes', { get: () => fakeMimeTypes });

      // -- Languages --
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'language', { get: () => 'en-US' });

      // -- deviceMemory / hardwareConcurrency --
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });

      // -- outerWidth / outerHeight (deve bater com o viewport) --
      Object.defineProperty(window, 'outerWidth', { get: () => 1366 });
      Object.defineProperty(window, 'outerHeight', { get: () => 768 });

      // -- Permissions API (reCAPTCHA pergunta sobre 'notifications') --
      const origQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
      window.navigator.permissions.query = (params: PermissionDescriptor) =>
        params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission, onchange: null } as PermissionStatus)
          : origQuery(params);

      // -- Remover traços de CDP / automation --
      // @ts-ignore
      delete window.__nightmare;
      // @ts-ignore
      delete window._phantom;
      // @ts-ignore
      delete window.callPhantom;
      // @ts-ignore
      delete window.__selenium_evaluate;
      // @ts-ignore
      delete window.__webdriver_evaluate;
      // @ts-ignore
      delete window.__driver_evaluate;
      // @ts-ignore
      delete window.__webdriver_script_func;
      // @ts-ignore
      delete window.__webdriver_script_fn;
      // @ts-ignore
      delete window.__fxdriver_evaluate;
      // @ts-ignore
      delete document.$cdc_asdjflasutopfhvcZLmcfl_;

      // -- Screen --
      Object.defineProperty(screen, 'width', { get: () => 1366 });
      Object.defineProperty(screen, 'height', { get: () => 768 });
      Object.defineProperty(screen, 'availWidth', { get: () => 1366 });
      Object.defineProperty(screen, 'availHeight', { get: () => 728 });
      Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
      Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
    });
  }

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
          await this.injectPageStealth(this.page);
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
          // '--no-sandbox',
          // '--disable-setuid-sandbox',
          // '--disable-gpu',
          '--window-size=1366,768',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--lang=en-US',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-site-isolation-trials',
          '--disable-infobars',
        ],
        ignoreDefaultArgs: ['--enable-automation'],
        defaultViewport: null, // deixar o window-size controlar
      };

      if (chromePath) {
        launchOptions.executablePath = chromePath;
      }

      this.browser = await puppeteerExtra.launch(launchOptions);
      this.usingSharedBrowser = false;

      const pages = await this.browser.pages();
      this.page = pages[0] || await this.browser.newPage();

      await this.injectPageStealth(this.page);

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
  /**
   * Abre o menu "settings_2" (configurações da grade de blocos) e garante:
   * - View Mode: Batch
   * - Tamanho da grade: S
   * - Som ao passar o cursor: Desativado
   * - Mostrar detalhes do bloco: Desativado
   * - Limpar comando ao enviar: Desativado
   *
   * Deve ser chamado após a abertura do projeto e ANTES de configureFlowDropdown.
   */
  private async configureProjectDisplaySettings(): Promise<void> {
    if (!this.page) return;
    if (!this.page.url().includes('/project/')) return;

    try {
      // 1. Encontrar e clicar no botão settings_2
      let settingsBtn: import('puppeteer').ElementHandle | null = null;
      const buttons = await this.page.$$('button');
      for (const btn of buttons) {
        if (!(await this.isVisible(btn))) continue;
        const icons = await btn.$$('i');
        for (const icon of icons) {
          if ((await this.getTextContent(icon)).trim() === 'settings_2') {
            settingsBtn = btn;
            break;
          }
        }
        if (settingsBtn) break;
      }

      if (!settingsBtn) {
        console.warn('⚠️ [Flow] Botão settings_2 não encontrado');
        return;
      }

      await settingsBtn.click();
      await this.randomDelay(500, 800);

      // 2. Verificar se o menu abriu
      const menu = await this.page.$('[role="menu"]');
      if (!menu) {
        console.warn('⚠️ [Flow] Menu de configurações da grade não abriu');
        return;
      }
      console.log('✅ [Flow] Menu settings_2 aberto');

      // 3. Aplicar todas as configurações de uma vez via page.evaluate (string para evitar transpile do Babel)
      await this.page.evaluate(`(function() {
        function ensureTabByControls(key) {
          var tabs = document.querySelectorAll('button[role="tab"]');
          for (var i = 0; i < tabs.length; i++) {
            var tab = tabs[i];
            var c = tab.getAttribute('aria-controls') || '';
            if (c.toLowerCase().indexOf(key.toLowerCase()) !== -1) {
              if (tab.getAttribute('aria-selected') !== 'true') tab.click();
              break;
            }
          }
        }
        function ensureToggle(icon, label) {
          var divs = document.querySelectorAll('div');
          for (var d = 0; d < divs.length; d++) {
            var di = divs[d].querySelector(':scope > i');
            if (!di || (di.textContent || '').trim() !== icon) continue;
            var tabs = divs[d].querySelectorAll('button[role="tab"]');
            for (var t = 0; t < tabs.length; t++) {
              if (tabs[t].getAttribute('aria-label') === label) {
                if (tabs[t].getAttribute('aria-selected') !== 'true') tabs[t].click();
                break;
              }
            }
            break;
          }
        }
        ensureTabByControls('batch');
        ensureTabByControls('SMALL');
        ensureToggle('volume_up', 'Desativado');
        ensureToggle('visibility', 'Desativado');
        ensureToggle('ink_eraser', 'Desativado');
      })()`);

      await this.randomDelay(300, 500);

      // 4. Fechar o menu
      await this.page.keyboard.press('Escape');
      await this.randomDelay(300, 500);
      console.log('✅ [Flow] Configurações da grade aplicadas');

    } catch (err: any) {
      console.warn('⚠️ [Flow] Erro ao configurar display settings:', err.message);
      try { await this.page.keyboard.press('Escape'); } catch { }
    }
  }

  async generateVideo(
    prompt: string,
    onProgress?: FlowProgressCallback,
    aspectRatio?: string,
    model: string = 'Veo 3.1 - Fast',
    count: number = 1,
    referenceImagePath?: string,
    finalImagePath?: string,
    ingredientImagePaths?: string[]
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

      // 4a. Configurar exibição da grade (View Mode, tamanho, toggles)
      emitProgress('submitting', 'Configurando exibição do projeto...');
      await this.configureProjectDisplaySettings();

      // 4b. Configurar todas as opções de geração em uma única sessão de dropdown
      const hasIngredients = ingredientImagePaths && ingredientImagePaths.length > 0;
      emitProgress('submitting', `Configurando modelo, proporção e quantidade...`);
      await this.configureFlowDropdown({
        mediaType: 'video',
        model,
        aspectRatio,
        count,
        videoMode: hasIngredients ? 'ingredients' : 'frames',
      });
      await this.randomDelay(400, 700);

      // 5. Limpar imagens existentes nos inputs e fazer upload
      emitProgress('submitting', 'Limpando imagens anteriores...');
      await this.clearExistingReferenceImages();
      await this.randomDelay(300, 500);

      if (hasIngredients) {
        // Modo Ingredients: upload de até 3 imagens como ingredientes
        emitProgress('submitting', `Enviando ${ingredientImagePaths!.length} imagem(ns) de ingredientes...`);
        for (let i = 0; i < ingredientImagePaths!.length; i++) {
          const imgPath = ingredientImagePaths![i];
          emitProgress('submitting', `Enviando ingrediente ${i + 1}/${ingredientImagePaths!.length}...`);
          const uploaded = await this.uploadIngredientImage(imgPath);
          if (!uploaded) {
            console.warn(`⚠️ [Flow] Falha ao enviar ingrediente ${i + 1}. Prosseguindo...`);
          }
          await this.randomDelay(300, 600);
        }
      } else {
        // Modo Frames: upload de imagem inicial e/ou final
        if (referenceImagePath) {
          emitProgress('submitting', 'Enviando imagem inicial de referência...');
          const uploaded = await this.uploadImageFrame(referenceImagePath, 'Inicial');
          if (!uploaded) {
            console.warn('⚠️ [Flow] Falha ao enviar a imagem Inicial para animação no Flow. Prosseguindo...');
          }
        }

        // 5.5 Upload do quadro final, se fornecido
        if (finalImagePath) {
          emitProgress('submitting', 'Enviando imagem do quadro final...');
          const uploadedFinal = await this.uploadImageFrame(finalImagePath, 'Final');
          if (!uploadedFinal) {
            console.warn('⚠️ [Flow] Falha ao enviar a imagem Final para animação no Flow. Prosseguindo...');
          }
        }
      }

      // 5.6 Aguardar todas as imagens serem processadas no Flow
      const expectedCount = hasIngredients
        ? ingredientImagePaths!.length
        : (referenceImagePath ? 1 : 0) + (finalImagePath ? 1 : 0);

      if (expectedCount > 0) {
        emitProgress('submitting', `Aguardando processamento de ${expectedCount} imagem(ns)...`);
        const maxWaitMs = 60000;
        const startWait = Date.now();
        let lastCount = 0;

        while (Date.now() - startWait < maxWaitMs) {
          // Contar imagens carregadas (com src válido e opacity 1)
          const loadedCount = await this.page.evaluate(`(function() {
            var imgs = document.querySelectorAll('button[data-card-open] img');
            var count = 0;
            for (var i = 0; i < imgs.length; i++) {
              var src = imgs[i].getAttribute('src') || '';
              var style = window.getComputedStyle(imgs[i]);
              if (src && src.indexOf('media.getMediaUrlRedirect') !== -1 && style.opacity === '1') {
                count++;
              }
            }
            return count;
          })()`) as number;

          if (loadedCount !== lastCount) {
            lastCount = loadedCount;
            console.log(`🔄 [Flow] Imagens processadas: ${loadedCount}/${expectedCount}`);
          }

          if (loadedCount >= expectedCount) {
            const elapsed = Math.round((Date.now() - startWait) / 1000);
            console.log(`✅ [Flow] Todas as ${expectedCount} imagem(ns) carregadas com sucesso! (${elapsed}s)`);
            break;
          }

          await new Promise(r => setTimeout(r, 1000));
        }

        if (lastCount < expectedCount) {
          console.warn(`⚠️ [Flow] Timeout: apenas ${lastCount}/${expectedCount} imagens carregadas após 60s. Prosseguindo...`);
        }
        await this.randomDelay(500, 800);
      }

      console.log('✅ [Flow] Imagens enviadas com sucesso!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
      // Aguarda 100 segundos para o usuário interagir com o Flow para Teste
      await this.randomDelay(100000, 200000);
      
      // 6. Procurar e submeter o prompt
      emitProgress('submitting', 'Localizando campo de prompt...');
      await this.randomDelay(1000, 2000);

      // Coletar as URLs dos vídeos já existentes na página antes de gerar
      const knownVideoUrls = await this.getExistingVideoUrls();
      emitProgress('submitting', `Verificadas ${knownVideoUrls.length} mídias anteriores...`);

      // Capturar tile IDs existentes ANTES de submeter (para detectar apenas tiles novas depois)
      const knownTileIds = await this.page.evaluate(`(function() {
        var els = document.querySelectorAll('[data-tile-id]');
        var ids = [];
        for (var i = 0; i < els.length; i++) {
          var id = els[i].getAttribute('data-tile-id');
          if (id) ids.push(id);
        }
        return ids;
      })()`) as string[];
      console.log(`📋 [Flow] ${knownTileIds.length} tile(s) existente(s) registrada(s) antes do submit`);

      // Tentar encontrar o campo de prompt de diversas formas
      const promptSubmitted = await this.submitPrompt(prompt);

      if (!promptSubmitted) {
        throw new Error('Não foi possível encontrar o campo de prompt no Flow. A interface pode ter mudado.');
      }

      emitProgress('submitting', 'Prompt enviado! Aguardando geração...');

      // Limpa os campos visuais do prompt (imagem de referência Inicial e texto)
      await this.clearPromptPanel();

      // 4. Aguardar geração do vídeo
      emitProgress('generating', 'Gerando vídeo com Veo 3...', 10);

      const videoUrl = await this.waitForVideoGeneration(
        this.config.generationTimeoutMs!,
        knownVideoUrls,
        knownTileIds,
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
      try { await this.page.keyboard.press('Escape'); } catch (_) { }
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
    } catch { }
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
   * Configura TODAS as opções via dropdown numa única sessão:
   * - Tab de mídia (image / video)
   * - Video mode (frames / ingredients) — apenas para vídeo
   * - Aspect ratio (crop_16_9 / crop_9_16) — apenas para vídeo
   * - Quantidade de respostas (x1 / x2 / x3 / x4)
   * - Modelo (ex: 'Veo 2 - Fast', '🍌 Nano Banana Pro')
   *
   * Abre o dropdown UMA VEZ e faz tudo sem fechar entre etapas.
   */
  private async configureFlowDropdown(options: {
    mediaType: 'video' | 'image';
    model: string;
    aspectRatio?: string;
    count: number;
    videoMode?: 'frames' | 'ingredients';
  }): Promise<void> {
    if (!this.page) return;
    const { mediaType, model, aspectRatio, count, videoMode } = options;
    const clampedCount = Math.max(1, Math.min(4, count));

    try {
      // 1. Abrir o dropdown de configurações
      const opened = await this.openSettingsDropdownMenu();
      if (!opened) {
        console.warn('⚠️ [Flow] Não foi possível abrir menu de configurações');
        return;
      }

      // 2. Selecionar tab de mídia (image / video) via aria-controls
      const tabs = await this.page.$$('button[role="tab"]');
      let tabClicked = false;
      for (const tab of tabs) {
        if (!(await this.isVisible(tab))) continue;
        const ariaControlsProp = await tab.getProperty('ariaControls');
        const ariaControls = ((await ariaControlsProp?.jsonValue()) as string || '').toUpperCase();
        const isTarget = mediaType === 'video'
          ? ariaControls.includes('VIDEO')
          : ariaControls.includes('IMAGE');
        if (isTarget) {
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
        // Fallback por ícone
        const tabIcon = mediaType === 'video' ? 'videocam' : 'image';
        await this.clickMenuTab(undefined, tabIcon);
        await this.randomDelay(400, 600);
      }

      // 3. Video Mode: Frames ou Ingredients (só para vídeo)
      if (mediaType === 'video' && videoMode) {
        // Frames = ícone 'crop_free', Ingredients = ícone 'chrome_extension'
        const modeIcon = videoMode === 'ingredients' ? 'chrome_extension' : 'crop_free';
        const clicked = await this.clickMenuTab(undefined, modeIcon);
        if (clicked) {
          console.log(`✅ [Flow] Video mode: ${videoMode} (${modeIcon})`);
        } else {
          // Fallback: tentar por texto
          const modeText = videoMode === 'ingredients' ? 'Ingredients' : 'Frames';
          await this.clickMenuTab(modeText);
        }
        await this.randomDelay(300, 500);
      }

      // 4. Aspect ratio (imagem e vídeo)
      if (aspectRatio) {
        const isPortrait = aspectRatio === '9:16' || aspectRatio === '4:5' || aspectRatio === '3:4';
        const cropIcon = isPortrait ? 'crop_9_16' : 'crop_16_9';
        await this.clickMenuTab(undefined, cropIcon);
        await this.randomDelay(300, 500);
        console.log(`✅ [Flow] Aspect ratio: ${aspectRatio} (${cropIcon})`);
      }

      // 4. Quantidade de respostas (x1 / x2 / x3 / x4)
      await this.clickMenuTab(`x${clampedCount}`);
      await this.randomDelay(300, 500);

      // 5. Selecionar modelo — clica no botão de modelo (arrow_drop_down) para abrir submenu
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
          if (currentModel.includes(model) || currentModel === model) {
            console.log(`✅ [Flow] Modelo já é "${model}"`);
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

      // 5b. Clicar botão do modelo → abre submenu
      await modelBtn.click();
      await this.randomDelay(500, 800);

      // 5c. Selecionar modelo no submenu
      const optionSelectors = ['[role="menuitem"]', '[role="menuitemradio"]', '[role="option"]'];
      let modelSelected = false;
      for (const selector of optionSelectors) {
        const optionEls = await this.page.$$(selector);
        for (const opt of optionEls) {
          if (!(await this.isVisible(opt))) continue;
          const optText = (await this.getTextContent(opt)).trim();
          if (optText.includes(model) || optText === model) {
            await opt.click();
            modelSelected = true;
            console.log(`✅ [Flow] Modelo selecionado: "${model}"`);
            break;
          }
        }
        if (modelSelected) break;
      }

      if (!modelSelected) {
        console.warn(`⚠️ [Flow] Modelo "${model}" não encontrado no submenu`);
      }

      await this.randomDelay(300, 500);
      // Garantir que todos os menus estão fechados
      await this.page.keyboard.press('Escape').catch(() => { });
      await this.randomDelay(200, 300);
      await this.page.keyboard.press('Escape').catch(() => { });

    } catch (err: any) {
      console.warn('⚠️ [Flow] Erro em configureFlowDropdown:', err.message);
      try { await this.page.keyboard.press('Escape'); } catch { }
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
      await this.page.keyboard.press('Escape').catch(() => { });

    } catch (err: any) {
      console.warn('⚠️ [Flow] Erro ao definir modelo:', err.message);
      try { await this.page.keyboard.press('Escape'); } catch { }
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
        } catch { }
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
          } catch { }

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
      } catch { }
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
        } catch { }
        return false;
      }

      console.log(`✅ [Flow] Campo de prompt encontrado: ${usedSelector}`);

      // Colocar prompt no clipboard e colar via Ctrl+V (mais rápido que keyboard.type)
      const { clipboard } = require('electron');
      clipboard.writeText(prompt);

      await inputElement.click();
      await this.randomDelay(300, 500);
      // Selecionar tudo e substituir pelo conteúdo do clipboard
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('A');
      await this.page.keyboard.up('Control');
      await this.randomDelay(100, 200);
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('V');
      await this.page.keyboard.up('Control');
      await this.randomDelay(500, 800);

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
   * Limpa o painel de prompt ("Apagar comando") e remove a imagem de referência do "Inicial", se houver.
   */
  private async clearPromptPanel(): Promise<void> {
    if (!this.page) return;
    try {
      console.log(`🧹 [Flow] Limpando quadro Inicial e campo de prompt...`);
      await this.page.evaluate(`(function() {
        var buttons = document.querySelectorAll('button');
        // 1. Procurar e clicar no botão "Apagar comando"
        for (var i = 0; i < buttons.length; i++) {
          var btn = buttons[i];
          var text = (btn.innerText || btn.textContent || '').toLowerCase();
          if (text.indexOf('apagar comando') !== -1 || text.indexOf('clear command') !== -1) {
            btn.click();
            return;
          }
          // Procurar children spans
          var spans = btn.querySelectorAll('span');
          for (var j = 0; j < spans.length; j++) {
             var spText = (spans[j].innerText || spans[j].textContent || '').toLowerCase();
             if (spText.indexOf('apagar comando') !== -1 || spText.indexOf('clear command') !== -1) {
                btn.click();
                return;
             }
          }
        }

        // 2. Fallback: fecha imagem manualmente (click no X/cancel) e limpa textarea
        var imgs = document.querySelectorAll('img[src*="/fx/api/trpc/media"]');
        if (imgs.length > 0) {
          for (var i=0; i<imgs.length; i++) {
             var img = imgs[i];
             var parent = img.parentElement;
             while(parent && parent.tagName !== 'BUTTON' && parent.tagName !== 'DIV') {
                if (parent.tagName === 'BODY') break;
                parent = parent.parentElement;
             }
             if (parent && parent.tagName === 'BUTTON') {
                if(parent.innerHTML.indexOf('cancel') !== -1 || parent.innerHTML.indexOf('close') !== -1) {
                   parent.click();
                }
             }
          }
        }
        
        var textareas = document.querySelectorAll('textarea, div[contenteditable="true"]');
        for (var i=0; i<textareas.length; i++) {
           var ta = textareas[i];
           var ariaVal = ta.getAttribute('aria-label') || '';
           if (ariaVal.toLowerCase().indexOf('prompt') !== -1 || ariaVal.toLowerCase().indexOf('describe') !== -1 || ta.tagName === 'DIV') {
              if (ta.tagName === 'DIV' && ta.getAttribute('role') === 'textbox') {
                 ta.innerHTML = '<p><br></p>';
              } else {
                 ta.value = '';
              }
           }
        }
      })()`);
      console.log(`✅ [Flow] Limpeza do prompt submetida com sucesso.`);
      // Dar um fôlego para a UI renderizar a remoção
      await this.randomDelay(400, 800);
    } catch (e) {
      console.warn(`⚠️ [Flow] Erro ao tentar limpar o prompt panel:`, e);
    }
  }

  /**
   * Envia uma imagem de referência para ser animada no quadro Inicial ou Final
   */
  private async uploadImageFrame(imagePath: string, targetFrame: 'Inicial' | 'Final' = 'Inicial'): Promise<boolean> {
    if (!this.page) return false;

    try {
      console.log(`🖼️ [Flow] Iniciando processamento de imagem de referência (${targetFrame}): ${imagePath}`);

      // Normalizar caminho (Puppeteer precisa de caminho absoluto no OS e barra normal ou dupla)
      let absPath = imagePath;
      const pathModule = require('path');
      const fs = require('fs');

      if (absPath.startsWith('http://') || absPath.startsWith('https://')) {
        console.log(`🖼️ [Flow] URL detectada, baixando temporariamente para upload...`);
        const tempFilename = `temp_ref_${targetFrame}_${Date.now()}.jpg`;
        const tempPath = pathModule.join(this.outputDir, tempFilename);

        await new Promise((resolve, reject) => {
          const client = absPath.startsWith('https') ? require('https') : require('http');
          const request = client.get(absPath, (response: any) => {
            if (response.statusCode === 200) {
              const fileStream = fs.createWriteStream(tempPath);
              response.pipe(fileStream);
              fileStream.on('finish', () => { fileStream.close(); resolve(true); });
            } else {
              reject(new Error(`Falha no download da referência: Status ${response.statusCode}`));
            }
          }).on('error', (err: any) => reject(err));
        });
        absPath = tempPath;
      } else if (absPath.startsWith('file:///')) {
        absPath = absPath.replace('file:///', '');
      }

      absPath = pathModule.resolve(absPath);
      console.log(`🖼️ [Flow] Caminho absoluto da imagem preparado: ${absPath}`);

      let uploadSuccess = false;

      try {
        console.log(`🔎 [Flow] Buscando botão de upload para o quadro ${targetFrame}...`);

        // 1. Abre a galeria/modal clicando no slot correspondente (Inicial / Final)
        let openedGallery = (await this.page.evaluate(`(function(targetFrame) {
            var container = null;
            var buttons = document.querySelectorAll('button');
            
            // Localiza o bloco pai agrupador procurando pelo botão swap_horiz
            for (var i = 0; i < buttons.length; i++) {
              var btn = buttons[i];
              var icons = btn.querySelectorAll('i');
              for (var k = 0; k < icons.length; k++) {
                if ((icons[k].textContent || '').trim() === 'swap_horiz') {
                  container = btn.parentNode;
                  break;
                }
              }
              if (container) break;
            }

            if (!container) return false;

            // Busca as divs contêiner dos quadros. Geralmente com classe sc-8f31d1ba-0 ou similares.
            var frameDivs = Array.from(container.children).filter(function(el) {
                if (el.tagName !== 'DIV') return false;
                var hasSwap = el.querySelector('i');
                if (hasSwap && hasSwap.textContent.trim() === 'swap_horiz') return false;
                return true;
            });

            var targetDiv = null;
            if (frameDivs.length >= 2) {
              targetDiv = targetFrame === 'Inicial' ? frameDivs[0] : frameDivs[1];
            } else if (frameDivs.length === 1 && targetFrame === 'Inicial') {
               targetDiv = frameDivs[0];
            } else if (frameDivs.length === 1 && targetFrame === 'Final') {
               // Fallback caso a UI ainda mostre só 1 e a gente queira forçar Final (normalmente o flow exige adicionar um por vez ou já exibe o slot vazio adjacente)
               return false;
            }

            if (!targetDiv) return false;

            // Clica no targetDiv (seja ele a box vazia com texto 'Inicial', ou a box preenchida com botão de delete/swap internos)
            // Se tiver botão clicável dentro (ex: a foto com botão cancel ou a própria foto envelopada), clica nela
            var clickable = targetDiv.querySelector('button') || targetDiv;
            clickable.click();
            return true;
        })('${targetFrame}')`)) as boolean;

        if (openedGallery) {
          console.log(`✅ [Flow] Modal de mídia do quadro ${targetFrame} aberto. Aguardando renderizar...`);
          await this.randomDelay(800, 1200);

          const futureFileChooser = this.page.waitForFileChooser({ timeout: 8000 }).catch(() => null);

          // 2. Procura globalmente o botão de "upload" dentro da recém-aberta janela Modal
          let clickedUploadBtn = (await this.page.evaluate(`(function() {
              var uploadBtns = document.querySelectorAll('button');
              // Como estamos iterando em todos, vamos processar de forma invertida para pegar portas modais renderizadas no final do body
              for (var i = uploadBtns.length - 1; i >= 0; i--) {
                 var btn = uploadBtns[i];
                 
                 // Impede clicar em botões escondidos (display: none ou opacidade 0 massiva)
                 var rect = btn.getBoundingClientRect();
                 if (rect.width === 0 || rect.height === 0) continue;

                 var spans = btn.querySelectorAll('span');
                 var hasUploadText = false;
                 for (var j = 0; j < spans.length; j++) {
                    var spanText = (spans[j].textContent || '').toLowerCase().trim();
                    if (spanText === 'faça upload de uma imagem' || spanText.indexOf('upload') !== -1) {
                       hasUploadText = true;
                       break;
                    }
                 }
                 var isIcon = btn.querySelector('i');
                 var hasUploadIcon = isIcon && isIcon.textContent.trim() === 'upload';
                 
                 if (hasUploadText || hasUploadIcon) {
                    btn.click();
                    return true;
                 }
              }
              return false;
           })()`)) as boolean;

          if (clickedUploadBtn) {
            console.log(`✅ [Flow] Botão genérico de upload acionado. Interceptando File Chooser...`);
            const fileChooser = await futureFileChooser;
            if (fileChooser) {
              console.log(`✅ [Flow] File Chooser interceptado com sucesso! Injetando ${absPath}`);
              await fileChooser.accept([absPath]);
              uploadSuccess = true;
              await this.randomDelay(500, 1000); // dá um tempinho extra para fechar o modal solo
            } else {
              console.warn(`⚠️ [Flow] File Chooser não foi detectado após o clique.`);
            }
          } else {
            console.warn(`⚠️ [Flow] Falha ao encontrar o Action Button de upload dentro do modal aberto.`);
            try { await this.page.keyboard.press('Escape'); } catch { } // Força escape para destravar a tela
          }
        } else {
          console.log(`⚠️ [Flow] Falha ao clicar no slot "${targetFrame}" inicial. A UI pode não comportar 2 quadros no momento ou estrutura mudou.`);
        }
      } catch (e) {
        console.warn(`⚠️ [Flow] Erro ao tentar orquestrar clique e upload: ${e}`);
      }

      // Polling inteligente para aguardar o processamento da imagem
      if (uploadSuccess) {
        console.log(`⏳ [Flow] Aguardando processamento da imagem de referência (${targetFrame})...`);
        const maxWaitMs = 60000; // Máximo de 60 segundos
        const startWait = Date.now();
        let isImageReady = false;

        while (Date.now() - startWait < maxWaitMs) {
          isImageReady = (await this.page.evaluate(`(function(targetFrame) {
            var container = null;
            var buttons = document.querySelectorAll('button');
            
            for (var i = 0; i < buttons.length; i++) {
              var btn = buttons[i];
              var icons = btn.querySelectorAll('i');
              for (var k = 0; k < icons.length; k++) {
                // swap_horiz é o indicador central dos dois quadros
                if ((icons[k].textContent || '').trim() === 'swap_horiz') {
                  container = btn.parentNode;
                  break;
                }
              }
              if (container) break;
            }

            if (container) {
              var frameDivs = Array.from(container.children).filter(function(el) {
                 return el.tagName === 'DIV';
              });
              
              var targetDiv = null;
              if (frameDivs.length >= 2) {
                targetDiv = targetFrame === 'Inicial' ? frameDivs[0] : frameDivs[1];
              } else if (frameDivs.length === 1 && targetFrame === 'Inicial') {
                 targetDiv = frameDivs[0];
              }

              if (targetDiv) {
                // Procurar tag de imagem processada (não a desfocada em subida)
                var firstImg = targetDiv.querySelector('img[alt*="mídia"], img[crossorigin="anonymous"]');
                if (firstImg) {
                  // O Google embaça a imagem no loading (opacity 0 ou blur na div pai) e depois opacity 1
                  var style = window.getComputedStyle(firstImg);
                  // Verifica container opacity se existir tbm
                  var parentNode = firstImg.parentNode;
                  var parentOpacity = parentNode ? window.getComputedStyle(parentNode).opacity : '1';
                  
                  var src = firstImg.getAttribute('src');
                  // Blob ou trpc indica que concluiu o preview (opacity 1 total)
                  if (src && (src.indexOf('/fx/api/trpc/media') !== -1 || src.indexOf('blob:') === 0) && style.opacity !== '0' && parentOpacity !== '0') {
                     return true;
                  }
                }
              }
            } else {
               // Fallback final: Pega qqr imagem válida
               var imgs = document.querySelectorAll('img[alt*="mídia"], img[crossorigin="anonymous"]');
               for (var j = 0; j < imgs.length; j++) {
                  var imgFallback = imgs[j];
                  var styleF = window.getComputedStyle(imgFallback);
                  var srcF = imgFallback.getAttribute('src');
                  if (srcF && (srcF.indexOf('/fx/api/trpc/media') !== -1 || srcF.indexOf('blob:') === 0) && styleF.opacity !== '0') {
                    return true;
                  }
               }
            }
            return false;
          })('${targetFrame}')`)) as boolean;

          if (isImageReady) {
            const elapsed = Math.round((Date.now() - startWait) / 1000);
            console.log(`✅ [Flow] Imagem de referência (${targetFrame}) carregada com sucesso! (${elapsed}s)`);
            return true;
          }

          // Uma leve pausa na leitura de UI para não gargalar o puppeteer Evaluate
          await new Promise(r => setTimeout(r, 600));
        }

        console.warn(`⚠️ [Flow] Timeout aguardando o processamento do upload (${targetFrame}) (60s). Prosseguindo mesmo assim...`);
        return false;
      }

      return false;

    } catch (error: any) {
      console.error(`❌ [Flow] Erro ao enviar imagem de referência (${targetFrame}):`, error.message);
      return false;
    }
  }

  /**
   * Remove todas as imagens de referência existentes nos inputs do Flow
   * (tanto Frames Inicial/Final quanto Ingredients).
   * 
   * Cada imagem no Flow possui um botão com ícone "cancel" que a remove.
   * Este método encontra e clica em todos eles iterativamente.
   */
  private async clearExistingReferenceImages(): Promise<number> {
    if (!this.page) return 0;

    let removedCount = 0;
    const maxIterations = 10; // Segurança: máximo de 10 remoções

    try {
      for (let iter = 0; iter < maxIterations; iter++) {
        // Procurar botões com ícone "cancel" nas áreas de referência de imagem
        const cancelButtons = await this.page.$$('button[data-card-open] i');
        let foundCancel = false;

        for (const icon of cancelButtons) {
          if (!(await this.isVisible(icon))) continue;
          const text = (await this.getTextContent(icon)).trim();
          if (text === 'cancel') {
            // Clicar no ícone cancel (ou no botão pai)
            const parentBtn = await icon.evaluateHandle((el: any) => {
              // Subir até o div que contém o cancel overlay, depois clicar no ícone
              return el.closest('button') || el;
            });

            try {
              await (parentBtn as any).click();
              removedCount++;
              foundCancel = true;
              console.log(`🗑️ [Flow] Imagem de referência ${removedCount} removida`);
              await this.randomDelay(400, 600);
              break; // Recomeçar o loop (DOM mudou após remoção)
            } catch (e) {
              // Tentar clicar direto no ícone se o btn falhou
              try {
                await icon.click();
                removedCount++;
                foundCancel = true;
                console.log(`🗑️ [Flow] Imagem de referência ${removedCount} removida (via ícone)`);
                await this.randomDelay(400, 600);
                break;
              } catch (e2) { /* ignore */ }
            }
          }
        }

        if (!foundCancel) break; // Nenhum cancel encontrado, sair
      }

      if (removedCount > 0) {
        console.log(`✅ [Flow] ${removedCount} imagem(ns) de referência anterior(es) removida(s)`);
      } else {
        console.log(`ℹ️ [Flow] Nenhuma imagem de referência anterior para remover`);
      }

    } catch (error: any) {
      console.warn(`⚠️ [Flow] Erro ao limpar imagens de referência:`, error.message);
    }

    return removedCount;
  }

  /**
   * Envia uma imagem como ingrediente para a geração de vídeo no Flow.
   * 
   * Após o configureFlowDropdown já ter selecionado o modo Ingredients,
   * este método clica no botão "add_2" (que aparece na área de ingredients)
   * para abrir o dialog de upload, e injeta a imagem via FileChooser.
   * Suporta até 3 imagens. Disponível apenas no modelo 3.1 - Fast.
   */
  private async uploadIngredientImage(imagePath: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      console.log(`🧪 [Flow] Iniciando upload de ingrediente: ${imagePath}`);

      // Normalizar caminho (download se for URL http)
      let absPath = imagePath;
      const pathModule = require('path');
      const fs = require('fs');

      if (absPath.startsWith('http://') || absPath.startsWith('https://')) {
        console.log(`🧪 [Flow] URL detectada, baixando temporariamente para upload...`);
        const tempFilename = `temp_ingredient_${Date.now()}.jpg`;
        const tempPath = pathModule.join(this.outputDir, tempFilename);

        await new Promise<void>((resolve, reject) => {
          const client = absPath.startsWith('https') ? require('https') : require('http');
          client.get(absPath, (response: any) => {
            if (response.statusCode === 200) {
              const fileStream = fs.createWriteStream(tempPath);
              response.pipe(fileStream);
              fileStream.on('finish', () => { fileStream.close(); resolve(); });
            } else {
              reject(new Error(`Falha no download do ingrediente: Status ${response.statusCode}`));
            }
          }).on('error', (err: any) => reject(err));
        });
        absPath = tempPath;
      } else if (absPath.startsWith('file:///')) {
        absPath = absPath.replace('file:///', '');
      }

      absPath = pathModule.resolve(absPath);
      console.log(`🧪 [Flow] Caminho absoluto do ingrediente: ${absPath}`);

      // 1. Encontrar e clicar no botão com ícone "add_2" (área de ingredients do Flow)
      // Preparar FileChooser ANTES de clicar
      const futureFileChooser = this.page.waitForFileChooser({ timeout: 10000 }).catch(() => null);

      // Buscar botão add_2 via Puppeteer (API nativa, sem page.evaluate com string)
      const allButtons = await this.page.$$('button');
      let clickedAdd = false;
      for (const btn of allButtons) {
        if (!(await this.isVisible(btn))) continue;
        const icons = await btn.$$('i');
        for (const icon of icons) {
          const iconText = (await this.getTextContent(icon)).trim();
          if (iconText === 'add_2') {
            await btn.click();
            clickedAdd = true;
            console.log(`✅ [Flow] Botão add_2 (upload de ingrediente) clicado`);
            break;
          }
        }
        if (clickedAdd) break;
      }

      if (!clickedAdd) {
        console.warn(`⚠️ [Flow] Botão add_2 não encontrado. Tentando aria-haspopup="dialog"...`);
        // Fallback: botao com aria-haspopup="dialog" dentro da area de ingredientes
        const dialogBtns = await this.page.$$('button[aria-haspopup="dialog"]');
        for (const btn of dialogBtns) {
          if (!(await this.isVisible(btn))) continue;
          const icons = await btn.$$('i');
          for (const icon of icons) {
            const iconText = (await this.getTextContent(icon)).trim();
            if (iconText === 'add_2' || iconText === 'add') {
              await btn.click();
              clickedAdd = true;
              console.log(`✅ [Flow] Botão dialog (${iconText}) clicado`);
              break;
            }
          }
          if (clickedAdd) break;
        }
      }

      if (!clickedAdd) {
        console.warn(`⚠️ [Flow] Nenhum botão de upload de ingrediente encontrado.`);
        return false;
      }

      await this.randomDelay(500, 800);

      // 2. O clique no add_2 abre um dialog/popover. Procurar botão de upload dentro dele.
      // Preparar segundo FileChooser caso o dialog tenha um botão de upload separado
      const futureFileChooser2 = this.page.waitForFileChooser({ timeout: 8000 }).catch(() => null);

      // Procurar botão "Faça upload" ou ícone "upload" no dialog
      const uploadBtns = await this.page.$$('button');
      let clickedUpload = false;
      for (let i = uploadBtns.length - 1; i >= 0; i--) {
        const btn = uploadBtns[i];
        if (!(await this.isVisible(btn))) continue;
        const text = (await this.getTextContent(btn)).toLowerCase().trim();
        const icons = await btn.$$('i');
        let hasUploadIcon = false;
        for (const icon of icons) {
          const iText = (await this.getTextContent(icon)).trim();
          if (iText === 'upload' || iText === 'file_upload') {
            hasUploadIcon = true;
            break;
          }
        }
        if (hasUploadIcon || text.includes('upload') || text.includes('fa\u00e7a upload')) {
          await btn.click();
          clickedUpload = true;
          console.log(`✅ [Flow] Botão de upload clicado no dialog`);
          break;
        }
      }

      // 3. Interceptar FileChooser
      let fileChooser = await futureFileChooser;
      if (!fileChooser && clickedUpload) {
        fileChooser = await futureFileChooser2;
      }

      // Se nenhum FileChooser até agora, talvez o add_2 já tenha aberto direto
      if (!fileChooser) {
        console.warn(`⚠️ [Flow] FileChooser não detectado. Tentando clicar add_2 novamente...`);
        // Tentar novamente
        const retry = this.page.waitForFileChooser({ timeout: 5000 }).catch(() => null);
        // Clicar em qualquer input[type=file] visível
        const fileInputs = await this.page.$$('input[type="file"]');
        for (const fi of fileInputs) {
          try {
            await fi.evaluate((el: any) => el.click());
            break;
          } catch (e) { /* ignore */ }
        }
        fileChooser = await retry;
      }

      if (fileChooser) {
        console.log(`✅ [Flow] FileChooser interceptado! Injetando ${absPath}`);
        await fileChooser.accept([absPath]);

        // Aguardar processamento (até 15s)
        await this.randomDelay(2000, 3000);
        console.log(`✅ [Flow] Ingrediente enviado com sucesso!`);
        return true;
      } else {
        console.warn(`⚠️ [Flow] FileChooser não foi detectado após todas as tentativas.`);
        // Fechar qualquer dialog aberto
        try { await this.page.keyboard.press('Escape'); } catch (e) { /* ignore */ }
        return false;
      }

    } catch (error: any) {
      console.error(`❌ [Flow] Erro ao enviar ingrediente:`, error.message);
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
    knownTileIds: string[],
    onPercent?: (percent: number) => void
  ): Promise<string | null> {
    if (!this.page) return null;

    const startTime = Date.now();
    const pollInterval = 3000;
    let lastPercent = 10;

    console.log(`⏳ [Flow] Aguardando geração do vídeo (timeout: ${timeoutMs / 1000}s)...`);

    while (Date.now() - startTime < timeoutMs) {
      try {
        // 1 & 2. Procurar vídeo concluído em tiles NOVAS
        const knownIdsJsonVideo = JSON.stringify(knownTileIds);
        const completedVideoUrl = await this.page.evaluate(`(function() {
          var knownIds = ${knownIdsJsonVideo};
          var allTiles = document.querySelectorAll('[data-tile-id]');
          
          for (var ti = 0; ti < allTiles.length; ti++) {
            var tile = allTiles[ti];
            var tileId = tile.getAttribute('data-tile-id') || '';
            
            var isKnown = false;
            for (var ki = 0; ki < knownIds.length; ki++) {
              if (knownIds[ki] === tileId) { isKnown = true; break; }
            }
            if (isKnown) continue;

            // Verificar se ainda está gerando (tem %)
            var tileText = tile.textContent || '';
            if (tileText.indexOf('%') !== -1) continue;

            // Procurar mídia concluída na tile
            var mediaNodes = tile.querySelectorAll('video, video source, a[download], a[href], img');
            for (var m = 0; m < mediaNodes.length; m++) {
              var el = mediaNodes[m];
              var src = el.getAttribute('src') || el.getAttribute('href') || '';
              
              if (
                src.indexOf('getMediaUrlRedirect') !== -1 || 
                src.indexOf('/fx/api/trpc/media') !== -1 ||
                src.indexOf('.mp4') !== -1 ||
                src.indexOf('blob:') === 0 ||
                src.indexOf('googleusercontent') !== -1 ||
                src.indexOf('storage.googleapis') !== -1
              ) {
                // Se for URL relativa, transforma em absoluta
                if (src.indexOf('/') === 0) src = 'https://labs.google' + src;
                
                // Evitar SVG e placeholders base64
                if (src.indexOf('.svg') === -1 && src.indexOf('data:image') === -1) {
                  return src;
                }
              }
            }
          }
          return null;
        })()`) as string | null;

        if (completedVideoUrl) {
          console.log(`✅ [Flow] Vídeo encontrado na nova tile! URL: ${completedVideoUrl.substring(0, 80)}`);
          return completedVideoUrl;
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

        // 3b. Verificar card de falha SOMENTE se não houver tiles novas com progresso ativo
        const knownIdsJson = JSON.stringify(knownTileIds);
        const tileStatus = await this.page.evaluate(`(function() {
          var knownIds = ${knownIdsJson};
          var allTiles = document.querySelectorAll('[data-tile-id]');
          var hasAnyActive = false;
          var failedText = null;

          for (var ti = 0; ti < allTiles.length; ti++) {
            var tile = allTiles[ti];
            var tileId = tile.getAttribute('data-tile-id') || '';
            var isKnown = false;
            for (var ki = 0; ki < knownIds.length; ki++) {
              if (knownIds[ki] === tileId) { isKnown = true; break; }
            }
            if (isKnown) continue;

            var tileText = tile.textContent || '';
            var icons = tile.querySelectorAll('i');
            var hasWarning = false;
            var hasVideocam = false;
            var hasPct = tileText.indexOf('%') !== -1;

            for (var ii = 0; ii < icons.length; ii++) {
              var it = (icons[ii].textContent || '').trim();
              if (it === 'warning') hasWarning = true;
              if (it === 'videocam' || it === 'image') hasVideocam = true;
            }
            if (hasVideocam && (hasPct || !hasWarning)) { hasAnyActive = true; }
            if (hasWarning && !hasVideocam && !hasPct && failedText === null) {
              failedText = tileText.trim().substring(0, 120);
            }
          }

          if (failedText !== null && !hasAnyActive) { return { failed: true, text: failedText }; }
          return { failed: false, text: null };
        })()`) as { failed: boolean; text: string | null };

        if (tileStatus.failed) {
          console.error(`❌ [Flow] Card de falha detectado na geração de vídeo: "${(tileStatus.text || '').substring(0, 100)}"`);
          throw new Error(`Flow retornou falha: ${tileStatus.text || 'Algo deu errado.'}`);
        }
        if (tileStatus.text !== null) {
          console.warn(`⚠️ [Flow] Warning em tile nova ignorado — geração ativa em outra tile`);
        }

        // 4. Ler progresso real do Flow EXCLUSIVAMENTE dentro das tiles novas
        let realPercent = 0;
        const knownIdsJsonVideoScan = JSON.stringify(knownTileIds);
        const activeTilePercent = await this.page.evaluate(`(function() {
          var knownIds = ${knownIdsJsonVideoScan};
          var allTiles = document.querySelectorAll('[data-tile-id]');
          for (var ti = 0; ti < allTiles.length; ti++) {
            var tile = allTiles[ti];
            var tileId = tile.getAttribute('data-tile-id') || '';
            
            var isKnown = false;
            for (var ki = 0; ki < knownIds.length; ki++) {
              if (knownIds[ki] === tileId) { isKnown = true; break; }
            }
            if (!isKnown) {
               // Nova tile gerando! Procurar % nela.
               var spans = tile.querySelectorAll('div, span');
               for(var s = 0; s < spans.length; s++){
                  var t = (spans[s].innerText || '').trim();
                  var m = t.match(/^(\\d{1,3})%$/);
                  if (m) return parseInt(m[1], 10);
               }
               var fullMatch = (tile.innerText || '').match(/(\\d{1,3})%/);
               if (fullMatch) return parseInt(fullMatch[1], 10);
            }
          }
          return 0;
        })()`) as number;

        if (activeTilePercent > 0) {
          realPercent = activeTilePercent;
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

    // Se for URL do labs.google (getMediaUrlRedirect), precisa dos cookies da sessão
    // para resolver o redirect e pegar a URL assinada pública (GCS)
    let finalUrl = videoUrl;
    if (videoUrl.includes('labs.google') || videoUrl.includes('getMediaUrlRedirect')) {
      if (!this.page) throw new Error('Página não disponível para resolver URL do vídeo');
      console.log(`🔍 [Flow/Video] Resolvendo URL autenticada do vídeo via browser...`);

      const urlJson = JSON.stringify(videoUrl);
      const signedUrl = await this.page.evaluate(`(function() {
        var url = ${urlJson};
        return new Promise(function(resolve) {
          fetch(url, { credentials: 'same-origin', redirect: 'follow' })
            .then(function(res) {
              if (res.url && res.url !== url) { resolve(res.url); return; }
              resolve(null);
            })
            .catch(function(e1) {
              try {
                var xhr = new XMLHttpRequest();
                xhr.withCredentials = true;
                xhr.onload = function() { resolve(xhr.responseURL && xhr.responseURL !== url ? xhr.responseURL : null); };
                xhr.onerror = function() {
                  fetch(url, { redirect: 'follow' })
                    .then(function(res) { resolve(res.url !== url ? res.url : null); })
                    .catch(function() { resolve(null); });
                };
                xhr.open('GET', url, true);
                xhr.send();
              } catch(e2) { resolve(null); }
            });
        });
      })()`) as string | null;

      if (signedUrl && signedUrl !== videoUrl) {
        console.log(`✅ [Flow/Video] URL assinada obtida: ${signedUrl.substring(0, 80)}...`);
        finalUrl = signedUrl;
      } else {
        console.warn(`⚠️ [Flow/Video] Não foi possível resolver URL assinada do vídeo. Tentando acesso direto...`);
      }
    }

    return new Promise((resolve, reject) => {
      const protocol = finalUrl.startsWith('https') ? https : http;
      const file = fs.createWriteStream(outputPath);

      protocol.get(finalUrl, (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          fs.unlinkSync(outputPath);
          this.downloadVideo(response.headers.location, outputPath).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode && response.statusCode >= 400) {
          file.close();
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          reject(new Error(`HTTP ${response.statusCode} - não foi possível baixar o vídeo`));
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
          } catch { }
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
        } catch { }
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
        await settingsBtn.click().catch(() => { });
        return;
      }

      // 3. Verificar o valor atual (evitar clique desnecessário)
      const comboText = (await this.getTextContent(responseCombo)).trim();
      const currentMatch = comboText.match(/(\d+)\s*$/);
      const currentCount = currentMatch ? parseInt(currentMatch[1], 10) : 1;
      console.log(`🔢 [Flow/Img] Valor atual: ${currentCount}, target: ${clampedTarget}`);

      if (currentCount === clampedTarget) {
        console.log(`✅ [Flow/Img] Quantidade já é ${clampedTarget}`);
        await settingsBtn.click().catch(() => { });
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
      await settingsBtn.click().catch(() => { });
      await this.randomDelay(300, 500);

    } catch (error: any) {
      console.warn(`⚠️ [Flow/Img] Erro em setResponseCount:`, error.message);
      try { await this.page.keyboard.press('Escape'); } catch { }
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
    } catch { }
    return urls;
  }

  /**
   * Aguarda um novo arquivo aparecer no diretório (excluindo .crdownload/.tmp)
   */
  private async waitForNewFile(dir: string, knownFiles: Set<string>, timeoutMs = 30000): Promise<string | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, 600));
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (!knownFiles.has(file) && !file.endsWith('.crdownload') && !file.endsWith('.tmp')) {
            return path.join(dir, file);
          }
        }
      } catch { }
    }
    return null;
  }

  /**
   * Clica no botão more_vert de um tile, abre menu, hover em Baixar e clica na qualidade.
   * Usa page.evaluate string para evitar transpile do Babel.
   */
  private async downloadTileByClick(tileId: string): Promise<boolean> {
    if (!this.page) return false;
    try {
      // 1. Hover no tile para revelar botões
      const tileEl = await this.page.$(`[data-tile-id="${tileId}"]`);
      if (!tileEl) { console.warn(`⚠️ [Flow/Img] Tile não encontrado: ${tileId}`); return false; }
      await tileEl.hover();
      await this.randomDelay(600, 900);

      // 2. Encontrar e clicar no botão "Mais" (more_vert) do tile
      // O botão correto tem: <i>more_vert</i> + <span>Mais</span> (visually hidden)
      // Usar evaluate string para evitar transpile do Babel
      const tileIdJson = JSON.stringify(tileId);
      const moreVertClicked = await this.page.evaluate(`(function() {
        // Buscar dentro do tile especificado (ou próximo)
        var tiles = document.querySelectorAll('[data-tile-id]');
        var container = null;
        for (var i = 0; i < tiles.length; i++) {
          if (tiles[i].getAttribute('data-tile-id') === ${tileIdJson}) {
            container = tiles[i];
            break;
          }
        }
        // Buscar o botão com ícone more_vert + span "Mais" no container OU na página
        var searchRoot = container ? container.closest('[class*="sc-5c6add13"]') || container.parentElement || document : document;
        var btns = searchRoot.querySelectorAll('button');
        for (var i = 0; i < btns.length; i++) {
          var btn = btns[i];
          var rect = btn.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          // Verificar ícone more_vert
          var icons = btn.querySelectorAll('i');
          var hasMV = false;
          for (var j = 0; j < icons.length; j++) {
            if ((icons[j].textContent || '').trim() === 'more_vert') { hasMV = true; break; }
          }
          if (!hasMV) continue;
          // Verificar span com texto "Mais" (diferencia do outro more_vert)
          var spans = btn.querySelectorAll('span');
          for (var s = 0; s < spans.length; s++) {
            var spanText = (spans[s].textContent || '').trim();
            if (spanText === 'Mais' || spanText === 'More') {
              btn.click();
              return true;
            }
          }
        }
        return false;
      })()`) as boolean;

      if (!moreVertClicked) {
        console.warn(`⚠️ [Flow/Img] Botão "Mais" (more_vert) não encontrado no tile ${tileId}`);
        return false;
      }
      console.log(`✅ [Flow/Img] Botão "Mais" clicado`);

      // 3. Esperar o menu abrir
      const menu = await this.page.waitForSelector('[role="menu"]', { timeout: 5000 }).catch(() => null);
      if (!menu) { console.warn(`⚠️ [Flow/Img] Menu de contexto não abriu`); return false; }
      await this.randomDelay(400, 600);

      // 4. Clicar em "Baixar" via evaluate string (rótulo do item com ícone download)
      const clickedBaixar = await this.page.evaluate(`(function() {
        var items = document.querySelectorAll('[role="menuitem"]');
        for (var i = 0; i < items.length; i++) {
          var el = items[i];
          var rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          var icons = el.querySelectorAll('i');
          for (var j = 0; j < icons.length; j++) {
            if ((icons[j].textContent || '').trim() === 'download') {
              el.dispatchEvent(new MouseEvent('mouseenter', {bubbles: true}));
              el.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}));
              return true;
            }
          }
        }
        return false;
      })()`) as boolean;

      if (!clickedBaixar) {
        console.warn(`⚠️ [Flow/Img] Item "Baixar" não encontrado no menu`);
        await this.page.keyboard.press('Escape');
        return false;
      }
      console.log(`✅ [Flow/Img] Hover em "Baixar" disparado`);
      await this.randomDelay(700, 1000);

      // 5. Clicar na qualidade: prefer 2K Upscaled, fallback 1K Original
      const clickedQuality = await this.page.evaluate(`(function() {
        // Procura div com texto contendo "2K" + "Upscaled"
        var allDivs = document.querySelectorAll('div');
        for (var i = 0; i < allDivs.length; i++) {
          var el = allDivs[i];
          var rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          var txt = (el.textContent || '').trim();
          if (txt.indexOf('2K') !== -1 && txt.length < 20) {
            el.click();
            return '2K';
          }
        }
        // Fallback: 1K Original
        for (var i = 0; i < allDivs.length; i++) {
          var el = allDivs[i];
          var rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          var txt = (el.textContent || '').trim();
          if (txt.indexOf('1K') !== -1 && txt.length < 20) {
            el.click();
            return '1K';
          }
        }
        // Fallback final: clicar no próprio item Baixar
        var items = document.querySelectorAll('[role="menuitem"]');
        for (var i = 0; i < items.length; i++) {
          var icons = items[i].querySelectorAll('i');
          for (var j = 0; j < icons.length; j++) {
            if ((icons[j].textContent || '').trim() === 'download') {
              items[i].click();
              return 'direct';
            }
          }
        }
        return null;
      })()`) as string | null;

      if (!clickedQuality) {
        console.warn(`⚠️ [Flow/Img] Opção de qualidade não encontrada`);
        await this.page.keyboard.press('Escape');
        return false;
      }
      console.log(`✅ [Flow/Img] Download disparado (${clickedQuality})`);
      await this.randomDelay(300, 500);
      return true;
    } catch (err: any) {
      console.warn(`⚠️ [Flow/Img] Erro em downloadTileByClick:`, err.message);
      try { await this.page.keyboard.press('Escape'); } catch { }
      return false;
    }
  }

  /**
   * Gera imagens usando o Google Flow no modo "Criar imagens".
   * Retorna até `count` imagens baixadas como arquivos locais.
   */
  async generateImages(
    prompt: string,
    count: number = 1,
    onProgress?: FlowProgressCallback,
    model: string = '🍌 Nano Banana Pro',
    aspectRatio?: string
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

      // 3a. Configurar exibição da grade
      emit('submitting', 'Configurando exibição do projeto...', 2);
      await this.configureProjectDisplaySettings();

      // 3b. Configurar modelo e quantidade em uma única sessão de dropdown
      emit('submitting', `Configurando modelo e quantidade...`, 4);
      await this.configureFlowDropdown({
        mediaType: 'image',
        model,
        aspectRatio,
        count,
      });
      await this.randomDelay(400, 600);

      // 5. Capturar tile IDs existentes ANTES de submeter (para identificar tiles novos depois)
      const knownTileIds = await this.page!.evaluate(`(function() {
        var els = document.querySelectorAll('[data-tile-id]');
        var ids = [];
        for (var i = 0; i < els.length; i++) {
          var id = els[i].getAttribute('data-tile-id');
          if (id) ids.push(id);
        }
        return ids;
      })()`) as string[];
      emit('submitting', `${knownTileIds.length} tile(s) anteriores registrados`, 15);

      // 6. Submeter prompt
      emit('submitting', 'Digitando prompt...', 20);
      const submitted = await this.submitPrompt(prompt);
      if (!submitted) throw new Error('Não foi possível localizar o campo de prompt no Flow.');
      emit('generating', 'Prompt enviado! Aguardando geração...', 25);

      // 7. Polling: aguarda tiles com nosso prompt completarem
      const timeoutMs = this.config.generationTimeoutMs!;
      const pollInterval = 2000;
      let elapsed = 0;
      let newImageUrls: string[] = [];
      // Primeiros 120 chars do prompt para match (sem ser sensível a case/whitespace)
      const promptFragment = prompt.substring(0, 120).trim();

      while (elapsed < timeoutMs) {
        await new Promise(r => setTimeout(r, pollInterval));
        elapsed += pollInterval;

        try {
          // Usar string literal para page.evaluate — o Babel não transpila strings em runtime
          const fragment60 = JSON.stringify(promptFragment.substring(0, 60));
          const knownIdsJson = JSON.stringify(knownTileIds);
          const result = await this.page!.evaluate(`(function() {
            var pFrag = ${fragment60};
            var knownIds = ${knownIdsJson};
            var allTiles = document.querySelectorAll('[data-tile-id]');
            var completed = [];
            var maxProgress = 0;
            var matchingTileCount = 0;
            var failedMatchingTile = false;

            for (var ti = 0; ti < allTiles.length; ti++) {
              var tile = allTiles[ti];
              var tileId = tile.getAttribute('data-tile-id') || '';
              var isKnown = false;
              for (var ki = 0; ki < knownIds.length; ki++) {
                if (knownIds[ki] === tileId) { isKnown = true; break; }
              }
              if (isKnown) continue;

              var tileText = tile.textContent || '';
              var tileHasPrompt = tileText.indexOf(pFrag) !== -1;

              // -- Tracking de progresso e falha: somente em tiles que ainda têm o prompt visível (durante geração) --
              if (tileHasPrompt) {
                matchingTileCount++;

                // Ler progresso (XX%)
                var pctIdx = tileText.indexOf('%');
                if (pctIdx > 0) {
                  var pctStr = '';
                  for (var pc = pctIdx - 1; pc >= 0 && pc >= pctIdx - 3; pc--) {
                    var ch = tileText[pc];
                    if (ch >= '0' && ch <= '9') pctStr = ch + pctStr;
                    else break;
                  }
                  if (pctStr.length > 0) {
                    var v = parseInt(pctStr, 10);
                    if (v > maxProgress) maxProgress = v;
                  }
                }

                // Checar falha (warning sem progresso no tile)
                var icons = tile.querySelectorAll('i');
                var hasWarning = false;
                var hasProgressIcon = false;
                for (var ii = 0; ii < icons.length; ii++) {
                  var iconText = (icons[ii].textContent || '').trim();
                  if (iconText === 'warning') hasWarning = true;
                  if (iconText === 'image' || iconText === 'videocam') hasProgressIcon = true;
                }
                if (hasWarning && !hasProgressIcon) { failedMatchingTile = true; }
              }

              // -- Coleta de imagens: em QUALQUER tile nova (prompt sai do tile após conclusão) --
              var imgs = tile.querySelectorAll('img');
              for (var im = 0; im < imgs.length; im++) {
                var s = imgs[im].src;
                if (
                  s && s.indexOf('https://') === 0 && s.indexOf('.svg') === -1 && s.indexOf('data:image') === -1 &&
                  (
                    s.indexOf('googleusercontent') !== -1 || s.indexOf('googleapis') !== -1 ||
                    s.indexOf('usercontent') !== -1    || s.indexOf('getMediaUrlRedirect') !== -1 ||
                    s.indexOf('labs.google') !== -1    ||
                    s.indexOf('.jpg') !== -1 || s.indexOf('.jpeg') !== -1 ||
                    s.indexOf('.png') !== -1 || s.indexOf('.webp') !== -1
                  )
                ) {
                  var dup = false;
                  for (var ci = 0; ci < completed.length; ci++) { if (completed[ci] === s) { dup = true; break; } }
                  if (!dup) completed.push(s);
                }
              }
            }
            return { completed: completed, maxProgress: maxProgress, matchingTileCount: matchingTileCount, failedMatchingTile: failedMatchingTile };
          })()`) as { completed: string[]; maxProgress: number; matchingTileCount: number; failedMatchingTile: boolean };

          // Reportar progresso
          if (result.maxProgress > 0) {
            const mapped = Math.min(85, 25 + Math.round(result.maxProgress * 0.6));
            emit('generating', `Gerando imagens... ${result.maxProgress}%`, mapped);
          } else {
            const pct = Math.min(85, 25 + Math.round((elapsed / timeoutMs) * 60));
            emit('generating', `Gerando imagens... (${Math.round(elapsed / 1000)}s)`, pct);
          }

          // Tiles com nosso prompt concluídos → terminar
          if (result.completed.length > 0) {
            console.log(`✅ [Flow/Img] ${result.completed.length} imagem(ns) concluída(s) por match de prompt`);
            newImageUrls = result.completed.slice(0, Math.max(count, 4));
            break;
          }

          // Se TODOS os tiles do nosso prompt falharam (e nenhum com progresso), lançar erro
          if (result.failedMatchingTile && result.matchingTileCount > 0 && result.maxProgress === 0) {
            throw new Error('Flow retornou falha: todos os tiles com o prompt atual falharam.');
          }

          // Verificar toast de erro
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

        } catch (err: any) {
          if (err.message.includes('Flow reportou erro') || err.message.includes('Flow retornou falha')) throw err;
          console.warn(`⚠️ [Flow/Img] Erro no polling:`, err.message);
        }
      }


      if (newImageUrls.length === 0) {
        throw new Error('Timeout: nenhuma imagem foi gerada no tempo limite.');
      }

      // 8. Baixar imagens via URL assinada do GCS
      // Estratégia: match prompt → batch item → img UUID → seguir redirect → URL assinada GCS → https.get
      emit('downloading', `Localizando imagens geradas...`, 87);

      // 8a. Encontrar batch item que corresponde ao nosso prompt e coletar URLs de redirect
      const promptFrag50 = JSON.stringify(prompt.substring(0, 50));
      const mediaRedirectUrls = await this.page!.evaluate(`(function() {
        var results = [];
        // Buscar todos os batch containers sc-5c6add13-0
        var batches = document.querySelectorAll('.sc-5c6add13-0');
        for (var b = 0; b < batches.length; b++) {
          var batch = batches[b];
          // Verificar se o texto do prompt neste batch corresponde ao nosso
          var promptEl = batch.querySelector('.sc-21e778e8-1');
          if (!promptEl) continue;
          var batchPrompt = (promptEl.textContent || '').trim();
          if (batchPrompt.indexOf(${promptFrag50}) === -1) continue;
          // Coletar img[src] deste batch
          var imgs = batch.querySelectorAll('img[src]');
          for (var i = 0; i < imgs.length; i++) {
            var src = imgs[i].getAttribute('src') || '';
            // Aceitar src relativo ou absoluto com getMediaUrlRedirect
            if (src.indexOf('getMediaUrlRedirect') !== -1 || src.indexOf('/fx/api/trpc/media') !== -1) {
              // Garantir URL absoluta
              var abs = src.indexOf('http') === 0 ? src : 'https://labs.google' + src;
              var dup = false;
              for (var d = 0; d < results.length; d++) { if (results[d] === abs) { dup = true; break; } }
              if (!dup) results.push(abs);
            }
          }
        }
        return results;
      })()`) as string[];

      console.log(`🔍 [Flow/Img] ${mediaRedirectUrls.length} URL(s) de redirect encontrada(s) pelo match de prompt`);

      // Fallback: usar as URLs do polling se o match de prompt não retornou nada
      const urlsToProcess = mediaRedirectUrls.length > 0
        ? mediaRedirectUrls.slice(0, count)
        : newImageUrls.slice(0, count);

      emit('downloading', `Baixando ${urlsToProcess.length} imagem(ns)...`, 90);
      const localPaths: string[] = [];

      for (let i = 0; i < urlsToProcess.length; i++) {
        const redirectUrl = urlsToProcess[i];
        emit('downloading', `Baixando imagem ${i + 1} de ${urlsToProcess.length}...`, 90 + Math.round((i / urlsToProcess.length) * 8));

        try {
          // 8b. Seguir redirect via page.evaluate para obter URL assinada do GCS
          // A URL assinada (storage.googleapis.com) é pública (não precisa de cookies)
          const redirectUrlJson = JSON.stringify(redirectUrl);
          // Tentar obter URL assinada do GCS seguindo o redirect via 3 estratégias
          const signedUrl = await this.page!.evaluate(`(function() {
            var url = ${redirectUrlJson};
            return new Promise(function(resolve) {
              // Estratégia 1: fetch com credentials same-origin
              // (envia cookies para labs.google, omite para GCS cross-origin — resolve CORS)
              fetch(url, { credentials: 'same-origin', redirect: 'follow' })
                .then(function(res) {
                  if (res.url && res.url !== url) { resolve(res.url); return; }
                  resolve(null);
                })
                .catch(function(e1) {
                  // Estratégia 2: XHR — withCredentials=true, responseURL após redirect
                  try {
                    var xhr = new XMLHttpRequest();
                    xhr.withCredentials = true;
                    xhr.onload = function() { resolve(xhr.responseURL && xhr.responseURL !== url ? xhr.responseURL : null); };
                    xhr.onerror = function() {
                      // Estratégia 3: fetch sem credentials
                      fetch(url, { redirect: 'follow' })
                        .then(function(res) { resolve(res.url !== url ? res.url : null); })
                        .catch(function() { resolve(null); });
                    };
                    xhr.open('GET', url, true);
                    xhr.send();
                  } catch(e2) { resolve(null); }
                });
            });
          })()`) as string | null;

          if (!signedUrl || signedUrl === redirectUrl) {
            console.warn(`⚠️ [Flow/Img] Redirect não resolveu URL assinada para imagem ${i + 1}: ${signedUrl}`);
            continue;
          }
          console.log(`✅ [Flow/Img] URL assinada obtida: ${signedUrl.substring(0, 80)}...`);

          // 8c. Download direto da URL assinada com https.get (sem cookies necessário)
          const filename = `flow-image-${Date.now()}-${i + 1}.jpg`;
          const outputPath = path.join(imgOutputDir, filename);

          await new Promise<void>((resolve, reject) => {
            const file = fs.createWriteStream(outputPath);
            const req = https.get(signedUrl, (res) => {
              if (res.statusCode && res.statusCode >= 400) {
                file.close();
                reject(new Error(`HTTP ${res.statusCode} ao baixar imagem`));
                return;
              }
              res.pipe(file);
              file.on('finish', () => {
                file.close();
                resolve();
              });
            });
            req.on('error', (e) => { file.close(); reject(e); });
          });

          const size = fs.statSync(outputPath).size;
          if (size > 500) {
            localPaths.push(outputPath);
            console.log(`✅ [Flow/Img] Imagem ${i + 1} salva: ${outputPath} (${Math.round(size / 1024)} KB)`);
          } else {
            console.warn(`⚠️ [Flow/Img] Arquivo vazio, ignorando: ${outputPath}`);
            fs.unlinkSync(outputPath);
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
