/**
 * Flow Video Provider - Automação do Google Flow (Veo 3) via Puppeteer
 * 
 * Gerencia a geração de vídeos usando o Google Flow (labs.google/fx/pt/tools/flow).
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

import puppeteer, { Browser, Page } from 'puppeteer';
import { ChildProcess, spawn } from 'child_process';
import { GhostCursor } from 'ghost-cursor';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import https from 'https';
import http from 'http';

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
  /** Processo do Chrome iniciado por este provider (quando não compartilhado) */
  private ownedChromeProcess: ChildProcess | null = null;

  // URLs do Flow
  private static readonly FLOW_URL = 'https://labs.google/fx/pt/tools/flow';
  private static readonly REMOTE_DEBUGGING_PORT = 9222;

  // ── Controle de concorrência ──────────────────────────────────────────────
  // O browser tem uma única página (this.page). As operações de navegação e
  // submissão de prompt DEVEM ser serializadas (mutex). O polling de progresso
  // pode correr em paralelo uma vez que o prompt foi submetido.
  // Regra: máx. 4 gerações em andamento ao mesmo tempo (limitado pelo Flow).

  private static readonly MAX_CONCURRENT = 4;

  /** Mutex de submissão: garante que só 1 chamada navega/configura/submete por vez */
  private static submitLocked = false;
  private static submitQueue: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];

  /** Contador de gerações em polling ativo (submetidas e aguardando conclusão) */
  private static activeCount = 0;
  private static activeQueue: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];

  /**
   * Cancela toda a fila de espera do mutex e dos slots de polling.
   * Chamadas que estão aguardando receberão um erro e poderão sair imediatamente.
   */
  static cancelQueue(): void {
    const err = new Error('CANCELLED');
    console.log(`⏹️ [Flow/Cancel] Cancelando fila: ${FlowVideoProvider.submitQueue.length} mutex + ${FlowVideoProvider.activeQueue.length} slots`);
    // Rejeitar todos os waiters do mutex
    const sq = FlowVideoProvider.submitQueue.splice(0);
    sq.forEach(w => w.reject(err));
    FlowVideoProvider.submitLocked = false;
    // Rejeitar todos os waiters de slot
    const aq = FlowVideoProvider.activeQueue.splice(0);
    aq.forEach(w => w.reject(err));
  }

  /** Adquire o mutex de submissão (serializa acesso ao browser DOM). */
  private static async acquireSubmitMutex(): Promise<void> {
    if (!FlowVideoProvider.submitLocked) {
      FlowVideoProvider.submitLocked = true;
      return;
    }
    console.log(`⏸️ [Flow/Mutex] Aguardando vez de submeter… fila: ${FlowVideoProvider.submitQueue.length + 1}`);
    await new Promise<void>((resolve, reject) => { FlowVideoProvider.submitQueue.push({ resolve, reject }); });
    FlowVideoProvider.submitLocked = true;
  }

  /** Libera o mutex de submissão, desbloqueando o próximo na fila. */
  private static releaseSubmitMutex(): void {
    const next = FlowVideoProvider.submitQueue.shift();
    if (next) {
      next.resolve();
    } else {
      FlowVideoProvider.submitLocked = false;
    }
  }

  /** Adquire um slot de polling ativo (máx. MAX_CONCURRENT). */
  private static async acquireConcurrencySlot(): Promise<void> {
    if (FlowVideoProvider.activeCount < FlowVideoProvider.MAX_CONCURRENT) {
      FlowVideoProvider.activeCount++;
      console.log(`🔒 [Flow/Slots] Slot adquirido. Ativos: ${FlowVideoProvider.activeCount}/${FlowVideoProvider.MAX_CONCURRENT}`);
      return;
    }
    console.log(`⏸️ [Flow/Slots] Aguardando slot livre… Ativos: ${FlowVideoProvider.activeCount}/${FlowVideoProvider.MAX_CONCURRENT}`);
    await new Promise<void>((resolve, reject) => { FlowVideoProvider.activeQueue.push({ resolve, reject }); });
    FlowVideoProvider.activeCount++;
    console.log(`🔒 [Flow/Slots] Slot adquirido (fila). Ativos: ${FlowVideoProvider.activeCount}/${FlowVideoProvider.MAX_CONCURRENT}`);
  }

  /** Libera um slot de polling ativo. */
  private static releaseConcurrencySlot(): void {
    FlowVideoProvider.activeCount = Math.max(0, FlowVideoProvider.activeCount - 1);
    console.log(`🔓 [Flow/Slots] Slot liberado. Ativos: ${FlowVideoProvider.activeCount}/${FlowVideoProvider.MAX_CONCURRENT}`);
    const next = FlowVideoProvider.activeQueue.shift();
    if (next) next.resolve();
  }

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

  /**
   * Atualiza opções mutáveis da instância singleton.
   * Importante para permitir alternar headless/headful entre chamadas IPC.
   */
  updateConfig(options?: Partial<FlowVideoConfig>): void {
    if (!options) return;

    if (typeof options.headless === 'boolean') {
      this.config.headless = options.headless;
    }
    if (typeof options.geminiProviderId === 'string' || options.geminiProviderId === undefined) {
      this.config.geminiProviderId = options.geminiProviderId;
    }
    if (typeof options.generationTimeoutMs === 'number') {
      this.config.generationTimeoutMs = options.generationTimeoutMs;
    }
    if (typeof options.outputDir === 'string' && options.outputDir.trim()) {
      this.outputDir = options.outputDir;
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }
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
      `--remote-debugging-port=${FlowVideoProvider.REMOTE_DEBUGGING_PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--window-size=1366,768',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--lang=en-US',
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
    await this.waitForRemoteDebugEndpoint(FlowVideoProvider.REMOTE_DEBUGGING_PORT, 20000, child);
  }

  private async connectToRemoteChrome(): Promise<Browser> {
    const browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${FlowVideoProvider.REMOTE_DEBUGGING_PORT}`,
      defaultViewport: null,
    });
    return browser;
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

  async init(): Promise<void> {
    // Verifica se o browser/page REALMENTE estão vivos
    if (this.isBrowserAlive()) {
      // Se a configuração atual pedir interface visível, mas o browser atual estiver headless,
      // reinicia o browser próprio para permitir acompanhar a automação em tempo real.
      if (!this.config.headless && !this.usingSharedBrowser && this.browser) {
        try {
          const version = await this.browser.version();
          if (version.toLowerCase().includes('headless')) {
            console.log('🔄 [Flow] Browser atual está headless, reiniciando em modo visível...');
            await this.close();
          } else {
            console.log(`⚠️ [Flow] Browser já inicializado e conectado`);
            return;
          }
        } catch {
          console.log(`⚠️ [Flow] Browser já inicializado e conectado`);
          return;
        }
      } else {
        console.log(`⚠️ [Flow] Browser já inicializado e conectado`);
        return;
      }
    }

    // Se close() não encerrou corretamente, evita prosseguir com estado inválido
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
      console.log(`📁 [Flow] User data dir: ${geminiData.userDataDir}`);
      console.log(`🧭 [Flow] Modo navegador: ${this.config.headless ? 'headless' : 'visível'}`);

      // Se existir processo próprio antigo, encerra antes de subir outro na mesma porta
      if (this.ownedChromeProcess && this.ownedChromeProcess.exitCode === null) {
        try { this.ownedChromeProcess.kill(); } catch { }
      }
      this.ownedChromeProcess = null;

      await this.launchChromeWithRemoteDebugging(geminiData?.userDataDir, chromePath);
      this.browser = await this.connectToRemoteChrome();
      this.usingSharedBrowser = false;

      const pages = await this.browser.pages();
      this.page = pages[0] || await this.browser.newPage();

      console.log(`✅ [Flow] Navegador inicializado com cookies do Gemini (provider: ${geminiData.providerId})`);
    } catch (error) {
      if (this.ownedChromeProcess && this.ownedChromeProcess.exitCode === null) {
        try { this.ownedChromeProcess.kill(); } catch { }
      }
      this.ownedChromeProcess = null;
      this.browser = null;
      this.page = null;
      this.usingSharedBrowser = false;
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
    const normalizedModel = (model || '').trim().toLowerCase();
    const isLiteModel = normalizedModel.includes('veo 3.1 - lite')
      || normalizedModel.includes('veo 3.1 lite')
      || normalizedModel.includes('veo-3.1-lite');
    const effectiveIngredientImagePaths = isLiteModel ? undefined : ingredientImagePaths;

    const emitProgress = (stage: any, message: string, percent?: number) => {
      console.log(`🎬 [Flow] ${message}`);
      onProgress?.({ stage, message, percent });
    };

    // ── Passo 1: aguardar slot de polling (máx. 4 gerações simultâneas no Flow) ──
    emitProgress('submitting', 'Aguardando slot de geração disponível...');
    await FlowVideoProvider.acquireConcurrencySlot();
    let slotReleased = false;
    const releaseSlot = () => {
      if (!slotReleased) { slotReleased = true; FlowVideoProvider.releaseConcurrencySlot(); }
    };

    // ── Passo 2: aguardar mutex de submissão (acesso exclusivo ao browser DOM) ──
    let submitMutexHeld = false;
    const releaseSubmitMutexIfHeld = () => {
      if (!submitMutexHeld) return;
      submitMutexHeld = false;
      FlowVideoProvider.releaseSubmitMutex();
    };

    emitProgress('submitting', 'Aguardando vez de submeter prompt no browser...');
    await FlowVideoProvider.acquireSubmitMutex();
    submitMutexHeld = true;

    try {
      // 1. Inicializar navegador se necessário (verifica se está vivo)
      if (!this.isBrowserAlive()) {
        emitProgress('opening', 'Abrindo navegador com cookies do Gemini...');
        await this.init();
      }

      if (!this.page) {
        throw new Error('Página não disponível');
      }

      // Trazer a aba para o foreground para evitar que Chrome congele o Execution Context
      try { await this.page.bringToFront(); } catch (e) {}

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
      if (isLiteModel && ingredientImagePaths && ingredientImagePaths.length > 0) {
        console.warn('⚠️ [Flow] Modelo Veo 3.1 - Lite não suporta Ingredients. Usando Frames.');
        emitProgress('submitting', 'Veo 3.1 - Lite não suporta Ingredients. Usando Frames...');
      }
      const hasIngredients = !!effectiveIngredientImagePaths && effectiveIngredientImagePaths.length > 0;
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
        emitProgress('submitting', `Enviando ${effectiveIngredientImagePaths!.length} imagem(ns) de ingredientes...`);
        for (let i = 0; i < effectiveIngredientImagePaths!.length; i++) {
          const imgPath = effectiveIngredientImagePaths![i];
          emitProgress('submitting', `Enviando ingrediente ${i + 1}/${effectiveIngredientImagePaths!.length}...`);
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
        ? effectiveIngredientImagePaths!.length
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

      // console.log('✅ [Flow] Imagens enviadas com sucesso!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
      // // Aguarda 100 segundos para o usuário interagir com o Flow para Teste
      // await this.randomDelay(100000, 200000);

      // 6. Procurar e submeter o prompt
      emitProgress('submitting', 'Localizando campo de prompt...');
      await this.randomDelay(1000, 2000);

      // Guardar o prompt para fazer match via texto no DOM (ao invés de comparar tile IDs)
      const searchPrompt = prompt;
      emitProgress('submitting', 'Prompt será rastreado por match de texto...');
      console.log(`🔍 [Flow] Match por prompt: "${searchPrompt.substring(0, 60)}..."`);

      // Capturar tile IDs existentes ANTES de submeter para não confundir com mídias antigas do mesmo prompt
      const knownTileIds = (await this.page!.evaluate(`(function() {
        var arr = [];
        var nodes = document.querySelectorAll('[data-tile-id]');
        for (var i = 0; i < nodes.length; i++) {
          var id = nodes[i].getAttribute('data-tile-id');
          if (id) arr.push(id);
        }
        return arr;
      })()`)) as string[] || [];

      // Tentar encontrar o campo de prompt de diversas formas
      const promptSubmitted = await this.submitPrompt(prompt);

      if (!promptSubmitted) {
        throw new Error('Não foi possível encontrar o campo de prompt no Flow. A interface pode ter mudado.');
      }

      // Submissao concluida — liberar o mutex para q o proximo prompt possa iniciar
      await this.clearPromptPanel();
      releaseSubmitMutexIfHeld();

      // ── Polling roda em paralelo com outras gerações ──
      emitProgress('generating', `Gerando vídeo com ${model}...`, 10);

      const videoUrl = await this.waitForVideoGeneration(
        this.config.generationTimeoutMs!,
        searchPrompt,
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

      releaseSlot();
      return {
        success: true,
        videoPath: outputPath,
        durationMs,
        credits: creditsAfter ?? undefined,
      };

    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      // Garantir liberação do mutex e slot mesmo em caso de erro
      releaseSubmitMutexIfHeld();
      releaseSlot();
      emitProgress('error', `Erro: ${error.message}`);
      console.error(`❌ [Flow] Erro na geração:`, error);
      return { success: false, error: error.message, durationMs };
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
   * Lê os toasts de erro visíveis e retorna contagem por mensagem.
   * Útil para diferenciar erro antigo (stale) de erro novo da geração atual.
   */
  private async getErrorToastCounts(): Promise<Record<string, number>> {
    if (!this.page) return {};

    try {
      const counts = await this.page.evaluate(`(function() {
        var out = {};
        var toasts = document.querySelectorAll('li[data-sonner-toast]');
        for (var i = 0; i < toasts.length; i++) {
          var toast = toasts[i];
          var icons = toast.querySelectorAll('i');
          var hasError = false;
          for (var j = 0; j < icons.length; j++) {
            if ((icons[j].textContent || '').trim() === 'error') {
              hasError = true;
              break;
            }
          }
          if (!hasError) continue;

          var text = (toast.textContent || '').replace(/\\s+/g, ' ').trim();
          if (!text) continue;

          out[text] = (out[text] || 0) + 1;
        }
        return out;
      })()`) as Record<string, number> | null;

      return counts || {};
    } catch {
      return {};
    }
  }

  /**
   * Retorna uma mensagem quando detecta um toast de erro novo em relação ao baseline.
   */
  private findNewErrorToastMessage(
    baseline: Record<string, number>,
    current: Record<string, number>
  ): string | null {
    const entries = Object.entries(current);
    for (const [msg, count] of entries) {
      const baselineCount = baseline[msg] ?? 0;
      if (count > baselineCount) return msg;
    }
    return null;
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
        'div[contenteditable="true"][role="textbox"]',
        'textarea[placeholder*="Describe"]',
        'textarea[placeholder*="describe"]',
        'textarea[placeholder*="prompt"]',
        'textarea[placeholder*="Enter"]',
        'textarea[aria-label*="prompt"]',
        'textarea[aria-label*="Prompt"]',
        'textarea[aria-label*="video"]',
        'div[contenteditable="true"][aria-label*="prompt"]',
        'div[contenteditable="true"][aria-label*="Prompt"]',
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
      await inputElement.evaluate((el: Element) => {
        const node = el as HTMLElement;
        try {
          node.scrollIntoView({ block: 'center', inline: 'nearest' });
        } catch { }
        try { node.click(); } catch { }
        try { node.focus(); } catch { }
      });
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

      // Polling inteligente para o botão de submit (aguardar que seja liberado)
      let submitClicked = false;
      let attempts = 0;
      const maxAttempts = 60; // 30 segundos no total (500ms por tentativa)

      while (attempts < maxAttempts) {
        try {
          const result = await this.page.evaluate(`(function() {
            var foundBtn = null;
            
            // Opção 1: pelo <i> com arrow_forward
            var icons = document.querySelectorAll('i');
            for (var i = 0; i < icons.length; i++) {
              if ((icons[i].textContent || '').trim() === 'arrow_forward') {
                var btn = icons[i].closest('button');
                if (btn) {
                  foundBtn = btn;
                  break;
                }
              }
            }
            
            // Opção 2: procurar por 'span' com texto equivalente
            if (!foundBtn) {
              var spans = document.querySelectorAll('span');
              for (var j = 0; j < spans.length; j++) {
                var txt = (spans[j].textContent || '').trim().toLowerCase();
                if (txt === 'criar' || txt === 'create' || txt === 'generate' || txt === 'submit') {
                  var btnSpan = spans[j].closest('button');
                  if (btnSpan) {
                    foundBtn = btnSpan;
                    break;
                  }
                }
              }
            }

            // Opção 3: seletores de fallback
            if (!foundBtn) {
              var selectors = [
                'button[aria-label*="Generate"]',
                'button[aria-label*="generate"]',
                'button[aria-label*="Create"]',
                'button[aria-label*="create"]',
                'button[aria-label*="Submit"]',
                'button[aria-label*="submit"]',
                'button[aria-label*="Send"]',
                'button[type="submit"]'
              ];
              for (var k = 0; k < selectors.length; k++) {
                var btnSel = document.querySelector(selectors[k]);
                if (btnSel) {
                  foundBtn = btnSel;
                  break;
                }
              }
            }

            if (!foundBtn) return { found: false, disabled: true };

            var disabled = foundBtn.hasAttribute('disabled') || 
                            foundBtn.disabled || 
                            foundBtn.getAttribute('aria-disabled') === 'true' || 
                            foundBtn.getAttribute('data-state') === 'closed';

            if (!disabled) {
              foundBtn.click();
              return { found: true, disabled: false, clicked: true };
            }

            return { found: true, disabled: true, clicked: false };
          })()`) as { found: boolean; disabled: boolean; clicked?: boolean };

          if (result.clicked) {
            submitClicked = true;
            console.log(`✅ [Flow] Botão de submit liberado e clicado com sucesso!`);
            break;
          } else if (result.found && result.disabled) {
            console.log(`⏳ [Flow] Botão de submit encontrado, mas bloqueado. Aguardando liberação... (${attempts + 1}/${maxAttempts})`);
          } else {
            console.log(`🔎 [Flow] Buscando botão de submit... (${attempts + 1}/${maxAttempts})`);
          }
        } catch (e: any) {
          console.warn(`⚠️ [Flow] Erro temporário ao consultar botão de submit:`, e.message);
        }

        await new Promise(r => setTimeout(r, 500));
        attempts++;
      }

      if (!submitClicked) {
        throw new Error('Timeout: Botão de submit não foi encontrado ou não foi liberado em tempo hábil.');
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
        
        let baseName = '';
        try {
          const urlObj = new URL(absPath);
          baseName = pathModule.basename(urlObj.pathname);
        } catch {
          baseName = pathModule.basename(absPath.split('?')[0]);
        }
        
        if (!baseName || baseName === '/' || baseName.trim() === '') {
          baseName = `temp_ref_${targetFrame}_${Buffer.from(absPath).toString('base64').substring(0, 10)}.jpg`;
        }
        
        // Mantém constância do hash/nome da imagem (ex para cruzar dados locais com online)
        const tempFilename = `flow_temp_${baseName}`;
        const tempPath = pathModule.join(this.outputDir, tempFilename);

        if (!fs.existsSync(tempPath)) {
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
        } else {
          console.log(`🖼️ [Flow] Arquivo base local já existe, reutilizando: ${tempFilename}`);
        }
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

          // NOVO: Verificar se a imagem já existe na galeria!
          const filenameOrig = pathModule.basename(absPath);
          const filenameEscaped = JSON.stringify(filenameOrig);
          // Tentativa de extrair hash de 36 caracteres
          let hashMatchText = filenameOrig.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
          const hashStrValue = hashMatchText ? hashMatchText[1] : '';
          const hashEscaped = JSON.stringify(hashStrValue);
          
          let clickedExistingInGallery = await this.page.evaluate(`(function() {
            var filenameStr = ${filenameEscaped}.toLowerCase();
            var hashStr = ${hashEscaped}.toLowerCase();
            var modalImgs = document.querySelectorAll('div[data-testid="virtuoso-item-list"] div[data-known-size="56"] img');
            for (var i = 0; i < modalImgs.length; i++) {
              var img = modalImgs[i];
              var altText = (img.getAttribute('alt') || '').toLowerCase();
              var pDiv = img.parentElement ? (img.parentElement.textContent || '') : '';
              var srcUrl = (img.getAttribute('src') || '').toLowerCase();
              
              if (
                altText.indexOf(filenameStr) !== -1 || 
                pDiv.toLowerCase().indexOf(filenameStr) !== -1 ||
                (hashStr !== "" && srcUrl.indexOf(hashStr) !== -1)
              ) {
                var clickableDiv = img.parentElement;
                if (clickableDiv) {
                  clickableDiv.click();
                  return true;
                }
              }
            }
            return false;
          })()`) as boolean;

          if (clickedExistingInGallery) {
            console.log(`✅ [Flow] Imagem de referência já existente clicada na galeria: ${filenameOrig}`);
            uploadSuccess = true;
            await this.randomDelay(800, 1200);
          } else {
            console.log(`🔎 [Flow] Imagem não encontrada na galeria. Prosseguindo genérico upload...`);
            const futureFileChooser = this.page.waitForFileChooser({ timeout: 8000 }).catch(() => null);

            // 2. Procura globalmente o gatilho de "upload" dentro da janela modal.
            // O Flow já alternou entre <button> e <div role/cursor> com ícone "upload".
            let clickedUploadBtn = (await this.page.evaluate(`(function() {
                function isVisible(el) {
                  if (!el || !el.getBoundingClientRect) return false;
                  var rect = el.getBoundingClientRect();
                  if (rect.width === 0 || rect.height === 0) return false;
                  var style = window.getComputedStyle(el);
                  if (!style) return true;
                  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                  return true;
                }

                function hasUploadText(el) {
                  if (!el) return false;
                  var text = (el.textContent || '').toLowerCase().trim();
                  return text.indexOf('upload') !== -1 ||
                         text.indexOf('from your device') !== -1 ||
                         text.indexOf('faça upload') !== -1 ||
                         text.indexOf('faca upload') !== -1;
                }

                function isClickable(el) {
                  if (!el || el.nodeType !== 1) return false;
                  var tag = (el.tagName || '').toLowerCase();
                  if (tag === 'button' || tag === 'label') return true;
                  var role = (el.getAttribute('role') || '').toLowerCase();
                  if (role === 'button') return true;
                  if (el.hasAttribute('onclick')) return true;
                  var tabIndex = el.getAttribute('tabindex');
                  if (tabIndex !== null && tabIndex !== '-1') return true;
                  var style = window.getComputedStyle(el);
                  return !!style && style.cursor === 'pointer';
                }

                function findClickable(el) {
                  var current = el;
                  for (var depth = 0; depth < 6 && current; depth++) {
                    if (isClickable(current) && isVisible(current)) return current;
                    current = current.parentElement;
                  }
                  return null;
                }

                // Passo 1: layout antigo (botão com texto/ícone upload)
                var uploadBtns = document.querySelectorAll('button');
                for (var i = uploadBtns.length - 1; i >= 0; i--) {
                  var btn = uploadBtns[i];
                  if (!isVisible(btn)) continue;

                  var icon = btn.querySelector('i');
                  var iconText = icon ? (icon.textContent || '').toLowerCase().trim() : '';
                  var hasUploadIcon = iconText === 'upload' || iconText === 'file_upload';

                  if (hasUploadIcon || hasUploadText(btn)) {
                    btn.click();
                    return true;
                  }
                }

                // Passo 2: layout novo (wrapper div/span com ícone upload)
                var icons = document.querySelectorAll('i');
                for (var k = icons.length - 1; k >= 0; k--) {
                  var iEl = icons[k];
                  if (!isVisible(iEl)) continue;

                  var iText = (iEl.textContent || '').toLowerCase().trim();
                  if (iText !== 'upload' && iText !== 'file_upload') continue;

                  var clickable = findClickable(iEl) || findClickable(iEl.parentElement) || iEl.parentElement;
                  if (!clickable || !isVisible(clickable)) continue;

                  if (!hasUploadText(clickable)) {
                    var parent = clickable.parentElement;
                    if (!parent || !hasUploadText(parent)) continue;
                    var parentClickable = findClickable(parent) || parent;
                    if (!isVisible(parentClickable)) continue;
                    parentClickable.click();
                    return true;
                  }

                  clickable.click();
                  return true;
                }

                // Passo 3: fallback final para qualquer elemento clicável com texto de upload
                var candidates = document.querySelectorAll('[role="button"], div, span');
                for (var m = candidates.length - 1; m >= 0; m--) {
                  var node = candidates[m];
                  if (!isVisible(node) || !hasUploadText(node)) continue;
                  var nodeClickable = findClickable(node) || node;
                  if (!isVisible(nodeClickable)) continue;
                  nodeClickable.click();
                  return true;
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
              console.warn(`⚠️ [Flow] Falha ao encontrar elemento de upload dentro do modal aberto.`);
              try { await this.page.keyboard.press('Escape'); } catch { } // Força escape para destravar a tela
            }
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
        
        let baseName = '';
        try {
          const urlObj = new URL(absPath);
          baseName = pathModule.basename(urlObj.pathname);
        } catch {
          baseName = pathModule.basename(absPath.split('?')[0]);
        }
        
        if (!baseName || baseName === '/' || baseName.trim() === '') {
          baseName = `temp_ingredient_${Buffer.from(absPath).toString('base64').substring(0, 10)}.jpg`;
        }
        
        // Garante a mesma constância de nome para reaproveitamento
        const tempFilename = `flow_temp_${baseName}`;
        const tempPath = pathModule.join(this.outputDir, tempFilename);

        if (!fs.existsSync(tempPath)) {
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
        } else {
          console.log(`🧪 [Flow] Arquivo local já existe, reutilizando: ${tempFilename}`);
        }
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

      await this.randomDelay(800, 1200);

      // NOVO: Verificar se a imagem já existe na galeria!
      const filename = pathModule.basename(absPath);
      let clickedExisting = false;

      // Executando no contexto do browser para ser mais rápido e tolerante a DOM voador (como no virtuoso-scroller)
      const filenameEscaped = JSON.stringify(filename);
      // Tentativa de extrair hash de 36 caracteres do nome do arquivo (ex: para reaproveitar imagens geradas pelo Flow)
      let hashMatchText = filename.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      const hashStrValue = hashMatchText ? hashMatchText[1] : '';
      const hashEscaped = JSON.stringify(hashStrValue);
      
      const existingClicked = await this.page.evaluate(`(function() {
        var filenameStr = ${filenameEscaped}.toLowerCase();
        var hashStr = ${hashEscaped}.toLowerCase();
        var virtuosoItems = document.querySelectorAll('div[data-testid="virtuoso-item-list"] div[data-known-size="56"] img');
        for (var i = 0; i < virtuosoItems.length; i++) {
          var img = virtuosoItems[i];
          var altText = (img.getAttribute('alt') || '').toLowerCase();
          var pDiv = img.parentElement ? (img.parentElement.textContent || '') : '';
          var srcUrl = (img.getAttribute('src') || '').toLowerCase();
          
          if (
            altText.indexOf(filenameStr) !== -1 || 
            pDiv.toLowerCase().indexOf(filenameStr) !== -1 ||
            (hashStr !== "" && srcUrl.indexOf(hashStr) !== -1)
          ) {
            // Clica na div wrapper (jUfWAo, etc) para selecionar
            var clickableDiv = img.parentElement;
            if (clickableDiv) {
              clickableDiv.click();
              return true;
            }
          }
        }
        return false;
      })()`);

      if (existingClicked) {
        console.log(`✅ [Flow] Imagem existente já selecionada da galeria: ${filename}`);
        await this.randomDelay(800, 1200);
        
        // Clica fora para fechar o popover (pode usar o botão X ou Escape)
        try { await this.page.keyboard.press('Escape'); } catch (e) { /* ignore */ }
        return true;
      }

      console.log(`🔎 [Flow] Imagem não encontrada na galeria. Prosseguindo para upload de arquivo local...`);

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
        if (hasUploadIcon || text.includes('upload') || text.includes('fa\u00e7a upload') || text.includes('from your device')) {
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

        console.log(`⏳ [Flow] Aguardando processamento da imagem do ingrediente...`);
        const maxWaitMs = 60000; // Máximo de 60 segundos
        const startWait = Date.now();
        let isImageReady = false;

        while (Date.now() - startWait < maxWaitMs) {
          isImageReady = (await this.page.evaluate(`(function() {
             var imgs = document.querySelectorAll('img');
             var uploadingFound = false;
             var uploadedFound = false;
             
             for (var i = 0; i < imgs.length; i++) {
                var img = imgs[i];
                var src = img.getAttribute('src') || '';
                
                if (src.indexOf('/fx/api/trpc/media') !== -1 || src.indexOf('blob:') === 0) {
                   var style = window.getComputedStyle(img);
                   var pNode = img.parentNode;
                   var pOpacity = pNode ? window.getComputedStyle(pNode).opacity : '1';
                   
                   if (style.opacity === '0' || pOpacity === '0') {
                      uploadingFound = true;
                   } else {
                      uploadedFound = true;
                   }
                }
             }
             
             // Se detectou qualquer imagem no DOM que ainda está com opacidade 0 (carregando), recusa
             if (uploadingFound) return false;
             // Se tem imagens totalmente sólidas (opacidade normal) e nenhuma em andamento, aceita
             if (uploadedFound) return true;
             
             return false;
          })()`)) as boolean;

          if (isImageReady) {
            break;
          }
          await new Promise(r => setTimeout(r, 1000));
        }

        if (isImageReady) {
           console.log(`✅ [Flow] Ingrediente processado e estabilizado! (${Math.round((Date.now() - startWait) / 1000)}s)`);
        } else {
           console.warn(`⚠️ [Flow] Timeout ao aguardar processamento total da nova imagem. Apenas seguindo em frente...`);
        }

        // Fechar qualquer dialog aberto (fallback de segurança caso o modal de upload não feche sozinho)
        try { await this.page.keyboard.press('Escape'); } catch (e) { /* ignore */ }
        return true;
      } else {
        console.warn(`⚠️ [Flow] FileChooser não foi detectado após todas as tentativas.`);
        try { await this.page.keyboard.press('Escape'); } catch (e) { /* ignore */ }
        return false;
      }

    } catch (error: any) {
      console.error(`❌ [Flow] Erro ao enviar ingrediente:`, error.message);
      return false;
    }
  }

  /**
   * Aguarda a geração do vídeo monitorando o DOM via match de prompt.
   * Busca containers [data-index] cujo texto do prompt corresponde ao prompt enviado,
   * e verifica se as tiles dentro dele têm mídia concluída.
   * Isso permite processar múltiplas cenas em lote (4 por vez), pois cada resultado
   * é associado ao seu prompt original pelo texto visível.
   */
  private async waitForVideoGeneration(
    timeoutMs: number,
    searchPrompt: string,
    knownTileIds: string[],
    onPercent?: (percent: number) => void
  ): Promise<string | null> {
    if (!this.page) return null;

    const startTime = Date.now();
    const pollInterval = 3000;
    let lastPercent = 10;

    // Normalizar o prompt para comparação: lowercase, sem espaços extras
    const normalizedPrompt = searchPrompt.trim().toLowerCase();
    // Usar os primeiros 40 chars do prompt para match (evita problemas com truncamento na UI)
    const promptPrefix = normalizedPrompt.substring(0, 850);

    console.log(`⏳ [Flow] Aguardando geração do vídeo por match de prompt (timeout: ${timeoutMs / 1000}s)...`);
    console.log(`🔍 [Flow] Buscando prompt prefix: "${promptPrefix}"`);

    while (Date.now() - startTime < timeoutMs) {
      try {
        // 1. Buscar mídia concluída no container cujo prompt corresponde
        const promptPrefixEscaped = JSON.stringify(normalizedPrompt);
        const knownTileIdsEscaped = JSON.stringify(knownTileIds);
        const completedVideoUrl = await this.page.evaluate(`(function() {
          var promptPrefix = ${promptPrefixEscaped};
          var knownIds = ${knownTileIdsEscaped};
          
          // Estratégia 1: Encontrar containers [data-index] que contêm o prompt
          var containers = document.querySelectorAll('[data-index]');
          
          for (var ci = 0; ci < containers.length; ci++) {
            var container = containers[ci];
            
            // Buscar o texto do prompt dentro do container
            // O prompt fica em divs com texto visível (ex: classe sc-21e778e8-1)
            var promptDivs = container.querySelectorAll('div[class*="prompt"], div[data-allow-text-selection] div div');
            var foundPrompt = false;
            
            // Fallback: buscar em todos os divs do container
            if (promptDivs.length === 0) {
              promptDivs = container.querySelectorAll('div');
            }
            
            for (var pd = 0; pd < promptDivs.length; pd++) {
              var divText = (promptDivs[pd].textContent || '').trim().toLowerCase();
              var cleanDiv = divText.replace(/\\s+/g, '');
              var cleanPrefix = promptPrefix.replace(/\\s+/g, '');
              var matchLen = Math.min(cleanPrefix.length, 120);
              
              if (cleanDiv.length > 0 && cleanDiv.indexOf(cleanPrefix.substring(0, matchLen)) !== -1) {
                foundPrompt = true;
                break;
              }
            }
            
            if (!foundPrompt) continue;
            
            // Encontrado! Agora verificar as tiles deste container
            var tiles = container.querySelectorAll('[data-tile-id]');
            for (var ti = 0; ti < tiles.length; ti++) {
              var tile = tiles[ti];
              var tileId = tile.getAttribute('data-tile-id');
              
              // Ignorar tiles (mídias) que já existiam antes de submeter o prompt (mesmo que o prompt de texto match)
              if (tileId && knownIds.indexOf(tileId) !== -1) continue;
              
              var tileText = tile.textContent || '';
              
              // Se ainda está gerando (tem %), pular
              if (tileText.indexOf('%') !== -1) continue;
              
              // Verificar se tem ícone warning (falha)
              var icons = tile.querySelectorAll('i');
              var hasWarning = false;
              for (var wi = 0; wi < icons.length; wi++) {
                if ((icons[wi].textContent || '').trim() === 'warning') { hasWarning = true; break; }
              }
              if (hasWarning) continue;
              
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
                  if (src.indexOf('/') === 0) src = 'https://labs.google' + src;
                  if (src.indexOf('.svg') === -1 && src.indexOf('data:image') === -1) {
                    return src;
                  }
                }
              }
            }
          }
          
          // Estratégia 2 (fallback): Se não encontrou container por [data-index],
          // buscar pelo botão "reuse-prompt-button" próximo do texto do prompt
          var allTextDivs = document.querySelectorAll('div');
          for (var td = 0; td < allTextDivs.length; td++) {
            var dv = allTextDivs[td];
            var dvText = (dv.textContent || '').trim().toLowerCase();
            if (dvText.length < 2 || dvText.length > 500) continue;
            
            var cDiv = dvText.replace(/\\s+/g, '');
            var cPref = promptPrefix.replace(/\\s+/g, '');
            var mLen = Math.min(cPref.length, 120);
            if (cDiv.indexOf(cPref.substring(0, mLen)) === -1) continue;
            
            // Encontrou o div com o prompt, subir até o container [data-index]
            var parent = dv;
            for (var up = 0; up < 15; up++) {
              parent = parent.parentElement;
              if (!parent) break;
              if (parent.hasAttribute('data-index')) break;
            }
            if (!parent || !parent.hasAttribute('data-index')) continue;
            
            var fallbackTiles = parent.querySelectorAll('[data-tile-id]');
            for (var ft = 0; ft < fallbackTiles.length; ft++) {
              var ftile = fallbackTiles[ft];
              var ftileId = ftile.getAttribute('data-tile-id');
              if (ftileId && knownIds.indexOf(ftileId) !== -1) continue;
              
              if ((ftile.textContent || '').indexOf('%') !== -1) continue;
              
              var fIcons = ftile.querySelectorAll('i');
              var fHasWarn = false;
              for (var fw = 0; fw < fIcons.length; fw++) {
                if ((fIcons[fw].textContent || '').trim() === 'warning') { fHasWarn = true; break; }
              }
              if (fHasWarn) continue;
              
              var fMedia = ftile.querySelectorAll('video, video source, a[download], a[href], img');
              for (var fm = 0; fm < fMedia.length; fm++) {
                var fSrc = fMedia[fm].getAttribute('src') || fMedia[fm].getAttribute('href') || '';
                if (
                  fSrc.indexOf('getMediaUrlRedirect') !== -1 || 
                  fSrc.indexOf('/fx/api/trpc/media') !== -1 ||
                  fSrc.indexOf('.mp4') !== -1 ||
                  fSrc.indexOf('blob:') === 0 ||
                  fSrc.indexOf('googleusercontent') !== -1 ||
                  fSrc.indexOf('storage.googleapis') !== -1
                ) {
                  if (fSrc.indexOf('/') === 0) fSrc = 'https://labs.google' + fSrc;
                  if (fSrc.indexOf('.svg') === -1 && fSrc.indexOf('data:image') === -1) {
                    return fSrc;
                  }
                }
              }
            }
          }
          
          return null;
        })()`) as string | null;

        if (completedVideoUrl) {
          console.log(`✅ [Flow] Vídeo encontrado por match de prompt! URL: ${completedVideoUrl.substring(0, 80)}`);
          return completedVideoUrl;
        }

        // 2. Verificar erros via toasts (policy error, rate limit, queue full)
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

        // 3. Verificar card de falha nos containers que matcham o prompt
        const promptPrefixEscaped2 = JSON.stringify(promptPrefix);
        const tileStatus = await this.page.evaluate(`(function() {
          var promptPrefix = ${promptPrefixEscaped2};
          var containers = document.querySelectorAll('[data-index]');
          var hasAnyActive = false;
          var failedText = null;

          for (var ci = 0; ci < containers.length; ci++) {
            var container = containers[ci];
            var allDivs = container.querySelectorAll('div');
            var foundPrompt = false;
            
            for (var pd = 0; pd < allDivs.length; pd++) {
              var divText = (allDivs[pd].textContent || '').trim().toLowerCase();
              var cleanDiv = divText.replace(/\\s+/g, '');
              var cleanPrefix = promptPrefix.replace(/\\s+/g, '');
              var matchLen = Math.min(cleanPrefix.length, 120);
              if (cleanDiv.length > 0 && cleanDiv.indexOf(cleanPrefix.substring(0, matchLen)) !== -1) {
                foundPrompt = true;
                break;
              }
            }
            if (!foundPrompt) continue;
            
            var tiles = container.querySelectorAll('[data-tile-id]');
            for (var ti = 0; ti < tiles.length; ti++) {
              var tile = tiles[ti];
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
          }

          if (failedText !== null && !hasAnyActive) { return { failed: true, text: failedText }; }
          return { failed: false, text: null };
        })()`) as { failed: boolean; text: string | null };

        if (tileStatus.failed) {
          console.error(`❌ [Flow] Card de falha detectado para prompt: "${(tileStatus.text || '').substring(0, 100)}"`);
          throw new Error(`Flow retornou falha: ${tileStatus.text || 'Algo deu errado.'}`);
        }
        if (tileStatus.text !== null) {
          console.warn(`⚠️ [Flow] Warning em tile ignorado — geração ativa em outra tile`);
        }

        // 4. Ler progresso real do Flow dentro do container que matcha o prompt
        let realPercent = 0;
        const promptPrefixEscaped3 = JSON.stringify(promptPrefix);
        const activeTilePercent = await this.page.evaluate(`(function() {
          var promptPrefix = ${promptPrefixEscaped3};
          var containers = document.querySelectorAll('[data-index]');
          
          for (var ci = 0; ci < containers.length; ci++) {
            var container = containers[ci];
            var allDivs = container.querySelectorAll('div');
            var foundPrompt = false;
            
            for (var pd = 0; pd < allDivs.length; pd++) {
              var divText = (allDivs[pd].textContent || '').trim().toLowerCase();
              var cleanDiv = divText.replace(/\\s+/g, '');
              var cleanPrefix = promptPrefix.replace(/\\s+/g, '');
              var matchLen = Math.min(cleanPrefix.length, 120);
              if (cleanDiv.length > 0 && cleanDiv.indexOf(cleanPrefix.substring(0, matchLen)) !== -1) {
                foundPrompt = true;
                break;
              }
            }
            if (!foundPrompt) continue;
            
            var tiles = container.querySelectorAll('[data-tile-id]');
            for (var ti = 0; ti < tiles.length; ti++) {
              var tile = tiles[ti];
              var spans = tile.querySelectorAll('div, span');
              for (var s = 0; s < spans.length; s++) {
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
        try {
          if (this.browser && this.browser.isConnected()) {
            await this.browser.close();
          }
        } catch { }

        if (this.ownedChromeProcess && this.ownedChromeProcess.exitCode === null) {
          try { this.ownedChromeProcess.kill(); } catch { }
        }

        this.ownedChromeProcess = null;
        this.browser = null;
        this.page = null;
        console.log(`🔌 [Flow] Navegador fechado`);
      }
    } catch (error) {
      console.error(`❌ [Flow] Erro ao fechar:`, error);
      // Garante que o estado é resetado mesmo em caso de erro
      if (this.ownedChromeProcess && this.ownedChromeProcess.exitCode === null) {
        try { this.ownedChromeProcess.kill(); } catch { }
      }
      this.ownedChromeProcess = null;
      this.browser = null;
      this.page = null;
      this.usingSharedBrowser = false;
    }
  }

  getPage(): Page | null {
    return this.page;
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
   * Gera imagens usando o Google Flow no modo "Criar imagens".
   * Retorna até `count` imagens baixadas como arquivos locais.
   */
  async generateImages(
    prompt: string,
    count: number = 1,
    onProgress?: FlowProgressCallback,
    model: string = '🍌 Nano Banana 2',
    aspectRatio?: string,
    ingredientImagePaths?: string[]
  ): Promise<FlowImageResult> {
    const startTime = Date.now();
    const hasIngredients = ingredientImagePaths && ingredientImagePaths.length > 0;

    const emit = (stage: any, message: string, percent?: number) => {
      console.log(`🖼️ [Flow/Img] ${message}`);
      onProgress?.({ stage, message, percent });
    };

    // ── Passo 1: aguardar slot de polling (máx. 4 gerações simultâneas no Flow) ──
    emit('submitting', 'Aguardando slot de geração disponível...');
    await FlowVideoProvider.acquireConcurrencySlot();
    let slotReleased = false;
    const releaseSlot = () => {
      if (!slotReleased) { slotReleased = true; FlowVideoProvider.releaseConcurrencySlot(); }
    };

    // ── Passo 2: aguardar mutex de submissão (acesso exclusivo ao browser DOM) ──
    let submitMutexHeld = false;
    const releaseSubmitMutexIfHeld = () => {
      if (!submitMutexHeld) return;
      submitMutexHeld = false;
      FlowVideoProvider.releaseSubmitMutex();
    };

    emit('submitting', 'Aguardando vez de submeter prompt no browser...');
    await FlowVideoProvider.acquireSubmitMutex();
    submitMutexHeld = true;

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

      // Trazer a aba para o foreground para evitar que Chrome congele o Execution Context
      try { await this.page.bringToFront(); } catch (e) {}

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

      // 3c. Remover imagens de referência anteriores
      if (hasIngredients) {
        await this.clearExistingReferenceImages();
      }

      // 4. Enviar imagens de ingredientes (referências para a geração de imagem)
      if (hasIngredients && ingredientImagePaths) {
        emit('submitting', `Enviando ${ingredientImagePaths.length} imagem(ns) de referência...`, 6);
        let uploadedIngredients = 0;
        for (const imgPath of ingredientImagePaths) {
          if (!imgPath) continue;
          const success = await this.uploadIngredientImage(imgPath);
          if (success) {
            uploadedIngredients++;
            emit('submitting', `${uploadedIngredients}/${ingredientImagePaths.length} referências enviadas`, 7 + uploadedIngredients);
            await this.randomDelay(800, 1500);
          } else {
            console.warn(`⚠️ [Flow/Img] Falha ao enviar referência: ${imgPath}`);
          }
        }
        if (uploadedIngredients < ingredientImagePaths.length) {
           console.warn(`⚠️ [Flow/Img] Apenas ${uploadedIngredients} de ${ingredientImagePaths.length} referências foram enviadas.`);
        }
      }

      // 5. Guardar o prompt e as tiles velhas para fazer match de mídias novas
      const knownTileIds = (await this.page!.evaluate(`(function() {
        var arr = [];
        var nodes = document.querySelectorAll('[data-tile-id]');
        for (var i = 0; i < nodes.length; i++) {
          var id = nodes[i].getAttribute('data-tile-id');
          if (id) arr.push(id);
        }
        return arr;
      })()`)) as string[] || [];
      const searchPrompt = prompt;
      emit('submitting', 'Prompt será rastreado por match de texto...', 15);
      console.log(`🔍 [Flow/Img] Match por prompt: "${searchPrompt.substring(0, 60)}..."`);
      const baselineErrorToasts = await this.getErrorToastCounts();

      // 6. Submeter prompt
      emit('submitting', 'Digitando prompt...', 20);
      const submitted = await this.submitPrompt(prompt);
      if (!submitted) throw new Error('Não foi possível localizar o campo de prompt no Flow.');

      // Submissão concluída — liberar o mutex para que o próximo prompt possa iniciar
      await this.clearPromptPanel();
      releaseSubmitMutexIfHeld();
      emit('generating', 'Prompt enviado! Polling em paralelo...', 25);

      // ── Polling roda em paralelo com outras gerações ──
      const timeoutMs = this.config.generationTimeoutMs!;
      const pollInterval = 2000;
      let elapsed = 0;
      let newImageUrls: string[] = [];
      const normalizedPrompt = searchPrompt.trim().toLowerCase();
      const promptPrefix = normalizedPrompt.substring(0, 850);

      while (elapsed < timeoutMs) {
        await new Promise(r => setTimeout(r, pollInterval));
        elapsed += pollInterval;

        try {
          const promptPrefixEscaped = JSON.stringify(promptPrefix);
          const knownTileIdsEscaped = JSON.stringify(knownTileIds);
          const result = await this.page!.evaluate(`(function() {
            var promptPrefixStr = ${promptPrefixEscaped};
            var knownIds = ${knownTileIdsEscaped};
            var completed = [];
            var maxProgress = 0;
            var matchingTileCount = 0;
            var failedTileCount = 0;

            var containers = document.querySelectorAll('[data-index]');
            for (var ci = 0; ci < containers.length; ci++) {
              var container = containers[ci];
              
              var promptDivs = container.querySelectorAll('div[class*="prompt"], div[data-allow-text-selection] div div');
              var foundPrompt = false;
              if (promptDivs.length === 0) {
                promptDivs = container.querySelectorAll('div');
              }
              for (var pd = 0; pd < promptDivs.length; pd++) {
                var divText = (promptDivs[pd].textContent || '').trim().toLowerCase();
                var cleanDiv = divText.replace(/\\s+/g, '');
                var cleanPrefix = promptPrefixStr.replace(/\\s+/g, '');
                var matchLen = Math.min(cleanPrefix.length, 850);
                if (cleanDiv.length > 0 && cleanDiv.indexOf(cleanPrefix.substring(0, matchLen)) !== -1) {
                  foundPrompt = true;
                  break;
                }
              }
              
              if (!foundPrompt) continue;
              
              // Deduplicar tiles por ID: o DOM do Flow tem 2 elementos [data-tile-id] por tile
              // (outer e inner). Precisamos do OUTERMOST porque ele contém o progress overlay
              // com o ícone 'image'. O inner NÃO contém esse ícone, causando falsos positivos.
              var allTileElements = container.querySelectorAll('[data-tile-id]');
              var seenTileIds = {};
              for (var ti = 0; ti < allTileElements.length; ti++) {
                var tile = allTileElements[ti];
                var tileId = tile.getAttribute('data-tile-id');
                if (!tileId) continue;
                if (knownIds.indexOf(tileId) !== -1) continue; // Pular tiles velhas
                if (seenTileIds[tileId]) continue; // Pular inner duplicado (já processamos o outer)
                seenTileIds[tileId] = true;
                
                matchingTileCount++;
                var tileText = tile.textContent || '';

                // -- Tracking de progresso --
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

                // Checar falha: precisa de warning icon + texto "Falha"/"Failed" + sem progresso
                var icons = tile.querySelectorAll('i');
                var hasWarning = false;
                var hasProgressIcon = false;
                for (var ii = 0; ii < icons.length; ii++) {
                  var iconText = (icons[ii].textContent || '').trim();
                  if (iconText === 'warning') hasWarning = true;
                  if (iconText === 'image' || iconText === 'videocam') hasProgressIcon = true;
                }
                var hasFailText = (tileText.indexOf('Falha') !== -1 || tileText.indexOf('Failed') !== -1);
                if (hasWarning && !hasProgressIcon && hasFailText) { failedTileCount++; }

                // -- Coleta de imagens --
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
                    for (var ci2 = 0; ci2 < completed.length; ci2++) { if (completed[ci2] === s) { dup = true; break; } }
                    if (!dup) completed.push(s);
                  }
                }
              }
            }
            return { completed: completed, maxProgress: maxProgress, matchingTileCount: matchingTileCount, failedTileCount: failedTileCount };
          })()`) as { completed: string[]; maxProgress: number; matchingTileCount: number; failedTileCount: number };

          // Reportar progresso
          if (result.maxProgress > 0) {
            const mapped = Math.min(85, 25 + Math.round(result.maxProgress * 0.6));
            emit('generating', `Gerando imagens... ${result.completed.length}/${count} prontas (${result.maxProgress}%)`, mapped);
          } else {
            const pct = Math.min(85, 25 + Math.round((elapsed / timeoutMs) * 60));
            emit('generating', `Gerando imagens... ${result.completed.length}/${count} prontas (${Math.round(elapsed / 1000)}s)`, pct);
          }

          // Todos os tiles resolvidos (concluídos + falhados ≥ count) → prosseguir com download
          const resolvedCount = result.completed.length + result.failedTileCount;
          if (result.completed.length > 0 && resolvedCount >= count) {
            console.log(`✅ [Flow/Img] ${result.completed.length} concluída(s), ${result.failedTileCount} falhada(s) — todos os ${count} tiles resolvidos`);
            newImageUrls = result.completed.slice(0, Math.max(count, 4));
            break;
          }

          // Mesmo que nem todos estejam resolvidos, se já temos count imagens concluídas, podemos sair
          if (result.completed.length >= count) {
            console.log(`✅ [Flow/Img] ${result.completed.length}/${count} imagem(ns) concluída(s) — todas prontas`);
            newImageUrls = result.completed.slice(0, count);
            break;
          }

          // Log de progresso parcial
          if (result.completed.length > 0) {
            console.log(`⏳ [Flow/Img] ${result.completed.length}/${count} prontas, ${result.failedTileCount} falhadas, aguardando mais...`);
          }

          // Se TODOS os tiles do nosso prompt falharam (nenhum concluído e nenhum em progresso), lançar erro
          if (result.failedTileCount > 0 && result.failedTileCount >= result.matchingTileCount && result.completed.length === 0 && result.maxProgress === 0) {
            throw new Error('Flow retornou falha: todos os tiles com o prompt atual falharam.');
          }

          // Verificar apenas toasts novos (ignora toast antigo preso na UI)
          const currentErrorToasts = await this.getErrorToastCounts();
          const newToastMsg = this.findNewErrorToastMessage(baselineErrorToasts, currentErrorToasts);
          if (newToastMsg) {
            throw new Error(`Flow reportou erro: ${newToastMsg.substring(0, 200)}`);
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
      const promptPrefixEscaped2 = JSON.stringify(promptPrefix);
      const knownTileIdsEscaped2 = JSON.stringify(knownTileIds);
      const mediaRedirectUrls = await this.page!.evaluate(`(function() {
        var results = [];
        var promptPrefixStr = ${promptPrefixEscaped2};
        var knownIds = ${knownTileIdsEscaped2};
        var containers = document.querySelectorAll('[data-index]');
        
        for (var b = 0; b < containers.length; b++) {
          var container = containers[b];
          
          var promptDivs = container.querySelectorAll('div[class*="prompt"], div[data-allow-text-selection] div div');
          var foundPrompt = false;
          if (promptDivs.length === 0) {
            promptDivs = container.querySelectorAll('div');
          }
          for (var pd = 0; pd < promptDivs.length; pd++) {
            var divText = (promptDivs[pd].textContent || '').trim().toLowerCase();
            var cleanDiv = divText.replace(/\\s+/g, '');
            var cleanPrefix = promptPrefixStr.replace(/\\s+/g, '');
            var matchLen = Math.min(cleanPrefix.length, 120);
            if (cleanDiv.length > 0 && cleanDiv.indexOf(cleanPrefix.substring(0, matchLen)) !== -1) {
              foundPrompt = true;
              break;
            }
          }
          if (!foundPrompt) continue;
          
          var isOldContainer = false;
          var tiles = container.querySelectorAll('[data-tile-id]');
          for (var t = 0; t < tiles.length; t++) {
             var tId = tiles[t].getAttribute('data-tile-id');
             if (tId && knownIds.indexOf(tId) !== -1) {
                isOldContainer = true;
                break;
             }
          }
          if (isOldContainer) continue;
          
          // Coletar img[src] deste batch
          var imgs = container.querySelectorAll('img[src]');
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

      // Obter cookies da sessão Puppeteer para autenticar os requests server-side
      const pageCookies = await this.page!.cookies();
      const cookieStr = pageCookies.map(c => `${c.name}=${c.value}`).join('; ');

      for (let i = 0; i < urlsToProcess.length; i++) {
        const redirectUrl = urlsToProcess[i];
        emit('downloading', `Baixando imagem ${i + 1} de ${urlsToProcess.length}...`, 90 + Math.round((i / urlsToProcess.length) * 8));

        const MAX_RETRIES = 3;
        let downloaded = false;

        for (let attempt = 1; attempt <= MAX_RETRIES && !downloaded; attempt++) {
          try {
            if (attempt > 1) {
              console.log(`🔄 [Flow/Img] Tentativa ${attempt}/${MAX_RETRIES} para imagem ${i + 1}...`);
              await new Promise(r => setTimeout(r, 2000 * attempt));
            }

            // 8b. Seguir redirect server-side com cookies (evita CORS do browser)
            const parsedRedirectUrl = new URL(redirectUrl);
            const signedUrl = await new Promise<string | null>((resolve) => {
              const reqOptions = {
                hostname: parsedRedirectUrl.hostname,
                path: parsedRedirectUrl.pathname + parsedRedirectUrl.search,
                method: 'GET',
                headers: {
                  'Cookie': cookieStr,
                  // 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                },
              };
              const req = https.request(reqOptions, (res) => {
                // Seguir 301/302/303/307 redirect → pegar Location header
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                  resolve(res.headers.location);
                } else if (res.statusCode === 200) {
                  // Não houve redirect — URL pode servir a imagem diretamente
                  // Neste caso, usar a própria URL
                  resolve(redirectUrl);
                } else {
                  console.warn(`⚠️ [Flow/Img] Redirect retornou HTTP ${res.statusCode} para imagem ${i + 1}`);
                  resolve(null);
                }
                // Consumir a resposta para liberar o socket
                res.resume();
              });
              req.on('error', (e) => {
                console.warn(`⚠️ [Flow/Img] Erro no request de redirect:`, e.message);
                resolve(null);
              });
              req.setTimeout(15000, () => { req.destroy(); resolve(null); });
              req.end();
            });

            if (!signedUrl) {
              console.warn(`⚠️ [Flow/Img] Redirect não resolveu URL para imagem ${i + 1} (tentativa ${attempt}/${MAX_RETRIES})`);
              continue;
            }
            console.log(`✅ [Flow/Img] URL resolvida: ${signedUrl.substring(0, 100)}...`);

            // 8c. Download da imagem (signed URL do GCS ou URL direta)
            const nameMatch = redirectUrl.match(/[?&]name=([^&]+)/i);
            const imageHash = nameMatch ? nameMatch[1] : `fallback-${Date.now()}-${i + 1}`;
            const filename = `flow-image-${imageHash}.jpg`;
            const outputPath = path.join(imgOutputDir, filename);

            // Decidir se precisa de cookies (mesma origem) ou não (GCS cross-origin)
            const downloadUrl = new URL(signedUrl);
            const needsCookies = downloadUrl.hostname.includes('labs.google');
            const downloadHeaders: Record<string, string> = {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            };
            if (needsCookies) {
              downloadHeaders['Cookie'] = cookieStr;
            }

            await new Promise<void>((resolve, reject) => {
              const file = fs.createWriteStream(outputPath);
              const protocol = downloadUrl.protocol === 'https:' ? https : http;
              const req = protocol.get(signedUrl, { headers: downloadHeaders }, (res) => {
                // Seguir mais um redirect se necessário (ex: GCS pode fazer redirect)
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                  file.close();
                  // Seguir o redirect final
                  https.get(res.headers.location, (res2) => {
                    if (res2.statusCode && res2.statusCode >= 400) {
                      reject(new Error(`HTTP ${res2.statusCode} no redirect final`));
                      return;
                    }
                    const file2 = fs.createWriteStream(outputPath);
                    res2.pipe(file2);
                    file2.on('finish', () => { file2.close(); resolve(); });
                  }).on('error', reject);
                  return;
                }
                if (res.statusCode && res.statusCode >= 400) {
                  file.close();
                  reject(new Error(`HTTP ${res.statusCode} ao baixar imagem`));
                  return;
                }
                res.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
              });
              req.on('error', (e) => { file.close(); reject(e); });
            });

            const size = fs.statSync(outputPath).size;
            if (size > 500) {
              localPaths.push(outputPath);
              console.log(`✅ [Flow/Img] Imagem ${i + 1} salva: ${outputPath} (${Math.round(size / 1024)} KB)`);
              downloaded = true;
            } else {
              console.warn(`⚠️ [Flow/Img] Arquivo muito pequeno (${size}B, tentativa ${attempt}/${MAX_RETRIES}), ignorando: ${outputPath}`);
              fs.unlinkSync(outputPath);
            }
          } catch (dlErr: any) {
            console.warn(`⚠️ [Flow/Img] Erro ao baixar imagem ${i + 1} (tentativa ${attempt}/${MAX_RETRIES}):`, dlErr.message);
          }
        }

        if (!downloaded) {
          console.error(`❌ [Flow/Img] Imagem ${i + 1} não pôde ser baixada após ${MAX_RETRIES} tentativas`);
        }
      }

      if (localPaths.length === 0) {
        throw new Error('Imagens detectadas mas não foi possível baixá-las.');
      }

      const durationMs = Date.now() - startTime;
      emit('complete', `${localPaths.length} imagem(ns) gerada(s) com sucesso!`, 100);

      releaseSlot();
      return { success: true, imagePaths: localPaths, durationMs };

    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      // Garantir liberação do mutex e slot mesmo em caso de erro
      releaseSubmitMutexIfHeld();
      releaseSlot();
      emit('error', `Erro: ${error.message}`);
      console.error(`❌ [Flow/Img] Erro na geração:`, JSON.stringify(error));
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
  } else if (options) {
    flowProviderInstance.updateConfig(options);
  }
  return flowProviderInstance;
}

export async function destroyFlowVideoProvider(): Promise<void> {
  if (flowProviderInstance) {
    await flowProviderInstance.close();
    flowProviderInstance = null;
  }
}

/**
 * Cancela todas as chamadas aguardando na fila do mutex de submissão
 * e do semáforo de slots. As chamadas bloqueadas recebem um erro CANCELLED
 * e podem encerrar imediatamente.
 */
export function cancelFlowQueue(): void {
  FlowVideoProvider.cancelQueue();
}
