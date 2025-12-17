import { GoogleGenerativeAI, FunctionDeclaration, Content, FunctionCallingMode } from "@google/generative-ai";
import * as dotenv from 'dotenv';
import { EventEmitter } from 'events';

dotenv.config();

export interface GeminiMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    tool_call_id?: string;
}

export interface GeminiToolCall {
    id: string;
    function: {
        name: string;
        arguments: string;
    };
}

export interface GeminiChatResponse {
    content: string | null;
    tool_calls?: GeminiToolCall[];
}

export class GeminiService extends EventEmitter {
    private genAI: GoogleGenerativeAI;
    private model: any;
    private chatModel: any;

    constructor() {
        super();
        const apiKey = process.env.GOOGLE_API_KEY || '';
        if (!apiKey) {
            console.error("Google API Key missing!");
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
        this.chatModel = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    }

    /**
     * Get chat completion with optional function calling (similar to OpenAI)
     */
    public async getChatCompletion(messages: GeminiMessage[], tools?: FunctionDeclaration[]): Promise<GeminiChatResponse> {
        try {
            // Convert messages to Gemini format
            const systemInstruction = messages.find(m => m.role === 'system')?.content || '';
            const chatMessages = messages.filter(m => m.role !== 'system');
            
            // Build contents array for Gemini
            const contents: Content[] = [];
            
            for (const msg of chatMessages) {
                if (msg.role === 'user') {
                    contents.push({
                        role: 'user',
                        parts: [{ text: msg.content }]
                    });
                } else if (msg.role === 'assistant') {
                    contents.push({
                        role: 'model',
                        parts: [{ text: msg.content }]
                    });
                } else if (msg.role === 'tool') {
                    // Tool response - needs to be function response
                    contents.push({
                        role: 'function',
                        parts: [{
                            functionResponse: {
                                name: msg.tool_call_id || 'unknown',
                                response: { result: msg.content }
                            }
                        }]
                    } as any);
                }
            }

            // Create model with tools if provided
            const modelConfig: any = {
                model: "gemini-2.5-flash-lite",
                systemInstruction: systemInstruction
            };

            if (tools && tools.length > 0) {
                modelConfig.tools = [{ functionDeclarations: tools }];
                modelConfig.toolConfig = {
                    functionCallingConfig: {
                        mode: FunctionCallingMode.AUTO
                    }
                };
            }

            const model = this.genAI.getGenerativeModel(modelConfig);
            
            const result = await model.generateContent({
                contents: contents
            });

            const response = result.response;
            const candidate = response.candidates?.[0];
            
            if (!candidate) {
                throw new Error("No response candidate from Gemini");
            }

            // Check for function calls
            const functionCalls = candidate.content?.parts?.filter((p: any) => p.functionCall);
            
            if (functionCalls && functionCalls.length > 0) {
                const toolCalls: GeminiToolCall[] = functionCalls.map((fc: any, index: number) => ({
                    id: fc.functionCall.name + '_' + index,
                    function: {
                        name: fc.functionCall.name,
                        arguments: JSON.stringify(fc.functionCall.args || {})
                    }
                }));

                return {
                    content: null,
                    tool_calls: toolCalls
                };
            }

            // Regular text response
            const textParts = candidate.content?.parts?.filter((p: any) => p.text);
            const text = textParts?.map((p: any) => p.text).join('') || '';

            return {
                content: text
            };

        } catch (error) {
            console.error("GeminiService getChatCompletion Error:", error);
            throw error;
        }
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

    /**
     * Specialized method for video/project analysis returning JSON
     */
    public async getChatVideoAnalysis(messages: GeminiMessage[]): Promise<any> {
        try {
            console.log('🧠 Gemini VideoAnalysis: Requesting JSON response...');

            const systemInstruction = messages.find(m => m.role === 'system')?.content || 'Respond with valid JSON.';
            
            // Build contents only for user/model messages
            const contents: Content[] = messages
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => ({
                    role: m.role === 'user' ? 'user' : 'model',
                    parts: [{ text: m.content }]
                }));

            // Use generation config for JSON
            const model = this.genAI.getGenerativeModel({
                model: "gemini-2.5-flash-lite", // or gemini-1.5-flash
                systemInstruction: systemInstruction,
            });

            const result = await model.generateContent({
                contents: contents,
                generationConfig: {
                    responseMimeType: "application/json"
                }
            });

            const response = result.response;
            const text = response.text();
            console.log(`🧠 Gemini VideoAnalysis Response (${text.length} chars)`);
            
            return JSON.parse(text);

        } catch (error) {
            console.error("GeminiService getChatVideoAnalysis Error:", error);
            throw error;
        }
    }
}
