import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { OpenAI } from 'openai';
import AWS from 'aws-sdk';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import * as dotenv from 'dotenv';
import { EventEmitter } from 'events';
import { tools } from './tools';

dotenv.config();

// --- Interfaces ---
interface AIResponse {
  text: string;
  action: string;
  expressao_facial: string;
}

// Ensure keys are present or handle missing keys gracefully
const deepgramApiKey = process.env.DEEPGRAM_API_KEY || '';
const openaiApiKey = process.env.OPENAI_API_KEY || '';
const geminiApiKey = process.env.GOOGLE_API_KEY || '';

const deepgram = createClient(deepgramApiKey);
const openai = new OpenAI({ apiKey: openaiApiKey, dangerouslyAllowBrowser: true });
const genAI = new GoogleGenerativeAI(geminiApiKey);

// Configuração AWS Polly
if (process.env.AWS_ACCESS_KEY_ID) {
  AWS.config.update({
    region: 'sa-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  });
}
const polly = new AWS.Polly();

// Configuração ElevenLabs
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY_2 
});

// --- Classe Principal ---
export class VoiceAssistant extends EventEmitter {
  private deepgramLive: any;
  private isProcessing: boolean = false;
  private conversationHistory: any[] = [];
  private systemPrompt: string = '';
  private ttsProvider: "polly" | "elevenlabs" = "elevenlabs"; 
  private geminiModel: any;

  constructor(ttsProvider: "polly" | "elevenlabs" = "elevenlabs") {
    super();
    this.ttsProvider = ttsProvider;
    this.updateContext(); 
    // Initialize Gemini Model
    this.geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
  }

  /**
   * Analisa um vídeo usando o Gemini 2.0 Flash.
   * @param videoBuffer Buffer do vídeo
   * @param mimeType Tipo MIME (ex: 'video/webm' ou 'video/mp4')
   */
  public async analyzeVideo(videoBuffer: Buffer, mimeType: string = 'video/webm') {
    try {
        console.log("Iniciando análise de vídeo com Gemini...");
        this.emit('status', 'Thinking');
        
        // Convert buffer to base64
        const videoBase64 = videoBuffer.toString('base64');

        const analysisPrompt = "Analise este vídeo da minha tela. Descreva o que você vê, identifique aplicativos abertos, textos importantes ou contexto relevante para me ajudar. Seja breve e direta, como a Yuki.";

        const result = await this.geminiModel.generateContent([
            {
                inlineData: {
                    data: videoBase64,
                    mimeType: mimeType
                }
            },
            analysisPrompt
        ]);

        const response = await result.response;
        const mediaAnalysis = response.text();

        console.log(`📊 Análise do vídeo: ${mediaAnalysis}`);
        
        // Adiciona a análise ao histórico de conversa como contexto do sistema ou user message especial
        this.conversationHistory.push({ 
            role: 'user', 
            content: `[SYSTEM: O usuário enviou uma gravação de tela. Análise do Gemini: ${mediaAnalysis}]` 
        });

        // Gera uma resposta da Yuki baseada nisso
        await this.processUserMessage("O que você achou do que eu te mostrei na tela?");
        
        return mediaAnalysis;

    } catch (error) {
        console.error("Erro na análise de vídeo do Gemini:", error);
        this.emit('error', error);
        throw error;
    } finally {
        this.emit('status', 'Idle');
    }
  }

  /**
   * Atualiza as informações do NPC e regenera o System Prompt.
   */
  public updateContext() {
    this.systemPrompt = `
    Tu tá interpretando a Yuki, Uma avatar2d que interage com o usuário no computador. Ela é grossa, debochada, sarcástica e sem paciência nenhuma.
    Usa "tu" em vez de "você". Fala informal, com sotaque de rua, cortando o "r" do fim das palavras (tipo "andá", "falá", "pegá").
    Não use emojis.
    `;
  }

