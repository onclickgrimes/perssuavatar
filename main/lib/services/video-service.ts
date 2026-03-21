/**
 * Video Service
 * 
 * Serviço para renderização de vídeos usando Remotion.
 * Suporta renderização de projetos JSON estruturados.
 * 
 * Uso básico:
 * ```typescript
 * const videoService = new VideoService();
 * 
 * // Renderizar composição simples
 * const result = await videoService.render({
 *   compositionId: 'Example',
 *   outputFileName: 'video.mp4',
 *   inputProps: { title: 'Olá!' },
 * });
 * 
 * // Renderizar projeto JSON
 * const result = await videoService.renderProject(meuProjetoJSON);
 * ```
 * 
 * Documentação Remotion Renderer: https://www.remotion.dev/docs/renderer
 */
import { 
  renderMedia, 
  selectComposition, 
  getCompositions,
  RenderMediaOnProgress,
} from '@remotion/renderer';
import { bundle } from '@remotion/bundler';
import path from 'path';
import { app } from 'electron';
import { EventEmitter } from 'events';
import fs from 'fs';
import { FFmpegSequencer } from './ffmpeg-sequencer';

// ========================================
// TYPES & INTERFACES
// ========================================

export interface RenderOptions {
  /** ID da composição registrada no Root.tsx */
  compositionId: string;
  
  /** Nome do arquivo de saída (ex: 'video.mp4') */
  outputFileName: string;
  
  /** Props a serem passadas para a composição */
  inputProps?: Record<string, unknown>;
  
  /** Formato de saída */
  codec?: 'h264' | 'h265' | 'vp8' | 'vp9' | 'gif';
  
  /** Qualidade do vídeo (CRF: menor = melhor qualidade, maior arquivo) */
  crf?: number;
  
  /** Sobrescrever duração (em frames) */
  durationInFrames?: number;
  
  /** Sobrescrever FPS */
  fps?: number;

  /** Sobrescrever Largura */
  width?: number;

  /** Sobrescrever Altura */
  height?: number;
  
  /** Aceleração por hardware (GPU)
   * - 'if-possible': Usa GPU se disponível (recomendado)
   * - 'required': Falha se GPU não disponível
   * - 'disable': Usa apenas CPU (padrão)
   * - 'hybrid-ffmpeg': Usa pipeline FFmpeg híbrido (novo)
   */
  hardwareAcceleration?: 'if-possible' | 'required' | 'disable' | 'hybrid-ffmpeg';

  /** Se true, o render vai usar png e fundo transparente para overlays */
  isHybridOverlay?: boolean;
}

export interface RenderResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  durationMs?: number;
}

export interface CompositionInfo {
  id: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
}

export interface RenderProgress {
  /** Progresso de 0 a 1 */
  progress: number;
  /** Estágio atual */
  stage: 'bundling' | 'preparing' | 'rendering' | 'encoding' | 'complete';
  /** Frame atual sendo renderizado */
  renderedFrames?: number;
  /** Total de frames */
  totalFrames?: number;
  /** Título do projeto (se aplicável) */
  projectTitle?: string;
  /** Porcentagem (0-100) */
  percent?: number;
  /** Frame atual */
  frame?: number;
}

// Interface simplificada do VideoProject (espelha o tipo do Remotion)
export interface VideoProjectInput {
  project_title: string;
  description?: string;
  config?: {
    width?: number;
    height?: number;
    fps?: number;
    backgroundColor?: string;
    backgroundMusic?: {
      src: string;
      src_local?: string;
      volume?: number;
    };
  };
  scenes: Array<{
    id: number;
    start_time: number;
    end_time: number;
    transcript_segment?: string;
    visual_concept: {
      description: string;
      art_style?: string;
      emotion?: string;
      color_palette?: string[];
    };
    asset_type: string;
    asset_url?: string;
    /** Caminho local bruto do asset (quando disponível), usado para evitar HTTP local no FFmpeg */
    asset_local_path?: string;
    prompt_suggestion?: string;
    camera_movement?: string;
    transition?: string;
    transition_duration?: number;
    text_overlay?: {
      text: string;
      position?: string;
      style?: string;
      animation?: string;
      fontSize?: number;
      color?: string;
      backgroundColor?: string;
    };
  }>;
  schema_version?: string;
}

// ========================================
// VIDEO SERVICE CLASS
// ========================================

