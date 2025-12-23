/**
 * Niche Service
 * 
 * Gerencia nichos de canais para personalização da criação de vídeos.
 */
import { Knex } from 'knex';
import db from '../../../db';

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
    use_highlight_words?: boolean;
    entry_animations?: string[];
    exit_animations?: string[];
    
    // Stock footage
    use_stock_footage?: boolean;
    stock_categories?: string[];
    stock_rules?: string;
    
    // Visual
    default_colors?: string[];
    default_font?: string;
    components_allowed?: string[];
    
    created_at?: string;
    updated_at?: string;
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
    generateAIPromptForNiche(niche: ChannelNiche): string {
        let prompt = niche.ai_prompt || '';

        // Adicionar restrições de componentes
        if (niche.components_allowed && niche.components_allowed.length > 0) {
            prompt += `\n\nCOMPONENTES REMOTION PERMITIDOS:\n- ${niche.components_allowed.join('\n- ')}`;
            prompt += `\nNÃO use outros componentes além dos listados.`;
        }

        // Adicionar tipos de assets
        if (niche.asset_types && niche.asset_types.length > 0) {
            prompt += `\n\nTIPOS DE ASSETS PERMITIDOS:\n- ${niche.asset_types.join('\n- ')}`;
        }

        // Adicionar emoções preferidas
        if (niche.emotions && niche.emotions.length > 0) {
            prompt += `\n\nEMOÇÕES PREFERIDAS:\n- ${niche.emotions.join(', ')}`;
        }

        // Adicionar movimentos de câmera
        if (niche.camera_movements && niche.camera_movements.length > 0) {
            prompt += `\n\nMOVIMENTOS DE CÂMERA PERMITIDOS:\n- ${niche.camera_movements.join(', ')}`;
        }

        // Adicionar transições
        if (niche.transitions && niche.transitions.length > 0) {
            prompt += `\n\nTRANSIÇÕES PERMITIDAS:\n- ${niche.transitions.join(', ')}`;
        }

        // Animações
        if (niche.entry_animations && niche.entry_animations.length > 0) {
            prompt += `\n\nANIMAÇÕES DE ENTRADA:\n- ${niche.entry_animations.join(', ')}`;
        }
        if (niche.exit_animations && niche.exit_animations.length > 0) {
            prompt += `\n\nANIMAÇÕES DE SAÍDA:\n- ${niche.exit_animations.join(', ')}`;
        }

        // Regras de highlight
        if (!niche.use_highlight_words) {
            prompt += `\n\nNÃO use highlight_words neste nicho.`;
        }

        // Stock footage
        if (niche.use_stock_footage && niche.stock_rules) {
            prompt += `\n\nREGRAS DE STOCK FOOTAGE:\n${niche.stock_rules}`;
        }

        return prompt;
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
            'default_colors', 'components_allowed'
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
