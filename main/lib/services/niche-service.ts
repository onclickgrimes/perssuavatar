/**
 * Niche Service
 * 
 * Gerencia nichos de canais para personalização da criação de vídeos.
 */
import { Knex } from 'knex';
import db from '../../../db';
import { 
    ASSET_DEFINITIONS, 
    type AssetType,
    CAMERA_MOVEMENTS,
    TRANSITIONS
} from '../../../remotion/types/project';

export interface ChannelNiche {
    id?: number;
    name: string;
    description?: string;
    icon?: string;
    ai_prompt: string;
    
    // Configurações de assets
    asset_types?: string[];
    emotions?: string[];
    use_image_prompts?: boolean;
    camera_movements?: string[];
    transitions?: string[];
    entry_animations?: string[];
    exit_animations?: string[];
    
    // Stock footage
    stock_categories?: string[];
    stock_rules?: string;
    
    // Visual
    default_colors?: string[];
    default_font?: string;
    components_allowed?: string[];
    
    // Vozes e TTS
    tts_provider?: string;
    voice_id?: string;
    voice_styles?: string[];
    
    created_at?: string;
    updated_at?: string;
}

export interface NicheReferenceContextItem {
    id: number;
    label?: string;
    prompt_en?: string;
    reference_id?: number | null;
}

export interface NicheAnalysisContext {
    characters?: NicheReferenceContextItem[];
    locations?: NicheReferenceContextItem[];
}

export class NicheService {
    private db: Knex;
    private tableName = 'channel_niches';

    constructor() {
        // Usar a instância compartilhada do banco de dados
        this.db = db;
    }

    /**
     * Retorna todos os nichos cadastrados
     */
    async getAllNiches(): Promise<ChannelNiche[]> {
        try {
            console.log('[NicheService] Getting all niches...');
            const rows = await this.db(this.tableName).select('*').orderBy('name');
            console.log('[NicheService] Found', rows.length, 'niches');
            return rows.map((row) => this.parseJsonFields(row));
        } catch (error: any) {
            console.error('[NicheService] Error in getAllNiches:', error.message || error);
            throw error;
        }
    }

    /**
     * Busca um nicho por ID
     */
    async getNicheById(id: number): Promise<ChannelNiche | null> {
        const row = await this.db(this.tableName).where({ id }).first();
        if (!row) return null;
        return this.parseJsonFields(row);
    }

    /**
     * Busca um nicho por nome
     */
    async getNicheByName(name: string): Promise<ChannelNiche | null> {
        const row = await this.db(this.tableName).where({ name }).first();
        if (!row) return null;
        return this.parseJsonFields(row);
    }

    /**
     * Cria um novo nicho
     */
    async createNiche(niche: Omit<ChannelNiche, 'id' | 'created_at' | 'updated_at'>): Promise<ChannelNiche> {
        const payload = this.stringifyJsonFields({
            ...niche,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });

        const [id] = await this.db(this.tableName).insert(payload);
        return this.getNicheById(id) as Promise<ChannelNiche>;
    }

    /**
     * Atualiza um nicho existente
     */
    async updateNiche(id: number, updates: Partial<ChannelNiche>): Promise<ChannelNiche | null> {
        const payload = this.stringifyJsonFields({
            ...updates,
            updated_at: new Date().toISOString(),
        });

        await this.db(this.tableName).where({ id }).update(payload);
        return this.getNicheById(id);
    }

    /**
     * Deleta um nicho
     */
    async deleteNiche(id: number): Promise<boolean> {
        const deleted = await this.db(this.tableName).where({ id }).del();
        return deleted > 0;
    }

