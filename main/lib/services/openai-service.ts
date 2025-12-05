import { OpenAI } from 'openai';
import * as dotenv from 'dotenv';
import { ChatCompletionTool } from 'openai/resources/chat/completions';

dotenv.config();

export class OpenAIService {
    private openai: OpenAI;
    private model: string = "gpt-4o-mini";

    constructor() {
        const apiKey = process.env.OPENAI_API_KEY || '';
        if (!apiKey) {
            console.error("OpenAI API Key missing!");
        }
        this.openai = new OpenAI({ apiKey: apiKey });
    }

    public async getChatCompletion(messages: any[], tools?: ChatCompletionTool[]) {
        try {
            const response = await this.openai.chat.completions.create({
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
}
