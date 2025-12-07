import { EventEmitter } from 'events';
import { tools } from './tools';
import { DeepgramService } from './services/deepgram-service';
import { OpenAIService } from './services/openai-service';
import { GeminiService } from './services/gemini-service';
import { GeminiLiveService } from './services/gemini-live-service';
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
  private ttsService: TTSService;

  private isProcessing: boolean = false;
  private conversationHistory: any[] = [];
  private systemPrompt: string = '';
  private ttsProvider: "polly" | "elevenlabs" = "elevenlabs"; 
  private recordingContext: string | null = null;
  
  // New Services and State
  private geminiLiveService: GeminiLiveService;
  private mode: 'classic' | 'live' = 'classic';

  constructor(ttsProvider: "polly" | "elevenlabs" = "elevenlabs") {
    super();
    this.ttsProvider = ttsProvider;
    this.updateContext(); 

    // Initialize Services
    this.deepgramService = new DeepgramService();
    this.openAIService = new OpenAIService();
    this.geminiService = new GeminiService();
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
  }

  private handleTranscription(text: string) {
      this.emit('transcription', text);
      
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

          const analysis = await this.openAIService.analyzeImage(base64Image, context);
          console.log("🤖 OpenAI Vision Analysis:", analysis);
          
          this.recordingContext = null;

          // Adiciona a análise ao histórico
          this.conversationHistory.push({ 
              role: 'user', 
              content: `[SYSTEM: O usuário enviou um screenshot da tela. Análise da OpenAI: ${analysis}]` 
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
          this.emit('status', 'Live Ready');
      } else {
          this.geminiLiveService.disconnect();
          this.emit('status', 'Classic Mode');
      }
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

      // First AI Call
      const messages = [
        { role: "system", content: currentSystemPrompt },
        ...this.conversationHistory
      ];

      let message = await this.openAIService.getChatCompletion(messages, tools);
      
      let aiContent = message?.content;
      const toolCalls = message?.tool_calls;
      let shouldSuppressAudio = false;
      let shortFeedbackPhrase = "";

      if (toolCalls) {
          this.conversationHistory.push(message); 

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
                      tool_call_id: toolCall.id,
                      content: `Screen recording action '${args.action}' executed successfully.`
                  });
              } else if (fnName === 'take_screenshot') {
                  console.log(`Tool Call: take_screenshot`);
                  this.recordingContext = text; // User's request is the context
                  
                  // Request main process to take screenshot
                  this.emit('take-screenshot');

                  this.conversationHistory.push({
                      role: "tool",
                      tool_call_id: toolCall.id,
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
              const secondMessage = await this.openAIService.getChatCompletion(followUpMessages);
              aiContent = secondMessage?.content;
          }
      }

      if (!aiContent) {
           if (!toolCalls) throw new Error("Resposta vazia da OpenAI");
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
