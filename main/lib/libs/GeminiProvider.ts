/**
 * Gemini Provider - Automação do Google Gemini via Puppeteer
 * 
 * Biblioteca para automação do Google Gemini via navegador.
 * Gerencia login, sessões e interações com o chat.
 * Inclui interceptação de respostas via CDP (Chrome DevTools Protocol).
 */

import puppeteer, { Browser, Page, CDPSession } from 'puppeteer';
import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { app, clipboard } from 'electron';
import http from 'http';

// ========================================
// INTERFACES
// ========================================

export interface GeminiProviderConfig {
  id: string;
  name: string;
  headless?: boolean;
  userDataDir?: string;
  viewport?: { width: number; height: number };
}

export interface GeminiUserInfo {
  email?: string;
  name?: string;
  avatarUrl?: string;
}

export type OnChunkCallback = (chunk: string) => void;
export type StreamCleanupFn = () => void;

// ========================================
// PARSER - Extrai texto dos pacotes do Gemini
// ========================================

/**
 * Extrai o texto limpo dos pacotes brutos do Gemini.
 * O Gemini envia dados em chunks com formato específico:
 * - Cada chunk tem um número de tamanho na primeira linha
 * - Seguido por um array JSON com estrutura [["wrb.fr", null, "payload"]]
 * - O texto está aninhado profundamente no payload
 * 
 * @param rawData - O corpo completo da resposta HTTP
 * @returns O texto acumulado ou null
 */
function parseGeminiPacket(rawData: string): string | null {
  try {
    // Remove o prefixo de segurança ")]}'" se existir
    let cleanData = rawData.replace(/^\)\]\}'/, '').trim();
    
    // Divide em chunks (cada chunk começa com um número de tamanho)
    // Formato: "160\n[["wrb.fr",...]]]\n926\n[["wrb.fr",...]]"
    const chunks: string[] = [];
    const lines = cleanData.split('\n');
    let currentChunk = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Se a linha é apenas um número, é o início de um novo chunk
      if (/^\d+$/.test(trimmed)) {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        currentChunk = '';
      } else if (trimmed) {
        currentChunk += trimmed;
      }
    }
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    let foundText: string | null = null;

    // Processa cada chunk
    for (const chunk of chunks) {
      try {
        // Tenta fazer parse do JSON
        if (!chunk.startsWith('[')) continue;
        
        const envelope = JSON.parse(chunk);
        if (!Array.isArray(envelope) || !Array.isArray(envelope[0])) continue;
        
        // Verifica se é um envelope wrb.fr
        if (envelope[0][0] !== 'wrb.fr') continue;
        
        const payloadString = envelope[0][2];
        if (!payloadString || typeof payloadString !== 'string') continue;

        const data = JSON.parse(payloadString);
        
        // Busca o texto em múltiplos caminhos possíveis
        // IMPORTANTE: data[4][0][0] é o ID (rc_xxx), NÃO o texto!
        // O texto está em data[4][0][1] ou data[4][0][33]
        let textContent: string | null = null;
        
        // Caminho 1: data[4][0][1][0] - resposta principal (ex: ["Tudo"])
        if (data[4]?.[0]?.[1]) {
          const responseArray = data[4][0][1];
          if (Array.isArray(responseArray) && typeof responseArray[0] === 'string') {
            const candidate = responseArray[0];
            // Ignora se for um ID (começa com rc_ ou é muito curto)
            if (!candidate.startsWith('rc_') && candidate.length > 2) {
              textContent = candidate;
            }
          }
        }
        
        // Caminho 2: data[4][0][33][0][0] - conteúdo expandido/thinking
        if (!textContent && data[4]?.[0]?.[33]) {
          const expanded = data[4][0][33];
          if (Array.isArray(expanded) && expanded[0]) {
            // O texto principal está em expanded[0][0]
            if (typeof expanded[0][0] === 'string' && expanded[0][0].length > 5) {
              textContent = expanded[0][0];
            } else if (Array.isArray(expanded[0]) && expanded[0][0]) {
              // Às vezes está mais aninhado
              const nested = expanded[0][0];
              if (Array.isArray(nested) && typeof nested[0] === 'string') {
                textContent = nested[0];
              } else if (typeof nested === 'string') {
                textContent = nested;
              }
            }
          }
        }
        
        // Caminho 3: data[4][0][0] - mas SÓ SE não for um ID
        if (!textContent && data[4]?.[0]?.[0]) {
          const candidate = data[4][0][0];
          // Verifica se é texto real e não um ID
          if (typeof candidate === 'string' && 
              candidate.length > 10 && 
              !candidate.startsWith('rc_') &&
              !candidate.match(/^[a-z0-9_]+$/)) {
            textContent = candidate;
          }
        }

        // Se encontrou texto válido, processa
        if (textContent && textContent.length > 5) {
          // Ignora se for apenas um ID de resposta
          if (textContent.match(/^rc_[a-f0-9]+$/)) {
            continue;
          }
          
          // Mantém o texto bruto para não quebrar respostas JSON (escapes são relevantes)
          if (!foundText || textContent.length > foundText.length) {
            foundText = textContent;
          }
        }
      } catch (innerErr) {
        // Ignora chunks inválidos
        continue;
      }
    }

    return foundText;
  } catch (e) {
    console.error('[Gemini Parser] Erro ao parsear:', e);
    return null;
  }
}

