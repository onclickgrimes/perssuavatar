/**
 * Social Media Service
 * 
 * Serviço para gerenciar conexões com redes sociais via Puppeteer.
 * Cada workspace tem sua própria instância/cookies do Puppeteer.
 */

import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// Adiciona o plugin stealth para evitar detecção
puppeteerExtra.use(StealthPlugin());

export type SocialPlatform = 'instagram' | 'tiktok' | 'youtube';

export interface ConnectedChannel {
  platform: SocialPlatform;
  username: string;
  connectedAt: number;
}

export interface WorkspaceConnection {
  workspaceId: string;
  browser: Browser | null;
  page: Page | null;
  isConnecting: boolean;
}

// URLs de login para cada plataforma
const PLATFORM_LOGIN_URLS: Record<SocialPlatform, string> = {
  instagram: 'https://www.instagram.com/accounts/login/',
  tiktok: 'https://www.tiktok.com/login',
  youtube: 'https://accounts.google.com/ServiceLogin?service=youtube'
};

export class SocialMediaService {
  private isInitialized = false;
  private connections: Map<string, WorkspaceConnection> = new Map();
  private cookiesDir: string;

  constructor() {
    this.cookiesDir = path.join(app.getPath('userData'), 'social-media-cookies');
    this.ensureCookiesDir();
    console.log('✅ [SocialMedia] Service created');
  }

  private ensureCookiesDir(): void {
    if (!fs.existsSync(this.cookiesDir)) {
      fs.mkdirSync(this.cookiesDir, { recursive: true });
    }
  }

  private getCookiesPath(workspaceId: string, platform: SocialPlatform): string {
    return path.join(this.cookiesDir, `${workspaceId}-${platform}.json`);
  }

