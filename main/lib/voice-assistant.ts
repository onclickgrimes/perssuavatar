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
  private deepgramService: DeepgramService;
  private openAIService: OpenAIService;
  private geminiService: GeminiService;
  private deepSeekService: DeepSeekService;
  private ttsService: TTSService;

  private isProcessing: boolean = false;
  private conversationHistory: any[] = [];
  private systemPrompt: string = '';
  private ttsProvider: "polly" | "elevenlabs" = "elevenlabs"; 
  private recordingContext: string | null = null;
  
  // New Services and State
  private geminiLiveService: GeminiLiveService;
  private mode: 'classic' | 'live' = 'classic';
  private aiProvider: 'openai' | 'gemini' | 'deepseek' = 'gemini';  // AI provider for classic mode
  private lastRecordingPath: string | null = null;  // Path to the last saved recording
  private transcribeOnlyMode: boolean = false;  // If true, only transcribe without processing AI response


  constructor(ttsProvider: "polly" | "elevenlabs" = "elevenlabs") {
    super();
    this.ttsProvider = ttsProvider;
    this.updateContext(); 

    // Initialize Services
    this.deepgramService = new DeepgramService();
    this.openAIService = new OpenAIService();
    this.geminiService = new GeminiService();
    this.deepSeekService = new DeepSeekService();
    this.geminiLiveService = new GeminiLiveService();
    this.ttsService = new TTSService();

    
    // Forward TTS Events
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

    // Setup Deepgram Events
    this.deepgramService.on('transcription-final', (text: string) => {
        if (this.mode === 'classic') {
            this.handleTranscription(text);
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

    // Setup Gemini Services Events
    this.geminiService.on('status', (status: string) => this.emit('status', status));

    // Setup Gemini Live Events
    this.geminiLiveService.on('audio-chunk', (chunk) => {
        if (this.mode === 'live') {
            this.emit('audio-chunk', chunk);
        }
    });

    this.geminiLiveService.on('status', (status) => {
        if (this.mode === 'live') {
            this.emit('status', status);
        }
    });

    this.geminiLiveService.on('avatar-action', (type, value) => {
        if (this.mode === 'live') {
             this.emit('avatar-action', type, value);
        }
    });

    this.geminiLiveService.on('audio-full', (buffer) => {
        if (this.mode === 'live') {
            // 'audio-ready' expects (filePath, buffer). passing null for filePath.
            this.emit('audio-ready', null, buffer);
        }
    });
    
    this.geminiLiveService.on('text', (text) => {
        if (this.mode === 'live') {
            this.emit('gemini-response', text); 
        }
    });

    // Handle interruption (user barge-in)
    this.geminiLiveService.on('interrupted', () => {
        if (this.mode === 'live') {
            this.emit('interrupted');
        }
    });

    // Handle tool calls from Gemini Live (function calling)
    this.geminiLiveService.on('tool-call', async (toolCall: { id: string, name: string, args: any }) => {
        if (this.mode === 'live') {
            console.log(`[VoiceAssistant] Gemini Live tool call: ${toolCall.name}`, toolCall.args);
            
            let result: any = { success: true };
            
            if (toolCall.name === 'control_screen_share') {
                const action = toolCall.args?.action;
                console.log(`[VoiceAssistant] Control screen share: ${action}`);
                
                // Emit event for the frontend to handle
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
                console.log(`[VoiceAssistant] Save screen recording: last ${durationSeconds} seconds`);
                
                // Emit event for the frontend to save the recording
                this.emit('save-recording', durationSeconds);
                
                result = { 
                    success: true, 
                    message: `Saving the last ${durationSeconds} seconds of screen recording. The file will be saved and you can reference it later. Confirm to the user that you're saving the recording.`
                };
                
            } else if (toolCall.name === 'take_screenshot') {
                console.log(`[VoiceAssistant] Take screenshot requested`);
                
                // Emit event for the main process to handle
                // The screenshot will be sent as a screen frame right after
                this.emit('take-screenshot');
                result = { 
                    success: true, 
                    message: 'Screenshot captured and being sent to you now. Please analyze the image that follows and describe what you see on the screen.' 
                };
            }
            
            // Send the tool response back to Gemini Live
            await this.geminiLiveService.sendToolResponse(toolCall.id, result);
        }
    });

    // Forward transcriptions to frontend
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

  private handleTranscription(text: string) {
      this.emit('transcription', text);
      
      // Always emit user-transcription for the transcription window
      this.emit('user-transcription', text);
      
      // If we're in transcribe-only mode, don't process the message
      if (this.transcribeOnlyMode) {
          console.log('[VoiceAssistant] Transcribe-only mode: skipping AI processing');
          return;
      }
      
      if (!this.isProcessing) {
          this.processUserMessage(text);
      } else {
          console.log("⚠️ Ignorando entrada pois já estou processando uma resposta.");
      }
  }

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

  public startDeepgram(audioStream?: Readable) {
      // In live mode, we might not need to start anything explicitly unless we want to open the connection
      if (this.mode === 'classic') {
          this.deepgramService.start(audioStream);
      }
  }

  public processAudioStream(chunk: Buffer) {
      if (this.mode === 'live') {
          this.geminiLiveService.sendAudio(chunk);
      } else {
          this.deepgramService.processAudioStream(chunk);
      }
  }

  /**
   * Enable transcribe-only mode (user-transcription works, but avatar doesn't respond)
   */
  public enableTranscribeOnlyMode() {
      this.transcribeOnlyMode = true;
      console.log('[VoiceAssistant] Transcribe-only mode enabled');
      
      // Also enable in Gemini Live Service if in live mode
      if (this.mode === 'live') {
          this.geminiLiveService.enableTranscribeOnlyMode();
      }
  }

  /**
   * Disable transcribe-only mode (normal behavior restored)
   */
  public disableTranscribeOnlyMode() {
      this.transcribeOnlyMode = false;
      console.log('[VoiceAssistant] Transcribe-only mode disabled');
      
      // Also disable in Gemini Live Service if in live mode
      if (this.mode === 'live') {
          this.geminiLiveService.disableTranscribeOnlyMode();
      }
  }

  /**
   * Get current transcribe-only mode state
   */
  public isTranscribeOnlyMode(): boolean {
      return this.transcribeOnlyMode;
  }

  public stopDeepgram() {
      this.deepgramService.stop();
  }

  public sendScreenFrame(base64Image: string) {
      if (this.mode === 'live') {
          this.geminiLiveService.sendScreenFrame(base64Image);
      }
  }

  public async setMode(mode: 'classic' | 'live') {
      console.log(`Switching mode to ${mode}`);
      if (this.mode === mode) return;
      
      this.mode = mode;
      
      if (mode === 'live') {
          this.stopDeepgram();
          this.emit('status', 'Connecting Live...');
          await this.geminiLiveService.connect();
          
          // Sync transcribeOnlyMode state with Gemini Live Service
          if (this.transcribeOnlyMode) {
              this.geminiLiveService.enableTranscribeOnlyMode();
          } else {
              this.geminiLiveService.disableTranscribeOnlyMode();
          }
          
          this.emit('status', 'Live Ready');
      } else {
          this.geminiLiveService.disconnect();
          this.emit('status', 'Classic Mode');
      }
  }

  /**
   * Set the AI provider for classic mode ('openai', 'gemini', or 'deepseek')
   */
  public setAIProvider(provider: 'openai' | 'gemini' | 'deepseek') {
      console.log(`[VoiceAssistant] Switching AI provider to: ${provider}`);
      this.aiProvider = provider;
  }

  /**
   * Get the current AI provider
   */
  public getAIProvider(): 'openai' | 'gemini' | 'deepseek' {
      return this.aiProvider;
  }

  /**
   * Get the current mode ('classic' or 'live')
   */
  public getMode(): 'classic' | 'live' {
      return this.mode;
  }

  /**
   * Set the path of the last saved recording
   */
  public setLastRecordingPath(path: string) {
      this.lastRecordingPath = path;
      console.log(`[VoiceAssistant] Last recording path set: ${path}`);
  }

  /**
   * Get the path of the last saved recording
   */
  public getLastRecordingPath(): string | null {
      return this.lastRecordingPath;
  }

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
