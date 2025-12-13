import { EventEmitter } from 'events';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { OpenAI } from 'openai';
import * as dotenv from 'dotenv';
import { getUserSettings, getAssistants, getAssistantById } from '../database';

dotenv.config();

/**
 * SummaryService - Serviço para gerar resumos baseados no assistente selecionado
 * Usa a IA configurada em aiProvider (openai, gemini, deepseek)
 * Suporta streaming para ir gerando respostas em tempo real
 */
export class SummaryService extends EventEmitter {
    private genAI: GoogleGenerativeAI;
    private openai: OpenAI;
    private deepseek: OpenAI;
    private abortController: AbortController | null = null;

    constructor() {
        super();
        
        // Inicializar Gemini
        const geminiApiKey = process.env.GOOGLE_API_KEY || '';
        if (!geminiApiKey) {
            console.warn("[SummaryService] Google API Key missing!");
        }
        this.genAI = new GoogleGenerativeAI(geminiApiKey);
        
        // Inicializar OpenAI
        const openaiApiKey = process.env.OPENAI_API_KEY || '';
        if (!openaiApiKey) {
            console.warn("[SummaryService] OpenAI API Key missing!");
        }
        this.openai = new OpenAI({ apiKey: openaiApiKey });
        
        // Inicializar DeepSeek
        const deepseekApiKey = process.env.DEEPSEEK_API_KEY || '';
        if (!deepseekApiKey) {
            console.warn("[SummaryService] DeepSeek API Key missing!");
        }
        this.deepseek = new OpenAI({ 
            apiKey: deepseekApiKey,
            baseURL: 'https://api.deepseek.com'
        });
    }

    /**
     * Obtém o provider de IA configurado
     */
    private getAIProvider(): 'openai' | 'gemini' | 'deepseek' {
        const settings = getUserSettings();
        return settings.aiProvider || 'gemini';
    }

    /**
     * Obtém o assistente atualmente selecionado
     */
    public getSelectedAssistant() {
        const settings = getUserSettings();
        const selectedAssistantId = settings.selectedAssistant || 'general';
        
        const assistant = getAssistantById(selectedAssistantId);
        if (!assistant) {
            // Fallback para o primeiro assistente
            const assistants = getAssistants();
            return assistants[0] || null;
        }
        
        return assistant;
    }

