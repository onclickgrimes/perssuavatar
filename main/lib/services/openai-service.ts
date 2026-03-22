import { OpenAI } from 'openai';
import { ChatCompletionTool } from 'openai/resources/chat/completions';
import { getNextApiKey } from '../credentials';

export class OpenAIService {
    private openai: OpenAI | null = null;
    private currentApiKey: string | null = null;
    private model: string = "gpt-5-nano-2025-08-07";

    constructor() {
    }

    private getClient(): OpenAI {
        const apiKey = getNextApiKey('openai');
        if (!apiKey) {
            throw new Error('OpenAI API key não configurada.');
        }

        if (this.openai && this.currentApiKey === apiKey) {
            return this.openai;
        }

        this.openai = new OpenAI({ apiKey });
        this.currentApiKey = apiKey;
        return this.openai;
    }

    public setModel(model: string) {
        this.model = model;
        console.log(`OpenAIService: Model changed to ${model}`);
    }

    public async getChatCompletion(messages: any[], tools?: ChatCompletionTool[]) {
        try {
            const response = await this.getClient().chat.completions.create({
                model: this.model,
                temperature: 0.7,
                messages: messages,
                tools: tools,
                max_tokens: 150
            });

            return response.choices[0].message;
        } catch (error) {
            console.error("OpenAIService Error:", error);
            throw error;
        }
    }

    public async analyzeImage(base64Image: string, userContext?: string): Promise<string> {
        try {
            console.log("OpenAIService: Analisando imagem...");
            const prompt = userContext
                ? `${userContext}`
                : "O usuário pediu para olhar a tela. O que você vê? Identifique apps, textos ou erros.";

            const response = await this.getClient().chat.completions.create({
                model: "gpt-4.1-nano", // Supports vision
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            {
                                type: "image_url",
                                image_url: {
                                    "url": `data:image/jpeg;base64,${base64Image}`,
                                    // "detail": "low" // Low detail is faster and cheaper, often enough for screens unless reading small text
                                },
                            },
                        ],
                    },
                ],
                max_tokens: 300,
            });

            return response.choices[0].message.content || "Não consegui ver nada.";
        } catch (error) {
            console.error("OpenAIService Image Analysis Error:", error);
            throw error;
        }
    }

    /**
     * Specialized method for video/project analysis returning JSON
     */
    public async getChatVideoAnalysis(messages: any[]): Promise<any> {
        try {
            console.log('🧠 OpenAI VideoAnalysis: Requesting JSON response...');

            const requestOptions: any = {
                messages: messages,
                //'reasoning_effort' does not support 'none' with this model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
                // model: "gpt-4.1-nano-2025-04-14"
                model: this.model,
                response_format: { type: "json_object" }
            };

            // Configurações específicas para os modelos GPT-5.4
            if (this.model === "gpt-5.4-mini" || this.model === "gpt-5.4") {
                requestOptions.store = false;
                
                // Mapear esforço de reasoning para o formato suportado reasoning_effort
                // O GPT-5.4 parece não aceitar os objetos 'text' e 'reasoning' diretamente conforme o erro reportado
                if (this.model === "gpt-5.4-mini") {
                    requestOptions.reasoning_effort = "high"; // Aproximação de xhigh
                } else {
                    requestOptions.reasoning_effort = "medium";
                }
            } 
            // Remove reasoning_effort for gpt-4.1-2025-04-14
            else if (this.model !== "gpt-4.1-2025-04-14") {
                requestOptions.reasoning_effort = "low";
            }

            const response = await this.getClient().chat.completions.create(requestOptions);

            const content = response.choices[0].message.content || '{}';
            console.log(`🧠 OpenAI VideoAnalysis Response (${content.length} chars)`);

                        // Clean up content to extract JSON
            let jsonString = content;
            
            // Remove markdown code blocks if present
            const markdownMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/```\n?([\s\S]*?)\n?```/);
            if (markdownMatch) {
                jsonString = markdownMatch[1];
            }
            
            return JSON.parse(jsonString);
        } catch (error) {
            console.error("OpenAIService getChatVideoAnalysis Error:", error);
            throw error;
        }
    }
}