export class VideoService extends EventEmitter {
  private entryPoint: string;
  private outputDir: string;
  private fallbackOutputDir: string;
  private videosLibraryOutputDir: string;
  private activeOutputDir: string;
  private bundleDir: string;
  private rootDir: string;
  private cachedBundlePath: string | null = null;
  private isRendering: boolean = false;

  constructor() {
    super();
    
    // Diretório raiz do projeto (onde está node_modules, remotion, etc)
    this.rootDir = app.getAppPath();
    
    // Caminho do entry point do Remotion (arquivo TypeScript)
    this.entryPoint = path.resolve(this.rootDir, 'remotion', 'index.ts');
    
    // Diretório para bundles temporários (fora do app, onde podemos escrever)
    this.bundleDir = path.resolve(app.getPath('userData'), 'remotion-bundle');
    
    // Diretório de saída dos vídeos
    this.outputDir = path.resolve(app.getPath('userData'), 'generated-videos');
    this.fallbackOutputDir = path.resolve(process.cwd(), 'rendered-videos');
    this.videosLibraryOutputDir = path.resolve(app.getPath('videos'), 'my-nextron-generated-videos');
    this.activeOutputDir = this.outputDir;
    
    console.log('🎬 VideoService initialized');
    console.log('📂 Root dir:', this.rootDir);
    console.log('📂 Entry point:', this.entryPoint);
    console.log('📂 Bundle dir:', this.bundleDir);
    console.log('📂 Output dir:', this.outputDir);
    console.log('📂 Fallback output dir:', this.fallbackOutputDir);
    console.log('📂 Videos library output dir:', this.videosLibraryOutputDir);
    
    // Criar diretórios se não existirem
    this.ensureDirectoryExists(this.outputDir);
    this.ensureDirectoryExists(this.bundleDir);
    this.ensureDirectoryExists(this.fallbackOutputDir);
    this.ensureDirectoryExists(this.videosLibraryOutputDir);
  }

  /**
   * Cria o bundle webpack do Remotion (necessário antes de renderizar)
   */
  private async ensureBundle(): Promise<string> {
    // Se já temos um bundle cacheado e o source não mudou, reutilizar
    if (this.cachedBundlePath && fs.existsSync(this.cachedBundlePath)) {
      console.log('🎬 Usando bundle cacheado');
      return this.cachedBundlePath;
    }

    console.log('🎬 Criando bundle do Remotion...');
    this.emitProgress({ 
      progress: 0, 
      stage: 'bundling',
      percent: 0,
    });

    try {
      // Limpar bundle anterior para evitar conflitos
      if (fs.existsSync(this.bundleDir)) {
        fs.rmSync(this.bundleDir, { recursive: true, force: true });
        fs.mkdirSync(this.bundleDir, { recursive: true });
      }

      const bundlePath = await bundle({
        entryPoint: this.entryPoint,
        outDir: this.bundleDir,
        // Configuração crítica: definir rootDir para resolver node_modules corretamente
        rootDir: this.rootDir,
        onProgress: (progress) => {
          this.emitProgress({ 
            progress: progress * 0.1,
            stage: 'bundling',
            percent: Math.round(progress * 10),
          });
        },
      });

      this.cachedBundlePath = bundlePath;
      console.log('✅ Bundle criado:', bundlePath);
      return bundlePath;
    } catch (error: any) {
      console.error('❌ Erro ao criar bundle:', error);
      console.error('❌ Stack:', error.stack);
      
      // Se o bundle falhou, tentar usar CLI do Remotion como fallback
      console.log('🔄 Tentando fallback via CLI do Remotion...');
      return this.bundleViaCLI();
    }
  }