    /**
     * Gera o prompt completo para a IA baseado no nicho
     */
    generateAIPromptForNiche(niche: ChannelNiche, context?: NicheAnalysisContext): string {
        let prompt = niche.ai_prompt || '';

        const hasCharacterContext = Array.isArray(context?.characters) && context!.characters!.length > 0;
        const hasLocationContext = Array.isArray(context?.locations) && context!.locations!.length > 0;
        const contextHasReferences = hasCharacterContext || hasLocationContext;

        if (contextHasReferences) {
            prompt += '\n\nREFERÊNCIAS VISUAIS JÁ DEFINIDAS (USE ESTAS IDs NA ANÁLISE):';

            if (hasCharacterContext) {
                prompt += '\n\nPERSONAGENS DISPONÍVEIS:';
                for (const character of context!.characters!) {
                    const label = (character.label || '').trim();
                    prompt += `\n- ID ${character.id}: ${label}`;
                }
            }

            if (hasLocationContext) {
                prompt += '\n\nLUGARES DISPONÍVEIS:';
                for (const location of context!.locations!) {
                    const label = (location.label || '').trim();
                    prompt += `\n- ID ${location.id}: ${label}`;
                }
            }
            
            prompt += `\n\nREGRAS DE REFERÊNCIAS POR CENA:`;
            prompt += `\n- Em CADA segmento, retorne "IdOfTheCharactersInTheScene" e "IdOfTheLocationInTheScene".`;
            prompt += `\n- Se houver personagens/lugares de referência acima, use essas IDs.`;
            prompt += `\n- Quando não houver personagem ou lugar aplicável na cena, retorne null para o campo correspondente.`;
        }

        // Adicionar restrições de componentes
        if (niche.components_allowed && niche.components_allowed.length > 0) {
            prompt += `\n\nCOMPONENTES REMOTION PERMITIDOS:\n- ${niche.components_allowed.join('\n- ')}`;
            prompt += `\nNÃO use outros componentes além dos listados.`;
        }

        // Adicionar tipos de assets PERMITIDOS com descrições para a IA escolher
        if (niche.asset_types && niche.asset_types.length > 0) {
            prompt += `\n\nTIPOS DE assetType:`;
            for (const assetType of niche.asset_types) {
                const assetInfo = ASSET_DEFINITIONS[assetType as AssetType];
                const desc = assetInfo?.aiDescription || assetType;
                prompt += `\n- **${assetType}**: ${desc}`;
            }
            prompt += `\n\n⚠️ IMPORTANTE: Para cada cena, você DEVE escolher o "assetType" mais apropriado dentre os listados acima.`;
            
            // // Se video_stock está disponível, dar contexto adicional
            // if (niche.asset_types.includes('video_stock')) {
            //     prompt += `\n\n📹 QUANDO USAR video_stock:`;
            //     prompt += `\n- Use video_stock quando a cena descrever ações, pessoas, lugares ou movimentos que são facilmente encontrados em banco de vídeos stock`;
            //     prompt += `\n- Escreva o imagePrompt em inglês com palavras-chave descritivas para busca semântica`;
            //     prompt += `\n- Exemplo: "businessman working on laptop in modern office" ou "aerial view of ocean waves at sunset"`;
            // }
        }

        // Adicionar emoções preferidas
        if (niche.emotions && niche.emotions.length > 0) {
            prompt += `\n\nEMOÇÕES PREFERIDAS:\n- ${niche.emotions.join(', ')}`;
        }

        // Adicionar movimentos de câmera com descrições
        if (niche.camera_movements && niche.camera_movements.length > 0) {
            prompt += `\n\n**cameraMovement**: Movimento de câmera sugerido (escolha UM dos permitidos):`;
            for (const movement of niche.camera_movements) {
                const config = CAMERA_MOVEMENTS[movement as keyof typeof CAMERA_MOVEMENTS];
                if (config) {
                    prompt += `\n- **${movement}**: ${config.description}`;
                } else {
                    prompt += `\n- **${movement}**`;
                }
            }
        }

        // Adicionar transições com descrições
        if (niche.transitions && niche.transitions.length > 0) {
            prompt += `\n\n**transition**: Transição para a próxima cena (escolha UMA das permitidas):`;
            for (const transition of niche.transitions) {
                const config = TRANSITIONS[transition as keyof typeof TRANSITIONS];
                if (config) {
                    prompt += `\n- **${transition}**: ${config.description}`;
                } else {
                    prompt += `\n- **${transition}**`;
                }
            }
        }

        // Animações
        if (niche.entry_animations && niche.entry_animations.length > 0) {
            prompt += `\n\nANIMAÇÕES DE ENTRADA:\n- ${niche.entry_animations.join(', ')}`;
        }
        if (niche.exit_animations && niche.exit_animations.length > 0) {
            prompt += `\n\nANIMAÇÕES DE SAÍDA:\n- ${niche.exit_animations.join(', ')}`;
        }

        // Regras de highlight - verificar se componente HighlightWord está permitido
        const useHighlightWords = niche.components_allowed?.includes('HighlightWord');
        if (useHighlightWords) {
            prompt += `\n\n**highlightWords**: Array de palavras ou frases-chave que devem ser destacadas visualmente durante a cena.
   Para cada palavra destacada, especifique:
   - **text**: A palavra EXATA como aparece na transcrição (será sincronizada automaticamente com o áudio)
   - **time**: Tempo de aparição em segundos (relativo ao início da cena, ex: 0.5)
   - **duration**: Duração da exibição em segundos (padrão: 1.5s)
   - **entryAnimation**: Animação de entrada
     * **pop** - Escala rápida com bounce
     * **bounce** - Múltiplos bounces ao aparecer
     * **explode** - Explosão com rotação
     * **slide_up** - Desliza de baixo para cima
     * **zoom_in** - Zoom gradual
     * **fade** - Fade in simples
     * **wave** - Texto vazado que enche de baixo pra cima como onda (efeito premium!)
   - **exitAnimation**: Animação de saída
     * **evaporate** - Evapora subindo com partículas
     * **fade** - Fade out simples
     * **implode** - Implosão com rotação
     * **slide_down** - Desliza para baixo
     * **dissolve** - Dissolve com blur
     * **scatter** - Dispersa com partículas
     * **wave** - Texto esvazia de cima pra baixo como onda (efeito premium!)
   - **size**: Tamanho (small, medium, large, huge)
   - **position**: Posição (center, top, top-center, bottom, bottom-center, top-left, top-right, bottom-left, bottom-right, left, center-left, right, center-right)
   - **effect**: Efeito visual (glow, shadow, outline, neon, none)
   - **color**: Cor do texto em HEX (ex: "#FFD700" dourado, "#FF1744" vermelho, "#00E5FF" ciano, "#FFFFFF" branco)
   - **fontWeight**: Peso da fonte (normal, bold, black)
   
   IMPORTANTE: 
   - Especifique o texto EXATAMENTE como aparece na transcrição

   Identifique entre zero e duas palavras-chave importantes por segmento que merecem destaque visual.
   Escolha palavras que sejam:
   - Conceitos-chave ou termos técnicos importantes
   - Números ou estatísticas relevantes
   - Palavras que expressam emoção forte
   - Calls to action ou mensagens principais

   IMPORTANTE: Sempre especifique uma **color** apropriada para o efeito escolhido.`;
        }

        // Stock footage rules (quando video_stock está nos asset_types)
        if (niche.asset_types?.includes('video_stock') && niche.stock_rules) {
            prompt += `\n\nREGRAS DE STOCK FOOTAGE:\n${niche.stock_rules}`;
        }

        // Gerar JSON de exemplo dinâmico baseado nas configurações
        prompt += `\n\n${this.generateExampleJsonForNiche(niche, context)}`;

        return prompt;
    }

