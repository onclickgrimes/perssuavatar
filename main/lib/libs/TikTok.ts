/**
 * TikTok Studio Automation Library
 * 
 * Biblioteca para automação do TikTok Studio via Puppeteer.
 * Gerencia login, upload de vídeos, analytics e mais.
 */

import { Browser, Page } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';

// Adiciona o plugin stealth para evitar detecção
puppeteerExtra.use(StealthPlugin());

// ========================================
// INTERFACES
// ========================================

export interface TikTokConfig {
  workspaceId: string;
  headless?: boolean;
  userDataDir?: string;
  viewport?: { width: number; height: number };
  userAgent?: string;
}

export interface TikTokUserInfo {
  uniqueId: string;  // @handle
  nickName: string;  // Display name
  uid?: string;
  signature?: string;
  avatarUrl?: string;
}

export interface TikTokVideoInfo {
  id: string;
  title: string;
  thumbnail?: string;
  views?: string;
  likes?: string;
  comments?: string;
  publishedAt?: string;
}

// ========================================
// TIKTOK CLASS
// ========================================

export class TikTok {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private config: TikTokConfig;
  private userDataDir: string;
  private isConnected: boolean = false;
  private _isLoggedIn: boolean = false;
  private _userInfo: TikTokUserInfo | null = null;

  // URLs do TikTok
  private static readonly STUDIO_URL = 'https://www.tiktok.com/tiktokstudio/upload?from=webapp';
  private static readonly STUDIO_CONTENT = 'https://www.tiktok.com/tiktokstudio/content';
  private static readonly STUDIO_ANALYTICS = 'https://www.tiktok.com/tiktokstudio/analytics';
  private static readonly LOGIN_URL = 'https://www.tiktok.com/login';

  constructor(config: TikTokConfig) {
    this.config = {
      headless: config.headless ?? false,
      viewport: config.viewport ?? { width: 1366, height: 768 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...config
    };

    // Define diretório de dados do usuário
    this.userDataDir = this.config.userDataDir || 
      path.join(process.cwd(), 'puppeteer-cache', 'tiktok', this.config.workspaceId);

    // Cria diretórios se não existirem
    this.ensureDirectoriesExist();
  }

  // ========================================
  // MÉTODOS PRIVADOS - SETUP
  // ========================================

  /**
   * Garante que os diretórios necessários existam
   */
  private ensureDirectoriesExist(): void {
    if (!fs.existsSync(this.userDataDir)) {
      fs.mkdirSync(this.userDataDir, { recursive: true });
    }
  }

  /**
   * Encontra o caminho do Chrome instalado no sistema
   */
  private findChromePath(): string | undefined {
    const possiblePaths = [
      // Windows
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      // Mac
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      // Linux
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

  /**
   * Delay aleatório entre ações (para parecer mais humano)
   */
  private async randomDelay(min: number = 500, max: number = 1500): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // ========================================
  // MÉTODOS PÚBLICOS - CONEXÃO
  // ========================================

  /**
   * Verifica se o browser está conectado/inicializado
   */
  isBrowserConnected(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }

  /**
   * Verifica se o usuário está logado no TikTok Studio
   */
  get isLoggedIn(): boolean {
    return this._isLoggedIn;
  }

  /**
   * Retorna informações do usuário
   */
  get userInfo(): TikTokUserInfo | null {
    return this._userInfo;
  }

  /**
   * Inicializa o navegador
   */
  async init(): Promise<void> {
    if (this.browser) {
      console.log('⚠️ [TikTok] Browser já inicializado');
      return;
    }

    try {
      console.log('🚀 [TikTok] Inicializando navegador...');

      const chromePath = this.findChromePath();
      console.log(`🔍 [TikTok] Chrome path: ${chromePath || 'using bundled Chromium'}`);
      console.log(`📁 [TikTok] User data dir: ${this.userDataDir}`);

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

      // Configura headers
      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      });

      this.isConnected = true;
      console.log('✅ [TikTok] Navegador inicializado');

    } catch (error) {
      console.error('❌ [TikTok] Erro ao inicializar navegador:', error);
      throw error;
    }
  }

  /**
   * Navega para o TikTok Studio e verifica login
   */
  async goToStudio(): Promise<boolean> {
    if (!this.page) {
      throw new Error('Navegador não inicializado. Chame init() primeiro.');
    }

    try {
      console.log('🌐 [TikTok] Navegando para TikTok Studio...');
      
      await this.page.goto(TikTok.STUDIO_URL, { 
        waitUntil: 'load',
        timeout: 30000 
      });

      await this.randomDelay(2000, 3000);

      // Verifica se está logado
      this._isLoggedIn = await this.checkLoginStatus();
      
      if (this._isLoggedIn) {
        await this.extractUserInfo();
      }
      
      return this._isLoggedIn;
    } catch (error) {
      console.error('❌ [TikTok] Erro ao navegar para Studio:', error);
      return false;
    }
  }

  /**
   * Verifica o status de login no TikTok
   */
  async checkLoginStatus(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const currentUrl = this.page.url();
      
      // Se está na página de login, não está logado
      if (currentUrl.includes('tiktok.com/login')) {
        console.log('⚠️ [TikTok] Usuário não está logado (redirecionado para login)');
        this._isLoggedIn = false;
        return false;
      }

      // Se está no Studio, está logado
      if (currentUrl.includes('tiktok.com/tiktokstudio')) {
        console.log('✅ [TikTok] Usuário está logado no Studio');
        this._isLoggedIn = true;
        return true;
      }

      console.log('⚠️ [TikTok] Status de login incerto');
      this._isLoggedIn = false;
      return false;

    } catch (error) {
      console.error('❌ [TikTok] Erro ao verificar login:', error);
      this._isLoggedIn = false;
      return false;
    }
  }

