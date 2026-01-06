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

  // Handler para gerar questões de quiz com IA
  ipcMain.handle('quiz:generate', async (
    event, 
    options: {
      theme: string;
      easyCount: number;
      mediumCount: number;
      hardCount: number;
      optionsCount: number;
      provider: 'gemini' | 'openai' | 'deepseek';
    }
  ) => {
    try {
      const totalQuestions = options.easyCount + options.mediumCount + options.hardCount;
      console.log(`🎯 [Quiz] Generating quiz with ${options.provider}...`);
      console.log(`📝 Theme: "${options.theme}", Easy: ${options.easyCount}, Medium: ${options.mediumCount}, Hard: ${options.hardCount}`);

      const difficultyText: Record<string, string> = {
        easy: 'fáceis, adequadas para iniciantes',
        medium: 'de dificuldade moderada',
        hard: 'difíceis e desafiadoras',
      };

      // Constrói requisição para cada dificuldade
      const difficultyRequests: string[] = [];
      if (options.easyCount > 0) {
        difficultyRequests.push(`- ${options.easyCount} perguntas FÁCEIS (${difficultyText.easy})`);
      }
      if (options.mediumCount > 0) {
        difficultyRequests.push(`- ${options.mediumCount} perguntas MÉDIAS (${difficultyText.medium})`);
      }
      if (options.hardCount > 0) {
        difficultyRequests.push(`- ${options.hardCount} perguntas DIFÍCEIS (${difficultyText.hard})`);
      }

      const prompt = `Crie um quiz sobre "${options.theme}" com exatamente ${totalQuestions} perguntas, divididas assim:

${difficultyRequests.join('\n')}

Requisitos:
- Cada pergunta deve ter exatamente ${options.optionsCount} opções de resposta
- Inclua uma explicação breve para cada resposta correta
- As opções devem ser plausíveis, mas apenas uma correta
- Inclua o campo "difficulty" em cada questão ("easy", "medium" ou "hard")
- IMPORTANTE: Respeite exatamente a quantidade de perguntas para cada dificuldade

Responda com um JSON no seguinte formato:
{
  "questions": [
    {
      "question": "Qual é a pergunta?",
      "options": ["Opção A", "Opção B", "Opção C", "Opção D"],
      "correctIndex": 0,
      "explanation": "Explicação da resposta correta.",
      "difficulty": "easy"
    }
  ]
}

Lembre-se:
- correctIndex é o índice (0-based) da opção correta
- difficulty deve ser "easy", "medium" ou "hard"
- Garanta que o JSON seja válido`;

      let result: any;

      if (options.provider === 'gemini') {
        const { GeminiService } = require('../services/gemini-service');
        const gemini = new GeminiService();
        result = await gemini.getChatVideoAnalysis([
          { role: 'system', content: 'Você é um criador de quizzes educativos. Responda sempre com JSON válido.' },
          { role: 'user', content: prompt }
        ]);
      } else if (options.provider === 'openai') {
        const { OpenAIService } = require('../services/openai-service');
        const openai = new OpenAIService();
        result = await openai.getChatVideoAnalysis([
          { role: 'system', content: 'Você é um criador de quizzes educativos. Responda sempre com JSON válido.' },
          { role: 'user', content: prompt }
        ]);
      } else if (options.provider === 'deepseek') {
        const { DeepSeekService } = require('../services/deepseek-service');
        const deepseek = new DeepSeekService();
        result = await deepseek.getChatVideoAnalysis([
          { role: 'system', content: 'Você é um criador de quizzes educativos. Responda sempre com JSON válido.' },
          { role: 'user', content: prompt }
        ]);
      } else {
        throw new Error(`Provider inválido: ${options.provider}`);
      }

      // Valida a resposta
      if (!result || !result.questions || !Array.isArray(result.questions)) {
        throw new Error('Resposta inválida da IA');
      }

      // Valida cada questão
      const validQuestions = result.questions.map((q: any, i: number) => {
        if (!q.question || !Array.isArray(q.options) || typeof q.correctIndex !== 'number') {
          throw new Error(`Questão ${i + 1} mal formatada`);
        }
        return {
          question: q.question,
          options: q.options.slice(0, options.optionsCount),
          correctIndex: Math.min(q.correctIndex, options.optionsCount - 1),
          explanation: q.explanation || '',
          difficulty: q.difficulty || 'medium',
        };
      });

      console.log(`✅ [Quiz] Generated ${validQuestions.length} questions successfully`);
      return { success: true, questions: validQuestions };

    } catch (error: any) {
      console.error('❌ [Quiz] Generation error:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler para gerar áudio completo do quiz (um único arquivo)
  ipcMain.handle('quiz:generate-audio', async (
    event,
    options: {
      questions: Array<{
        question: string;
        options: string[];
        correctIndex: number;
        explanation?: string;
      }>;
      voiceName?: string;
      outputDir?: string;
      includeOptions?: boolean;      // Incluir opções de resposta
      includeCorrectAnswer?: boolean; // Incluir resposta correta
      includeExplanations?: boolean;  // Incluir explicações
    }
  ) => {
    try {
      console.log(`🎤 [Quiz] Generating complete audio for ${options.questions.length} questions...`);
      
      const { getGeminiVoiceService } = require('../services/gemini-voice-service');
      const voiceService = getGeminiVoiceService();
      
      // Define pasta de saída
      const path = require('path');
      const outputDir = options.outputDir || path.join(
        require('electron').app.getPath('userData'), 
        'quiz-audio'
      );
      
      // Cria diretório se não existe
      const fs = require('fs');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Envia progresso para o frontend
      const window = getWindowFn?.();
      if (window && !window.isDestroyed()) {
        window.webContents.send('quiz:audio-progress', {
          current: 0,
          total: 1,
          stage: 'building'
        });
      }
      
      // Valores padrão para as opções
      const includeOptions = options.includeOptions !== false; // Padrão: true
      const includeCorrectAnswer = options.includeCorrectAnswer ?? false; // Padrão: false
      const includeExplanations = options.includeExplanations ?? false; // Padrão: false
      
      // Constrói o texto completo do quiz
      const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
      let fullScript = '';
      
      for (let i = 0; i < options.questions.length; i++) {
        const q = options.questions[i];
        const correctLetter = optionLetters[q.correctIndex];
        
        // Adiciona a pergunta
        fullScript += `Questão ${i + 1}. ${q.question} `;
        
        // Adiciona as opções (se habilitado)
        if (includeOptions) {
          for (let j = 0; j < q.options.length; j++) {
            fullScript += `${optionLetters[j]}: ${q.options[j]}. `;
          }
        }
        
        // Adiciona resposta correta (se habilitado)
        if (includeCorrectAnswer) {
          fullScript += `A resposta correta é ${correctLetter}. `;
        }
        
        // Adiciona explicação (se habilitado e existir)
        if (includeExplanations && q.explanation) {
          fullScript += `${q.explanation} `;
        }
        
        // Pausa entre questões
        fullScript += ' ';
      }
      
      console.log(`📝 [Quiz] Script completo: ${fullScript.length} caracteres`);
      
      // Envia progresso
      if (window && !window.isDestroyed()) {
        window.webContents.send('quiz:audio-progress', {
          current: 1,
          total: 1,
          stage: 'generating'
        });
      }
      
      // Gera o áudio completo
      const timestamp = Date.now();
      const outputPath = path.join(outputDir, `quiz_complete_${timestamp}.wav`);
      
      const result = await voiceService.generateSpeech({
        text: fullScript,
        voiceName: options.voiceName || 'Kore',
        outputPath: outputPath
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao gerar áudio');
      }
      
      console.log(`✅ [Quiz] Audio completo gerado: ${outputPath}`);
      return { 
        success: true, 
        audioPath: outputPath,
        outputDir,
        scriptLength: fullScript.length,
        questionsCount: options.questions.length
      };
      
    } catch (error: any) {
      console.error('❌ [Quiz] Audio generation error:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('✅ [VideoEditor] Handlers registered');
}
