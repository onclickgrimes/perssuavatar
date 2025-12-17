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
import path from 'path';
import { app } from 'electron';
import { EventEmitter } from 'events';
import fs from 'fs';

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
  stage: 'preparing' | 'rendering' | 'encoding' | 'complete';
  /** Frame atual sendo renderizado */
  renderedFrames?: number;
  /** Total de frames */
  totalFrames?: number;
  /** Título do projeto (se aplicável) */
  projectTitle?: string;
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
  private bundlePath: string;
  private outputDir: string;
  private isRendering: boolean = false;

  constructor() {
    super();
    
    // Caminho do entry point do Remotion
    this.bundlePath = path.join(app.getAppPath(), 'remotion', 'index.ts');
    
    // Diretório de saída dos vídeos
    this.outputDir = path.join(app.getPath('userData'), 'generated-videos');
    
    // Criar diretório se não existir
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
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
    }
  ): Promise<RenderResult> {
    const fileName = options?.outputFileName || 
      `${this.sanitizeFileName(project.project_title)}-${Date.now()}.mp4`;
    
    return this.render({
      compositionId: 'VideoProject',
      outputFileName: fileName,
      inputProps: { project },
      codec: options?.codec || 'h264',
      crf: options?.crf,
    });
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

      // 1. Verificar se o bundlePath existe
      if (!fs.existsSync(this.bundlePath)) {
        throw new Error(`Entry point não encontrado: ${this.bundlePath}`);
      }

      // 2. Selecionar a composição
      console.log(`🎬 Selecionando composição: ${options.compositionId}`);
      
      const composition = await selectComposition({
        serveUrl: this.bundlePath,
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

      // 3. Definir caminho de saída
      const outputPath = path.join(this.outputDir, options.outputFileName);

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
        this.emitProgress({
          progress: 0.05 + (progress * 0.9),
          stage: progress >= 0.95 ? 'encoding' : 'rendering',
          renderedFrames: renderedFrames,
          totalFrames: composition.durationInFrames,
          projectTitle,
        });
      };

      await renderMedia({
        composition,
        serveUrl: this.bundlePath,
        codec: this.mapCodec(options.codec || 'h264'),
        outputLocation: outputPath,
        inputProps: options.inputProps || {},
        crf: options.crf,
        onProgress,
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
        error: error instanceof Error ? error.message : String(error),
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
      const compositions = await getCompositions(this.bundlePath);
      
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
    return this.outputDir;
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
    shell.openPath(this.outputDir);
  }

  /**
   * Lista vídeos gerados
   */
  public listGeneratedVideos(): Array<{ name: string; path: string; size: number; createdAt: Date }> {
    try {
      const files = fs.readdirSync(this.outputDir);
      
      return files
        .filter(f => f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.gif'))
        .map(name => {
          const filePath = path.join(this.outputDir, name);
          const stats = fs.statSync(filePath);
          return {
            name,
            path: filePath,
            size: stats.size,
            createdAt: stats.birthtime,
          };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      console.error('Erro ao listar vídeos:', error);
      return [];
    }
  }

  // ========================================
  // PRIVATE METHODS
  // ========================================

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
