/**
 * YouTube Studio Automation Library
 * 
 * Biblioteca para automação do YouTube Studio via Puppeteer.
 * Gerencia login, upload de vídeos, analytics e mais.
 */

import { Browser, Page, ElementHandle } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';

// Adiciona o plugin stealth para evitar detecção
puppeteerExtra.use(StealthPlugin());

// ========================================
// INTERFACES
// ========================================

export interface YouTubeConfig {
  workspaceId: string;
  headless?: boolean;
  userDataDir?: string;
  viewport?: { width: number; height: number };
  userAgent?: string;
}

export interface ChannelInfo {
  name: string;
  handle?: string;
  subscribers?: string;
  avatarUrl?: string;
}

export interface VideoInfo {
  id: string;
  title: string;
  thumbnail?: string;
  views?: string;
  likes?: string;
  comments?: string;
  publishedAt?: string;
  status?: 'public' | 'private' | 'unlisted' | 'scheduled';
}

export interface AnalyticsData {
  views: string;
  watchTime: string;
  subscribers: string;
  revenue?: string;
}

// ========================================
// YOUTUBE CLASS
// ========================================

export class YouTube {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private config: YouTubeConfig;
  private userDataDir: string;
  private isConnected: boolean = false;
  private _isLoggedIn: boolean = false;

  // URLs do YouTube Studio
  private static readonly STUDIO_URL = 'https://studio.youtube.com/';
  private static readonly STUDIO_DASHBOARD = 'https://studio.youtube.com/channel/';
  private static readonly STUDIO_CONTENT = 'https://studio.youtube.com/channel/*/videos';
  private static readonly STUDIO_ANALYTICS = 'https://studio.youtube.com/channel/*/analytics';
  private static readonly YOUTUBE_LOGIN = 'https://accounts.google.com/ServiceLogin?service=youtube';

  // Seletor para verificar se está logado no Studio
  private static readonly LOGGED_IN_SELECTOR = 'img.style-scope.ytcp-home-button[src*="yt_studio_logo"]';
  private static readonly LOGGED_IN_SELECTOR_ALT = 'ytcp-home-button img[alt=""][height="24"]';

