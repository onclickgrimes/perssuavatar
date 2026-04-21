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
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
    getAudioTranscriptionService,
    TranscriptionResult,
    TranscriptionSegment as DeepgramSegment
} from './audio-transcription-service';
import { VideoService } from './video-service';
import { OpenAIService } from './openai-service';
import { DeepSeekService } from './deepseek-service';
import { getVideoSearchService } from './video-search-service';
import { getPexelsService } from '../assets';
import { hasCredential } from '../credentials';
import { createVideoGenAIClient } from './genai-video-client';
import {
    CAMERA_MOVEMENTS,
    TRANSITIONS,
    ASSET_DEFINITIONS,
    ENTRY_ANIMATION_OPTIONS,
    EXIT_ANIMATION_OPTIONS
} from '../../../remotion/types/project';
import {
    buildSilenceCompactionRanges,
    compactTimelineSegments,
} from '../../../remotion/utils/silence-compaction';

export type AIProvider = 'gemini' | 'gemini_scraping' | 'openai' | 'deepseek';
type ScenePromptTranslationField = 'imagePrompt' | 'firstFrame' | 'animateFrame';
type ScenePromptTranslationInput = {
    text?: string;
    sourceVariant: 'original' | 'translated';
    field?: ScenePromptTranslationField;
    fields?: Partial<Record<ScenePromptTranslationField, string>>;
};
type ScenePromptTranslationResult = {
    success: boolean;
    translatedText?: string;
    translatedFields?: Partial<Record<ScenePromptTranslationField, string>>;
    error?: string;
};

const GEMMA_TRANSLATION_MODEL = 'gemma-4-31b-it';
// TODO: substituir pela chave real do projeto enquanto estiver hardcoded.
const GEMMA_TRANSLATION_API_KEY = 'AIzaSyAIBgEAU6H-K-r6jcl7jUvvCgqE8vV9a_s';
const GEMMA_TRANSLATION_API_KEY_PLACEHOLDER = 'HARDCODED_GOOGLE_API_KEY';

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
    IdOfTheCharactersInTheScene?: string;
    IdOfTheLocationInTheScene?: string;
    sceneDescription?: string;
    imageUrl?: string;
    sourceImageUrl?: string;
    assetType?: string;
    cameraMovement?: string;
    transition?: string;
    track?: number;
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
    asset_duration?: number;
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
    transform?: {
        scale?: number;
        positionX?: number;
        positionY?: number;
        opacity?: number;
    };
    audio?: {
        volume?: number;
        fadeIn?: number;
        fadeOut?: number;
    };
    firstFrame?: string;
    animateFrame?: string;
    imagePromptOriginal?: string;
    firstFrameOriginal?: string;
    animateFrameOriginal?: string;
}


export interface VideoProjectData {
    title: string;
    description?: string;
    duration: number;
    audioPath?: string;
    segments: VideoProjectSegment[];
    subtitleMode?: 'paragraph' | 'word-by-word' | 'none';
    selectedAspectRatios?: string[];
    componentsAllowed?: string[]; // Componentes Remotion permitidos (ex: ['HighlightWord', 'AnimatedSvgOverlay'])
    defaultFont?: string; // Fonte padrão do nicho (Google Fonts)
    nicheId?: number; // ID do nicho selecionado
    nicheName?: string; // Nome do nicho selecionado
    storyReferences?: {
        characters?: Array<{
            id: number;
            character: string;
            prompt_en: string;
            reference_id: number | null;
            imageUrl?: string;
        }>;
        locations?: Array<{
            id: number;
            location: string;
            prompt_en: string;
            reference_id: number | null;
            imageUrl?: string;
        }>;
        characterStyle?: string;
        locationStyle?: string;
    };
    config?: {
        width?: number;
        height?: number;
        fps?: number;
        backgroundColor?: string;
        fitVideoToScene?: boolean;
        removeAudioSilences?: boolean;
        audioMutedRanges?: Array<{
            sourceStart: number;
            sourceEnd: number;
            outputStart: number;
            outputEnd: number;
        }>;
        mainAudioVolume?: number;
    };
}

export interface AnalysisResult {
    success: boolean;
    error?: string;
    segments: VideoProjectSegment[];
}

export interface StoryCharacterReference {
    id: number;
    character: string;
    prompt_en: string;
    reference_id: number | null;
}

export interface StoryLocationReference {
    id: number;
    location: string;
    prompt_en: string;
    reference_id: number | null;
}

export interface StoryAssetsExtractionResult {
    success: boolean;
    characters: StoryCharacterReference[];
    locations: StoryLocationReference[];
    error?: string;
}

