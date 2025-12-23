/**
 * Niche Handlers
 * 
 * IPC Handlers para gerenciamento de nichos de canais.
 */
import { ipcMain } from 'electron';
import { getNicheService, ChannelNiche } from '../services/niche-service';

export function registerNicheHandlers(): void {
    const nicheService = getNicheService();

    // Listar todos os nichos
    ipcMain.handle('niche:list', async () => {
        try {
            console.log('[NicheHandler] Calling niche:list...');
            const result = await nicheService.getAllNiches();
            console.log('[NicheHandler] niche:list returned', result.length, 'items');
            return result;
        } catch (error: any) {
            console.error('❌ Error listing niches:', error?.message || error);
            console.error('Stack:', error?.stack);
            throw new Error(error?.message || 'Failed to list niches');
        }
    });

    // Buscar nicho por ID
    ipcMain.handle('niche:get', async (_, id: number) => {
        try {
            return await nicheService.getNicheById(id);
        } catch (error: any) {
            console.error('❌ Error getting niche:', error);
            throw error;
        }
    });

    // Buscar nicho por nome
    ipcMain.handle('niche:get-by-name', async (_, name: string) => {
        try {
            return await nicheService.getNicheByName(name);
        } catch (error: any) {
            console.error('❌ Error getting niche by name:', error);
            throw error;
        }
    });

    // Criar nicho
    ipcMain.handle('niche:create', async (_, niche: Omit<ChannelNiche, 'id' | 'created_at' | 'updated_at'>) => {
        try {
            return await nicheService.createNiche(niche);
        } catch (error: any) {
            console.error('❌ Error creating niche:', error);
            throw error;
        }
    });

    // Atualizar nicho
    ipcMain.handle('niche:update', async (_, id: number, updates: Partial<ChannelNiche>) => {
        try {
            return await nicheService.updateNiche(id, updates);
        } catch (error: any) {
            console.error('❌ Error updating niche:', error);
            throw error;
        }
    });

    // Deletar nicho
    ipcMain.handle('niche:delete', async (_, id: number) => {
        try {
            return await nicheService.deleteNiche(id);
        } catch (error: any) {
            console.error('❌ Error deleting niche:', error);
            throw error;
        }
    });

    // Gerar prompt completo para um nicho
    ipcMain.handle('niche:generate-prompt', async (_, nicheId: number) => {
        try {
            const niche = await nicheService.getNicheById(nicheId);
            if (!niche) {
                throw new Error('Niche not found');
            }
            return nicheService.generateAIPromptForNiche(niche);
        } catch (error: any) {
            console.error('❌ Error generating niche prompt:', error);
            throw error;
        }
    });

    console.log('✅ Niche handlers registered');
}