// ========================================
// GEMINI PROVIDER CLASS
// ========================================

export class GeminiProvider {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private cdpClient: CDPSession | null = null;
  private config: GeminiProviderConfig;
  private userDataDir: string;
  private isConnected: boolean = false;
  private _isLoggedIn: boolean = false;
  private _userInfo: GeminiUserInfo | null = null;
  
  // Estado para streaming
  private streamCleanup: StreamCleanupFn | null = null;
  private lastStreamText: string = '';

  // URLs do Gemini
  private static readonly GEMINI_URL = 'https://gemini.google.com/';
  private static readonly LOGIN_URL = 'https://accounts.google.com/';
  private static readonly INPUT_SELECTOR = 'div[contenteditable="true"], textarea[placeholder*="message"], input[type="text"]';
  private static readonly REMOTE_DEBUGGING_PORT = 9222;

  /** Processo do Chrome iniciado por este provider */
  private ownedChromeProcess: ChildProcess | null = null;

  constructor(config: GeminiProviderConfig) {
    this.config = {
      headless: config.headless ?? false, // Modo headless por padrão
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

  private debugDir: string | null = null;

  private ensureDirectoriesExist(): void {
    if (!fs.existsSync(this.userDataDir)) {
      fs.mkdirSync(this.userDataDir, { recursive: true });
    }
    
    // Diretório para screenshots de debug
    this.debugDir = path.join(this.userDataDir, 'debug-screenshots');
    if (!fs.existsSync(this.debugDir)) {
      fs.mkdirSync(this.debugDir, { recursive: true });
    }
  }

  /**
   * Tira um screenshot para debug
   */
  private async takeDebugScreenshot(stepName: string): Promise<void> {
    if (!this.page || !this.debugDir) return;
    
    try {
      const timestamp = Date.now();
      const filename = `${timestamp}_${stepName.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
      const filepath = path.join(this.debugDir, filename);
      
      await this.page.screenshot({ path: filepath, fullPage: false });
      console.log(`📸 [Gemini Debug] Screenshot: ${stepName} -> ${filename}`);
    } catch (err) {
      console.warn(`⚠️ [Gemini Debug] Erro ao tirar screenshot:`, err);
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

  private getChromeExecutablePath(chromePath?: string): string {
    if (chromePath) return chromePath;

    const bundledPath = puppeteer.executablePath?.();
    if (bundledPath && fs.existsSync(bundledPath)) {
      return bundledPath;
    }

    throw new Error(
      'Chrome/Chromium não encontrado para iniciar em modo remoto. Instale o Google Chrome ou garanta o Chromium do Puppeteer.'
    );
  }

  private async isRemoteDebugEndpointReady(port: number): Promise<boolean> {
    return new Promise(resolve => {
      const req = http.get(`http://127.0.0.1:${port}/json/version`, res => {
        let body = '';
        res.on('data', chunk => {
          body += chunk.toString();
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            resolve(false);
            return;
          }
          try {
            const payload = JSON.parse(body);
            resolve(Boolean(payload?.webSocketDebuggerUrl));
          } catch {
            resolve(false);
          }
        });
      });

      req.setTimeout(800, () => {
        req.destroy();
        resolve(false);
      });

      req.on('error', () => resolve(false));
    });
  }

  private async waitForRemoteDebugEndpoint(
    port: number,
    timeoutMs: number,
    spawnedProcess?: ChildProcess
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (spawnedProcess && spawnedProcess.exitCode !== null) {
        throw new Error(`Chrome remoto finalizou antes da conexão DevTools (exitCode=${spawnedProcess.exitCode})`);
      }

      if (await this.isRemoteDebugEndpointReady(port)) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 250));
    }

    throw new Error(`Timeout aguardando endpoint de depuração remota na porta ${port}`);
  }

  private async launchChromeWithRemoteDebugging(userDataDir: string, chromePath?: string): Promise<void> {
    const executablePath = this.getChromeExecutablePath(chromePath);
    const args = [
      `--remote-debugging-port=${GeminiProvider.REMOTE_DEBUGGING_PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--window-size=1366,768',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--lang=pt-BR',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-popup-blocking',
      '--new-window',
    ];

    if (this.config.headless) {
      args.push('--headless=new', '--disable-gpu');
    } else {
      args.push('--start-maximized');
    }

    const child = spawn(executablePath, args, {
      detached: false,
      stdio: 'ignore',
      windowsHide: !!this.config.headless,
    });

    this.ownedChromeProcess = child;
    await this.waitForRemoteDebugEndpoint(GeminiProvider.REMOTE_DEBUGGING_PORT, 20000, child);
  }

  private async connectToRemoteChrome(): Promise<Browser> {
    const browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${GeminiProvider.REMOTE_DEBUGGING_PORT}`,
      defaultViewport: null,
    });
    return browser;
  }

  private async randomDelay(min: number = 500, max: number = 1500): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Preenche o campo de prompt via colagem (rápido), com fallback por injeção no DOM.
   */
  private async fillPromptInput(message: string): Promise<void> {
    if (!this.page) {
      throw new Error('Página não inicializada');
    }

    await this.page.waitForSelector(GeminiProvider.INPUT_SELECTOR, { timeout: 10000 });
    await this.page.click(GeminiProvider.INPUT_SELECTOR);
    await this.randomDelay(120, 220);

    // Limpa o conteúdo atual rapidamente
    await this.page.keyboard.down('Control');
    await this.page.keyboard.press('KeyA');
    await this.page.keyboard.up('Control');
    await this.page.keyboard.press('Backspace');
    await this.randomDelay(80, 160);

    let pasted = false;

    try {
      clipboard.writeText(message);
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('KeyV');
      await this.page.keyboard.up('Control');
      pasted = true;
    } catch (err) {
      console.warn('⚠️ [Gemini] Falha ao colar via clipboard, usando fallback por DOM');
    }

    if (!pasted) {
      await this.page.evaluate((text) => {
        const active = document.activeElement as HTMLElement | null;
        if (!active) return;

        if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
          active.value = text;
          active.dispatchEvent(new Event('input', { bubbles: true }));
          active.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }

        if (active.isContentEditable) {
          active.textContent = text;
          active.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, message);
    }

    await this.randomDelay(120, 220);
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

  get userInfo(): GeminiUserInfo | null {
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
      console.log(`⚠️ [Gemini] Browser já inicializado para ${this.config.name}`);
      return;
    }

    try {
      console.log(`🚀 [Gemini] Inicializando navegador para ${this.config.name}...`);

      const chromePath = this.findChromePath();
      console.log(`🔍 [Gemini] Chrome path: ${chromePath || 'using bundled Chromium'}`);
      console.log(`📁 [Gemini] User data dir: ${this.userDataDir}`);
      console.log(`🧭 [Gemini] Modo navegador: ${this.config.headless ? 'headless' : 'visível'}`);

      // Se existir processo próprio antigo, encerra antes de subir outro na mesma porta
      if (this.ownedChromeProcess && this.ownedChromeProcess.exitCode === null) {
        try { this.ownedChromeProcess.kill(); } catch { }
      }
      this.ownedChromeProcess = null;

      // Se já há um Chrome rodando na porta 9222, apenas conecta
      if (await this.isRemoteDebugEndpointReady(GeminiProvider.REMOTE_DEBUGGING_PORT)) {
        console.log(`🔗 [Gemini] Chrome já rodando na porta ${GeminiProvider.REMOTE_DEBUGGING_PORT}, conectando...`);
      } else {
        await this.launchChromeWithRemoteDebugging(this.userDataDir, chromePath);
      }
      this.browser = await this.connectToRemoteChrome();

      const pages = await this.browser.pages();
      this.page = pages[0] || await this.browser.newPage();

      // Inicializa sessão CDP para interceptação de rede
      this.cdpClient = await this.page.target().createCDPSession();
      await this.cdpClient.send('Network.enable');
      
      // Habilita Fetch domain para interceptar respostas streaming
      await this.cdpClient.send('Fetch.enable', {
        patterns: [
          { urlPattern: '*StreamGenerate*', requestStage: 'Response' }
        ]
      });
      
      console.log(`📡 [Gemini] CDP Session iniciada (Network + Fetch)`);

      this.isConnected = true;
      console.log(`✅ [Gemini] Navegador inicializado para ${this.config.name}`);

    } catch (error) {
      if (this.ownedChromeProcess && this.ownedChromeProcess.exitCode === null) {
        try { this.ownedChromeProcess.kill(); } catch { }
      }
      this.ownedChromeProcess = null;
      this.browser = null;
      this.page = null;
      this.isConnected = false;
      console.error(`❌ [Gemini] Erro ao inicializar navegador:`, error);
      throw error;
    }
  }

  /**
   * Navega para o Gemini e verifica login
   */
  async goToGemini(): Promise<boolean> {
    if (!this.page) {
      throw new Error('Navegador não inicializado. Chame init() primeiro.');
    }

    try {
      console.log(`🌐 [Gemini] Navegando para ${GeminiProvider.GEMINI_URL}...`);
      
      await this.page.goto(GeminiProvider.GEMINI_URL, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      await this.randomDelay(2000, 3000);

      this._isLoggedIn = await this.checkLoginStatus();
      
      // if (this._isLoggedIn) {
      //   await this.extractUserInfo();
      // }
      
      return this._isLoggedIn;
    } catch (error) {
      console.error(`❌ [Gemini] Erro ao navegar:`, error);
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
      
      // Se redirecionou para login do Google
      if (currentUrl.includes('accounts.google.com')) {
        console.log(`⚠️ [Gemini] Usuário não está logado (redirecionado para login)`);
        this._isLoggedIn = false;
        return false;
      }

      // Verifica elementos que indicam login no Gemini
      const isLoggedIn = pageContent.includes('bard-main-container') || 
                         pageContent.includes('conversation-container') ||
                         pageContent.includes('gemini-app') ||
                         pageContent.includes('model-response') ||
                         currentUrl.includes('gemini.google.com/app');

      this._isLoggedIn = isLoggedIn;
      console.log(`${isLoggedIn ? '✅' : '⚠️'} [Gemini] Status de login: ${isLoggedIn ? 'logado' : 'não logado'}`);
      return isLoggedIn;

    } catch (error) {
      console.error(`❌ [Gemini] Erro ao verificar login:`, error);
      this._isLoggedIn = false;
      return false;
    }
  }

  /**
   * Extrai informações do usuário
   */
  async extractUserInfo(): Promise<GeminiUserInfo | null> {
    if (!this.page) return null;

    try {
      console.log(`📍 [Gemini] Extraindo informações do usuário...`);
      
      await this.randomDelay(1000, 2000);
      
      // Tenta extrair informações do usuário do DOM
      const userInfo = await this.page.evaluate(() => {
        // Procura por elementos com email ou nome
        const emailElement = document.querySelector('[data-email]');
        const nameElement = document.querySelector('[data-name]');
        const avatarElement = document.querySelector('img[src*="googleusercontent"]') as HTMLImageElement;
        
        return {
          email: emailElement?.getAttribute('data-email') || undefined,
          name: nameElement?.getAttribute('data-name') || undefined,
          avatarUrl: avatarElement?.src || undefined
        };
      });

      if (userInfo.email || userInfo.name) {
        this._userInfo = userInfo;
        console.log(`✅ [Gemini] User info extraído:`, this._userInfo);
        return this._userInfo;
      }

      console.warn(`⚠️ [Gemini] Não foi possível extrair informações do usuário`);
      return null;

    } catch (error) {
      console.error(`❌ [Gemini] Erro ao extrair user info:`, error);
      return null;
    }
  }

  /**
   * Aguarda o usuário fazer login manualmente
   */
  async waitForLogin(timeoutMs: number = 300000): Promise<boolean> {
    if (!this.page) return false;

    console.log(`⏳ [Gemini] Aguardando login manual para ${this.config.name}...`);

    const startTime = Date.now();
    const checkInterval = 3000;

    while (Date.now() - startTime < timeoutMs) {
      const currentUrl = this.page.url();
      
      if (currentUrl.includes('gemini.google.com') && !currentUrl.includes('accounts.google.com')) {
        const isLoggedIn = await this.checkLoginStatus();
        if (isLoggedIn) {
          console.log(`✅ [Gemini] Login detectado para ${this.config.name}!`);
          this._isLoggedIn = true;
          await this.extractUserInfo();
          return true;
        }
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    console.log(`⚠️ [Gemini] Timeout aguardando login para ${this.config.name}`);
    return false;
  }

  // ========================================
  // MÉTODOS DE INTERCEPTAÇÃO - CDP
  // ========================================

  // Map para rastrear requestIds do StreamGenerate
  private streamRequestIds: Set<string> = new Set();
  private responseBuffer: Map<string, string> = new Map();

  /**
   * Inicia o streaming de respostas do Gemini usando CDP.
   * Intercepta requisições para StreamGenerate e captura chunks de resposta.
   * @param onChunk - Callback chamado a cada novo pedaço de texto.
   * @returns Função para parar de ouvir (cleanup).
   */
  startResponseStream(onChunk: OnChunkCallback): StreamCleanupFn {
    if (!this.cdpClient) {
      throw new Error('CDP Client não inicializado. Chame init() primeiro.');
    }

    // Limpa qualquer stream anterior
    if (this.streamCleanup) {
      this.streamCleanup();
    }

    // Reset do estado
    this.lastStreamText = '';
    this.streamRequestIds.clear();
    this.responseBuffer.clear();

    // Listener para novas requisições - identifica StreamGenerate
    const requestListener = (params: any) => {
      if (params.request?.url?.includes('StreamGenerate')) {
        this.streamRequestIds.add(params.requestId);
        console.log(`📡 [Gemini] StreamGenerate detectado: ${params.requestId}`);
      }
    };

    // Listener para chunks de dados recebidos
    const dataReceivedListener = async (params: any) => {
      if (!this.streamRequestIds.has(params.requestId)) return;
      
      try {
        // Obtém o corpo da resposta até agora
        const { body } = await this.cdpClient!.send('Network.getResponseBody', {
          requestId: params.requestId
        });

        if (body) {
          const fullText = parseGeminiPacket(body);
          
          if (fullText && fullText.length > this.lastStreamText.length) {
            const newChunk = fullText.slice(this.lastStreamText.length);
            this.lastStreamText = fullText;
            onChunk(newChunk);
          }
        }
      } catch (err) {
        // Resposta ainda não está completa - isso é esperado para streaming
      }
    };

    // Listener para quando a resposta é completada
    const loadingFinishedListener = async (params: any) => {
      if (!this.streamRequestIds.has(params.requestId)) return;

      try {
        const { body } = await this.cdpClient!.send('Network.getResponseBody', {
          requestId: params.requestId
        });

        if (body) {
          const fullText = parseGeminiPacket(body);
          
          if (fullText && fullText.length > this.lastStreamText.length) {
            const newChunk = fullText.slice(this.lastStreamText.length);
            this.lastStreamText = fullText;
            onChunk(newChunk);
          }
        }
        
        this.streamRequestIds.delete(params.requestId);
      } catch (err: any) {
        // Erro esperado quando resposta ainda não está disponível
      }
    };

    // @ts-ignore - CDP event typing
    this.cdpClient.on('Network.requestWillBeSent', requestListener);
    // @ts-ignore - CDP event typing  
    this.cdpClient.on('Network.dataReceived', dataReceivedListener);
    // @ts-ignore - CDP event typing
    this.cdpClient.on('Network.loadingFinished', loadingFinishedListener);
    
    console.log(`📡 [Gemini] Stream de respostas iniciado (CDP)`);

    // Função de cleanup
    this.streamCleanup = () => {
      if (this.cdpClient) {
        // @ts-ignore - CDP event typing
        this.cdpClient.off('Network.requestWillBeSent', requestListener);
        // @ts-ignore - CDP event typing
        this.cdpClient.off('Network.dataReceived', dataReceivedListener);
        // @ts-ignore - CDP event typing
        this.cdpClient.off('Network.loadingFinished', loadingFinishedListener);
      }
      this.lastStreamText = '';
      this.streamRequestIds.clear();
      console.log(`🛑 [Gemini] Stream de respostas parado`);
    };

    return this.streamCleanup;
  }

  /**
   * Espera a resposta completa do Gemini e retorna o texto final.
   * Usa CDP para monitorar quando o StreamGenerate termina.
   * @param silenceTimeoutMs - Quanto tempo de silêncio na rede define o "fim" (padrão 3000ms).
   * @param maxTimeoutMs - Timeout máximo total (padrão 60s).
   * @returns O texto completo da resposta.
   */
  async waitForCompleteResponse(silenceTimeoutMs: number = 3000, maxTimeoutMs: number = 60000): Promise<string> {
    if (!this.cdpClient) {
      throw new Error('CDP Client não inicializado. Chame init() primeiro.');
    }

    return new Promise((resolve, reject) => {
      let finalResponse = '';
      let silenceTimer: NodeJS.Timeout | null = null;
      let hasStarted = false;
      let activeRequestId: string | null = null;

      // Função para resetar o timer de "fim da resposta"
      const resetTimer = () => {
        if (silenceTimer) clearTimeout(silenceTimer);
        
        silenceTimer = setTimeout(() => {
          if (hasStarted && finalResponse) {
            cleanup();
            console.log(`✅ [Gemini] Resposta completa (silence timeout): ${finalResponse.length} chars`);
            resolve(finalResponse);
          }
        }, silenceTimeoutMs);
      };

      const requestListener = (params: any) => {
        if (params.request?.url?.includes('StreamGenerate')) {
          activeRequestId = params.requestId;
          hasStarted = true;
          console.log(`📡 [Gemini] Aguardando resposta de: ${params.requestId}`);
          resetTimer();
        }
      };

      const dataReceivedListener = async (params: any) => {
        if (params.requestId !== activeRequestId) return;

        try {
          const { body } = await this.cdpClient!.send('Network.getResponseBody', {
            requestId: params.requestId
          });

          if (body) {
            const currentText = parseGeminiPacket(body);
            if (currentText && currentText.length >= finalResponse.length) {
              finalResponse = currentText;
              resetTimer();
            }
          }
        } catch (err) {
          // Esperado - resposta ainda em progresso
        }
      };

      const loadingFinishedListener = async (params: any) => {
        if (params.requestId !== activeRequestId) return;

        try {
          const { body } = await this.cdpClient!.send('Network.getResponseBody', {
            requestId: params.requestId
          });

          if (body) {
            const currentText = parseGeminiPacket(body);
            if (currentText && currentText.length >= finalResponse.length) {
              finalResponse = currentText;
            }
          }
          
          cleanup();
          console.log(`✅ [Gemini] Resposta completa (loading finished): ${finalResponse.length} chars`);
          resolve(finalResponse);
        } catch (err) {
          console.error(`❌ [Gemini] Erro ao obter resposta:`, err);
          // Tenta resolver com o que temos
          if (finalResponse) {
            cleanup();
            resolve(finalResponse);
          }
        }
      };

      const cleanup = () => {
        if (this.cdpClient) {
          // @ts-ignore - CDP event typing
          this.cdpClient.off('Network.requestWillBeSent', requestListener);
          // @ts-ignore - CDP event typing
          this.cdpClient.off('Network.dataReceived', dataReceivedListener);
          // @ts-ignore - CDP event typing
          this.cdpClient.off('Network.loadingFinished', loadingFinishedListener);
        }
        if (silenceTimer) clearTimeout(silenceTimer);
      };

      // @ts-ignore - CDP event typing
      this.cdpClient.on('Network.requestWillBeSent', requestListener);
      // @ts-ignore - CDP event typing
      this.cdpClient.on('Network.dataReceived', dataReceivedListener);
      // @ts-ignore - CDP event typing
      this.cdpClient.on('Network.loadingFinished', loadingFinishedListener);

      // Timer de segurança (timeout máximo)
      setTimeout(() => {
        cleanup();
        if (finalResponse) {
          console.log(`⚠️ [Gemini] Timeout máximo, retornando resposta parcial: ${finalResponse.length} chars`);
          resolve(finalResponse);
        } else if (!hasStarted) {
          reject(new Error(`Timeout: Gemini não respondeu em ${maxTimeoutMs / 1000}s.`));
        } else {
          reject(new Error(`Timeout: Resposta não completada em ${maxTimeoutMs / 1000}s.`));
        }
      }, maxTimeoutMs);
    });
  }

  // ========================================
  // MÉTODOS PÚBLICOS - INTERAÇÃO COM CHAT
  // ========================================

  /**
   * Envia uma mensagem para o Gemini (sem interceptação)
   */
  async sendMessage(message: string): Promise<string | null> {
    if (!this._isLoggedIn || !this.page) {
      throw new Error('Usuário não está logado no Gemini');
    }

    try {
      console.log(`💬 [Gemini] Enviando mensagem...`);

      // Preenche por colagem direta (mais rápido que digitar caractere a caractere)
      await this.fillPromptInput(message);

      // Envia a mensagem (Enter ou botão de enviar)
      await this.page.keyboard.press('Enter');

      // Aguarda a resposta usando o extrator do DOM (fallback)
      console.log(`⏳ [Gemini] Aguardando resposta...`);
      await this.randomDelay(3000, 5000);

      // Tenta capturar a última resposta
      const response = await this.page.evaluate(() => {
        const responses = document.querySelectorAll('[data-content-type="response"], .model-response, .response-content');
        const lastResponse = responses[responses.length - 1];
        return lastResponse?.textContent || null;
      });

      console.log(`✅ [Gemini] Resposta recebida`);
      return response;

    } catch (error) {
      console.error(`❌ [Gemini] Erro ao enviar mensagem:`, error);
      throw error;
    }
  }

  /**
   * Envia uma mensagem e intercepta a resposta via CDP (streaming real).
   * Usa Fetch domain para interceptar os chunks conforme chegam.
   * @param message - Mensagem a enviar.
   * @param onChunk - Callback para cada chunk de texto recebido (opcional).
   * @returns A resposta completa.
   */
  async sendMessageWithStream(message: string, onChunk?: OnChunkCallback): Promise<string> {
    // Verifica se o navegador ainda está conectado
    if (!this.isBrowserConnected()) {
      console.log(`⚠️ [Gemini] Navegador desconectado, reinicializando...`);
      
      // Limpa referências antigas
      this.browser = null;
      this.page = null;
      this.cdpClient = null;
      this._isLoggedIn = false;
      
      // Reinicializa
      await this.init();
      await this.goToGemini();
      
      if (!this._isLoggedIn) {
        throw new Error('Não foi possível reconectar ao Gemini. Faça login novamente.');
      }
    }

    if (!this._isLoggedIn || !this.page || !this.cdpClient) {
      throw new Error('Usuário não está logado no Gemini ou CDP não inicializado');
    }

    return new Promise(async (resolve, reject) => {
      try {
        console.log(`💬 [Gemini] Enviando mensagem com streaming...`);

        let lastText = '';
        let finalResponse = '';
        let streamHandle: string | null = null;
        let isReading = false;
        let inactivityTimer: NodeJS.Timeout | null = null;
        let maxTimer: NodeJS.Timeout | null = null;
        let parserBuffer = '';
        const maxTimeoutMs = Number(process.env.GEMINI_STREAM_MAX_TIMEOUT_MS || 1_200_000); // 20 min
        const inactivityTimeoutMs = Number(process.env.GEMINI_STREAM_INACTIVITY_TIMEOUT_MS || 600_000); // 10 min sem chunks
        const parseThrottleMs = Number(process.env.GEMINI_STREAM_PARSE_THROTTLE_MS || 350);
        const streamUpdatesEnabled = typeof onChunk === 'function';
        const verboseStreamLogs = process.env.GEMINI_STREAM_VERBOSE === '1';
        let lastParseAt = 0;
        let settled = false;

        // Função de cleanup
        const cleanup = () => {
          if (this.cdpClient) {
            // @ts-ignore
            this.cdpClient.off('Fetch.requestPaused', fetchListener);
          }
          if (inactivityTimer) clearTimeout(inactivityTimer);
          if (maxTimer) clearTimeout(maxTimer);
          isReading = false;
        };

        const settleSuccess = (response: string, reason: string) => {
          if (settled) return;
          settled = true;
          cleanup();
          console.log(`✅ [Gemini] Resposta completa (${reason}): ${response.length} chars`);
          resolve(response);
        };

        const settleError = (error: Error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        };

        const touchInactivity = () => {
          if (settled) return;
          if (inactivityTimer) clearTimeout(inactivityTimer);
          inactivityTimer = setTimeout(() => {
            settleError(new Error(`Timeout por inatividade: sem novos chunks por ${Math.round(inactivityTimeoutMs / 1000)}s.`));
          }, inactivityTimeoutMs);
        };

        // Processa chunk de dados recebido (apenas para modo streaming em tempo real)
        const processChunk = (rawData: string, forceParse: boolean = false) => {
          if (!streamUpdatesEnabled) {
            touchInactivity();
            return;
          }

          parserBuffer += rawData;
          const now = Date.now();
          if (!forceParse && now - lastParseAt < parseThrottleMs) {
            touchInactivity();
            return;
          }
          lastParseAt = now;

          const fullText = parseGeminiPacket(parserBuffer);
          if (fullText && fullText.length > lastText.length) {
            const newChunk = fullText.slice(lastText.length);
            if (verboseStreamLogs) {
              console.log(`📦 [Stream] Chunk (+${newChunk.length} chars)`);
            }

            onChunk?.(newChunk);
            lastText = fullText;
            finalResponse = fullText;
          }

          touchInactivity();
        };

        // Lê o stream usando IO.read e repassa para a página ao final
        const readStream = async (handle: string, fetchRequestId: string, responseStatusCode: number, responseHeaders: any[]) => {
          if (!this.cdpClient || isReading) return;
          isReading = true;
          
          const rawChunks: string[] = [];
          let rawBodyLength = 0;
          let readCount = 0;
          
          try {
            while (true) {
              const result = await this.cdpClient.send('IO.read', {
                handle: handle,
                size: 65536 // 64KB por leitura
              });

              if (result.data) {
                // Decodifica base64 se necessário
                const chunk = result.base64Encoded 
                  ? Buffer.from(result.data, 'base64').toString('utf-8')
                  : result.data;
                
                rawChunks.push(chunk);
                rawBodyLength += chunk.length;

                if (streamUpdatesEnabled) {
                  processChunk(chunk);
                } else {
                  touchInactivity();
                }

                readCount++;
                if (readCount % 12 === 0) {
                  // Cede tempo ao event loop para reduzir impacto no desktop.
                  await new Promise(r => setTimeout(r, 1));
                }
              }

              if (result.eof) {
                const rawBody = rawChunks.join('');
                console.log(`📡 [Stream] EOF alcançado, repassando ${rawBodyLength} bytes para a página`);
                await this.cdpClient.send('IO.close', { handle });
                
                // Repassa os dados para a página usando fulfillRequest
                try {
                  await this.cdpClient.send('Fetch.fulfillRequest', {
                    requestId: fetchRequestId,
                    responseCode: responseStatusCode || 200,
                    responseHeaders: responseHeaders || [],
                    body: Buffer.from(rawBody).toString('base64')
                  });
                  console.log(`📡 [Stream] Dados repassados para a página`);
                } catch (fulfillErr: any) {
                  console.error(`❌ [Stream] Erro ao repassar dados:`, fulfillErr.message);
                }

                // Parse final sempre no EOF para garantir resposta completa.
                const parsedFinal = parseGeminiPacket(rawBody);
                if (parsedFinal) {
                  if (streamUpdatesEnabled && parsedFinal.length > lastText.length) {
                    onChunk?.(parsedFinal.slice(lastText.length));
                  }
                  finalResponse = parsedFinal;
                }

                if (finalResponse) {
                  settleSuccess(finalResponse, 'eof');
                } else {
                  settleError(new Error('Gemini retornou stream vazio.'));
                }
                break;
              }
            }
          } catch (err: any) {
            console.error(`❌ [Stream] Erro na leitura:`, err.message);
          }
          
          isReading = false;
        };

        // Listener para requisições interceptadas pelo Fetch
        const fetchListener = async (params: any) => {
          const { requestId, request, responseStatusCode, responseHeaders } = params;
          
          if (request?.url?.includes('StreamGenerate')) {
            console.log(`📡 [Fetch] StreamGenerate interceptado`);
            touchInactivity();
            
            try {
              // Obtém o stream handle para ler os dados progressivamente
              const streamResult = await this.cdpClient!.send('Fetch.takeResponseBodyAsStream', {
                requestId
              });
              
              streamHandle = streamResult.stream;
              console.log(`📡 [Fetch] Stream handle obtido: ${streamHandle}`);
              
              // Inicia a leitura do stream (passa requestId e headers para fulfillRequest)
              readStream(streamHandle, requestId, responseStatusCode, responseHeaders);
              
            } catch (err: any) {
              console.error(`❌ [Fetch] Erro ao obter stream:`, err.message);
              
              // Fallback: continua a requisição normalmente
              try {
                await this.cdpClient!.send('Fetch.continueRequest', { requestId });
              } catch (e) {
                // Ignora se já foi tratado
              }
            }
          } else {
            // Continua outras requisições normalmente
            try {
              await this.cdpClient!.send('Fetch.continueRequest', { requestId });
            } catch (e) {
              // Ignora
            }
          }
        };

        // Registra listener do Fetch
        // @ts-ignore
        this.cdpClient.on('Fetch.requestPaused', fetchListener);
        console.log(`📡 [Gemini] Fetch listener registrado`);

        // Timer máximo de segurança
        maxTimer = setTimeout(() => {
          if (settled) return;
          settleError(new Error(`Timeout máximo: resposta não concluiu (EOF) em ${Math.round(maxTimeoutMs / 1000)}s.`));
        }, maxTimeoutMs);

        // Preenche por colagem direta (mais rápido que digitar caractere a caractere)
        await this.fillPromptInput(message);

        // Envia a mensagem
        await this.page!.keyboard.press('Enter');
        console.log(`📤 [Gemini] Mensagem enviada, aguardando resposta...`);

      } catch (error: any) {
        console.error(`❌ [Gemini] Erro ao enviar mensagem:`, error.message);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  // ========================================
  // MÉTODOS PÚBLICOS - CLEANUP
  // ========================================

  async close(): Promise<void> {
    try {
      // Para qualquer stream ativo
      if (this.streamCleanup) {
        this.streamCleanup();
        this.streamCleanup = null;
      }

      // Desconecta CDP
      if (this.cdpClient) {
        await this.cdpClient.detach().catch(() => {});
        this.cdpClient = null;
      }

      // Desconecta o Puppeteer (não fecha o browser, só desconecta o WebSocket)
      try {
        if (this.browser && this.browser.isConnected()) {
          await this.browser.disconnect();
        }
      } catch { }

      // Mata o processo do Chrome que iniciamos
      if (this.ownedChromeProcess && this.ownedChromeProcess.exitCode === null) {
        try { this.ownedChromeProcess.kill(); } catch { }
      }

      this.ownedChromeProcess = null;
      this.browser = null;
      this.page = null;
      this.isConnected = false;
      this._isLoggedIn = false;
      this._userInfo = null;
      console.log(`🔌 [Gemini] Navegador fechado para ${this.config.name}`);
    } catch (error) {
      console.error(`❌ [Gemini] Erro ao fechar navegador:`, error);
      // Garante que o estado é resetado mesmo em caso de erro
      if (this.ownedChromeProcess && this.ownedChromeProcess.exitCode === null) {
        try { this.ownedChromeProcess.kill(); } catch { }
      }
      this.ownedChromeProcess = null;
      this.browser = null;
      this.page = null;
      this.isConnected = false;
      this._isLoggedIn = false;
      this._userInfo = null;
    }
  }

  getPage(): Page | null {
    return this.page;
  }

  getBrowser(): Browser | null {
    return this.browser;
  }

  getCDPClient(): CDPSession | null {
    return this.cdpClient;
  }
}

// ========================================
// FACTORY FUNCTION
// ========================================

export function createGeminiProvider(id: string, name: string, options?: Partial<GeminiProviderConfig>): GeminiProvider {
  return new GeminiProvider({
    id,
    name,
    ...options
  });
}

// Export do parser para uso externo se necessário
export { parseGeminiPacket };
