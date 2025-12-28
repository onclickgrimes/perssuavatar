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
import { getVideoSearchService } from './video-search-service';
import { getPexelsService } from '../assets';
import {
    CAMERA_MOVEMENTS,
    TRANSITIONS,
    ASSET_DEFINITIONS,
    ENTRY_ANIMATION_OPTIONS,
    EXIT_ANIMATION_OPTIONS
} from '../../../remotion/types/project';

export type AIProvider = 'gemini' | 'openai' | 'deepseek';

// ========================================
// TYPES
// ========================================
// NOTA: Estes tipos espelham os definidos em renderer/shared/utils/project-converter.ts
// O backend não pode importar do renderer, então mantemos cópias sincronizadas.
// Ao adicionar/modificar propriedades, atualizar ambos os arquivos.

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
    asset_url?: string;
    chroma_key?: {
        color: 'green' | 'blue' | 'custom';
        customColor?: { r: number; g: number; b: number };
        threshold?: number;
        smoothing?: number;
    };
    timeline_config?: {
        items: Array<{
            id: string;
            year: string;
            label: string;
            image?: string;
        }>;
    };
    background?: {
        type: 'image' | 'video' | 'solid_color';
        url?: string;
        color?: string;
    };
}


export interface VideoProjectData {
    title: string;
    description?: string;
    duration: number;
    audioPath?: string;
    segments: VideoProjectSegment[];
    subtitleMode?: 'paragraph' | 'word-by-word';
    selectedAspectRatios?: string[];
    componentsAllowed?: string[]; // Componentes Remotion permitidos (ex: ['HighlightWord', 'AnimatedSvgOverlay'])
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
        componentsAllowed?: string[]; // Componentes Remotion permitidos
        backgroundMusic?: {
            src: string;
            volume?: number;
        };
        assetsBaseUrl?: string;
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
        timeline_config?: {
            items: Array<{
                id: string;
                year: string;
                label: string;
                image?: string;
            }>;
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
     * Busca arquivo com case-insensitive (para .MP4 vs .mp4)
     */
    private findFileCaseInsensitive(dirPath: string, filename: string): string | null {
        try {
            if (!fs.existsSync(dirPath)) return null;

            const files = fs.readdirSync(dirPath);
            const matchedFile = files.find(f => f.toLowerCase() === filename.toLowerCase());

            return matchedFile ? path.join(dirPath, matchedFile) : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Inicia servidor HTTP local para servir imagens durante renderização
     */
    private async startImageServer(): Promise<void> {
        if (this.imageServer) {
            return; // Já está rodando
        }

        return new Promise((resolve, reject) => {
            this.imageServer = http.createServer(async (req, res) => {
                const url = req.url || '/';

                // Determinar o caminho base correto
                let filePath: string;
                if (url.startsWith('/svgs/') || url.startsWith('/sounds/') || url.startsWith('/fonts/')) {
                    // Servir da pasta renderer/public
                    const publicDir = path.join(app.getAppPath(), 'renderer', 'public');
                    filePath = path.join(publicDir, decodeURIComponent(url));
                } else if (url.startsWith('/videos/')) {
                    // Servir vídeos de L:\Video-Maker\{category}\{filename}
                    // URL format: /videos/{category}/{filename}
                    const urlParts = url.split('/').filter(p => p);
                    if (urlParts.length >= 3) {
                        const category = urlParts[1];
                        const filename = urlParts.slice(2).join('/');
                        const decodedFilename = decodeURIComponent(filename);

                        // Lista de categorias para fallback
                        const categories = [
                            category, // Tentar primeiro a categoria especificada
                            'stock',
                            'luxury',
                            'memes',
                            'religion',
                            'background-effects',
                            'transition',
                            'kids'
                        ];

                        // Remover duplicatas mantendo a ordem
                        const uniqueCategories = [...new Set(categories)];


                        // Buscar vídeo com cache otimizado (consulta específica no Supabase)
                        let foundPath: string | null = null;

                        try {
                            const { getSupabaseService } = require('./supabase-service');
                            const supabase = getSupabaseService();

                            // ✨ OTIMIZAÇÃO: Buscar apenas este vídeo específico (não listar todos)
                            const { data, error } = await supabase.client
                                .from('stock_videos')
                                .select('id, filename, file_path')
                                .eq('filename', decodedFilename)
                                .limit(1)
                                .single();

                            if (error && error.code !== 'PGRST116') {
                                // PGRST116 = not found, outros erros devem logar
                                console.warn(`⚠️ Erro ao consultar Supabase:`, error.code);
                                throw error;
                            }

                            const video = data;

                            // Verificar cache (file_path)
                            if (video?.file_path && fs.existsSync(video.file_path)) {
                                foundPath = video.file_path;
                                console.log(`✅ Cache HIT: ${decodedFilename}`);
                            } else {
                                // Cache MISS - buscar manualmente
                                if (video?.file_path) {
                                    console.warn(`⚠️ Cache inválido: ${video.file_path}`);
                                }

                                for (const cat of uniqueCategories) {
                                    const testPath = path.join('L:\\Video-Maker', cat, decodedFilename);

                                    // 1. Tentar caminho exato
                                    if (fs.existsSync(testPath)) {
                                        foundPath = testPath;
                                        if (cat !== category) console.log(`📂 Categoria: ${cat} (≠ ${category})`);

                                        // Atualizar cache no Supabase
                                        if (video?.id) {
                                            supabase.updateVideo(video.id, { file_path: testPath } as any)
                                                .then(() => console.log(`💾 Cache atualizado: ${testPath}`))
                                                .catch((e: any) => console.warn(`⚠️ Erro ao atualizar:`, e));
                                        }
                                        break;
                                    }

                                    // 2. Busca case-insensitive (.MP4 vs .mp4)
                                    const dirPath = path.join('L:\\Video-Maker', cat);
                                    const caseInsensitivePath = this.findFileCaseInsensitive(dirPath, decodedFilename);

                                    if (caseInsensitivePath) {
                                        foundPath = caseInsensitivePath;
                                        console.log(`🔤 Case-insensitive: ${path.basename(caseInsensitivePath)} (${cat})`);

                                        // Atualizar cache no Supabase
                                        if (video?.id) {
                                            supabase.updateVideo(video.id, { file_path: caseInsensitivePath } as any)
                                                .then(() => console.log(`💾 Cache atualizado: ${caseInsensitivePath}`))
                                                .catch((e: any) => console.warn(`⚠️ Erro ao atualizar:`, e));
                                        }
                                        break;
                                    }
                                }
                            }
                        } catch (err) {
                            console.warn(`⚠️ Erro Supabase, fallback direto:`, err);

                            // Fallback: busca direta sem Supabase
                            for (const cat of uniqueCategories) {
                                const testPath = path.join('L:\\Video-Maker', cat, decodedFilename);

                                if (fs.existsSync(testPath)) {
                                    foundPath = testPath;
                                    break;
                                }

                                // Case-insensitive fallback
                                const dirPath = path.join('L:\\Video-Maker', cat);
                                const caseInsensitivePath = this.findFileCaseInsensitive(dirPath, decodedFilename);
                                if (caseInsensitivePath) {
                                    foundPath = caseInsensitivePath;
                                    break;
                                }
                            }
                        }


                        if (foundPath) {
                            filePath = foundPath;
                        } else {
                            console.warn(`⚠️ Vídeo não encontrado em nenhuma categoria: ${decodedFilename}`);
                            res.writeHead(404);
                            res.end(`Video not found in any category: ${decodedFilename}`);
                            return;
                        }
                    } else {
                        res.writeHead(400);
                        res.end('Invalid video URL format. Expected: /videos/{category}/{filename}');
                        return;
                    }
                } else {
                    // Servir da pasta de projetos
                    filePath = path.join(this.projectsDir, decodeURIComponent(url));
                }

                // CORS headers
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Range');

                if (req.method === 'OPTIONS') {
                    res.writeHead(200);
                    res.end();
                    return;
                }


                // Log detalhado para debug
                console.log(`📡 Requisição: ${url}`);
                console.log(`📂 Caminho resolvido: ${filePath}`);

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
                        '.svg': 'image/svg+xml',
                        // Áudio
                        '.mp3': 'audio/mpeg',
                        '.wav': 'audio/wav',
                        '.m4a': 'audio/mp4',
                        '.ogg': 'audio/ogg',
                        '.flac': 'audio/flac',
                        // Video
                        '.mp4': 'video/mp4',
                        '.webm': 'video/webm',
                        '.mov': 'video/quicktime',
                        // Fontes
                        '.otf': 'font/otf',
                        '.ttf': 'font/ttf',
                        '.woff': 'font/woff',
                        '.woff2': 'font/woff2',
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

                        console.log(`📦 Range request: ${path.basename(filePath)} bytes ${start}-${end}/${fileSize}`);
                        const file = fs.createReadStream(filePath, { start, end });
                        file.pipe(res);
                    } else {
                        // Full content
                        res.writeHead(200, {
                            'Content-Length': fileSize,
                            'Content-Type': contentType,
                            'Accept-Ranges': 'bytes',
                        });
                        console.log(`✅ Servindo: ${path.basename(filePath)} (${fileSize} bytes)`);
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

        // Se é um vídeo do Supabase (L:\Video-Maker)
        // Normalizar barras para comparação
        const normalizedPath = filePath.replace(/\\/g, '/');
        if (normalizedPath.includes('Video-Maker/')) {
            // Extrair parte após Video-Maker/
            // L:/Video-Maker/Category/File.mp4 -> /videos/Category/File.mp4
            const parts = normalizedPath.split('Video-Maker/');
            if (parts.length > 1) {
                return `http://localhost:${this.imageServerPort}/videos/${encodeURIComponent(parts[1])}`;
            }
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
     * @param project Projeto completo (ou apenas segments para compatibilidade)
     * @param options Opções de análise
     */
    public async analyzeWithAI(
        projectOrSegments: VideoProjectData | VideoProjectSegment[],
        options?: {
            provider?: AIProvider;
            nichePrompt?: string;
        }
    ): Promise<AnalysisResult> {
        // Suportar tanto projeto completo quanto array de segments (compatibilidade)
        const isFullProject = !Array.isArray(projectOrSegments);
        const segments = isFullProject ? projectOrSegments.segments : projectOrSegments;
        const selectedAspectRatios = isFullProject ? projectOrSegments.selectedAspectRatios : undefined;
        console.log('🔍 [VideoProjectService] analyzeWithAI called with', segments.length, 'segments');
        console.log('🔍 [VideoProjectService] options:', options);

        const provider = options?.provider || 'gemini';
        console.log(`🤖 Using AI provider: ${provider}`);

        this.emit('status', { stage: 'analyzing', message: `Analisando com ${provider}...` });

        try {
            const prompt = this.buildAnalysisPrompt(segments, options);
            console.log("###################################################################");
            console.log('📝 [VideoProject] Prompt built');
            console.log(prompt);
            console.log("###################################################################");

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

            console.log('✅ [VideoProject] AI Analysis received');
            console.log('📝 [VideoProject] AI Analysis:', analyzedSegments);

            // Robust validation/unwrapping
            let segmentsArray = analyzedSegments;

            // If response is wrapped like { segments: [...] } or { result: [...] }
            if (analyzedSegments && !Array.isArray(analyzedSegments)) {
                console.log('⚠️ Response is object, checking values for array...');
                const values = Object.values(analyzedSegments);
                const arrayValue = values.find(v => Array.isArray(v));
                if (arrayValue) {
                    segmentsArray = arrayValue;
                } else {
                    console.error('❌ Could not find array in response:', analyzedSegments);
                    throw new Error('AI response format invalid (expected array)');
                }
            }

            if (!Array.isArray(segmentsArray)) {
                throw new Error('AI response is not an array even after unwrap attempt');
            }

            // Mesclar resultados com segmentos originais
            const updatedSegments = await Promise.all(segments.map(async seg => {
                const analysis = segmentsArray.find((a: any) => a.id === seg.id);
                if (analysis) {
                    let merged = {
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

                    // Se a IA escolheu video_stock, buscar vídeo automaticamente
                    if (merged.assetType === 'video_stock' && merged.imagePrompt) {
                        // Inicializar searchService para buscar vídeos quando a IA escolher video_stock
                        const searchService = getVideoSearchService();
                        try {
                            console.log(`🔍 [AutoSearch] Buscando vídeo stock para segmento ${seg.id}...`);
                            // Buscar semanticamente usando o prompt da IA
                            const results = await searchService.semanticSearch(merged.imagePrompt, 1, 0.4); // 0.4 de threshold

                            if (results.length > 0) {
                                const video = results[0];
                                console.log(`✅ [AutoSearch] Encontrado: ${video.name} (${video.similarity.toFixed(2)})`);

                                // Se tiver file_path válido
                                if (video.file_path && fs.existsSync(video.file_path)) {
                                    merged.imageUrl = video.file_path; // URL absoluta, convertToHttpUrl lida com isso depois
                                }
                            } else {
                                console.log(`❌ [AutoSearch] Nenhum vídeo encontrado para segmento ${seg.id}, mantendo assetType video_stock sem URL`);
                            }
                        } catch (err) {
                            console.error(`❌ [AutoSearch] Erro ao buscar vídeo:`, err);
                        }
                    }

                    // Se a IA escolheu video_pexels ou image_pexels, buscar mídia no Pexels
                    if ((merged.assetType === 'video_pexels' || merged.assetType === 'image_pexels') && merged.imagePrompt) {
                        try {
                            const pexelsService = getPexelsService();
                            const isVideo = merged.assetType === 'video_pexels';

                            // Determinar orientação baseada em selectedAspectRatios
                            let pexelsOrientation: 'landscape' | 'portrait' | 'square' = 'landscape';
                            if (selectedAspectRatios && selectedAspectRatios.length > 0) {
                                const ratio = selectedAspectRatios[0];
                                if (ratio === '9:16' || ratio === '3:4' || ratio === '4:5') {
                                    pexelsOrientation = 'portrait';
                                } else if (ratio === '1:1') {
                                    pexelsOrientation = 'square';
                                }
                                // 16:9, 4:3 = landscape (default)
                            }

                            console.log(`🔍 [Pexels] Buscando ${isVideo ? 'vídeo' : 'foto'} para segmento ${seg.id}...`);
                            console.log(`🔍 [Pexels] Prompt: "${merged.imagePrompt}" | Orientação: ${pexelsOrientation}`);

                            // Calcular duração da cena para filtrar vídeos adequados
                            const sceneDuration = seg.end - seg.start;

                            // Buscar mídia no Pexels - usar métodos específicos para garantir o tipo correto
                            let results;
                            if (isVideo) {
                                // Buscar APENAS vídeos para evitar misturar tipos
                                const videoResponse = await pexelsService.searchVideos({
                                    query: merged.imagePrompt,
                                    orientation: pexelsOrientation,
                                    perPage: 5,
                                });

                                // Filtrar por duração adequada
                                results = videoResponse.results.filter(v => {
                                    if (!v.duration) return true;
                                    const minDur = Math.max(3, Math.floor(sceneDuration * 0.5));
                                    const maxDur = Math.ceil(sceneDuration * 3);
                                    return v.duration >= minDur && v.duration <= maxDur;
                                }).slice(0, 1);

                                // Se não encontrar vídeos, usar qualquer um
                                if (results.length === 0 && videoResponse.results.length > 0) {
                                    results = [videoResponse.results[0]];
                                }
                            } else {
                                // Buscar APENAS fotos
                                const photoResponse = await pexelsService.searchPhotos({
                                    query: merged.imagePrompt,
                                    orientation: pexelsOrientation,
                                    perPage: 1,
                                });
                                results = photoResponse.results;
                            }

                            if (results.length > 0) {
                                const media = results[0];
                                console.log(`✅ [Pexels] Encontrado: ${media.type} ID ${media.id} (${media.author.name})`);

                                // Usar URL direta do Pexels (já é HTTPS, funciona direto)
                                merged.imageUrl = media.directUrl;

                                // IMPORTANTE: Ajustar o assetType baseado no tipo REAL retornado
                                // Isso evita o erro de tentar renderizar imagem como vídeo
                                if (media.type === 'photo') {
                                    merged.assetType = 'image_pexels';
                                } else if (media.type === 'video') {
                                    merged.assetType = 'video_pexels';
                                }

                                // Log de atribuição (importante para compliance com Pexels)
                                console.log(`📸 [Pexels] Atribuição: ${pexelsService.getAttribution(media)}`);
                            } else {
                                console.log(`❌ [Pexels] Nenhuma mídia encontrada para segmento ${seg.id}`);
                            }
                        } catch (err: any) {
                            console.error(`❌ [Pexels] Erro ao buscar mídia:`, err.message || err);
                            // Se falhar, não quebra o fluxo - apenas não terá mídia
                        }
                    }

                    return merged;
                }
                return seg;
            }));

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
        options?: { nichePrompt?: string }
    ): string {
        const segmentsList = segments.map(s =>
            `ID: ${s.id}\nTexto: "${s.text}"\nTempo: ${s.start.toFixed(2)}s - ${s.end.toFixed(2)}s`
        ).join('\n\n');

        // Se tiver um prompt de nicho, usa ele como base (já inclui JSON de exemplo dinâmico)
        if (options?.nichePrompt) { return `${options.nichePrompt} \n\nSEGMENTOS PARA ANÁLISE:\n\n${segmentsList}`; }

        // Prompt padrão (original) - Agora construído dinamicamente a partir da SSoT (project.ts)

        // Gerar lista de Assets com AI Description
        const assetInstructions = Object.entries(ASSET_DEFINITIONS)
            .map(([key, config]) => `   - "${key}": ${config.aiDescription}`)
            .join('\n');

        // Gerar lista de Movimentos de Câmera
        const cameraInstructions = Object.entries(CAMERA_MOVEMENTS)
            .map(([key, config]) => `- **${key}**\n  ${config.description}`)
            .join('\n');

        // Gerar lista de Transições
        const transitionInstructions = Object.entries(TRANSITIONS)
            .map(([key, config]) => `- **${key}**\n  ${config.description}`)
            .join('\n');

        // Gerar lista de Animações de Entrada
        const entryAnimInstructions = Object.entries(ENTRY_ANIMATION_OPTIONS)
            .map(([key, config]) => `     * **${key}** - ${config.description}`)
            .join('\n');

        // Gerar lista de Animações de Saída
        const exitAnimInstructions = Object.entries(EXIT_ANIMATION_OPTIONS)
            .map(([key, config]) => `     * **${key}** - ${config.description}`)
            .join('\n');

        return `Você é um diretor de vídeo criativo. Analise os seguintes segmentos de uma transcrição de áudio e sugira:

1. **emotion**: A emoção principal do segmento (surpresa, empolgação, nostalgia, seriedade, alegria, tristeza, reflexão, urgência, curiosidade, neutro)

2. **imagePrompt**: Um texto detalhado em inglês que represente visualmente o segmento. Seja específico sobre estilo, composição, iluminação e cores.

3. **assetType**: O tipo de asset recomendado:
${assetInstructions}

4. **cameraMovement**: Movimento de câmera sugerido:
${cameraInstructions}

5. **transition**: Transição para a próxima cena:
${transitionInstructions}

6. **highlightWords**: Array de palavras ou frases-chave que devem ser destacadas visualmente durante a cena.
   Para cada palavra destacada, especifique:
   - **text**: A palavra EXATA como aparece na transcrição (será sincronizada automaticamente com o áudio)
   - **time**: Tempo de aparição em segundos (relativo ao início da cena, ex: 0.5)
   - **duration**: Duração da exibição em segundos (padrão: 1.5s)
   - **entryAnimation**: Animação de entrada
${entryAnimInstructions}
   - **exitAnimation**: Animação de saída
${exitAnimInstructions}
   - **size**: Tamanho (small, medium, large, huge)
   - **position**: Posição (center, top, top-center, bottom, bottom-center, top-left, top-right, bottom-left, bottom-right, left, center-left, right, center-right)
   - **effect**: Efeito visual (glow, shadow, outline, neon, none)
   - **color**: Cor do texto em HEX (ex: "#FFD700" dourado, "#FF1744" vermelho, "#00E5FF" ciano, "#FFFFFF" branco)
   - **fontWeight**: Peso da fonte (normal, bold, black)
   
   IMPORTANTE: 
   - Especifique o texto EXATAMENTE como aparece na transcrição

   Identifique entre zero e duas palavras-chave importantes por segmento que merecem destaque visual.
   Escolha palavras que sejam:
   - Conceitos-chave ou termos técnicos importantes
   - Números ou estatísticas relevantes
   - Palavras que expressam emoção forte
   - Calls to action ou mensagens principais

   IMPORTANTE: Sempre especifique uma **color** apropriada para o efeito escolhido.
   
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
            // Se tiver asset_url explícito (vídeo), usa ele. Senão usa imageUrl.
            asset_url: this.convertToHttpUrl(seg.asset_url || seg.imageUrl),
            chroma_key: seg.chroma_key, // ✅ Configuração de Chroma Key
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
            // Background
            ...(seg.background && {
                background: {
                    type: seg.background.type,
                    // Se for solid_color, usa color OU url como cor. Se não, usa color original.
                    color: seg.background.type === 'solid_color'
                        ? (seg.background.color || seg.background.url)
                        : seg.background.color,
                    // Se for solid_color, URL deve ser undefined. Se não, converte URL.
                    url: seg.background.type !== 'solid_color'
                        ? this.convertToHttpUrl(seg.background.url)
                        : undefined,
                }
            }),
            // Timeline 3D
            ...(seg.timeline_config && {
                timeline_config: seg.timeline_config
            }),
        }));

        console.log('🔧 Scene 1 text_overlay.words:', scenes[0]?.text_overlay?.words?.length || 0, 'words');

        return {
            project_title: project.title,
            description: project.description,
            config: {
                width: project.config?.width || 1920,
                height: project.config?.height || 1080,
                fps: project.config?.fps || 30,
                backgroundColor: project.config?.backgroundColor || '#0a0a0a',
                subtitleMode: project.subtitleMode, // ✅ Modo de legenda
                componentsAllowed: project.componentsAllowed, // ✅ Componentes permitidos pelo nicho
                assetsBaseUrl: `http://localhost:${this.imageServerPort}`, // ✅ URL base dinâmica
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

        // Determinar dimensões baseadas na proporção selecionada (pega a primeira)
        let defaultWidth = 1080;
        let defaultHeight = 1920; // Default 9:16

        if (project.selectedAspectRatios && project.selectedAspectRatios.length > 0) {
            const mainRatio = project.selectedAspectRatios[0];
            switch (mainRatio) {
                case '16:9': defaultWidth = 1920; defaultHeight = 1080; break;
                case '9:16': defaultWidth = 1080; defaultHeight = 1920; break;
                case '1:1': defaultWidth = 1080; defaultHeight = 1080; break;
                case '4:3': defaultWidth = 1440; defaultHeight = 1080; break;
                case '4:5': defaultWidth = 1080; defaultHeight = 1350; break;
                case '3:4': defaultWidth = 1080; defaultHeight = 1440; break;
            }
        }

        // Reorganizar propriedades na ordem desejada
        const orderedProject = {
            title: project.title,
            description: project.description,
            duration: project.duration,
            audioPath: project.audioPath,
            selectedAspectRatios: project.selectedAspectRatios, // Salvar as proporções
            subtitleMode: project.subtitleMode,
            componentsAllowed: project.componentsAllowed, // ✅ Salvar componentes permitidos
            renderConfigs: project.selectedAspectRatios?.reduce((acc, ratio) => {
                let w = 1080, h = 1920;
                switch (ratio) {
                    case '16:9': w = 1920; h = 1080; break;
                    case '9:16': w = 1080; h = 1920; break;
                    case '1:1': w = 1080; h = 1080; break;
                    case '4:3': w = 1440; h = 1080; break;
                    case '4:5': w = 1080; h = 1350; break;
                    case '3:4': w = 1080; h = 1440; break;
                }
                acc[ratio] = { width: w, height: h };
                return acc;
            }, {} as Record<string, { width: number, height: number }>),
            config: {
                width: project.config?.width || defaultWidth,
                height: project.config?.height || defaultHeight,
                fps: 60,
                backgroundColor: '#0a0a0a',
                ...project.config, // Sobrescreve com valores do projeto se existirem
            },
            segments: project.segments.map(segment => ({
                id: segment.id,
                text: segment.text,
                start: segment.start,
                end: segment.end,
                speaker: segment.speaker,
                emotion: segment.emotion,
                imagePrompt: segment.imagePrompt,
                imageUrl: segment.imageUrl,
                asset_url: segment.asset_url,
                chroma_key: segment.chroma_key,
                background: segment.background,
                assetType: segment.assetType,
                cameraMovement: segment.cameraMovement,
                transition: segment.transition,
                highlightWords: segment.highlightWords,
                timeline_config: segment.timeline_config,
                words: segment.words, // Words fica por último
            })),
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
