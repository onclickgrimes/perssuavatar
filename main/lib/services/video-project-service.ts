/**
 * Video Project Service
 * 
 * Orquestrador do fluxo de criação de vídeos.
 * Coordena transcrição, análise por IA, e conversão para formato Remotion.
 */
import { EventEmitter } from 'events';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
    getAudioTranscriptionService,
    TranscriptionResult,
    TranscriptionSegment as DeepgramSegment
} from './audio-transcription-service';
import { VideoService } from './video-service';
import { GeminiService } from './gemini-service';
import { OpenAIService } from './openai-service';
import { DeepSeekService } from './deepseek-service';
import { CAMERA_EFFECTS } from '../../../remotion/utils/camera-effects';
import { TRANSITION_EFFECTS } from '../../../remotion/utils/transitions';

export type AIProvider = 'gemini' | 'openai' | 'deepseek';

// ========================================
// TYPES
// ========================================

export interface VideoProjectSegment {
    id: number;
    text: string;
    start: number;
    end: number;
    speaker: number;
    emotion?: string;
    imagePrompt?: string;
    imageUrl?: string;
    assetType?: string;
    cameraMovement?: string;
    transition?: string;
    // Palavras individuais com timing do Deepgram
    words?: Array<{
        word: string;
        start: number;
        end: number;
        confidence: number;
        speaker: number;
        punctuatedWord: string;
    }>;
    highlightWords?: Array<{
        text: string;
        time: number;
        duration?: number;
        entryAnimation?: string;
        exitAnimation?: string;
        size?: string | number;
        position?: string;
        effect?: string;
        color?: string;
        highlightColor?: string;
        fontWeight?: string;
    }>;
}


export interface VideoProjectData {
    title: string;
    description?: string;
    duration: number;
    audioPath?: string;
    segments: VideoProjectSegment[];
    editingStyle?: string;
    authorConclusion?: string;
    subtitleMode?: 'paragraph' | 'word-by-word';
    config?: {
        width?: number;
        height?: number;
        fps?: number;
        backgroundColor?: string;
    };
}

export interface AnalysisResult {
    success: boolean;
    error?: string;
    segments: VideoProjectSegment[];
}

export interface RemotionProject {
    project_title: string;
    description?: string;
    config: {
        width: number;
        height: number;
        fps: number;
        backgroundColor: string;
        subtitleMode?: 'paragraph' | 'word-by-word';
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
        };
        asset_type: string;
        asset_url?: string;
        prompt_suggestion?: string;
        camera_movement: string;
        transition: string;
        transition_duration: number;
        text_overlay?: {
            text: string;
            position: string;
            style: string;
            animation: string;
        };
    }>;
    schema_version: string;
}

// ========================================
// SERVICE CLASS
// ========================================

import * as http from 'http';

export class VideoProjectService extends EventEmitter {
    private transcriptionService = getAudioTranscriptionService();
    private videoService = new VideoService();
    private geminiService: GeminiService | null = null;
    private openAIService: OpenAIService | null = null;
    private deepSeekService: DeepSeekService | null = null;
    private projectsDir: string;
    private imageServer: http.Server | null = null;
    private imageServerPort: number = 9999;

    constructor() {
        super();

        // Inicializar diretório de projetos
        this.projectsDir = path.join(app.getPath('userData'), 'video-projects');
        if (!fs.existsSync(this.projectsDir)) {
            fs.mkdirSync(this.projectsDir, { recursive: true });
        }

        // Inicializar Gemini Service
        if (process.env.GOOGLE_API_KEY) {
            this.geminiService = new GeminiService();
            console.log('🎬 VideoProjectService initialized with GeminiService');
        }

        // Inicializar OpenAI
        if (process.env.OPENAI_API_KEY) {
            this.openAIService = new OpenAIService();
            console.log('🎬 VideoProjectService initialized with OpenAI');
        }

        // Inicializar DeepSeek
        if (process.env.DEEPSEEK_API_KEY) {
            this.deepSeekService = new DeepSeekService();
            console.log('🎬 VideoProjectService initialized with DeepSeek');
        }

        // Propagar eventos do VideoService
        this.videoService.on('progress', (data) => {
            this.emit('render-progress', data);
        });

        // Iniciar servidor de imagens ao instanciar (para poupar recursos, só instanciar quando necessário)
        this.startImageServer().catch(err => {
            console.error('❌ Failed to start image server in constructor:', err);
        });
    }