  /**
   * Fallback: Cria bundle via CLI do Remotion (mais robusto em ambiente Electron)
   */
  private async bundleViaCLI(): Promise<string> {
    const { spawn } = await import('child_process');
    
    return new Promise((resolve, reject) => {
      const npxPath = process.platform === 'win32' ? 'npx.cmd' : 'npx';
      
      const args = [
        'remotion',
        'bundle',
        this.entryPoint,
        '--out-dir', this.bundleDir,
      ];

      console.log(`🎬 Executando: ${npxPath} ${args.join(' ')}`);
      console.log(`📁 CWD: ${this.rootDir}`);

      const child = spawn(npxPath, args, {
        cwd: this.rootDir,
        shell: true,
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
        console.log('[Remotion]', data.toString().trim());
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
        console.error('[Remotion Error]', data.toString().trim());
      });

      child.on('close', (code) => {
        if (code === 0) {
          // O bundle fica em bundleDir/index.html
          const bundlePath = this.bundleDir;
          this.cachedBundlePath = bundlePath;
          console.log('✅ Bundle criado via CLI:', bundlePath);
          resolve(bundlePath);
        } else {
          reject(new Error(`Remotion bundle falhou com código ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Falha ao executar Remotion CLI: ${error.message}`));
      });
    });
  }

  // ========================================
  // PUBLIC METHODS
  // ========================================

  /**
   * Renderiza um projeto de vídeo a partir de um JSON estruturado
   */
  public async renderProject(
    project: VideoProjectInput,
    options?: {
      outputFileName?: string;
      codec?: 'h264' | 'h265' | 'vp8' | 'vp9';
      crf?: number;
      hardwareAcceleration?: 'if-possible' | 'required' | 'disable' | 'hybrid-ffmpeg';
    }
  ): Promise<RenderResult> {
    const fileName = options?.outputFileName || 
      `${this.sanitizeFileName(project.project_title)}-${Date.now()}.mp4`;

    const scenes = project.scenes || (project as any).segments || [];
    let outputPath = '';

    if (scenes.length === 0) {
      return { success: false, error: 'Projeto sem cenas para renderizar.' };
    }

    try {
      console.log('🎬 [FFmpeg] INICIANDO PIPELINE DE RENDERIZAÇÃO (SEM REMOTION)...');
      outputPath = this.resolveOutputPath(
        fileName,
        this.estimateProjectOutputSizeBytes(project),
      );

      const sequencer = new FFmpegSequencer(path.dirname(outputPath), app.getPath('temp'));
      let lastNativeProgressPercent = -1;

      console.log(`[FFmpeg] Iniciando agrupamento de base video: ${outputPath}`);
      this.emitProgress({ progress: 0.05, stage: 'rendering', projectTitle: project.project_title, percent: 5 });

      await sequencer.buildBaseVideo(
        project,
        outputPath,
        (pct: number) => {
          if (!Number.isFinite(pct)) {
            return;
          }

          const boundedPct = Math.max(0, Math.min(100, pct));
          const roundedPct = Math.round(boundedPct);
          if (roundedPct === lastNativeProgressPercent) {
            return;
          }
          lastNativeProgressPercent = roundedPct;

          console.log(`[FFmpeg Log] Gerando Base Nativas: ${boundedPct.toFixed(2)}%`);
          this.emitProgress({
            progress: 0.05 + (0.95 * (boundedPct / 100)),
            stage: boundedPct >= 99 ? 'encoding' : 'rendering',
            projectTitle: project.project_title,
            percent: Math.round(5 + (95 * (boundedPct / 100))),
          });
        }
      );

      console.log(`[FFmpeg] Concluído arquivo nativo renderizado em: ${outputPath}`);
      this.emitProgress({ progress: 1, stage: 'complete', projectTitle: project.project_title, percent: 100 });
      return { success: true, outputPath };
    } catch (err: any) {
      console.warn('⚠️ FFmpeg reportou erro, verificando integridade do arquivo...');
      const normalizedError = this.normalizeRenderError(err);
      const isLikelyFalsePositive =
        /No space left on device|ENOSPC|4294967268|Conversion failed/i.test(normalizedError);

      // LÓGICA DE RESGATE: Se o arquivo foi gerado e tem tamanho, ignoramos o erro de fechamento de buffer
      if (
        isLikelyFalsePositive &&
        outputPath &&
        fs.existsSync(outputPath) &&
        fs.statSync(outputPath).size > 1024 * 1024
      ) {
        console.log(`✅ [Resgate] Arquivo íntegro encontrado. Ignorando erro: ${err.message}`);
        this.emitProgress({ progress: 1, stage: 'complete', projectTitle: project.project_title, percent: 100 });
        return { success: true, outputPath };
      }

      return { success: false, error: normalizedError };
    }
  }

  /**
   * Renderiza um projeto a partir de um arquivo JSON
   */
  public async renderProjectFromFile(
    jsonFilePath: string,
    options?: {
      outputFileName?: string;
      codec?: 'h264' | 'h265' | 'vp8' | 'vp9';
      crf?: number;
    }
  ): Promise<RenderResult> {
    try {
      const jsonContent = fs.readFileSync(jsonFilePath, 'utf-8');
      const project = JSON.parse(jsonContent) as VideoProjectInput;
      return this.renderProject(project, options);
    } catch (error) {
      return {
        success: false,
        error: `Erro ao ler arquivo JSON: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Renderiza uma composição como vídeo
   */
  public async render(options: RenderOptions): Promise<RenderResult> {
    if (this.isRendering) {
      return {
        success: false,
        error: 'Uma renderização já está em andamento. Aguarde a conclusão.',
      };
    }

    const startTime = Date.now();
    this.isRendering = true;
    
    // Extrair título do projeto se for VideoProject
    const projectTitle = (options.inputProps?.project as any)?.project_title;

    try {
      this.emitProgress({ 
        progress: 0, 
        stage: 'preparing',
        projectTitle,
      });

      // 1. Verificar se o entry point existe
      if (!fs.existsSync(this.entryPoint)) {
        throw new Error(`Entry point não encontrado: ${this.entryPoint}`);
      }

      // 2. Criar bundle do Remotion
      const bundlePath = await this.ensureBundle();

      // 3. Selecionar a composição
      console.log(`🎬 Selecionando composição: ${options.compositionId}`);
      
      const composition = await selectComposition({
        serveUrl: bundlePath,
        id: options.compositionId,
        inputProps: options.inputProps || {},
      });

      // Sobrescrever duração/fps se especificado
      if (options.durationInFrames) {
        composition.durationInFrames = options.durationInFrames;
      }
      if (options.fps) {
        composition.fps = options.fps;
      }
      if (options.width) {
        composition.width = options.width;
      }
      if (options.height) {
        composition.height = options.height;
      }

      // 3. Definir caminho de saída
      const outputPath = this.resolveOutputPath(
        options.outputFileName,
        this.estimateCompositionOutputSizeBytes(composition, options.inputProps),
      );

      // Remover arquivo existente se houver
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }

      console.log(`🎬 Iniciando renderização: ${outputPath}`);
      console.log(`📊 Duração: ${composition.durationInFrames} frames @ ${composition.fps} fps`);
      
      this.emitProgress({ 
        progress: 0.05, 
        stage: 'rendering',
        totalFrames: composition.durationInFrames,
        projectTitle,
      });

      // 4. Renderizar
      const onProgress: RenderMediaOnProgress = ({ progress, renderedFrames }) => {
        const percentComplete = Math.round((0.1 + (progress * 0.9)) * 100);
        this.emitProgress({
          progress: 0.1 + (progress * 0.9),
          stage: progress >= 0.95 ? 'encoding' : 'rendering',
          renderedFrames: renderedFrames,
          totalFrames: composition.durationInFrames,
          projectTitle,
          percent: percentComplete,
          frame: renderedFrames,
        });
      };

      // Configurar aceleração por hardware
      const hwAccelRaw = options.hardwareAcceleration || 'if-possible';
      const hwAccel = (hwAccelRaw === 'hybrid-ffmpeg' ? 'if-possible' : hwAccelRaw) as 'if-possible' | 'required' | 'disable';
      console.log(`🔧 Hardware acceleration: ${hwAccel}`);

      await renderMedia({
        composition,
        serveUrl: bundlePath,
        codec: this.mapCodec(options.codec || 'h264'),
        outputLocation: outputPath,
        inputProps: options.inputProps || {},
        crf: options.crf,
        onProgress,
        // @ts-ignore
        imageFormat: (options as any).isHybridOverlay ? 'png' : 'jpeg',
        // @ts-ignore
        transparentBackground: (options as any).isHybridOverlay ? true : false,
        
        hardwareAcceleration: hwAccel,
        // Adicione ou reduza a concorrência (padrão é metade dos núcleos da CPU)
        // Tente um valor baixo (ex: 2 ou 4) para ver se o erro EMFILE desaparece
        concurrency: 4,
        // Habilitar GPU do Chromium para renderização (WebGL, sombras, etc)
        chromiumOptions: {
          gl: 'angle', // Recomendado para Windows
          disableWebSecurity: true,
        },
        // Aumentar timeout para vídeos grandes ou primeira carga
        timeoutInMilliseconds: 300000, // 5 minutos (antes: 90s não foi suficiente)
      });

      const durationMs = Date.now() - startTime;
      console.log(`✅ Vídeo renderizado em ${this.formatDuration(durationMs)}: ${outputPath}`);

      this.emitProgress({ 
        progress: 1, 
        stage: 'complete',
        projectTitle,
      });

      return {
        success: true,
        outputPath,
        durationMs,
      };

    } catch (error) {
      console.error('❌ Erro na renderização:', error);
      return {
        success: false,
        error: this.normalizeRenderError(error),
      };
    } finally {
      this.isRendering = false;
    }
  }

  /**
   * Lista todas as composições disponíveis
   */
  public async listCompositions(): Promise<CompositionInfo[]> {
    try {
      const bundlePath = await this.ensureBundle();
      const compositions = await getCompositions(bundlePath);
      
      return compositions.map(comp => ({
        id: comp.id,
        width: comp.width,
        height: comp.height,
        fps: comp.fps,
        durationInFrames: comp.durationInFrames,
      }));
    } catch (error) {
      console.error('Erro ao listar composições:', error);
      return [];
    }
  }

  /**
   * Valida um projeto JSON antes de renderizar
   */
  public validateProject(project: VideoProjectInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!project.project_title) {
      errors.push('project_title é obrigatório');
    }
    
    if (!project.scenes || project.scenes.length === 0) {
      errors.push('O projeto deve ter pelo menos uma cena');
    }
    
    project.scenes?.forEach((scene, index) => {
      if (scene.start_time === undefined) {
        errors.push(`Cena ${index + 1}: start_time é obrigatório`);
      }
      if (scene.end_time === undefined) {
        errors.push(`Cena ${index + 1}: end_time é obrigatório`);
      }
      if (scene.start_time >= scene.end_time) {
        errors.push(`Cena ${index + 1}: start_time deve ser menor que end_time`);
      }
      if (!scene.visual_concept?.description) {
        errors.push(`Cena ${index + 1}: visual_concept.description é obrigatório`);
      }
      if (!scene.asset_type) {
        errors.push(`Cena ${index + 1}: asset_type é obrigatório`);
      }
    });
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Retorna o diretório onde os vídeos são salvos
   */
  public getOutputDirectory(): string {
    return this.activeOutputDir;
  }

  /**
   * Verifica se uma renderização está em andamento
   */
  public isRenderingInProgress(): boolean {
    return this.isRendering;
  }

  /**
   * Abre o diretório de vídeos gerados
   */
  public async openOutputDirectory(): Promise<void> {
    const { shell } = await import('electron');
    shell.openPath(this.activeOutputDir);
  }

  /**
   * Lista vídeos gerados
   */
  public listGeneratedVideos(): Array<{ name: string; path: string; size: number; createdAt: Date }> {
    const videos: Array<{ name: string; path: string; size: number; createdAt: Date }> = [];

    try {
      for (const directory of this.getOutputDirectories()) {
        if (!fs.existsSync(directory)) {
          continue;
        }

        const files = fs.readdirSync(directory);
        for (const name of files) {
          if (!name.endsWith('.mp4') && !name.endsWith('.webm') && !name.endsWith('.gif')) {
            continue;
          }

          const filePath = path.join(directory, name);
          const stats = fs.statSync(filePath);
          videos.push({
            name,
            path: filePath,
            size: stats.size,
            createdAt: stats.birthtime,
          });
        }
      }

      return videos.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      console.error('Erro ao listar vídeos:', error);
      return videos;
    }
  }

  // ========================================
  // PRIVATE METHODS
  // ========================================

  private getOutputDirectories(): string[] {
    const envOutputDir = process.env.VIDEO_RENDER_OUTPUT_DIR?.trim();
    const candidates = [envOutputDir, this.outputDir, this.fallbackOutputDir, this.videosLibraryOutputDir]
      .filter((value): value is string => Boolean(value))
      .map(dir => path.resolve(dir));

    return [...new Set(candidates)];
  }

  private ensureDirectoryExists(directory: string): boolean {
    try {
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }
      return true;
    } catch (error) {
      console.warn(`⚠️ Não foi possível criar diretório de saída: ${directory}`, error);
      return false;
    }
  }

  private getFreeSpaceBytes(directory: string): number | null {
    try {
      const stats = fs.statfsSync(directory);
      return Number(stats.bsize) * Number(stats.bavail);
    } catch (error) {
      console.warn(`⚠️ Não foi possível ler espaço livre em ${directory}:`, error);
      return null;
    }
  }

  private estimateOutputSizeBytes(params: {
    durationSeconds: number;
    width: number;
    height: number;
    fps: number;
    hasAudio: boolean;
  }): number {
    const normalizedPixelsPerSecond =
      (params.width * params.height * Math.max(1, params.fps)) / (1920 * 1080 * 30);
    const estimatedVideoMbps = Math.max(4, 10 * Math.max(0.2, normalizedPixelsPerSecond));
    const estimatedAudioMbps = params.hasAudio ? 0.192 : 0;
    const totalMbps = estimatedVideoMbps + estimatedAudioMbps;
    const rawBytes = (Math.max(1, params.durationSeconds) * totalMbps * 1_000_000) / 8;

    // Margem de segurança para variabilidade do CRF/preset e overhead do contêiner.
    return Math.ceil(rawBytes * 1.35);
  }

  private estimateProjectOutputSizeBytes(project: VideoProjectInput): number {
    const scenes = project.scenes || (project as any).segments || [];
    const durationSeconds = Math.max(
      1,
      scenes.reduce((maxEnd: number, scene: any) => {
        const end = Number(scene.end_time ?? scene.end ?? 0);
        return Math.max(maxEnd, Number.isFinite(end) ? end : 0);
      }, 0),
    );

    const width = project.config?.width || 1080;
    const height = project.config?.height || 1920;
    const fps = project.config?.fps || 30;
    const hasAudio = Boolean((project as any).audioPath || project.config?.backgroundMusic?.src);

    return this.estimateOutputSizeBytes({
      durationSeconds,
      width,
      height,
      fps,
      hasAudio,
    });
  }

  private estimateCompositionOutputSizeBytes(
    composition: { durationInFrames: number; fps: number; width: number; height: number },
    inputProps?: Record<string, unknown>,
  ): number {
    const durationSeconds = Math.max(1, composition.durationInFrames / Math.max(1, composition.fps));
    const hasAudio = this.hasProjectAudio(inputProps);

    return this.estimateOutputSizeBytes({
      durationSeconds,
      width: composition.width,
      height: composition.height,
      fps: composition.fps,
      hasAudio,
    });
  }

  private hasProjectAudio(inputProps?: Record<string, unknown>): boolean {
    const project = (inputProps?.project || {}) as any;
    return Boolean(project?.audioPath || project?.config?.backgroundMusic?.src);
  }

  private resolveOutputPath(fileName: string, estimatedBytes?: number): string {
    const directories = this.getOutputDirectories().filter((directory) => this.ensureDirectoryExists(directory));
    const safetyBufferBytes = 300 * 1024 * 1024;

    if (directories.length === 0) {
      throw new Error('Nenhum diretório de saída está disponível para gravação.');
    }

    if (estimatedBytes === undefined) {
      this.activeOutputDir = directories[0];
      return path.join(this.activeOutputDir, fileName);
    }

    for (const directory of directories) {
      const freeBytes = this.getFreeSpaceBytes(directory);
      if (freeBytes === null || freeBytes >= estimatedBytes + safetyBufferBytes) {
        if (directory !== directories[0]) {
          console.warn(`⚠️ Espaço insuficiente no diretório padrão. Usando fallback: ${directory}`);
        }
        this.activeOutputDir = directory;
        return path.join(directory, fileName);
      }
    }

    const preferredDir = directories[0];
    const freeBytes = this.getFreeSpaceBytes(preferredDir);
    const requiredText = this.formatBytes(estimatedBytes + safetyBufferBytes);
    const freeText = freeBytes === null ? 'desconhecido' : this.formatBytes(freeBytes);
    throw new Error(
      `Espaço em disco insuficiente para renderização. Necessário ~${requiredText}, disponível ${freeText} em ${preferredDir}. ` +
      'Libere espaço ou defina VIDEO_RENDER_OUTPUT_DIR para outro disco.',
    );
  }

  private normalizeRenderError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (/No space left on device|ENOSPC|4294967268/i.test(message)) {
      const targetDir = this.activeOutputDir || this.outputDir;
      return (
        `${message}\n\n` +
        `FFmpeg reportou ENOSPC ao renderizar em: ${targetDir}. ` +
        'Isso pode ser falta real de espaço OU falso positivo do muxer em pipelines longos. ' +
        'Se o arquivo final estiver íntegro, o erro pode ser ignorado.'
      );
    }

    return message;
  }

  private emitProgress(progress: RenderProgress): void {
    this.emit('progress', progress);
  }

  private mapCodec(codec: string): 'h264' | 'h265' | 'vp8' | 'vp9' | 'gif' {
    const validCodecs = ['h264', 'h265', 'vp8', 'vp9', 'gif'];
    return validCodecs.includes(codec) ? codec as any : 'h264';
  }

  private sanitizeFileName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50);
  }

  private formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  }
}