  /**
   * Inicializa o serviço
   */
  initialize(): void {
    if (this.isInitialized) return;
    
    this.isInitialized = true;
    console.log('✅ [SocialMedia] Service initialized');
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
   * Retorna o diretório de dados do usuário para um workspace
   */
  private getUserDataDir(workspaceId: string): string {
    return path.join(this.cookiesDir, 'profiles', workspaceId);
  }

  /**
   * Abre o navegador Puppeteer para login em uma plataforma
   */
  async connectPlatform(
    workspaceId: string, 
    platform: SocialPlatform,
    onStatusChange?: (status: string) => void,
    onSuccess?: (username: string) => void,
    onError?: (error: string) => void
  ): Promise<void> {
    const connectionKey = `${workspaceId}-${platform}`;
    
    // Verifica se já está conectando
    const existing = this.connections.get(connectionKey);
    if (existing?.isConnecting) {
      console.log(`⚠️ [SocialMedia] Já está conectando ${platform} para workspace ${workspaceId}`);
      return;
    }

    try {
      onStatusChange?.('launching');
      console.log(`🚀 [SocialMedia] Iniciando navegador para ${platform}...`);

      // Tenta usar o Chrome instalado no sistema
      const chromePath = this.findChromePath();
      const userDataDir = this.getUserDataDir(workspaceId);

      // Garante que o diretório de perfil existe
      if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
      }

      console.log(`🔍 [SocialMedia] Chrome path: ${chromePath || 'using bundled Chromium'}`);
      console.log(`📁 [SocialMedia] User data dir: ${userDataDir}`);

      const launchOptions: any = {
        headless: false,
        userDataDir, // Perfil persistente por workspace
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1280,800',
          '--lang=pt-BR',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-site-isolation-trials',
          '--disable-infobars',
          '--start-maximized',
        ],
        ignoreDefaultArgs: ['--enable-automation'],
        defaultViewport: null,
      };

      // Usa o Chrome do sistema se disponível
      if (chromePath) {
        launchOptions.executablePath = chromePath;
      }

      const browser = await puppeteerExtra.launch(launchOptions);
      const pages = await browser.pages();
      const page = pages[0] || await browser.newPage();
      
      // Remove webdriver property
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
        // @ts-ignore
        window.navigator.chrome = { runtime: {} };
      });

      // Salva a conexão
      this.connections.set(connectionKey, {
        workspaceId,
        browser,
        page,
        isConnecting: true
      });

      onStatusChange?.('navigating');
      
      // Navega para a página de login
      const loginUrl = PLATFORM_LOGIN_URLS[platform];
      await page.goto(loginUrl, { waitUntil: 'networkidle2' });

      onStatusChange?.('waiting_login');

      // Monitora navegação para detectar login bem-sucedido
      this.monitorLogin(connectionKey, platform, page, browser, onStatusChange, onSuccess, onError);

    } catch (error: any) {
      console.error(`❌ [SocialMedia] Erro ao conectar ${platform}:`, error);
      onError?.(error.message);
      this.closeConnection(connectionKey);
    }
  }

  /**
   * Monitora a página para detectar login bem-sucedido
   */
  private monitorLogin(
    connectionKey: string,
    platform: SocialPlatform,
    page: Page,
    browser: Browser,
    onStatusChange?: (status: string) => void,
    onSuccess?: (username: string) => void,
    onError?: (error: string) => void
  ): void {
    let checkInterval: NodeJS.Timeout | null = null;
    let isComplete = false;

    const cleanup = () => {
      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }
    };

    // Detecta quando navegador é fechado manualmente
    browser.on('disconnected', () => {
      cleanup();
      if (!isComplete) {
        console.log('🔌 [SocialMedia] Navegador fechado pelo usuário');
        this.closeConnection(connectionKey);
      }
    });

    // Verifica a URL periodicamente para detectar login
    checkInterval = setInterval(async () => {
      try {
        if (page.isClosed()) {
          cleanup();
          return;
        }

        const currentUrl = page.url();

        // Detecta login bem-sucedido baseado na URL
        let loggedIn = false;
        let username = '';

        if (platform === 'instagram') {
          if (currentUrl === 'https://www.instagram.com/' || 
              currentUrl.includes('instagram.com/feed') ||
              (currentUrl.includes('instagram.com') && 
               !currentUrl.includes('/login') && 
               !currentUrl.includes('/accounts/login') &&
               !currentUrl.includes('/challenge'))) {
            loggedIn = true;
            try {
              username = await page.evaluate(() => {
                const link = document.querySelector('a[href^="/"][href$="/"]');
                if (link) {
                  const href = link.getAttribute('href') || '';
                  const match = href.match(/^\/([^\/]+)\/$/);
                  if (match && !['explore', 'reels', 'direct'].includes(match[1])) {
                    return '@' + match[1];
                  }
                }
                return '@instagram_user';
              });
            } catch {
              username = '@instagram_user';
            }
          }
        }

        if (platform === 'tiktok') {
          if (currentUrl.includes('tiktok.com/foryou') || 
              (currentUrl.includes('tiktok.com/@') && !currentUrl.includes('/login'))) {
            loggedIn = true;
            username = '@tiktok_user';
          }
        }

        if (platform === 'youtube') {
          if (currentUrl === 'https://www.youtube.com/' || 
              currentUrl.includes('youtube.com/feed') ||
              (currentUrl.includes('youtube.com') && !currentUrl.includes('accounts.google.com'))) {
            loggedIn = true;
            username = 'YouTube Channel';
          }
        }

        if (loggedIn) {
          isComplete = true;
          cleanup();
          
          console.log(`✅ [SocialMedia] Login detectado para ${platform}: ${username}`);
          onStatusChange?.('saving_cookies');

          // Fecha o navegador
          await browser.close();
          this.connections.delete(connectionKey);

          onSuccess?.(username);
        }
      } catch (error) {
        // Ignora erros durante verificação
      }
    }, 2000);
  }

  /**
   * Cancela uma conexão em andamento
   */
  async cancelConnection(workspaceId: string, platform: SocialPlatform): Promise<void> {
    const connectionKey = `${workspaceId}-${platform}`;
    await this.closeConnection(connectionKey);
  }

  /**
   * Fecha uma conexão específica
   */
  private async closeConnection(connectionKey: string): Promise<void> {
    const connection = this.connections.get(connectionKey);
    if (connection) {
      try {
        if (connection.browser) {
          await connection.browser.close();
        }
      } catch (e) {
        // Ignora erros ao fechar
      }
      this.connections.delete(connectionKey);
      console.log(`🔌 [SocialMedia] Conexão ${connectionKey} fechada`);
    }
  }

  /**
   * Verifica se um workspace tem cookies salvos para uma plataforma
   */
  hasStoredCredentials(workspaceId: string, platform: SocialPlatform): boolean {
    // Com userDataDir, as credenciais ficam no perfil
    const userDataDir = this.getUserDataDir(workspaceId);
    return fs.existsSync(userDataDir);
  }

  /**
   * Remove cookies salvos de uma plataforma
   */
  removeCredentials(workspaceId: string, platform: SocialPlatform): void {
    const userDataDir = this.getUserDataDir(workspaceId);
    if (fs.existsSync(userDataDir)) {
      fs.rmSync(userDataDir, { recursive: true, force: true });
      console.log(`🗑️ [SocialMedia] Perfil removido para ${workspaceId}`);
    }
  }

  /**
   * Destrói o serviço e limpa recursos
   */
  async destroy(): Promise<void> {
    if (!this.isInitialized) return;
    
    // Fecha todas as conexões abertas
    for (const [key, connection] of this.connections) {
      try {
        if (connection.browser) {
          await connection.browser.close();
        }
      } catch (e) {
        // Ignora erros
      }
    }
    this.connections.clear();
    
    this.isInitialized = false;
    console.log('🛑 [SocialMedia] Service destroyed');
  }

  /**
   * Verifica se o serviço está inicializado
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

// Singleton para uso global
let socialMediaServiceInstance: SocialMediaService | null = null;

export function getSocialMediaService(): SocialMediaService {
  if (!socialMediaServiceInstance) {
    socialMediaServiceInstance = new SocialMediaService();
  }
  return socialMediaServiceInstance;
}

export function destroySocialMediaServiceInstance(): void {
  if (socialMediaServiceInstance) {
    socialMediaServiceInstance.destroy();
    socialMediaServiceInstance = null;
  }
}
