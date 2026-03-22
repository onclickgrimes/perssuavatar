import { EventEmitter } from 'events';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { OpenAI } from 'openai';
import { getUserSettings, getAssistants, getAssistantById } from '../database';
import { getNextApiKey } from '../credentials';

/**
 * SummaryService - Serviço para gerar resumos baseados no assistente selecionado
 * Usa a IA configurada em aiProvider (openai, gemini, deepseek)
 * Suporta streaming para ir gerando respostas em tempo real
 */
export class SummaryService extends EventEmitter {
    private genAI: GoogleGenerativeAI | null = null;
    private openai: OpenAI | null = null;
    private deepseek: OpenAI | null = null;
    private geminiApiKey: string | null = null;
    private openaiApiKey: string | null = null;
    private deepseekApiKey: string | null = null;
    private abortController: AbortController | null = null;

    constructor() {
        super();
    }

    private getGeminiClient(): GoogleGenerativeAI {
        const apiKey = getNextApiKey('gemini');
        if (!apiKey) {
            throw new Error('Google Gemini API key não configurada.');
        }

        if (this.genAI && this.geminiApiKey === apiKey) {
            return this.genAI;
        }

        this.genAI = new GoogleGenerativeAI(apiKey);
        this.geminiApiKey = apiKey;
        return this.genAI;
    }

    private getOpenAIClient(): OpenAI {
        const apiKey = getNextApiKey('openai');
        if (!apiKey) {
            throw new Error('OpenAI API key não configurada.');
        }

        if (this.openai && this.openaiApiKey === apiKey) {
            return this.openai;
        }

        this.openai = new OpenAI({ apiKey });
        this.openaiApiKey = apiKey;
        return this.openai;
    }

