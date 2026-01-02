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
import { TikTok, createTikTokInstance } from '../libs/TikTok';
import { YouTube, createYouTubeInstance } from '../libs/YouTube';
import { Instagram, createInstagramInstance } from '../libs/Instagram';

// Adiciona o plugin stealth para evitar detecção
puppeteerExtra.use(StealthPlugin());

export type SocialPlatform = 'instagram' | 'tiktok' | 'youtube';

export interface ConnectedChannel {
  platform: SocialPlatform;
  username: string;
  avatarUrl?: string;
  connectedAt: number;
}

export interface WorkspaceConnection {
  workspaceId: string;
  browser: Browser | null;
  page: Page | null;
  isConnecting: boolean;
  platform?: SocialPlatform;
}

// Estrutura para armazenar status de login de cada plataforma
export interface PlatformLoginStatus {
  platform: SocialPlatform;
  isLoggedIn: boolean;
  username?: string;
  avatarUrl?: string;
}

// Resultado da verificação de login
export interface PlatformVerificationResult {
  platform: SocialPlatform;
  hasCredentials: boolean;  // Se tem cookies salvos
  isValid: boolean;         // Se o login ainda é válido
  needsRelogin: boolean;    // Se precisa fazer login novamente
  username?: string;
  avatarUrl?: string;
  error?: string;
}

// URLs de login para cada plataforma
const PLATFORM_LOGIN_URLS: Record<SocialPlatform, string> = {
  instagram: 'https://www.instagram.com/accounts/login/',
  tiktok: 'https://www.tiktok.com/tiktokstudio/upload?from=webapp',
  youtube: 'https://studio.youtube.com/'
};

// URLs para verificar login
const PLATFORM_CHECK_URLS: Record<SocialPlatform, string> = {
  instagram: 'https://www.instagram.com/',
  tiktok: 'https://www.tiktok.com/tiktokstudio',
  youtube: 'https://studio.youtube.com/'
};

export class SocialMediaService {
  private isInitialized = false;
  private connections: Map<string, WorkspaceConnection> = new Map();
  private cookiesDir: string;
  private workspaceBrowsers: Map<string, Browser> = new Map(); // Browser compartilhado por workspace
  private youtubeInstances: Map<string, YouTube> = new Map(); // Instâncias YouTube por workspace
  private tiktokInstances: Map<string, TikTok> = new Map(); // Instâncias TikTok por workspace
  private instagramInstances: Map<string, Instagram> = new Map(); // Instâncias Instagram por workspace

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

  /**
   * Retorna o caminho do arquivo de cookies para uma plataforma
   * Salva dentro da pasta do workspace
   */
  private getCookiesPath(workspaceId: string, platform: SocialPlatform): string {
    return path.join(this.getUserDataDir(workspaceId), `cookies-${platform}.json`);
  }

  /**
   * Retorna o diretório de dados do usuário para um workspace
   * COMPARTILHADO entre todas as plataformas
   */
  private getUserDataDir(workspaceId: string): string {
    return path.join(this.cookiesDir, 'profiles', workspaceId);
  }

  /**
   * Salva cookies de uma página para uma plataforma específica
   */
  private async saveCookies(page: Page, workspaceId: string, platform: SocialPlatform): Promise<void> {
    try {
      const cookies = await page.cookies();
      const cookiesPath = this.getCookiesPath(workspaceId, platform);
      
      // Garante que o diretório existe
      const cookiesDirectory = path.dirname(cookiesPath);
      if (!fs.existsSync(cookiesDirectory)) {
        fs.mkdirSync(cookiesDirectory, { recursive: true });
      }
      
      fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
      console.log(`🍪 [SocialMedia] Cookies salvos para ${platform}`);
    } catch (error) {
      console.warn(`⚠️ [SocialMedia] Erro ao salvar cookies para ${platform}:`, error);
    }
  }

