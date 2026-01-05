/**
 * OpenAI Provider - Automação do ChatGPT via Puppeteer
 * 
 * Biblioteca para automação do ChatGPT (chat.openai.com) via navegador.
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

export interface OpenAIProviderConfig {
  id: string;
  name: string;
  headless?: boolean;
  userDataDir?: string;
  viewport?: { width: number; height: number };
}

export interface OpenAIUserInfo {
  email?: string;
  name?: string;
  plan?: string; // free, plus, team
}

// ========================================
// OPENAI PROVIDER CLASS
// ========================================

export class OpenAIProvider {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private config: OpenAIProviderConfig;
  private userDataDir: string;
  private isConnected: boolean = false;
  private _isLoggedIn: boolean = false;
  private _userInfo: OpenAIUserInfo | null = null;

  // URLs do ChatGPT
  private static readonly CHATGPT_URL = 'https://chat.openai.com/';
  private static readonly LOGIN_URL = 'https://auth0.openai.com/';

  constructor(config: OpenAIProviderConfig) {
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

  get userInfo(): OpenAIUserInfo | null {
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
      console.log(`⚠️ [OpenAI] Browser já inicializado para ${this.config.name}`);
      return;
    }

    try {
      console.log(`🚀 [OpenAI] Inicializando navegador para ${this.config.name}...`);

      const chromePath = this.findChromePath();
      console.log(`🔍 [OpenAI] Chrome path: ${chromePath || 'using bundled Chromium'}`);
      console.log(`📁 [OpenAI] User data dir: ${this.userDataDir}`);

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
      console.log(`✅ [OpenAI] Navegador inicializado para ${this.config.name}`);

    } catch (error) {
      console.error(`❌ [OpenAI] Erro ao inicializar navegador:`, error);
      throw error;
    }
  }

  /**
   * Navega para o ChatGPT e verifica login
   */
  async goToChatGPT(): Promise<boolean> {
    if (!this.page) {
      throw new Error('Navegador não inicializado. Chame init() primeiro.');
    }

    try {
      console.log(`🌐 [OpenAI] Navegando para ${OpenAIProvider.CHATGPT_URL}...`);
      
      await this.page.goto(OpenAIProvider.CHATGPT_URL, { 
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
      console.error(`❌ [OpenAI] Erro ao navegar:`, error);
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
      
      // Se redirecionou para login
      if (currentUrl.includes('auth0') || currentUrl.includes('/auth/login')) {
        console.log(`⚠️ [OpenAI] Usuário não está logado (redirecionado para login)`);
        this._isLoggedIn = false;
        return false;
      }

      // Verifica elementos que indicam login no ChatGPT
      const isLoggedIn = pageContent.includes('conversation-turn') || 
                         pageContent.includes('main-content') ||
                         pageContent.includes('text-token-text-primary') ||
                         currentUrl.includes('chat.openai.com/c/') ||
                         currentUrl.includes('chatgpt.com');

      this._isLoggedIn = isLoggedIn;
      console.log(`${isLoggedIn ? '✅' : '⚠️'} [OpenAI] Status de login: ${isLoggedIn ? 'logado' : 'não logado'}`);
      return isLoggedIn;

    } catch (error) {
      console.error(`❌ [OpenAI] Erro ao verificar login:`, error);
      this._isLoggedIn = false;
      return false;
    }
  }

  /**
   * Extrai informações do usuário
   */
  async extractUserInfo(): Promise<OpenAIUserInfo | null> {
    if (!this.page) return null;

    try {
      console.log(`📍 [OpenAI] Extraindo informações do usuário...`);
      
      await this.randomDelay(1000, 2000);
      
      // Tenta extrair informações do usuário
      const userInfo = await this.page.evaluate(() => {
        // Procura pelo botão de perfil ou menu
        const profileButton = document.querySelector('[data-testid="profile-button"]');
        const menuItems = document.querySelectorAll('[role="menuitem"]');
        
        let name = undefined;
        let plan = undefined;
        
        // Tenta extrair nome
        if (profileButton) {
          name = profileButton.textContent?.trim();
        }
        
        // Procura por indicadores de plano
        const plusBadge = document.querySelector('.plus-badge, [data-testid="plus-badge"]');
        if (plusBadge) {
          plan = 'plus';
        }
        
        return { name, plan };
      });

      if (userInfo.name) {
        this._userInfo = userInfo;
        console.log(`✅ [OpenAI] User info extraído:`, this._userInfo);
        return this._userInfo;
      }

      console.warn(`⚠️ [OpenAI] Não foi possível extrair informações do usuário`);
      return null;

    } catch (error) {
      console.error(`❌ [OpenAI] Erro ao extrair user info:`, error);
      return null;
    }
  }

  /**
   * Aguarda o usuário fazer login manualmente
   */
  async waitForLogin(timeoutMs: number = 300000): Promise<boolean> {
    if (!this.page) return false;

    console.log(`⏳ [OpenAI] Aguardando login manual para ${this.config.name}...`);

    const startTime = Date.now();
    const checkInterval = 3000;

    while (Date.now() - startTime < timeoutMs) {
      const currentUrl = this.page.url();
      
      if ((currentUrl.includes('chat.openai.com') || currentUrl.includes('chatgpt.com')) && 
          !currentUrl.includes('auth0') && !currentUrl.includes('/auth/')) {
        const isLoggedIn = await this.checkLoginStatus();
        if (isLoggedIn) {
          console.log(`✅ [OpenAI] Login detectado para ${this.config.name}!`);
          this._isLoggedIn = true;
          await this.extractUserInfo();
          return true;
        }
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    console.log(`⚠️ [OpenAI] Timeout aguardando login para ${this.config.name}`);
    return false;
  }

  // ========================================
  // MÉTODOS PÚBLICOS - INTERAÇÃO COM CHAT
  // ========================================

  /**
   * Envia uma mensagem para o ChatGPT
   */
  async sendMessage(message: string): Promise<string | null> {
    if (!this._isLoggedIn || !this.page) {
      throw new Error('Usuário não está logado no ChatGPT');
    }

    try {
      console.log(`💬 [OpenAI] Enviando mensagem...`);

      // Encontra o campo de input
      const inputSelector = '#prompt-textarea, textarea[data-id="root"], div[contenteditable="true"]';
      await this.page.waitForSelector(inputSelector, { timeout: 10000 });

      // Clica e digita a mensagem
      await this.page.click(inputSelector);
      await this.randomDelay(300, 500);
      await this.page.keyboard.type(message, { delay: 20 });
      await this.randomDelay(500, 1000);

      // Envia a mensagem
      await this.page.keyboard.press('Enter');

      // Aguarda a resposta
      console.log(`⏳ [OpenAI] Aguardando resposta...`);
      await this.randomDelay(5000, 10000);

      // Tenta capturar a última resposta
      const response = await this.page.evaluate(() => {
        const responses = document.querySelectorAll('[data-message-author-role="assistant"]');
        const lastResponse = responses[responses.length - 1];
        return lastResponse?.textContent || null;
      });

      console.log(`✅ [OpenAI] Resposta recebida`);
      return response;

    } catch (error) {
      console.error(`❌ [OpenAI] Erro ao enviar mensagem:`, error);
      throw error;
    }
  }

  /**
   * Seleciona um modelo específico (GPT-3.5, GPT-4, etc)
   */
  async selectModel(model: 'gpt-3.5' | 'gpt-4' | 'gpt-4o'): Promise<boolean> {
    if (!this._isLoggedIn || !this.page) {
      throw new Error('Usuário não está logado no ChatGPT');
    }

    try {
      console.log(`🔄 [OpenAI] Selecionando modelo: ${model}...`);

      // Clica no seletor de modelo
      const modelSelector = '[data-testid="model-selector"], button[aria-haspopup="menu"]';
      await this.page.waitForSelector(modelSelector, { timeout: 5000 });
      await this.page.click(modelSelector);
      await this.randomDelay(500, 1000);

      // Seleciona o modelo
      const modelOption = await this.page.$(`[data-testid="${model}"], [data-value="${model}"]`);
      if (modelOption) {
        await modelOption.click();
        await this.randomDelay(500, 1000);
        console.log(`✅ [OpenAI] Modelo ${model} selecionado`);
        return true;
      }

      console.warn(`⚠️ [OpenAI] Modelo ${model} não encontrado`);
      return false;

    } catch (error) {
      console.error(`❌ [OpenAI] Erro ao selecionar modelo:`, error);
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
        console.log(`🔌 [OpenAI] Navegador fechado para ${this.config.name}`);
      }
    } catch (error) {
      console.error(`❌ [OpenAI] Erro ao fechar navegador:`, error);
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

export function createOpenAIProvider(id: string, name: string, options?: Partial<OpenAIProviderConfig>): OpenAIProvider {
  return new OpenAIProvider({
    id,
    name,
    ...options
  });
}
