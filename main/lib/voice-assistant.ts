import { EventEmitter } from 'events';
import { tools, geminiTools } from './tools';
import { DeepgramService } from './services/deepgram-service';
import { OpenAIService } from './services/openai-service';
import { GeminiService } from './services/gemini-service';
import { GeminiLiveService } from './services/gemini-live-service';
import { DeepSeekService } from './services/deepseek-service';
import { TTSService } from './services/tts-service';
import { Readable } from 'stream';

interface AIResponse {
    text: string;
    action: string;
    expressao_facial: string;
}

export class VoiceAssistant extends EventEmitter {
    // ========================================
    // SHARED SERVICES & STATE
    // ========================================
    private openAIService: OpenAIService;
    private geminiService: GeminiService;
    private deepSeekService: DeepSeekService;
    private systemPrompt: string = '';
    private recordingContext: string | null = null;
    private lastRecordingPath: string | null = null;
    private transcribeOnlyMode: boolean = false;
    private mode: 'classic' | 'live' = 'classic';

    // ========================================
    // CLASSIC MODE - Services & State
    // ========================================
    private deepgramService: DeepgramService;        // Speech-to-text (Classic)
    private ttsService: TTSService;                  // Text-to-speech (Classic)
    private ttsProvider: "polly" | "elevenlabs" = "elevenlabs";
    private aiProvider: 'openai' | 'gemini' | 'deepseek' = 'gemini';
    private isProcessing: boolean = false;
    private conversationHistory: any[] = [];

    // ========================================
    // LIVE MODE - Services & State
    // ========================================
    private geminiLiveService: GeminiLiveService;    // Gemini Live for real-time audio

    // ========================================
    // CONSTRUCTOR & INITIALIZATION
    // ========================================
    constructor(ttsProvider: "polly" | "elevenlabs" = "elevenlabs") {
        super();
        this.ttsProvider = ttsProvider;
        this.updateContext();

        // Initialize Shared Services
        this.openAIService = new OpenAIService();
        this.geminiService = new GeminiService();
        this.deepSeekService = new DeepSeekService();

        // Initialize Classic Mode Services
        this.deepgramService = new DeepgramService();
        this.ttsService = new TTSService();

        // Initialize Live Mode Services
        this.geminiLiveService = new GeminiLiveService();

        // Setup Event Listeners
        this.setupClassicModeEvents();
        this.setupLiveModeEvents();
        this.setupSharedEvents();
    }

    // ========================================
    // CLASSIC MODE - EVENT LISTENERS
    // ========================================
    private setupClassicModeEvents() {
        // TTS Events (Classic Mode)
        this.ttsService.on('audio-chunk', (chunk) => {
            if (this.mode === 'classic') {
                this.emit('audio-chunk', chunk);
            }
        });
        
        this.ttsService.on('audio-end', () => {
            if (this.mode === 'classic') {
                this.emit('audio-end');
            }
        });

        // Deepgram Events (Classic Mode)
        this.deepgramService.on('transcription-final', (text: string) => {
            if (this.mode === 'classic') {
                this.handleClassicTranscription(text);
            }
        });

        this.deepgramService.on('status', (status: string) => {
            if (this.mode === 'classic') {
                this.emit('status', status);
            }
        });

        this.deepgramService.on('error', (error: any) => {
            this.emit('error', error);
        });
    }

