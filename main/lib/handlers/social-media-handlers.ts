/**
 * Social Media Handlers
 * 
 * Handlers IPC para a janela Social Media.
 * Gerencia comunicação entre o renderer e o serviço Social Media (Puppeteer).
 */

import { ipcMain, BrowserWindow, dialog } from 'electron';
import { 
  SocialMediaService, 
  getSocialMediaService, 
  destroySocialMediaServiceInstance,
  SocialPlatform,
  PlatformVerificationResult
} from '../services/social-media-service';

// ========================================
// STATE
// ========================================

let socialMediaService: SocialMediaService | null = null;
let getWindowFn: (() => BrowserWindow | null) | null = null;

// ========================================
// INITIALIZATION
// ========================================

/**
 * Retorna o serviço Social Media (para uso externo quando necessário)
 */
export function getSocialMediaServiceInstance(): SocialMediaService | null {
  return socialMediaService;
}

/**
 * Inicializa o serviço Social Media e configura event listeners
 * @param getWindow Função que retorna a janela do Social Media
 */
export function initializeSocialMediaService(getWindow: () => BrowserWindow | null): void {
  if (socialMediaService) return; // Já inicializado
  
  getWindowFn = getWindow;
  socialMediaService = getSocialMediaService();
  socialMediaService.initialize();
  
  console.log('✅ [SocialMedia] Handlers service initialized');
}

/**
 * Destroi o serviço Social Media
 */
export function destroySocialMediaService(): void {
  if (socialMediaService) {
    console.log('🛑 [SocialMedia] Destroying social media service...');
    socialMediaService.destroy();
    socialMediaService = null;
    getWindowFn = null;
    destroySocialMediaServiceInstance();
  }
}

// ========================================
// HELPER: Enviar eventos para o frontend
// ========================================

function sendToRenderer(channel: string, ...args: any[]): void {
  const window = getWindowFn?.();
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, ...args);
  }
}

// ========================================
// HANDLERS
// ========================================

/**
 * Registra todos os handlers IPC do Social Media
 */
