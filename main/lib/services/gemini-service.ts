import { GoogleGenerativeAI, FunctionDeclaration, Content, FunctionCallingMode } from "@google/generative-ai";
import { EventEmitter } from 'events';
import { getNextApiKey } from '../credentials';
import { createVideoGenAIClient } from './genai-video-client';

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
    private genAI: GoogleGenerativeAI | null = null;
    private model: any = null;
    private modelName: string = "gemini-3.1-flash-lite-preview";
    private chatModel: any = null;
    private currentApiKey: string | null = null;

    constructor() {
        super();
    }

    private ensureClient(): void {
        const apiKey = getNextApiKey('gemini');
        if (!apiKey) {
            throw new Error('Google Gemini API key não configurada.');
        }

        if (this.genAI && this.currentApiKey === apiKey) {
            return;
        }

        this.genAI = new GoogleGenerativeAI(apiKey);
        this.currentApiKey = apiKey;
        this.model = this.genAI.getGenerativeModel({ model: this.modelName });
        this.chatModel = this.genAI.getGenerativeModel({ model: this.modelName });
    }

    /**
     * Get chat completion with optional function calling (similar to OpenAI)
     */
    public async getChatCompletion(messages: GeminiMessage[], tools?: FunctionDeclaration[]): Promise<GeminiChatResponse> {
        try {
            this.ensureClient();
            const genAI = this.genAI as GoogleGenerativeAI;

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
                model: "gemini-3.1-flash-lite-preview",
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

            const model = genAI.getGenerativeModel(modelConfig);
            
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
            this.ensureClient();

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

    public setModel(modelName: string) {
        this.modelName = modelName;
        try {
            this.ensureClient();
            this.model = (this.genAI as GoogleGenerativeAI).getGenerativeModel({ model: modelName });
            this.chatModel = (this.genAI as GoogleGenerativeAI).getGenerativeModel({ model: modelName });
        } catch {
            // Sem credencial, apenas persiste o nome do modelo para quando houver chave.
        }
    }

    private resolveJsonModel(modelName: string): string {
        const requested = (modelName || '').trim();
        return requested || 'gemini-3.1-pro-preview';
    }

    private parseJsonResponseText(rawText: string): any {
        const trimmed = rawText.trim();
        if (!trimmed) {
            throw new Error('Resposta vazia do Google GenAI.');
        }

        const withoutFences = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

        try {
            return JSON.parse(withoutFences);
        } catch {
            const arrayMatch = withoutFences.match(/\[[\s\S]*\]/);
            if (arrayMatch) {
                return JSON.parse(arrayMatch[0]);
            }
            const objectMatch = withoutFences.match(/\{[\s\S]*\}/);
            if (objectMatch) {
                return JSON.parse(objectMatch[0]);
            }
            throw new Error(`Falha ao parsear JSON da resposta de IA. Trecho recebido: ${withoutFences.substring(0, 220)}...`);
        }
    }

    /**
     * Specialized method for video/project analysis returning JSON
     */
    public async getChatVideoAnalysis(messages: GeminiMessage[]): Promise<any> {
        try {
            const systemInstruction = messages.find(m => m.role === 'system')?.content || 'Respond with valid JSON.';
            
            // Build contents only for user/model messages
            const contents: Content[] = messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => ({
                    role: m.role === 'user' ? 'user' : 'model',
                    parts: [{ text: m.content }]
                }));

            const { ai, backend, project, location } = createVideoGenAIClient(null, 'next');
            const resolvedModel = this.resolveJsonModel(this.modelName);

            if (
                backend === 'vertex' &&
                resolvedModel.toLowerCase().startsWith('gemini-3.1-pro-preview') &&
                String(location || '').toLowerCase() !== 'global'
            ) {
                throw new Error(
                    `O modelo ${resolvedModel} no Vertex AI só está disponível em location=global. Atualize Configurações > API e Modelos > Google Cloud Location para "global".`
                );
            }

            console.log(
                `🧠 Gemini VideoAnalysis: Requesting JSON via Google GenAI (${backend}${backend === 'vertex' ? ` ${project}/${location}` : ''}) model=${resolvedModel}...:`,
                contents
            );

            const response = await ai.models.generateContent({
                model: resolvedModel,
                contents,
                config: {
                    systemInstruction,
                    responseMimeType: "application/json",
                } as any,
            } as any);

            const text = String(response?.text || '');
            console.log(`🧠 Gemini VideoAnalysis Response (${text.length} chars)`);
            
            return this.parseJsonResponseText(text);

        } catch (error) {
            console.error("GeminiService getChatVideoAnalysis Error:", error);
            throw error;
        }
    }
}