  /**
   * Carrega cookies salvos para uma plataforma específica
   */
  private async loadCookies(page: Page, workspaceId: string, platform: SocialPlatform): Promise<boolean> {
    try {
      const cookiesPath = this.getCookiesPath(workspaceId, platform);
      
      if (fs.existsSync(cookiesPath)) {
        const cookiesStr = fs.readFileSync(cookiesPath, 'utf8');
        const cookies = JSON.parse(cookiesStr);
        await page.setCookie(...cookies);
        console.log(`🍪 [SocialMedia] Cookies carregados para ${platform}`);
        return true;
      }
    } catch (error) {
      console.warn(`⚠️ [SocialMedia] Erro ao carregar cookies para ${platform}:`, error);
    }
    return false;
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
   * Conecta ao YouTube usando a lib YouTube.ts
   */
  private async connectYouTube(
    workspaceId: string,
    onStatusChange?: (status: string) => void,
    onSuccess?: (username: string) => void,
    onError?: (error: string) => void
  ): Promise<void> {
    try {
      onStatusChange?.('launching');
      console.log('🚀 [SocialMedia] Iniciando YouTube via lib...');

      // Cria ou reutiliza instância do YouTube
      let youtube = this.youtubeInstances.get(workspaceId);
      
      if (!youtube) {
        youtube = createYouTubeInstance(workspaceId, {
          userDataDir: this.getUserDataDir(workspaceId),
          headless: false
        });
        this.youtubeInstances.set(workspaceId, youtube);
      }

      // Inicializa o navegador
      await youtube.init();

      onStatusChange?.('navigating');

      // Navega para o YouTube Studio e verifica login
      const isLoggedIn = await youtube.goToStudio();

      if (isLoggedIn) {
        console.log('✅ [SocialMedia] YouTube já está logado!');
        
        // Busca informações do canal
        const channelInfo = await youtube.getChannelInfo();
        const username = channelInfo?.name || channelInfo?.handle || 'YouTube Channel';
        
        onStatusChange?.('saving_cookies');
        
        // Salva cookies
        const page = youtube.getPage();
        if (page) {
          await this.saveCookies(page, workspaceId, 'youtube');
        }
        
        // Fecha o navegador
        await youtube.close();
        this.youtubeInstances.delete(workspaceId);
        
        onSuccess?.(username);
      } else {
        console.log('🔐 [SocialMedia] YouTube precisa de login...');
        onStatusChange?.('waiting_login');
        
        // Aguarda o usuário fazer login (5 minutos de timeout)
        const loginSuccess = await youtube.waitForLogin(300000);
        
        if (loginSuccess) {
          // Busca informações do canal
          const channelInfo = await youtube.getChannelInfo();
          const username = channelInfo?.name || channelInfo?.handle || 'YouTube Channel';
          
          onStatusChange?.('saving_cookies');
          
          // Salva cookies
          const page = youtube.getPage();
          if (page) {
            await this.saveCookies(page, workspaceId, 'youtube');
          }
          
          // Fecha o navegador
          await youtube.close();
          this.youtubeInstances.delete(workspaceId);
          
          onSuccess?.(username);
        } else {
          await youtube.close();
          this.youtubeInstances.delete(workspaceId);
          onError?.('Timeout aguardando login do YouTube');
        }
      }
    } catch (error: any) {
      console.error('❌ [SocialMedia] Erro ao conectar YouTube:', error);
      
      // Limpa instância em caso de erro
      const youtube = this.youtubeInstances.get(workspaceId);
      if (youtube) {
        await youtube.close();
        this.youtubeInstances.delete(workspaceId);
      }
      
      onError?.(error?.message || 'Erro ao conectar YouTube');
    }
  }

  /**
   * Conecta ao TikTok usando a lib TikTok.ts
   */
  private async connectTikTok(
    workspaceId: string,
    onStatusChange?: (status: string) => void,
    onSuccess?: (username: string) => void,
    onError?: (error: string) => void
  ): Promise<void> {
    try {
      onStatusChange?.('launching');
      console.log('🚀 [SocialMedia] Iniciando TikTok via lib...');

      // Cria ou reutiliza instância do TikTok
      let tiktok = this.tiktokInstances.get(workspaceId);
      
      if (!tiktok) {
        tiktok = createTikTokInstance(workspaceId, {
          userDataDir: this.getUserDataDir(workspaceId),
          headless: false
        });
        this.tiktokInstances.set(workspaceId, tiktok);
      }

      // Inicializa o navegador
      await tiktok.init();

      onStatusChange?.('navigating');

      // Navega para o TikTok Studio e verifica login
      const isLoggedIn = await tiktok.goToStudio();

      if (isLoggedIn) {
        console.log('✅ [SocialMedia] TikTok já está logado!');
        
        // Pega o username
        const username = tiktok.getUsername();
        
        onStatusChange?.('saving_cookies');
        
        // Salva cookies
        const page = tiktok.getPage();
        if (page) {
          await this.saveCookies(page, workspaceId, 'tiktok');
        }
        
        // Fecha o navegador
        await tiktok.close();
        this.tiktokInstances.delete(workspaceId);
        
        onSuccess?.(username);
      } else {
        console.log('🔐 [SocialMedia] TikTok precisa de login...');
        onStatusChange?.('waiting_login');
        
        // Aguarda o usuário fazer login (5 minutos de timeout)
        const loginSuccess = await tiktok.waitForLogin(300000);
        
        if (loginSuccess) {
          // Pega o username
          const username = tiktok.getUsername();
          
          onStatusChange?.('saving_cookies');
          
          // Salva cookies
          const page = tiktok.getPage();
          if (page) {
            await this.saveCookies(page, workspaceId, 'tiktok');
          }
          
          // Fecha o navegador
          await tiktok.close();
          this.tiktokInstances.delete(workspaceId);
          
          onSuccess?.(username);
        } else {
          await tiktok.close();
          this.tiktokInstances.delete(workspaceId);
          onError?.('Timeout aguardando login do TikTok');
        }
      }
    } catch (error: any) {
      console.error('❌ [SocialMedia] Erro ao conectar TikTok:', error);
      
      // Limpa instância em caso de erro
      const tiktok = this.tiktokInstances.get(workspaceId);
      if (tiktok) {
        await tiktok.close();
        this.tiktokInstances.delete(workspaceId);
      }
      
      onError?.(error?.message || 'Erro ao conectar TikTok');
    }
  }

  /**
   * Conecta ao Instagram usando a lib Instagram.ts
   */
  private async connectInstagram(
    workspaceId: string,
    onStatusChange?: (status: string) => void,
    onSuccess?: (username: string) => void,
    onError?: (error: string) => void
  ): Promise<void> {
    try {
      onStatusChange?.('launching');
      console.log('🚀 [SocialMedia] Iniciando Instagram via lib...');

      // Cria ou reutiliza instância do Instagram
      let instagram = this.instagramInstances.get(workspaceId);
      
      if (!instagram) {
        instagram = createInstagramInstance(workspaceId, {
          userDataDir: this.getUserDataDir(workspaceId),
          headless: false
        });
        this.instagramInstances.set(workspaceId, instagram);
      }

      // Inicializa o navegador
      await instagram.init();

      onStatusChange?.('navigating');

      // Navega para o Instagram e verifica login
      const isLoggedIn = await instagram.goToInstagram();

      if (isLoggedIn) {
        console.log('✅ [SocialMedia] Instagram já está logado!');
        
        // Pega o username
        const username = instagram.getUsername();
        
        onStatusChange?.('saving_cookies');
        
        // Salva cookies
        const page = instagram.getPage();
        if (page) {
          await this.saveCookies(page, workspaceId, 'instagram');
        }
        
        // Fecha o navegador
        await instagram.close();
        this.instagramInstances.delete(workspaceId);
        
        onSuccess?.(username);
      } else {
        console.log('🔐 [SocialMedia] Instagram precisa de login...');
        onStatusChange?.('waiting_login');
        
        // Aguarda o usuário fazer login (5 minutos de timeout)
        const loginSuccess = await instagram.waitForLogin(300000);
        
        if (loginSuccess) {
          // Pega o username
          const username = instagram.getUsername();
          
          onStatusChange?.('saving_cookies');
          
          // Salva cookies
          const page = instagram.getPage();
          if (page) {
            await this.saveCookies(page, workspaceId, 'instagram');
          }
          
          // Fecha o navegador
          await instagram.close();
          this.instagramInstances.delete(workspaceId);
          
          onSuccess?.(username);
        } else {
          await instagram.close();
          this.instagramInstances.delete(workspaceId);
          onError?.('Timeout aguardando login do Instagram');
        }
      }
    } catch (error: any) {
      console.error('❌ [SocialMedia] Erro ao conectar Instagram:', error);
      
      // Limpa instância em caso de erro
      const instagram = this.instagramInstances.get(workspaceId);
      if (instagram) {
        await instagram.close();
        this.instagramInstances.delete(workspaceId);
      }
      
      onError?.(error?.message || 'Erro ao conectar Instagram');
    }
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

    // Para YouTube, usa a lib YouTube.ts
    if (platform === 'youtube') {
      await this.connectYouTube(workspaceId, onStatusChange, onSuccess, onError);
      return;
    }

    // Para TikTok, usa a lib TikTok.ts
    if (platform === 'tiktok') {
      await this.connectTikTok(workspaceId, onStatusChange, onSuccess, onError);
      return;
    }

    // Para Instagram, usa a lib Instagram.ts
    if (platform === 'instagram') {
      await this.connectInstagram(workspaceId, onStatusChange, onSuccess, onError);
      return;
    }

    // Fallback para outras plataformas (não deveria chegar aqui)
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
      this.monitorLogin(workspaceId, connectionKey, platform, page, browser, onStatusChange, onSuccess, onError);

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
    workspaceId: string,
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
    let isProcessing = false;
    checkInterval = setInterval(async () => {
      try {
        // Se já completou ou está processando, não faz nada
        if (isComplete || isProcessing) {
          if (isComplete) cleanup();
          return;
        }

        if (page.isClosed()) {
          cleanup();
          return;
        }

        isProcessing = true; // Marca como processando

        const currentUrl = page.url();

        // Detecta login bem-sucedido baseado na URL
        let loggedIn = false;
        let username = '';

        // Nota: Instagram agora é tratado por connectInstagram() usando a lib Instagram.ts
        // Este bloco não deve ser alcançado para Instagram

        // Nota: TikTok agora é tratado por connectTikTok() usando a lib TikTok.ts
        // Este bloco não deve ser alcançado para TikTok

        // Nota: YouTube agora é tratado por connectYouTube() usando a lib YouTube.ts
        // Este bloco não deve ser alcançado para YouTube

        if (loggedIn) {
          isComplete = true;
          cleanup();
          
          console.log(`✅ [SocialMedia] Login detectado para ${platform}: ${username}`);
          onStatusChange?.('saving_cookies');

          // Salva cookies da plataforma
          await this.saveCookies(page, workspaceId, platform);

          // Fecha o navegador
          await browser.close();
          this.connections.delete(connectionKey);

          onSuccess?.(username);
        }
        
        isProcessing = false; // Libera para próxima iteração
      } catch (error) {
        isProcessing = false; // Libera mesmo em caso de erro
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
   * Verifica se um workspace tem credenciais salvas para uma plataforma
   * Verifica APENAS o arquivo de cookies (não o userDataDir que é compartilhado)
   */
  hasStoredCredentials(workspaceId: string, platform: SocialPlatform): boolean {
    const cookiesPath = this.getCookiesPath(workspaceId, platform);
    return fs.existsSync(cookiesPath);
  }

  /**
   * Remove credenciais salvas de uma plataforma específica
   */
  removeCredentials(workspaceId: string, platform: SocialPlatform): void {
    // Remove o arquivo de cookies da plataforma
    const cookiesPath = this.getCookiesPath(workspaceId, platform);
    if (fs.existsSync(cookiesPath)) {
      fs.rmSync(cookiesPath);
      console.log(`🗑️ [SocialMedia] Cookies removidos para ${workspaceId}-${platform}`);
    }
    
    // Nota: Ó userDataDir é compartilhado, então não removemos ele aqui
    // Os cookies são suficientes para desconectar a plataforma
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
   * Abre o navegador para ver a conta conectada
   */
  async openBrowser(workspaceId: string, platform: SocialPlatform): Promise<void> {
    // Verifica se tem credenciais
    if (!this.hasStoredCredentials(workspaceId, platform)) {
      throw new Error('Nenhuma conta conectada para esta plataforma');
    }

    console.log(`🌐 [SocialMedia] Abrindo navegador para ${platform}...`);

    const chromePath = this.findChromePath();
    const userDataDir = this.getUserDataDir(workspaceId);

    // URLs para abrir cada plataforma
    const platformUrls: Record<SocialPlatform, string> = {
      instagram: 'https://www.instagram.com/',
      tiktok: 'https://www.tiktok.com/tiktokstudio',
      youtube: 'https://studio.youtube.com/'
    };

    const launchOptions: any = {
      headless: false,
      userDataDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--lang=pt-BR',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    };

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
    });

    // Navega para a plataforma
    await page.goto(platformUrls[platform], { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });

    console.log(`✅ [SocialMedia] Navegador aberto para ${platform}`);
  }

  /**
   * Verifica se o serviço está inicializado
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Retorna lista de plataformas que têm cookies salvos para um workspace
   */
  getStoredPlatforms(workspaceId: string): SocialPlatform[] {
    const platforms: SocialPlatform[] = ['instagram', 'tiktok', 'youtube'];
    const storedPlatforms: SocialPlatform[] = [];

    for (const platform of platforms) {
      const cookiesPath = this.getCookiesPath(workspaceId, platform);
      if (fs.existsSync(cookiesPath)) {
        storedPlatforms.push(platform);
      }
    }

    console.log(`📁 [SocialMedia] Plataformas com cookies para ${workspaceId}:`, storedPlatforms);
    return storedPlatforms;
  }

  /**
   * Verifica o login de uma plataforma específica em modo headless
   */
  async verifyPlatformLogin(workspaceId: string, platform: SocialPlatform): Promise<PlatformVerificationResult> {
    const cookiesPath = this.getCookiesPath(workspaceId, platform);
    const hasCredentials = fs.existsSync(cookiesPath);

    if (!hasCredentials) {
      return {
        platform,
        hasCredentials: false,
        isValid: false,
        needsRelogin: false
      };
    }

    console.log(`🔍 [SocialMedia] Verificando login de ${platform}...`);

    try {
      let isValid = false;
      let username: string | undefined;
      let avatarUrl: string | undefined;

      if (platform === 'youtube') {
        const youtube = createYouTubeInstance(workspaceId, {
          userDataDir: this.getUserDataDir(workspaceId),
          headless: true
        });
        
        await youtube.init();
        
        // Carrega cookies
        const page = youtube.getPage();
        if (page) {
          await this.loadCookies(page, workspaceId, platform);
        }
        
        // Navega para o Studio e verifica login
        isValid = await youtube.goToStudio();
        
        if (isValid) {
          const channelInfo = await youtube.getChannelInfo();
          if (channelInfo) {
            username = channelInfo.name;
            avatarUrl = channelInfo.avatarUrl;
          }
        }
        
        await youtube.close();
      } else if (platform === 'tiktok') {
        const tiktok = createTikTokInstance(workspaceId, {
          userDataDir: this.getUserDataDir(workspaceId),
          headless: true
        });
        
        await tiktok.init();
        
        // Carrega cookies
        const page = tiktok.getPage();
        if (page) {
          await this.loadCookies(page, workspaceId, platform);
        }
        
        // Navega para o Studio e verifica login
        isValid = await tiktok.goToStudio();
        
        if (isValid) {
          username = tiktok.getUsername();
        }
        
        await tiktok.close();
      } else if (platform === 'instagram') {
        const instagram = createInstagramInstance(workspaceId, {
          userDataDir: this.getUserDataDir(workspaceId),
          headless: true
        });
        
        await instagram.init();
        
        // Carrega cookies
        const page = instagram.getPage();
        if (page) {
          await this.loadCookies(page, workspaceId, platform);
        }
        
        // Navega e verifica login
        isValid = await instagram.goToInstagram();
        
        if (isValid) {
          username = instagram.getUsername();
        }
        
        await instagram.close();
      }

      console.log(`${isValid ? '✅' : '⚠️'} [SocialMedia] ${platform}: ${isValid ? 'login válido' : 'precisa relogar'}`);

      return {
        platform,
        hasCredentials: true,
        isValid,
        needsRelogin: !isValid,
        username,
        avatarUrl
      };

    } catch (error: any) {
      console.error(`❌ [SocialMedia] Erro ao verificar ${platform}:`, error?.message || error);
      return {
        platform,
        hasCredentials: true,
        isValid: false,
        needsRelogin: true,
        error: error?.message || 'Erro desconhecido'
      };
    }
  }

  /**
   * Verifica o login de todas as plataformas com cookies salvos para um workspace
   */
  async verifyAllPlatforms(workspaceId: string): Promise<PlatformVerificationResult[]> {
    console.log(`🔄 [SocialMedia] Verificando todas as plataformas para ${workspaceId}...`);
    
    const storedPlatforms = this.getStoredPlatforms(workspaceId);
    const results: PlatformVerificationResult[] = [];

    // Verifica cada plataforma em sequência para evitar conflitos
    for (const platform of storedPlatforms) {
      const result = await this.verifyPlatformLogin(workspaceId, platform);
      results.push(result);
    }

    console.log(`📊 [SocialMedia] Verificação concluída:`, results.map(r => `${r.platform}: ${r.isValid ? '✅' : '⚠️'}`));
    return results;
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
