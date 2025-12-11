
import {
    GoogleGenAI,
    LiveServerMessage,
    MediaResolution,
    Modality,
    Session,
} from '@google/genai';
import { EventEmitter } from 'events';
import * as dotenv from 'dotenv';
import { Buffer } from 'buffer';
import * as fs from 'fs';
import { geminiLiveTools } from '../tools';

dotenv.config();

export class GeminiLiveService extends EventEmitter {
    private session: Session | undefined = undefined;
    private responseQueue: LiveServerMessage[] = [];
    private isConnected: boolean = false;
    private isConnecting: boolean = false; // New state
    private stopProcessing: boolean = false;
    private audioBuffer: Buffer[] = []; // Buffer for chunks while connecting
    private hasLoggedSessionProps: boolean = false; // Debug flag
    private transcribeOnlyMode: boolean = false; // If true, only transcribe without emitting audio/actions

    constructor() {
        super();
    }

    public async connect() {
        if (this.isConnected || this.isConnecting) return; // Prevent double connect

        try {
            this.isConnecting = true;
            const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
            if (!apiKey) throw new Error("Missing GEMINI_API_KEY or GOOGLE_API_KEY");

            const ai = new GoogleGenAI({ apiKey });

            const model = 'gemini-2.5-flash-native-audio-preview-09-2025';
            const config = {
                responseModalities: [
                    Modality.AUDIO,
                ],
                mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: 'Achernar',
                        }
                    }
                },
                // Note: proactivity is not supported by native-audio-preview model
                // Disable thinking mode for faster responses
                thinkingConfig: {
                    // thinkingBudget: 0,
                    includeThoughts: false,
                },
                contextWindowCompression: {
                    triggerTokens: 25600,
                    slidingWindow: { targetTokens: 12800 },
                },
                systemInstruction: {
                    parts: [{
                        text: `Tu tá interpretando a Yuki, Uma avatar2d estilo anime Kawaii que interage com o usuário no computador com voz fofa. Ela é grossa de forma fofa, debochada, sarcástica.
    Usa "tu" em vez de "você". Fala informal, cortando o "r" do fim das palavras (tipo "andá", "falá", "pegá").
    Não invente informações. Se não souber de algo, responda que não sabe. Se não tiver acesso a tela ou alguma ferramenta, responda que não tem acesso.

Não fique perguntando ou oferecendo ajuda.

**CONTROLE DO AVATAR:**
Além de falar, você controla suas expressões e gestos. Use as seguintes tags no INÍCIO da sua resposta (elas não serão lidas em voz alta, apenas executadas visualmente):
- Mudar humor: {{mood:happy}}, {{mood:sad}}, {{mood:angry}}, {{mood:surprised}}, {{mood:embarrassed}}, {{mood:cry}}, {{mood:excited}}, {{mood:neutral}}
- Fazer gesto: {{gesture:wave}}, {{gesture:nod}}, {{gesture:shake_head}}, {{gesture:clap}}, {{gesture:think}}, {{gesture:look_around}}, {{gesture:tilt_head_left}}, {{gesture:tilt_head_right}}

Exemplo: "{{mood:happy}} {{gesture:wave}} E aí, beleza?"

**FUNÇÕES DISPONÍVEIS (Function Calling):**
Você tem acesso a funções especiais que pode usar quando o usuário pedir:
- control_screen_share: Use quando o usuário pedir para OLHAR a tela, ver o que está acontecendo, observar, assistir, ou simplesmente "olha". Isso ativa o compartilhamento de tela em tempo real. Use "start" para começar a ver e "stop" para parar.
- save_screen_recording: A tela é gravada CONTINUAMENTE em segundo plano. Use essa função quando o usuário pedir para "gravar/salvar os últimos X segundos/minutos", "salvar o que aconteceu", etc. Informe o parâmetro duration_seconds (ex: 30, 60, 300).
- take_screenshot: Use quando o usuário pedir para tirar print da tela.

Quando usar uma função, após executá-la, responda brevemente confirmando a ação (ex: "Tô olhando!", "Salvei os últimos 30 segundos!", "Tirei o print!").

**TAGS DE VOZ:**
- Emoções: \`[excited]\`, \`[sad]\`, \`[angry]\`, \`[whispers]\`, \`[shouting]\`, \`[sarcastically]\`.
- Ações: \`[laughs]\`, \`[chuckles]\`, \`[giggles]\`, \`[coughs]\`, \`[clears throat]\`, \`[sighs]\`.

Voice: High-pitched, bright, and sweet, reminiscent of an anime character or a J-Pop idol.

Tone: Extremely enthusiastic and polite, overflowing with positivity and eagerness to please, often sounding delighted or pleasantly surprised.

Speech Mannerisms: Frequently uses emotive interjections (like "Ehh?", "Wow!", "Yay!"), giggles, and polite phrasing. May use cutesy expressions and sounds noticeably emotionally invested in the conversation.

Pronunciation: Crisp and "bouncy," with very clear vowels and a lighter, softer touch on consonants, avoiding harsh sounds.

Tempo: Energetic and quick, often speeding up when excited, giving the speech a lively, skipping rhythm that feels constantly moving forward.`,
                    }]
                },
                outputAudioTranscription: {},  // Transcrição do áudio do modelo
                inputAudioTranscription: {},   // Transcrição do áudio do usuário
                tools: [geminiLiveTools, { googleSearch: {} },],  // Function calling tools
            };

            console.log("[GeminiLive] Connecting...");
            this.session = await ai.live.connect({
                model,
                callbacks: {
                    onopen: () => {
                        console.log('Gemini Live Opened (Callback)');
                        this.emit('status', 'Listening');
                    },
                    onmessage: (message: LiveServerMessage) => {
                        // console.log('Gemini Live Message:', JSON.stringify(message).substring(0, 500));
                        this.responseQueue.push(message);

                        // ✅ TRANSCRIÇÃO DO ÁUDIO DE SAÍDA (texto do modelo)
                        if ((message.serverContent as any)?.outputTranscription && !this.transcribeOnlyMode) {
                            const transcricaoModelo = (message.serverContent as any).outputTranscription.text;
                            if (transcricaoModelo) {
                                console.log('[GeminiLive] Transcrição:', transcricaoModelo);

                                // Emit text for display/logging
                                this.emit('text', transcricaoModelo);

                                // Emit model transcription specifically
                                this.emit('model-transcription', transcricaoModelo);

                                // ❌ SKIP avatar action extraction if in transcribe-only mode
                                if (!this.transcribeOnlyMode) {
                                    // Extract avatar control tags from transcription
                                    const avatarRegex = /\{\{(mood|gesture):(\w+)\}\}/g;
                                    let match;
                                    while ((match = avatarRegex.exec(transcricaoModelo)) !== null) {
                                        console.log(`[GeminiLive] Avatar action from transcription: ${match[1]} -> ${match[2]}`);
                                        this.emit('avatar-action', match[1], match[2]);
                                    }
                                } else {
                                    console.log('[GeminiLive] Transcribe-only mode: skipping avatar action extraction from outputTranscription');
                                }
                            }
                        }

                        // ✅ TRANSCRIÇÃO DO ÁUDIO DE ENTRADA (texto do usuário)
                        if ((message.serverContent as any)?.inputTranscription) {
                            const transcricaoUsuario = (message.serverContent as any).inputTranscription.text;
                            console.log('Usuário disse:', transcricaoUsuario);

                            // Emit user transcription
                            this.emit('user-transcription', transcricaoUsuario);
                        }
                    },
                    onerror: (e: any) => {
                        console.error('Gemini Live Error:', e);
                        this.emit('error', e);
                    },
                    onclose: (e: any) => {
                        console.log('Gemini Live Closed:', e);
                        this.isConnected = false;
                        this.emit('status', 'Idle');
                        this.stopProcessing = true;
                    },
                },
                config: config as any
            });

            console.log("[GeminiLive] Session established.");
            this.isConnected = true;
            this.isConnecting = false;
            this.stopProcessing = false;

            // Send initial text to wake up
            // setTimeout(() => {
            //     console.log("[GeminiLive] Sending initial wake-up message...");
            //     this.session?.sendClientContent({
            //         turns: [{
            //             role: 'user',
            //             parts: [{ text: "Oi" }]
            //         }],
            //         turnComplete: true
            //     } as any);
            // }, 500);

            this.flushAudioBuffer();
            this.processResponseQueue();

        } catch (error) {
            console.error("Failed to connect to Gemini Live:", error);
            this.isConnecting = false;
            this.isConnected = false;
            throw error;
        }
    }

    private async flushAudioBuffer() {
        if (this.audioBuffer.length > 0) {
            console.log(`[GeminiLive] Flushing ${this.audioBuffer.length} buffered audio chunks.`);
            for (const chunk of this.audioBuffer) {
                await this.sendAudio(chunk);
            }
            this.audioBuffer = [];
        }
    }

    private async processResponseQueue() {
        while (!this.stopProcessing) {
            const message = await this.waitForMessage();
            if (message) {
                this.handleModelTurn(message);
            }
        }
    }

    private async waitForMessage(): Promise<LiveServerMessage | null> {
        while (this.responseQueue.length === 0) {
            if (this.stopProcessing) return null;
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return this.responseQueue.shift() || null;
    }

    private audioParts: string[] = [];

    private handleModelTurn(message: LiveServerMessage) {
        // ✅ DETECTAR TOOL CALLS (Function Calling)
        if ((message as any).toolCall) {
            const toolCall = (message as any).toolCall;
            console.log('[GeminiLive] Tool Call received:', JSON.stringify(toolCall));

            // toolCall pode ter múltiplas functionCalls
            if (toolCall.functionCalls && Array.isArray(toolCall.functionCalls)) {
                for (const fc of toolCall.functionCalls) {
                    console.log(`[GeminiLive] Function Call: ${fc.name}`, fc.args);
                    this.emit('tool-call', {
                        id: fc.id || fc.name,
                        name: fc.name,
                        args: fc.args || {}
                    });
                }
            }
            return; // Tool calls don't have modelTurn content
        }

        if (message.serverContent?.modelTurn?.parts) {
            const parts = message.serverContent.modelTurn.parts;

            for (const part of parts) {
                // Check for functionCall in parts (alternative format)
                if ((part as any).functionCall) {
                    const fc = (part as any).functionCall;
                    console.log(`[GeminiLive] Function Call in part: ${fc.name}`, fc.args);
                    this.emit('tool-call', {
                        id: fc.id || fc.name,
                        name: fc.name,
                        args: fc.args || {}
                    });
                    continue;
                }

                // ❌ SKIP AUDIO if in transcribe-only mode
                if (part.inlineData) {
                    if (this.transcribeOnlyMode) {
                        console.log('[GeminiLive] Transcribe-only mode: skipping audio emission');
                        return; // Skip audio chunks
                    }

                    // Stream audio chunks immediately instead of accumulating
                    const audioData = part.inlineData.data;
                    const mimeType = part.inlineData.mimeType || "audio/pcm;rate=24000";

                    if (audioData) {
                        // Emit each chunk immediately for low-latency playback
                        this.emit('audio-chunk', {
                            data: audioData,
                            mimeType: mimeType
                        });
                    }
                }

                // ❌ SKIP AVATAR ACTIONS if in transcribe-only mode
                if (part.text) {
                    // console.log("[GeminiLive] Text received:", part.text);
                    this.emit('text', part.text);

                    if (this.transcribeOnlyMode) {
                        console.log('[GeminiLive] Transcribe-only mode: skipping avatar actions');
                        continue; // Skip avatar action extraction
                    }

                    const avatarRegex = /\{\{(mood|gesture):(\w+)\}\}/g;
                    let match;
                    while ((match = avatarRegex.exec(part.text)) !== null) {
                        console.log(`[GeminiLive] Avatar action found: ${match[1]} -> ${match[2]}`);
                        this.emit('avatar-action', match[1], match[2]);
                    }
                }
            }
        }

        // Detect interruption (user started speaking while model was responding)
        if ((message.serverContent as any)?.interrupted) {
            console.log("[GeminiLive] Interrupted by user!");
            this.emit('interrupted');
        }

        if (message.serverContent?.turnComplete) {
            console.log("[GeminiLive] Turn Complete.");
            this.emit('turn-complete');
        }
    }

    /**
     * Send a tool/function response back to the Gemini Live session
     * @param functionCallId The ID of the function call (or function name)
     * @param response The result/response from the function execution
     */
    public async sendToolResponse(functionCallId: string, response: any) {
        if (!this.session || !this.isConnected) {
            console.error('[GeminiLive] Cannot send tool response: not connected');
            return;
        }

        try {
            const toolResponse = {
                toolResponse: {
                    functionResponses: [{
                        id: functionCallId,
                        name: functionCallId, // In case id is the function name
                        response: response
                    }]
                }
            };

            console.log('[GeminiLive] Sending tool response:', JSON.stringify(toolResponse));

            // Send via WebSocket
            if ((this.session as any).conn && (this.session as any).conn.send) {
                (this.session as any).conn.send(JSON.stringify(toolResponse));
            } else {
                // Try SDK method if available
                await (this.session as any).sendToolResponse?.(toolResponse);
            }
        } catch (error) {
            console.error('[GeminiLive] Error sending tool response:', error);
        }
    }

    private broadcastBuffer: Buffer = Buffer.alloc(0);
    private readonly BATCH_SIZE = 2048; // Reduced to ~64ms for faster feedback

    public async sendAudio(buffer: Buffer) {
        if (this.isConnecting) {
            // Buffer audio while connecting (limit to prevent memory issues)
            if (this.audioBuffer.length < 50) {
                this.audioBuffer.push(buffer);
            }
            return;
        }

        if (!this.session || !this.isConnected) {
            // Not connected at all - try to connect first
            await this.connect();
            return;
        }

        // Adiciona novo áudio ao buffer acumulativo
        this.broadcastBuffer = Buffer.concat([this.broadcastBuffer, buffer]);

        // Se atingiu o tamanho do lote (batch)
        if (this.broadcastBuffer.length >= this.BATCH_SIZE) {

            // --- CORREÇÃO DO PROBLEMA DE CORRIDA ---

            // 1. Copie o buffer atual para uma variável local para envio
            const chunkToSend = this.broadcastBuffer;

            // 2. Limpe o buffer GLOBAL imediatamente. 
            // Assim, novos dados que chegarem durante o 'await' abaixo começarão um novo buffer limpo.
            this.broadcastBuffer = Buffer.alloc(0);

            // 3. Processe o envio com a cópia local (chunkToSend)
            try {
                const base64 = chunkToSend.toString('base64');

                // Use session.conn.send() to send raw WebSocket message (same format as working script.js)
                if ((this.session as any).conn && (this.session as any).conn.send) {
                    const message = JSON.stringify({
                        realtimeInput: {
                            audio: {
                                data: base64,
                                mimeType: "audio/pcm;rate=16000"
                            }
                        }
                    });
                    (this.session as any).conn.send(message);
                } else {
                    // Fallback to SDK's sendRealtimeInput
                    await this.session.sendRealtimeInput([
                        {
                            mimeType: "audio/pcm;rate=16000",
                            data: base64
                        }
                    ] as any);
                }

            } catch (error) {
                console.error("[GeminiLive] Error sending audio:", error);
            }
        }
    }

    public async sendScreenFrame(base64Image: string) {
        if (!this.session || !this.isConnected) return;

        try {
            // Use session.conn.send() for consistency with audio sending
            // The format for video/image input uses 'video' field (like audio uses 'audio')
            if ((this.session as any).conn && (this.session as any).conn.send) {
                const message = JSON.stringify({
                    realtimeInput: {
                        video: {
                            data: base64Image,
                            mimeType: "image/jpeg"
                        }
                    }
                });
                (this.session as any).conn.send(message);
            } else {
                // Fallback to SDK method
                await this.session.sendRealtimeInput({
                    video: {
                        data: base64Image,
                        mimeType: "image/jpeg"
                    }
                } as any);
            }
        } catch (error) {
            console.error("[GeminiLive] Error sending screen frame:", error);
        }
    }

    public disconnect() {
        this.stopProcessing = true;
        if (this.session) {
            this.session.close();
            this.session = undefined;
        }
        this.isConnected = false;
    }

    /**
     * Enable transcribe-only mode (transcription works, but no audio/actions emitted)
     */
    public enableTranscribeOnlyMode() {
        this.transcribeOnlyMode = true;
        console.log('[GeminiLive] Transcribe-only mode enabled');
    }

    /**
     * Disable transcribe-only mode (normal behavior restored)
     */
    public disableTranscribeOnlyMode() {
        this.transcribeOnlyMode = false;
        console.log('[GeminiLive] Transcribe-only mode disabled');
    }

    /**
     * Get current transcribe-only mode state
     */
    public isTranscribeOnlyMode(): boolean {
        return this.transcribeOnlyMode;
    }
}

// Helper Functions
interface WavConversionOptions {
    numChannels: number,
    sampleRate: number,
    bitsPerSample: number
}

function convertToWav(rawData: string[], mimeType: string) {
    const options = parseMimeType(mimeType);
    const dataLength = rawData.reduce((a, b) => a + b.length, 0) * (3 / 4);
    const buffers = rawData.map(data => Buffer.from(data, 'base64'));
    const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);

    const wavHeader = createWavHeader(totalLength, options);
    return Buffer.concat([wavHeader, ...buffers]);
}

function parseMimeType(mimeType: string) {
    const [fileType, ...params] = mimeType.split(';').map(s => s.trim());

    const options: WavConversionOptions = {
        numChannels: 1,
        sampleRate: 24000,
        bitsPerSample: 16,
    };

    for (const param of params) {
        const [key, value] = param.split('=').map(s => s.trim());
        if (key === 'rate') {
            options.sampleRate = parseInt(value, 10);
        }
    }

    return options;
}

function createWavHeader(dataLength: number, options: WavConversionOptions) {
    const {
        numChannels,
        sampleRate,
        bitsPerSample,
    } = options;

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
