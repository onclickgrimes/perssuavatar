/**
 * Video Editor Handlers
 * 
 * Handlers IPC para o Video Studio/Editor.
 * Gerencia transcrição, análise por IA, renderização e persistência de projetos.
 */
import { ipcMain, BrowserWindow } from 'electron';
import { VideoProjectSegment, VideoProjectData, VideoProjectService } from '../services/video-project-service';

// ========================================
// STATE
// ========================================

let videoProjectService: VideoProjectService | null = null;
let getWindowFn: (() => BrowserWindow | null) | null = null;

// ========================================
// INITIALIZATION
// ========================================

/**
 * Retorna o serviço de vídeo (para uso externo quando necessário)
 */
export function getVideoProjectServiceInstance(): VideoProjectService | null {
  return videoProjectService;
}

/**
 * Inicializa o serviço de vídeo e configura event listeners
 * @param getWindow Função que retorna a janela do Video Studio
 */
export function initializeVideoProjectService(getWindow: () => BrowserWindow | null): void {
  if (videoProjectService) return; // Já inicializado
  
  getWindowFn = getWindow;
  videoProjectService = new VideoProjectService();

  // Listener para status do projeto
  videoProjectService.on('status', (data: any) => {
    const window = getWindowFn?.();
    if (window && !window.isDestroyed()) {
      window.webContents.send('video-project:status', data);
    }
  });

  // Listener para progresso de renderização
  videoProjectService.on('render-progress', (data: any) => {
    const window = getWindowFn?.();
    if (window && !window.isDestroyed()) {
      window.webContents.send('video-project:render-progress', data);
    }
  });
  
  console.log('✅ [VideoEditor] Service initialized');
}

/**
 * Destroi o serviço de vídeo
 */
export function destroyVideoProjectService(): void {
  if (videoProjectService) {
    console.log('🛑 [VideoEditor] Destroying video project service...');
    videoProjectService.destroy();
    videoProjectService = null;
    getWindowFn = null;
  }
}

// ========================================
// HANDLERS
// ========================================

/**
 * Registra todos os handlers IPC do Video Editor
 */