    private getDeepSeekClient(): OpenAI {
        const apiKey = getNextApiKey('deepseek');
        if (!apiKey) {
            throw new Error('DeepSeek API key não configurada.');
        }

        if (this.deepseek && this.deepseekApiKey === apiKey) {
            return this.deepseek;
        }

        this.deepseek = new OpenAI({
            apiKey,
            baseURL: 'https://api.deepseek.com'
        });
        this.deepseekApiKey = apiKey;
        return this.deepseek;
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
        const model = this.getGeminiClient().getGenerativeModel({ 
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
            // Verificar abort antes de processar cada chunk
            if (this.abortController?.signal.aborted) {
                console.log('[SummaryService] Geração Gemini abortada pelo usuário');
                throw new Error('AbortError');
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
        // Passar o signal do AbortController para a API do OpenAI
        const stream = await this.getOpenAIClient().chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 2048,
            stream: true,
        }, {
            signal: this.abortController?.signal as any
        });

        let fullResponse = '';

        for await (const chunk of stream) {
            // Verificar abort antes de processar cada chunk
            if (this.abortController?.signal.aborted) {
                console.log('[SummaryService] Geração OpenAI abortada pelo usuário');
                throw new Error('AbortError');
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
        // Passar o signal do AbortController para a API do DeepSeek
        const stream = await this.getDeepSeekClient().chat.completions.create({
            model: "deepseek-chat",
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 2048,
            stream: true,
        }, {
            signal: this.abortController?.signal as any
        });

        let fullResponse = '';

        for await (const chunk of stream) {
            // Verificar abort antes de processar cada chunk
            if (this.abortController?.signal.aborted) {
                console.log('[SummaryService] Geração DeepSeek abortada pelo usuário');
                throw new Error('AbortError');
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

            // Instrução de relevância dinâmica - a IA analisa o prompt e decide se a conversa é relevante
            const relevanceInstruction = `
**REGRA CRÍTICA - AVALIAÇÃO DE RELEVÂNCIA CONTEXTUAL:**

Você é um assistente com um propósito específico definido acima. Antes de gerar qualquer resposta, você DEVE:

1. **IDENTIFICAR SUA PERSONA E FOCO**: Analise o prompt do sistema acima e identifique:
   - Qual é sua especialidade/área de atuação
   - Que tipo de conteúdo você deve responder
   - Qual é o propósito principal da sua existência

2. **AVALIAR A RELEVÂNCIA DA CONVERSA**: Verifique se a transcrição contém conteúdo que:
   - Se encaixa na sua área de especialidade
   - Merece uma resposta baseada no seu propósito
   - É substancial o suficiente (não apenas saudações ou ruído)

3. **DECIDIR**: 
   - Se a conversa NÃO for relevante para seu propósito/especialidade → Responda APENAS: [IGNORAR]

**EXEMPLOS DE QUANDO IGNORAR:**
- Saudações simples (oi, olá, bom dia) - sempre ignorar
- Conversas sobre assuntos fora da especialidade do assistente

**LEMBRE-SE:** Você só deve responder quando puder agregar valor real baseado na sua persona e expertise definidas no prompt.
`;

            const fullPrompt = `
            PROMPT DO ASSISTENTE:
            ${systemPrompt}
            ${relevanceInstruction}
            ---
            **TRANSCRIÇÃO DA CONVERSA:**
            ${transcriptionText}
            ---
            **Retorne a SUA RESPOSTA ou [IGNORAR] se não for relevante para sua especialidade:**`;

            let result = '';
            let isIgnored = false;
            let bufferSent = false;
            const IGNORE_CHECK_LENGTH = 15; // Tamanho mínimo para verificar "[IGNORAR]"

            // Handler especial para detectar [IGNORAR] no início
            // Acumula os primeiros caracteres antes de enviar para o frontend
            const wrappedOnChunk = (chunk: string) => {
                result += chunk;
                
                // Se já foi detectado como ignorado, não faz nada
                if (isIgnored) {
                    return;
                }
                
                // Se já enviamos o buffer, continua enviando chunks normalmente
                if (bufferSent) {
                    onChunk(chunk);
                    return;
                }
                
                // Ainda acumulando - verificar se já temos caracteres suficientes
                const trimmedResult = result.trim();
                
                // Verificar se começa com [IGNORAR]
                if (trimmedResult.startsWith('[IGNORAR]')) {
                    isIgnored = true;
                    console.log('[SummaryService] Detectado [IGNORAR] - não enviando ao frontend');
                    return;
                }
                
                // Se temos caracteres suficientes e NÃO começa com [IGNORAR], enviar buffer acumulado
                if (trimmedResult.length >= IGNORE_CHECK_LENGTH) {
                    bufferSent = true;
                    onChunk(result); // Envia todo o buffer acumulado de uma vez
                }
            };
            // console.log(`[SummaryService] Prompt final: ${fullPrompt}`);

            await this.generateContent(fullPrompt, wrappedOnChunk);

            // Se foi ignorado, retornar vazio
            if (isIgnored || result.trim() === '[IGNORAR]' || result.trim().startsWith('[IGNORAR]')) {
                console.log(`[SummaryService] Conversa ignorada (não relevante)`);
                return '';
            }
            
            // Se o buffer ainda não foi enviado (resposta muito curta), enviar agora
            if (!bufferSent && result.trim().length > 0) {
                onChunk(result);
            }

            console.log(`[SummaryService] Resumo gerado com sucesso (${result.length} caracteres)`);
            return result;

        } catch (error: any) {
            // Capturar tanto AbortError quanto erro de rede por abort
            if (error.name === 'AbortError' || error.message === 'AbortError' || this.abortController?.signal.aborted) {
                console.log('[SummaryService] Geração de resumo abortada pelo usuário');
                return '';
            }
            console.error('[SummaryService] Erro ao gerar resumo:', error);
            throw error;
        } finally {
            this.abortController = null;
        }
    }

    /**
     * Gera sugestões de follow-up usando o followUpPrompt do assistente
     * @param transcription Array de mensagens da transcrição
     * @returns Array de sugestões de follow-up
     */
    public async generateFollowUp(
        transcription: Array<{ speaker: string; text: string }>
    ): Promise<string[]> {
        try {
            const assistant = this.getSelectedAssistant();
            
            if (!assistant) {
                throw new Error("Nenhum assistente encontrado");
            }

            const followUpPrompt = assistant.followUpPrompt;
            if (!followUpPrompt) {
                console.log('[SummaryService] Nenhum followUpPrompt configurado');
                return [];
            }

            const provider = this.getAIProvider();
            console.log(`[SummaryService] Gerando follow-up com assistente: ${assistant.name} (Provider: ${provider})`);

            // Formatar a transcrição para o prompt
            const transcriptionText = transcription
                .map(msg => `${msg.speaker}: ${msg.text}`)
                .join('\n');

            const fullPrompt = `
**TRANSCRIÇÃO DA CONVERSA:**
${transcriptionText}

---
**INSTRUÇÕES:**
${followUpPrompt}`;

            let result = '';
            
            // Gerar sem streaming (mais simples para este caso)
            await this.generateContent(fullPrompt, (chunk) => {
                result += chunk;
            });

            // Se for vazio ou ignorar, retornar array vazio
            if (!result || result.trim() === '[VAZIO]' || result.trim().startsWith('[IGNORAR]')) {
                console.log('[SummaryService] Follow-up vazio ou ignorado');
                return [];
            }

            // Parsear os tópicos (um por linha)
            const topics = result
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && !line.startsWith('[') && !line.startsWith('-'))
                .map(line => line.replace(/^[\d\.\)\-\*]+\s*/, '')); // Remove numeração

            console.log(`[SummaryService] Follow-up gerado: ${topics.length} tópicos`);
            return topics;

        } catch (error: any) {
            console.error('[SummaryService] Erro ao gerar follow-up:', error);
            return [];
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

    /**
     * Explica uma palavra ou termo específico usando o systemPrompt do assistente
     * @param word A palavra/termo a ser explicado
     * @param context Contexto do resumo onde a palavra aparece (opcional)
     * @param onChunk Callback para streaming da resposta
     * @returns A explicação gerada
     */
    public async explainWord(
        word: string,
        context: string = '',
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
            console.log(`[SummaryService] Explicando palavra "${word}" com assistente: ${assistant.name} (Provider: ${provider})`);

            const systemPrompt = assistant.systemPrompt || '';

            // Construir prompt para explicar a palavra
            const explainPrompt = `
PROMPT DO ASSISTENTE:
${systemPrompt}

---

**TAREFA:** Explique de forma clara e concisa o termo/palavra a seguir.

${context ? `**CONTEXTO ONDE A PALAVRA APARECE:**
${context}

---` : ''}

**PALAVRA/TERMO A EXPLICAR:** ${word}

**INSTRUÇÕES:**
- Forneça uma explicação clara e direta
- Use exemplos práticos quando apropriado
- Adapte a explicação ao contexto do assistente acima
- Responda no mesmo idioma da palavra/contexto
- Seja conciso mas informativo

**SUA EXPLICAÇÃO:**`;

            let result = '';

            await this.generateContent(explainPrompt, (chunk) => {
                result += chunk;
                onChunk(chunk);
            });

            console.log(`[SummaryService] Explicação gerada com sucesso (${result.length} caracteres)`);
            return result;

        } catch (error: any) {
            // Capturar tanto AbortError quanto erro de rede por abort
            if (error.name === 'AbortError' || error.message === 'AbortError' || this.abortController?.signal.aborted) {
                console.log('[SummaryService] Explicação de palavra abortada pelo usuário');
                return '';
            }
            console.error('[SummaryService] Erro ao explicar palavra:', error);
            throw error;
        } finally {
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
