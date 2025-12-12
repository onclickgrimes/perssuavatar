import { shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface ShareOptions {
  platform: 'whatsapp' | 'email' | 'drive';
  recipient?: string;
  message?: string;
  screenshotPath: string;
}

export interface ShareResult {
  success: boolean;
  message: string;
  platform: string;
}

export interface ShareMultipleOptions {
  platforms: ('whatsapp' | 'email' | 'drive')[];
  recipient?: string;
  message?: string;
  screenshotPath: string;
}

export interface ShareMultipleResult {
  success: boolean;
  message: string;
  results: ShareResult[];
}

// Interface para itens de mídia da galeria
export interface GalleryMediaItem {
  id: string;
  type: 'screenshot' | 'video';
  path: string;
  timestamp: number;
}

// Interface para compartilhar todas as mídias da galeria
export interface ShareAllMediaOptions {
  platforms: ('whatsapp' | 'email' | 'drive')[];
  recipient?: string;
  message?: string;
}

export interface ShareAllMediaResult {
  success: boolean;
  message: string;
  mediaCount: number;
  results: ShareResult[];
}

export class ScreenshotShareService {
  // Lista de mídias da galeria (sincronizada com o frontend)
  private galleryMedia: GalleryMediaItem[] = [];

  /**
   * Adiciona uma mídia à lista da galeria
   */
  public addMediaToGallery(item: GalleryMediaItem): void {
    console.log(`📸 Adicionando mídia à galeria: ${item.id} (${item.type})`);
    this.galleryMedia.push(item);
  }

  /**
   * Remove uma mídia da lista da galeria
   */
  public removeMediaFromGallery(id: string): void {
    console.log(`🗑️ Removendo mídia da galeria: ${id}`);
    this.galleryMedia = this.galleryMedia.filter(m => m.id !== id);
  }

  /**
   * Limpa todas as mídias da galeria
   */
  public clearGallery(): void {
    console.log('🗑️ Limpando galeria');
    this.galleryMedia = [];
  }

  /**
   * Obtém todas as mídias da galeria
   */
  public getAllGalleryMedia(): GalleryMediaItem[] {
    return [...this.galleryMedia];
  }

  /**
   * Obtém a contagem de mídias na galeria
   */
  public getGalleryMediaCount(): number {
    return this.galleryMedia.length;
  }

  /**
   * Compartilha um screenshot para a plataforma especificada
   */
  public async shareScreenshot(options: ShareOptions): Promise<ShareResult> {
    console.log(`📤 Compartilhando screenshot para ${options.platform}...`);

    try {
      // Verifica se o arquivo existe
      if (!fs.existsSync(options.screenshotPath)) {
        return {
          success: false,
          message: 'Screenshot não encontrado. Por favor, tire um screenshot primeiro.',
          platform: options.platform,
        };
      }

      switch (options.platform) {
        case 'whatsapp':
          return await this.shareToWhatsApp(options);
        
        case 'email':
          return await this.shareToEmail(options);
        
        case 'drive':
          return await this.shareToDrive(options);
        
        default:
          return {
            success: false,
            message: `Plataforma desconhecida: ${options.platform}`,
            platform: options.platform,
          };
      }
    } catch (error) {
      console.error('Erro ao compartilhar screenshot:', error);
      return {
        success: false,
        message: `Erro ao compartilhar: ${error.message}`,
        platform: options.platform,
      };
    }
  }

  /**
   * Compartilha um screenshot para múltiplas plataformas simultaneamente
   */
  public async shareToMultiplePlatforms(options: ShareMultipleOptions): Promise<ShareMultipleResult> {
    console.log(`📤 Compartilhando screenshot para ${options.platforms.length} plataforma(s): ${options.platforms.join(', ')}...`);

    // Verifica se o arquivo existe
    if (!fs.existsSync(options.screenshotPath)) {
      return {
        success: false,
        message: 'Screenshot não encontrado. Por favor, tire um screenshot primeiro.',
        results: [],
      };
    }

    const results: ShareResult[] = [];
    const successPlatforms: string[] = [];
    const failedPlatforms: string[] = [];

    // Processa cada plataforma em sequência
    for (const platform of options.platforms) {
      try {
        // Pequeno delay entre plataformas para não sobrecarregar
        if (results.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        const result = await this.shareScreenshot({
          platform,
          recipient: options.recipient,
          message: options.message,
          screenshotPath: options.screenshotPath,
        });

        results.push(result);

        if (result.success) {
          successPlatforms.push(platform);
        } else {
          failedPlatforms.push(platform);
        }
      } catch (error) {
        results.push({
          success: false,
          message: `Erro ao compartilhar para ${platform}: ${error.message}`,
          platform,
        });
        failedPlatforms.push(platform);
      }
    }

    // Gera mensagem consolidada
    let message = '';
    if (successPlatforms.length === options.platforms.length) {
      message = `Screenshot compartilhado com sucesso para: ${successPlatforms.join(', ')}.`;
    } else if (successPlatforms.length > 0) {
      message = `Screenshot compartilhado para: ${successPlatforms.join(', ')}. Falhou para: ${failedPlatforms.join(', ')}.`;
    } else {
      message = `Falha ao compartilhar screenshot para todas as plataformas: ${failedPlatforms.join(', ')}.`;
    }

    return {
      success: successPlatforms.length > 0,
      message,
      results,
    };
  }

  /**
   * Compartilha TODAS as mídias da galeria para as plataformas especificadas
   */
  public async shareAllGalleryMedia(options: ShareAllMediaOptions): Promise<ShareAllMediaResult> {
    console.log(`📤 Compartilhando TODAS as mídias da galeria (${this.galleryMedia.length} itens) para: ${options.platforms.join(', ')}...`);

    if (this.galleryMedia.length === 0) {
      return {
        success: false,
        message: 'Nenhuma mídia na galeria para compartilhar. Tire um screenshot ou salve uma gravação primeiro.',
        mediaCount: 0,
        results: [],
      };
    }

    const allResults: ShareResult[] = [];
    let successCount = 0;
    let failCount = 0;

    // Compartilha cada mídia
    for (const media of this.galleryMedia) {
      // Verificar se o arquivo existe
      if (!fs.existsSync(media.path)) {
        console.warn(`⚠️ Mídia não encontrada: ${media.path}`);
        failCount++;
        continue;
      }

      try {
        const result = await this.shareToMultiplePlatforms({
          platforms: options.platforms,
          recipient: options.recipient,
          message: options.message,
          screenshotPath: media.path,
        });

        allResults.push(...result.results);

        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }

        // Pequeno delay entre mídias
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.error(`Erro ao compartilhar mídia ${media.id}:`, error);
        failCount++;
      }
    }

    // Mensagem consolidada
    let message = '';
    const total = this.galleryMedia.length;
    if (successCount === total) {
      message = `Todas as ${total} mídias foram compartilhadas com sucesso para: ${options.platforms.join(', ')}.`;
    } else if (successCount > 0) {
      message = `${successCount} de ${total} mídias compartilhadas. ${failCount} falharam.`;
    } else {
      message = `Falha ao compartilhar todas as ${total} mídias.`;
    }

    return {
      success: successCount > 0,
      message,
      mediaCount: this.galleryMedia.length,
      results: allResults,
    };
  }

  /**
   * Compartilha via WhatsApp Web
   * Abre o WhatsApp Web com a mensagem pré-preenchida e o arquivo na área de transferência
   */
  private async shareToWhatsApp(options: ShareOptions): Promise<ShareResult> {
    try {
      // Detectar tipo de arquivo
      const originalExt = path.extname(options.screenshotPath).toLowerCase();
      const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(originalExt);
      const isVideo = ['.mp4', '.webm', '.avi', '.mov', '.mkv'].includes(originalExt);
      
      // Constrói a URL do WhatsApp Web
      let whatsappUrl = 'https://web.whatsapp.com/send';
      
      if (options.recipient) {
        // Remove caracteres não numéricos do número de telefone
        const phone = options.recipient.replace(/\D/g, '');
        whatsappUrl += `?phone=${phone}`;
      }
      
      if (options.message) {
        const encodedMessage = encodeURIComponent(options.message);
        whatsappUrl += options.recipient ? `&text=${encodedMessage}` : `?text=${encodedMessage}`;
      }

      // Abre o WhatsApp Web
      await shell.openExternal(whatsappUrl);

      // Para imagens, copiar para clipboard
      if (isImage) {
        // Pausar o monitor de clipboard para não detectar esta cópia como novo screenshot
        if ((global as any).pauseClipboardMonitor) {
          (global as any).pauseClipboardMonitor(true);
        }

        // Copia o screenshot para a área de transferência
        const { clipboard, nativeImage } = require('electron');
        const image = nativeImage.createFromPath(options.screenshotPath);
        clipboard.writeImage(image);

        // Retomar o monitor após um delay, atualizando o lastSize para ignorar esta imagem
        setTimeout(() => {
          if ((global as any).pauseClipboardMonitor) {
            (global as any).pauseClipboardMonitor(false, true);
          }
        }, 500);

        return {
          success: true,
          message: 'WhatsApp Web aberto. O screenshot foi copiado para a área de transferência. Cole-o na conversa com Ctrl+V.',
          platform: 'whatsapp',
        };
      } else {
        // Para vídeos, mostrar no explorador de arquivos
        const { shell: electronShell } = require('electron');
        electronShell.showItemInFolder(options.screenshotPath);
        
        return {
          success: true,
          message: `WhatsApp Web aberto. O vídeo foi exibido no explorador de arquivos. Arraste-o para a conversa do WhatsApp.`,
          platform: 'whatsapp',
        };
      }
    } catch (error) {
      // Garantir que o monitor seja retomado em caso de erro
      if ((global as any).pauseClipboardMonitor) {
        (global as any).pauseClipboardMonitor(false, true);
      }
      throw new Error(`Erro ao abrir WhatsApp Web: ${error.message}`);
    }
  }

  /**
   * Compartilha via Email
   * Abre o cliente de email padrão com o screenshot como anexo
   */
  private async shareToEmail(options: ShareOptions): Promise<ShareResult> {
    try {
      // Detectar tipo de arquivo
      const originalExt = path.extname(options.screenshotPath).toLowerCase();
      const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(originalExt);
      const isVideo = ['.mp4', '.webm', '.avi', '.mov', '.mkv'].includes(originalExt);
      
      // Construct mailto URL
      let mailtoUrl = 'mailto:';
      
      if (options.recipient) {
        mailtoUrl += options.recipient;
      }
      
      const mediaType = isVideo ? 'Vídeo' : 'Screenshot';
      const subject = isVideo ? 'Gravação de tela' : 'Screenshot';
      const body = options.message || `Segue ${mediaType.toLowerCase()} em anexo.`;
      
      mailtoUrl += `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      // Open email client
      await shell.openExternal(mailtoUrl);

      // Para imagens, copiar para clipboard
      if (isImage) {
        // Pausar o monitor de clipboard
        if ((global as any).pauseClipboardMonitor) {
          (global as any).pauseClipboardMonitor(true);
        }

        // Note: mailto: doesn't support attachments directly
        // We'll copy the image to clipboard instead
        const { clipboard, nativeImage } = require('electron');
        const image = nativeImage.createFromPath(options.screenshotPath);
        clipboard.writeImage(image);

        // Retomar o monitor após um delay
        setTimeout(() => {
          if ((global as any).pauseClipboardMonitor) {
            (global as any).pauseClipboardMonitor(false, true);
          }
        }, 500);

        return {
          success: true,
          message: 'Cliente de email aberto. O screenshot foi copiado para a área de transferência. Cole-o no email com Ctrl+V.',
          platform: 'email',
        };
      } else {
        // Para vídeos, mostrar no explorador de arquivos
        const { shell: electronShell } = require('electron');
        electronShell.showItemInFolder(options.screenshotPath);
        
        return {
          success: true,
          message: `Cliente de email aberto. O vídeo foi exibido no explorador de arquivos. Anexe-o manualmente ao email.`,
          platform: 'email',
        };
      }
    } catch (error) {
      // Garantir que o monitor seja retomado em caso de erro
      if ((global as any).pauseClipboardMonitor) {
        (global as any).pauseClipboardMonitor(false, true);
      }
      throw new Error(`Erro ao abrir cliente de email: ${error.message}`);
    }
  }

  /**
   * Compartilha para o Google Drive
   * Abre o Google Drive no navegador para upload
   */
  private async shareToDrive(options: ShareOptions): Promise<ShareResult> {
    try {
      // Copy file to a more accessible location
      const documentsPath = app.getPath('documents');
      const driveFolder = path.join(documentsPath, 'Media para Drive');
      
      // Create folder if it doesn't exist
      if (!fs.existsSync(driveFolder)) {
        fs.mkdirSync(driveFolder, { recursive: true });
      }

      // Detectar extensão original do arquivo
      const originalExt = path.extname(options.screenshotPath).toLowerCase();
      const isVideo = ['.mp4', '.webm', '.avi', '.mov', '.mkv'].includes(originalExt);
      const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(originalExt);
      
      // Determinar nome do arquivo baseado no tipo
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const prefix = isVideo ? 'video' : 'screenshot';
      const extension = originalExt || '.png'; // Fallback para .png se não tiver extensão
      const filename = `${prefix}_${timestamp}${extension}`;
      const destPath = path.join(driveFolder, filename);
      
      fs.copyFileSync(options.screenshotPath, destPath);

      // Open Google Drive upload page
      await shell.openExternal('https://drive.google.com/drive/my-drive');

      // Para imagens, também copiar para clipboard
      if (isImage) {
        // Pausar o monitor de clipboard
        if ((global as any).pauseClipboardMonitor) {
          (global as any).pauseClipboardMonitor(true);
        }

        const { clipboard, nativeImage } = require('electron');
        const image = nativeImage.createFromPath(options.screenshotPath);
        clipboard.writeImage(image);

        // Retomar o monitor após um delay
        setTimeout(() => {
          if ((global as any).pauseClipboardMonitor) {
            (global as any).pauseClipboardMonitor(false, true);
          }
        }, 500);
      }

      // Show file in folder
      shell.showItemInFolder(destPath);

      const mediaType = isVideo ? 'Vídeo' : 'Screenshot';
      const clipboardMsg = isImage ? ' O arquivo também está na área de transferência.' : '';

      return {
        success: true,
        message: `${mediaType} salvo em "${destPath}" e Google Drive foi aberto.${clipboardMsg}`,
        platform: 'drive',
      };
    } catch (error) {
      // Garantir que o monitor seja retomado em caso de erro
      if ((global as any).pauseClipboardMonitor) {
        (global as any).pauseClipboardMonitor(false, true);
      }
      throw new Error(`Erro ao preparar upload para Drive: ${error.message}`);
    }
  }

  /**
   * Obtém o caminho do último screenshot capturado
   */
  public async getLatestScreenshotPath(): Promise<string | null> {
    try {
      const userDataPath = app.getPath('userData');
      const screenshotPath = path.join(userDataPath, 'last_screenshot.png');
      
      if (fs.existsSync(screenshotPath)) {
        return screenshotPath;
      }
      
      return null;
    } catch (error) {
      console.error('Erro ao obter último screenshot:', error);
      return null;
    }
  }
}
