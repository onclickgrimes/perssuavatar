/**
 * Provider Handlers
 * 
 * Handlers IPC para gerenciar providers de IA via Puppeteer.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { getProviderManager, ProviderPlatform } from '../libs/PuppeteerProvider';

export function registerProviderHandlers(mainWindow: BrowserWindow | null): void {
  const manager = getProviderManager();

  // Lista todos os providers
  ipcMain.handle('provider:list', async () => {
    try {
      const providers = manager.listProviders();
      return { success: true, data: providers };
    } catch (error: any) {
      console.error('❌ Erro ao listar providers:', error);
      return { success: false, error: error.message };
    }
  });

  // Lista providers de uma plataforma
  ipcMain.handle('provider:list-by-platform', async (_event, platform: ProviderPlatform) => {
    try {
      const providers = manager.listProvidersByPlatform(platform);
      return { success: true, data: providers };
    } catch (error: any) {
      console.error('❌ Erro ao listar providers por plataforma:', error);
      return { success: false, error: error.message };
    }
  });

  // Cria um novo provider
  ipcMain.handle('provider:create', async (_event, name: string, platform: ProviderPlatform) => {
    try {
      const provider = manager.createProvider(name, platform);
      return { success: true, data: provider };
    } catch (error: any) {
      console.error('❌ Erro ao criar provider:', error);
      return { success: false, error: error.message };
    }
  });

  // Remove um provider
  ipcMain.handle('provider:delete', async (_event, id: string) => {
    try {
      const result = manager.deleteProvider(id);
      return { success: result };
    } catch (error: any) {
      console.error('❌ Erro ao deletar provider:', error);
      return { success: false, error: error.message };
    }
  });

  // Renomeia um provider
  ipcMain.handle('provider:rename', async (_event, id: string, newName: string) => {
    try {
      const result = manager.renameProvider(id, newName);
      return { success: result };
    } catch (error: any) {
      console.error('❌ Erro ao renomear provider:', error);
      return { success: false, error: error.message };
    }
  });

  // Abre o navegador para login
  ipcMain.handle('provider:open-for-login', async (_event, id: string) => {
    try {
      const result = await manager.openForLogin(id);
      return { success: result.success, isLoggedIn: result.isLoggedIn };
    } catch (error: any) {
      console.error('❌ Erro ao abrir provider para login:', error);
      return { success: false, error: error.message };
    }
  });

  // Verifica status de login
  ipcMain.handle('provider:check-login', async (_event, id: string) => {
    try {
      const isLoggedIn = await manager.checkLoginStatus(id);
      return { success: true, isLoggedIn };
    } catch (error: any) {
      console.error('❌ Erro ao verificar login:', error);
      return { success: false, error: error.message };
    }
  });

  // Fecha o navegador de um provider
  ipcMain.handle('provider:close', async (_event, id: string) => {
    try {
      await manager.closeProvider(id);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Erro ao fechar provider:', error);
      return { success: false, error: error.message };
    }
  });

  // Fecha todos os navegadores
  ipcMain.handle('provider:close-all', async () => {
    try {
      await manager.closeAll();
      return { success: true };
    } catch (error: any) {
      console.error('❌ Erro ao fechar todos os providers:', error);
      return { success: false, error: error.message };
    }
  });

  // Envia mensagem com streaming (Gemini)
  ipcMain.handle('provider:send-message-stream', async (event, id: string, message: string) => {
    try {
      const provider = manager.getGeminiProvider(id);
      
      if (!provider) {
        // Tenta abrir o provider se não estiver ativo
        const result = await manager.openForLogin(id);
        if (!result.success || !result.isLoggedIn) {
          return { success: false, error: 'Provider não está logado. Faça login primeiro.' };
        }
      }

      const geminiProvider = manager.getGeminiProvider(id);
      if (!geminiProvider) {
        return { success: false, error: 'Provider Gemini não encontrado' };
      }

      console.log('💬 [ProviderHandler] Enviando mensagem com stream...');

      // Usa sendMessageWithStream com callback para enviar chunks via evento
      const response = await geminiProvider.sendMessageWithStream(
        message,
        (chunk: string) => {
          // Envia cada chunk para o renderer via evento
          event.sender.send('provider:stream-chunk', { id, chunk });
        }
      );

      // Notifica que o stream terminou
      event.sender.send('provider:stream-complete', { id, response });

      return { success: true, response };
    } catch (error: any) {
      console.error('❌ Erro ao enviar mensagem com stream:', error);
      event.sender.send('provider:stream-error', { id, error: error.message });
      return { success: false, error: error.message };
    }
  });

  // Envia mensagem simples (sem streaming)
  ipcMain.handle('provider:send-message', async (_event, id: string, message: string) => {
    try {
      const geminiProvider = manager.getGeminiProvider(id);
      if (!geminiProvider) {
        return { success: false, error: 'Provider Gemini não encontrado ou não está ativo' };
      }

      console.log('💬 [ProviderHandler] Enviando mensagem...');
      const response = await geminiProvider.sendMessage(message);
      
      return { success: true, response };
    } catch (error: any) {
      console.error('❌ Erro ao enviar mensagem:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('✅ Provider handlers registrados');
}

export function unregisterProviderHandlers(): void {
  const channels = [
    'provider:list',
    'provider:list-by-platform',
    'provider:create',
    'provider:delete',
    'provider:rename',
    'provider:open-for-login',
    'provider:check-login',
    'provider:close',
    'provider:close-all',
    'provider:send-message',
    'provider:send-message-stream'
  ];

  channels.forEach(channel => {
    ipcMain.removeHandler(channel);
  });

  console.log('🔌 Provider handlers removidos');
}