    /**
     * Gera conteúdo usando Gemini com streaming
     */
    private async generateWithGemini(prompt: string, onChunk: (chunk: string) => void): Promise<string> {
        const model = this.genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048,
            }
        });

        const result = await model.generateContentStream({
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });

        let fullResponse = '';

        for await (const chunk of result.stream) {
            if (this.abortController?.signal.aborted) {
                break;
            }

            const chunkText = chunk.text();
            if (chunkText) {
                fullResponse += chunkText;
                onChunk(chunkText);
            }
        }

        return fullResponse;
    }

    /**
     * Gera conteúdo usando OpenAI com streaming
     */
    private async generateWithOpenAI(prompt: string, onChunk: (chunk: string) => void): Promise<string> {
        const stream = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 2048,
            stream: true,
        });

        let fullResponse = '';

        for await (const chunk of stream) {
            if (this.abortController?.signal.aborted) {
                break;
            }

            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                fullResponse += content;
                onChunk(content);
            }
        }

        return fullResponse;
    }

    /**
     * Gera conteúdo usando DeepSeek com streaming
     */
    private async generateWithDeepSeek(prompt: string, onChunk: (chunk: string) => void): Promise<string> {
        const stream = await this.deepseek.chat.completions.create({
            model: "deepseek-chat",
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 2048,
            stream: true,
        });

        let fullResponse = '';

        for await (const chunk of stream) {
            if (this.abortController?.signal.aborted) {
                break;
            }

            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                fullResponse += content;
                onChunk(content);
            }
        }

        return fullResponse;
    }

    /**
     * Gera conteúdo usando o provider configurado
     */
    private async generateContent(prompt: string, onChunk: (chunk: string) => void): Promise<string> {
        const provider = this.getAIProvider();
        console.log(`[SummaryService] Usando provider: ${provider}`);

        switch (provider) {
            case 'openai':
                return this.generateWithOpenAI(prompt, onChunk);
            case 'deepseek':
                return this.generateWithDeepSeek(prompt, onChunk);
            case 'gemini':
            default:
                return this.generateWithGemini(prompt, onChunk);
        }
    }

    /**
     * Gera um resumo da transcrição usando o assistente selecionado
     * Só gera se a conversa tiver conteúdo relevante/substancial
     * @param transcription Array de mensagens da transcrição
     * @param onChunk Callback chamado para cada chunk de texto gerado
     * @returns O resumo gerado, ou string vazia se não for relevante
     */
    public async generateSummary(
        transcription: Array<{ speaker: string; text: string }>,
        onChunk: (chunk: string) => void
    ): Promise<string> {
        // Abortar qualquer geração anterior em andamento
        this.abort();
        
        this.abortController = new AbortController();
        
        try {
            const assistant = this.getSelectedAssistant();
            
            if (!assistant) {
                throw new Error("Nenhum assistente encontrado");
            }

            const provider = this.getAIProvider();
            console.log(`[SummaryService] Gerando resumo com assistente: ${assistant.name} (Provider: ${provider})`);

            // Formatar a transcrição para o prompt
            const transcriptionText = transcription
                .map(msg => `${msg.speaker}: ${msg.text}`)
                .join('\n');

            // Construir o prompt baseado no assistente
            const systemPrompt = assistant.systemPrompt || '';

            // Prompt simplificado para gerar resumos curtos e focados
            const summaryPrompt = `
**CONTEXTO DO ASSISTENTE:**
${systemPrompt}

---

**SUA TAREFA:**
1. Analise o prompt acima e identifique qual é o TEMA/ASSUNTO focal desse assistente.
2. Verifique se a transcrição abaixo contém algo relevante para esse tema.
3. Se NÃO for relevante (saudações, ruídos, assuntos fora do tema) → Responda APENAS: [IGNORAR]
4. Se FOR relevante → Gere uma BREVE explicação ou insight sobre o assunto discutido.

**REGRAS DO RESUMO:**
- Máximo 5 linhas
- Seja direto e objetivo
- Foque apenas no que é relevante para o tema do assistente
- Não repita o que foi dito, agregue valor

---

**TRANSCRIÇÃO:**
${transcriptionText}

---

**RESPOSTA (máximo 5 linhas, ou [IGNORAR]):**`;

            let result = '';
            let isIgnored = false;

            // Handler especial para detectar [IGNORAR] no início
            const wrappedOnChunk = (chunk: string) => {
                result += chunk;
                
                // Verificar se começa com [IGNORAR]
                if (result.trim().startsWith('[IGNORAR]')) {
                    isIgnored = true;
                    // Não repassar chunks para o frontend
                    return;
                }
                
                // Só repassa se não foi ignorado
                if (!isIgnored) {
                    onChunk(chunk);
                }
            };

            await this.generateContent(summaryPrompt, wrappedOnChunk);

            // Se foi ignorado, retornar vazio
            if (isIgnored || result.trim() === '[IGNORAR]' || result.trim().startsWith('[IGNORAR]')) {
                console.log(`[SummaryService] Conversa ignorada (não relevante)`);
                return '';
            }

            console.log(`[SummaryService] Resumo gerado com sucesso (${result.length} caracteres)`);
            return result;

        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log('[SummaryService] Geração abortada');
                return '';
            }
            console.error('[SummaryService] Erro ao gerar resumo:', error);
            throw error;
        } finally {
            this.abortController = null;
        }
    }

    /**
     * Gera resposta para uma pergunta sobre a transcrição
     * @param transcription Array de mensagens da transcrição
     * @param question Pergunta do usuário
     * @param previousSummary Resumo anterior gerado (se houver)
     * @param onChunk Callback chamado para cada chunk de texto gerado
     */
    public async askQuestion(
        transcription: Array<{ speaker: string; text: string }>,
        question: string,
        previousSummary: string | null,
        onChunk: (chunk: string) => void
    ): Promise<string> {
        // Abortar qualquer geração anterior em andamento
        this.abort();
        
        this.abortController = new AbortController();
        
        try {
            const assistant = this.getSelectedAssistant();
            
            if (!assistant) {
                throw new Error("Nenhum assistente encontrado");
            }

            const provider = this.getAIProvider();
            console.log(`[SummaryService] Respondendo pergunta com assistente: ${assistant.name} (Provider: ${provider})`);

            // Formatar a transcrição para o prompt
            const transcriptionText = transcription
                .map(msg => `${msg.speaker}: ${msg.text}`)
                .join('\n');

            // Construir o prompt
            const systemPrompt = assistant.systemPrompt || '';
            const behaviorPrompt = assistant.avatarBehaviorPrompt || '';

            let contextSection = '';
            if (previousSummary) {
                contextSection = `**RESUMO ANTERIOR:**
${previousSummary}

`;
            }

            const fullPrompt = `${systemPrompt}

${behaviorPrompt}

---

**TRANSCRIÇÃO DA CONVERSA:**
${transcriptionText}

${contextSection}---

**PERGUNTA DO USUÁRIO:**
${question}

---

**SUA RESPOSTA:**`;

            const result = await this.generateContent(fullPrompt, onChunk);

            console.log(`[SummaryService] Resposta gerada com sucesso (${result.length} caracteres)`);
            return result;

        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log('[SummaryService] Geração abortada');
                return '';
            }
            console.error('[SummaryService] Erro ao responder pergunta:', error);
            throw error;
        } finally {
            this.abortController = null;
        }
    }

    /**
     * Aborta a geração atual
     */
    public abort() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
}

// Singleton
let summaryServiceInstance: SummaryService | null = null;

export function getSummaryService(): SummaryService {
    if (!summaryServiceInstance) {
        summaryServiceInstance = new SummaryService();
    }
    return summaryServiceInstance;
}
