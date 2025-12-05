import { EventEmitter } from 'events';
import { tools } from './tools';
import { DeepgramService } from './services/deepgram-service';
import { OpenAIService } from './services/openai-service';
import { GeminiService } from './services/gemini-service';
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

  constructor(ttsProvider: "polly" | "elevenlabs" = "elevenlabs") {
    super();
    this.ttsProvider = ttsProvider;
    this.updateContext(); 

    // Initialize Services
    this.deepgramService = new DeepgramService();
    this.openAIService = new OpenAIService();
    this.geminiService = new GeminiService();
    this.ttsService = new TTSService();

    // Setup Deepgram Events
    this.deepgramService.on('transcription-final', (text: string) => {
        this.handleTranscription(text);
    });
    
    this.deepgramService.on('status', (status: string) => {
        this.emit('status', status);
    });

    this.deepgramService.on('error', (error: any) => {
        this.emit('error', error);
    });

    // Setup Gemini Events
    this.geminiService.on('status', (status: string) => this.emit('status', status));
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

  public updateContext() {
    this.systemPrompt = `
    Tu tá interpretando a Yuki, Uma avatar2d que interage com o usuário no computador. Ela é grossa, debochada, sarcástica e sem paciência nenhuma.
    Usa "tu" em vez de "você". Fala informal, com sotaque de rua, cortando o "r" do fim das palavras (tipo "andá", "falá", "pegá").
    Não use emojis.
    `;
  }

  public startDeepgram(audioStream?: Readable) {
      this.deepgramService.start(audioStream);
  }

  public processAudioStream(chunk: Buffer) {
      this.deepgramService.processAudioStream(chunk);
  }

  public stopDeepgram() {
      this.deepgramService.stop();
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
          1. As tags devem estar sempre em inglês e entre colchetes, exemplo: \`[sighs]\`.
          2. As tags controlam emoção, velocidade e efeitos sonoros.
          3. Insira as tags no início de frases ou pausas lógicas para indicar como o trecho seguinte deve ser lido.

          **LISTA DE TAGS DISPONÍVEIS (Exemplos):**
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

      if (toolCalls) {
          this.conversationHistory.push(message); 

          for (const toolCall of toolCalls) {
              if ((toolCall as any).function.name === 'control_screen_recording') {
                  const args = JSON.parse((toolCall as any).function.arguments);
                  console.log(`Tool Call: control_screen_recording ACTION=${args.action}`);
                  
                  if (args.action === 'start') {
                      this.recordingContext = text;
                      console.log(`Contexto da gravação definido: "${text}"`);
                  }

                  this.emit('control-recording', args.action);

                  this.conversationHistory.push({
                      role: "tool",
                      tool_call_id: toolCall.id,
                      content: `Screen recording action '${args.action}' executed successfully.`
                  });
              }
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
 
       if (spokenText) {
         this.emit('status', 'Speaking');
         await this.generateAndPlayAudio(spokenText);
       }
  }

  private async generateAndPlayAudio(text: string) {
      try {
          const { filePath, buffer } = await this.ttsService.generateAudio(text, this.ttsProvider);
          this.emit('audio-ready', filePath, buffer);
      } catch (error) {
          this.emit('error', error);
      }
  }
}
