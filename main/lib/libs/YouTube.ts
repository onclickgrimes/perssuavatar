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
        waitUntil: 'load',
        timeout: 30000 
      });

      await this.randomDelay(2000, 3000);

      // Verifica se está na página de "navegador incompatível"
      // Mensagem: "Melhore sua experiência" com link "PULAR PARA O YOUTUBE STUDIO"
      const pageContent = await this.page.content();
      if (pageContent.includes('Melhore sua experiência') || 
          pageContent.includes('PULAR PARA O YOUTUBE STUDIO') ||
          pageContent.includes('browser is not supported') ||
          pageContent.includes('SKIP TO YOUTUBE STUDIO')) {
        console.log('⚠️ [YouTube] Página de navegador incompatível detectada, pulando...');
        
        // Tenta clicar no link para pular
        try {
          // Procura pelo link "PULAR PARA O YOUTUBE STUDIO" ou "SKIP TO YOUTUBE STUDIO"
          const skipLink = await this.page.$('a[href*="studio.youtube.com"]');
          if (skipLink) {
            await skipLink.click();
            await this.randomDelay(3000, 5000);
            console.log('✅ [YouTube] Página de incompatibilidade pulada');
          } else {
            // Fallback: procura por texto
            await this.page.evaluate(() => {
              const links = document.querySelectorAll('a');
              for (const link of links) {
                if (link.textContent?.includes('PULAR') || 
                    link.textContent?.includes('SKIP') ||
                    link.textContent?.includes('YOUTUBE STUDIO')) {
                  link.click();
                  break;
                }
              }
            });
            await this.randomDelay(3000, 5000);
          }
        } catch (error) {
          console.warn('⚠️ [YouTube] Não foi possível pular página de incompatibilidade');
        }
      }

      // Verifica e lida com popup de seleção de canal
      await this.handleChannelSwitcherPopup();

      // Verifica se está logado
      this._isLoggedIn = await this.checkLoginStatus();
      
      return this._isLoggedIn;
    } catch (error) {
      console.error('❌ [YouTube] Erro ao navegar para Studio:', error);
      return false;
    }
  }

  /**
   * Lida com o popup de seleção de canal do YouTube
   * Se detectado em modo headless, reabre o navegador em modo visível para o usuário selecionar
   */
  private async handleChannelSwitcherPopup(): Promise<void> {
    if (!this.page) return;

    try {
      // Verifica se o popup de seleção de canal está presente
      const channelSwitcherSelector = 'ytd-channel-switcher-renderer[dialog="true"]';
      const channelSwitcher = await this.page.$(channelSwitcherSelector);

      if (!channelSwitcher) {
        // Popup não está presente, continua normalmente
        return;
      }

      console.log('📋 [YouTube] Popup de seleção de canal detectado');

      // Se estiver em modo headless, precisa reabrir em modo visível
      if (this.config.headless) {
        console.log('🔄 [YouTube] Reabrindo navegador em modo visível para seleção de canal...');
        
        // Fecha o navegador headless atual
        await this.close();
        
        // Reabre em modo visível
        this.config.headless = false;
        await this.init();
        
        // Navega novamente para o Studio
        await this.page!.goto(YouTube.STUDIO_URL, { 
          waitUntil: 'load',
          timeout: 30000 
        });
        
        await this.randomDelay(2000, 3000);
      }

      // Injeta um banner de instrução na página
      await this.injectChannelSelectionBanner();

      // Aguarda o usuário selecionar o canal (popup desaparecer)
      console.log('⏳ [YouTube] Aguardando usuário selecionar o canal...');
      await this.waitForChannelSelection();

    } catch (error) {
      console.warn('⚠️ [YouTube] Erro ao lidar com popup de seleção de canal:', error);
    }
  }

  /**
   * Injeta um banner de instrução para o usuário selecionar o canal
   */
  private async injectChannelSelectionBanner(): Promise<void> {
    if (!this.page) return;

    try {
      await this.page.evaluate(() => {
        // Remove banner existente se houver
        const existingBanner = document.getElementById('channel-selection-banner');
        if (existingBanner) existingBanner.remove();

        // Cria o banner
        const banner = document.createElement('div');
        banner.id = 'channel-selection-banner';
        banner.innerHTML = `
          <div style="
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 999999;
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: white;
            padding: 16px 24px;
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 16px;
            font-weight: 500;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
          ">
            <span style="font-size: 24px;">📺</span>
            <span>
              <strong>Selecione o canal</strong> que você deseja usar e marque 
              <strong>"Não perguntar novamente"</strong> para salvar sua escolha.
            </span>
            <span style="font-size: 24px;">👇</span>
          </div>
        `;
        document.body.appendChild(banner);
      });

      console.log('✅ [YouTube] Banner de instrução injetado');
    } catch (error) {
      console.warn('⚠️ [YouTube] Não foi possível injetar o banner:', error);
    }
  }

  /**
   * Aguarda o usuário selecionar um canal (popup desaparecer)
   */
  private async waitForChannelSelection(timeoutMs: number = 120000): Promise<boolean> {
    if (!this.page) return false;

    const startTime = Date.now();
    const checkInterval = 2000;
    const channelSwitcherSelector = 'ytd-channel-switcher-renderer[dialog="true"]';

    while (Date.now() - startTime < timeoutMs) {
      try {
        const popup = await this.page.$(channelSwitcherSelector);
        
        if (!popup) {
          // Popup desapareceu - usuário selecionou o canal
          console.log('✅ [YouTube] Canal selecionado pelo usuário');
          
          // Remove o banner
          await this.page.evaluate(() => {
            const banner = document.getElementById('channel-selection-banner');
            if (banner) banner.remove();
          });

          // Aguarda mais tempo para garantir que o YouTube salvou a preferência
          console.log('⏳ [YouTube] Aguardando persistência da seleção...');
          await this.randomDelay(3000, 5000);

          // Navega para o dashboard para forçar o salvamento dos cookies
          console.log('🔄 [YouTube] Navegando para dashboard para persistir escolha...');
          await this.page.goto('https://studio.youtube.com/', { 
            waitUntil: 'networkidle2',
            timeout: 30000 
          });

          await this.randomDelay(3000, 5000);

          // Verifica se ainda aparece o popup (se sim, a seleção não foi salva)
          const popupAfterNav = await this.page.$(channelSwitcherSelector);
          if (popupAfterNav) {
            console.log('⚠️ [YouTube] Popup apareceu novamente, aguardando nova seleção...');
            // Injeta banner novamente
            await this.injectChannelSelectionBanner();
            continue;
          }

          console.log('✅ [YouTube] Seleção de canal persistida com sucesso');
          return true;
        }
      } catch (error) {
        // Ignora erros durante a verificação
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    console.log('⚠️ [YouTube] Timeout aguardando seleção de canal');
    return false;
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

      // Debug: tira screenshot e loga URL quando status é incerto
      console.log('⚠️ [YouTube] Status de login incerto');
      console.log(`📍 [YouTube] URL atual: ${currentUrl}`);
      await this.takeScreenshot('youtube-login-status-debug');
      
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
   * Extrai nome e avatar do elemento de thumbnail na navigation-drawer
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

      // await this.randomDelay(2000, 3000);

      // Obtém o HTML da página
      const pageContent = await this.page.content();
      
      let name: string | undefined;
      let avatarUrl: string | undefined;
      let handle: string | undefined;

      // Método 1: Busca pela imagem do thumbnail na navigation-drawer
      // <img class="thumbnail image-thumbnail style-scope ytcp-navigation-drawer" alt="Nome do Canal" src="https://...">
      const thumbnailMatch = pageContent.match(/<img[^>]*class="[^"]*thumbnail[^"]*image-thumbnail[^"]*ytcp-navigation-drawer[^"]*"[^>]*alt="([^"]+)"[^>]*src="([^"]+)"[^>]*>/);
      
      if (thumbnailMatch && thumbnailMatch[1]) {
        name = thumbnailMatch[1];
        avatarUrl = thumbnailMatch[2];
        console.log(`✅ [YouTube] Canal encontrado via thumbnail: ${name}`);
      }

      // Método 2: Tenta outra ordem de atributos (src antes de alt)
      if (!name) {
        const altMatch = pageContent.match(/<img[^>]*class="[^"]*thumbnail[^"]*image-thumbnail[^"]*"[^>]*alt="([^"]+)"[^>]*>/);
        if (altMatch && altMatch[1]) {
          name = altMatch[1];
          console.log(`✅ [YouTube] Canal encontrado via alt: ${name}`);
        }
      }

      // Método 3: Busca pelo channel name em JSON
      if (!name) {
        const channelMatch = pageContent.match(/"channelName"\s*:\s*"([^"]+)"/);
        if (channelMatch && channelMatch[1]) {
          name = channelMatch[1];
          console.log(`✅ [YouTube] Canal encontrado via JSON: ${name}`);
        }
      }

      // Método 4: Busca pelo channel-handle
      const handleMatch = pageContent.match(/id="channel-handle"[^>]*>(@[^<]+)</);
      if (handleMatch && handleMatch[1]) {
        handle = handleMatch[1];
        console.log(`✅ [YouTube] Handle encontrado: ${handle}`);
      }

      // Fallback para nome
      if (!name) {
        name = 'YouTube Channel';
      }

      const channelInfo: ChannelInfo = {
        name,
        handle,
        avatarUrl
      };

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
  // MÉTODOS PÚBLICOS - UPLOAD
  // ========================================

  /**
   * Faz upload de um vídeo para o YouTube
   * @param videoPath Caminho do arquivo de vídeo
   * @param title Título do vídeo
   * @param description Descrição do vídeo (opcional)
   * @param visibility Visibilidade do vídeo: 'PUBLIC', 'PRIVATE', 'UNLISTED' (padrão: 'PUBLIC')
   */
  async uploadVideo(
    videoPath: string, 
    title: string, 
    description?: string,
    visibility: 'PUBLIC' | 'PRIVATE' | 'UNLISTED' = 'PUBLIC'
  ): Promise<boolean> {
    if (!this._isLoggedIn || !this.page) {
      throw new Error('Usuário não está logado no YouTube');
    }

    try {
      console.log(`📹 [YouTube] Iniciando upload do vídeo: ${videoPath}`);
      console.log(`📝 [YouTube] Título: ${title}`);

      // Navega para a página de upload
      console.log('🌐 [YouTube] Navegando para página de upload...');
      await this.page.goto('https://www.youtube.com/upload', { 
        waitUntil: 'networkidle2',
        timeout: 60000 
      });
      await this.randomDelay(2000, 3000);

      // Espera o input de arquivo aparecer
      console.log('⏳ [YouTube] Aguardando campo de upload...');
      const fileInputSelector = 'input[type="file"][name="Filedata"]';
      await this.page.waitForSelector(fileInputSelector, { timeout: 30000 });

      // Faz o upload do arquivo
      console.log('📤 [YouTube] Fazendo upload do arquivo...');
      const fileInput = await this.page.$(fileInputSelector);
      if (!fileInput) {
        throw new Error('Campo de upload não encontrado');
      }
      await fileInput.uploadFile(videoPath);
      
      // Aguarda o processamento inicial do upload
      console.log('⏳ [YouTube] Aguardando processamento do upload...');
      await this.randomDelay(5000, 8000);

      // Preenche o título
      console.log('📝 [YouTube] Preenchendo título...');
      const titleSelector = '#textbox[aria-label*="título"]';
      try {
        await this.page.waitForSelector(titleSelector, { timeout: 15000 });
        const titleInput = await this.page.$(titleSelector);
        if (titleInput) {
          // Limpa o título existente (se houver)
          await titleInput.click({ clickCount: 3 });
          await this.page.keyboard.press('Backspace');
          await this.randomDelay(500, 1000);
          // Digita o novo título
          await this.page.keyboard.type(title, { delay: 30 });
          await this.randomDelay(1000, 2000);
        }
      } catch (error) {
        console.warn('⚠️ [YouTube] Não foi possível preencher o título:', error);
      }

      // Preenche a descrição (se fornecida)
      if (description) {
        console.log('📝 [YouTube] Preenchendo descrição...');
        const descriptionSelector = '#textbox[aria-label*="Fale sobre seu vídeo"], #textbox[aria-label*="description"]';
        try {
          const descriptionInput = await this.page.$(descriptionSelector);
          if (descriptionInput) {
            await descriptionInput.click();
            await this.randomDelay(500, 1000);
            await this.page.keyboard.type(description, { delay: 20 });
            await this.randomDelay(1000, 2000);
          }
        } catch (error) {
          console.warn('⚠️ [YouTube] Não foi possível preencher a descrição:', error);
        }
      }

      // Seleciona "Não é conteúdo para crianças"
      console.log('🔞 [YouTube] Selecionando "Não é conteúdo para crianças"...');
      try {
        // O seletor correto para o radio button de "Não é conteúdo para crianças"
        const notForKidsSelector = 'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]';
        await this.page.waitForSelector(notForKidsSelector, { timeout: 15000 });
        await this.page.click(notForKidsSelector);
        await this.randomDelay(1000, 2000);
        console.log('✅ [YouTube] Classificação etária selecionada');
      } catch (error) {
        console.warn('⚠️ [YouTube] Não foi possível selecionar classificação etária:', error);
        // Tenta método alternativo via JavaScript
        try {
          await this.page.evaluate(() => {
            const radioButtons = document.querySelectorAll('tp-yt-paper-radio-button');
            for (const btn of radioButtons) {
              const name = btn.getAttribute('name') || '';
              if (name.includes('NOT_MFK') || name.includes('NOT_MADE_FOR_KIDS')) {
                (btn as HTMLElement).click();
                console.log('Clicado via fallback:', name);
                break;
              }
            }
          });
          await this.randomDelay(1000, 2000);
          console.log('✅ [YouTube] Classificação etária selecionada (fallback)');
        } catch (e) {
          console.warn('⚠️ [YouTube] Método alternativo também falhou');
        }
      }

      // Clica em "Avançar" 3 vezes
      console.log('➡️ [YouTube] Avançando etapas...');
      for (let i = 0; i < 3; i++) {
        await this.randomDelay(2000, 3000);
        try {
          // Tenta pelo aria-label
          const nextButton = await this.page.$('button[aria-label="Avançar"], button[aria-label="Next"]');
          if (nextButton) {
            await nextButton.click();
            console.log(`✅ [YouTube] Avançar ${i + 1}/3 clicado`);
          } else {
            // Fallback: procura pelo texto
            await this.page.evaluate(() => {
              const buttons = document.querySelectorAll('button');
              for (const btn of buttons) {
                if (btn.textContent?.includes('Avançar') || btn.textContent?.includes('Next')) {
                  btn.click();
                  break;
                }
              }
            });
            console.log(`✅ [YouTube] Avançar ${i + 1}/3 clicado (fallback)`);
          }
        } catch (error) {
          console.warn(`⚠️ [YouTube] Erro ao clicar em Avançar ${i + 1}:`, error);
        }
      }

      // Seleciona a visibilidade
      console.log(`🔓 [YouTube] Selecionando visibilidade: ${visibility}...`);
      await this.randomDelay(2000, 3000);
      try {
        const visibilitySelector = `tp-yt-paper-radio-button[name="${visibility}"]`;
        await this.page.waitForSelector(visibilitySelector, { timeout: 10000 });
        await this.page.click(visibilitySelector);
        await this.randomDelay(1000, 2000);
      } catch (error) {
        console.warn('⚠️ [YouTube] Não foi possível selecionar visibilidade:', error);
        // Tenta método alternativo
        try {
          await this.page.evaluate((vis) => {
            const radioButtons = document.querySelectorAll('tp-yt-paper-radio-button');
            for (const btn of radioButtons) {
              if (btn.getAttribute('name') === vis) {
                (btn as HTMLElement).click();
                break;
              }
            }
          }, visibility);
        } catch (e) {
          console.warn('⚠️ [YouTube] Método alternativo também falhou');
        }
      }

      // Clica em "Publicar"
      console.log('🚀 [YouTube] Publicando vídeo...');
      await this.randomDelay(2000, 3000);
      try {
        const publishButton = await this.page.$('button[aria-label="Publicar"], button[aria-label="Publish"]');
        if (publishButton) {
          await publishButton.click();
        } else {
          // Fallback: procura pelo texto
          await this.page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
              if (btn.textContent?.includes('Publicar') || btn.textContent?.includes('Publish')) {
                btn.click();
                break;
              }
            }
          });
        }
        console.log('✅ [YouTube] Botão Publicar clicado');
      } catch (error) {
        console.error('❌ [YouTube] Erro ao clicar em Publicar:', error);
        throw error;
      }

      // Aguarda confirmação de publicação
      console.log('⏳ [YouTube] Aguardando confirmação de publicação...');
      await this.randomDelay(5000, 10000);

      // Verifica se houve sucesso (procura por diálogo de sucesso ou URL do vídeo)
      const currentUrl = this.page.url();
      const pageContent = await this.page.content();
      
      if (pageContent.includes('Vídeo publicado') || 
          pageContent.includes('Video published') ||
          pageContent.includes('processamento')) {
        console.log('✅ [YouTube] Vídeo publicado com sucesso!');
        return true;
      }

      console.log('✅ [YouTube] Upload concluído (verifique manualmente se foi publicado)');
      return true;

    } catch (error) {
      console.error('❌ [YouTube] Erro ao fazer upload do vídeo:', error);
      await this.takeScreenshot('upload-error');
      throw error;
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
