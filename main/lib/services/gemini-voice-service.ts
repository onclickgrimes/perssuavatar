import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import {
    createVideoGenAIClient,
    VideoGenAIBackend
} from './genai-video-client';

// ===========================
// Types e Interfaces
// ===========================

export interface VoiceConfig {
    voiceName: string;
    temperature?: number;
}

export interface TTSOptions {
    text: string;
    voiceName?: string;
    temperature?: number;
    outputPath?: string;
}

export interface TTSResult {
    success: boolean;
    filePath?: string;
    buffer?: Buffer;
    error?: string;
}

export interface WavConversionOptions {
    numChannels: number;
    sampleRate: number;
    bitsPerSample: number;
}

// Vozes disponíveis no Gemini TTS
export const GEMINI_VOICES = [
    'Achernar',
    'Achird', 
    'Alasia',
    'Algenib',
    'Algieba',
    'Alnilam',
    'Aoede',
    'Auva',
    'Callirrhoe',
    'Chara',
    'Despina',
    'Erinome',
    'Fenrir',
    'Gacrux',
    'Isonoe',
    'Kore',
    'Leda',
    'Loge',
    'Orus',
    'Puck',
    'Pulcherrima',
    'Rasalgethi',
    'Sadachbia',
    'Sadaltager',
    'Schedar',
    'Sulafat',
    'Umbriel',
    'Vindemiatrix',
    'Zephyr',
    'Zubenelgenubi'
] as const;

export type GeminiVoiceName = typeof GEMINI_VOICES[number];

// ===========================
// GeminiVoiceService Class
// ===========================

export class GeminiVoiceService {
    private ai: GoogleGenAI | null = null;
    //private model: string = 'gemini-2.5-flash-preview-tts';
    private model: string = 'gemini-2.5-flash-preview-tts'; 
    private defaultVoice: GeminiVoiceName = 'Achernar';
    private defaultTemperature: number = 1;
    private currentBackend: VideoGenAIBackend | null = null;
    private currentProject: string | null = null;
    private currentLocation: string | null = null;
    private currentApiKey: string | null = null;
    private currentVertexCredentialsPath: string | null = null;
    private currentVertexAuthMode: string | null = null;

    constructor() {
        // Inicialização lazy no primeiro uso para respeitar backend/config do banco local.
    }

    private ensureClient(): void {
        const {
            ai,
            backend,
            project,
            location,
            apiKey,
            vertexCredentialsPath,
            vertexAuthMode
        } = createVideoGenAIClient(null, 'next');

        const changed =
            this.currentBackend !== backend ||
            this.currentProject !== (project || null) ||
            this.currentLocation !== (location || null) ||
            this.currentApiKey !== (apiKey || null) ||
            this.currentVertexCredentialsPath !== (vertexCredentialsPath || null) ||
            this.currentVertexAuthMode !== (vertexAuthMode || null) ||
            !this.ai;

        if (changed) {
            this.ai = ai;
            this.currentBackend = backend;
            this.currentProject = project || null;
            this.currentLocation = location || null;
            this.currentApiKey = apiKey || null;
            this.currentVertexCredentialsPath = vertexCredentialsPath || null;
            this.currentVertexAuthMode = vertexAuthMode || null;

            const vertexAuthLabel =
                backend === 'vertex'
                    ? ` | auth=${
                        vertexAuthMode === 'service-account-file'
                            ? `service-account:${path.basename(vertexCredentialsPath || '')}`
                            : vertexAuthMode === 'env-service-account-file'
                            ? `env:${path.basename(vertexCredentialsPath || '')}`
                            : 'adc'
                    }`
                    : '';

            console.log(
                `[GeminiVoice] Backend selecionado: ${backend}${backend === 'vertex' ? ` (${project}/${location})` : ''}${vertexAuthLabel}`
            );
        }
    }

    /**
     * Define a voz padrão para síntese
     */
    public setDefaultVoice(voiceName: GeminiVoiceName): void {
        this.defaultVoice = voiceName;
        console.log(`[GeminiVoice] Voz padrão definida: ${voiceName}`);
    }

    /**
     * Define a temperatura padrão
     */
    public setDefaultTemperature(temperature: number): void {
        this.defaultTemperature = Math.max(0, Math.min(2, temperature));
        console.log(`[GeminiVoice] Temperatura padrão definida: ${this.defaultTemperature}`);
    }

    /**
     * Define o modelo TTS (para fallback em caso de rate limit)
     */
    public setModel(modelName: string): void {
        this.model = modelName;
        console.log(`[GeminiVoice] Modelo alterado para: ${modelName}`);
    }

    /**
     * Retorna o modelo atual
     */
    public getModel(): string {
        return this.model;
    }

