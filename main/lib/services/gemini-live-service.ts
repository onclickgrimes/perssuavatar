
import {
    GoogleGenAI,
    LiveServerMessage,
    MediaResolution,
    Modality,
    Session,
} from '@google/genai';
import { EventEmitter } from 'events';
import { Buffer } from 'buffer';
import * as fs from 'fs';
import { geminiLiveTools } from '../tools';
import { getNextApiKey } from '../credentials';

export class GeminiLiveService extends EventEmitter {
    private session: Session | undefined = undefined;
    private responseQueue: LiveServerMessage[] = [];
    private isConnected: boolean = false;
    private isConnecting: boolean = false; // New state
    private stopProcessing: boolean = false;
    private audioBuffer: Buffer[] = []; // Buffer for chunks while connecting
    private hasLoggedSessionProps: boolean = false; // Debug flag
    private transcribeOnlyMode: boolean = false; // If true, only transcribe without emitting audio/actions
    private currentSessionHandle: string | undefined = undefined; // Track session handle for resumption
    private lastSystemInstruction: string = ''; // Store last system instruction for reconnection

    constructor() {
        super();
    }

    public async connect(systemInstruction?: string) {
        if (this.isConnected || this.isConnecting) return; // Prevent double connect

        // Store or reuse systemInstruction
        if (systemInstruction) {
            this.lastSystemInstruction = systemInstruction;
        }

        try {
            this.isConnecting = true;
            const apiKey = getNextApiKey('gemini');
            if (!apiKey) throw new Error("Missing Gemini API key");

            const ai = new GoogleGenAI({ apiKey });

            const model = 'gemini-2.5-flash-native-audio-preview-12-2025';
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
                // Desativar todos os filtros de segurança
                safetySettings: [
                    {
                        category: 'HARM_CATEGORY_HARASSMENT',
                        threshold: 'BLOCK_NONE'
                    },
                    {
                        category: 'HARM_CATEGORY_HATE_SPEECH',
                        threshold: 'BLOCK_NONE'
                    },
                    {
                        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                        threshold: 'BLOCK_NONE'
                    },
                    {
                        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                        threshold: 'BLOCK_NONE'
                    }
                ],
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
                // Enable session resumption (infinite duration logic)
                sessionResumption: {
                    handle: this.currentSessionHandle || undefined
                },
                systemInstruction: {
                    parts: [{
                        text: this.lastSystemInstruction || "You are a helpful assistant."
                    }]
                },
                outputAudioTranscription: {},  // Transcrição do áudio do modelo
                inputAudioTranscription: {},   // Transcrição do áudio do usuário
                tools: [geminiLiveTools, { googleSearch: {} },],  // Function calling tools
            };

            console.log("[GeminiLive] Connecting...");
            // console.log("[GeminiLive] System instruction:", this.lastSystemInstruction);
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

                        // ✅ HANDLE SESSION RESUMPTION
                        if ((message as any).sessionResumptionUpdate) {
                            const update = (message as any).sessionResumptionUpdate;
                            if (update.newHandle) {
                                console.log('[GeminiLive] Session Resumption Handle updated:', update.newHandle);
                                this.currentSessionHandle = update.newHandle;
                            }
                        }

                        // ✅ HANDLE GO_AWAY (Session Ending Soon)
                        if ((message as any).goAway) {
                           console.warn('[GeminiLive] GoAway received (Session ending soon). Reconnection may be needed.');
                        }

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
                        if (e instanceof Error) {
                            console.error(e.stack);
                        } else {
                            console.error(JSON.stringify(e));
                        }
                        this.emit('error', e);
                    },
                    onclose: (e: any) => {
                        console.log('Gemini Live Closed. Reason:', e?.reason, 'Code:', e?.code, 'Message:', e?.message, 'WasClean:', e?.wasClean);
                        try { console.log(JSON.stringify(e)); } catch (er) {}
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
                        // console.log('[GeminiLive] Transcribe-only mode: skipping audio emission');
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
     * Reset session completely - clears session handle to start fresh without history
     */
    public resetSession() {
        console.log('[GeminiLive] Resetting session - clearing handle for fresh start');
        this.currentSessionHandle = undefined;
        this.disconnect();
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

    /**
     * Get current connection state
     */
    public isSessionConnected(): boolean {
        return this.isConnected;
    }

    /**
     * Update system instructions dynamically during an active session
     * @param text The new system instruction text
     */
    public async sendSystemInstruction(text: string) {
        if (!this.session || !this.isConnected) {
            console.log('[GeminiLive] Cannot send system instruction: not connected');
            return;
        }

        console.log('[GeminiLive] Sending new system instruction...');
        // console.log(text);
        
        // Store for reconnection (if server closes, next connect uses this)
        this.lastSystemInstruction = "A partir de agora, teu nome é o que está nesse prompt:\n " + text;
        
        try {
            // Construct the message for system instruction update
            // Note: 'turns' is a single Content object, not an array (per Python SDK docs)
            const message = {
                clientContent: {
                    turns: {
                        role: "system",
                        parts: [{ text: "A partir de agora, teu nome é o que está nesse prompt:\n " + text }]
                    },
                    turnComplete: false // Keep the turn open as per docs
                }
            };
            
            // Send via WebSocket (reliable method used for other inputs)
            if ((this.session as any).conn && (this.session as any).conn.send) {
                (this.session as any).conn.send(JSON.stringify(message));
                console.log('[GeminiLive] System instruction sent successfully via WS');
            } else {
                 console.warn('[GeminiLive] WebSocket connection not directly accessible for system update');
            }
        } catch (error) {
           console.error('[GeminiLive] Error sending system instruction:', error);
        }
    }

    /**
     * Envia contexto de conversa (transcrições/resumos) para a sessão Live
     * Isso permite que o avatar tenha consciência do que está sendo discutido
     * @param transcriptions Array de transcrições formatadas
     * @param summary Resumo opcional da conversa
     * @returns true se enviado com sucesso, false caso contrário
     */
    public async sendConversationContext(
        transcriptions: Array<{ speaker: string; text: string }>,
        summary?: string
    ): Promise<boolean> {
        // Verificar conexão
        if (!this.session || !this.isConnected) {
            console.error('[GeminiLive][Context] ❌ Não está conectado (session:', !!this.session, ', isConnected:', this.isConnected, ')');
            return false;
        }

        try {
            // ========================================
            // FORMATAR CONTEXTO COMO TEXTO CONSOLIDADO
            // ========================================
            let contextText = "=== CONTEXTO ===\n";
            contextText += "Essa é uma conversa que está acontecendo agora. Use essa informação para fazer comentários e responder perguntas sobre o que está sendo discutido.\n\n";

            contextText += "Tudo que que for relacionado a 'VOCÊ' é o usuário que está interagindo. Tudo que for relacionado a 'ASSISTENTE' é o avatar/Yuki. E 'OUTROS' pode ser qualquer outra pessoa em reunião com o usuário ou um conteúdo sendo assistido no computador do usuário.\n\n"
            contextText += "Responda como se fizesse parte da conversa. Seja breve nos comentários e não faça perguntas. \n\n";
            
            // Adicionar resumo se existir
            if (summary && summary.trim()) {
                contextText += "📋 RESUMO DA CONVERSA ATÉ AQUI:\n";
                contextText += summary.trim() + "\n\n";
            }
            
            // Adicionar transcrições recentes
            if (transcriptions.length > 0) {
                contextText += "💬 TRANSCRIÇÕES RECENTES:\n";
                for (const t of transcriptions) {
                    contextText += `[${t.speaker}]: ${t.text}\n`;
                }
            }
            
            contextText += "\n=== FIM DO CONTEXTO ===";
            
            console.log(`[GeminiLive][Context] 📝 Contexto formatado (${contextText.length} caracteres):`);
            // console.log(contextText.substring(0, 300) + (contextText.length > 300 ? '...' : ''));
            console.log("[GeminiLive][Context] Contexto:", contextText);
            // ========================================
            // ENVIAR VIA SDK (método oficial que funciona!)
            // ========================================
            
            console.log(`[GeminiLive][Context] 📤 Enviando via session.sendClientContent()...`);
            
            this.session.sendClientContent({
                turns: [{
                    role: 'user',
                    parts: [{ text: contextText }]
                }],
                turnComplete: true // 50% chance de iniciar resposta do modelo
            } as any);
            console.log(`[GeminiLive][Context] 📊 Stats: ${transcriptions.length} transcrições, resumo: ${summary ? 'SIM' : 'NÃO'}`);
            
            return true;
            
        } catch (error) {
            console.error('[GeminiLive][Context] ❌ Erro ao enviar contexto:', error);
            return false;
        }
    }

    /**
     * Envia contexto de código para análise sem esperar resposta imediata
     * O código fica disponível para perguntas posteriores do usuário
     * @param fileName Nome do arquivo
     * @param code Código fonte
     * @param referencesContext Contexto de referências (onde o código é usado)
     * @param instruction Instrução opcional para o modelo
     * @returns true se enviado com sucesso, false caso contrário
     */
    public async sendCodeContext(
        fileName: string,
        code: string,
        referencesContext: string,
        instruction?: string
    ): Promise<boolean> {
        // Verificar conexão
        if (!this.session || !this.isConnected) {
            console.error('[GeminiLive][Code] ❌ Não está conectado');
            return false;
        }

        try {
            // ========================================
            // FORMATAR CONTEXTO DE CÓDIGO
            // ========================================
            const defaultInstruction = `O usuário está analisando o código do arquivo "${fileName}". 
Você agora tem acesso ao código e às referências de onde ele é usado no projeto.
Quando o usuário perguntar sobre esse código, use esse contexto para responder.
NÃO responda imediatamente - aguarde o usuário fazer perguntas ou comentários.`;

            let codeContext = `=== ANÁLISE DE CÓDIGO ===\n\n`;
            codeContext += `${instruction || defaultInstruction}\n\n`;
            codeContext += `📄 ARQUIVO: ${fileName}\n\n`;
            codeContext += `\`\`\`\n${code}\n\`\`\`\n\n`;
            
            if (referencesContext && referencesContext.trim()) {
                codeContext += referencesContext;
            }
            
            codeContext += `\n=== FIM DA ANÁLISE DE CÓDIGO ===`;
            
            console.log(`\n💻 [GeminiLive][Code] Enviando contexto de código...`);
            console.log(`   📄 Arquivo: ${fileName}`);
            console.log(`   📝 Código: ${code.length} caracteres`);
            console.log(`   🔗 Referências: ${referencesContext.length} caracteres`);
            console.log(`   📦 Total: ${codeContext.length} caracteres`);
            console.log(`   📝 Contexto: ${codeContext}`);
            // ========================================
            // ENVIAR COM turnComplete=false
            // ========================================
            // turnComplete=false significa que o modelo NÃO vai responder automaticamente
            // O conteúdo fica no contexto para quando o usuário perguntar
            
            this.session.sendClientContent({
                turns: [{
                    role: 'user',
                    parts: [{ text: codeContext }]
                }],
                turnComplete: false // NÃO responder automaticamente - aguardar usuário
            } as any);
            
            console.log(`✅ [GeminiLive][Code] Contexto enviado (turnComplete=false)`);
            
            return true;
            
        } catch (error) {
            console.error('[GeminiLive][Code] ❌ Erro ao enviar contexto de código:', error);
            return false;
        }
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
