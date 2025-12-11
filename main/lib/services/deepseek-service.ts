import { OpenAI } from 'openai';
import * as dotenv from 'dotenv';
import { ChatCompletionTool } from 'openai/resources/chat/completions';

dotenv.config();

export interface DeepSeekMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    tool_call_id?: string;
}

export interface DeepSeekToolCall {
    id: string;
    function: {
        name: string;
        arguments: string;
    };
}

export interface DeepSeekChatResponse {
    content: string | null;
    tool_calls?: DeepSeekToolCall[];
}

/**
 * DeepSeek AI Service
 * Usa a API compatível com OpenAI do DeepSeek
 */
export class DeepSeekService {
    private client: OpenAI;
    private model: string = "deepseek-chat";

    constructor() {
        const apiKey = process.env.DEEPSEEK_API_KEY || '';
        if (!apiKey) {
            console.error("DeepSeek API Key missing! Please add DEEPSEEK_API_KEY to your .env file");
        }
        
        // DeepSeek usa uma API compatível com OpenAI
        this.client = new OpenAI({ 
            apiKey: apiKey,
            baseURL: 'https://api.deepseek.com'
        });
    }

    /**
     * Get chat completion with optional function calling
     */
    public async getChatCompletion(messages: DeepSeekMessage[], tools?: ChatCompletionTool[]): Promise<DeepSeekChatResponse> {
        try {
            // Sanitize messages to ensure DeepSeek compatibility
            const sanitizedMessages = messages.map(msg => {
                // Ensure all messages have a valid role
                if (!msg.role || !['user', 'assistant', 'system', 'tool'].includes(msg.role)) {
                    console.warn('DeepSeek: Invalid message role, defaulting to user', msg);
                    return { role: 'user' as const, content: msg.content || '' };
                }

                // For assistant messages with tool_calls
                if (msg.role === 'assistant') {
                    const result: any = {
                        role: 'assistant',
                        content: msg.content || null
                    };
                    
                    // Preserve and normalize tool_calls if present
                    if ((msg as any).tool_calls) {
                        // Ensure each tool_call has the required 'type' field
                        result.tool_calls = (msg as any).tool_calls.map((tc: any) => ({
                            id: tc.id,
                            type: tc.type || 'function', // DeepSeek requires this field
                            function: tc.function
                        }));
                    }
                    
                    return result;
                }

                // For tool messages, DeepSeek expects a specific format
                if (msg.role === 'tool') {
                    return {
                        role: 'tool' as const,
                        content: msg.content,
                        tool_call_id: msg.tool_call_id || 'unknown'
                    };
                }

                // For other messages, just keep role and content
                return {
                    role: msg.role,
                    content: msg.content || ''
                };
            }).filter(msg => {
                // Don't filter assistant messages even if content is empty (they might have tool_calls)
                if (msg.role === 'assistant' && (msg as any).tool_calls) {
                    return true;
                }
                // Filter out other empty messages
                return msg.content !== '' && msg.content !== null;
            });

            if (sanitizedMessages.length !== messages.length) {
                console.log(`DeepSeek: Filtered out ${messages.length - sanitizedMessages.length} empty or invalid messages`);
            }

            // Validate tool message sequence (DeepSeek requires tool messages to follow assistant messages with tool_calls)
            for (let i = 0; i < sanitizedMessages.length; i++) {
                const msg = sanitizedMessages[i];
                if (msg.role === 'tool') {
                    // Find the previous assistant message with tool_calls
                    let foundPrecedingToolCall = false;
                    for (let j = i - 1; j >= 0; j--) {
                        const prevMsg = sanitizedMessages[j];
                        if (prevMsg.role === 'assistant' && (prevMsg as any).tool_calls) {
                            foundPrecedingToolCall = true;
                            break;
                        }
                        // If we hit another assistant message without tool_calls, stop
                        if (prevMsg.role === 'assistant') {
                            break;
                        }
                    }
                    
                    if (!foundPrecedingToolCall) {
                        console.warn(`DeepSeek: Tool message at index ${i} has no preceding assistant message with tool_calls, removing it`);
                        sanitizedMessages.splice(i, 1);
                        i--; // Adjust index after removal
                    }
                }
            }

            console.log(`DeepSeek: Sending ${sanitizedMessages.length} messages to API`);

            const requestConfig: any = {
                model: this.model,
                temperature: 0.7,
                messages: sanitizedMessages,
                max_tokens: 150
            };

            if (tools && tools.length > 0) {
                requestConfig.tools = tools;
                requestConfig.tool_choice = 'auto';
            }

            const response = await this.client.chat.completions.create(requestConfig);

            const message = response.choices[0].message;
            
            // Check if there are tool calls
            if (message.tool_calls && message.tool_calls.length > 0) {
                const toolCalls: DeepSeekToolCall[] = message.tool_calls.map((tc: any) => ({
                    id: tc.id,
                    function: {
                        name: tc.function.name,
                        arguments: tc.function.arguments
                    }
                }));

                return {
                    content: message.content,
                    tool_calls: toolCalls
                };
            }

            return {
                content: message.content
            };
        } catch (error: any) {
            console.error("DeepSeekService Error:", error);
            console.error("DeepSeek Error Details:", {
                message: error.message,
                status: error.status,
                type: error.type
            });
            
            // Log sanitized messages for debugging
            if (error.message && error.message.includes('missing field')) {
                console.error("Messages sent to DeepSeek (for debugging):");
                console.error(JSON.stringify(messages.slice(-5), null, 2));
            }
            
            throw error;
        }
    }

    /**
     * Get the current model name
     */
    public getModel(): string {
        return this.model;
    }

    /**
     * Set the model to use
     */
    public setModel(model: string) {
        this.model = model;
        console.log(`DeepSeekService: Model changed to ${model}`);
    }
}