export function registerVideoEditorHandlers(): void {
  // Handler para transcrever arquivo de áudio
  ipcMain.handle('video-project:transcribe', async (event, audioPath: string) => {
    try {
      if (!videoProjectService) throw new Error('Serviço de vídeo não inicializado');
      console.log('🎤 [VideoProject] Transcribing audio:', audioPath);
      const result = await videoProjectService.transcribeAudio(audioPath);
      return result;
    } catch (error: any) {
      console.error('❌ [VideoProject] Transcription error:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler para salvar arquivo de áudio enviado do renderer
  ipcMain.handle('video-project:save-audio', async (event, arrayBuffer: ArrayBuffer, fileName: string) => {
    try {
      if (!videoProjectService) throw new Error('Serviço de vídeo não inicializado');
      const buffer = Buffer.from(arrayBuffer);
      const result = await videoProjectService.saveAudioFile(buffer, fileName);
      return { success: true, path: result.path, httpUrl: result.httpUrl };
    } catch (error: any) {
      console.error('❌ [VideoProject] Save audio error:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler para salvar arquivo de imagem enviado do renderer
  ipcMain.handle('video-project:save-image', async (
    event, 
    arrayBuffer: ArrayBuffer, 
    fileName: string, 
    segmentId: number
  ) => {
    try {
      if (!videoProjectService) throw new Error('Serviço de vídeo não inicializado');
      const buffer = Buffer.from(arrayBuffer);
      const result = await videoProjectService.saveImageFile(buffer, fileName, segmentId);
      return { success: true, path: result.path, httpUrl: result.httpUrl };
    } catch (error: any) {
      console.error('❌ [VideoProject] Save image error:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler para analisar segmentos com IA
  ipcMain.handle('video-project:analyze', async (
    event, 
    projectOrSegments: VideoProjectData | VideoProjectSegment[], 
    options?: { 
      provider?: 'gemini' | 'openai' | 'deepseek';
      nichePrompt?: string;
    }
  ) => {
    try {
      if (!videoProjectService) throw new Error('Serviço de vídeo não inicializado');
      const segmentCount = Array.isArray(projectOrSegments) 
        ? projectOrSegments.length 
        : projectOrSegments.segments.length;
      console.log(`🤖 [VideoProject] Analyzing ${segmentCount} segments with AI...`);
      const result = await videoProjectService.analyzeWithAI(projectOrSegments, options);
      return result;
    } catch (error: any) {
      console.error('❌ [VideoProject] Analysis error:', error);
      const segments = Array.isArray(projectOrSegments) ? projectOrSegments : projectOrSegments.segments;
      return { success: false, error: error.message, segments };
    }
  });

  // Handler para converter projeto para formato Remotion
  ipcMain.handle('video-project:convert-to-remotion', async (event, project: VideoProjectData) => {
    try {
      if (!videoProjectService) throw new Error('Serviço de vídeo não inicializado');
      console.log('🎬 [VideoProject] Converting to Remotion format...');
      const remotionProject = videoProjectService.convertToRemotionProject(project);
      return { success: true, project: remotionProject };
    } catch (error: any) {
      console.error('❌ [VideoProject] Conversion error:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler para renderizar projeto
  ipcMain.handle('video-project:render', async (event, project: VideoProjectData) => {
    try {
      if (!videoProjectService) throw new Error('Serviço de vídeo não inicializado');
      console.log('🎬 [VideoProject] Starting render...');
      const result = await videoProjectService.renderProject(project);
      return result;
    } catch (error: any) {
      console.error('❌ [VideoProject] Render error:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler para carregar projeto salvo
  ipcMain.handle('video-project:load', async (event, filePath: string) => {
    try {
      if (!videoProjectService) throw new Error('Serviço de vídeo não inicializado');
      const project = videoProjectService.loadProject(filePath);
      if (project) {
        return { success: true, project };
      }
      return { success: false, error: 'Projeto não encontrado' };
    } catch (error: any) {
      console.error('❌ [VideoProject] Load error:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler para salvar projeto
  ipcMain.handle('video-project:save', async (event, project: VideoProjectData) => {
    try {
      if (!videoProjectService) throw new Error('Serviço de vídeo não inicializado');
      const filePath = videoProjectService.saveProject(project);
      return { success: true, path: filePath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Handler para listar projetos salvos
  ipcMain.handle('video-project:list', async () => {
    try {
      if (!videoProjectService) {
        const tempService = new VideoProjectService();
        const projects = tempService.listProjects();
        tempService.destroy();
        return { success: true, projects };
      }
      const projects = videoProjectService.listProjects();
      return { success: true, projects };
    } catch (error: any) {
      return { success: false, error: error.message, projects: [] };
    }
  });

  // Handler para obter diretório de projetos
  ipcMain.handle('video-project:get-directory', async () => {
    if (!videoProjectService) {
      const tempService = new VideoProjectService();
      const path = tempService.getProjectsDirectory();
      tempService.destroy();
      return { path };
    }
    return { path: videoProjectService.getProjectsDirectory() };
  });

  // Handler para busca semântica de vídeos no Supabase
  ipcMain.handle('video-project:search-videos', async (event, query: string, limit: number = 5) => {
    try {
      console.log(`🔍 [VideoProject] Buscando vídeos com query: "${query}"`);
      
      const { getVideoSearchService } = require('./services/video-search-service');
      const searchService = getVideoSearchService();
      
      const results = await searchService.semanticSearch(query, limit, 0.5);
      
      console.log(`✅ [VideoProject] Encontrados ${results.length} vídeos relevantes`);
      
      return { 
        success: true, 
        videos: results.map((v: any) => {
          const filename = v.name || 'unknown.mp4';
          const category = v.category || 'stock';
          const httpUrl = `http://localhost:9999/videos/${category}/${filename}`;
          
          console.log(`📹 Vídeo: ${filename} (${category}) -> ${httpUrl}`);
          
          return {
            id: v.id,
            filename: v.name,
            filePath: httpUrl,
            category: v.category,
            emotion: v.emotion,
            description: v.description,
            visualTags: v.visual,
            similarity: v.similarity,
            aspectRatio: v.aspect_ratio,
            duration: v.duration,
          };
        })
      };
    } catch (error: any) {
      console.error('❌ [VideoProject] Search error:', error);
      return { success: false, error: error.message, videos: [] };
    }
  });

  console.log('✅ [VideoEditor] Handlers registered');
}
