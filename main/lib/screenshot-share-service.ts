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

export class ScreenshotShareService {
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
   * Compartilha via WhatsApp Web
   * Abre o WhatsApp Web com a mensagem pré-preenchida e o arquivo na área de transferência
   */
  private async shareToWhatsApp(options: ShareOptions): Promise<ShareResult> {
    try {
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

      // Copia o screenshot para a área de transferência
      const { clipboard, nativeImage } = require('electron');
      const image = nativeImage.createFromPath(options.screenshotPath);
      clipboard.writeImage(image);

      return {
        success: true,
        message: 'WhatsApp Web aberto. O screenshot foi copiado para a área de transferência. Cole-o na conversa com Ctrl+V.',
        platform: 'whatsapp',
      };
    } catch (error) {
      throw new Error(`Erro ao abrir WhatsApp Web: ${error.message}`);
    }
  }

  /**
   * Compartilha via Email
   * Abre o cliente de email padrão com o screenshot como anexo
   */
  private async shareToEmail(options: ShareOptions): Promise<ShareResult> {
    try {
      // Construct mailto URL
      let mailtoUrl = 'mailto:';
      
      if (options.recipient) {
        mailtoUrl += options.recipient;
      }
      
      const subject = 'Screenshot';
      const body = options.message || 'Segue screenshot em anexo.';
      
      mailtoUrl += `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      // Note: mailto: doesn't support attachments directly
      // We'll copy the image to clipboard instead
      const { clipboard, nativeImage } = require('electron');
      const image = nativeImage.createFromPath(options.screenshotPath);
      clipboard.writeImage(image);

      // Open email client
      await shell.openExternal(mailtoUrl);

      return {
        success: true,
        message: 'Cliente de email aberto. O screenshot foi copiado para a área de transferência. Cole-o no email com Ctrl+V.',
        platform: 'email',
      };
    } catch (error) {
      throw new Error(`Erro ao abrir cliente de email: ${error.message}`);
    }
  }

  /**
   * Compartilha para o Google Drive
   * Abre o Google Drive no navegador para upload
   */
  private async shareToDrive(options: ShareOptions): Promise<ShareResult> {
    try {
      // Copy screenshot to a more accessible location
      const documentsPath = app.getPath('documents');
      const driveFolder = path.join(documentsPath, 'Screenshots para Drive');
      
      // Create folder if it doesn't exist
      if (!fs.existsSync(driveFolder)) {
        fs.mkdirSync(driveFolder, { recursive: true });
      }

      // Copy file with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `screenshot_${timestamp}.png`;
      const destPath = path.join(driveFolder, filename);
      
      fs.copyFileSync(options.screenshotPath, destPath);

      // Open Google Drive upload page
      await shell.openExternal('https://drive.google.com/drive/my-drive');

      // Also copy image to clipboard
      const { clipboard, nativeImage } = require('electron');
      const image = nativeImage.createFromPath(options.screenshotPath);
      clipboard.writeImage(image);

      // Show file in folder
      shell.showItemInFolder(destPath);

      return {
        success: true,
        message: `Screenshot salvo em "${destPath}" e Google Drive foi aberto. O screenshot também está na área de transferência.`,
        platform: 'drive',
      };
    } catch (error) {
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