    /**
     * Gera o JSON de exemplo para a IA baseado nas configurações do nicho
     */
    private generateExampleJsonForNiche(niche: ChannelNiche, context?: NicheAnalysisContext): string {
        const configuredAssetTypes = niche.asset_types && niche.asset_types.length > 0
            ? niche.asset_types
            : ['image_flux'];
        const hasVideoFrameAnimate = configuredAssetTypes.includes('video_frame_animate');
        const regularAssetTypes = configuredAssetTypes.filter(type => type !== 'video_frame_animate');

        const firstCharacterId = context?.characters?.find(item => Number.isFinite(item.id) && item.id > 0)?.id;
        const firstLocationId = context?.locations?.find(item => Number.isFinite(item.id) && item.id > 0)?.id;
        const characterReferenceIds = (context?.characters || [])
            .map(item => item.id)
            .filter(id => Number.isFinite(id) && id > 0);
        const preferredExampleCharacterIds = [1, 3].filter(id => characterReferenceIds.includes(id));
        const exampleCharacterIds = preferredExampleCharacterIds.length > 1
            ? preferredExampleCharacterIds
            : characterReferenceIds.slice(0, 2);
        const exampleCharactersInScene = exampleCharacterIds.length > 1
            ? exampleCharacterIds.join(',')
            : String(firstCharacterId || '1,3');
        const hasCharacterReferences = Number.isFinite(firstCharacterId) && (firstCharacterId as number) > 0;
        const hasLocationReferences = Number.isFinite(firstLocationId) && (firstLocationId as number) > 0;

        // Construir objeto de exemplo dinamicamente
        const exampleSegment: Record<string, any> = {
            id: 1,
            emotion: niche.emotions && niche.emotions.length > 0 
                ? niche.emotions[0] 
                : 'emoção adequada',
            imagePrompt: 'Prompt in English regarding the chosen asset type.',
            assetType: regularAssetTypes.length > 0
                ? regularAssetTypes.join(' | ')
                : configuredAssetTypes.join(' | '),
        };

        if (hasCharacterReferences) {
            exampleSegment.IdOfTheCharactersInTheScene = exampleCharactersInScene;
        }

        if (hasLocationReferences) {
            exampleSegment.IdOfTheLocationInTheScene = String(firstLocationId);
        }

        // Adicionar cameraMovement se configurado
        if (niche.camera_movements && niche.camera_movements.length > 0) {
            exampleSegment.cameraMovement = niche.camera_movements.join(' | ');
        }

        // Adicionar transition se configurado
        if (niche.transitions && niche.transitions.length > 0) {
            exampleSegment.transition = niche.transitions.join(' | ');
        }

        // Adicionar highlightWords APENAS se componente HighlightWord estiver em components_allowed
        const useHighlightWords = niche.components_allowed?.includes('HighlightWord');
        if (useHighlightWords) {
            const highlightExample: Record<string, any> = {
                text: 'palavra importante',
                duration: 1.5,
                size: 'large',
                position: 'center',
                effect: 'glow',
                color: '#FFD700',
                fontWeight: 'bold',
            };

            // Adicionar animações se configuradas
            if (niche.entry_animations && niche.entry_animations.length > 0) {
                highlightExample.entryAnimation = niche.entry_animations[0];
            }
            if (niche.exit_animations && niche.exit_animations.length > 0) {
                highlightExample.exitAnimation = niche.exit_animations[0];
            }

            exampleSegment.highlightWords = [highlightExample];
        }

        const exampleSegments: Array<Record<string, any>> = [];

        // Se só existir video_frame_animate, o exemplo base já precisa dos campos específicos
        if (hasVideoFrameAnimate && regularAssetTypes.length === 0) {
            delete exampleSegment.imagePrompt;
            exampleSegment.assetType = 'video_frame_animate';
            exampleSegment.firstFrame = 'Detailed English prompt describing the FIRST static frame of this scene.';
            exampleSegment.animateFrame = 'Detailed English prompt to animate the video from the firstFrame while preserving visual consistency.';
            exampleSegments.push(exampleSegment);
        } else {
            exampleSegments.push(exampleSegment);
        }

        // Se houver asset types comuns + video_frame_animate, incluir segundo item específico
        if (hasVideoFrameAnimate && regularAssetTypes.length > 0) {
            const frameAnimateExample: Record<string, any> = {
                id: 2,
                emotion: niche.emotions && niche.emotions.length > 0
                    ? niche.emotions[0]
                    : 'emoção adequada',
                assetType: 'video_frame_animate',
                firstFrame: 'Detailed English prompt describing the FIRST static frame of this scene.',
                animateFrame: 'Detailed English prompt to animate the video from the firstFrame while preserving visual consistency.',
            };

            if (hasCharacterReferences) {
                frameAnimateExample.IdOfTheCharactersInTheScene = exampleCharactersInScene;
            }

            if (hasLocationReferences) {
                frameAnimateExample.IdOfTheLocationInTheScene = String(firstLocationId);
            }

            if (niche.camera_movements && niche.camera_movements.length > 0) {
                frameAnimateExample.cameraMovement = niche.camera_movements.join(' | ');
            }

            if (niche.transitions && niche.transitions.length > 0) {
                frameAnimateExample.transition = niche.transitions.join(' | ');
            }

            exampleSegments.push(frameAnimateExample);
        }

        // Formatar JSON com indentação em um único formato de resposta
        const jsonExample = JSON.stringify([...exampleSegments, '...'], null, 2).replace('"..."', '...');
        return `FORMATO DE RESPOSTA - Responda APENAS com um array JSON válido: ${jsonExample}`;
    }