export function registerSocialMediaHandlers(): void {
  
  // Handler: Verificar status do serviço
  ipcMain.handle('social-media:get-status', async () => {
    try {
      if (!socialMediaService) {
        return { success: false, error: 'Serviço Social Media não inicializado' };
      }
      
      return { 
        success: true, 
        isReady: socialMediaService.isReady() 
      };
    } catch (error: any) {
      console.error('❌ [SocialMedia] Status error:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler: Conectar a uma plataforma (abre Puppeteer)
  ipcMain.handle('social-media:connect-platform', async (event, workspaceId: string, platform: SocialPlatform) => {
    try {
      if (!socialMediaService) {
        return { success: false, error: 'Serviço Social Media não inicializado' };
      }

      console.log(`🔌 [SocialMedia] Conectando ${platform} para workspace ${workspaceId}...`);

      // Inicia conexão com callbacks
      await socialMediaService.connectPlatform(
        workspaceId,
        platform,
        // onStatusChange
        (status) => {
          sendToRenderer('social-media:connection-status', { workspaceId, platform, status });
        },
        // onSuccess
        (username) => {
          sendToRenderer('social-media:connection-success', { workspaceId, platform, username });
        },
        // onError
        (error) => {
          sendToRenderer('social-media:connection-error', { workspaceId, platform, error });
        }
      );

      return { success: true };
    } catch (error: any) {
      console.error('❌ [SocialMedia] Connect error:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler: Cancelar conexão em andamento
  ipcMain.handle('social-media:cancel-connection', async (event, workspaceId: string, platform: SocialPlatform) => {
    try {
      if (!socialMediaService) {
        return { success: false, error: 'Serviço Social Media não inicializado' };
      }

      await socialMediaService.cancelConnection(workspaceId, platform);
      return { success: true };
    } catch (error: any) {
      console.error('❌ [SocialMedia] Cancel error:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler: Verificar se tem credenciais salvas
  ipcMain.handle('social-media:has-credentials', async (event, workspaceId: string, platform: SocialPlatform) => {
    try {
      if (!socialMediaService) {
        return { success: false, error: 'Serviço Social Media não inicializado' };
      }

      const hasCredentials = socialMediaService.hasStoredCredentials(workspaceId, platform);
      return { success: true, hasCredentials };
    } catch (error: any) {
      console.error('❌ [SocialMedia] Check credentials error:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler: Remover credenciais salvas
  ipcMain.handle('social-media:remove-credentials', async (event, workspaceId: string, platform: SocialPlatform) => {
    try {
      if (!socialMediaService) {
        return { success: false, error: 'Serviço Social Media não inicializado' };
      }

      socialMediaService.removeCredentials(workspaceId, platform);
      return { success: true };
    } catch (error: any) {
      console.error('❌ [SocialMedia] Remove credentials error:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler: Abrir navegador para ver a conta
  ipcMain.handle('social-media:open-browser', async (event, workspaceId: string, platform: SocialPlatform) => {
    try {
      if (!socialMediaService) {
        return { success: false, error: 'Serviço Social Media não inicializado' };
      }

      await socialMediaService.openBrowser(workspaceId, platform);
      return { success: true };
    } catch (error: any) {
      console.error('❌ [SocialMedia] Open browser error:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler: Obter plataformas com cookies salvos
  ipcMain.handle('social-media:get-stored-platforms', async (event, workspaceId: string) => {
    try {
      if (!socialMediaService) {
        return { success: false, error: 'Serviço Social Media não inicializado' };
      }

      const platforms = socialMediaService.getStoredPlatforms(workspaceId);
      return { success: true, platforms };
    } catch (error: any) {
      console.error('❌ [SocialMedia] Get stored platforms error:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler: Verificar login de uma plataforma específica (headless)
  ipcMain.handle('social-media:verify-platform-login', async (event, workspaceId: string, platform: SocialPlatform) => {
    try {
      if (!socialMediaService) {
        return { success: false, error: 'Serviço Social Media não inicializado' };
      }

      const result = await socialMediaService.verifyPlatformLogin(workspaceId, platform);
      return { success: true, result };
    } catch (error: any) {
      console.error('❌ [SocialMedia] Verify platform login error:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler: Verificar login de todas as plataformas (headless)
  ipcMain.handle('social-media:verify-all-platforms', async (event, workspaceId: string) => {
    try {
      if (!socialMediaService) {
        return { success: false, error: 'Serviço Social Media não inicializado' };
      }

      const results = await socialMediaService.verifyAllPlatforms(
        workspaceId,
        // Callback de progresso - envia eventos para o frontend
        (data) => {
          sendToRenderer('social-media:verification-progress', {
            workspaceId,
            platform: data.platform,
            status: data.status,
            result: data.result,
            total: data.total,
            current: data.current
          });
        }
      );
      return { success: true, results };
    } catch (error: any) {
      console.error('❌ [SocialMedia] Verify all platforms error:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler: Upload de mídia para uma plataforma
  ipcMain.handle('social-media:upload-media', async (
    event, 
    workspaceId: string, 
    platform: SocialPlatform,
    options: {
      mediaPath: string;
      title?: string;
      description?: string;
      coverPath?: string;
      visibility?: 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
      orientation?: 'square' | 'portrait' | 'landscape';
    }
  ) => {
    try {
      if (!socialMediaService) {
        return { success: false, error: 'Serviço Social Media não inicializado' };
      }

      console.log(`📤 [SocialMedia] Iniciando upload para ${platform}...`);
      sendToRenderer('social-media:upload-status', {
        workspaceId,
        platform,
        status: 'uploading',
        message: 'Iniciando upload...'
      });

      const result = await socialMediaService.uploadMedia(workspaceId, platform, options);
      
      if (result.success) {
        sendToRenderer('social-media:upload-success', {
          workspaceId,
          platform,
          message: 'Mídia publicada com sucesso!'
        });
      } else {
        sendToRenderer('social-media:upload-error', {
          workspaceId,
          platform,
          error: result.error || 'Erro desconhecido'
        });
      }

      return result;
    } catch (error: any) {
      console.error(`❌ [SocialMedia] Upload error for ${platform}:`, error);
      sendToRenderer('social-media:upload-error', {
        workspaceId,
        platform,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  });

  // Handler: Selecionar arquivos de mídia via dialog do sistema
  ipcMain.handle('social-media:select-media', async (event) => {
    try {
      const window = getWindowFn?.();
      if (!window) {
        return { success: false, error: 'Janela não encontrada' };
      }

      const result = await dialog.showOpenDialog(window, {
        title: 'Selecionar mídia',
        properties: ['openFile'],
        filters: [
          { name: 'Vídeos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] },
          { name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
          { name: 'Todos os arquivos', extensions: ['*'] }
        ]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const filePath = result.filePaths[0];
      console.log(`📁 [SocialMedia] Arquivo selecionado: ${filePath}`);
      
      return { 
        success: true, 
        filePath,
        fileName: filePath.split(/[/\\]/).pop() || 'unknown'
      };
    } catch (error: any) {
      console.error('❌ [SocialMedia] Erro ao selecionar arquivo:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('✅ [SocialMedia] Handlers registered');
}