  constructor(config: YouTubeConfig) {
    this.config = {
      headless: config.headless ?? false,
      viewport: config.viewport ?? { width: 1366, height: 768 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...config
    };

    // Define diretório de dados do usuário
    this.userDataDir = this.config.userDataDir || 
      path.join(process.cwd(), 'puppeteer-cache', 'youtube', this.config.workspaceId);

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

  /**
   * Tira screenshot para debug
   */
  async takeScreenshot(name: string): Promise<string | null> {
    if (!this.page) return null;

    try {
      const screenshotDir = path.join(this.userDataDir, 'screenshots');
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }

      const filename = `${name}-${Date.now()}.png`;
      const filepath = path.join(screenshotDir, filename);
      
      await this.page.screenshot({ path: filepath, fullPage: true });
      console.log(`📸 [YouTube] Screenshot salvo: ${filepath}`);
      
      return filepath;
    } catch (error) {
      console.error('❌ [YouTube] Erro ao tirar screenshot:', error);
      return null;
    }
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
   * Verifica se o usuário está logado no YouTube Studio
   */
  get isLoggedIn(): boolean {
    return this._isLoggedIn;
  }

  /**
   * Inicializa o navegador
   */
  async init(): Promise<void> {
    if (this.browser) {
      console.log('⚠️ [YouTube] Browser já inicializado');
      return;
    }

    try {
      console.log('🚀 [YouTube] Inicializando navegador...');

      const chromePath = this.findChromePath();
      console.log(`🔍 [YouTube] Chrome path: ${chromePath || 'using bundled Chromium'}`);
      console.log(`📁 [YouTube] User data dir: ${this.userDataDir}`);

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
      console.log('✅ [YouTube] Navegador inicializado');

    } catch (error) {
      console.error('❌ [YouTube] Erro ao inicializar navegador:', error);
      throw error;
    }
  }

  /**
   * Navega para o YouTube Studio e verifica login
   */
  async goToStudio(): Promise<boolean> {
    if (!this.page) {
      throw new Error('Navegador não inicializado. Chame init() primeiro.');
    }

    try {
      console.log('🌐 [YouTube] Navegando para YouTube Studio...');
      
      await this.page.goto(YouTube.STUDIO_URL, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      await this.randomDelay(2000, 3000);

      // Verifica se está logado
      this._isLoggedIn = await this.checkLoginStatus();
      
      return this._isLoggedIn;
    } catch (error) {
      console.error('❌ [YouTube] Erro ao navegar para Studio:', error);
      return false;
    }
  }

  /**
   * Abre a página de login do Google/YouTube
   */
  async openLoginPage(): Promise<void> {
    if (!this.page) {
      throw new Error('Navegador não inicializado. Chame init() primeiro.');
    }

    console.log('🔐 [YouTube] Abrindo página de login...');
    
    await this.page.goto(YouTube.YOUTUBE_LOGIN, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
  }

  /**
   * Verifica o status de login no YouTube Studio
   */
  async checkLoginStatus(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const currentUrl = this.page.url();
      
      // Se está na página de login do Google, não está logado
      if (currentUrl.includes('accounts.google.com')) {
        console.log('⚠️ [YouTube] Usuário não está logado (redirecionado para Google)');
        this._isLoggedIn = false;
        return false;
      }

      // Verifica se está no Studio e tem o elemento de logo
      // O seletor específico pedido pelo usuário:
      // <img height="24" alt="" class="style-scope ytcp-home-button" src="https://www.gstatic.com/youtube/img/creator/yt_studio_logo_v2_darkmode.svg">
      
      const studioLogoSelector = 'img.style-scope.ytcp-home-button[src*="yt_studio_logo"]';
      
      try {
        await this.page.waitForSelector(studioLogoSelector, { timeout: 5000 });
        console.log('✅ [YouTube] Usuário está logado no Studio');
        this._isLoggedIn = true;
        return true;
      } catch {
        // Tenta seletor alternativo
        const altSelector = 'ytcp-home-button img[height="24"]';
        const logoElement = await this.page.$(altSelector);
        
        if (logoElement) {
          console.log('✅ [YouTube] Usuário está logado no Studio (seletor alt)');
          this._isLoggedIn = true;
          return true;
        }
      }

      // Verifica pela URL se está no Studio
      if (currentUrl.includes('studio.youtube.com/channel/')) {
        console.log('✅ [YouTube] Usuário está logado (URL contém channel)');
        this._isLoggedIn = true;
        return true;
      }

      console.log('⚠️ [YouTube] Status de login incerto');
      this._isLoggedIn = false;
      return false;

    } catch (error) {
      console.error('❌ [YouTube] Erro ao verificar login:', error);
      this._isLoggedIn = false;
      return false;
    }
  }

  /**
   * Aguarda o usuário fazer login manualmente
   * Retorna quando detecta login bem-sucedido ou timeout
   */
  async waitForLogin(timeoutMs: number = 300000): Promise<boolean> {
    if (!this.page) return false;

    console.log('⏳ [YouTube] Aguardando login manual...');

    const startTime = Date.now();
    const checkInterval = 3000; // Verifica a cada 3 segundos

    while (Date.now() - startTime < timeoutMs) {
      const isLoggedIn = await this.checkLoginStatus();
      
      if (isLoggedIn) {
        console.log('✅ [YouTube] Login detectado!');
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    console.log('⚠️ [YouTube] Timeout aguardando login');
    return false;
  }

  // ========================================
  // MÉTODOS PÚBLICOS - INFORMAÇÕES DO CANAL
  // ========================================

  /**
   * Obtém informações do canal logado
   */
  async getChannelInfo(): Promise<ChannelInfo | null> {
    if (!this.page || !this._isLoggedIn) {
      console.error('❌ [YouTube] Não está logado');
      return null;
    }

    try {
      // Navega para o dashboard se necessário
      if (!this.page.url().includes('studio.youtube.com')) {
        await this.goToStudio();
      }

      await this.randomDelay(1000, 2000);

      // Tenta extrair informações do canal
      const channelInfo = await this.page.evaluate(() => {
        // Tenta pegar nome do canal
        const nameElement = document.querySelector('yt-formatted-string#channel-title') ||
                           document.querySelector('.channel-name') ||
                           document.querySelector('[id*="channel-name"]');
        
        // Tenta pegar avatar
        const avatarElement = document.querySelector('img#avatar-btn') as HTMLImageElement ||
                             document.querySelector('img.channel-avatar') as HTMLImageElement;
        
        // Tenta pegar handle
        const handleElement = document.querySelector('yt-formatted-string#channel-handle');

        return {
          name: nameElement?.textContent?.trim() || 'Canal YouTube',
          handle: handleElement?.textContent?.trim(),
          avatarUrl: avatarElement?.src,
        };
      });

      console.log('📊 [YouTube] Info do canal:', channelInfo);
      return channelInfo;

    } catch (error) {
      console.error('❌ [YouTube] Erro ao obter info do canal:', error);
      return null;
    }
  }

  /**
   * Obtém lista de vídeos recentes do canal
   */
  async getRecentVideos(limit: number = 10): Promise<VideoInfo[]> {
    if (!this.page || !this._isLoggedIn) {
      console.error('❌ [YouTube] Não está logado');
      return [];
    }

    try {
      // Navega para a página de conteúdo
      const contentUrl = this.page.url().replace(/\/[^\/]*$/, '/videos/upload');
      await this.page.goto(contentUrl.replace('/upload', ''), { waitUntil: 'networkidle2' });
      
      await this.randomDelay(2000, 3000);

      // Extrai informações dos vídeos
      const videos = await this.page.evaluate((maxVideos: number) => {
        const videoElements = document.querySelectorAll('ytcp-video-row');
        const results: any[] = [];

        videoElements.forEach((el, index) => {
          if (index >= maxVideos) return;

          const titleEl = el.querySelector('a#video-title');
          const viewsEl = el.querySelector('[id*="views"]');
          const thumbnailEl = el.querySelector('img.video-thumbnail-img') as HTMLImageElement;

          results.push({
            id: titleEl?.getAttribute('href')?.match(/video\/([^\/]+)/)?.[1] || '',
            title: titleEl?.textContent?.trim() || '',
            views: viewsEl?.textContent?.trim(),
            thumbnail: thumbnailEl?.src,
          });
        });

        return results;
      }, limit);

      console.log(`📹 [YouTube] ${videos.length} vídeos encontrados`);
      return videos;

    } catch (error) {
      console.error('❌ [YouTube] Erro ao obter vídeos:', error);
      return [];
    }
  }

  // ========================================
  // MÉTODOS PÚBLICOS - ANALYTICS
  // ========================================

  /**
   * Obtém dados básicos de analytics
   */
  async getBasicAnalytics(): Promise<AnalyticsData | null> {
    if (!this.page || !this._isLoggedIn) {
      console.error('❌ [YouTube] Não está logado');
      return null;
    }

    try {
      // Navega para analytics
      const currentUrl = this.page.url();
      const analyticsUrl = currentUrl.includes('/channel/') 
        ? currentUrl.replace(/\/[^\/]*$/, '/analytics/tab-overview/period-default')
        : YouTube.STUDIO_URL;
      
      await this.page.goto(analyticsUrl, { waitUntil: 'networkidle2' });
      await this.randomDelay(2000, 3000);

      // Extrai métricas (os seletores podem variar)
      const analytics = await this.page.evaluate(() => {
        // Estes seletores são aproximações - podem precisar de ajuste
        const getMetricValue = (selector: string): string => {
          const el = document.querySelector(selector);
          return el?.textContent?.trim() || 'N/A';
        };

        return {
          views: getMetricValue('[aria-label*="views"] .metric-value') || 'N/A',
          watchTime: getMetricValue('[aria-label*="watch time"] .metric-value') || 'N/A',
          subscribers: getMetricValue('[aria-label*="subscribers"] .metric-value') || 'N/A',
          revenue: getMetricValue('[aria-label*="revenue"] .metric-value'),
        };
      });

      console.log('📊 [YouTube] Analytics:', analytics);
      return analytics;

    } catch (error) {
      console.error('❌ [YouTube] Erro ao obter analytics:', error);
      return null;
    }
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
        console.log('🔌 [YouTube] Navegador fechado');
      }
    } catch (error) {
      console.error('❌ [YouTube] Erro ao fechar navegador:', error);
    }
  }

  /**
   * Retorna a página atual (para uso avançado)
   */
  getPage(): Page | null {
    return this.page;
  }

  /**
   * Retorna o browser (para uso avançado)
   */
  getBrowser(): Browser | null {
    return this.browser;
  }
}

// ========================================
// FACTORY FUNCTIONS
// ========================================

/**
 * Cria uma instância do YouTube para um workspace específico
 */
export function createYouTubeInstance(workspaceId: string, options?: Partial<YouTubeConfig>): YouTube {
  return new YouTube({
    workspaceId,
    ...options
  });
}