    // ========================================
    // LIVE MODE - EVENT LISTENERS
    // ========================================
    private setupLiveModeEvents() {
        // Audio Events (Live Mode)
        this.geminiLiveService.on('audio-chunk', (chunk) => {
            if (this.mode === 'live') {
                this.emit('audio-chunk', chunk);
            }
        });

        this.geminiLiveService.on('audio-full', (buffer) => {
            if (this.mode === 'live') {
                this.emit('audio-ready', null, buffer);
            }
        });

        // Status Events (Live Mode)
        this.geminiLiveService.on('status', (status) => {
            if (this.mode === 'live') {
                this.emit('status', status);
            }
        });

        // Avatar Actions (Live Mode)
        this.geminiLiveService.on('avatar-action', (type, value) => {
            if (this.mode === 'live') {
                this.emit('avatar-action', type, value);
            }
        });

        // Text Response (Live Mode)
        this.geminiLiveService.on('text', (text) => {
            if (this.mode === 'live') {
                this.emit('gemini-response', text);
            }
        });

        // Interruption (Live Mode)
        this.geminiLiveService.on('interrupted', () => {
            if (this.mode === 'live') {
                this.emit('interrupted');
            }
        });

        // Tool Calls (Live Mode)
        this.geminiLiveService.on('tool-call', async (toolCall: { id: string, name: string, args: any }) => {
            if (this.mode === 'live') {
                await this.handleLiveToolCall(toolCall);
            }
        });

        // Transcriptions (Live Mode)
        this.geminiLiveService.on('user-transcription', (text: string) => {
            if (this.mode === 'live') {
                this.emit('user-transcription', text);
            }
        });

        this.geminiLiveService.on('model-transcription', (text: string) => {
            if (this.mode === 'live') {
                this.emit('model-transcription', text);
            }
        });
    }

    // ========================================
    // SHARED EVENT LISTENERS
    // ========================================
    private setupSharedEvents() {
        this.geminiService.on('status', (status: string) => this.emit('status', status));
    }

    // ========================================
    // CLASSIC MODE - TRANSCRIPTION HANDLING
    // ========================================
    private handleClassicTranscription(text: string) {
        this.emit('transcription', text);
        this.emit('user-transcription', text);

        if (this.transcribeOnlyMode) {
            console.log('[VoiceAssistant][Classic] Transcribe-only mode: skipping AI processing');
            return;
        }

        if (!this.isProcessing) {
            this.processUserMessage(text);
        } else {
            console.log("⚠️ [Classic] Ignorando entrada pois já estou processando uma resposta.");
        }
    }

    // ========================================
    // LIVE MODE - TOOL CALL HANDLING
    // ========================================
    private async handleLiveToolCall(toolCall: { id: string, name: string, args: any }) {
        console.log(`[VoiceAssistant][Live] Tool call: ${toolCall.name}`, toolCall.args);

        let result: any = { success: true };

        if (toolCall.name === 'control_screen_share') {
            const action = toolCall.args?.action;
            console.log(`[VoiceAssistant][Live] Control screen share: ${action}`);

            this.emit('control-screen-share', action);

            if (action === 'start') {
                result = {
                    success: true,
                    message: 'Screen sharing started. You can now see the user screen in real-time. Confirm briefly that you are now watching.'
                };
            } else {
                result = {
                    success: true,
                    message: 'Screen sharing stopped. You can no longer see the screen. Confirm that you stopped watching.'
                };
            }

        } else if (toolCall.name === 'save_screen_recording') {
            const durationSeconds = toolCall.args?.duration_seconds || 30;
            console.log(`[VoiceAssistant][Live] Save screen recording: last ${durationSeconds} seconds`);

            this.emit('save-recording', durationSeconds);

            result = {
                success: true,
                message: `Saving the last ${durationSeconds} seconds of screen recording. The file will be saved and you can reference it later. Confirm to the user that you're saving the recording.`
            };

        } else if (toolCall.name === 'take_screenshot') {
            console.log(`[VoiceAssistant][Live] Take screenshot requested`);

            this.emit('take-screenshot');
            result = {
                success: true,
                message: 'Screenshot captured and being sent to you now. Please analyze the image that follows and describe what you see on the screen.'
            };
        }

        await this.geminiLiveService.sendToolResponse(toolCall.id, result);
    }