    /**
     * Encerra o serviço e libera recursos
     */
    public destroy(): void {
        this.stopImageServer();
        this.removeAllListeners();
        console.log('🎬 VideoProjectService destroyed');
    }

    /**
     * Inicia servidor HTTP local para servir imagens durante renderização
     */
    private async startImageServer(): Promise<void> {
        if (this.imageServer) {
            return; // Já está rodando
        }

        return new Promise((resolve, reject) => {
            this.imageServer = http.createServer((req, res) => {
                const url = req.url || '/';
                const filePath = path.join(this.projectsDir, decodeURIComponent(url));

                // CORS headers
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Range');

                if (req.method === 'OPTIONS') {
                    res.writeHead(200);
                    res.end();
                    return;
                }

                if (fs.existsSync(filePath)) {
                    const stats = fs.statSync(filePath);
                    const fileSize = stats.size;
                    const ext = path.extname(filePath).toLowerCase();
                    const mimeTypes: Record<string, string> = {
                        // Imagens
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.png': 'image/png',
                        '.gif': 'image/gif',
                        '.webp': 'image/webp',
                        // Áudio
                        '.mp3': 'audio/mpeg',
                        '.wav': 'audio/wav',
                        '.m4a': 'audio/mp4',
                        '.ogg': 'audio/ogg',
                        '.flac': 'audio/flac',
                        // Video
                        '.mp4': 'video/mp4',
                    };
                    const contentType = mimeTypes[ext] || 'application/octet-stream';

                    const range = req.headers.range;

                    if (range) {
                        // Range request (Partial Content)
                        const parts = range.replace(/bytes=/, "").split("-");
                        const start = parseInt(parts[0], 10);
                        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                        const chunksize = (end - start) + 1;

                        res.writeHead(206, {
                            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                            'Accept-Ranges': 'bytes',
                            'Content-Length': chunksize,
                            'Content-Type': contentType,
                        });

                        const file = fs.createReadStream(filePath, { start, end });
                        file.pipe(res);
                    } else {
                        // Full content
                        res.writeHead(200, {
                            'Content-Length': fileSize,
                            'Content-Type': contentType,
                            'Accept-Ranges': 'bytes',
                        });
                        fs.createReadStream(filePath).pipe(res);
                    }
                } else {
                    console.warn(`⚠️ Asset not found: ${filePath}`);
                    res.writeHead(404);
                    res.end('Not found');
                }
            });

            this.imageServer.listen(this.imageServerPort, () => {
                console.log(`🌐 Image server started on port ${this.imageServerPort}`);
                resolve();
            });

            this.imageServer.on('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    // Porta em uso, tentar outra
                    this.imageServerPort++;
                    this.imageServer = null;
                    this.startImageServer().then(resolve).catch(reject);
                } else {
                    reject(err);
                }
            });
        });
    }

    /**
     * Para o servidor de imagens
     */
    private stopImageServer(): void {
        if (this.imageServer) {
            this.imageServer.close();
            this.imageServer = null;
            console.log('🌐 Image server stopped');
        }
    }

    /**
     * Converte caminho de arquivo local para URL HTTP servida pelo servidor local
     */
    private convertToHttpUrl(filePath: string | undefined): string {
        if (!filePath) return '';

        // Se já é uma URL HTTP, retornar como está
        if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
            return filePath;
        }

        // Se é um caminho de arquivo, converter para URL do servidor local
        // Caminho esperado: C:\...\video-projects\images\segment-1-123.jpg
        // URL retornada: http://localhost:9999/images/segment-1-123.jpg
        const relativePath = filePath.replace(this.projectsDir, '').replace(/\\/g, '/');
        return `http://localhost:${this.imageServerPort}${relativePath}`;
    }

    // ========================================
    // TRANSCRIPTION
    // ========================================

    /**
     * Transcreve um arquivo de áudio e retorna segmentos
     */
    public async transcribeAudio(filePath: string): Promise<TranscriptionResult> {
        this.emit('status', { stage: 'transcribing', message: 'Transcrevendo áudio...' });

        const result = await this.transcriptionService.transcribeFile(filePath);

        if (result.success) {
            this.emit('status', {
                stage: 'transcribed',
                message: `${result.segments.length} segmentos encontrados`
            });
        }

        return result;
    }

    /**
     * Salva arquivo de áudio temporário para transcrição
     * Retorna caminho real (para renderização) e URL HTTP (para preview)
     */
    public async saveAudioFile(buffer: Buffer, originalName: string): Promise<{
        path: string;
        httpUrl: string;
    }> {
        // Servidor já iniciado no construtor

        const ext = path.extname(originalName) || '.mp3';
        const fileName = `audio-${Date.now()}${ext}`;
        const filePath = path.join(this.projectsDir, fileName);

        fs.writeFileSync(filePath, buffer);
        console.log(`💾 Audio saved: ${filePath}`);

        const httpUrl = `http://localhost:${this.imageServerPort}/${fileName}`;
        return { path: filePath, httpUrl };
    }

    /**
     * Salva arquivo de imagem para uso no projeto
     * Retorna caminho real (para renderização) e URL HTTP (para preview)
     */
    public async saveImageFile(buffer: Buffer, originalName: string, segmentId: number): Promise<{
        path: string;
        httpUrl: string;
    }> {
        // Servidor já iniciado no construtor

        const ext = path.extname(originalName) || '.jpg';
        const fileName = `segment-${segmentId}-${Date.now()}${ext}`;
        const filePath = path.join(this.projectsDir, 'images', fileName);

        // Criar subdiretório de imagens se não existir
        const imagesDir = path.join(this.projectsDir, 'images');
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }

        fs.writeFileSync(filePath, buffer);
        console.log(`🖼️ Image saved: ${filePath}`);

        const httpUrl = `http://localhost:${this.imageServerPort}/images/${fileName}`;
        return { path: filePath, httpUrl };
    }

    // ========================================
    // AI ANALYSIS
    // ========================================

    /**
     * Analisa segmentos com IA para sugerir emoções e prompts de imagem
     */
    public async analyzeWithAI(
        segments: VideoProjectSegment[],
        options?: {
            editingStyle?: string;
            authorConclusion?: string;
            provider?: AIProvider;
        }
    ): Promise<AnalysisResult> {
        console.log('🔍 [VideoProjectService] analyzeWithAI called with', segments.length, 'segments');

        const provider = options?.provider || 'gemini';
        console.log(`🤖 Using AI provider: ${provider}`);

        this.emit('status', { stage: 'analyzing', message: `Analisando com ${provider}...` });

        try {
            const prompt = this.buildAnalysisPrompt(segments, options);
            console.log('📝 [VideoProject] Prompt built, length:', prompt.length);
            console.log('📝 [VideoProject] Prompt built:', prompt);

            let analyzedSegments: Array<{
                id: number;
                emotion: string;
                imagePrompt: string;
                assetType: string;
                cameraMovement: string;
                transition: string;
                highlightWords?: Array<{
                    text: string;
                    time: number;
                    duration?: number;
                    entryAnimation?: string;
                    exitAnimation?: string;
                    size?: string | number;
                    position?: string;
                    effect?: string;
                    color?: string;
                    highlightColor?: string;
                    fontWeight?: string;
                }>;
            }>;


            const systemMsg = 'You are a video editor AI. Respond ONLY with a valid JSON array of segments.';

            if (provider === 'gemini') {
                if (!this.geminiService) throw new Error('Gemini API not configured');
                console.log('⏳ [VideoProject] Sending request to GeminiService...');
                analyzedSegments = await this.geminiService.getChatVideoAnalysis([
                    { role: 'system', content: systemMsg },
                    { role: 'user', content: prompt }
                ]);

            } else if (provider === 'openai') {
                if (!this.openAIService) throw new Error('OpenAI API not configured');
                console.log('⏳ [VideoProject] Sending request to OpenAI...');
                analyzedSegments = await this.openAIService.getChatVideoAnalysis([
                    { role: 'system', content: systemMsg },
                    { role: 'user', content: prompt }
                ]);

            } else if (provider === 'deepseek') {
                if (!this.deepSeekService) throw new Error('DeepSeek API not configured');
                console.log('⏳ [VideoProject] Sending request to DeepSeek...');
                analyzedSegments = await this.deepSeekService.getChatVideoAnalysis([
                    { role: 'system', content: systemMsg },
                    { role: 'user', content: prompt }
                ]);
            } else {
                throw new Error(`Unknown provider: ${provider}`);
            }

            console.log('✅ [VideoProject] AI Analysis received: ', analyzedSegments);
            console.log('🧩 Analyzed Segments:', analyzedSegments?.length || 0, 'items');

            // Robust validation/unwrapping
            let segmentsArray = analyzedSegments;

            // If response is wrapped like { segments: [...] } or { result: [...] }
            if (analyzedSegments && !Array.isArray(analyzedSegments)) {
                console.log('⚠️ Response is object, checking values for array...');
                const values = Object.values(analyzedSegments);
                const arrayValue = values.find(v => Array.isArray(v));
                if (arrayValue) {
                    segmentsArray = arrayValue;
                    console.log('✅ Unwrap successful');
                } else {
                    console.error('❌ Could not find array in response:', analyzedSegments);
                    throw new Error('AI response format invalid (expected array)');
                }
            }

            if (!Array.isArray(segmentsArray)) {
                throw new Error('AI response is not an array even after unwrap attempt');
            }

            // Mesclar resultados com segmentos originais
            const updatedSegments = segments.map(seg => {
                const analysis = segmentsArray.find((a: any) => a.id === seg.id);
                if (analysis) {
                    const merged = {
                        ...seg,
                        emotion: analysis.emotion || seg.emotion,
                        imagePrompt: analysis.imagePrompt || seg.imagePrompt,
                        assetType: analysis.assetType || 'image_flux',
                        cameraMovement: analysis.cameraMovement || 'static',
                        transition: analysis.transition || 'fade',
                        highlightWords: analysis.highlightWords || seg.highlightWords,
                    };
                    
                    // Sincronizar highlight_words com timing do Deepgram
                    if (merged.highlightWords && merged.words) {
                        merged.highlightWords = this.syncHighlightWordsWithDeepgram(
                            merged.highlightWords,
                            merged.words,
                            merged.start
                        );
                    }
                    
                    return merged;
                }
                return seg;
            });

            this.emit('status', { stage: 'analyzed', message: 'Análise concluída' });

            return {
                success: true,
                segments: updatedSegments,
            };

        } catch (error: any) {
            console.error('❌ AI Analysis error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return {
                success: false,
                error: error.message || String(error),
                segments,
            };
        }
    }

    // ========================================
    // HIGHLIGHT WORDS TIMING SYNC
    // ========================================
    
    /**
     * Sincroniza highlight_words com o timing real do Deepgram
     * A IA sugere QUAIS palavras destacar, mas NÃO o tempo
     * Esta função busca o tempo real no array de words do Deepgram
     */
    private syncHighlightWordsWithDeepgram(
        highlightWords: any[],
        deepgramWords: Array<{
            word: string;
            start: number;
            end: number;
            confidence: number;
            speaker: number;
            punctuatedWord: string;
        }>,
        sceneStart: number
    ): any[] {
        return highlightWords.map(hw => {
            // Normalizar texto para busca (remover pontuação, case-insensitive)
            const searchText = hw.text.toLowerCase().replace(/[.,!?;:]/g, '').trim();
            
            // Tentar encontrar a palavra no array do Deepgram
            let matchedWord = deepgramWords.find(dw => 
                dw.word.toLowerCase() === searchText || 
                dw.punctuatedWord.toLowerCase().replace(/[.,!?;:]/g, '') === searchText
            );
            
            // Se não encontrar, tentar buscar por palavra parcial (primeira palavra do texto)
            if (!matchedWord && searchText.includes(' ')) {
                const firstWord = searchText.split(' ')[0];
                matchedWord = deepgramWords.find(dw => 
                    dw.word.toLowerCase() === firstWord
                );
            }
            
            if (matchedWord) {
                // Calcular tempo relativo à cena (em vez de absoluto)
                const relativeTime = matchedWord.start - sceneStart;
                
                console.log(`✅ Matched "${hw.text}" → ${relativeTime.toFixed(2)}s (absolute: ${matchedWord.start.toFixed(2)}s)`);
                
                return {
                    ...hw,
                    time: relativeTime, // Tempo relativo à cena
                };
            } else {
                // Se não encontrar, manter o tempo sugerido pela IA (fallback)
                console.warn(`⚠️  Could not find timing for "${hw.text}", using AI suggestion`);
                return hw;
            }
        });
    }

    private buildAnalysisPrompt(
        segments: VideoProjectSegment[],
        options?: { editingStyle?: string; authorConclusion?: string }
    ): string {
        const segmentsList = segments.map(s =>
            `ID: ${s.id}\nTexto: "${s.text}"\nTempo: ${s.start.toFixed(2)}s - ${s.end.toFixed(2)}s`
        ).join('\n\n');

        return `Você é um diretor de vídeo criativo. Analise os seguintes segmentos de uma transcrição de áudio e sugira:

1. **emotion**: A emoção principal do segmento (surpresa, empolgação, nostalgia, seriedade, alegria, tristeza, reflexão, urgência, curiosidade, neutro)

2. **imagePrompt**: Um prompt detalhado em inglês para gerar uma imagem que represente visualmente o segmento. Seja específico sobre estilo, composição, iluminação e cores.

3. **assetType**: O tipo de asset recomendado:
   - "image_flux" para cenas estáticas ou conceituais
   - "video_kling" para cenas com ação humana complexa
   - "solid_color" para transições ou ênfase em texto

4. **cameraMovement**: Movimento de câmera sugerido:
${Object.entries(CAMERA_EFFECTS).map(([key, config]) => `- **${key}**\n  ${config.description}`).join('\n')}

5. **transition**: Transição para a próxima cena:
${Object.entries(TRANSITION_EFFECTS).map(([key, config]) => `- **${key}**\n  ${config.description}`).join('\n')}

6. **highlightWords**: Array de palavras ou frases-chave que devem ser destacadas visualmente durante a cena.
   Para cada palavra destacada, especifique:
   - **text**: A palavra EXATA como aparece na transcrição (será sincronizada automaticamente com o áudio)
   - **time**: Tempo de aparição em segundos (relativo ao início da cena, ex: 0.5)
   - **duration**: Duração da exibição em segundos (padrão: 1.5s)
   - **entryAnimation**: Animação de entrada
     * **pop** - Escala rápida com bounce
     * **bounce** - Múltiplos bounces ao aparecer
     * **explode** - Explosão com rotação
     * **slide_up** - Desliza de baixo para cima
     * **zoom_in** - Zoom gradual
     * **fade** - Fade in simples
     * **wave** - Texto vazado que enche de baixo pra cima como onda (efeito premium!)
   - **exitAnimation**: Animação de saída
     * **evaporate** - Evapora subindo com partículas
     * **fade** - Fade out simples
     * **implode** - Implosão com rotação
     * **slide_down** - Desliza para baixo
     * **dissolve** - Dissolve com blur
     * **scatter** - Dispersa com partículas
     * **wave** - Texto esvazia de cima pra baixo como onda (efeito premium!)
   - **size**: Tamanho (small, medium, large, huge)
   - **position**: Posição (center, top, top-center, bottom, bottom-center, top-left, top-right, bottom-left, bottom-right, left, center-left, right, center-right)
   - **effect**: Efeito visual (glow, shadow, outline, neon, none)
   - **color**: Cor do texto em HEX (ex: "#FFD700" dourado, "#FF1744" vermelho, "#00E5FF" ciano, "#FFFFFF" branco)
   - **fontWeight**: Peso da fonte (normal, bold, black)
   
   IMPORTANTE: 
   - Especifique o texto EXATAMENTE como aparece na transcrição

   Identifique entre 1 e 3 palavras-chave importantes por segmento que merecem destaque visual.
   IMPORTANTE: Sempre especifique uma **color** apropriada para o efeito escolhido.
   Cores recomendadas:
   - Dourado (#FFD700) para sucesso, destaque, valor
   - Ciano (#00E5FF) para tecnologia, modernidade
   - Verde neon (#00FF00) para crescimento, novidade
   - Magenta (#FF00FF) para criatividade, inovação
   - Vermelho (#FF1744) para urgência, alerta, ação
   Escolha palavras que sejam:
   - Conceitos-chave ou termos técnicos importantes
   - Números ou estatísticas relevantes
   - Palavras que expressam emoção forte
   - Calls to action ou mensagens principais

${options?.editingStyle ? `\nEstilo de edição desejado: ${options.editingStyle}` : ''}
${options?.authorConclusion ? `\nConclusão/tom do autor: ${options.authorConclusion}` : ''}

SEGMENTOS:
${segmentsList}

Responda APENAS com um array JSON válido no formato:
[
  {
    "id": 1,
    "emotion": "surpresa",
    "imagePrompt": "detailed prompt in English...",
    "assetType": "image_flux",
    "cameraMovement": "zoom_in_slow",
    "transition": "fade",
    "highlightWords": [
      {
        "text": "palavra importante",
        "duration": 1.5,
        "entryAnimation": "pop",
        "exitAnimation": "evaporate",
        "size": "large",
        "position": "center",
        "effect": "glow",
        "color": "#FFD700",
        "fontWeight": "bold"
      }
    ]
  },
  ...
]`;
    }


    // ========================================
    // REMOTION CONVERSION
    // ========================================

    /**
     * Converte projeto para formato Remotion
     */
    public convertToRemotionProject(project: VideoProjectData): RemotionProject {
        console.log('🔧 convertToRemotionProject - subtitleMode:', project.subtitleMode);
        
        const scenes = project.segments.map(seg => ({
            id: seg.id,
            start_time: seg.start,
            end_time: seg.end,
            transcript_segment: seg.text,
            visual_concept: {
                description: seg.text,
                art_style: 'photorealistic',
                emotion: seg.emotion || 'neutro',
            },
            asset_type: seg.assetType || 'image_flux',
            // Converter caminho local para URL HTTP
            asset_url: this.convertToHttpUrl(seg.imageUrl),
            prompt_suggestion: seg.imagePrompt || '',
            camera_movement: seg.cameraMovement || 'static',
            transition: seg.transition || 'fade',
            transition_duration: 0.5,
            text_overlay: {
                text: seg.text,
                position: 'bottom',
                style: 'subtitle',
                animation: 'fade',
                words: seg.words, // ✅ Palavras do Deepgram para word-by-word
            },
            // Incluir palavras destacadas (se houver)
            ...(seg.highlightWords && seg.highlightWords.length > 0 && {
                highlight_words: seg.highlightWords,
            }),
        }));

        console.log('🔧 Scene 1 text_overlay.words:', scenes[0]?.text_overlay?.words?.length || 0, 'words');

        return {
            project_title: project.title,
            description: project.description,
            config: {
                width: 1920,
                height: 1080,
                fps: 30,
                backgroundColor: '#0a0a0a',
                subtitleMode: project.subtitleMode, // ✅ Modo de legenda
                // Incluir áudio da narração/transcrição
                ...(project.audioPath && {
                    backgroundMusic: {
                        src: this.convertToHttpUrl(project.audioPath),
                        volume: 1.0, // Volume máximo para narração
                    },
                }),
            },
            scenes,
            schema_version: '1.0',
        };
    }

    // ========================================
    // RENDERING
    // ========================================

    /**
     * Renderiza o projeto como vídeo MP4
     */
    public async renderProject(project: VideoProjectData): Promise<{
        success: boolean;
        outputPath?: string;
        error?: string;
    }> {
        this.emit('status', { stage: 'rendering', message: 'Preparando renderização...' });

        try {
            // Servidor já iniciado no construtor
            console.log(`🌐 Image server ready on port ${this.imageServerPort}`);

            const remotionProject = this.convertToRemotionProject(project);

            // Log das URLs das imagens para debug
            console.log('📸 Image URLs:');
            remotionProject.scenes.forEach((scene, i) => {
                console.log(`  Scene ${i + 1}: ${scene.asset_url}`);
            });

            const result = await this.videoService.renderProject(remotionProject, {
                outputFileName: `${this.sanitizeFileName(project.title)}-${Date.now()}.mp4`,
            });

            if (result.success) {
                this.emit('status', { stage: 'complete', message: 'Vídeo renderizado!' });
            }

            return result;

        } catch (error: any) {
            console.error('❌ Render error:', error);
            return {
                success: false,
                error: error.message,
            };
        }
        // Servidor continua rodando até o serviço ser destruído
    }

    // ========================================
    // PROJECT MANAGEMENT
    // ========================================

    /**
     * Salva projeto como JSON
     */
    public saveProject(project: VideoProjectData): string {
        const fileName = `project-${Date.now()}.json`;
        const filePath = path.join(this.projectsDir, fileName);

        // Reorganizar propriedades na ordem desejada
        const orderedProject = {
            title: project.title,
            description: project.description,
            duration: project.duration,
            audioPath: project.audioPath,
            editingStyle: project.editingStyle || '',
            authorConclusion: project.authorConclusion || '',
            subtitleMode: project.subtitleMode,
            config: {
                width: 1920,
                height: 1080,
                fps: 60,
                backgroundColor: '#0a0a0a',
                ...project.config, // Sobrescreve com valores do projeto se existirem
            },
            segments: project.segments,
        };

        fs.writeFileSync(filePath, JSON.stringify(orderedProject, null, 2));
        console.log(`💾 Project saved: ${filePath}`);

        return filePath;
    }

    /**
     * Carrega projeto de arquivo JSON
     */
    public loadProject(filePath: string): VideoProjectData | null {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const project = JSON.parse(content) as VideoProjectData;
            
            // Adicionar config padrão se não existir (compatibilidade com projetos antigos)
            if (!project.config) {
                project.config = {
                    width: 1920,
                    height: 1080,
                    fps: 60,
                    backgroundColor: '#0a0a0a',
                };
            }
            
            return project;
        } catch (error) {
            console.error('Error loading project:', error);
            return null;
        }
    }

    /**
     * Lista projetos salvos
     */
    public listProjects(): Array<{ name: string; path: string; createdAt: Date }> {
        try {
            const files = fs.readdirSync(this.projectsDir);
            return files
                .filter(f => f.endsWith('.json'))
                .map(name => {
                    const filePath = path.join(this.projectsDir, name);
                    const stats = fs.statSync(filePath);
                    return {
                        name,
                        path: filePath,
                        createdAt: stats.birthtime,
                    };
                })
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        } catch (error) {
            return [];
        }
    }

    /**
     * Retorna diretório de projetos
     */
    public getProjectsDirectory(): string {
        return this.projectsDir;
    }

    // ========================================
    // UTILITIES
    // ========================================

    private sanitizeFileName(name: string): string {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 50);
    }
}

// Singleton
let videoProjectService: VideoProjectService | null = null;

export function getVideoProjectService(): VideoProjectService {
    if (!videoProjectService) {
        videoProjectService = new VideoProjectService();
    }
    return videoProjectService;
}