  /**
   * Inicia a conexão com o Deepgram.
   * @param audioStream Stream de áudio (opcional). Se não fornecido, use processAudioStream(chunk).
   */
  public startDeepgram(audioStream?: Readable) {
    if (this.deepgramLive) return;

    console.log('Iniciando Deepgram...');
    this.deepgramLive = deepgram.listen.live({
      model: "nova-3",
      language: "pt-BR",
      encoding: 'linear16',
      sample_rate: 16000,
      punctuate: true,
      endpointing: 300,
      interim_results: true,
      vad_events: true,
      utterance_end_ms: 1000
    });

    this.deepgramLive.on(LiveTranscriptionEvents.Open, () => {
      console.log("Deepgram: Conexão estabelecida");
      this.emit('status', 'Listening');
    });

    let transcriptionBuffer = '';
    
    this.deepgramLive.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      // Verifica se a transcrição é final (confiável)
      if (data.is_final) {
        const transcript = data.channel.alternatives[0].transcript.trim();

        if (transcript.length > 0) {
          console.log(`Transcrição recebida: "${transcript}"`);
          transcriptionBuffer += (transcriptionBuffer ? ' ' : '') + transcript;

          // Condições para enviar para a OpenAI:
          // 1. Ponto final, interrogação ou exclamação detectado.
          // 2. Deepgram indica que é o final da fala (speech_final).
          const hasPunctuation = /[.?!]$/.test(transcript); // Verifica se termina com pontuação
          
          if (hasPunctuation || data.speech_final) {
             if (!this.isProcessing) {
                const textToSend = transcriptionBuffer.trim();
                console.log(`📝 Envio processado: "${textToSend}"`);
                
                transcriptionBuffer = ''; // Limpa o buffer
                this.emit('transcription', textToSend);
                this.processUserMessage(textToSend);
             } else {
                 console.log("⚠️ Ignorando entrada pois já estou processando uma resposta.");
             }
          }
        }
      }
    });

    this.deepgramLive.on(LiveTranscriptionEvents.Error, (err: any) => {
      console.error("Deepgram Erro:", err);
      this.emit('error', err);
    });

    // Pipe do audioStream para o Deepgram se fornecido
    if (audioStream) {
      audioStream.on('data', (chunk) => {
        this.processAudioStream(chunk);
      });
    }
  }

  /**
   * Envia um chunk de áudio para o Deepgram.
   * Útil quando o áudio vem via IPC ou outras fontes que não são Streams diretos.
   * @param chunk Buffer de áudio (Raw Int16 ou conforme configurado)
   */
  public processAudioStream(chunk: Buffer) {
    if (this.deepgramLive && this.deepgramLive.getReadyState() === 1) {
      this.deepgramLive.send(chunk);
    }
  }

  public stopDeepgram() {
    if (this.deepgramLive) {
      this.deepgramLive.finish();
      this.deepgramLive = null;
      console.log("Deepgram parado");
    }
  }

  /**
   * Processa a mensagem do usuário com a OpenAI e gera áudio.
   */
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

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: currentSystemPrompt },
          ...this.conversationHistory
        ],
        tools: tools,
        max_tokens: 150
      });

      const message = response.choices[0].message;
      const aiContent = message?.content;
      const toolCalls = message?.tool_calls;

      if (toolCalls) {
          this.conversationHistory.push(message); 

          for (const toolCall of toolCalls) {
              // Cast to any to avoid TS issues with specific OpenAI version types
              if ((toolCall as any).function.name === 'control_screen_recording') {
                  const args = JSON.parse((toolCall as any).function.arguments);
                  console.log(`Tool Call: control_screen_recording ACTION=${args.action}`);
                  
                  this.emit('control-recording', args.action);

                  this.conversationHistory.push({
                      role: "tool",
                      tool_call_id: toolCall.id,
                      content: `Screen recording action '${args.action}' executed successfully.`
                  });
              }
          }

          if (!aiContent) {
              const secondResponse = await openai.chat.completions.create({
                  model: "gpt-4o-mini",
                  messages: [
                      { role: "system", content: currentSystemPrompt },
                      ...this.conversationHistory
                  ],
              });
             const secondMessage = secondResponse.choices[0].message?.content;
             if (secondMessage) {
                 await this.handleAIResponseText(secondMessage);
             }
             return; 
          }
      }

      if (!aiContent) {
          if (!toolCalls) throw new Error("Resposta vazia da OpenAI");
          return;
      }

      await this.handleAIResponseText(aiContent);

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
         console.log("OpenAI Resposta Texto:", aiContent);
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
       } else {
         console.log('No code blocks detected.');
       }
 
       if (spokenText) {
         this.emit('status', 'Speaking');
         await this.generateAndPlayAudio(spokenText);
       }
  }

  /**
   * Gera o áudio usando Polly ou ElevenLabs
   */
  private async generateAndPlayAudio(text: string) {
    try {
      let audioBuffer: Buffer;

      if (this.ttsProvider === 'polly') {
        const params = {
          OutputFormat: 'mp3',
          Text: text,
          VoiceId: 'Camila', 
          LanguageCode: 'pt-BR',
        };
        const data = await polly.synthesizeSpeech(params).promise();
        if (data.AudioStream instanceof Buffer) {
          audioBuffer = data.AudioStream;
        } else if (data.AudioStream instanceof Uint8Array) {
          audioBuffer = Buffer.from(data.AudioStream);
        } else {
          throw new Error("Formato de áudio Polly inválido");
        }
      } else {
        const voiceId = process.env.VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; 
        const response = await elevenlabs.textToSpeech.convert(voiceId, {
          text: text,
          modelId: 'eleven_v3',
          outputFormat: 'mp3_44100_128',
        });

        if (Buffer.isBuffer(response)) {
          audioBuffer = response;
        } else if (typeof response === 'object' && response !== null && 'pipe' in response) {
          const chunks: any[] = [];
          for await (const chunk of (response as any)) {
            chunks.push(chunk);
          }
          audioBuffer = Buffer.concat(chunks);
        } else if ((response as any) instanceof ArrayBuffer) {
          audioBuffer = Buffer.from(response as unknown as ArrayBuffer);
        } else if (typeof ReadableStream !== 'undefined' && (response as any) instanceof ReadableStream) {
          const reader = (response as any).getReader();
          const chunks: any[] = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          audioBuffer = Buffer.concat(chunks);
        } else {
          console.warn("Unknown ElevenLabs response type:", response);
          try {
            const chunks: any[] = [];
            for await (const chunk of (response as any)) {
              chunks.push(chunk);
            }
            audioBuffer = Buffer.concat(chunks);
          } catch (e) {
            throw new Error("Could not convert ElevenLabs response to Buffer");
          }
        }
      }

      const audioFilePath = path.join(__dirname, '../temp_audio.mp3');
      fs.writeFileSync(audioFilePath, audioBuffer);

      console.log("Áudio gerado em:", audioFilePath);
      this.emit('audio-ready', audioFilePath, audioBuffer);

    } catch (error) {
      console.error("Erro no TTS:", error);
      this.emit('error', error);
    }
  }
}
