/**
 * Qwen Provider - Automação do Qwen Chat via Puppeteer
 * 
 * Biblioteca para automação do Qwen (chat.qwenlm.ai) via navegador.
 * Gerencia login, sessões e interações com o chat.
 */

import { Browser, Page } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// Adiciona o plugin stealth para evitar detecção
puppeteerExtra.use(StealthPlugin());

// ========================================
// INTERFACES
// ========================================

export interface QwenProviderConfig {
  id: string;
  name: string;
  headless?: boolean;
  userDataDir?: string;
  viewport?: { width: number; height: number };
}

export interface QwenUserInfo {
  username?: string;
  email?: string;
}

// ========================================
// QWEN PROVIDER CLASS
// ========================================

export class QwenProvider {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private config: QwenProviderConfig;
  private userDataDir: string;
  private isConnected: boolean = false;
  private _isLoggedIn: boolean = false;
  private _userInfo: QwenUserInfo | null = null;

  // URLs do Qwen
  private static readonly QWEN_URL = 'https://chat.qwenlm.ai/';
  private static readonly LOGIN_URL = 'https://chat.qwenlm.ai/';

  constructor(config: QwenProviderConfig) {
    this.config = {
      headless: config.headless ?? false,
      viewport: config.viewport ?? { width: 1366, height: 768 },
      ...config
    };

    // Define diretório de dados do usuário (mesmo padrão do TikTok/Instagram)
    this.userDataDir = this.config.userDataDir || 
      path.join(app.getPath('userData'), 'provider-cookies', 'profiles', this.config.id);

    this.ensureDirectoriesExist();
  }

  // ========================================
  // MÉTODOS PRIVADOS - SETUP
  // ========================================

  private ensureDirectoriesExist(): void {
    if (!fs.existsSync(this.userDataDir)) {
      fs.mkdirSync(this.userDataDir, { recursive: true });
    }
  }

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

  // ========================================
  // MÉTODOS PÚBLICOS - CONEXÃO
  // ========================================

  isBrowserConnected(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }

  get isLoggedIn(): boolean {
    return this._isLoggedIn;
  }

  get userInfo(): QwenUserInfo | null {
    return this._userInfo;
  }

  get providerId(): string {
    return this.config.id;
  }

  get providerName(): string {
    return this.config.name;
  }

