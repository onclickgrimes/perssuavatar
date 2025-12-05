import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from 'dotenv';
import { EventEmitter } from 'events';

dotenv.config();

export class GeminiService extends EventEmitter {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor() {
        super();
        const apiKey = process.env.GOOGLE_API_KEY || '';
        if (!apiKey) {
            console.error("Google API Key missing!");
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    }

     /**
     * Analisa um vídeo usando o Gemini.
     * @param videoBuffer Buffer do vídeo
     * @param mimeType Tipo MIME (ex: 'video/webm')
     * @param userContext Contexto adicional do usuário (o que ele pediu)
     * @returns Descrição textual do vídeo
     */
     public async analyzeVideo(videoBuffer: Buffer, mimeType: string = 'video/webm', userContext?: string): Promise<string> {
        try {
            console.log("Iniciando análise de vídeo com GeminiService...");
            this.emit('status', 'Thinking');
            
            const videoBase64 = videoBuffer.toString('base64');
            let analysisPrompt = "Analise este vídeo da minha tela. Descreva o que você vê, identifique aplicativos abertos, textos importantes ou contexto relevante para me ajudar. Seja breve e direta, como a Yuki.";

            if (userContext) {
                console.log(`Adding user context to analysis: "${userContext}"`);
                analysisPrompt = `CONTEXTO DO USUÁRIO (O que ele pediu para verificar no vídeo): "${userContext}"\n\nTAREFA: ${analysisPrompt}`;
            }
    
            const result = await this.model.generateContent([
                {
                    inlineData: {
                        data: videoBase64,
                        mimeType: mimeType
                    }
                },
                analysisPrompt
            ]);
    
            const response = await result.response;
            const text = response.text();
            
            console.log(`📊 Análise do vídeo (Gemini): ${text}`);
            this.emit('status', 'Idle');
            return text;
    
        } catch (error) {
            console.error("Erro na análise de vídeo do GeminiService:", error);
            this.emit('error', error);
            this.emit('status', 'Idle');
            throw error;
        }
      }
}