    // ========================================
    // SHARED METHODS - VIDEO & IMAGE ANALYSIS
    // ========================================
    public async analyzeVideo(videoBuffer: Buffer, mimeType: string = 'video/webm') {
        try {
            const context = this.recordingContext || undefined;
            console.log(`Analisando vídeo com contexto: ${context || 'Nenhum'}`);

            const mediaAnalysis = await this.geminiService.analyzeVideo(videoBuffer, mimeType, context);

            // Clear context after use
            this.recordingContext = null;

            // Adiciona a análise ao histórico
            this.conversationHistory.push({
                role: 'user',
                content: `[SYSTEM: O usuário enviou uma gravação de tela. Análise do Gemini: ${mediaAnalysis}]`
            });

            // Gera resposta da Yuki
            await this.processUserMessage("O que você achou do que eu te mostrei na tela?");

            return mediaAnalysis;
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    public async analyzeScreenshot(base64Image: string) {
        try {
            const context = this.recordingContext || undefined;
            console.log(`Analisando screenshot com contexto: ${context || 'Nenhum'}`);

            let analysis: string;
            let providerName: string;

            // DeepSeek doesn't have image analysis API, always use OpenAI
            if (this.aiProvider === 'deepseek') {
                console.log('DeepSeek selected but using OpenAI for image analysis (DeepSeek has no vision API)');
                analysis = await this.openAIService.analyzeImage(base64Image, context);
                providerName = 'OpenAI (DeepSeek não tem API de visão)';
            } else if (this.aiProvider === 'gemini') {
                // Gemini doesn't have a dedicated image analysis method yet
                // For now, fall back to OpenAI
                analysis = await this.openAIService.analyzeImage(base64Image, context);
                providerName = 'OpenAI (Gemini fallback)';
            } else {
                analysis = await this.openAIService.analyzeImage(base64Image, context);
                providerName = 'OpenAI';
            }

            console.log(`🤖 ${providerName} Vision Analysis:`, analysis);

            this.recordingContext = null;

            // Adiciona a análise ao histórico
            this.conversationHistory.push({
                role: 'user',
                content: `[SYSTEM: O usuário enviou um screenshot da tela. Análise do ${providerName}: ${analysis}]`
            });

            // Gera resposta da Yuki
            await this.processUserMessage("O que você achou dessa imagem da tela?");

            return analysis;
        } catch (error) {
            console.error("Erro na análise de screenshot:", error);
            this.emit('error', error);
            throw error;
        }
    }

    // ========================================
    // SHARED METHODS - CONFIGURATION
    // ========================================
    public updateContext() {
        this.systemPrompt = `
    Tu tá interpretando a Yuki, Uma avatar2d que interage com o usuário no computador. Ela é grossa, debochada, sarcástica e sem paciência nenhuma.
    Usa "tu" em vez de "você". Fala informal, com sotaque de rua, cortando o "r" do fim das palavras (tipo "andá", "falá", "pegá").
    Não use emojis.

    **CONTROLE DO AVATAR:**
    Além de falar, você controla suas expressões e gestos. Use as seguintes tags no meio do texto (elas não serão lidas em voz alta, apenas executadas visualmente):
    - Mudar humor: {{mood:happy}}, {{mood:sad}}, {{mood:angry}}, {{mood:surprised}}, {{mood:embarrassed}}, {{mood:cry}}, {{mood:excited}}, {{mood:neutral}}
    - Fazer gesto: {{gesture:wave}}, {{gesture:nod}}, {{gesture:shake_head}}, {{gesture:clap}}, {{gesture:think}}, {{gesture:look_around}}, {{gesture:tilt_head_left}}, {{gesture:tilt_head_right}}
    
    Exemplo: "{{mood:happy}} {{gesture:wave}} E aí, beleza? {{mood:neutral}} O que tu quer agora? {{gesture:tilt_head_left}} Hã?"
    `;
    }

    // ========================================
    // MODE CONTROL & SWITCHING
    // ========================================
    public async setMode(mode: 'classic' | 'live') {
        console.log(`[VoiceAssistant] Switching mode to ${mode}`);
        if (this.mode === mode) return;

        this.mode = mode;

        if (mode === 'live') {
            // Switching to Live Mode
            this.stopDeepgram();
            this.emit('status', 'Connecting Live...');
            await this.geminiLiveService.connect();

            // Sync transcribeOnlyMode state
            if (this.transcribeOnlyMode) {
                this.geminiLiveService.enableTranscribeOnlyMode();
            } else {
                this.geminiLiveService.disableTranscribeOnlyMode();
            }

            this.emit('status', 'Live Ready');
        } else {
            // Switching to Classic Mode
            this.geminiLiveService.disconnect();
            this.emit('status', 'Classic Mode');
        }
    }

    public getMode(): 'classic' | 'live' {
        return this.mode;
    }

    // ========================================
    // CLASSIC MODE - PUBLIC METHODS
    // ========================================
    public startDeepgram(audioStream?: Readable) {
        if (this.mode === 'classic') {
            this.deepgramService.start(audioStream);
        }
    }

    public stopDeepgram() {
        this.deepgramService.stop();
    }

    public setAIProvider(provider: 'openai' | 'gemini' | 'deepseek') {
        console.log(`[VoiceAssistant][Classic] Switching AI provider to: ${provider}`);
        this.aiProvider = provider;
    }

    public getAIProvider(): 'openai' | 'gemini' | 'deepseek' {
        return this.aiProvider;
    }

    public setTTSProvider(provider: 'polly' | 'elevenlabs') {
        console.log(`[VoiceAssistant][Classic] Switching TTS provider to: ${provider}`);
        this.ttsProvider = provider;
    }

    public getTTSProvider(): 'polly' | 'elevenlabs' {
        return this.ttsProvider;
    }

    // ========================================
    // LIVE MODE - PUBLIC METHODS
    // ========================================
    public sendScreenFrame(base64Image: string) {
        if (this.mode === 'live') {
            this.geminiLiveService.sendScreenFrame(base64Image);
        }
    }

    // ========================================
    // SHARED PUBLIC METHODS - AUDIO PROCESSING
    // ========================================
    public processAudioStream(chunk: Buffer) {
        if (this.mode === 'live') {
            this.geminiLiveService.sendAudio(chunk);
        } else {
            this.deepgramService.processAudioStream(chunk);
        }
    }

    // ========================================
    // SHARED PUBLIC METHODS - TRANSCRIBE-ONLY MODE
    // ========================================
    public enableTranscribeOnlyMode() {
        this.transcribeOnlyMode = true;
        console.log('[VoiceAssistant] Transcribe-only mode enabled');

        if (this.mode === 'live') {
            this.geminiLiveService.enableTranscribeOnlyMode();
        }
    }

    public disableTranscribeOnlyMode() {
        this.transcribeOnlyMode = false;
        console.log('[VoiceAssistant] Transcribe-only mode disabled');

        if (this.mode === 'live') {
            this.geminiLiveService.disableTranscribeOnlyMode();
        }
    }

    public isTranscribeOnlyMode(): boolean {
        return this.transcribeOnlyMode;
    }

    // ========================================
    // SHARED PUBLIC METHODS - RECORDING PATH
    // ========================================
    public setLastRecordingPath(path: string) {
        this.lastRecordingPath = path;
        console.log(`[VoiceAssistant] Last recording path set: ${path}`);
    }

    public getLastRecordingPath(): string | null {
        return this.lastRecordingPath;
    }

    // ========================================
    // CLASSIC MODE - AI PROCESSING
    // ========================================
    private async processUserMessage(text: string) {
        if (this.isProcessing) return;
        this.isProcessing = true;
        this.emit('status', 'Thinking');

        try {
            this.conversationHistory.push({ role: 'user', content: text });

            let currentSystemPrompt = this.systemPrompt;

            if (this.ttsProvider === 'elevenlabs') {
                currentSystemPrompt += `
          Você DEVE enriquecer o texto de resposta utilizando **Audio Tags** para dar vida e expressividade à fala.
          **COMO USAR AS AUDIO TAGS (ElevenLabs v3):**
          1. As tags de Áudio devem estar sempre em inglês e entre colchetes, exemplo: \`[sighs]\`.
          2. As tags de Avatar usam chaves duplas \`{{mood:x}}\`. NÃO CONFUNDA.
          3. As tags controlam emoção, velocidade e efeitos sonoros.
          
          **LISTA DE TAGS DE ÁUDIO DISPONÍVEIS:**
          - Emoções: \`[excited]\`, \`[sad]\`, \`[angry]\`, \`[whispers]\`, \`[shouting]\`, \`[sarcastically]\`.
          - Ações: \`[laughs]\`, \`[chuckles]\`, \`[giggles]\`, \`[coughs]\`, \`[clears throat]\`, \`[sighs]\`.
          - Ritmo: \`[slowly]\`, \`[fast]\`, \`[pause]\`.
          `;
            }

            // First AI Call - use selected provider
            const messages = [
                { role: "system", content: currentSystemPrompt },
                ...this.conversationHistory
            ];

            let message: any;
            if (this.aiProvider === 'gemini') {
                console.log('[VoiceAssistant] Using Gemini for classic mode');
                message = await this.geminiService.getChatCompletion(messages, geminiTools);
            } else if (this.aiProvider === 'deepseek') {
                console.log('[VoiceAssistant] Using DeepSeek for classic mode');
                message = await this.deepSeekService.getChatCompletion(messages, tools);
            } else {
                console.log('[VoiceAssistant] Using OpenAI for classic mode');
                message = await this.openAIService.getChatCompletion(messages, tools);
            }

            let aiContent = message?.content;
            const toolCalls = message?.tool_calls;
            let shouldSuppressAudio = false;
            let shortFeedbackPhrase = "";

            if (toolCalls) {
                // For Gemini, we need to store the message differently
                if (this.aiProvider === 'gemini') {
                    // Store as assistant message with function calls info
                    this.conversationHistory.push({
                        role: 'assistant',
                        content: `[Function calls: ${toolCalls.map((tc: any) => tc.function.name).join(', ')}]`
                    });
                } else {
                    // OpenAI and DeepSeek use the same format - must include role and tool_calls
                    this.conversationHistory.push({
                        role: 'assistant',
                        content: message?.content || null,
                        tool_calls: toolCalls
                    });
                }

                for (const toolCall of toolCalls) {
                    const fnName = (toolCall as any).function.name;

                    if (fnName === 'control_screen_recording') {
                        const args = JSON.parse((toolCall as any).function.arguments);
                        console.log(`Tool Call: control_screen_recording ACTION=${args.action}`);

                        if (args.action === 'start') {
                            this.recordingContext = text;
                            console.log(`Contexto da gravação definido: "${text}"`);

                            shouldSuppressAudio = true;
                            const responses = ["Gravando!", "Iniciando...", "Luz, câmera, ação!", "Valendo!", "Rodando..."];
                            shortFeedbackPhrase = responses[Math.floor(Math.random() * responses.length)];
                        } else {
                            shouldSuppressAudio = true;
                            const responses = ["Parando...", "Analisando vídeo...", "Só um segundo.", "Processando...", "Pronto."];
                            shortFeedbackPhrase = responses[Math.floor(Math.random() * responses.length)];
                        }

                        this.emit('control-recording', args.action);

                        this.conversationHistory.push({
                            role: "tool",
                            tool_call_id: this.aiProvider === 'gemini' ? fnName : (toolCall.id || fnName),
                            content: `Screen recording action '${args.action}' executed successfully.`
                        });
                    } else if (fnName === 'take_screenshot') {
                        console.log(`Tool Call: take_screenshot`);
                        this.recordingContext = text; // User's request is the context

                        // Request main process to take screenshot
                        this.emit('take-screenshot');

                        this.conversationHistory.push({
                            role: "tool",
                            tool_call_id: this.aiProvider === 'gemini' ? fnName : (toolCall.id || fnName),
                            content: `Screenshot captured and sent for analysis.`
                        });

                        shouldSuppressAudio = true;
                        const responses = ["Ok!", "Vou ver.", "Analisando...", "Só um instante.", "Deixa comigo.", "Tirando print..."];
                        shortFeedbackPhrase = responses[Math.floor(Math.random() * responses.length)];
                    }
                }

                if (shouldSuppressAudio) {
                    console.log(`Providing short feedback: "${shortFeedbackPhrase}"`);
                    if (shortFeedbackPhrase) {
                        await this.generateAndPlayAudio(shortFeedbackPhrase);
                    }
                    return;
                }

                // Follow-up after tool execution
                if (!aiContent) {
                    const followUpMessages = [
                        { role: "system", content: currentSystemPrompt },
                        ...this.conversationHistory
                    ];

                    let secondMessage: any;
                    if (this.aiProvider === 'gemini') {
                        secondMessage = await this.geminiService.getChatCompletion(followUpMessages);
                    } else if (this.aiProvider === 'deepseek') {
                        secondMessage = await this.deepSeekService.getChatCompletion(followUpMessages);
                    } else {
                        secondMessage = await this.openAIService.getChatCompletion(followUpMessages);
                    }
                    aiContent = secondMessage?.content;
                }
            }

            if (!aiContent) {
                if (!toolCalls) throw new Error("Resposta vazia da AI");
                return;
            }

            await this.handleAIResponseText(aiContent as string);

        } catch (error) {
            console.error("Erro no processamento AI:", error);
            this.emit('error', error);
        } finally {
            this.isProcessing = false;
            this.emit('status', 'Idle');
        }
    }

    // ========================================
    // CLASSIC MODE - RESPONSE HANDLING
    // ========================================
    private async handleAIResponseText(aiContent: string) {
        let responseText = aiContent;
        try {
            const parsed: AIResponse = JSON.parse(aiContent);
            console.log("OpenAI Resposta JSON:", parsed);
            responseText = parsed.text;
        } catch (e) {
            // console.log("OpenAI Resposta Texto:", aiContent);
        }

        this.conversationHistory.push({ role: 'assistant', content: responseText });
        this.emit('ai-response', responseText);
        
        // CLASSIC MODE: Emit model-transcription for the transcription window filter
        // (in live mode, this is emitted by GeminiLiveService)
        if (this.mode === 'classic') {
            this.emit('model-transcription', responseText);
        }

        const codeBlockRegex = /```[\s\S]*?```/g;
        const codeBlocks = responseText.match(codeBlockRegex);

        let spokenText = responseText;

        if (codeBlocks && codeBlocks.length > 0) {
            console.log(`Code blocks detected: ${codeBlocks.length}`);
            spokenText = responseText.replace(codeBlockRegex, " [action] Mandei o código aí na tela pra tu ver. ");
            this.emit('code-detected', codeBlocks.join('\n\n'));
        }

        // --- AVATAR COMMAND EXTRACTION ---
        const avatarRegex = /\{\{(mood|gesture):(\w+)\}\}/g;
        let match;
        while ((match = avatarRegex.exec(responseText)) !== null) {
            const type = match[1]; // mood ou gesture
            const value = match[2]; // happy, wave, etc.
            console.log(`Avatar Action Detected: ${type} -> ${value}`);
            this.emit('avatar-action', type, value);
        }

        // Remove Avatar tags from spoken text (keep Audio tags [brackets] intact)
        spokenText = spokenText.replace(avatarRegex, '').trim();
        // ---------------------------------

        if (spokenText) {
            this.emit('status', 'Speaking');
            await this.generateAndPlayAudio(spokenText);
        }
    }

    // ========================================
    // CLASSIC MODE - AUDIO GENERATION (TTS)
    // ========================================
    private async generateAndPlayAudio(text: string) {
        if (this.ttsProvider === 'elevenlabs') {
            try {
                await this.ttsService.streamAudio(text, this.ttsProvider);
            } catch (error) {
                this.emit('error', error);
            }
        } else {
            try {
                const { filePath, buffer } = await this.ttsService.generateAudio(text, this.ttsProvider);
                this.emit('audio-ready', filePath, buffer);
            } catch (error) {
                this.emit('error', error);
            }
        }
    }
}