  /**
   * Inicializa o navegador
   */
  async init(): Promise<void> {
    if (this.browser) {
      console.log(`⚠️ [Qwen] Browser já inicializado para ${this.config.name}`);
      return;
    }

    try {
      console.log(`🚀 [Qwen] Inicializando navegador para ${this.config.name}...`);

      const chromePath = this.findChromePath();
      console.log(`🔍 [Qwen] Chrome path: ${chromePath || 'using bundled Chromium'}`);
      console.log(`📁 [Qwen] User data dir: ${this.userDataDir}`);

      const launchOptions: any = {
        headless: this.config.headless,
        userDataDir: this.userDataDir,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1366,768',
          '--lang=pt-BR',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-site-isolation-trials',
          '--disable-infobars',
        ],
        ignoreDefaultArgs: ['--enable-automation'],
        defaultViewport: this.config.viewport,
      };

      if (chromePath) {
        launchOptions.executablePath = chromePath;
      }

      this.browser = await puppeteerExtra.launch(launchOptions);
      
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
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      });

      this.isConnected = true;
      console.log(`✅ [Qwen] Navegador inicializado para ${this.config.name}`);

    } catch (error) {
      console.error(`❌ [Qwen] Erro ao inicializar navegador:`, error);
      throw error;
    }
  }

  /**
   * Navega para o Qwen e verifica login
   */
  async goToQwen(): Promise<boolean> {
    if (!this.page) {
      throw new Error('Navegador não inicializado. Chame init() primeiro.');
    }

    try {
      console.log(`🌐 [Qwen] Navegando para ${QwenProvider.QWEN_URL}...`);
      
      await this.page.goto(QwenProvider.QWEN_URL, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      await this.randomDelay(2000, 3000);

      this._isLoggedIn = await this.checkLoginStatus();
      
      if (this._isLoggedIn) {
        await this.extractUserInfo();
      }
      
      return this._isLoggedIn;
    } catch (error) {
      console.error(`❌ [Qwen] Erro ao navegar:`, error);
      return false;
    }
  }

  /**
   * Verifica o status de login
   */
  async checkLoginStatus(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const currentUrl = this.page.url();
      const pageContent = await this.page.content();
      
      // Se está na página de login
      if (currentUrl.includes('login') || currentUrl.includes('signin')) {
        console.log(`⚠️ [Qwen] Usuário não está logado (página de login)`);
        this._isLoggedIn = false;
        return false;
      }

      // Verifica elementos que indicam login no Qwen
      const hasLoginButton = pageContent.includes('sign-in') || 
                             pageContent.includes('Sign in') ||
                             pageContent.includes('登录');
      
      const hasChatElements = pageContent.includes('chat-input') || 
                              pageContent.includes('message-container') ||
                              pageContent.includes('conversation');

      const isLoggedIn = hasChatElements && !hasLoginButton;

      this._isLoggedIn = isLoggedIn;
      console.log(`${isLoggedIn ? '✅' : '⚠️'} [Qwen] Status de login: ${isLoggedIn ? 'logado' : 'não logado'}`);
      return isLoggedIn;

    } catch (error) {
      console.error(`❌ [Qwen] Erro ao verificar login:`, error);
      this._isLoggedIn = false;
      return false;
    }
  }

  /**
   * Extrai informações do usuário
   */
  async extractUserInfo(): Promise<QwenUserInfo | null> {
    if (!this.page) return null;

    try {
      console.log(`📍 [Qwen] Extraindo informações do usuário...`);
      
      await this.randomDelay(1000, 2000);
      
      // Tenta extrair informações do usuário
      const userInfo = await this.page.evaluate(() => {
        // Procura por elementos de perfil
        const profileElement = document.querySelector('.user-profile, .avatar, [data-user]');
        const usernameElement = document.querySelector('.username, [data-username]');
        
        return {
          username: usernameElement?.textContent?.trim() || undefined
        };
      });

      if (userInfo.username) {
        this._userInfo = userInfo;
        console.log(`✅ [Qwen] User info extraído:`, this._userInfo);
        return this._userInfo;
      }

      console.warn(`⚠️ [Qwen] Não foi possível extrair informações do usuário`);
      return null;

    } catch (error) {
      console.error(`❌ [Qwen] Erro ao extrair user info:`, error);
      return null;
    }
  }

  /**
   * Aguarda o usuário fazer login manualmente
   */
  async waitForLogin(timeoutMs: number = 300000): Promise<boolean> {
    if (!this.page) return false;

    console.log(`⏳ [Qwen] Aguardando login manual para ${this.config.name}...`);

    const startTime = Date.now();
    const checkInterval = 3000;

    while (Date.now() - startTime < timeoutMs) {
      const isLoggedIn = await this.checkLoginStatus();
      if (isLoggedIn) {
        console.log(`✅ [Qwen] Login detectado para ${this.config.name}!`);
        this._isLoggedIn = true;
        await this.extractUserInfo();
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    console.log(`⚠️ [Qwen] Timeout aguardando login para ${this.config.name}`);
    return false;
  }

  // ========================================
  // MÉTODOS PÚBLICOS - INTERAÇÃO COM CHAT
  // ========================================

  /**
   * Envia uma mensagem para o Qwen
   */
  async sendMessage(message: string): Promise<string | null> {
    if (!this._isLoggedIn || !this.page) {
      throw new Error('Usuário não está logado no Qwen');
    }

    try {
      console.log(`💬 [Qwen] Enviando mensagem...`);

      // Encontra o campo de input
      const inputSelector = 'textarea, div[contenteditable="true"], input[type="text"]';
      await this.page.waitForSelector(inputSelector, { timeout: 10000 });

      // Clica e digita a mensagem
      await this.page.click(inputSelector);
      await this.randomDelay(300, 500);
      await this.page.keyboard.type(message, { delay: 20 });
      await this.randomDelay(500, 1000);

      // Envia a mensagem
      await this.page.keyboard.press('Enter');

      // Aguarda a resposta
      console.log(`⏳ [Qwen] Aguardando resposta...`);
      await this.randomDelay(5000, 10000);

      // Tenta capturar a última resposta
      const response = await this.page.evaluate(() => {
        const responses = document.querySelectorAll('.assistant-message, .bot-message, [data-role="assistant"]');
        const lastResponse = responses[responses.length - 1];
        return lastResponse?.textContent || null;
      });

      console.log(`✅ [Qwen] Resposta recebida`);
      return response;

    } catch (error) {
      console.error(`❌ [Qwen] Erro ao enviar mensagem:`, error);
      throw error;
    }
  }

  /**
   * Seleciona um modelo específico do Qwen
   */
  async selectModel(model: 'qwen-turbo' | 'qwen-plus' | 'qwen-max'): Promise<boolean> {
    if (!this._isLoggedIn || !this.page) {
      throw new Error('Usuário não está logado no Qwen');
    }

    try {
      console.log(`🔄 [Qwen] Selecionando modelo: ${model}...`);

      // Clica no seletor de modelo
      const modelSelector = '.model-selector, [data-testid="model-select"]';
      const selectorExists = await this.page.$(modelSelector);
      
      if (!selectorExists) {
        console.warn(`⚠️ [Qwen] Seletor de modelo não encontrado`);
        return false;
      }

      await this.page.click(modelSelector);
      await this.randomDelay(500, 1000);

      // Seleciona o modelo
      const modelOption = await this.page.$(`[data-model="${model}"], [title*="${model}"]`);
      if (modelOption) {
        await modelOption.click();
        await this.randomDelay(500, 1000);
        console.log(`✅ [Qwen] Modelo ${model} selecionado`);
        return true;
      }

      console.warn(`⚠️ [Qwen] Modelo ${model} não encontrado`);
      return false;

    } catch (error) {
      console.error(`❌ [Qwen] Erro ao selecionar modelo:`, error);
      return false;
    }
  }

  // ========================================
  // MÉTODOS PÚBLICOS - CLEANUP
  // ========================================

  async close(): Promise<void> {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
        this.isConnected = false;
        this._isLoggedIn = false;
        this._userInfo = null;
        console.log(`🔌 [Qwen] Navegador fechado para ${this.config.name}`);
      }
    } catch (error) {
      console.error(`❌ [Qwen] Erro ao fechar navegador:`, error);
    }
  }

  getPage(): Page | null {
    return this.page;
  }

  getBrowser(): Browser | null {
    return this.browser;
  }
}

// ========================================
// FACTORY FUNCTION
// ========================================

export function createQwenProvider(id: string, name: string, options?: Partial<QwenProviderConfig>): QwenProvider {
  return new QwenProvider({
    id,
    name,
    ...options
  });
}