    /**
     * Parse JSON fields from database row
     */
    private parseJsonFields(row: any): ChannelNiche {
        return {
            ...row,
            asset_types: this.safeJsonParse(row.asset_types),
            emotions: this.safeJsonParse(row.emotions),
            camera_movements: this.safeJsonParse(row.camera_movements),
            transitions: this.safeJsonParse(row.transitions),
            entry_animations: this.safeJsonParse(row.entry_animations),
            exit_animations: this.safeJsonParse(row.exit_animations),
            stock_categories: this.safeJsonParse(row.stock_categories),
            default_colors: this.safeJsonParse(row.default_colors),
            components_allowed: this.safeJsonParse(row.components_allowed),
            voice_styles: this.safeJsonParse(row.voice_styles),
        };
    }

    /**
     * Stringify JSON fields for database insert/update
     */
    private stringifyJsonFields(data: any): any {
        const result = { ...data };
        const jsonFields = [
            'asset_types', 'emotions', 'camera_movements', 'transitions',
            'entry_animations', 'exit_animations', 'stock_categories',
            'default_colors', 'components_allowed', 'voice_styles'
        ];

        for (const field of jsonFields) {
            if (result[field] && typeof result[field] !== 'string') {
                result[field] = JSON.stringify(result[field]);
            }
        }

        return result;
    }

    /**
     * Safe JSON parse
     */
    private safeJsonParse(value: any): any {
        if (!value) return undefined;
        if (typeof value !== 'string') return value;
        try {
            return JSON.parse(value);
        } catch {
            return undefined;
        }
    }
}

// Singleton
let nicheServiceInstance: NicheService | null = null;

export function getNicheService(): NicheService {
    if (!nicheServiceInstance) {
        nicheServiceInstance = new NicheService();
    }
    return nicheServiceInstance;
}