  /**
   * Extrai informações do usuário do TikTok Studio
   */
  async extractUserInfo(): Promise<TikTokUserInfo | null> {
    if (!this.page) return null;

    try {
      console.log('📍 [TikTok] Extraindo informações do usuário...');
      
      // Aguarda a página carregar completamente
      await this.randomDelay(2000, 3000);
      
      // Pega o HTML da página
      const pageContent = await this.page.content();
      console.log(`📄 [TikTok] Page content length: ${pageContent.length}`);
      
      let uniqueId: string | null = null;
      let nickName: string | null = null;
      let uid: string | null = null;
      
      // Método 1: Busca uniqueId (prioridade - é o @ handle)
      let uniqueMatch = pageContent.match(/"uniqueId"\s*:\s*"([^"]+)"/);
      if (uniqueMatch && uniqueMatch[1]) {
        uniqueId = uniqueMatch[1];
        console.log(`✅ [TikTok] uniqueId via método 1: ${uniqueId}`);
      }
      
      // Método 2: Busca uniqueId com HTML entities
      if (!uniqueId) {
        uniqueMatch = pageContent.match(/&quot;uniqueId&quot;\s*:\s*&quot;([^&]+)&quot;/);
        if (uniqueMatch && uniqueMatch[1]) {
          uniqueId = uniqueMatch[1];
          console.log(`✅ [TikTok] uniqueId via método 2: ${uniqueId}`);
        }
      }
      
      // Busca nickName
      let nickMatch = pageContent.match(/"nickName"\s*:\s*"([^"]+)"/);
      if (nickMatch && nickMatch[1]) {
        nickName = nickMatch[1];
      }
      if (!nickName) {
        nickMatch = pageContent.match(/&quot;nickName&quot;\s*:\s*&quot;([^&]+)&quot;/);
        if (nickMatch && nickMatch[1]) {
          nickName = nickMatch[1];
        }
      }
      
