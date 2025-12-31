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
import { extractTikTokUsernameFromHTML } from '../libs/TikTok';

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
  tiktok: 'https://www.tiktok.com/tiktokstudio/upload?from=webapp',
  youtube: 'https://studio.youtube.com/'
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
   * Retorna o diretório de dados do usuário para um workspace e plataforma
   * Cada plataforma tem seu próprio perfil para permitir desconexão individual
   */
  private getUserDataDir(workspaceId: string, platform?: SocialPlatform): string {
    if (platform) {
      return path.join(this.cookiesDir, 'profiles', workspaceId, platform);
    }
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
      const userDataDir = this.getUserDataDir(workspaceId, platform);

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
          // TikTok: Se redirecionou para /login, não está logado (aguarda)
          // Se está no tiktokstudio, está logado e extrai username
          
          if (currentUrl.includes('tiktok.com/login')) {
            // Ainda não logado, aguarda usuário fazer login
            // não faz nada, continua monitorando
          } else if (currentUrl.includes('tiktok.com/tiktokstudio')) {
            // Está no TikTok Studio - extrai o username
            console.log('📍 [SocialMedia] TikTok Studio detectado, extraindo username...');
            
            // Aguarda um pouco para garantir que a página carregou
            await new Promise(r => setTimeout(r, 3000));
            
            try {
              // Pega o HTML da página
              const pageContent = await page.content();
              
              // Usa a função do TikTok.ts para extrair o username
              username = extractTikTokUsernameFromHTML(pageContent);
              
              if (username) {
                console.log(`✅ [SocialMedia] TikTok username extraído: ${username}`);
                loggedIn = true;
              } else {
                console.warn('⚠️ [SocialMedia] Não foi possível extrair username, usando fallback');
                loggedIn = true;
                username = '@tiktok_user';
              }
            } catch (e: any) {
              console.warn('⚠️ [SocialMedia] Erro ao extrair username do TikTok:', e?.message || e);
              loggedIn = true;
              username = '@tiktok_user';
            }
          }
        }

        if (platform === 'youtube') {
          // Se não está no Studio, navega para lá
          if (!currentUrl.includes('studio.youtube.com') && 
              (currentUrl === 'https://www.youtube.com/' || 
               currentUrl.includes('youtube.com/feed') ||
               (currentUrl.includes('youtube.com') && !currentUrl.includes('accounts.google.com')))) {
            
            console.log('� [SocialMedia] Navegando para YouTube Studio...');
            try {
              await page.goto('https://studio.youtube.com/', { 
                waitUntil: 'networkidle2',
                timeout: 30000 
              });
              // Sai desta iteração para processar na próxima
              isProcessing = false;
              return;
            } catch (e) {
              console.warn('⚠️ [SocialMedia] Erro ao navegar para YouTube Studio:', e);
              isProcessing = false;
            }
          }
          
          if (currentUrl.includes('studio.youtube.com')) {
            console.log('📍 [SocialMedia] YouTube Studio detectado, extraindo dados do canal...');
            
            // Aguarda um pouco para garantir que a página carregou
            await new Promise(r => setTimeout(r, 3000));
            
            try {
              // Tenta extrair o nome e avatar do canal da página
              const pageContent = await page.content();
              
              // Busca pela imagem do thumbnail na navigation-drawer
              // <img class="thumbnail image-thumbnail style-scope ytcp-navigation-drawer" alt="Anarchy IA" src="https://...">
              const thumbnailMatch = pageContent.match(/<img[^>]*class="[^"]*thumbnail[^"]*image-thumbnail[^"]*ytcp-navigation-drawer[^"]*"[^>]*alt="([^"]+)"[^>]*src="([^"]+)"[^>]*>/);
              
              if (thumbnailMatch && thumbnailMatch[1]) {
                username = thumbnailMatch[1]; // Nome do canal (alt)
                const avatarUrl = thumbnailMatch[2]; // URL do avatar (src)
                console.log(`✅ [SocialMedia] YouTube canal: ${username}`);
                console.log(`🖼️ [SocialMedia] YouTube avatar: ${avatarUrl}`);
              }
              
              // Fallback: tenta outra ordem de atributos (src antes de alt)
              if (!username) {
                const altMatch = pageContent.match(/<img[^>]*class="[^"]*thumbnail[^"]*image-thumbnail[^"]*"[^>]*alt="([^"]+)"[^>]*>/);
                if (altMatch && altMatch[1]) {
                  username = altMatch[1];
                  console.log(`✅ [SocialMedia] YouTube canal via alt: ${username}`);
                }
              }
              
              // Fallback: busca pelo channel name em JSON
              if (!username) {
                const channelMatch = pageContent.match(/"channelName"\s*:\s*"([^"]+)"/);
                if (channelMatch && channelMatch[1]) {
                  username = channelMatch[1];
                  console.log(`✅ [SocialMedia] YouTube canal via JSON: ${username}`);
                }
              }
              
              if (!username) {
                username = 'YouTube Channel';
              }
              
              loggedIn = true;
            } catch (e: any) {
              console.warn('⚠️ [SocialMedia] Erro ao extrair dados do YouTube:', e?.message || e);
              loggedIn = true;
              username = 'YouTube Channel';
            }
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
   */
  hasStoredCredentials(workspaceId: string, platform: SocialPlatform): boolean {
    const userDataDir = this.getUserDataDir(workspaceId, platform);
    return fs.existsSync(userDataDir);
  }

  /**
   * Remove credenciais salvas de uma plataforma específica
   */
  removeCredentials(workspaceId: string, platform: SocialPlatform): void {
    const userDataDir = this.getUserDataDir(workspaceId, platform);
    if (fs.existsSync(userDataDir)) {
      fs.rmSync(userDataDir, { recursive: true, force: true });
      console.log(`🗑️ [SocialMedia] Perfil removido para ${workspaceId}-${platform}`);
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
   * Abre o navegador para ver a conta conectada
   */
  async openBrowser(workspaceId: string, platform: SocialPlatform): Promise<void> {
    // Verifica se tem credenciais
    if (!this.hasStoredCredentials(workspaceId, platform)) {
      throw new Error('Nenhuma conta conectada para esta plataforma');
    }

    console.log(`🌐 [SocialMedia] Abrindo navegador para ${platform}...`);

    const chromePath = this.findChromePath();
    const userDataDir = this.getUserDataDir(workspaceId, platform);

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