    /**
     * Gera áudio a partir de texto usando streaming
     * @param options Opções de síntese
     * @returns Resultado com buffer de áudio ou caminho do arquivo
     */
    public async generateSpeech(options: TTSOptions): Promise<TTSResult> {
        const { 
            text, 
            voiceName = this.defaultVoice, 
            temperature = this.defaultTemperature,
            outputPath 
        } = options;

        if (!text || text.trim().length === 0) {
            return { success: false, error: 'Texto vazio fornecido' };
        }

        console.log(`[GeminiVoice] Gerando áudio para: "${text.substring(0, 50)}..."`);
        console.log(`[GeminiVoice] Voz: ${voiceName}, Temperatura: ${temperature}`);

        try {
            this.ensureClient();
            const aiClient = this.ai as GoogleGenAI;
            const config = {
                temperature,
                responseModalities: ['audio'] as const,
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName,
                        }
                    }
                },
            };

            const contents = [
                {
                    role: 'user',
                    parts: [
                        {
                            text: text,
                        },
                    ],
                },
            ];

            const response = await aiClient.models.generateContentStream({
                model: this.model,
                config: config as any,
                contents,
            });

            // Coletar todos os chunks de áudio
            const audioBuffers: Buffer[] = [];
            let mimeType: string = 'audio/L16;rate=24000';

            for await (const chunk of response) {
                if (!chunk.candidates || 
                    !chunk.candidates[0]?.content || 
                    !chunk.candidates[0]?.content?.parts) {
                    continue;
                }

                const inlineData = chunk.candidates[0].content.parts[0]?.inlineData;
                if (inlineData?.data) {
                    const buffer = Buffer.from(inlineData.data, 'base64');
                    audioBuffers.push(buffer);
                    
                    if (inlineData.mimeType) {
                        mimeType = inlineData.mimeType;
                    }
                }
            }

            if (audioBuffers.length === 0) {
                return { success: false, error: 'Nenhum áudio gerado' };
            }

            // Concatenar todos os buffers
            const combinedBuffer = Buffer.concat(audioBuffers);
            
            // Converter para WAV
            const wavBuffer = this.convertToWav(combinedBuffer, mimeType);

            console.log(`[GeminiVoice] Áudio gerado: ${wavBuffer.length} bytes`);

            // Salvar arquivo se outputPath fornecido
            if (outputPath) {
                await this.saveToFile(outputPath, wavBuffer);
                return { success: true, filePath: outputPath, buffer: wavBuffer };
            }

            return { success: true, buffer: wavBuffer };

        } catch (error) {
            const { userMessage, diagnostics } = this.formatGenerationError(error);
            console.error('[GeminiVoice] Erro ao gerar áudio:', diagnostics);
            return { 
                success: false, 
                error: userMessage
            };
        }
    }

    /**
     * Gera áudio e salva em um arquivo
     * @param text Texto para sintetizar
     * @param outputPath Caminho do arquivo de saída
     * @param voiceName Nome da voz (opcional)
     * @returns Resultado da operação
     */
    public async generateAndSave(
        text: string, 
        outputPath: string, 
        voiceName?: GeminiVoiceName
    ): Promise<TTSResult> {
        return this.generateSpeech({
            text,
            outputPath,
            voiceName,
        });
    }

    /**
     * Gera áudio e retorna como base64
     * @param text Texto para sintetizar
     * @param voiceName Nome da voz (opcional)
     * @returns String base64 do áudio WAV
     */
    public async generateBase64(
        text: string, 
        voiceName?: GeminiVoiceName
    ): Promise<{ success: boolean; base64?: string; error?: string }> {
        const result = await this.generateSpeech({ text, voiceName });
        
        if (result.success && result.buffer) {
            return { 
                success: true, 
                base64: result.buffer.toString('base64') 
            };
        }

        return { success: false, error: result.error };
    }

    /**
     * Lista todas as vozes disponíveis
     */
    public getAvailableVoices(): readonly string[] {
        return GEMINI_VOICES;
    }

    // ===========================
    // Métodos Privados
    // ===========================

    private async saveToFile(filePath: string, buffer: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            // Garantir que o diretório existe
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFile(filePath, buffer, (err) => {
                if (err) {
                    console.error(`[GeminiVoice] Erro ao salvar arquivo ${filePath}:`, err);
                    reject(err);
                    return;
                }
                console.log(`[GeminiVoice] Arquivo salvo: ${filePath}`);
                resolve();
            });
        });
    }

    private convertToWav(rawBuffer: Buffer, mimeType: string): Buffer {
        const options = this.parseMimeType(mimeType);
        const wavHeader = this.createWavHeader(rawBuffer.length, options);
        return Buffer.concat([wavHeader, rawBuffer]);
    }

    private parseMimeType(mimeType: string): WavConversionOptions {
        const [fileType, ...params] = mimeType.split(';').map(s => s.trim());
        const [_, format] = fileType.split('/');

        const options: WavConversionOptions = {
            numChannels: 1,
            sampleRate: 24000,
            bitsPerSample: 16,
        };

        // Extrair bits do formato (ex: L16 -> 16 bits)
        if (format && format.startsWith('L')) {
            const bits = parseInt(format.slice(1), 10);
            if (!isNaN(bits)) {
                options.bitsPerSample = bits;
            }
        }

        // Extrair sample rate dos parâmetros
        for (const param of params) {
            const [key, value] = param.split('=').map(s => s.trim());
            if (key === 'rate') {
                options.sampleRate = parseInt(value, 10);
            }
        }

        return options;
    }

    private createWavHeader(dataLength: number, options: WavConversionOptions): Buffer {
        const { numChannels, sampleRate, bitsPerSample } = options;

        // http://soundfile.sapp.org/doc/WaveFormat
        const byteRate = sampleRate * numChannels * bitsPerSample / 8;
        const blockAlign = numChannels * bitsPerSample / 8;
        const buffer = Buffer.alloc(44);

        buffer.write('RIFF', 0);                      // ChunkID
        buffer.writeUInt32LE(36 + dataLength, 4);     // ChunkSize
        buffer.write('WAVE', 8);                      // Format
        buffer.write('fmt ', 12);                     // Subchunk1ID
        buffer.writeUInt32LE(16, 16);                 // Subchunk1Size (PCM)
        buffer.writeUInt16LE(1, 20);                  // AudioFormat (1 = PCM)
        buffer.writeUInt16LE(numChannels, 22);        // NumChannels
        buffer.writeUInt32LE(sampleRate, 24);         // SampleRate
        buffer.writeUInt32LE(byteRate, 28);           // ByteRate
        buffer.writeUInt16LE(blockAlign, 32);         // BlockAlign
        buffer.writeUInt16LE(bitsPerSample, 34);      // BitsPerSample
        buffer.write('data', 36);                     // Subchunk2ID
        buffer.writeUInt32LE(dataLength, 40);         // Subchunk2Size

        return buffer;
    }

    private extractErrorMessage(error: unknown): string {
        if (error instanceof Error && error.message) {
            return error.message;
        }

        if (typeof error === 'string') {
            return error;
        }

        if (error && typeof error === 'object') {
            const candidate = error as any;
            const nestedCandidates = [
                candidate.message,
                candidate.details,
                candidate.error?.message,
                candidate.cause?.message,
                candidate.response?.data?.error?.message,
                candidate.response?.statusText,
            ];

            for (const value of nestedCandidates) {
                if (typeof value === 'string' && value.trim()) {
                    return value.trim();
                }
            }

            try {
                const serialized = JSON.stringify(error);
                if (serialized && serialized !== '{}' && serialized !== '[]') {
                    return serialized;
                }
            } catch {
                // Ignora erros de serialização e cai no fallback.
            }
        }

        return 'Erro desconhecido';
    }

    private formatGenerationError(error: unknown): { userMessage: string; diagnostics: string } {
        const rawMessage = this.extractErrorMessage(error);
        const normalized = rawMessage.toLowerCase();

        const isMissingDefaultCredentials =
            normalized.includes('could not load the default credentials') ||
            normalized.includes('default credentials');

        if (isMissingDefaultCredentials) {
            const hint = this.currentVertexCredentialsPath
                ? `Verifique se o arquivo está acessível: ${this.currentVertexCredentialsPath}.`
                : 'Configure um JSON de Service Account em Configurações > API e Modelos > Google Vertex AI, ou execute `gcloud auth application-default login`.';

            return {
                userMessage: `Falha de autenticação do Vertex AI: credenciais Google Cloud não encontradas. ${hint}`,
                diagnostics: rawMessage,
            };
        }

        return {
            userMessage: rawMessage || 'Erro desconhecido ao gerar áudio no Gemini TTS.',
            diagnostics: rawMessage || 'Erro desconhecido',
        };
    }
}

// Singleton instance para uso global
let geminiVoiceServiceInstance: GeminiVoiceService | null = null;

export function getGeminiVoiceService(): GeminiVoiceService {
    if (!geminiVoiceServiceInstance) {
        geminiVoiceServiceInstance = new GeminiVoiceService();
    }
    return geminiVoiceServiceInstance;
}

export function destroyGeminiVoiceService(): void {
    geminiVoiceServiceInstance = null;
    console.log('[GeminiVoice] Service destroyed');
}