      // Busca uid
      let uidMatch = pageContent.match(/"uid"\s*:\s*"([^"]+)"/);
      if (uidMatch && uidMatch[1]) {
        uid = uidMatch[1];
      }
      
      if (uniqueId || nickName) {
        this._userInfo = {
          uniqueId: uniqueId || '',
          nickName: nickName || '',
          uid: uid || undefined
        };
        console.log(`✅ [TikTok] User info extraído:`, this._userInfo);
        return this._userInfo;
      }
      
      console.warn('⚠️ [TikTok] Não foi possível extrair informações do usuário');
      return null;

    } catch (error) {
      console.error('❌ [TikTok] Erro ao extrair user info:', error);
      return null;
    }
  }

  /**
   * Retorna o username formatado (@handle)
   */
  getUsername(): string {
    if (this._userInfo?.uniqueId) {
      return '@' + this._userInfo.uniqueId;
    }
    if (this._userInfo?.nickName) {
      return '@' + this._userInfo.nickName;
    }
    return '@tiktok_user';
  }

  /**
   * Aguarda o usuário fazer login manualmente
   */
  async waitForLogin(timeoutMs: number = 300000): Promise<boolean> {
    if (!this.page) return false;

    console.log('⏳ [TikTok] Aguardando login manual...');

    const startTime = Date.now();
    const checkInterval = 3000;

    while (Date.now() - startTime < timeoutMs) {
      const currentUrl = this.page.url();
      
      // Se saiu da página de login e está no Studio
      if (currentUrl.includes('tiktok.com/tiktokstudio')) {
        console.log('✅ [TikTok] Login detectado!');
        this._isLoggedIn = true;
        await this.extractUserInfo();
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    console.log('⚠️ [TikTok] Timeout aguardando login');
    return false;
  }

  // ========================================
  // MÉTODOS PÚBLICOS - CLEANUP
  // ========================================

  /**
   * Fecha o navegador
   */
  async close(): Promise<void> {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
        this.isConnected = false;
        this._isLoggedIn = false;
        this._userInfo = null;
        console.log('🔌 [TikTok] Navegador fechado');
      }
    } catch (error) {
      console.error('❌ [TikTok] Erro ao fechar navegador:', error);
    }
  }

  /**
   * Retorna a página atual
   */
  getPage(): Page | null {
    return this.page;
  }

  /**
   * Retorna o browser
   */
  getBrowser(): Browser | null {
    return this.browser;
  }
}

// ========================================
// FACTORY FUNCTIONS
// ========================================

/**
 * Cria uma instância do TikTok para um workspace específico
 */
export function createTikTokInstance(workspaceId: string, options?: Partial<TikTokConfig>): TikTok {
  return new TikTok({
    workspaceId,
    ...options
  });
}

/**
 * Extrai username do TikTok a partir do HTML da página
 * Função utilitária que pode ser usada independentemente
 */
export function extractTikTokUsernameFromHTML(pageContent: string): string | null {
  // Método 1: Busca uniqueId (prioridade)
  let uniqueMatch = pageContent.match(/"uniqueId"\s*:\s*"([^"]+)"/);
  if (uniqueMatch && uniqueMatch[1]) {
    return '@' + uniqueMatch[1];
  }
  
  // Método 2: Busca uniqueId com HTML entities
  uniqueMatch = pageContent.match(/&quot;uniqueId&quot;\s*:\s*&quot;([^&]+)&quot;/);
  if (uniqueMatch && uniqueMatch[1]) {
    return '@' + uniqueMatch[1];
  }
  
  // Método 3: Busca nickName como fallback
  let nickMatch = pageContent.match(/"nickName"\s*:\s*"([^"]+)"/);
  if (nickMatch && nickMatch[1]) {
    return '@' + nickMatch[1];
  }
  
  // Método 4: Busca nickName com HTML entities
  nickMatch = pageContent.match(/&quot;nickName&quot;\s*:\s*&quot;([^&]+)&quot;/);
  if (nickMatch && nickMatch[1]) {
    return '@' + nickMatch[1];
  }
  
  return null;
}
