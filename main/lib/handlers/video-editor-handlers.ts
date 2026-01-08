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

  // Rate limiter para API do Gemini (10 req/min = 6s entre requisições)
  const geminiRateLimiter = {
    lastRequest: 0,
    minInterval: 6500,
    
    async wait() {
      const now = Date.now();
      const elapsed = now - this.lastRequest;
      if (elapsed < this.minInterval) {
        const waitTime = this.minInterval - elapsed;
        console.log(`⏳ [RateLimiter] Waiting ${waitTime}ms before next request...`);
        await new Promise(r => setTimeout(r, waitTime));
      }
      this.lastRequest = Date.now();
    }
  };

  // Handler para gerar áudio do quiz com estratégia otimizada
  // Estrutura: [P1] + silêncio + [R1+P2] + silêncio + [R2+P3]...
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
      includeOptions?: boolean;
      includeCorrectAnswer?: boolean;
      includeExplanations?: boolean;
      thinkingTimeSeconds?: number;
      introText?: string;
    }
  ) => {
    try {
      console.log(`🎤 [Quiz] Generating optimized audio for ${options.questions.length} questions...`);
      
      const { getGeminiVoiceService } = require('../services/gemini-voice-service');
      const voiceService = getGeminiVoiceService();
      
      const path = require('path');
      const fs = require('fs');
      const { execSync } = require('child_process');
      
      // Define pasta de saída
      const outputDir = options.outputDir || path.join(
        require('electron').app.getPath('userData'), 
        'quiz-audio'
      );
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const window = getWindowFn?.();
      
      // Configurações
      const includeOptions = options.includeOptions !== false;
      const includeCorrectAnswer = options.includeCorrectAnswer ?? false;
      const includeExplanations = options.includeExplanations ?? false;
      const thinkingTimeSeconds = options.thinkingTimeSeconds ?? 5;
      
      const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
      const timestamp = Date.now();
      const tempDir = path.join(outputDir, `temp_${timestamp}`);
      
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // --- ETAPA 1: Construção dos Scripts (Shifted Strategy) ---
      const audioScripts: string[] = [];
      
      // Helper para formatar opções
      const formatOptions = (q: any) => {
         if (!includeOptions) return '';
         return q.options.map((opt: string, idx: number) => `${optionLetters[idx]}: ${opt}.`).join(' ');
      };
      
      // Helper para formatar resposta/explicação
      const formatAnswer = (q: any) => {
        let text = '';
        if (includeCorrectAnswer) text += `A resposta correta é ${optionLetters[q.correctIndex]}. `;
        if (includeExplanations && q.explanation) text += `${q.explanation} `;
        return text;
      };

      // 1. Primeiro bloco: Apenas a primeira pergunta (com Intro)
      const introPrefix = options.introText ? `${options.introText}... ` : '';
      audioScripts.push(`${introPrefix}Questão 1. ${options.questions[0].question} ${formatOptions(options.questions[0])}`);
      
      // 2. Blocos intermediários: Resposta da anterior + Próxima pergunta
      for (let i = 0; i < options.questions.length - 1; i++) {
        const prevQ = options.questions[i];
        const nextQ = options.questions[i + 1];
        
        const text = `${formatAnswer(prevQ)} Questão ${i + 2}. ${nextQ.question} ${formatOptions(nextQ)}`;
        audioScripts.push(text);
      }
      
      // 3. Último bloco: Resposta da última pergunta (se necessário)
      const lastAnswer = formatAnswer(options.questions[options.questions.length - 1]);
      if (lastAnswer.trim().length > 0) {
        audioScripts.push(lastAnswer);
      }
      
      console.log(`📝 [Quiz] Scripts prepared: ${audioScripts.length} blocks`);
      
      // --- ETAPA 2: Geração de Áudio com Rate Limiting ---
      const audioFiles: string[] = [];
      const totalSteps = audioScripts.length + 2;
      
      for (let i = 0; i < audioScripts.length; i++) {
        // Reporta progresso
        if (window && !window.isDestroyed()) {
          window.webContents.send('quiz:audio-progress', {
            current: i + 1,
            total: totalSteps,
            stage: `generating block ${i + 1}/${audioScripts.length}`
          });
        }
        
        await geminiRateLimiter.wait();
        
        const blockPath = path.join(tempDir, `block_${i}.wav`);
        const result = await voiceService.generateSpeech({
          text: audioScripts[i],
          voiceName: options.voiceName || 'Kore',
          outputPath: blockPath
        });
        
        if (!result.success) {
          throw new Error(`Erro ao gerar bloco de áudio ${i + 1}: ${result.error}`);
        }
        
        audioFiles.push(blockPath);
        console.log(`✅ [Quiz] Block ${i} generated`);
      }
      
      // --- ETAPA 3: Concatenação com Silêncio ---
      if (window && !window.isDestroyed()) {
        window.webContents.send('quiz:audio-progress', {
          current: audioScripts.length + 1,
          total: totalSteps,
          stage: 'concatenating'
        });
      }
      
      // Gera arquivo de silêncio (Thinking Time)
      const silenceFile = path.join(tempDir, 'thinking_silence.wav');
      try {
        execSync(
          `ffmpeg -y -f lavfi -i anullsrc=r=24000:cl=mono -t ${thinkingTimeSeconds} "${silenceFile}"`,
          { encoding: 'utf8', stdio: 'pipe' }
        );
      } catch (e) {
        // Fallback se falhar criar silêncio (não ideal, mas previne crash)
        console.warn('⚠️ [Quiz] Could not create silence file via ffmpeg');
      }

      // Cria lista de concatenação
      // Lógica: Block 0 + Silence + Block 1 + Silence + ... + Block N
      // (Não adiciona silêncio após o ÚLTIMO bloco se ele for apenas resposta)
      
      const concatListPath = path.join(tempDir, 'concat_list.txt');
      let concatContent = '';
      
      for (let i = 0; i < audioFiles.length; i++) {
        concatContent += `file '${audioFiles[i].replace(/'/g, "'\\''")}'\\n`;
        
        // Adiciona silêncio APÓS o bloco, EXCETO se for o último
        // (O último bloco é a última resposta, não precisa de "pensar" depois dele)
        if (i < options.questions.length && fs.existsSync(silenceFile)) {
             concatContent += `file '${silenceFile.replace(/'/g, "'\\''")}'\\n`;
        }
      }
      
      fs.writeFileSync(concatListPath, concatContent.replace(/\\n/g, '\n'));
      
      // Executa Concatenação
      const finalOutputPath = path.join(outputDir, `quiz_complete_${timestamp}.wav`);
      try {
        execSync(
          `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${finalOutputPath}"`,
          { encoding: 'utf8', stdio: 'pipe' }
        );
      } catch (e: any) {
        throw new Error('Erro ao concatenar áudios com ffmpeg');
      }
      
      console.log(`✅ [Quiz] Final audio created: ${finalOutputPath}`);
      
      // --- ETAPA 4: Transcrição (Crucial para sincronização) ---
      if (window && !window.isDestroyed()) {
        window.webContents.send('quiz:audio-progress', {
          current: totalSteps,
          total: totalSteps,
          stage: 'transcribing'
        });
      }
      
      const { getAudioTranscriptionService } = require('../services/audio-transcription-service');
      const transcriptionService = getAudioTranscriptionService();
      
      // Transcreve o arquivo FINAL concatenado para obter os timestamps reais
      // Isso é necessário porque os tempos mudaram com a inserção de silêncio
      // e os blocos misturados
      const transcriptionResult = await transcriptionService.transcribeFile(finalOutputPath);
      
      if (!transcriptionResult.success) {
        console.warn('⚠️ [Quiz] Transcription failed:', transcriptionResult.error);
        return { 
          success: true, 
          audioPath: finalOutputPath,
          outputDir,
          duration: 0,
          segments: [],
          questionsCount: options.questions.length
        };
      }
      
      // Limpeza
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}

      // Mapeia segmentos
      const quizSegments = transcriptionResult.segments.map((seg: any) => ({
        id: seg.id,
        text: seg.text,
        start: seg.start,
        end: seg.end,
        words: seg.words,
      }));
      
      console.log(`✅ [Quiz] Audio process complete. Duration: ${transcriptionResult.duration}s`);
      
      return { 
        success: true, 
        audioPath: finalOutputPath,
        outputDir,
        duration: transcriptionResult.duration,
        segments: quizSegments, // Deepgram segments
        words: transcriptionResult.words,
        questionsCount: options.questions.length
        // NÃO retornamos questionTimestamps manuais aqui, pois
        // confiamos na robustez da busca por "Questão X" na transcrição
      };
      
    } catch (error: any) {
      console.error('❌ [Quiz] Audio generation error:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler para renderizar vídeo de quiz
  ipcMain.handle('quiz:render', async (
    event,
    options: {
      theme: string;
      questions: Array<{
        question: string;
        options: string[];
        correctIndex: number;
        explanation?: string;
      }>;
      thinkingTimeSeconds?: number;
      showAnswerTimeSeconds?: number;
      primaryColor?: string;
      secondaryColor?: string;
      backgroundColor?: string;
      audioPath?: string;
      audioDuration?: number;        // Duração do áudio em segundos
      audioSegments?: Array<{        // Segments de transcrição para sincronização
        id: number;
        text: string;
        start: number;
        end: number;
        words?: Array<{
          word: string;
          start: number;
          end: number;
          confidence?: number;
        }>;
      }>;
      questionTimestamps?: Array<{   // Timestamps precisos (nova geração)
        questionIndex: number;
        startTime: number;
        optionsTime: number;
        answerTime: number;
        endTime: number;
      }>;
      width?: number;
      height?: number;
    }
  ) => {
    try {
      console.log(`🎬 [Quiz] Rendering video: "${options.theme}"`);
      console.log(`🎬 [Quiz] Received options:`);
      console.log(`   - audioDuration: ${options.audioDuration}`);
      console.log(`   - audioSegments: ${options.audioSegments?.length || 0} items`);
      console.log(`   - audioPath: ${options.audioPath}`);
      
      // Inicializar VideoService para renderização
      const { VideoService } = require('../services/video-service');
      const videoService = new VideoService();
      
      // Configurar listener de progresso
      const window = getWindowFn?.();
      videoService.on('progress', (data: any) => {
        if (window && !window.isDestroyed()) {
          window.webContents.send('quiz:render-progress', {
            percent: data.percent || Math.round(data.progress * 100),
            stage: data.stage,
            frame: data.frame,
            totalFrames: data.totalFrames,
          });
        }
      });

      const FPS = 30;
      
      // Converter caminho do áudio para URL HTTP (necessário para Remotion)
      let audioUrl: string | undefined;
      if (options.audioPath) {
        const normalizedPath = options.audioPath.replace(/\\/g, '/');
        audioUrl = `http://localhost:9999/absolute/${encodeURIComponent(normalizedPath)}`;
        console.log(`🔊 [Quiz] Audio URL: ${audioUrl}`);
      }
      
      // Verificar se temos dados de sincronização de áudio
      const hasAudioSync = options.audioDuration && options.audioDuration > 0;
      
      let durationInFrames: number;
      let compositionId: string;
      let quizProps: any;
      
      if (hasAudioSync) {
        // Usar composição sincronizada
        console.log(`🎯 [Quiz] Using SYNCED composition (audio: ${options.audioDuration}s)`);
        console.log(`🎯 [Quiz] audioSegments count: ${options.audioSegments?.length || 0}`);
        
        // Log detalhado dos primeiros segments
        if (options.audioSegments && options.audioSegments.length > 0) {
          console.log(`🎯 [Quiz] First segment:`, JSON.stringify(options.audioSegments[0], null, 2));
          const totalWords = options.audioSegments.reduce((acc: number, seg: any) => acc + (seg.words?.length || 0), 0);
          console.log(`🎯 [Quiz] Total words across all segments: ${totalWords}`);
        }
        
        compositionId = 'QuizVideoSynced';
        
        // Duração baseada no áudio + intro + buffer
        const INTRO_SECONDS = 3; // Intro visual antes do áudio
        durationInFrames = Math.ceil((INTRO_SECONDS + options.audioDuration + 1) * FPS);
        console.log(`🎯 [Quiz] Duration breakdown: intro=${INTRO_SECONDS}s + audio=${options.audioDuration}s + buffer=1s`);
        
        quizProps = {
          theme: options.theme,
          questions: options.questions,
          primaryColor: options.primaryColor || '#8B5CF6',
          secondaryColor: options.secondaryColor || '#EC4899',
          backgroundColor: options.backgroundColor || '#0a0a0f',
          audioUrl,
          audioDuration: options.audioDuration,
          audioSegments: options.audioSegments || [],
          questionTimestamps: options.questionTimestamps, // Timestamps precisos!
          thinkingSilenceSeconds: 3, // Buffer de silêncio para "pensar"
        };
        
        console.log(`🎯 [Quiz] quizProps.audioSegments: ${quizProps.audioSegments.length} segments`);
        console.log(`🎯 [Quiz] questionTimestamps: ${options.questionTimestamps?.length || 0} precisos`);
        
      } else {
        // Usar composição com timing fixo (fallback)
        console.log(`📊 [Quiz] Using FIXED timing composition`);
        compositionId = 'QuizVideo';
        
        const thinkingSeconds = options.thinkingTimeSeconds || 5;
        const showAnswerSeconds = options.showAnswerTimeSeconds || 3;
        const INTRO_FRAMES = 3 * FPS;
        const QUESTION_INTRO_FRAMES = 1 * FPS;
        
        durationInFrames = INTRO_FRAMES + 
          (options.questions.length * (QUESTION_INTRO_FRAMES + (thinkingSeconds * FPS) + (showAnswerSeconds * FPS)));
        
        quizProps = {
          theme: options.theme,
          questions: options.questions,
          thinkingTimeSeconds: thinkingSeconds,
          showAnswerTimeSeconds: showAnswerSeconds,
          primaryColor: options.primaryColor || '#8B5CF6',
          secondaryColor: options.secondaryColor || '#EC4899',
          backgroundColor: options.backgroundColor || '#0a0a0f',
          audioUrl,
        };
      }
      
      console.log(`📊 [Quiz] Duration: ${durationInFrames} frames @ ${FPS} fps (~${(durationInFrames / FPS).toFixed(1)}s)`);

      // Renderizar usando VideoService
      const result = await videoService.render({
        compositionId,
        outputFileName: `quiz-${options.theme.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.mp4`,
        inputProps: quizProps,
        durationInFrames,
        fps: FPS,
        codec: 'h264',
        hardwareAcceleration: 'if-possible',
        width: options.width,
        height: options.height,
      });

      if (!result.success) {
        throw new Error(result.error || 'Erro ao renderizar vídeo');
      }

      console.log(`✅ [Quiz] Video rendered: ${result.outputPath}`);
      return {
        success: true,
        outputPath: result.outputPath,
        durationMs: result.durationMs,
      };

    } catch (error: any) {
      console.error('❌ [Quiz] Render error:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('✅ [VideoEditor] Handlers registered');
}
