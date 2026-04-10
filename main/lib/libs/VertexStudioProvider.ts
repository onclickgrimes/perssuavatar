import puppeteer, { Browser, HTTPResponse, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { app, nativeImage } from 'electron';
import http from 'http';
import https from 'https';
import { ChildProcess, spawn } from 'child_process';

export interface VertexStudioConfig {
  headless?: boolean;
  outputDir?: string;
  userDataDir?: string;
  profileId?: string;
  poolSize?: number;
  generationTimeoutMs?: number;
  maxQueueSize?: number;
  studioUrl?: string;
  defaultModel?: string;
}

export interface VertexImageResult {
  success: boolean;
  imagePaths?: string[];
  error?: string;
  durationMs?: number;
}

export type VertexProgressCallback = (progress: {
  stage: 'opening' | 'navigating' | 'submitting' | 'generating' | 'downloading' | 'complete' | 'error';
  message: string;
  percent?: number;
  workerId?: number;
  jobId?: string;
  queuePosition?: number;
}) => void;

interface VertexImageJob {
  id: string;
  prompt: string;
  count: number;
  aspectRatio?: string;
  model: string;
  ingredientImagePaths?: string[];
  onProgress?: VertexProgressCallback;
  queuedAt: number;
  abortController: AbortController;
  settled: boolean;
  resolve: (result: VertexImageResult) => void;
  reject: (error: Error) => void;
}

interface VertexWorkerState {
  id: number;
  page: Page | null;
  busy: boolean;
  currentJobId?: string;
  cooldownUntil: number;
}

export class VertexStudioProvider {
  private browser: Browser | null = null;
  private workers: VertexWorkerState[] = [];
  private queue: VertexImageJob[] = [];
  private activeJobs: Map<string, VertexImageJob> = new Map();
  private config: VertexStudioConfig;
  private outputDir: string;
  private userDataDir: string;
  private ownedChromeProcess: ChildProcess | null = null;
  private connectedToExistingChrome = false;
  private initPromise: Promise<void> | null = null;
  private schedulerQueued = false;
  private drainingQueue = false;
  private closing = false;

  private static readonly DEFAULT_POOL_SIZE = 4;
  private static readonly MIN_POOL_SIZE = 1;
  private static readonly MAX_POOL_SIZE = 8;
  private static readonly DEFAULT_GENERATION_TIMEOUT_MS = 8 * 60 * 1000;
  private static readonly DEFAULT_MAX_QUEUE_SIZE = 200;
  private static readonly MAX_IMAGE_ATTEMPTS = 3;
  private static readonly RETRY_BASE_DELAY_MS = 1200;
  private static readonly RETRY_MAX_DELAY_MS = 6000;
  private static readonly INGREDIENT_SAFE_UPLOAD_BYTES = Math.floor(6.8 * 1024 * 1024);
  private static readonly DEFAULT_STUDIO_URL = 'https://console.cloud.google.com/vertex-ai/studio/multimodal;mode=prompt';
  private static readonly DEFAULT_MODEL = 'gemini-3.1-flash-image-preview';
  private static readonly SUPPORTED_MODELS = new Set([
    'gemini-3.1-flash-image-preview',
    'gemini-3-pro-image-preview',
  ]);
  private static readonly REMOTE_DEBUGGING_PORT = 9333;

  constructor(config: VertexStudioConfig = {}) {
    this.config = {
      headless: config.headless ?? false,
      poolSize: config.poolSize ?? VertexStudioProvider.DEFAULT_POOL_SIZE,
      generationTimeoutMs: config.generationTimeoutMs ?? VertexStudioProvider.DEFAULT_GENERATION_TIMEOUT_MS,
      maxQueueSize: config.maxQueueSize ?? VertexStudioProvider.DEFAULT_MAX_QUEUE_SIZE,
      profileId: config.profileId || 'default',
      studioUrl: config.studioUrl || VertexStudioProvider.DEFAULT_STUDIO_URL,
      defaultModel: this.normalizeModel(config.defaultModel) || VertexStudioProvider.DEFAULT_MODEL,
      ...config,
    };

    this.outputDir = this.config.outputDir ||
      path.join(app.getPath('userData'), 'video-projects', 'vertex-images');
    this.userDataDir = this.config.userDataDir ||
      path.join(app.getPath('userData'), 'provider-cookies', 'profiles', `vertex-studio-${this.config.profileId}`);

    this.ensureDir(this.outputDir);
    this.ensureDir(this.userDataDir);
  }

  updateConfig(options?: Partial<VertexStudioConfig>): void {
    if (!options) return;

    if (typeof options.headless === 'boolean') {
      this.config.headless = options.headless;
    }
    if (typeof options.poolSize === 'number' && Number.isFinite(options.poolSize)) {
      this.config.poolSize = this.normalizePoolSize(options.poolSize);
    }
    if (typeof options.generationTimeoutMs === 'number' && Number.isFinite(options.generationTimeoutMs)) {
      this.config.generationTimeoutMs = Math.max(15000, options.generationTimeoutMs);
    }
    if (typeof options.maxQueueSize === 'number' && Number.isFinite(options.maxQueueSize)) {
      this.config.maxQueueSize = Math.max(1, Math.floor(options.maxQueueSize));
    }
    if (typeof options.studioUrl === 'string' && options.studioUrl.trim()) {
      this.config.studioUrl = options.studioUrl.trim();
    }
    if (typeof options.defaultModel === 'string') {
      this.config.defaultModel = this.normalizeModel(options.defaultModel) || VertexStudioProvider.DEFAULT_MODEL;
    }
    if (typeof options.outputDir === 'string' && options.outputDir.trim()) {
      this.outputDir = options.outputDir.trim();
      this.ensureDir(this.outputDir);
      this.config.outputDir = this.outputDir;
    }
    if (typeof options.userDataDir === 'string' && options.userDataDir.trim()) {
      this.userDataDir = options.userDataDir.trim();
      this.ensureDir(this.userDataDir);
      this.config.userDataDir = this.userDataDir;
    }
    if (typeof options.profileId === 'string' && options.profileId.trim()) {
      this.config.profileId = options.profileId.trim();
    }

    this.scheduleDrain();
  }

  async generateImages(
    prompt: string,
    count: number = 1,
    onProgress?: VertexProgressCallback,
    aspectRatio?: string,
    ingredientImagePaths?: string[],
    model?: string
  ): Promise<VertexImageResult> {
    const safePrompt = String(prompt || '').trim();
    if (!safePrompt) {
      return { success: false, error: 'Prompt vazio.' };
    }

    await this.init();

    const maxQueue = this.config.maxQueueSize || VertexStudioProvider.DEFAULT_MAX_QUEUE_SIZE;
    if (this.queue.length >= maxQueue) {
      return { success: false, error: `Fila da Vertex cheia (${maxQueue}). Tente novamente em alguns instantes.` };
    }

    const safeCount = Math.max(1, Math.min(4, Math.floor(count || 1)));
    const filteredIngredients = (ingredientImagePaths || []).filter(Boolean).slice(0, 3);
    const selectedModel =
      this.normalizeModel(model) ||
      this.normalizeModel(this.config.defaultModel) ||
      VertexStudioProvider.DEFAULT_MODEL;

    return new Promise<VertexImageResult>((resolve, reject) => {
      const jobId = `vertex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const queuePosition = this.queue.length + this.activeJobs.size + 1;
      const job: VertexImageJob = {
        id: jobId,
        prompt: safePrompt,
        count: safeCount,
        aspectRatio,
        model: selectedModel,
        ingredientImagePaths: filteredIngredients.length > 0 ? filteredIngredients : undefined,
        onProgress,
        queuedAt: Date.now(),
        abortController: new AbortController(),
        settled: false,
        resolve,
        reject,
      };

      this.queue.push(job);
      this.emitJobProgress(
        job,
        undefined,
        'submitting',
        `Aguardando worker da Vertex... (posição ${queuePosition}, modelo: ${selectedModel})`,
        0,
        queuePosition
      );
      this.scheduleDrain();
    });
  }

  static cancelQueueInstance(provider: VertexStudioProvider): void {
    provider.cancelQueue();
  }

  cancelQueue(): void {
    const err = new Error('CANCELLED');
    console.log(`⏹️ [Vertex/Cancel] Cancelando fila: ${this.queue.length} pendente(s), ${this.activeJobs.size} ativo(s)`);

    const pending = this.queue.splice(0);
    for (const job of pending) {
      this.settleError(job, err);
    }

    for (const activeJob of this.activeJobs.values()) {
      activeJob.abortController.abort();
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    this.cancelQueue();

    for (const worker of this.workers) {
      if (worker.page && !worker.page.isClosed()) {
        try {
          await worker.page.close();
        } catch { }
      }
      worker.page = null;
      worker.busy = false;
      worker.currentJobId = undefined;
      worker.cooldownUntil = 0;
    }
    this.workers = [];

    if (this.browser) {
      try {
        // Quando conectado via browserURL, preferir disconnect para não encerrar
        // um Chrome externo que já estava rodando.
        await this.browser.disconnect();
      } catch { }
      this.browser = null;
    }

    if (this.ownedChromeProcess && this.ownedChromeProcess.exitCode === null) {
      try {
        this.ownedChromeProcess.kill();
      } catch { }
    }
    this.ownedChromeProcess = null;
    this.connectedToExistingChrome = false;

    this.activeJobs.clear();
    this.queue = [];
    this.initPromise = null;
    this.schedulerQueued = false;
    this.drainingQueue = false;
    this.closing = false;
  }

  private async init(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.initInternal();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async initInternal(): Promise<void> {
    if (this.closing) throw new Error('Provider em fechamento');

    const poolSize = this.normalizePoolSize(this.config.poolSize || VertexStudioProvider.DEFAULT_POOL_SIZE);

    if (!this.browser || !this.browser.isConnected()) {
      console.log(`🚀 [Vertex] Inicializando browser próprio (pool=${poolSize})...`);
      const chromePath = this.findChromePath();
      if (!chromePath) {
        throw new Error(
          'Google Chrome não encontrado. Instale o Chrome para usar o Vertex Studio em modo remote debugging.'
        );
      }

      // Se existir um processo antigo iniciado por este provider, encerra antes
      // de iniciar outro na mesma porta.
      if (this.ownedChromeProcess && this.ownedChromeProcess.exitCode === null) {
        try {
          this.ownedChromeProcess.kill();
        } catch { }
      }
      this.ownedChromeProcess = null;
      this.connectedToExistingChrome = false;

      if (await this.isRemoteDebugEndpointReady(VertexStudioProvider.REMOTE_DEBUGGING_PORT)) {
        console.log(`🔗 [Vertex] Chrome já rodando na porta ${VertexStudioProvider.REMOTE_DEBUGGING_PORT}, conectando...`);
        this.connectedToExistingChrome = true;
      } else {
        await this.launchChromeWithRemoteDebugging(this.userDataDir, chromePath);
      }

      this.browser = await this.connectToRemoteChrome();
    }
  }

  private buildLaunchArgs(): string[] {
    const args = [
      '--window-size=1440,960',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-popup-blocking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--lang=en-US',
    ];

    if (!this.config.headless) {
      args.push('--start-maximized');
    }

    return args;
  }

  private findChromePath(): string | undefined {
    const localAppData =
      typeof process !== 'undefined' && process?.env
        ? process.env.LOCALAPPDATA
        : undefined;

    const possiblePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      localAppData ? `${localAppData}\\Google\\Chrome\\Application\\chrome.exe` : '',
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

      await this.sleep(250);
    }

    throw new Error(`Timeout aguardando endpoint de depuração remota na porta ${port}`);
  }

  private async launchChromeWithRemoteDebugging(userDataDir: string, chromePath: string): Promise<void> {
    const args = [
      `--remote-debugging-port=${VertexStudioProvider.REMOTE_DEBUGGING_PORT}`,
      `--user-data-dir=${userDataDir}`,
      ...this.buildLaunchArgs(),
      '--new-window',
    ];

    if (this.config.headless) {
      args.push('--headless=new', '--disable-gpu');
    }

    const child = spawn(chromePath, args, {
      detached: false,
      stdio: 'ignore',
      windowsHide: !!this.config.headless,
    });

    this.ownedChromeProcess = child;
    await this.waitForRemoteDebugEndpoint(VertexStudioProvider.REMOTE_DEBUGGING_PORT, 20000, child);
  }

  private async connectToRemoteChrome(): Promise<Browser> {
    const browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${VertexStudioProvider.REMOTE_DEBUGGING_PORT}`,
      defaultViewport: null,
    });
    return browser;
  }

  private async ensureWorkers(targetPoolSize: number): Promise<void> {
    if (!this.browser || !this.browser.isConnected()) {
      throw new Error('Browser da Vertex indisponível');
    }

    // Remove workers mortos
    this.workers = this.workers.filter(worker => {
      const alive = !!worker.page && !worker.page.isClosed();
      if (!alive) {
        worker.page = null;
      }
      return alive;
    });

    // Fecha excedentes se pool foi reduzido (somente workers ociosos)
    while (this.workers.length > targetPoolSize) {
      const idleIndex = this.workers.findIndex(w => !w.busy);
      if (idleIndex === -1) break;
      const [worker] = this.workers.splice(idleIndex, 1);
      if (!worker?.page) continue;
      try {
        await worker.page.close();
      } catch { }
    }

    // Cria workers faltantes
    while (this.workers.length < targetPoolSize) {
      const workerId = this.workers.length + 1;
      const worker = await this.createWorker(workerId);
      this.workers.push(worker);
    }
  }

  private async createWorker(workerId: number): Promise<VertexWorkerState> {
    if (!this.browser) throw new Error('Browser não inicializado');
    const page = await this.browser.newPage();
    page.setDefaultNavigationTimeout(45000);
    page.setDefaultTimeout(45000);

    const worker: VertexWorkerState = {
      id: workerId,
      page,
      busy: false,
      cooldownUntil: 0,
    };

    await this.prepareWorkerPage(worker, this.config.defaultModel || VertexStudioProvider.DEFAULT_MODEL);
    return worker;
  }

  private async prepareWorkerPage(worker: VertexWorkerState, model?: string): Promise<void> {
    if (!worker.page) throw new Error(`Worker ${worker.id} sem página`);
    const currentUrl = worker.page.url() || '';
    const targetUrl = this.buildStudioUrl(model);
    const desiredModel = this.extractModelFromStudioUrl(targetUrl);
    const currentModel = this.extractModelFromStudioUrl(currentUrl);
    const isOnMultimodal = currentUrl.includes('/vertex-ai/studio/multimodal');
    const isCorrectModel = desiredModel && currentModel === desiredModel;

    if (!currentUrl || !isOnMultimodal || !isCorrectModel) {
      await worker.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await this.sleep(1800);
    }

    // Best-effort para garantir que o editor de prompt foi montado.
    try {
      await worker.page.waitForFunction(
        () => {
          return Boolean(
            document.querySelector('#p6ntest-ai-llm-multimodal-chat-prompt-message .ql-editor[contenteditable="true"]') ||
            document.querySelector('connect-quill-input .ql-editor[contenteditable="true"]') ||
            document.querySelector('div.ql-editor[contenteditable="true"]') ||
            document.querySelector('button#p6ntest-ai-llm-chat-prompt-send-button') ||
            document.querySelector('button[instrumentationid="prompt-submit-button"]')
          );
        },
        { timeout: 12000 }
      );
    } catch { }

    const urlAfter = worker.page.url() || '';
    if (urlAfter.includes('accounts.google.com')) {
      throw new Error(
        'Conta Google não logada no profile da Vertex. ' +
        `Abra o perfil em ${this.userDataDir} e faça login em ${targetUrl}.`
      );
    }
  }

  private scheduleDrain(): void {
    if (this.schedulerQueued || this.closing) return;
    this.schedulerQueued = true;
    setTimeout(() => {
      this.schedulerQueued = false;
      void this.drainQueue();
    }, 0);
  }

  private async drainQueue(): Promise<void> {
    if (this.drainingQueue || this.closing) return;
    this.drainingQueue = true;

    try {
      const targetPoolSize = this.normalizePoolSize(this.config.poolSize || VertexStudioProvider.DEFAULT_POOL_SIZE);
      await this.init();

      const requiredWorkers = Math.min(
        targetPoolSize,
        Math.max(1, this.activeJobs.size + this.queue.length)
      );
      await this.ensureWorkers(requiredWorkers);

      while (this.queue.length > 0) {
        const worker = this.findAvailableWorker();
        if (!worker) {
          // Se todos estão ocupados e ainda não atingiu o limite do pool, cria
          // mais um worker sob demanda (evita abrir N abas quando só há 1 job).
          if (this.workers.length < targetPoolSize) {
            const newWorkerId = this.getNextWorkerId();
            const createdWorker = await this.createWorker(newWorkerId);
            this.workers.push(createdWorker);
            continue;
          }
          break;
        }

        const job = this.queue.shift();
        if (!job) break;

        this.startWorkerJob(worker, job);
      }
    } catch (error: any) {
      console.error('❌ [Vertex] Erro no scheduler:', error?.message || error);
      const err = new Error(error?.message || 'Erro interno no scheduler da Vertex');
      const pending = this.queue.splice(0);
      pending.forEach(job => this.settleError(job, err));
    } finally {
      this.drainingQueue = false;
      if (this.queue.length > 0) {
        this.scheduleDrain();
      }
    }
  }

  private findAvailableWorker(): VertexWorkerState | null {
    const now = Date.now();
    for (const worker of this.workers) {
      if (worker.busy) continue;
      if (worker.cooldownUntil > now) continue;
      if (!worker.page || worker.page.isClosed()) continue;
      return worker;
    }
    return null;
  }

  private getNextWorkerId(): number {
    if (this.workers.length === 0) return 1;
    let maxId = 0;
    for (const worker of this.workers) {
      if (worker.id > maxId) maxId = worker.id;
    }
    return maxId + 1;
  }

  private startWorkerJob(worker: VertexWorkerState, job: VertexImageJob): void {
    worker.busy = true;
    worker.currentJobId = job.id;
    this.activeJobs.set(job.id, job);

    void this.executeJob(worker, job)
      .catch((error: any) => {
        this.emitJobProgress(job, worker, 'error', `Erro: ${error?.message || 'desconhecido'}`);
        this.settleError(job, error instanceof Error ? error : new Error(String(error)));

        const msg = String(error?.message || '');
        if (/(429|rate|too many|quota|limit)/i.test(msg)) {
          worker.cooldownUntil = Date.now() + 20000;
        }
      })
      .finally(() => {
        worker.busy = false;
        worker.currentJobId = undefined;
        this.activeJobs.delete(job.id);
        this.scheduleDrain();
      });
  }

  private async executeJob(worker: VertexWorkerState, job: VertexImageJob): Promise<void> {
    this.ensureNotAborted(job);
    await this.ensureWorkerReady(worker, job);

    const startedAt = Date.now();
    const localPaths: string[] = [];
    const totalCount = Math.max(1, job.count);

    for (let i = 0; i < totalCount; i++) {
      this.ensureNotAborted(job);
      const itemIndex = i + 1;
      this.emitJobProgress(job, worker, 'submitting', `Preparando geração ${itemIndex}/${totalCount}...`, 5);

      const imagePath = await this.generateSingleImage(worker, job, itemIndex, totalCount);
      localPaths.push(imagePath);
    }

    const durationMs = Date.now() - startedAt;
    this.emitJobProgress(job, worker, 'complete', `${localPaths.length} imagem(ns) gerada(s) na Vertex.`, 100);
    this.settleSuccess(job, { success: true, imagePaths: localPaths, durationMs });
  }

  private async ensureWorkerReady(worker: VertexWorkerState, job: VertexImageJob): Promise<void> {
    if (!this.browser || !this.browser.isConnected()) {
      throw new Error('Browser da Vertex desconectado');
    }
    if (!worker.page || worker.page.isClosed()) {
      worker.page = await this.browser.newPage();
      worker.page.setDefaultNavigationTimeout(45000);
      worker.page.setDefaultTimeout(45000);
    }

    this.emitJobProgress(job, worker, 'opening', `Worker ${worker.id}: preparando página...`, 1);
    await this.prepareWorkerPage(worker, job.model);
  }

  private async generateSingleImage(
    worker: VertexWorkerState,
    job: VertexImageJob,
    itemIndex: number,
    totalCount: number
  ): Promise<string> {
    const maxAttempts = VertexStudioProvider.MAX_IMAGE_ATTEMPTS;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.ensureNotAborted(job);

      if (!worker.page || worker.page.isClosed()) {
        await this.ensureWorkerReady(worker, job);
      }

      if (attempt > 1) {
        this.emitJobProgress(
          job,
          worker,
          'generating',
          `Worker ${worker.id}: retry ${attempt}/${maxAttempts} para imagem ${itemIndex}/${totalCount}...`,
          16
        );
      }

      try {
        return await this.generateSingleImageAttempt(worker, job, itemIndex, totalCount);
      } catch (error: any) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        lastError = normalizedError;

        if (!this.shouldRetryImageError(normalizedError, attempt, maxAttempts)) {
          throw normalizedError;
        }

        const waitMs = this.getRetryDelayMs(attempt);
        const waitSec = (waitMs / 1000).toFixed(1).replace(/\.0$/, '');
        this.emitJobProgress(
          job,
          worker,
          'generating',
          `Worker ${worker.id}: tentativa ${attempt}/${maxAttempts} falhou (${this.toShortErrorMessage(normalizedError.message)}). Nova tentativa em ${waitSec}s...`,
          18
        );
        await this.sleep(waitMs);
      }
    }

    throw lastError || new Error('Falha desconhecida ao gerar imagem na Vertex.');
  }

  private async generateSingleImageAttempt(
    worker: VertexWorkerState,
    job: VertexImageJob,
    itemIndex: number,
    totalCount: number
  ): Promise<string> {
    if (!worker.page) throw new Error(`Worker ${worker.id} sem página`);
    const page = worker.page;

    this.ensureNotAborted(job);
    this.emitJobProgress(job, worker, 'navigating', `Worker ${worker.id}: sincronizando UI da Vertex...`, 8);

    // Melhor esforço para manter a aba pronta
    try {
      await page.bringToFront();
    } catch { }

    this.emitJobProgress(job, worker, 'navigating', `Worker ${worker.id}: aplicando Model settings...`, 9);
    await this.tryApplyModelSettings(page, job.aspectRatio);

    const promptPrepared = await this.setPromptText(page, job.prompt);
    if (!promptPrepared) {
      throw new Error('Não foi possível localizar o campo de prompt da Vertex.');
    }
    await this.sleep(250);

    if (job.ingredientImagePaths && job.ingredientImagePaths.length > 0) {
      await this.tryUploadIngredientImages(page, job.ingredientImagePaths, worker, job);
    }

    const baselineUrls = await this.collectCandidateImageUrls(page);
    const baselineFailedMessageSignatures = await this.collectFailedMessageSignatures(page);
    const submitted = await this.submitPrompt(page, job.prompt, { skipTextUpdate: true });
    if (!submitted) {
      throw new Error('Não foi possível localizar o campo de prompt da Vertex.');
    }

    const generatedUrl = await this.waitForGeneratedImageUrl(
      worker,
      job,
      baselineUrls,
      baselineFailedMessageSignatures,
      itemIndex,
      totalCount
    );

    this.emitJobProgress(job, worker, 'downloading', `Worker ${worker.id}: baixando imagem ${itemIndex}/${totalCount}...`, 92);
    const localPath = await this.downloadImageWithFallback(page, generatedUrl, worker.id, itemIndex);
    return localPath;
  }

  private async tryApplyAspectRatio(page: Page, aspectRatio: string): Promise<void> {
    const normalized = String(aspectRatio || '').trim();
    if (!normalized) return;

    try {
      await page.evaluate((ratio: string) => {
        const cleanRatio = ratio.replace(/\s+/g, '');
        const textNodes: Element[] = [];

        const clickable = Array.from(document.querySelectorAll('button, [role="button"], [aria-haspopup="listbox"]'));
        for (const el of clickable) {
          const text = (el.textContent || '').replace(/\s+/g, '');
          if (text.includes(cleanRatio)) {
            (el as HTMLElement).click();
            return;
          }
          textNodes.push(el);
        }

        // Tenta abrir menu por labels comuns
        for (const el of textNodes) {
          const text = (el.textContent || '').toLowerCase();
          if (text.includes('aspect') || text.includes('ratio') || text.includes('proporção')) {
            (el as HTMLElement).click();
            break;
          }
        }

        // Tenta selecionar opção do ratio depois de abrir
        const options = Array.from(document.querySelectorAll('li, [role="option"], button, div'));
        for (const option of options) {
          const text = (option.textContent || '').replace(/\s+/g, '');
          if (text.includes(cleanRatio)) {
            (option as HTMLElement).click();
            return;
          }
        }
      }, normalized);
      await this.sleep(250);
    } catch { }
  }

  private async tryApplyModelSettings(page: Page, aspectRatio?: string): Promise<void> {
    try {
      await this.ensureModelSettingsPanelOpen(page);

      const outputOk = await this.setSelectSetting(page, 'Response type select', ['Image', 'Image only'], {
        allowIncludes: false,
      });
      if (!outputOk) {
        throw new Error('Não foi possível definir "Output" para "Image".');
      }

      const thinkingOk = await this.setSelectSetting(page, 'Thinking level select', ['Minimal'], {
        allowIncludes: false,
      });
      if (!thinkingOk) {
        throw new Error('Não foi possível definir "Thinking level" para "Minimal".');
      }

      const normalizedRatio = String(aspectRatio || '').trim();
      if (normalizedRatio) {
        let ratioOk = await this.setSelectSetting(page, 'Aspect ratio select', [normalizedRatio], {
          allowIncludes: true,
          normalizeRatio: true,
        });
        if (!ratioOk) {
          // Fallback legado baseado em texto livre.
          await this.tryApplyAspectRatio(page, normalizedRatio);
          ratioOk = await this.setSelectSetting(page, 'Aspect ratio select', [normalizedRatio], {
            allowIncludes: true,
            normalizeRatio: true,
          });
        }
        if (!ratioOk) {
          throw new Error(`Não foi possível definir "Aspect ratio" para "${normalizedRatio}".`);
        }
      }

      const resolutionOk = await this.setSelectSetting(page, 'Output resolution select', ['2K'], {
        allowIncludes: false,
      });
      if (!resolutionOk) {
        throw new Error('Não foi possível definir "Output resolution" para "2K".');
      }
    } catch (err: any) {
      throw new Error(`Falha ao aplicar Model settings: ${err?.message || err}`);
    }
  }

  private async ensureModelSettingsPanelOpen(page: Page): Promise<void> {
    const hasVisibleSettings = async (): Promise<boolean> => {
      return page.evaluate(() => {
        const isVisible = (el: Element | null): boolean => {
          if (!el) return false;
          const h = el as HTMLElement;
          const style = window.getComputedStyle(h);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const rect = h.getBoundingClientRect();
          return rect.width > 8 && rect.height > 8;
        };

        const selectors = [
          'cfc-select[aria-label="Response type select"]',
          'cfc-select[aria-label="Thinking level select"]',
          'cfc-select[aria-label="Aspect ratio select"]',
          'cfc-select[aria-label="Output resolution select"]',
        ];
        return selectors.some((selector) => isVisible(document.querySelector(selector)));
      });
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      if (await hasVisibleSettings()) return;

      const clicked = await page.evaluate(() => {
        const normalize = (value: string): string =>
          String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const isVisible = (el: Element | null): boolean => {
          if (!el) return false;
          const h = el as HTMLElement;
          const style = window.getComputedStyle(h);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const rect = h.getBoundingClientRect();
          return rect.width > 8 && rect.height > 8;
        };
        const clickEl = (el: Element | null): boolean => {
          if (!isVisible(el)) return false;
          (el as HTMLElement).click();
          return true;
        };

        const specific = Array.from(document.querySelectorAll('.collapsible-panel__title'));
        for (const node of specific) {
          const text = normalize(node.textContent || '');
          if (text === 'model settings' || text.includes('model settings')) {
            if (clickEl(node)) return true;
          }
        }

        const generic = Array.from(
          document.querySelectorAll('button, [role="button"], div, span, a')
        ).slice(0, 900);
        for (const node of generic) {
          const text = normalize(node.textContent || '');
          if (!text) continue;
          if (text === 'model settings' || text.includes('model settings')) {
            if (clickEl(node)) return true;
          }
        }
        return false;
      });

      if (!clicked) break;
      await this.sleep(220);
    }
  }

  private async setSelectSetting(
    page: Page,
    selectAriaLabel: string,
    targetValues: string[],
    options?: { allowIncludes?: boolean; normalizeRatio?: boolean }
  ): Promise<boolean> {
    const allowIncludes = !!options?.allowIncludes;
    const normalizeRatio = !!options?.normalizeRatio;

    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await page.evaluate(
        (ariaLabel: string, targets: string[], allowIncludesLocal: boolean, normalizeRatioLocal: boolean) => {
          const normalize = (value: string): string => {
            let text = String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
            if (normalizeRatioLocal) {
              text = text.replace(/\s*:\s*/g, ':');
            }
            return text;
          };
          const isVisible = (el: Element | null): boolean => {
            if (!el) return false;
            const h = el as HTMLElement;
            const style = window.getComputedStyle(h);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            const rect = h.getBoundingClientRect();
            return rect.width > 8 && rect.height > 8;
          };
          const matchesTarget = (value: string): boolean => {
            const normalizedValue = normalize(value);
            const normalizedTargets = targets.map((target) => normalize(target));
            if (normalizedTargets.includes(normalizedValue)) return true;
            if (!allowIncludesLocal) return false;
            return normalizedTargets.some(
              (target) => normalizedValue.includes(target) || target.includes(normalizedValue)
            );
          };

          const allSelects = Array.from(document.querySelectorAll('cfc-select[aria-label]'));
          const select = allSelects.find(
            (node) => normalize((node.getAttribute('aria-label') || '').trim()) === normalize(ariaLabel)
          ) as HTMLElement | undefined;

          if (!select || !isVisible(select)) {
            return { ok: false, reason: 'select-not-found' };
          }

          const currentValueNode =
            select.querySelector('.cfc-select-value-text') ||
            select.querySelector('.cfc-select-value') ||
            select;
          const currentValue = String(currentValueNode?.textContent || '');
          if (matchesTarget(currentValue)) {
            return { ok: true, reason: 'already-selected' };
          }

          const trigger = (select.querySelector('.cfc-select-trigger') || select) as HTMLElement;
          trigger.click();

          const directCandidates = Array.from(
            document.querySelectorAll('[role="option"], [role="menuitem"], .cfc-menu-item, .cfc-select-option, li')
          );
          const overlayCandidates = Array.from(
            document.querySelectorAll('.cdk-overlay-pane *, .cdk-overlay-container *, cfc-menu *')
          );
          const allCandidates = [...directCandidates, ...overlayCandidates];

          const optionCandidates = allCandidates
            .filter((node, idx, arr) => arr.indexOf(node) === idx)
            .filter((node) => isVisible(node))
            .map((node) => ({ node, text: String(node.textContent || '').trim() }))
            .filter((entry) => entry.text.length > 0 && entry.text.length < 120);

          const exactMatch = optionCandidates.find((entry) => {
            const normalizedText = normalize(entry.text);
            return targets.map((target) => normalize(target)).includes(normalizedText);
          });

          const inclusiveMatch = !exactMatch && allowIncludesLocal
            ? optionCandidates.find((entry) => {
              const normalizedText = normalize(entry.text);
              const normalizedTargets = targets.map((target) => normalize(target));
              return normalizedTargets.some(
                (target) => normalizedText.includes(target) || target.includes(normalizedText)
              );
            })
            : null;

          const finalMatch = exactMatch || inclusiveMatch;
          if (!finalMatch) {
            return { ok: false, reason: 'option-not-found' };
          }

          (finalMatch.node as HTMLElement).click();
          return { ok: true, reason: 'selected' };
        },
        selectAriaLabel,
        targetValues,
        allowIncludes,
        normalizeRatio
      );

      if (result?.ok) {
        await this.sleep(120);
        return true;
      }

      if (result?.reason === 'select-not-found') {
        await this.ensureModelSettingsPanelOpen(page);
      }
      await this.sleep(180);
    }

    return false;
  }

  private async tryUploadIngredientImages(
    page: Page,
    ingredientImagePaths: string[],
    worker: VertexWorkerState,
    job: VertexImageJob
  ): Promise<void> {
    if (!ingredientImagePaths.length) return;

    this.emitJobProgress(
      job,
      worker,
      'submitting',
      `Worker ${worker.id}: enviando ${ingredientImagePaths.length} referência(s)...`,
      12
    );

    try {
      await page.evaluate(() => {
        // Limpeza best-effort de referências anteriores
        const removeButtons = Array.from(document.querySelectorAll('button, [role="button"]'))
          .filter((el) => {
            const text = (el.textContent || '').toLowerCase();
            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
            return text.includes('remove') || text.includes('remover') || aria.includes('remove') || aria.includes('remover');
          });
        removeButtons.slice(0, 6).forEach((el) => (el as HTMLElement).click());
      });
    } catch { }

    for (let i = 0; i < ingredientImagePaths.length; i++) {
      this.ensureNotAborted(job);
      const originalPath = ingredientImagePaths[i];
      const uploadPath = await this.resolveUploadPath(originalPath);
      this.emitJobProgress(
        job,
        worker,
        'submitting',
        `Worker ${worker.id}: upload ref ${i + 1}/${ingredientImagePaths.length}...`,
        13 + Math.round(((i + 1) / ingredientImagePaths.length) * 5)
      );

      const input = await page.$('input[type="file"]');
      if (!input) {
        console.warn('⚠️ [Vertex] input[type=file] não encontrado para referências. Seguindo sem ingredients.');
        return;
      }
      try {
        await input.uploadFile(uploadPath);
        await this.sleep(1200);
        const uploadDialogError = await this.detectLargeUploadDialogError(page);
        if (uploadDialogError) {
          throw new Error(uploadDialogError);
        }
      } catch (err: any) {
        const reason = String(err?.message || err || 'erro desconhecido');
        throw new Error(`Falha ao enviar referência ${i + 1}/${ingredientImagePaths.length}: ${reason}`);
      }
    }
  }

  private async resolveUploadPath(rawPath: string): Promise<string> {
    const source = String(rawPath || '').trim();
    if (!source) throw new Error('Caminho de ingrediente vazio');

    let absPath = source;
    if (source.startsWith('file:///')) {
      absPath = source.replace('file:///', '');
    }

    if (source.startsWith('http://') || source.startsWith('https://')) {
      const ext = this.getExtensionFromUrl(source) || '.jpg';
      const fileName = `vertex-ingredient-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const localPath = path.join(this.outputDir, fileName);
      const parsed = new URL(source);
      const protocol = parsed.protocol === 'https:' ? https : http;
      await new Promise<void>((resolve, reject) => {
        const request = protocol.get(source, (response) => {
          if ((response.statusCode || 0) >= 400) {
            reject(new Error(`HTTP ${response.statusCode} ao baixar ingrediente`));
            response.resume();
            return;
          }
          const out = fs.createWriteStream(localPath);
          response.pipe(out);
          out.on('finish', () => {
            out.close();
            resolve();
          });
          out.on('error', reject);
        });
        request.on('error', reject);
      });
      return this.ensureIngredientUploadReady(localPath);
    }

    return this.ensureIngredientUploadReady(path.resolve(absPath));
  }

  private ensureIngredientUploadReady(localPath: string): string {
    const resolved = path.resolve(String(localPath || ''));
    const safeLimit = VertexStudioProvider.INGREDIENT_SAFE_UPLOAD_BYTES;

    if (!resolved || !fs.existsSync(resolved)) {
      throw new Error(`Arquivo de referência não encontrado: ${resolved}`);
    }

    const stat = fs.statSync(resolved);
    if (stat.size <= safeLimit) {
      return resolved;
    }

    const sourceImage = nativeImage.createFromPath(resolved);
    if (sourceImage.isEmpty()) {
      const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
      throw new Error(
        `A referência "${path.basename(resolved)}" possui ${sizeMb} MB e excede o limite de upload direto da Vertex.`
      );
    }

    let currentImage = sourceImage;
    let smallestBuffer: Buffer | null = null;
    const qualities = [90, 82, 74, 66, 58, 50, 42, 34, 26];

    for (let scaleStep = 0; scaleStep < 7; scaleStep++) {
      for (const quality of qualities) {
        const encoded = currentImage.toJPEG(quality);
        if (!smallestBuffer || encoded.length < smallestBuffer.length) {
          smallestBuffer = encoded;
        }

        if (encoded.length <= safeLimit) {
          const optimizedPath = this.writeOptimizedIngredient(encoded);
          const oldMb = (stat.size / (1024 * 1024)).toFixed(2);
          const newMb = (encoded.length / (1024 * 1024)).toFixed(2);
          console.log(
            `🗜️ [Vertex] Referência otimizada para upload (${path.basename(resolved)}: ${oldMb}MB -> ${newMb}MB).`
          );
          return optimizedPath;
        }
      }

      const currentSize = currentImage.getSize();
      const nextWidth = Math.max(640, Math.floor((currentSize.width || 0) * 0.85));
      const nextHeight = Math.max(640, Math.floor((currentSize.height || 0) * 0.85));
      if (nextWidth === currentSize.width && nextHeight === currentSize.height) {
        break;
      }
      currentImage = currentImage.resize({ width: nextWidth, height: nextHeight, quality: 'better' });
    }

    const smallestMb = smallestBuffer ? (smallestBuffer.length / (1024 * 1024)).toFixed(2) : null;
    const originalMb = (stat.size / (1024 * 1024)).toFixed(2);
    throw new Error(
      `Não foi possível reduzir "${path.basename(resolved)}" para upload direto da Vertex. Tamanho original: ${originalMb}MB` +
      `${smallestMb ? `; melhor tentativa: ${smallestMb}MB` : ''}.`
    );
  }

  private writeOptimizedIngredient(buffer: Buffer): string {
    const fileName = `vertex-ingredient-optimized-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const outputPath = path.join(this.outputDir, fileName);
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  }

  private async detectLargeUploadDialogError(page: Page): Promise<string | null> {
    try {
      return await page.evaluate(() => {
        const normalize = (value: string): string =>
          String(value || '').replace(/\s+/g, ' ').trim();

        const candidates = Array.from(document.querySelectorAll('[role="dialog"], .cdk-overlay-container, .mdc-dialog'));
        for (const node of candidates) {
          const text = normalize((node.textContent || '').toLowerCase());
          if (!text) continue;

          const looksLikeLargeFileDialog =
            text.includes('confirm large file upload') ||
            text.includes('files larger than 7mb') ||
            text.includes('saved prompt not found');

          if (!looksLikeLargeFileDialog) continue;

          if (text.includes('saved prompt not found')) {
            return 'Upload bloqueado: "Saved prompt not found". A Vertex exigiu GCS para arquivo grande.';
          }

          return 'Upload bloqueado: a Vertex abriu o diálogo de arquivo grande (>7MB).';
        }

        return null;
      });
    } catch {
      return null;
    }
  }

  private async setPromptText(page: Page, prompt: string): Promise<boolean> {
    const promptSet = await page.evaluate((text: string) => {
      const selectors = [
        '#p6ntest-ai-llm-multimodal-chat-prompt-message .ql-editor[contenteditable="true"]',
        'connect-quill-input .ql-editor[contenteditable="true"]',
        'div.ql-editor[contenteditable="true"]',
        'textarea[aria-label*="Prompt" i]',
        'textarea[placeholder*="Prompt" i]',
        'textarea[placeholder*="Descreva" i]',
        'textarea',
        '[role="textbox"][contenteditable="true"]',
        '[contenteditable="true"][aria-label*="prompt" i]',
        'div[contenteditable="true"]',
        'input[type="text"][aria-label*="Prompt" i]',
        'input[type="text"][placeholder*="Prompt" i]',
      ];

      let target: HTMLElement | null = null;
      for (const selector of selectors) {
        const found = document.querySelector(selector) as HTMLElement | null;
        if (found) {
          const style = window.getComputedStyle(found);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          target = found;
          break;
        }
      }
      if (!target) return false;

      target.focus();

      const asAny = target as any;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
        asAny.value = text;
      } else if (target.isContentEditable) {
        const isQuillEditor = target.classList.contains('ql-editor') || target.closest('.ql-editor');
        if (isQuillEditor) {
          while (target.firstChild) {
            target.removeChild(target.firstChild);
          }
          const p = document.createElement('p');
          p.textContent = text;
          target.appendChild(p);
        } else {
          target.textContent = text;
        }
      } else {
        return false;
      }

      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, prompt);

    return !!promptSet;
  }

  private async clickPromptSubmit(page: Page): Promise<boolean> {
    const clicked = await page.evaluate(() => {
      const strongCandidates = [
        'button#p6ntest-ai-llm-chat-prompt-send-button',
        'button[instrumentationid="prompt-submit-button"]',
        'button[aria-label="Submit"]',
      ];
      for (const selector of strongCandidates) {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) continue;
        const disabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
        if (disabled) continue;
        el.click();
        return true;
      }

      const triggerWords = ['generate', 'gerar', 'run', 'create', 'criar'];
      const blockWords = ['history', 'sample', 'example', 'upload', 'feedback', 'download', 'export'];
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]')) as HTMLElement[];

      for (const btn of buttons) {
        const disabled = btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true';
        if (disabled) continue;
        const style = window.getComputedStyle(btn);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        const rect = btn.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 20) continue;

        const text = `${btn.textContent || ''} ${btn.getAttribute('aria-label') || ''}`.toLowerCase();
        if (!text.trim()) continue;
        if (blockWords.some((w) => text.includes(w))) continue;
        if (triggerWords.some((w) => text.includes(w))) {
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (clicked) return true;

    try {
      await page.keyboard.down('Control');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Control');
      return true;
    } catch {
      return false;
    }
  }

  private async submitPrompt(
    page: Page,
    prompt: string,
    options?: { skipTextUpdate?: boolean }
  ): Promise<boolean> {
    if (!options?.skipTextUpdate) {
      const promptSet = await this.setPromptText(page, prompt);
      if (!promptSet) return false;
      await this.sleep(250);
    }

    return this.clickPromptSubmit(page);
  }

  private async waitForGeneratedImageUrl(
    worker: VertexWorkerState,
    job: VertexImageJob,
    baselineUrls: string[],
    baselineFailedMessageSignatures: string[],
    itemIndex: number,
    totalCount: number
  ): Promise<string> {
    if (!worker.page) throw new Error(`Worker ${worker.id} sem página`);
    const page = worker.page;

    const startedAt = Date.now();
    const timeoutMs = this.config.generationTimeoutMs || VertexStudioProvider.DEFAULT_GENERATION_TIMEOUT_MS;
    const pollIntervalMs = 1400;
    const baselineSet = new Set(baselineUrls);
    const networkUrls = new Set<string>();

    const onResponse = (response: HTTPResponse) => {
      const url = response.url();
      if (!url || baselineSet.has(url)) return;
      const contentType = (response.headers()['content-type'] || '').toLowerCase();
      if (contentType.startsWith('image/')) {
        networkUrls.add(url);
        return;
      }
      if (/(\.png|\.jpg|\.jpeg|\.webp|\/images\/|googleusercontent|storage.googleapis)/i.test(url)) {
        networkUrls.add(url);
      }
    };

    page.on('response', onResponse);
    try {
      while (Date.now() - startedAt < timeoutMs) {
        this.ensureNotAborted(job);

        const snapshot = await this.readGenerationSnapshot(page, baselineUrls);
        const elapsedMs = Date.now() - startedAt;
        const progressBase = Math.min(88, 20 + Math.round((elapsedMs / timeoutMs) * 62));
        const statusText = snapshot.statusText || (snapshot.isGenerating ? 'gerando...' : 'aguardando render...');
        this.emitJobProgress(
          job,
          worker,
          'generating',
          `Worker ${worker.id}: imagem ${itemIndex}/${totalCount} - ${statusText}`,
          progressBase
        );

        const failedMessage = await this.readFailedGenerationMessage(page, baselineFailedMessageSignatures);
        if (failedMessage) {
          throw new Error(`Falha retornada pela Vertex: ${failedMessage}`);
        }

        if (snapshot.newUrls.length > 0) {
          return snapshot.newUrls[0];
        }

        for (const url of networkUrls) {
          if (baselineSet.has(url)) continue;
          if (await this.isAssistantMessageImageUrl(page, url)) {
            return url;
          }
        }

        await this.sleep(pollIntervalMs);
      }
    } finally {
      page.off('response', onResponse);
    }

    throw new Error(`Timeout na geração da Vertex (${Math.round(timeoutMs / 1000)}s).`);
  }

  private async collectFailedMessageSignatures(page: Page): Promise<string[]> {
    try {
      const signatures = await page.evaluate(() => {
        const normalizeText = (value: string): string =>
          String(value || '').replace(/\s+/g, ' ').trim();

        const failedBoxes = Array.from(document.querySelectorAll('.message-box.message__status--failed'));
        return failedBoxes.map((box, idx) => {
          const id = (box as HTMLElement).id || '';
          const textNode = box.querySelector(
            '.prompt-response-text-area--error-color, .ai-markdown-artifact-renderer, p'
          ) as HTMLElement | null;
          const text = normalizeText((textNode?.textContent || box.textContent || '').slice(0, 300));
          return id ? `id:${id}` : `idx:${idx}|txt:${text.slice(0, 180)}`;
        });
      });
      return signatures || [];
    } catch {
      return [];
    }
  }

  private async readFailedGenerationMessage(page: Page, baselineSignatures: string[]): Promise<string | null> {
    try {
      const baseline = baselineSignatures || [];
      const result = await page.evaluate((knownSignatures: string[]) => {
        const normalizeText = (value: string): string =>
          String(value || '').replace(/\s+/g, ' ').trim();
        const known = new Set(knownSignatures);
        const failedBoxes = Array.from(document.querySelectorAll('.message-box.message__status--failed'));

        const failures = failedBoxes.map((box, idx) => {
          const id = (box as HTMLElement).id || '';
          const textNode = box.querySelector(
            '.prompt-response-text-area--error-color, .ai-markdown-artifact-renderer, p'
          ) as HTMLElement | null;
          const text = normalizeText((textNode?.textContent || box.textContent || '').slice(0, 500));
          const signature = id ? `id:${id}` : `idx:${idx}|txt:${text.slice(0, 180)}`;
          return { signature, text };
        });

        for (let i = failures.length - 1; i >= 0; i--) {
          const failure = failures[i];
          if (known.has(failure.signature)) continue;
          return failure.text || 'A Vertex retornou erro sem detalhes.';
        }

        return null;
      }, baseline);

      return result || null;
    } catch {
      return null;
    }
  }

  private async readGenerationSnapshot(
    page: Page,
    baselineUrls: string[]
  ): Promise<{ newUrls: string[]; isGenerating: boolean; statusText: string }> {
    const result = await page.evaluate((knownUrls: string[]) => {
      const known = new Set(knownUrls);
      const urls: string[] = [];
      const isAssistantMessageNode = (node: Element | null): boolean => {
        if (!node) return false;
        const messageBox = node.closest('.message-box');
        if (!messageBox) return false;
        return !messageBox.classList.contains('message-box--user');
      };

      const pushUrl = (value: string) => {
        if (!value || known.has(value)) return;
        if (value.startsWith('data:image/svg')) return;
        if (value.endsWith('.svg')) return;
        if (!urls.includes(value)) urls.push(value);
      };

      const images = Array.from(document.querySelectorAll('img[src]')) as HTMLImageElement[];
      for (const img of images) {
        if (!isAssistantMessageNode(img)) continue;
        const src = img.getAttribute('src') || img.src || '';
        if (!src) continue;
        const rect = img.getBoundingClientRect();
        const width = Math.max(rect.width || 0, img.naturalWidth || 0);
        const height = Math.max(rect.height || 0, img.naturalHeight || 0);
        if (width < 180 || height < 180) continue;
        pushUrl(src);
      }

      const pictures = Array.from(document.querySelectorAll('source[srcset]'));
      for (const source of pictures) {
        if (!isAssistantMessageNode(source)) continue;
        const srcset = source.getAttribute('srcset') || '';
        const first = srcset.split(',')[0]?.trim().split(' ')[0] || '';
        if (!first) continue;
        pushUrl(first);
      }

      const statusCandidates = [
        ...Array.from(document.querySelectorAll('[role="status"], [aria-live="polite"], [aria-live="assertive"]')),
        ...Array.from(document.querySelectorAll('span, div')),
      ];
      let statusText = '';
      let isGenerating = false;
      const markerWords = ['generating', 'rendering', 'creating', 'processing', 'gerando', 'processando'];
      for (const node of statusCandidates.slice(0, 220)) {
        const text = (node.textContent || '').trim().toLowerCase();
        if (!text) continue;
        if (markerWords.some((word) => text.includes(word))) {
          isGenerating = true;
          statusText = text.substring(0, 80);
          break;
        }
      }

      return {
        newUrls: urls,
        isGenerating,
        statusText,
      };
    }, baselineUrls);

    return {
      newUrls: result.newUrls || [],
      isGenerating: !!result.isGenerating,
      statusText: result.statusText || '',
    };
  }

  private async isAssistantMessageImageUrl(page: Page, targetUrl: string): Promise<boolean> {
    if (!targetUrl) return false;

    try {
      return await page.evaluate((rawUrl: string) => {
        const normalizeUrl = (value: string): string => {
          if (!value) return '';
          try {
            const url = new URL(value, window.location.href);
            url.hash = '';
            return url.toString();
          } catch {
            return String(value || '').split('#')[0];
          }
        };

        const isAssistantMessageNode = (node: Element | null): boolean => {
          if (!node) return false;
          const messageBox = node.closest('.message-box');
          if (!messageBox) return false;
          return !messageBox.classList.contains('message-box--user');
        };

        const target = normalizeUrl(rawUrl);
        if (!target) return false;

        const images = Array.from(document.querySelectorAll('img[src]')) as HTMLImageElement[];
        for (const img of images) {
          if (!isAssistantMessageNode(img)) continue;
          const src = img.getAttribute('src') || img.src || '';
          if (normalizeUrl(src) === target) return true;
        }

        const sourceNodes = Array.from(document.querySelectorAll('source[srcset]'));
        for (const source of sourceNodes) {
          if (!isAssistantMessageNode(source)) continue;
          const srcset = source.getAttribute('srcset') || '';
          const entries = srcset
            .split(',')
            .map((item) => item.trim().split(' ')[0])
            .filter(Boolean);

          for (const entry of entries) {
            if (normalizeUrl(entry) === target) return true;
          }
        }

        return false;
      }, targetUrl);
    } catch {
      return false;
    }
  }

  private async collectCandidateImageUrls(page: Page): Promise<string[]> {
    try {
      const urls = await page.evaluate(() => {
        const out: string[] = [];
        const isAssistantMessageNode = (node: Element | null): boolean => {
          if (!node) return false;
          const messageBox = node.closest('.message-box');
          if (!messageBox) return false;
          return !messageBox.classList.contains('message-box--user');
        };

        const add = (value: string) => {
          if (!value) return;
          if (value.startsWith('data:image/svg')) return;
          if (!out.includes(value)) out.push(value);
        };

        const images = Array.from(document.querySelectorAll('img[src]')) as HTMLImageElement[];
        for (const img of images) {
          if (!isAssistantMessageNode(img)) continue;
          const src = img.getAttribute('src') || img.src || '';
          if (!src) continue;
          const rect = img.getBoundingClientRect();
          const width = Math.max(rect.width || 0, img.naturalWidth || 0);
          const height = Math.max(rect.height || 0, img.naturalHeight || 0);
          if (width < 180 || height < 180) continue;
          add(src);
        }

        const sourceNodes = Array.from(document.querySelectorAll('source[srcset]'));
        for (const source of sourceNodes) {
          if (!isAssistantMessageNode(source)) continue;
          const srcset = source.getAttribute('srcset') || '';
          const first = srcset.split(',')[0]?.trim().split(' ')[0] || '';
          add(first);
        }
        return out;
      });
      return urls || [];
    } catch {
      return [];
    }
  }

  private async downloadImageWithFallback(
    page: Page,
    imageUrl: string,
    workerId: number,
    imageIndex: number
  ): Promise<string> {
    const now = Date.now();
    const guessedExt = this.getExtensionFromUrl(imageUrl) || '.png';
    const initialPath = path.join(this.outputDir, `vertex-image-${now}-w${workerId}-${imageIndex}${guessedExt}`);

    try {
      const downloaded = await this.downloadImageViaHttp(page, imageUrl);
      const ext = this.getExtensionFromMime(downloaded.contentType || '') || guessedExt || '.png';
      const finalPath = path.join(this.outputDir, `vertex-image-${now}-w${workerId}-${imageIndex}${ext}`);
      fs.writeFileSync(finalPath, downloaded.buffer);
      if (fs.statSync(finalPath).size > 400) {
        return finalPath;
      }
    } catch (err: any) {
      console.warn(`⚠️ [Vertex] Download HTTP falhou, tentando fallback fetch no browser: ${err?.message || err}`);
    }

    const dataUrl = await this.fetchImageDataUrlFromPage(page, imageUrl);
    if (!dataUrl) {
      throw new Error('Não foi possível baixar a imagem gerada pela Vertex.');
    }

    const parsed = this.parseDataUrl(dataUrl);
    const ext = this.getExtensionFromMime(parsed.mimeType) || guessedExt || '.png';
    const finalPath = initialPath.replace(path.extname(initialPath), ext);
    fs.writeFileSync(finalPath, parsed.buffer);
    return finalPath;
  }

  private async downloadImageViaHttp(
    page: Page,
    imageUrl: string
  ): Promise<{ buffer: Buffer; contentType: string | null }> {
    const cookies = await page.cookies(imageUrl).catch(() => page.cookies());
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    const requestOnce = (urlStr: string, redirectsLeft: number): Promise<{ buffer: Buffer; contentType: string | null }> => {
      return new Promise((resolve, reject) => {
        const parsed = new URL(urlStr);
        const lib = parsed.protocol === 'https:' ? https : http;

        const req = lib.request(
          {
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: {
              Cookie: cookieHeader,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
              Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            },
          },
          (res) => {
            const statusCode = res.statusCode || 0;
            const location = res.headers.location;

            if (statusCode >= 300 && statusCode < 400 && location) {
              res.resume();
              if (redirectsLeft <= 0) {
                reject(new Error('Muitos redirecionamentos ao baixar imagem'));
                return;
              }
              const nextUrl = new URL(location, urlStr).toString();
              requestOnce(nextUrl, redirectsLeft - 1).then(resolve).catch(reject);
              return;
            }

            if (statusCode >= 400) {
              res.resume();
              reject(new Error(`HTTP ${statusCode} ao baixar imagem`));
              return;
            }

            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            res.on('end', () => {
              resolve({
                buffer: Buffer.concat(chunks),
                contentType: typeof res.headers['content-type'] === 'string' ? res.headers['content-type'] : null,
              });
            });
          }
        );

        req.on('error', reject);
        req.setTimeout(30000, () => {
          req.destroy(new Error('Timeout no download da imagem'));
        });
        req.end();
      });
    };

    return requestOnce(imageUrl, 5);
  }

  private async fetchImageDataUrlFromPage(page: Page, imageUrl: string): Promise<string | null> {
    try {
      const dataUrl = await page.evaluate(async (targetUrl: string) => {
        try {
          const response = await fetch(targetUrl, { credentials: 'include' });
          if (!response.ok) return null;
          const blob = await response.blob();
          return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('reader-failed'));
            reader.readAsDataURL(blob);
          });
        } catch {
          return null;
        }
      }, imageUrl);
      return dataUrl || null;
    } catch {
      return null;
    }
  }

  private parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
    const matched = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    if (!matched) {
      throw new Error('Formato de data URL inválido');
    }
    return {
      mimeType: matched[1],
      buffer: Buffer.from(matched[2], 'base64'),
    };
  }

  private getExtensionFromMime(mimeType: string): string {
    const normalized = (mimeType || '').toLowerCase();
    if (normalized.includes('image/png')) return '.png';
    if (normalized.includes('image/webp')) return '.webp';
    if (normalized.includes('image/jpeg') || normalized.includes('image/jpg')) return '.jpg';
    if (normalized.includes('image/avif')) return '.avif';
    if (normalized.includes('image/gif')) return '.gif';
    return '';
  }

  private getExtensionFromUrl(urlStr: string): string {
    try {
      const parsed = new URL(urlStr);
      const ext = path.extname(parsed.pathname || '').toLowerCase();
      if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp' || ext === '.avif') {
        return ext === '.jpeg' ? '.jpg' : ext;
      }
      return '';
    } catch {
      return '';
    }
  }

  private normalizePoolSize(value: number): number {
    const num = Math.floor(value);
    return Math.min(VertexStudioProvider.MAX_POOL_SIZE, Math.max(VertexStudioProvider.MIN_POOL_SIZE, num));
  }

  private normalizeModel(model?: string): string | null {
    if (!model) return null;
    const normalized = String(model).trim();
    if (!normalized) return null;
    if (VertexStudioProvider.SUPPORTED_MODELS.has(normalized)) {
      return normalized;
    }
    return null;
  }

  private buildStudioUrl(model?: string): string {
    const selectedModel =
      this.normalizeModel(model) ||
      this.normalizeModel(this.config.defaultModel) ||
      VertexStudioProvider.DEFAULT_MODEL;
    const baseUrl = this.config.studioUrl || VertexStudioProvider.DEFAULT_STUDIO_URL;

    try {
      const parsed = new URL(baseUrl);
      parsed.searchParams.set('model', selectedModel);
      return parsed.toString();
    } catch {
      return `${VertexStudioProvider.DEFAULT_STUDIO_URL}?model=${encodeURIComponent(selectedModel)}`;
    }
  }

  private extractModelFromStudioUrl(urlStr: string): string | null {
    try {
      const parsed = new URL(urlStr);
      const model = parsed.searchParams.get('model');
      return model ? model.trim() : null;
    } catch {
      return null;
    }
  }

  private isQuotaErrorMessage(message: string): boolean {
    const value = String(message || '').toLowerCase();
    return /(quota|exhausted|429|too many|rate limit|limit exceeded|resource has been exhausted)/i.test(value);
  }

  private isTransientImageErrorMessage(message: string): boolean {
    const value = String(message || '').toLowerCase();
    if (!value) return false;

    return (
      /(timeout|timed out|temporar|temporary|try again|tente novamente|network|net::|econn|socket|connection|target closed|execution context was destroyed|navigation|download|reader-failed|http 5\d{2}|status code 5\d{2}|internal|unavailable|gateway|bad gateway)/i.test(value)
    );
  }

  private shouldRetryImageError(error: Error, attempt: number, maxAttempts: number): boolean {
    if (attempt >= maxAttempts) return false;

    const message = String(error?.message || error || '');
    if (!message) return false;

    if (/cancelled|canceled|prompt vazio|conta google não logada|não foi possível localizar o campo de prompt/i.test(message)) {
      return false;
    }

    if (this.isQuotaErrorMessage(message)) {
      return false;
    }

    return this.isTransientImageErrorMessage(message);
  }

  private getRetryDelayMs(attempt: number): number {
    const delay = VertexStudioProvider.RETRY_BASE_DELAY_MS * Math.max(1, attempt);
    return Math.min(VertexStudioProvider.RETRY_MAX_DELAY_MS, delay);
  }

  private toShortErrorMessage(message: string): string {
    const normalized = String(message || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return 'erro desconhecido';
    return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
  }

  private ensureNotAborted(job: VertexImageJob): void {
    if (job.abortController.signal.aborted) {
      throw new Error('CANCELLED');
    }
  }

  private emitJobProgress(
    job: VertexImageJob,
    worker: VertexWorkerState | undefined,
    stage: 'opening' | 'navigating' | 'submitting' | 'generating' | 'downloading' | 'complete' | 'error',
    message: string,
    percent?: number,
    queuePosition?: number
  ): void {
    try {
      job.onProgress?.({
        stage,
        message,
        percent,
        workerId: worker?.id,
        jobId: job.id,
        queuePosition,
      });
    } catch { }
  }

  private settleSuccess(job: VertexImageJob, result: VertexImageResult): void {
    if (job.settled) return;
    job.settled = true;
    job.resolve(result);
  }

  private settleError(job: VertexImageJob, error: Error): void {
    if (job.settled) return;
    job.settled = true;
    job.reject(error);
  }

  private ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

let vertexStudioProviderInstance: VertexStudioProvider | null = null;

export function getVertexStudioProvider(options?: Partial<VertexStudioConfig>): VertexStudioProvider {
  if (!vertexStudioProviderInstance) {
    vertexStudioProviderInstance = new VertexStudioProvider(options);
  } else if (options) {
    vertexStudioProviderInstance.updateConfig(options);
  }
  return vertexStudioProviderInstance;
}

export async function destroyVertexStudioProvider(): Promise<void> {
  if (!vertexStudioProviderInstance) return;
  await vertexStudioProviderInstance.close();
  vertexStudioProviderInstance = null;
}

export function cancelVertexStudioQueue(): void {
  vertexStudioProviderInstance?.cancelQueue();
}