export interface RemotionProject {
    project_title: string;
    description?: string;
    config: {
        width: number;
        height: number;
        fps: number;
        backgroundColor: string;
        subtitleMode?: 'paragraph' | 'word-by-word' | 'none';
        componentsAllowed?: string[]; // Componentes Remotion permitidos
        defaultFont?: string; // Fonte padrão do nicho (Google Fonts)
        fitVideoToScene?: boolean;
        removeAudioSilences?: boolean;
        audioKeepRanges?: Array<{
            sourceStart: number;
            sourceEnd: number;
            outputStart: number;
            outputEnd: number;
        }>;
        audioMutedRanges?: Array<{
            sourceStart: number;
            sourceEnd: number;
            outputStart: number;
            outputEnd: number;
        }>;
        backgroundMusic?: {
            src: string;
            src_local?: string;
            volume?: number;
        };
        assetsBaseUrl?: string;
    };
    scenes: Array<{
        id: number;
        track?: number;
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
        asset_local_path?: string;
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
        transform?: {
            scale?: number;
            positionX?: number;
            positionY?: number;
            opacity?: number;
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

        // Inicializar OpenAI
        if (hasCredential('openai')) {
            this.openAIService = new OpenAIService();
            console.log('🎬 VideoProjectService initialized with OpenAI');
        }

        // Inicializar DeepSeek
        if (hasCredential('deepseek')) {
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

    private resolveGenAIModel(modelName: string | undefined): string {
        const requested = (modelName || '').trim();
        return requested || 'gemini-3.1-pro-preview';
    }

    private parseJsonResponseText(rawText: string): any {
        const trimmed = rawText.trim();
        if (!trimmed) {
            throw new Error('Resposta vazia do Google GenAI.');
        }

        const withoutFences = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

        try {
            return JSON.parse(withoutFences);
        } catch {
            const arrayMatch = withoutFences.match(/\[[\s\S]*\]/);
            if (arrayMatch) {
                return JSON.parse(arrayMatch[0]);
            }
            const objectMatch = withoutFences.match(/\{[\s\S]*\}/);
            if (objectMatch) {
                return JSON.parse(objectMatch[0]);
            }
            throw new Error(`Falha ao parsear JSON da resposta de IA. Trecho recebido: ${withoutFences.substring(0, 220)}...`);
        }
    }

    private normalizeScenePromptTranslationText(text: unknown): string {
        return String(text || '')
            .replace(/^```(?:text|markdown|json)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
    }

    private buildScenePromptTranslationInstruction(
        text: string,
        sourceVariant: 'original' | 'translated',
        field?: ScenePromptTranslationField
    ): string {
        const targetLanguage = sourceVariant === 'original' ? 'English' : 'Brazilian Portuguese';
        const sourceLanguageHint = sourceVariant === 'original' ? 'Brazilian Portuguese' : 'English';
        const fieldLabel = field || 'imagePrompt';

        if (sourceVariant === 'original') {
            return [
                'You are a professional translation engine for AI video/image prompts.',
                `Task: translate the ${fieldLabel} from ${sourceLanguageHint} to ${targetLanguage}.`,
                'Keep technical details, camera directions, visual style, and structure intact.',
                'Do not summarize, do not explain, do not add commentary.',
                'Return only the translated text.',
                '',
                'SOURCE TEXT:',
                text,
            ].join('\n');
        }

        return [
            'You are a professional translation engine for AI video/image prompts.',
            `Task: translate the ${fieldLabel} from ${sourceLanguageHint} to ${targetLanguage}.`,
            'Preserve the same level of detail and line breaks.',
            'Do not summarize, do not explain, do not add commentary.',
            'Return only the translated text.',
            '',
            'SOURCE TEXT:',
            text,
        ].join('\n');
    }

    private buildScenePromptBatchTranslationInstruction(
        fields: Partial<Record<ScenePromptTranslationField, string>>,
        sourceVariant: 'original' | 'translated'
    ): string {
        const targetLanguage = sourceVariant === 'original' ? 'English' : 'Brazilian Portuguese';
        const sourceLanguageHint = sourceVariant === 'original' ? 'Brazilian Portuguese' : 'English';

        return [
            'You are a professional translation engine for AI video/image prompts.',
            `Task: translate all provided fields from ${sourceLanguageHint} to ${targetLanguage}.`,
            'Keep technical details, camera directions, visual style, and structure intact.',
            'Do not summarize, do not explain, do not add commentary.',
            'Return ONLY a valid JSON object with the same keys you received.',
            'Do not add or remove keys. Do not wrap in markdown or code fences.',
            '',
            'SOURCE FIELDS JSON:',
            JSON.stringify(fields, null, 2),
        ].join('\n');
    }

    private buildScenePromptTranslationConfig(): any {
        return {
            temperature: 0.1,
            topP: 0.8,
            thinkingConfig: {
                thinkingLevel: ((ThinkingLevel as any).MINIMAL ?? 'MINIMAL') as any,
            },
        };
    }

    public async translateScenePromptText(input: ScenePromptTranslationInput): Promise<ScenePromptTranslationResult> {
        const sourceText = String(input?.text || '');
        const sourceVariant = input?.sourceVariant === 'original' ? 'original' : 'translated';
        const field = input?.field as ScenePromptTranslationField | undefined;
        const candidateFields = input?.fields || {};
        const allowedFields: ScenePromptTranslationField[] = ['imagePrompt', 'firstFrame', 'animateFrame'];
        const requestedFieldEntries = allowedFields
            .filter((key) => Object.prototype.hasOwnProperty.call(candidateFields, key))
            .map((key) => [key, String((candidateFields as any)[key] || '')] as [ScenePromptTranslationField, string]);
        const requestedFields = Object.fromEntries(requestedFieldEntries) as Partial<Record<ScenePromptTranslationField, string>>;
        const isBatchRequest = requestedFieldEntries.length > 0;
        const resolvedApiKey = String(GEMMA_TRANSLATION_API_KEY || '').trim();

        if (isBatchRequest) {
            const hasAnySource = requestedFieldEntries.some(([, value]) => value.trim().length > 0);
            if (!hasAnySource) {
                return {
                    success: true,
                    translatedFields: requestedFields,
                };
            }
        } else if (!sourceText.trim()) {
            return { success: true, translatedText: '' };
        }

        if (
            !resolvedApiKey
            || resolvedApiKey === GEMMA_TRANSLATION_API_KEY_PLACEHOLDER
        ) {
            return {
                success: false,
                error: 'Configure a constante GEMMA_TRANSLATION_API_KEY em video-project-service.ts.',
            };
        }

        try {
            const ai = new GoogleGenAI({ apiKey: resolvedApiKey });
            if (isBatchRequest) {
                const prompt = this.buildScenePromptBatchTranslationInstruction(requestedFields, sourceVariant);
                const response = await ai.models.generateContent({
                    model: GEMMA_TRANSLATION_MODEL,
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: prompt }],
                        },
                    ],
                    config: this.buildScenePromptTranslationConfig(),
                } as any);

                const rawText = this.normalizeScenePromptTranslationText(response?.text || '');
                if (!rawText) {
                    throw new Error(`Resposta vazia do ${GEMMA_TRANSLATION_MODEL}.`);
                }

                const parsed = this.parseJsonResponseText(rawText);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    throw new Error('Resposta de tradução em lote inválida.');
                }

                const translatedFields: Partial<Record<ScenePromptTranslationField, string>> = {};
                for (const [key] of requestedFieldEntries) {
                    const rawValue = (parsed as any)[key];
                    if (rawValue == null) {
                        throw new Error(`Campo "${key}" ausente na resposta de tradução em lote.`);
                    }
                    translatedFields[key] = this.normalizeScenePromptTranslationText(rawValue);
                }

                return { success: true, translatedFields };
            }

            const prompt = this.buildScenePromptTranslationInstruction(sourceText, sourceVariant, field);

            const response = await ai.models.generateContent({
                model: GEMMA_TRANSLATION_MODEL,
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: prompt }],
                    },
                ],
                config: this.buildScenePromptTranslationConfig(),
            } as any);

            const translatedText = this.normalizeScenePromptTranslationText(response?.text || '');

            if (!translatedText) {
                throw new Error(`Resposta vazia do ${GEMMA_TRANSLATION_MODEL}.`);
            }

            return { success: true, translatedText };
        } catch (error: any) {
            console.error('❌ [ScenePromptTranslation] Erro ao traduzir prompt:', error);
            return {
                success: false,
                error: error?.message || 'Falha ao traduzir prompt.',
            };
        }
    }

    private async getGeminiVideoAnalysis(messages: any[], modelName?: string): Promise<any> {
        const systemInstruction =
            messages.find((m: any) => m.role === 'system')?.content || 'Respond with valid JSON only.';

        const contents = messages
            .filter((m: any) => m.role === 'user' || m.role === 'assistant')
            .map((m: any) => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: String(m.content || '') }],
            }));

        const {
            ai,
            backend,
            project,
            location,
        } = createVideoGenAIClient(null, 'next');

        const resolvedModel = this.resolveGenAIModel(modelName);

        if (
            backend === 'vertex' &&
            resolvedModel.toLowerCase().startsWith('gemini-3.1-pro-preview') &&
            String(location || '').toLowerCase() !== 'global'
        ) {
            throw new Error(
                `O modelo ${resolvedModel} no Vertex AI só está disponível em location=global. Atualize Configurações > API e Modelos > Google Cloud Location para "global".`
            );
        }

        console.log(
            `⏳ [VideoProject] Sending request via Google GenAI (${backend}${backend === 'vertex' ? ` ${project}/${location}` : ''}) model=${resolvedModel}...`
        );

        const response = await ai.models.generateContent({
            model: resolvedModel,
            contents,
            config: {
                systemInstruction,
                responseMimeType: 'application/json',
            } as any,
        } as any);

        const rawText = String(response?.text || '').trim();
        if (!rawText) {
            throw new Error('Resposta vazia recebida do Google GenAI.');
        }

        console.log(`🧠 [VideoProject] GenAI JSON Response (${rawText.length} chars)`);
        return this.parseJsonResponseText(rawText);
    }

    private async requestJsonWithProvider(
        provider: AIProvider,
        payload: any[],
        model?: string
    ): Promise<any> {
        if (provider === 'gemini') {
            return this.getGeminiVideoAnalysis(payload, model);
        }

        if (provider === 'gemini_scraping') {
            return this.getGeminiScrapingVideoAnalysis(payload);
        }

        if (provider === 'openai') {
            if (!this.openAIService) throw new Error('OpenAI API not configured');
            if (model) this.openAIService.setModel(model);
            return this.openAIService.getChatVideoAnalysis(payload);
        }

        if (provider === 'deepseek') {
            if (!this.deepSeekService) throw new Error('DeepSeek API not configured');
            if (model) this.deepSeekService.setModel(model);
            return this.deepSeekService.getChatVideoAnalysis(payload);
        }

        throw new Error(`Unknown provider: ${provider}`);
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
                } else if (url.startsWith('/absolute/')) {
                    // Servir arquivo de caminho absoluto
                    // URL format: /absolute/C:/Users/.../file.wav
                    const absolutePath = decodeURIComponent(url.replace('/absolute/', ''));
                    filePath = absolutePath;
                    console.log(`📂 [Absolute] Servindo: ${filePath}`);
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
                    const verboseAssetLogs = process.env.VIDEO_ASSET_SERVER_DEBUG === '1';
                    const range = req.headers.range;

                    if (verboseAssetLogs) {
                        console.log(`📡 Requisição: ${url}`);
                        console.log(`📂 Caminho resolvido: ${filePath}`);
                    }

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

                        if (verboseAssetLogs) {
                            console.log(`📦 Range request: ${path.basename(filePath)} bytes ${start}-${end}/${fileSize}`);
                        }
                        const file = fs.createReadStream(filePath, { start, end });

                        // 1. Tratar erro na stream para evitar que o processo morra
                        file.on('error', (err) => {
                            console.error(`❌ Stream error on ${path.basename(filePath)}:`, err);
                            if (!res.headersSent) res.writeHead(500);
                            res.end();
                        });

                        // 2. IMPORTANTE: Fechar a stream se o cliente (Remotion/Chrome) fechar a conexão
                        res.on('close', () => {
                            file.destroy(); // Garante que o descritor de arquivo seja liberado imediatamente
                        });

                        file.pipe(res);
                    } else {
                        // Full content
                        res.writeHead(200, {
                            'Content-Length': fileSize,
                            'Content-Type': contentType,
                            'Accept-Ranges': 'bytes',
                        });
                        if (verboseAssetLogs) {
                            console.log(`✅ Servindo: ${path.basename(filePath)} (${fileSize} bytes)`);
                        }
                        const file = fs.createReadStream(filePath);

                        // 1. Tratar erro na stream para evitar que o processo morra
                        file.on('error', (err) => {
                            console.error(`❌ Stream error on ${path.basename(filePath)}:`, err);
                            if (!res.headersSent) res.writeHead(500);
                            res.end();
                        });

                        // 2. IMPORTANTE: Fechar a stream se o cliente (Remotion/Chrome) fechar a conexão
                        res.on('close', () => {
                            file.destroy(); // Garante que o descritor de arquivo seja liberado imediatamente
                        });

                        file.pipe(res);
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
    public convertToHttpUrl(filePath: string | undefined): string {
        if (!filePath) return '';

        // Se já é uma URL HTTP, retornar como está
        if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('blob:')) {
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

        // Se é um caminho de arquivo, verificar se está dentro do diretório de projetos
        // Caminho esperado: C:\...\video-projects\images\segment-1-123.jpg
        // URL retornada: http://localhost:9999/images/segment-1-123.jpg
        if (filePath.startsWith(this.projectsDir)) {
             const relativePath = filePath.replace(this.projectsDir, '').replace(/\\/g, '/');
             return `http://localhost:${this.imageServerPort}${relativePath}`;
        }
        
        // Se for um caminho absoluto fora das pastas conhecidas, usar a rota /absolute/
        return `http://localhost:${this.imageServerPort}/absolute/${encodeURIComponent(filePath.replace(/\\/g, '/'))}`;
    }

    /**
     * Retorna caminho local utilizável pelo FFmpeg quando o asset não é remoto.
     */
    private toLocalFsPath(filePath: string | undefined): string | undefined {
        if (!filePath) return undefined;

        if (filePath.startsWith('file:///')) {
            return decodeURIComponent(filePath.replace('file:///', ''));
        }

        if (/^(https?:\/\/)/i.test(filePath)) {
            try {
                const parsed = new URL(filePath);
                const host = parsed.hostname.toLowerCase();
                const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
                if (!isLocalHost) {
                    return undefined;
                }
                if (parsed.port && parsed.port !== String(this.imageServerPort)) {
                    return undefined;
                }

                const pathname = decodeURIComponent(parsed.pathname || '');
                if (!pathname) {
                    return undefined;
                }

                if (pathname.startsWith('/absolute/')) {
                    const absolutePath = pathname.replace('/absolute/', '');
                    return absolutePath.replace(/\//g, path.sep);
                }

                if (pathname.startsWith('/videos/')) {
                    const relativeVideoPath = pathname.replace('/videos/', '');
                    return path.join('L:\\Video-Maker', ...relativeVideoPath.split('/'));
                }

                const relativePath = pathname.replace(/^\/+/, '');
                return path.join(this.projectsDir, ...relativePath.split('/'));
            } catch {
                return undefined;
            }
        }

        if (/^(blob:|data:)/i.test(filePath)) {
            return undefined;
        }

        return filePath;
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
        durationMs?: number;
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
        console.log(`🖼️ Media saved: ${filePath}`);

        const httpUrl = `http://localhost:${this.imageServerPort}/images/${fileName}`;
        let durationMs: number | undefined;

        // Se for um vídeo, tenta extrair a duração
        const isVideo = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'].includes(ext.toLowerCase());
        if (isVideo) {
             const ffmpeg = require('fluent-ffmpeg');
             try {
                 durationMs = await new Promise<number | undefined>((resolve) => {
                     ffmpeg.ffprobe(filePath, (err: any, metadata: any) => {
                         if (err || !metadata?.format?.duration) {
                             resolve(undefined);
                         } else {
                             resolve(metadata.format.duration * 1000);
                         }
                     });
                 });
             } catch (e) {
                 console.log("Error extracting video duration in manual upload");
             }
        }

        return { path: filePath, httpUrl, durationMs };
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
            model?: string;
        }
    ): Promise<AnalysisResult> {
        // Suportar tanto projeto completo quanto array de segments (compatibilidade)
        const isFullProject = !Array.isArray(projectOrSegments);
        const segments = isFullProject ? projectOrSegments.segments : projectOrSegments;
        const selectedAspectRatios = isFullProject ? projectOrSegments.selectedAspectRatios : undefined;
        console.log('🔍 [VideoProjectService] analyzeWithAI called with', segments.length, 'segments');
        console.log('🔍 [VideoProjectService] options:', options);

        const provider = options?.provider || 'gemini';
        console.log(`🤖 Using AI provider: ${provider} - ${options?.model}`);

        this.emit('status', { stage: 'analyzing', message: `Analisando com ${provider}...` });

        try {
            const prompt = this.buildAnalysisPrompt(segments, options);
            console.log("###################################################################");
            console.log('📝 [VideoProject] Prompt built');
            console.log(prompt);
            console.log("###################################################################");

            // Pode vir como array, objeto { segments: [...] } ou string JSON.
            let analyzedSegments: any;


            const systemMsg = 'You are a video editor AI. Respond ONLY with a valid JSON object containing a "segments" array.';
            const aiRequestPayload: any[] = [
                { role: 'system', content: systemMsg },
                { role: 'user', content: prompt }
            ];

            if (provider === 'gemini') {
                analyzedSegments = await this.getGeminiVideoAnalysis(aiRequestPayload, options?.model);

            } else if (provider === 'gemini_scraping') {
                console.log('⏳ [VideoProject] Sending request to Gemini scraping provider...');
                analyzedSegments = await this.getGeminiScrapingVideoAnalysis(aiRequestPayload);

            } else if (provider === 'openai') {
                if (!this.openAIService) throw new Error('OpenAI API not configured');
                console.log('⏳ [VideoProject] Sending request to OpenAI...');
                if (options?.model) this.openAIService.setModel(options.model);
                analyzedSegments = await this.openAIService.getChatVideoAnalysis(aiRequestPayload);

            } else if (provider === 'deepseek') {
                if (!this.deepSeekService) throw new Error('DeepSeek API not configured');
                console.log('⏳ [VideoProject] Sending request to DeepSeek...');
                if (options?.model) this.deepSeekService.setModel(options.model);
                analyzedSegments = await this.deepSeekService.getChatVideoAnalysis(aiRequestPayload);
            } else {
                throw new Error(`Unknown provider: ${provider}`);
            }

            console.log('✅ [VideoProject] AI Analysis received');
            // Preview seguro da resposta (sem assumir tipo string/array)
            let analysisPreview: any = analyzedSegments;
            if (typeof analyzedSegments === 'string') {
                analysisPreview = analyzedSegments.slice(0, 200);
            } else if (Array.isArray(analyzedSegments)) {
                analysisPreview = analyzedSegments.slice(0, 3);
            } else {
                try {
                    analysisPreview = JSON.stringify(analyzedSegments).slice(0, 200);
                } catch {
                    analysisPreview = analyzedSegments;
                }
            }
            console.log('📝 [VideoProject] AI Analysis preview:', analysisPreview);

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
                    const normalizedFirstFrame = analysis.firstFrame == null
                        ? seg.firstFrame
                        : (typeof analysis.firstFrame === 'string'
                            ? analysis.firstFrame.trim()
                            : String(analysis.firstFrame).trim()) || seg.firstFrame;

                    const normalizedAnimateFrame = analysis.animateFrame == null
                        ? seg.animateFrame
                        : (typeof analysis.animateFrame === 'string'
                            ? analysis.animateFrame.trim()
                            : String(analysis.animateFrame).trim()) || seg.animateFrame;

                    const nextCharactersInScene = this.normalizeCharactersField(
                        analysis.IdOfTheCharactersInTheScene
                    ) ?? seg.IdOfTheCharactersInTheScene;

                    const nextLocationInScene = this.normalizeSceneReferenceIds(
                        analysis.IdOfTheLocationInTheScene
                    ) ?? seg.IdOfTheLocationInTheScene;

                    let merged = {
                        ...seg,
                        emotion: analysis.emotion || seg.emotion,
                        imagePrompt: analysis.imagePrompt == null ? seg.imagePrompt : analysis.imagePrompt,
                        IdOfTheCharactersInTheScene: nextCharactersInScene,
                        IdOfTheLocationInTheScene: nextLocationInScene,
                        assetType: analysis.assetType || 'image_flux',
                        cameraMovement: analysis.cameraMovement || 'static',
                        transition: analysis.transition || 'fade',
                        firstFrame: normalizedFirstFrame,
                        animateFrame: normalizedAnimateFrame,
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

                    // video_vo3 é tratado sob demanda pelo usuário na tela de ImagesStep
                    // (botão "Gerar com IA"), não automaticamente na análise

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

    public async editPromptsWithAI(
        segments: VideoProjectSegment[],
        options?: {
            provider?: AIProvider;
            model?: string;
            userInstruction?: string;
        }
    ): Promise<AnalysisResult> {
        const instruction = options?.userInstruction?.trim();
        if (!instruction) {
            return {
                success: false,
                error: 'Instrução do usuário é obrigatória para editar prompts.',
                segments,
            };
        }

        const provider = options?.provider || 'gemini';
        this.emit('status', { stage: 'analyzing', message: `Editando prompts com ${provider}...` });

        try {
            const prompt = this.buildPromptEditionPrompt(segments, instruction);
            const systemMsg = 'You are a prompt editor AI. Respond ONLY with a valid JSON object containing a "segments" array. For each segment, return "id" and only the expected prompt fields according to its assetType.';
            const aiRequestPayload: any[] = [
                { role: 'system', content: systemMsg },
                { role: 'user', content: prompt }
            ];

            let editedResponse: any;

            if (provider === 'gemini') {
                editedResponse = await this.getGeminiVideoAnalysis(aiRequestPayload, options?.model);
            } else if (provider === 'gemini_scraping') {
                editedResponse = await this.getGeminiScrapingVideoAnalysis(aiRequestPayload);
            } else if (provider === 'openai') {
                if (!this.openAIService) throw new Error('OpenAI API not configured');
                if (options?.model) this.openAIService.setModel(options.model);
                editedResponse = await this.openAIService.getChatVideoAnalysis(aiRequestPayload);
            } else if (provider === 'deepseek') {
                if (!this.deepSeekService) throw new Error('DeepSeek API not configured');
                if (options?.model) this.deepSeekService.setModel(options.model);
                editedResponse = await this.deepSeekService.getChatVideoAnalysis(aiRequestPayload);
            } else {
                throw new Error(`Unknown provider: ${provider}`);
            }

            let segmentsArray = editedResponse;
            if (editedResponse && !Array.isArray(editedResponse)) {
                const values = Object.values(editedResponse);
                const arrayValue = values.find(v => Array.isArray(v));
                if (arrayValue) {
                    segmentsArray = arrayValue;
                } else {
                    throw new Error('AI response format invalid (expected array)');
                }
            }

            if (!Array.isArray(segmentsArray)) {
                throw new Error('AI response is not an array');
            }

            const updatedSegments = segments.map(seg => {
                const edited = segmentsArray.find((a: any) => a.id === seg.id);
                if (!edited) return seg;

                // video_frame_animate: editar firstFrame + animateFrame (sem imagePrompt)
                if (seg.assetType === 'video_frame_animate') {
                    const hasFirstFrame = edited.firstFrame != null;
                    const hasAnimateFrame = edited.animateFrame != null;
                    if (!hasFirstFrame && !hasAnimateFrame) return seg;

                    const next: VideoProjectSegment = { ...seg };

                    if (hasFirstFrame) {
                        next.firstFrame = typeof edited.firstFrame === 'string'
                            ? edited.firstFrame
                            : String(edited.firstFrame);
                    }

                    if (hasAnimateFrame) {
                        next.animateFrame = typeof edited.animateFrame === 'string'
                            ? edited.animateFrame
                            : String(edited.animateFrame);
                    }

                    return next;
                }

                // Demais tipos: editar imagePrompt
                const hasPrompt = edited.imagePrompt != null;

                const nextCharactersInScene = this.normalizeCharactersField(
                    edited.IdOfTheCharactersInTheScene
                ) ?? seg.IdOfTheCharactersInTheScene;
                const nextLocationInScene = this.normalizeSceneReferenceIds(
                    edited.IdOfTheLocationInTheScene
                ) ?? seg.IdOfTheLocationInTheScene;

                const charactersUnchanged = nextCharactersInScene === seg.IdOfTheCharactersInTheScene;
                const locationUnchanged = nextLocationInScene === seg.IdOfTheLocationInTheScene;
                if (!hasPrompt && charactersUnchanged && locationUnchanged) return seg;

                const normalizedPrompt = hasPrompt
                    ? (typeof edited.imagePrompt === 'string'
                        ? edited.imagePrompt
                        : JSON.stringify(edited.imagePrompt))
                    : seg.imagePrompt;

                return {
                    ...seg,
                    imagePrompt: normalizedPrompt,
                    IdOfTheCharactersInTheScene: nextCharactersInScene,
                    IdOfTheLocationInTheScene: nextLocationInScene,
                };
            });

            this.emit('status', { stage: 'analyzed', message: 'Edição de prompts concluída' });

            return {
                success: true,
                segments: updatedSegments,
            };
        } catch (error: any) {
            console.error('❌ Prompt edit error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return {
                success: false,
                error: error.message || String(error),
                segments,
            };
        }
    }

    public async summarizeScenePromptsWithAI(
        segments: VideoProjectSegment[],
        options?: {
            provider?: AIProvider;
            model?: string;
        }
    ): Promise<AnalysisResult> {
        const segmentsWithPrompt = segments.filter(seg =>
            this.stringifyPromptForEdition(seg.imagePrompt).trim().length > 0
        );

        if (segmentsWithPrompt.length === 0) {
            return {
                success: true,
                segments,
            };
        }

        const provider = options?.provider || 'gemini';
        this.emit('status', { stage: 'analyzing', message: `Resumindo cenas com ${provider}...` });

        try {
            const prompt = this.buildSceneDescriptionPrompt(segmentsWithPrompt);
            const systemMsg = 'Resuma em uma linha o que acontece nesse prompt.';
            const aiRequestPayload: any[] = [
                { role: 'system', content: systemMsg },
                { role: 'user', content: prompt }
            ];

            let summarizedResponse: any;

            if (provider === 'gemini') {
                summarizedResponse = await this.getGeminiVideoAnalysis(aiRequestPayload, options?.model);
            } else if (provider === 'gemini_scraping') {
                summarizedResponse = await this.getGeminiScrapingVideoAnalysis(aiRequestPayload);
            } else if (provider === 'openai') {
                if (!this.openAIService) throw new Error('OpenAI API not configured');
                if (options?.model) this.openAIService.setModel(options.model);
                summarizedResponse = await this.openAIService.getChatVideoAnalysis(aiRequestPayload);
            } else if (provider === 'deepseek') {
                if (!this.deepSeekService) throw new Error('DeepSeek API not configured');
                if (options?.model) this.deepSeekService.setModel(options.model);
                summarizedResponse = await this.deepSeekService.getChatVideoAnalysis(aiRequestPayload);
            } else {
                throw new Error(`Unknown provider: ${provider}`);
            }

            let segmentsArray = summarizedResponse;
            if (summarizedResponse && !Array.isArray(summarizedResponse)) {
                const values = Object.values(summarizedResponse);
                const arrayValue = values.find(v => Array.isArray(v));
                if (arrayValue) {
                    segmentsArray = arrayValue;
                } else {
                    throw new Error('AI response format invalid (expected array)');
                }
            }

            if (!Array.isArray(segmentsArray)) {
                throw new Error('AI response is not an array');
            }

            const updatedSegments = segments.map(seg => {
                const summarized = segmentsArray.find((a: any) => a.id === seg.id);
                if (!summarized || summarized.sceneDescription == null) return seg;

                const normalizedDescription = typeof summarized.sceneDescription === 'string'
                    ? summarized.sceneDescription.trim()
                    : String(summarized.sceneDescription).trim();

                if (!normalizedDescription) return seg;

                return {
                    ...seg,
                    sceneDescription: normalizedDescription,
                };
            });

            this.emit('status', { stage: 'analyzed', message: 'Resumo de cenas concluído' });

            return {
                success: true,
                segments: updatedSegments,
            };
        } catch (error: any) {
            console.error('❌ Scene summary error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return {
                success: false,
                error: error.message || String(error),
                segments,
            };
        }
    }

    /**
     * Gera prompts para imagem do primeiro frame de cada cena usando IA
     */
    public async generateFirstFramePromptsWithAI(
        segments: VideoProjectSegment[],
        options?: {
            provider?: AIProvider;
            model?: string;
        }
    ): Promise<AnalysisResult> {
        const segmentsWithPrompt = segments.filter(seg =>
            this.stringifyPromptForEdition(seg.imagePrompt).trim().length > 0
        );

        if (segmentsWithPrompt.length === 0) {
            return {
                success: true,
                segments,
            };
        }

        const provider = options?.provider || 'gemini';
        this.emit('status', { stage: 'analyzing', message: `Gerando prompts de primeiro frame com ${provider}...` });

        try {
            const prompt = this.buildFirstFramePrompt(segmentsWithPrompt);
            const systemMsg = 'Você é um especialista em direção de arte e geração de imagens. Responda sempre com JSON válido.';
            const aiRequestPayload: any[] = [
                { role: 'system', content: systemMsg },
                { role: 'user', content: prompt }
            ];

            let aiResponse: any;

            if (provider === 'gemini') {
                aiResponse = await this.getGeminiVideoAnalysis(aiRequestPayload, options?.model);
            } else if (provider === 'gemini_scraping') {
                aiResponse = await this.getGeminiScrapingVideoAnalysis(aiRequestPayload);
            } else if (provider === 'openai') {
                if (!this.openAIService) throw new Error('OpenAI API not configured');
                if (options?.model) this.openAIService.setModel(options.model);
                aiResponse = await this.openAIService.getChatVideoAnalysis(aiRequestPayload);
            } else if (provider === 'deepseek') {
                if (!this.deepSeekService) throw new Error('DeepSeek API not configured');
                if (options?.model) this.deepSeekService.setModel(options.model);
                aiResponse = await this.deepSeekService.getChatVideoAnalysis(aiRequestPayload);
            } else {
                throw new Error(`Unknown provider: ${provider}`);
            }

            let segmentsArray = aiResponse;
            if (aiResponse && !Array.isArray(aiResponse)) {
                const values = Object.values(aiResponse);
                const arrayValue = values.find(v => Array.isArray(v));
                if (arrayValue) {
                    segmentsArray = arrayValue;
                } else {
                    throw new Error('AI response format invalid (expected array)');
                }
            }

            if (!Array.isArray(segmentsArray)) {
                throw new Error('AI response is not an array');
            }

            const updatedSegments = segments.map(seg => {
                const generated = segmentsArray.find((a: any) => a.id === seg.id);
                if (!generated || generated.firstFrame == null) return seg;

                const normalizedFirstFrame = typeof generated.firstFrame === 'string'
                    ? generated.firstFrame.trim()
                    : String(generated.firstFrame).trim();

                if (!normalizedFirstFrame) return seg;

                return {
                    ...seg,
                    firstFrame: normalizedFirstFrame,
                };
            });

            this.emit('status', { stage: 'analyzed', message: 'Prompts de primeiro frame gerados' });

            return {
                success: true,
                segments: updatedSegments,
            };
        } catch (error: any) {
            console.error('❌ First frame prompt generation error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
            return {
                success: false,
                error: error.message || String(error),
                segments,
            };
        }
    }

    public async extractStoryAssetsFromTranscription(
        input: {
            transcription?: string;
            segments?: VideoProjectSegment[];
        },
        options?: {
            provider?: AIProvider;
            model?: string;
            characterStyle?: string;
            locationStyle?: string;
        }
    ): Promise<StoryAssetsExtractionResult> {
        const provider = options?.provider || 'gemini';
        const characterStyle = (options?.characterStyle || 'fotorrealista').trim() || 'fotorrealista';
        const locationStyle = (options?.locationStyle || 'fotorrealista').trim() || 'fotorrealista';
        const segments = Array.isArray(input?.segments) ? input.segments : [];
        const toDebugJson = (value: unknown): string => {
            try {
                return JSON.stringify(value, null, 2);
            } catch {
                return String(value);
            }
        };

        const segmentsTranscript = segments
            .slice()
            .sort((a, b) => a.start - b.start)
            .map(seg => `${seg.text}`)
            .join('\n');

        const transcription = (input?.transcription || segmentsTranscript || '').trim();
        if (!transcription) {
            return {
                success: false,
                error: 'Transcrição vazia. Não foi possível extrair personagens e lugares.',
                characters: [],
                locations: [],
            };
        }

        this.emit('status', {
            stage: 'analyzing',
            message: `Extraindo personagens e lugares com ${provider}...`,
        });

        try {
            const prompt = this.buildStoryAssetsExtractionPrompt(transcription, {
                characterStyle,
                locationStyle,
            });
            const aiRequestPayload: any[] = [
                {
                    role: 'system',
                    content: 'You are a visual pre-production assistant. Return ONLY valid JSON.',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ];
            console.log('🧪 [StoryAssets][Service] AI Request:', toDebugJson({
                provider,
                model: options?.model || null,
                characterStyle,
                locationStyle,
                transcriptionLength: transcription.length,
                aiRequestPayload,
            }));

            const aiResponse = await this.requestJsonWithProvider(provider, aiRequestPayload, options?.model);
            console.log('🧪 [StoryAssets][Service] AI Raw Response:', toDebugJson(aiResponse));
            const normalizedResponse = this.normalizeStoryAssetsResponse(aiResponse);
            console.log('🧪 [StoryAssets][Service] AI Normalized Response:', toDebugJson(normalizedResponse));

            this.emit('status', {
                stage: 'analyzed',
                message: 'Personagens e lugares extraídos.',
            });

            return {
                success: true,
                characters: normalizedResponse.characters,
                locations: normalizedResponse.locations,
            };
        } catch (error: any) {
            console.error('❌ Story assets extraction error:', error);
            return {
                success: false,
                error: error?.message || String(error),
                characters: [],
                locations: [],
            };
        }
    }

    private async getGeminiScrapingVideoAnalysis(messages: Array<{ role: string; content: string }>): Promise<any> {
        const { provider, providerId, providerName } = await this.ensureGeminiScrapingProvider();
        console.log(`🕸️ [VideoProject] Using Gemini scraping provider: ${providerName} (${providerId})`);

        const prompt = this.buildGeminiScrapingPrompt(messages);
        const rawResponse = await provider.sendMessageWithStream(prompt);

        if (!rawResponse || !rawResponse.trim()) {
            throw new Error('Gemini scraping retornou resposta vazia.');
        }

        return this.parseJsonFromScrapingResponse(rawResponse);
    }

    private async ensureGeminiScrapingProvider(): Promise<{
        provider: any;
        providerId: string;
        providerName: string;
    }> {
        const { getProviderManager } = require('../libs/PuppeteerProvider');
        const manager = getProviderManager();

        const geminiProviders = manager.listProvidersByPlatform('gemini');
        if (!geminiProviders.length) {
            throw new Error('Nenhum provider Gemini configurado para scraping. Crie um provider Gemini e faça login.');
        }

        const targetProvider = geminiProviders.find((p: any) => p.isLoggedIn) || geminiProviders[0];
        let provider = manager.getGeminiProvider(targetProvider.id);

        if (!provider || !provider.isBrowserConnected?.() || !provider.isLoggedIn) {
            const openResult = await manager.openForLogin(targetProvider.id);
            if (!openResult?.success) {
                throw new Error(`Falha ao abrir o provider Gemini "${targetProvider.name}" para scraping.`);
            }

            if (!openResult.isLoggedIn) {
                throw new Error(`Provider Gemini "${targetProvider.name}" não está logado. Faça login no navegador e tente novamente.`);
            }

            provider = manager.getGeminiProvider(targetProvider.id);
        }

        if (!provider) {
            throw new Error('Provider Gemini não está disponível para scraping.');
        }

        const isLoggedIn = await provider.goToGemini();
        if (!isLoggedIn) {
            throw new Error(`Provider Gemini "${targetProvider.name}" não está logado. Faça login no navegador e tente novamente.`);
        }

        return {
            provider,
            providerId: targetProvider.id,
            providerName: targetProvider.name,
        };
    }

    private buildGeminiScrapingPrompt(messages: Array<{ role: string; content: string }>): string {
        const systemContent = messages
            .filter(m => m.role === 'system')
            .map(m => m.content?.trim())
            .filter(Boolean)
            .join('\n\n');

        const userContent = messages
            .filter(m => m.role === 'user')
            .map(m => m.content?.trim())
            .filter(Boolean)
            .join('\n\n');

        const assistantContext = messages
            .filter(m => m.role === 'assistant')
            .map(m => m.content?.trim())
            .filter(Boolean)
            .join('\n\n');

        return [
            systemContent ? `\n${systemContent}` : '',
            userContent ? `\n${userContent}` : '',
            assistantContext ? `\n${assistantContext}` : ''
        ].filter(Boolean).join('\n\n');
    }

    private parseJsonFromScrapingResponse(rawResponse: string): any {
        const normalized = rawResponse.trim();
        const candidates: string[] = [];

        const fencedRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
        let fencedMatch: RegExpExecArray | null = null;
        while ((fencedMatch = fencedRegex.exec(normalized)) !== null) {
            if (fencedMatch[1]?.trim()) {
                candidates.push(fencedMatch[1].trim());
            }
        }

        const extractedBlock = this.extractFirstJsonBlock(normalized);
        if (extractedBlock) {
            candidates.push(extractedBlock.trim());
        }

        candidates.push(normalized);

        const uniqueCandidates = [...new Set(candidates.filter(Boolean))];
        for (const candidate of uniqueCandidates) {
            try {
                return JSON.parse(candidate);
            } catch {
                // tenta próximo candidato
            }
        }

        const preview = normalized.slice(0, 240).replace(/\s+/g, ' ');
        throw new Error(`Não foi possível converter a resposta do Gemini scraping para JSON. Trecho: ${preview}`);
    }

    private extractFirstJsonBlock(text: string): string | null {
        const objectStart = text.indexOf('{');
        const arrayStart = text.indexOf('[');
        let start = -1;

        if (objectStart === -1) {
            start = arrayStart;
        } else if (arrayStart === -1) {
            start = objectStart;
        } else {
            start = Math.min(objectStart, arrayStart);
        }

        if (start === -1) {
            return null;
        }

        const stack: string[] = [];
        let inString = false;
        let escaped = false;

        for (let i = start; i < text.length; i++) {
            const char = text[i];

            if (inString) {
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (char === '\\') {
                    escaped = true;
                    continue;
                }
                if (char === '"') {
                    inString = false;
                }
                continue;
            }

            if (char === '"') {
                inString = true;
                continue;
            }

            if (char === '{' || char === '[') {
                stack.push(char);
                continue;
            }

            if (char === '}' || char === ']') {
                const last = stack[stack.length - 1];
                const isMatch =
                    (last === '{' && char === '}') ||
                    (last === '[' && char === ']');

                if (!isMatch) {
                    continue;
                }

                stack.pop();
                if (stack.length === 0) {
                    return text.slice(start, i + 1);
                }
            }
        }

        return null;
    }

    private toPositiveInt(value: unknown): number | null {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return Math.floor(value);
        }

        if (typeof value === 'string') {
            const parsed = parseInt(value.trim(), 10);
            if (!isNaN(parsed) && parsed > 0) {
                return parsed;
            }
        }

        return null;
    }

    private normalizeStoryCharacterItem(item: any, fallbackId: number): StoryCharacterReference | null {
        if (!item || typeof item !== 'object') return null;

        const id = this.toPositiveInt(item.id) ?? fallbackId;
        const referenceId = this.toPositiveInt(item.reference_id);

        const characterRaw = item.character ?? item.name ?? item.personagem;
        const promptRaw = item.prompt_en ?? item.prompt ?? item.promptEnglish;

        const character = characterRaw == null ? '' : String(characterRaw).trim();
        const prompt_en = promptRaw == null ? '' : String(promptRaw).trim();

        if (!character || !prompt_en) return null;

        return {
            id,
            character,
            prompt_en,
            reference_id: referenceId,
        };
    }

    private normalizeStoryLocationItem(item: any, fallbackId: number): StoryLocationReference | null {
        if (!item || typeof item !== 'object') return null;

        const id = this.toPositiveInt(item.id) ?? fallbackId;
        const referenceId = this.toPositiveInt(item.reference_id);

        const locationRaw = item.location ?? item.place ?? item.lugar ?? item.cenario;
        const promptRaw = item.prompt_en ?? item.prompt ?? item.promptEnglish;

        const location = locationRaw == null ? '' : String(locationRaw).trim();
        const prompt_en = promptRaw == null ? '' : String(promptRaw).trim();

        if (!location || !prompt_en) return null;

        return {
            id,
            location,
            prompt_en,
            reference_id: referenceId,
        };
    }

    private normalizeStoryItemsIds<T extends { id: number; reference_id: number | null }>(items: T[]): T[] {
        if (!items.length) return [];

        const originalToFinalId = new Map<number, number>();
        items.forEach((item, idx) => {
            originalToFinalId.set(item.id, idx + 1);
        });

        return items.map((item, idx) => {
            const mappedReference = item.reference_id == null
                ? null
                : originalToFinalId.get(item.reference_id) ?? null;

            return {
                ...item,
                id: idx + 1,
                reference_id: mappedReference === idx + 1 ? null : mappedReference,
            };
        });
    }

    private normalizeStoryAssetsResponse(rawResponse: any): {
        characters: StoryCharacterReference[];
        locations: StoryLocationReference[];
    } {
        const payload = (() => {
            if (Array.isArray(rawResponse)) {
                return { characters: [], locations: rawResponse };
            }

            if (rawResponse && typeof rawResponse === 'object') {
                return rawResponse as Record<string, any>;
            }

            throw new Error('Formato de resposta inválido para extração de personagens/lugares.');
        })();

        const rawCharacters = Array.isArray(payload.characters)
            ? payload.characters
            : Array.isArray(payload.personagens)
                ? payload.personagens
                : [];

        const rawLocations = Array.isArray(payload.locations)
            ? payload.locations
            : Array.isArray(payload.lugares)
                ? payload.lugares
                : Array.isArray(payload.scenes)
                    ? payload.scenes
                    : [];

        const characters = rawCharacters
            .map((item: any, idx: number) => this.normalizeStoryCharacterItem(item, idx + 1))
            .filter((item: StoryCharacterReference | null): item is StoryCharacterReference => Boolean(item));

        const locations = rawLocations
            .map((item: any, idx: number) => this.normalizeStoryLocationItem(item, idx + 1))
            .filter((item: StoryLocationReference | null): item is StoryLocationReference => Boolean(item));

        return {
            characters: this.normalizeStoryItemsIds(characters),
            locations: this.normalizeStoryItemsIds(locations),
        };
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

    private normalizeCharactersField(raw: unknown): string | undefined {
        if (raw == null) return undefined;

        const extractFromString = (value: string): string | undefined => {
            const bracketMatches = [...value.matchAll(/\[([\d\s,]+)\]/g)];
            if (bracketMatches.length > 0) {
                const ids = bracketMatches
                    .map(m => m[1])
                    .join(',')
                    .split(',')
                    .map(s => parseInt(s.trim(), 10))
                    .filter(n => !isNaN(n));
                if (ids.length > 0) return ids.join(', ');
            }

            const digits = value
                .split(',')
                .map(s => parseInt(s.replace(/\D/g, ''), 10))
                .filter(n => !isNaN(n));
            if (digits.length > 0) return digits.join(', ');

            const cleaned = value.replace(/[\[\]"]/g, '').trim();
            return cleaned || undefined;
        };

        if (Array.isArray(raw)) {
            const ids = raw
                .map(v => typeof v === 'number' ? v : parseInt(String(v).replace(/\D/g, ''), 10))
                .filter(v => !isNaN(v));
            if (ids.length > 0) return ids.join(', ');
            return undefined;
        }

        if (typeof raw === 'number') {
            return Number.isFinite(raw) ? String(raw) : undefined;
        }

        if (typeof raw === 'string') {
            return extractFromString(raw);
        }

        try {
            return extractFromString(JSON.stringify(raw));
        } catch {
            const fallback = String(raw).trim();
            return fallback || undefined;
        }
    }

    private normalizeSceneReferenceIds(raw: unknown): string | undefined {
        return this.normalizeCharactersField(raw);
    }

    private normalizeSegmentCharacters(segment: VideoProjectSegment): VideoProjectSegment {
        const normalizedCharacters = this.normalizeCharactersField(
            segment.IdOfTheCharactersInTheScene
        );
        const normalizedLocation = this.normalizeSceneReferenceIds(
            segment.IdOfTheLocationInTheScene
        );

        const nextSegment: VideoProjectSegment = {
            ...segment,
        };

        if (normalizedCharacters !== undefined) {
            nextSegment.IdOfTheCharactersInTheScene = normalizedCharacters;
        } else {
            delete (nextSegment as any).IdOfTheCharactersInTheScene;
        }

        if (normalizedLocation !== undefined) {
            nextSegment.IdOfTheLocationInTheScene = normalizedLocation;
        } else {
            delete (nextSegment as any).IdOfTheLocationInTheScene;
        }

        return nextSegment;
    }

    private stringifyPromptForEdition(prompt: unknown): string {
        if (prompt == null) return '';
        if (typeof prompt === 'string') return prompt;
        try {
            return JSON.stringify(prompt);
        } catch {
            return String(prompt);
        }
    }

    /**
     * Gera exemplo JSON dinâmico para edição de prompts,
     * baseado nos tipos de segmentos presentes na requisição.
     */
    private generatePromptEditionExampleJson(segments: VideoProjectSegment[]): string {
        const hasFrameAnimate = segments.some(s => s.assetType === 'video_frame_animate');
        const regularSegments = segments.filter(s => s.assetType !== 'video_frame_animate');
        const hasRegularSegments = regularSegments.length > 0;
        const includeCharactersField = regularSegments.some(s =>
            this.normalizeCharactersField(s.IdOfTheCharactersInTheScene) != null
        );
        const includeLocationField = regularSegments.some(s =>
            this.normalizeSceneReferenceIds(s.IdOfTheLocationInTheScene) != null
        );

        const exampleSegments: Array<Record<string, any>> = [];
        let fallbackId = 1;

        if (hasFrameAnimate) {
            const sampleFrameAnimate = segments.find(s => s.assetType === 'video_frame_animate');
            exampleSegments.push({
                id: sampleFrameAnimate?.id ?? fallbackId++,
                assetType: 'video_frame_animate',
                firstFrame: 'prompt editado do primeiro frame',
                animateFrame: 'prompt editado de animação',
            });
        }

        if (hasRegularSegments) {
            const sampleRegular = regularSegments[0];
            const regularExample: Record<string, any> = {
                id: sampleRegular?.id ?? fallbackId++,
                assetType: sampleRegular?.assetType || 'image_flux',
                imagePrompt: 'prompt editado/JSON editado/Código editado',
            };

            if (includeCharactersField) {
                regularExample.IdOfTheCharactersInTheScene = '1, 3';
            }
            if (includeLocationField) {
                regularExample.IdOfTheLocationInTheScene = '2';
            }

            exampleSegments.push(regularExample);
        }

        if (exampleSegments.length === 0) {
            exampleSegments.push({
                id: 1,
                assetType: 'image_flux',
                imagePrompt: 'prompt editado/JSON editado/Código editado',
            });
        }

        const responseExample = JSON.stringify(
            { segments: [...exampleSegments, '...'] },
            null,
            2
        ).replace('"..."', '...');

        return `Formato de resposta (responda APENAS com este JSON):\n${responseExample}`;
    }

    private buildPromptEditionPrompt(
        segments: VideoProjectSegment[],
        userInstruction: string
    ): string {
        const promptsList = segments
            .map(s => {
                if (s.assetType === 'video_frame_animate') {
                    return `ID: ${s.id}\nassetType: video_frame_animate\nfirstFrame atual:\n${this.stringifyPromptForEdition(s.firstFrame)}\nanimateFrame atual:\n${this.stringifyPromptForEdition(s.animateFrame)}`;
                }
                const normalizedCharacters = this.normalizeCharactersField(s.IdOfTheCharactersInTheScene);
                const normalizedLocation = this.normalizeSceneReferenceIds(s.IdOfTheLocationInTheScene);
                const charsLine = normalizedCharacters
                    ? `\nIdOfTheCharactersInTheScene atual:\n${normalizedCharacters}`
                    : '';
                const locationLine = normalizedLocation
                    ? `\nIdOfTheLocationInTheScene atual:\n${normalizedLocation}`
                    : '';
                return `ID: ${s.id}\nassetType: ${s.assetType || 'image_flux'}\nimagePrompt atual:\n${this.stringifyPromptForEdition(s.imagePrompt)}${charsLine}${locationLine}`;
            })
            .join('\n\n');

        const hasFrameAnimate = segments.some(s => s.assetType === 'video_frame_animate');
        const hasRegularSegments = segments.some(s => s.assetType !== 'video_frame_animate');
        const shouldMentionSceneReferences = hasRegularSegments;
        const responseExample = this.generatePromptEditionExampleJson(segments);

        const promptRules: string[] = [];

        if (hasFrameAnimate && hasRegularSegments) {
            promptRules.push('- Para segmentos com assetType = "video_frame_animate", retorne "firstFrame" e "animateFrame" (NÃO retorne imagePrompt).');
            promptRules.push('- Para os demais segmentos, retorne "imagePrompt".');
        } else if (hasFrameAnimate) {
            promptRules.push('- Para TODOS os segmentos, retorne "firstFrame" e "animateFrame" (NÃO retorne imagePrompt).');
        } else {
            promptRules.push('- Para TODOS os segmentos, retorne "imagePrompt".');
        }

        if (shouldMentionSceneReferences) {
            promptRules.push('- Se precisar indicar personagens, retorne "IdOfTheCharactersInTheScene" no mesmo nível do segmento (nunca dentro de imagePrompt).');
            promptRules.push('- Se precisar indicar lugares, retorne "IdOfTheLocationInTheScene" no mesmo nível do segmento (nunca dentro de imagePrompt).');
        }

        promptRules.push('- Não retorne explicações fora do JSON.');

        return `Você é um editor de prompts de vídeo.

INSTRUÇÃO DO USUÁRIO:
"${userInstruction}"

Segments:
${promptsList}

Regras obrigatórias:
${promptRules.join('\n')}

${responseExample}`;
    }

    private buildSceneDescriptionPrompt(
        segments: VideoProjectSegment[]
    ): string {
        const promptsList = segments
            .map(s => `ID: ${s.id}\nPrompt:\n${this.stringifyPromptForEdition(s.imagePrompt)}`)
            .join('\n\n');

        return `Você receberá prompts visuais de cenas de vídeo.

Resuma cada prompt, em uma única linha, de forma objetiva, em português.

PROMPTS:
${promptsList}

Regras obrigatórias:
- O resumo deve ser em português.
- Uma única linha por cena.
- Seja direto e descreva apenas o que acontece na cena. Quem está nela e o ambiente.
- Não adicione explicações extras fora do JSON.

Formato de resposta:
{
  "segments": [
    {
      "id": 1,
      "sceneDescription": "Resumo em português da cena"
    }
  ]
}`;
    }

    private buildFirstFramePrompt(
        segments: VideoProjectSegment[]
    ): string {
        const promptsList = segments
            .map(s => `ID: ${s.id}\nPrompt da cena:\n${this.stringifyPromptForEdition(s.imagePrompt)}`)
            .join('\n\n');

        return `Você receberá prompts visuais de cenas de vídeo.

Para CADA cena, gere um prompt detalhado em inglês para gerar uma IMAGEM ESTÁTICA que represente o PRIMEIRO FRAME dessa cena.

O prompt deve descrever exatamente como a cena começa: composição, enquadramento, iluminação, personagens/objetos visíveis, cores e atmosfera no instante inicial.

PROMPTS DAS CENAS:
${promptsList}

Regras obrigatórias:
- O prompt do primeiro frame deve ser em INGLÊS.
- Deve ser um prompt otimizado para geração de imagem (ex: Stable Diffusion, DALL-E, Midjourney).
- Descreva a composição visual do momento inicial da cena.
- Inclua detalhes de iluminação, ângulo de câmera, cores e atmosfera.
- O prompt deve ser objetivo, descritivo e focado apenas no visual do primeiro frame.
- Não adicione explicações extras fora do JSON.

Formato de resposta:
{
  "segments": [
    {
      "id": 1,
      "firstFrame": "Detailed English prompt for the first frame image of this scene"
    }
  ]
}`;
    }

    private buildStoryAssetsExtractionPrompt(
        transcription: string,
        styles?: {
            characterStyle?: string;
            locationStyle?: string;
        }
    ): string {
        const characterStyleLabel = ((styles?.characterStyle || '').replace(/\s+/g, ' ').trim() || 'fotorrealista');
        const locationStyleLabel = ((styles?.locationStyle || '').replace(/\s+/g, ' ').trim() || 'fotorrealista');
        return `Analise o roteiro/transcrição abaixo e extraia duas listas independentes: personagens e lugares.

TRANSCRIÇÃO:
${transcription}

TAREFA 1 — PERSONAGENS:
- Liste individualmente os personagens relevantes para geração visual. Apenas um personagem por item.
- Para cada personagem, gere um prompt em inglês no estilo "${characterStyleLabel}".
- Se o mesmo personagem mudar de roupa, aparência, idade, penteado, estado físico ou característica visual importante, crie um NOVO item com "reference_id" apontando para o ID base do personagem.
- Para personagens totalmente novos, use "reference_id": null.

TAREFA 2 — LUGARES:
- Liste TODOS os lugares/cenários onde a história acontece. Se a narração não mencionar o lugar, mas for possível inferir o lugar, liste-o.
- Para cada lugar, gere um prompt em inglês para imagem no estilo "${locationStyleLabel}" do cenário (sem personagens visíveis).
- O prompt do lugar deve manter coerência com os personagens da história (ex: objetos, vestígios, contexto, escala e atmosfera ligadas a eles), mas sem mostrar pessoas.
- Se algo mudar no lugar, gere outro item para o mesmo lugar com "reference_id" apontando para o ID base do lugar.
- Para lugares inéditos, use "reference_id": null.

Regras obrigatórias:
- Responda EXCLUSIVAMENTE em JSON válido.
- Não use markdown, comentários ou texto fora do JSON.
- Retorne exatamente neste formato:
{
  "characters": [
    {
      "id": 1,
      "character": "Character name (Context/Moment)",
      "prompt_en": "Detailed English prompt...",
      "reference_id": null
    }
  ],
  "locations": [
    {
      "id": 1,
      "location": "Name + (Context/Moment)",
      "prompt_en": "Detailed English prompt...",
      "reference_id": null
    }
  ]
}`;
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
   - Se for JSON estruturado, NÃO inclua "IdOfTheCharactersInTheScene" dentro do imagePrompt.

3. **IdOfTheCharactersInTheScene** (obrigatório): IDs dos personagens presentes na cena (ex: "1, 3") ou null quando não houver personagem relevante.
   - Este campo deve ficar no MESMO NÍVEL de "imagePrompt" dentro do segmento.

4. **IdOfTheLocationInTheScene** (obrigatório): IDs dos lugares presentes na cena (ex: "2") ou null quando não houver lugar aplicável.
   - Este campo deve ficar no MESMO NÍVEL de "imagePrompt" dentro do segmento.

5. **assetType**: O tipo de asset recomendado:
${assetInstructions}

6. **cameraMovement**: Movimento de câmera sugerido:
${cameraInstructions}

7. **transition**: Transição para a próxima cena:
${transitionInstructions}

8. **highlightWords**: Array de palavras ou frases-chave que devem ser destacadas visualmente durante a cena.
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

Responda APENAS com um objeto JSON válido no formato:
{
  "segments": [
    {
      "id": 1,
      "emotion": "surpresa",
      "imagePrompt": "detailed prompt in English...",
      "IdOfTheCharactersInTheScene": "1, 3",
      "IdOfTheLocationInTheScene": "2",
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
  ]
}`;
    }


    // ========================================
    // REMOTION CONVERSION
    // ========================================

    /**
     * Converte projeto para formato Remotion
     */
    public convertToRemotionProject(project: VideoProjectData): RemotionProject {
        console.log('🔧 convertToRemotionProject - subtitleMode:', project.subtitleMode);
        const removeAudioSilences = project.config?.removeAudioSilences === true;
        const audioKeepRanges = removeAudioSilences
            ? buildSilenceCompactionRanges(project.segments, {
                mergeAdjacentRanges: false,
            })
            : [];
        const getRangeKey = (range: { sourceStart: number; sourceEnd: number; outputStart: number; outputEnd: number; }) => {
            return [
                Number(range.sourceStart || 0).toFixed(4),
                Number(range.sourceEnd || 0).toFixed(4),
                Number(range.outputStart || 0).toFixed(4),
                Number(range.outputEnd || 0).toFixed(4),
            ].join('|');
        };
        const validRangeKeySet = new Set(audioKeepRanges.map(getRangeKey));
        const audioMutedRanges = Array.isArray(project.config?.audioMutedRanges)
            ? project.config!.audioMutedRanges
                .map((range: any) => ({
                    sourceStart: Number(range?.sourceStart || 0),
                    sourceEnd: Number(range?.sourceEnd || 0),
                    outputStart: Number(range?.outputStart || 0),
                    outputEnd: Number(range?.outputEnd || 0),
                }))
                .filter((range) => range.sourceEnd > range.sourceStart)
                .filter((range) => validRangeKeySet.has(getRangeKey(range)))
            : [];
        const timelineSegments = removeAudioSilences
            ? compactTimelineSegments(project.segments, audioKeepRanges, { compactWords: true })
            : project.segments;

        const scenes = timelineSegments.map(seg => {
            const rawAssetPath = seg.asset_url || seg.imageUrl;
            const localAssetPath = this.toLocalFsPath(rawAssetPath);

            return {
                id: seg.id,
                track: seg.track || 1,
                start_time: seg.start,
                end_time: seg.end,
                transcript_segment: seg.text,
                visual_concept: {
                    description: seg.text,
                    art_style: 'photorealistic',
                    emotion: seg.emotion || 'neutro',
                },
                asset_type: seg.assetType || 'image_flux',
                // Para Remotion (Chromium), usamos URL HTTP; para FFmpeg, também mandamos o caminho local bruto.
                asset_url: this.convertToHttpUrl(rawAssetPath),
                ...(localAssetPath && { asset_local_path: localAssetPath }),
                ...(seg.asset_duration != null && { asset_duration: seg.asset_duration }),
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
                // Transform (PiP)
                ...(seg.transform && {
                    transform: seg.transform
                }),
                // Audio (Volume, Fade-in, Fade-out)
                audio: {
                    volume: seg.audio?.volume ?? 1,
                    fadeIn: seg.audio?.fadeIn ?? 0,
                    fadeOut: seg.audio?.fadeOut ?? 0,
                },
            };
        });

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
                defaultFont: project.defaultFont, // ✅ Fonte padrão do nicho
                fitVideoToScene: project.config?.fitVideoToScene ?? true, // ✅ Acelerar/Desacelerar
                removeAudioSilences,
                ...(audioKeepRanges.length > 0 && {
                    audioKeepRanges,
                }),
                ...(audioMutedRanges.length > 0 && {
                    audioMutedRanges,
                }),
                assetsBaseUrl: `http://localhost:${this.imageServerPort}`, // ✅ URL base dinâmica
                // Incluir áudio da narração/transcrição
                ...(project.audioPath && {
                    backgroundMusic: {
                        src: this.convertToHttpUrl(project.audioPath),
                        src_local: this.toLocalFsPath(project.audioPath),
                        volume: project.config?.mainAudioVolume ?? 1.0,
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
            const verboseAssetLogs = process.env.VIDEO_ASSET_SERVER_DEBUG === '1';
            const localAssetCount = remotionProject.scenes.filter((scene: any) => Boolean(scene.asset_local_path)).length;
            console.log(`📸 Assets: ${remotionProject.scenes.length} cenas (${localAssetCount} locais, ${remotionProject.scenes.length - localAssetCount} via URL)`);

            if (verboseAssetLogs) {
                console.log('📸 Image URLs:');
                remotionProject.scenes.forEach((scene, i) => {
                    console.log(`  Scene ${i + 1}: ${scene.asset_url}`);
                });
            }

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

        const storyReferences = {
            characters: (project.storyReferences?.characters || [])
                .filter(item => Number.isFinite(item?.id) && item.id > 0)
                .map(item => ({
                    id: Math.floor(item.id),
                    character: String(item.character ?? '').trim(),
                    prompt_en: String(item.prompt_en ?? '').trim(),
                    reference_id:
                        item.reference_id == null || !Number.isFinite(Number(item.reference_id))
                            ? null
                            : Math.floor(Number(item.reference_id)),
                    imageUrl: item.imageUrl,
                })),
            locations: (project.storyReferences?.locations || [])
                .filter(item => Number.isFinite(item?.id) && item.id > 0)
                .map(item => ({
                    id: Math.floor(item.id),
                    location: String(item.location ?? '').trim(),
                    prompt_en: String(item.prompt_en ?? '').trim(),
                    reference_id:
                        item.reference_id == null || !Number.isFinite(Number(item.reference_id))
                            ? null
                            : Math.floor(Number(item.reference_id)),
                    imageUrl: item.imageUrl,
                })),
            characterStyle: String(project.storyReferences?.characterStyle || 'fotorrealista').trim() || 'fotorrealista',
            locationStyle: String(project.storyReferences?.locationStyle || 'fotorrealista').trim() || 'fotorrealista',
        };

        // Reorganizar propriedades na ordem desejada
        const orderedProject = {
            title: project.title,
            description: project.description,
            duration: project.duration,
            audioPath: project.audioPath,
            selectedAspectRatios: project.selectedAspectRatios, // Salvar as proporções
            subtitleMode: project.subtitleMode,
            componentsAllowed: project.componentsAllowed, // ✅ Salvar componentes permitidos
            nicheId: project.nicheId, // ✅ Salvar ID do nicho
            nicheName: project.nicheName, // ✅ Salvar nome do nicho
            storyReferences, // ✅ Salvar personagens/lugares da modal
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
                IdOfTheCharactersInTheScene: segment.IdOfTheCharactersInTheScene,
                IdOfTheLocationInTheScene: segment.IdOfTheLocationInTheScene,
                sceneDescription: segment.sceneDescription,
                imageUrl: segment.imageUrl,
                sourceImageUrl: segment.sourceImageUrl,
                asset_url: segment.asset_url,
                chroma_key: segment.chroma_key,
                background: segment.background,
                assetType: segment.assetType,
                cameraMovement: segment.cameraMovement,
                transition: segment.transition,
                highlightWords: segment.highlightWords,
                timeline_config: segment.timeline_config,
                track: segment.track,
                asset_duration: segment.asset_duration,
                transform: segment.transform,
                audio: segment.audio,
                firstFrame: segment.firstFrame,
                animateFrame: segment.animateFrame,
                imagePromptOriginal: segment.imagePromptOriginal,
                firstFrameOriginal: segment.firstFrameOriginal,
                animateFrameOriginal: segment.animateFrameOriginal,
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

            project.segments = (project.segments || []).map(segment =>
                this.normalizeSegmentCharacters(segment)
            );

            // Adicionar config padrão se não existir (compatibilidade com projetos antigos)
            if (!project.config) {
                project.config = {
                    width: 1920,
                    height: 1080,
                    fps: 60,
                    backgroundColor: '#0a0a0a',
                };
            }

            project.storyReferences = {
                characters: Array.isArray(project.storyReferences?.characters)
                    ? project.storyReferences!.characters
                    : [],
                locations: Array.isArray(project.storyReferences?.locations)
                    ? project.storyReferences!.locations
                    : [],
                characterStyle: String(project.storyReferences?.characterStyle || 'fotorrealista').trim() || 'fotorrealista',
                locationStyle: String(project.storyReferences?.locationStyle || 'fotorrealista').trim() || 'fotorrealista',
            };

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
