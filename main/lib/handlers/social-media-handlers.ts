/**
 * Social Media Handlers
 * 
 * Handlers IPC para a janela Social Media.
 * Gerencia comunicação entre o renderer e o serviço Social Media.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { 
  SocialMediaService, 
  getSocialMediaService, 
  destroySocialMediaServiceInstance 
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
// HANDLERS
// ========================================

/**
 * Registra todos os handlers IPC do Social Media
 */
export function registerSocialMediaHandlers(): void {
  // Handler de exemplo - adicione mais conforme necessário
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

  console.log('✅ [SocialMedia] Handlers registered');
}
