// ========================================
// CONFIGURAÇÃO UTF-8 PARA WINDOWS
// ========================================
import iconv from 'iconv-lite';

// Mapeamento de emojis para símbolos ASCII (console Windows não suporta emojis)
const emojiMap: { [key: string]: string } = {
  '✅': '[OK]',
  '❌': '[X]',
  '⚠️': '[!]',
  '⚠': '[!]',
  '📋': '[CLIP]',
  '📸': '[IMG]',
  '📏': '[RULE]',
  '📐': '[SCALE]',
  '🎥': '[VID]',
  '🎬': '[REC]',
  '🎤': '[MIC]',
  '🔊': '[VOL]',
  '🤖': '[BOT]',
  '🪟': '[WIN]',
  '🔍': '[FIND]',
  '🔧': '[TOOL]',
  '🔄': '[SYNC]',
  '💾': '[SAVE]',
  '🎯': '[TGT]',
  '✓': '[v]',
  '🚀': '[>>]',
  '⏱️': '[TIME]',
  '⏱': '[TIME]',
  '📝': '[NOTE]',
  '🎨': '[ART]',
  '⚙️': '[CFG]',
  '⚙': '[CFG]',
  '📦': '[PKG]',
  '🌐': '[WEB]',
  '💡': '[IDEA]',
  '🔥': '[FIRE]',
  '⭐': '[STAR]',
  '🎵': '[MUSIC]',
  '📱': '[PHONE]',
  '💻': '[PC]',
  '🖥️': '[SCREEN]',
  '🖥': '[SCREEN]',
};

// Função para substituir emojis por símbolos ASCII
function replaceEmojis(text: string): string {
  let result = text;
  for (const [emoji, replacement] of Object.entries(emojiMap)) {
    result = result.replaceAll(emoji, replacement);
  }
  return result;
}

// No Windows, usa iconv-lite para converter UTF-8 para o code page correto
if (process.platform === 'win32') {
  // Detecta o code page atual do console
  let codePage = 'cp850'; // Default para Windows Brasil
  try {
    const { execSync } = require('child_process');
    const output = execSync('chcp', { encoding: 'utf8' });
    const match = output.match(/\d+/);
    if (match) {
      const cpNumber = match[0];
      // Mapeia code pages comuns
      const cpMap: { [key: string]: string } = {
        '850': 'cp850',   // DOS Latin-1 (Brasil/Portugal)
        '1252': 'win1252', // Windows Latin-1
        '65001': 'utf8',   // UTF-8
        '437': 'cp437',    // US
      };
      codePage = cpMap[cpNumber] || 'cp850';
      const tempLog = console.log;
      tempLog(`[FIND] Code Page detectado: ${cpNumber} (${codePage})`);
    }
  } catch (e) {
    const tempLog = console.log;
    tempLog('[!] Nao foi possivel detectar code page, usando CP850 (padrao BR)');
  }

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;

  // Função para escrever com conversão de encoding
  const writeWithEncoding = (stream: NodeJS.WriteStream, ...args: any[]) => {
    let message = args.map(arg =>
      typeof arg === 'string' ? arg : JSON.stringify(arg)
    ).join(' ');

    // Substitui emojis por símbolos ASCII
    message = replaceEmojis(message);

    // Converte UTF-8 para o code page detectado
    const encoded = iconv.encode(message + '\n', codePage);
    stream.write(encoded);
  };

  console.log = (...args: any[]) => writeWithEncoding(process.stdout, ...args);
  console.error = (...args: any[]) => writeWithEncoding(process.stderr, ...args);
  console.warn = (...args: any[]) => writeWithEncoding(process.stderr, ...args);
  console.info = (...args: any[]) => writeWithEncoding(process.stdout, ...args);

  console.log('[v] Console configurado com sucesso!');
}

import path from 'path'
import { app, ipcMain, BrowserWindow, screen, desktopCapturer, clipboard, shell } from 'electron'
import serve from 'electron-serve'
import { createWindow } from './helpers'
import { VoiceAssistant } from './lib/voice-assistant';
import ffmpeg from 'fluent-ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { initializeDatabase, getTranscriptionSettings, getUserSettings, setTranscriptionSettings } from './lib/database';
import { registerDatabaseHandlers } from './lib/handlers/database-handlers';
import { registerNicheHandlers } from './lib/handlers/niche-handlers';
import { registerKnowledgeHandlers } from './lib/handlers/knowledge-handlers';
import { 
  registerVideoEditorHandlers, 
  initializeVideoProjectService, 
  destroyVideoProjectService 
} from './lib/handlers/video-editor-handlers';
import { 
  registerSocialMediaHandlers, 
  initializeSocialMediaService, 
  destroySocialMediaService 
} from './lib/handlers/social-media-handlers';
import { registerProviderHandlers } from './lib/handlers/provider-handlers';
import { isProd, getUserDataPath } from './lib/app-config';
import {
  getModuleAccess,
  createCheckout,
  openCheckout,
  BillingModuleCode,
  ensureModuleActive,
  buildModuleAccessDeniedPayload,
  clearModuleAccessCache,
  setModuleAccessUpdateListener,
  startModuleAccessRealtime,
  stopModuleAccessRealtime,
} from './lib/services/module-access-service';
import { getAppIdentity, signInWithPassword, refreshAppSession, signOutApp } from './lib/services/app-auth-service';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
const execAsync = promisify(execCallback);

const normalizeBinaryPathForProd = (binaryPath: string) => (
  isProd ? binaryPath.replace('app.asar', 'app.asar.unpacked') : binaryPath
);

// Get ffmpeg/ffprobe path - different for dev vs prod
let ffmpegPath: string;
let ffprobePath: string;
if (isProd) {
  // In production, ffmpeg-static will be in asar.unpacked
  ffmpegPath = require('ffmpeg-static');
  ffmpegPath = normalizeBinaryPathForProd(ffmpegPath);
  ffprobePath = normalizeBinaryPathForProd(ffprobeInstaller.path);
} else {
  // In development, use the path directly from node_modules
  ffmpegPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
  ffprobePath = ffprobeInstaller.path;
}
console.log('FFmpeg path:', ffmpegPath);
console.log('FFprobe path:', ffprobePath);
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

export let mainWindow;
let screenshotGalleryWindow: BrowserWindow | null = null;
const assistant = new VoiceAssistant('elevenlabs');
let isMicrophonePaused = false; // Estado de pausa do microfone
let isAvatarReactionDisabled = false; // Desabilita reação do avatar (transcrição continua)

const LOCKED_MODULE_ACCESS = {
  'video-editor': 'locked',
  'social-media': 'locked',
  'meeting-assistance': 'locked',
} as const;

async function getModuleAccessDeniedPayload(
  moduleCode: BillingModuleCode,
  channel: string
) {
  const access = await ensureModuleActive(moduleCode);

  if (access.allowed) {
    return null;
  }

  console.warn(`[Billing] Acesso negado no canal ${channel} (${moduleCode}: ${access.status})`);
  return buildModuleAccessDeniedPayload(moduleCode, access.status, channel);
}

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', getUserDataPath())
}

; (async () => {
  await app.whenReady()

  // Inicializa o banco de dados
  initializeDatabase();
  initializeSqliteDatabase();
  registerDatabaseHandlers();
  registerNicheHandlers();
  registerKnowledgeHandlers();
  registerVideoEditorHandlers();
  registerSocialMediaHandlers();
  registerProviderHandlers(null);

  // Inicializa o VoiceAssistant com o modo salvo no banco.
  // Se faltar API key necessária para o modo, o próprio VoiceAssistant bloqueia o start do serviço.
  try {
    const settings = getUserSettings();

    if (settings.aiProvider) {
      assistant.setAIProvider(settings.aiProvider);
    }

    if (settings.voiceModel) {
      assistant.setTTSProvider(settings.voiceModel);
    }

    const startupMode: 'classic' | 'live' =
      settings.assistantMode === 'classic' || settings.assistantMode === 'live'
        ? settings.assistantMode
        : 'classic';

    await assistant.setMode(startupMode);
    console.log(`[VoiceAssistant] Startup mode loaded from DB: ${startupMode}`);
  } catch (error) {
    console.error('[VoiceAssistant] Failed to initialize from DB settings:', error);
  }

  // Permissão de Microfone
  app.on('web-contents-created', (event, contents) => {
    contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'media') {
        return callback(true);
      }
      callback(false);
    });

    // Suprimir logs do console do renderer process no terminal do backend
    contents.on('console-message', (event, level, message, line, sourceId) => {
      // Prevenir que logs do frontend apareçam no terminal do backend
      // Os logs ainda aparecem no DevTools do navegador quando aberto
      event.preventDefault();
    });
  });

  mainWindow = createWindow('main', {
    width: 1000,  // Reduzido de 1000 para 500
    height: 600, // Reduzido de 600 para 400
    transparent: true,
    frame: false,
    alwaysOnTop: true, // Sobrepor todas as janelas por padrão
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // SEGURANÇA MÁXIMA
      contextIsolation: true,
    },
  })

  // Global Mouse Tracking Loop
  let lastMousePoint: { x: number; y: number } | null = null;
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const point = screen.getCursorScreenPoint();
      if (!lastMousePoint || point.x !== lastMousePoint.x || point.y !== lastMousePoint.y) {
        mainWindow.webContents.send('global-mouse-move', point);
        lastMousePoint = point;
      }
    }
  }, 100); // 10 FPS update rate

  if (isProd) {
    await mainWindow.loadURL('app://./home')
  } else {
    const port = process.argv[2]
    await mainWindow.loadURL(`http://localhost:${port}/home`)
    // mainWindow.webContents.openDevTools()
  }

  // Desabilitar menu de contexto nativo (para permitir menu radial customizado)
  mainWindow.webContents.on('context-menu', (event) => {
    event.preventDefault();
  });

  setModuleAccessUpdateListener((payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('billing:module-access-updated', payload);
    }
  });

  startModuleAccessRealtime().catch(() => {
    // Se não houver sessão autenticada no startup, seguimos sem assinatura.
  });

  // Screenshot Gallery Window será criada sob demanda quando houver screenshots
  console.log('📸 Screenshot Gallery Window será criada quando necessário');


  // ========================================
  // CLIPBOARD MONITOR - Detecta Win+Shift+S e PrintScreen
  // ========================================

  let lastClipboardImageSize: { width: number, height: number } | null = null;
  let isProcessingClipboard = false; // Flag para evitar processamento simultâneo
  let clipboardMonitorPaused = false; // Flag para pausar durante share operations

  // Exportar função para pausar/despausar o monitor (usado pelo share service)
  (global as any).pauseClipboardMonitor = (pause: boolean, updateLastSize: boolean = false) => {
    clipboardMonitorPaused = pause;
    console.log(`📋 Clipboard monitor ${pause ? 'PAUSADO' : 'RETOMADO'}`);

    // Se estamos retomando e devemos atualizar o lastSize, lemos a imagem atual do clipboard
    if (!pause && updateLastSize) {
      try {
        const currentImage = clipboard.readImage();
        if (!currentImage.isEmpty()) {
          lastClipboardImageSize = currentImage.getSize();
          console.log(`📋 lastClipboardImageSize atualizado para: ${lastClipboardImageSize.width}x${lastClipboardImageSize.height}`);
        }
      } catch (e) {
        // Ignora erros
      }
    }
  };

  // Inicializar com a imagem atual da clipboard para não capturá-la ao iniciar
  try {
    const initialImage = clipboard.readImage();
    if (!initialImage.isEmpty()) {
      const size = initialImage.getSize();
      lastClipboardImageSize = size;
      console.log(`📋 Clipboard inicial ignorada: ${size.width}x${size.height} (não será capturada)`);
    }
  } catch (error) {
    console.log('📋 Nenhuma imagem na clipboard ao iniciar');
  }

  // Monitor de clipboard - verifica a cada 1000ms (reduzido para evitar lag)
  const clipboardMonitorInterval = setInterval(async () => {
    // Se já está processando ou monitor está pausado, pula esta iteração
    if (isProcessingClipboard || clipboardMonitorPaused) {
      return;
    }

    try {
      const image = clipboard.readImage();

      // Verifica se há uma imagem na clipboard
      if (!image.isEmpty()) {
        const size = image.getSize();

        // Verifica se é uma imagem diferente (compara dimensões)
        const isDifferentImage = !lastClipboardImageSize ||
          lastClipboardImageSize.width !== size.width ||
          lastClipboardImageSize.height !== size.height;

        if (isDifferentImage) {
          isProcessingClipboard = true;
          lastClipboardImageSize = size;

          console.log(`📋 Nova imagem detectada na clipboard (${size.width}x${size.height})`);

          // Processa de forma assíncrona para não bloquear o thread principal
          setImmediate(async () => {
            try {
              // Redimensiona se for muito grande (PrintScreen de tela cheia)
              let processedImage = image;
              const maxDimension = 1920; // Máximo de 1920px na maior dimensão

              if (size.width > maxDimension || size.height > maxDimension) {
                const scale = maxDimension / Math.max(size.width, size.height);
                const newWidth = Math.round(size.width * scale);
                const newHeight = Math.round(size.height * scale);

                console.log(`📐 Redimensionando de ${size.width}x${size.height} para ${newWidth}x${newHeight}`);
                processedImage = image.resize({ width: newWidth, height: newHeight });
              }

              // Converte para base64 (JPEG para maior compressão)
              const jpegBuffer = processedImage.toJPEG(85); // 85% qualidade
              const base64Data = jpegBuffer.toString('base64');

              console.log(`📋 Imagem processada (${(base64Data.length / 1024).toFixed(0)} KB)`);

              // Salvar imagem em disco para poder compartilhar
              const userDataPath = app.getPath('userData');
              const screenshotsFolder = path.join(userDataPath, 'clipboard_screenshots');
              if (!fs.existsSync(screenshotsFolder)) {
                fs.mkdirSync(screenshotsFolder, { recursive: true });
              }

              const screenshotId = `clipboard-${Date.now()}`;
              const filename = `${screenshotId}.jpg`;
              const filePath = path.join(screenshotsFolder, filename);

              // Salvar arquivo
              fs.writeFileSync(filePath, jpegBuffer);
              console.log(`📋 Screenshot salvo em: ${filePath}`);

              // Adicionar ao backend para compartilhamento
              if (assistant) {
                assistant.addMediaToGallery({
                  id: screenshotId,
                  type: 'screenshot',
                  path: filePath,
                  timestamp: Date.now()
                });

                // Se estiver no modo live, envia a imagem para o Gemini Live analisar
                // (igual ao comportamento de screenshot por comando de voz)
                if (assistant.getMode() === 'live') {
                  console.log('📋 Enviando screenshot da clipboard para Gemini Live...');
                  assistant.sendScreenFrame(base64Data);
                }
              }

              // Cria janela sob demanda e envia screenshot
              await createScreenshotGalleryWindow();
              sendScreenshotToGallery(base64Data);
            } catch (error) {
              console.error('Erro ao processar imagem da clipboard:', error);
            } finally {
              isProcessingClipboard = false;
            }
          });
        }
      } else {
        // Clipboard vazio - resetar
        lastClipboardImageSize = null;
      }
    } catch (error) {
      // Silenciosamente ignora erros menores
      isProcessingClipboard = false;
    }
  }, 1000); // Aumentado para 1000ms para reduzir carga

  // Limpar intervalo quando app fechar
  app.on('before-quit', () => {
    clearInterval(clipboardMonitorInterval);
    stopModuleAccessRealtime().catch(() => {
      // Sem impacto funcional durante shutdown.
    });
  });

  console.log('📋 Clipboard monitor iniciado - Win+Shift+S e PrintScreen capturas serão detectadas');
})()

// Função para criar Screenshot Gallery Window sob demanda (escopo global)
let pendingScreenshots: string[] = []; // Fila de screenshots aguardando janela estar pronta
let currentSessionScreenshots: string[] = []; // Lista de screenshots da sessão atual (apenas com o app aberto)
let isWindowReady = false;

async function createScreenshotGalleryWindow() {
  if (screenshotGalleryWindow && !screenshotGalleryWindow.isDestroyed()) {
    return; // Janela já existe
  }

  isWindowReady = false;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const galleryWidth = 300;
  const galleryHeight = screenHeight;
  const galleryX = screenWidth - galleryWidth;
  const galleryY = 20;

  screenshotGalleryWindow = createWindow('screenshot-gallery', {
    width: galleryWidth,
    height: galleryHeight,
    x: galleryX,
    y: galleryY,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  screenshotGalleryWindow.setIgnoreMouseEvents(true, { forward: true });

  // IMPORTANTE: Registrar listener ANTES de loadURL
  const loadPromise = new Promise<void>((resolve) => {
    let resolved = false;

    const onLoad = () => {
      if (!resolved) {
        resolved = true;
        console.log('📸 did-finish-load disparado');
        // Dar 200ms para React registrar listeners
        setTimeout(() => {
          console.log('📸 Screenshot Gallery Window pronta');
          isWindowReady = true;

          // PRIMEIRO: Enviar todos os screenshots da sessão atual
          if (currentSessionScreenshots.length > 0) {
            console.log(`📸 Recarregando ${currentSessionScreenshots.length} screenshots da sessão atual`);
            currentSessionScreenshots.forEach(base64Data => {
              if (screenshotGalleryWindow && !screenshotGalleryWindow.isDestroyed()) {
                screenshotGalleryWindow.webContents.send('screenshot-captured', base64Data);
              }
            });
          }

          // DEPOIS: Processar screenshots pendentes (novos)
          if (pendingScreenshots.length > 0) {
            console.log(`📸 Processando ${pendingScreenshots.length} screenshots pendentes`);
            pendingScreenshots.forEach(base64Data => {
              if (screenshotGalleryWindow && !screenshotGalleryWindow.isDestroyed()) {
                screenshotGalleryWindow.webContents.send('screenshot-captured', base64Data);
              }
            });
            pendingScreenshots = [];
          }

          resolve();
        }, 200);
      }
    };

    if (screenshotGalleryWindow) {
      screenshotGalleryWindow.webContents.once('did-finish-load', onLoad);

      // Timeout de segurança - se não carregar em 3 segundos, assume pronto
      setTimeout(() => {
        if (!resolved) {
          console.warn('⚠️ Timeout esperando did-finish-load - assumindo janela pronta');
          onLoad();
        }
      }, 3000);
    } else {
      resolve();
    }
  });

  // Agora sim, carregar URL
  console.log('📸 Iniciando carregamento da janela...');
  if (isProd) {
    await screenshotGalleryWindow.loadURL('app://./screenshot-gallery');
  } else {
    const port = process.argv[2];
    await screenshotGalleryWindow.loadURL(`http://localhost:${port}/screenshot-gallery`);
  }
  console.log('📸 loadURL completado, aguardando did-finish-load...');

  // Aguardar o carregamento real
  await loadPromise;
}

// Função helper para enviar screenshot (com fila se necessário)
function sendScreenshotToGallery(base64Data: string) {
  // Adicionar à lista de screenshots da sessão atual
  currentSessionScreenshots.push(base64Data);

  if (screenshotGalleryWindow && !screenshotGalleryWindow.isDestroyed() && isWindowReady) {
    // Janela existe e está pronta - enviar imediatamente
    screenshotGalleryWindow.webContents.send('screenshot-captured', base64Data);
  } else {
    // Janela não está pronta - adicionar à fila
    console.log('📸 Screenshot adicionado à fila (janela ainda não pronta)');
    pendingScreenshots.push(base64Data);
  }
}

app.on('window-all-closed', () => {
  stopModuleAccessRealtime().catch(() => {
    // Sem impacto funcional durante shutdown.
  });
  app.quit()
})

ipcMain.on('message', async (event, arg) => {
  event.reply('message', `${arg} World!`)
})


// Controle de cliques (Click-through)
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setIgnoreMouseEvents(ignore, options);
  }
});

ipcMain.on('resize-window', (event, width, height) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setSize(width, height);
  }
});

ipcMain.on('move-window', (event, x, y) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setPosition(Math.round(x), Math.round(y));
  }
});

// Generic window controls (usable by any frameless renderer window)
ipcMain.handle('window:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  win.minimize();
  return true;
});

ipcMain.handle('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  if (!win.isMaximized()) {
    win.maximize();
  }
  return win.isMaximized();
});

ipcMain.handle('window:unmaximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  if (win.isMaximized()) {
    win.unmaximize();
  }
  return win.isMaximized();
});

ipcMain.handle('window:toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
  return win.isMaximized();
});

ipcMain.handle('window:is-maximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isMaximized() : false;
});

ipcMain.handle('window:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  win.close();
  return true;
});

// Always on top toggle
ipcMain.on('set-always-on-top', (event, enabled: boolean) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setAlwaysOnTop(enabled);
    console.log(`🪟 Always on top: ${enabled}`);
  }
});

// Copy to clipboard
ipcMain.handle('copy-to-clipboard', async (_, text: string) => {
  clipboard.writeText(text);
  return true;
});

let settingsWindow: BrowserWindow | null = null;

ipcMain.on('open-settings', async () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = createWindow('settings', {
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isProd) {
    await settingsWindow.loadURL('app://./settings');
  } else {
    const port = process.argv[2];
    await settingsWindow.loadURL(`http://localhost:${port}/settings`);
  }
});

// Handler para fechar janela de screenshots quando lista está vazia
ipcMain.on('screenshots-empty', () => {
  console.log('📸 Lista de screenshots vazia - fechando janela para economizar recursos');
  if (screenshotGalleryWindow && !screenshotGalleryWindow.isDestroyed()) {
    screenshotGalleryWindow.close();
    screenshotGalleryWindow = null;
  }

  // Limpar lista de screenshots da sessão atual
  console.log('📸 Limpando lista de screenshots da sessão atual');
  currentSessionScreenshots = [];
  pendingScreenshots = [];
  isWindowReady = false;

  // Limpar galeria do ScreenshotShareService
  if (assistant) {
    assistant.clearGallery();
  }
});

// Handler para receber gravações salvas do renderer e enviar para a galeria
ipcMain.on('recording-saved-from-renderer', async (_, data: { path: string, duration: number }) => {
  console.log(`🎥 Gravação recebida para galeria: ${data.path} (${data.duration}s)`);

  const mediaId = `video-${Date.now()}`;

  // Adicionar ao VoiceAssistant (que gerencia o ScreenshotShareService internamente)
  if (assistant) {
    assistant.addMediaToGallery({
      id: mediaId,
      type: 'video',
      path: data.path,
      timestamp: Date.now()
    });
  }

  // Criar janela da galeria se necessário
  await createScreenshotGalleryWindow();

  // Enviar para a galeria
  if (screenshotGalleryWindow && !screenshotGalleryWindow.isDestroyed()) {
    screenshotGalleryWindow.webContents.send('recording-saved', {
      path: data.path,
      duration: data.duration
    });
  }
});

// Handler para adicionar screenshot à galeria do ScreenshotShareService
ipcMain.on('gallery-add-screenshot', (_, data: { id: string, path: string }) => {
  console.log(`📸 Screenshot adicionado à galeria backend: ${data.id}`);
  if (assistant) {
    assistant.addMediaToGallery({
      id: data.id,
      type: 'screenshot',
      path: data.path,
      timestamp: Date.now()
    });
  }
});

// Handler para remover mídia da galeria do ScreenshotShareService
ipcMain.on('gallery-remove-media', (_, id: string) => {
  console.log(`🗑️ Mídia removida da galeria backend: ${id}`);
  if (assistant) {
    assistant.removeMediaFromGallery(id);
  }
});

// Handler para limpar toda a galeria do ScreenshotShareService
ipcMain.on('gallery-clear', () => {
  console.log('🗑️ Galeria backend limpa');
  if (assistant) {
    assistant.clearGallery();
  }
});

// Handler para abrir arquivos no player padrão do sistema
ipcMain.handle('shell-open-path', async (_, filePath: string) => {
  const { shell } = require('electron');
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    console.error('Erro ao abrir arquivo:', error);
    return { success: false, error: error.message };
  }
});

let transcriptionWindow: BrowserWindow | null = null;
let wordExplanationWindow: BrowserWindow | null = null;

// Função para criar janela de explicação de palavra (chamada apenas quando não existe janela)
async function createWordExplanationWindow(
  word: string,
  context: string,
  appearanceSettings?: { fontSize: number; opacity: number }
): Promise<BrowserWindow> {

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const windowWidth = 450;
  const windowHeight = 400;

  // Posicionar no centro-direita da tela
  const x = Math.floor(screenWidth - windowWidth - 50);
  const y = Math.floor((screenHeight - windowHeight) / 2);

  wordExplanationWindow = createWindow('word-explanation', {
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    minWidth: 350,
    minHeight: 300,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isProd) {
    await wordExplanationWindow.loadURL('app://./word-explanation');
  } else {
    const port = process.argv[2];
    await wordExplanationWindow.loadURL(`http://localhost:${port}/word-explanation`);
  }

  // O envio de dados é feito pelo handler após did-finish-load

  wordExplanationWindow.on('closed', () => {
    wordExplanationWindow = null;
  });

  console.log(`💡 Word explanation window opened for: "${word}"`);

  return wordExplanationWindow;
}

// Handler para fechar janela de explicação
ipcMain.on('word-explanation:close', () => {
  if (wordExplanationWindow && !wordExplanationWindow.isDestroyed()) {
    wordExplanationWindow.close();
    wordExplanationWindow = null;
  }
});

// Handler para abrir janela de explicação e iniciar geração
ipcMain.handle('word-explanation:open', async (event, word: string, context?: string, appearanceSettings?: { fontSize: number; opacity: number }) => {
  try {
    // Abortar qualquer geração anterior
    const { getSummaryService } = require('./lib/services/summary-service');
    const summaryService = getSummaryService();
    summaryService.abort();

    // Verificar se a janela já existe e está aberta
    if (wordExplanationWindow && !wordExplanationWindow.isDestroyed()) {
      // Reutilizar janela existente - NÃO enviar configurações de aparência (a janela mantém as próprias)
      const dataToSend = {
        word,
        context: context || ''
        // Sem appearanceSettings - a janela mantém suas próprias configurações
      };
      console.log(`💡 Reutilizando janela para: "${word}" (sem alterar aparência)`);
      wordExplanationWindow.webContents.send('word-explanation:data', dataToSend);
      wordExplanationWindow.focus();
    } else {
      // Criar nova janela (loadURL já é await, então a página já carregou)
      await createWordExplanationWindow(word, context || '', appearanceSettings);

      // Aguardar React iniciar e montar os listeners (500ms é seguro)
      await new Promise(resolve => setTimeout(resolve, 500));

      // Enviar dados iniciais com configurações de aparência
      if (wordExplanationWindow && !wordExplanationWindow.isDestroyed()) {
        const dataToSend = {
          word,
          context: context || '',
          appearanceSettings: appearanceSettings || { fontSize: 12, opacity: 100 }
        };
        console.log(`💡 Enviando dados iniciais para janela:`, JSON.stringify(dataToSend.appearanceSettings));
        wordExplanationWindow.webContents.send('word-explanation:data', dataToSend);
      }
    }

    // Gerar explicação e enviar chunks para a janela
    try {
      const result = await summaryService.explainWord(word, context || '', (chunk: string) => {
        if (wordExplanationWindow && !wordExplanationWindow.isDestroyed()) {
          wordExplanationWindow.webContents.send('word-explanation:chunk', chunk);
        }
      });

      // Notificar conclusão
      if (wordExplanationWindow && !wordExplanationWindow.isDestroyed()) {
        wordExplanationWindow.webContents.send('word-explanation:complete');
      }

      return { success: true, result };
    } catch (genError: any) {
      if (genError.name === 'AbortError') {
        console.log('[WordExplanation] Geração abortada (nova palavra selecionada)');
        return { success: true, aborted: true };
      }
      console.error('[WordExplanation] Erro na geração:', genError);
      if (wordExplanationWindow && !wordExplanationWindow.isDestroyed()) {
        wordExplanationWindow.webContents.send('word-explanation:complete');
      }
      return { success: false, error: genError.message };
    }
  } catch (error: any) {
    console.error('[WordExplanation] Erro ao abrir janela:', error);
    return { success: false, error: error.message };
  }
})

// Função reutilizável para abrir a janela de transcrição
async function openTranscriptionWindow() {
  if (transcriptionWindow && !transcriptionWindow.isDestroyed()) {
    transcriptionWindow.focus();
    return;
  }

  // Get primary display bounds
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // Window size
  const windowWidth = 500;
  const windowHeight = 500;

  // Safety margins (pixels from screen edges)
  const margin = 50;

  // Calculate initial position (center with margin constraints)
  let x = Math.floor((screenWidth - windowWidth) / 2);
  let y = Math.floor((screenHeight - windowHeight) / 2);

  // Ensure margins
  x = Math.max(margin, Math.min(x, screenWidth - windowWidth - margin));
  y = Math.max(margin, Math.min(y, screenHeight - windowHeight - margin));

  transcriptionWindow = createWindow('transcription', {
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    minWidth: 400,
    minHeight: 500,
    maxWidth: screenWidth - (margin * 2),
    maxHeight: screenHeight - (margin * 2),
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true, // Don't show in taskbar
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Constrain window movement to stay within margins
  transcriptionWindow.on('will-move', (event, newBounds) => {
    const display = screen.getDisplayNearestPoint({ x: newBounds.x, y: newBounds.y });
    const { x: screenX, y: screenY, width: screenW, height: screenH } = display.workArea;

    if (newBounds.x < screenX + margin) newBounds.x = screenX + margin;
    if (newBounds.y < screenY + margin) newBounds.y = screenY + margin;
    if (newBounds.x + newBounds.width > screenX + screenW - margin) {
      newBounds.x = screenX + screenW - newBounds.width - margin;
    }
    if (newBounds.y + newBounds.height > screenY + screenH - margin) {
      newBounds.y = screenY + screenH - newBounds.height - margin;
    }
  });

  if (isProd) {
    await transcriptionWindow.loadURL('app://./transcription');
  } else {
    const port = process.argv[2];
    await transcriptionWindow.loadURL(`http://localhost:${port}/transcription`);
  }

  // Parar Deepgram quando a janela for fechada
  transcriptionWindow.on('closed', () => {
    console.log('📝 Transcription window closed, stopping Deepgram...');

    // Parar o serviço Deepgram do desktop
    if (desktopDeepgramService) {
      desktopDeepgramService.stop();
      desktopDeepgramService.removeAllListeners();
      desktopDeepgramService = null;
    }

    desktopTranscriptionWindow = null;
    transcriptionWindow = null;
  });

  console.log('📝 Transcription window opened');
}

// Handler IPC para abrir a janela de transcrição
ipcMain.handle('open-transcription-window', async () => {
  const denied = await getModuleAccessDeniedPayload('meeting-assistance', 'open-transcription-window');
  if (denied) return denied;

  await openTranscriptionWindow();
  return { success: true };
});

// Handler IPC para minimizar (esconder) a janela de transcrição
ipcMain.on('minimize-transcription-window', () => {
  if (transcriptionWindow && !transcriptionWindow.isDestroyed()) {
    transcriptionWindow.hide();
    console.log('📝 Transcription window minimized (hidden)');
  }
});

// Handler IPC para mostrar a janela de transcrição (se já existir)
ipcMain.handle('show-transcription-window', async () => {
  const denied = await getModuleAccessDeniedPayload('meeting-assistance', 'show-transcription-window');
  if (denied) return denied;

  if (transcriptionWindow && !transcriptionWindow.isDestroyed()) {
    transcriptionWindow.show();
    transcriptionWindow.focus();
    console.log('📝 Transcription window shown');
    return { success: true, wasHidden: true };
  } else {
    // Se não existir, abre uma nova
    await openTranscriptionWindow();
    return { success: true, wasHidden: false };
  }
});

// Handler para verificar se a janela de transcrição está aberta/visível
ipcMain.handle('is-transcription-window-open', () => {
  const isOpen = transcriptionWindow && !transcriptionWindow.isDestroyed();
  const isVisible = isOpen && transcriptionWindow.isVisible();
  return { isOpen, isVisible };
});

// ========================================
// KNOWLEDGE RESULTS WINDOW
// ========================================

let knowledgeResultsWindow: BrowserWindow | null = null;

async function openKnowledgeResultsWindow() {
  if (knowledgeResultsWindow && !knowledgeResultsWindow.isDestroyed()) {
    knowledgeResultsWindow.focus();
    return;
  }

  // Get primary display bounds
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // Window size
  const windowWidth = 450;
  const windowHeight = 500;

  // Position at bottom-right corner
  const margin = 20;
  const x = screenWidth - windowWidth - margin;
  const y = screenHeight - windowHeight - margin;

  knowledgeResultsWindow = createWindow('knowledge-results', {
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    minWidth: 350,
    minHeight: 300,
    maxWidth: 600,
    maxHeight: 700,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isProd) {
    await knowledgeResultsWindow.loadURL('app://./knowledge-results');
  } else {
    const port = process.argv[2];
    await knowledgeResultsWindow.loadURL(`http://localhost:${port}/knowledge-results`);
  }

  knowledgeResultsWindow.on('closed', () => {
    console.log('📚 Knowledge results window closed');
    knowledgeResultsWindow = null;
  });

  console.log('📚 Knowledge results window opened');
}

// Handler IPC para fechar a janela de resultados
ipcMain.on('close-knowledge-results-window', () => {
  if (knowledgeResultsWindow && !knowledgeResultsWindow.isDestroyed()) {
    knowledgeResultsWindow.close();
    knowledgeResultsWindow = null;
    console.log('📚 Knowledge results window closed via IPC');
  }
});

// ========================================
// VIDEO STUDIO WINDOW
// ========================================

let videoStudioWindow: BrowserWindow | null = null;

async function openVideoStudioWindow() {
  if (videoStudioWindow && !videoStudioWindow.isDestroyed()) {
    videoStudioWindow.focus();
    return;
  }

  // Inicializar serviço via módulo de handlers
  initializeVideoProjectService(() => videoStudioWindow);

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  videoStudioWindow = createWindow('video-studio', {
    width: Math.min(1400, screenWidth - 100),
    height: Math.min(900, screenHeight - 100),
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    transparent: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isProd) {
    await videoStudioWindow.loadURL('app://./video-studio');
  } else {
    const port = process.argv[2];
    await videoStudioWindow.loadURL(`http://localhost:${port}/video-studio`);
  }

  videoStudioWindow.on('closed', () => {
    videoStudioWindow = null;
    // Encerrar o serviço via módulo de handlers
    destroyVideoProjectService();
  });

  console.log('🎬 Video Studio window opened');
}

ipcMain.handle('open-video-studio-window', async () => {
  const denied = await getModuleAccessDeniedPayload('video-editor', 'open-video-studio-window');
  if (denied) return denied;

  await openVideoStudioWindow();
  return { success: true };
});

// ========================================
// SOCIAL MEDIA WINDOW
// ========================================

let socialMediaWindow: BrowserWindow | null = null;

async function openSocialMediaWindow() {
  if (socialMediaWindow && !socialMediaWindow.isDestroyed()) {
    socialMediaWindow.focus();
    return;
  }

  // Inicializar serviço via módulo de handlers
  initializeSocialMediaService(() => socialMediaWindow);

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  socialMediaWindow = createWindow('social-media', {
    width: Math.min(1400, screenWidth - 100),
    height: Math.min(900, screenHeight - 100),
    minWidth: 1000,
    minHeight: 700,
    frame: true,
    transparent: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true, // Habilita <webview> para login em redes sociais
      webSecurity: false, // Permite carregar arquivos locais via file://
    },
  });

  if (isProd) {
    await socialMediaWindow.loadURL('app://./social-media');
  } else {
    const port = process.argv[2];
    await socialMediaWindow.loadURL(`http://localhost:${port}/social-media`);
  }

  socialMediaWindow.on('closed', () => {
    socialMediaWindow = null;
    // Encerrar o serviço via módulo de handlers
    destroySocialMediaService();
  });

  console.log('📱 Social Media window opened');
}

ipcMain.handle('open-social-media-window', async () => {
  const denied = await getModuleAccessDeniedPayload('social-media', 'open-social-media-window');
  if (denied) return denied;

  await openSocialMediaWindow();
  return { success: true };
});

// ========================================
// BILLING / MODULE ACCESS
// ========================================

ipcMain.handle('billing:get-module-access', async () => {
  try {
    return await getModuleAccess();
  } catch (error: any) {
    return {
      success: false,
      access: { ...LOCKED_MODULE_ACCESS },
      error: error?.message || 'Falha ao consultar acesso de módulos',
    };
  }
});

ipcMain.handle('billing:create-checkout', async (_event, moduleCode: BillingModuleCode) => {
  try {
    return await createCheckout(moduleCode);
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Falha ao criar checkout',
    };
  }
});

ipcMain.handle('billing:open-checkout', async (_event, moduleCode: BillingModuleCode) => {
  try {
    return await openCheckout(moduleCode);
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Falha ao abrir checkout',
    };
  }
});

// ========================================
// APP AUTH / USER IDENTITY
// ========================================

ipcMain.handle('auth:get-identity', async () => {
  return getAppIdentity();
});

ipcMain.handle('auth:sign-in-password', async (_event, email: string, password: string) => {
  const result = await signInWithPassword(email, password);

  if (result?.success && result.identity?.isAuthenticated) {
    clearModuleAccessCache();
    await startModuleAccessRealtime(true);
  }

  return result;
});

ipcMain.handle('auth:refresh-session', async () => {
  const result = await refreshAppSession();

  if (result?.success && result.identity?.isAuthenticated) {
    clearModuleAccessCache();
    await startModuleAccessRealtime(true);
  }

  return result;
});

ipcMain.handle('auth:sign-out', async () => {
  const result = await signOutApp();
  clearModuleAccessCache();
  await stopModuleAccessRealtime();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('billing:module-access-updated', {
      success: true,
      access: { ...LOCKED_MODULE_ACCESS },
      source: 'local-signout',
    });
  }

  return result;
});

// Register global shortcut for transcription window
app.whenReady().then(() => {
  const { globalShortcut } = require('electron');

  globalShortcut.register('CommandOrControl+D', async () => {
    const denied = await getModuleAccessDeniedPayload('meeting-assistance', 'shortcut:ctrl+d');
    if (denied) return;
    await openTranscriptionWindow();
  });

  // Atalho global Ctrl+P para pausar/despausar o microfone
  globalShortcut.register('CommandOrControl+P', () => {
    isMicrophonePaused = !isMicrophonePaused;

    const status = isMicrophonePaused ? 'pausado' : 'ativo';
    console.log(`🎤 Microfone ${status} (Ctrl+P)`);

    // Notificar a janela principal sobre a mudança de estado
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('microphone-status-changed', isMicrophonePaused);
    }
  });

  // Atalho global Ctrl+O para desabilitar/habilitar reação do avatar
  globalShortcut.register('CommandOrControl+O', () => {
    isAvatarReactionDisabled = !isAvatarReactionDisabled;

    const status = isAvatarReactionDisabled ? 'desabilitada' : 'habilitada';
    console.log(`🤖 Reação do avatar ${status} (Ctrl+O)`);

    // Ativar/desativar modo de transcrição apenas no assistant
    if (isAvatarReactionDisabled) {
      assistant.enableTranscribeOnlyMode();
    } else {
      assistant.disableTranscribeOnlyMode();
    }

    // Notificar a janela principal sobre a mudança de estado
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('avatar-reaction-status-changed', isAvatarReactionDisabled);
    }
  });

  // Atalho global Ctrl+M para alternar ActionBar
  globalShortcut.register('CommandOrControl+M', () => {
    console.log(`🎯 ActionBar toggle disparado (Ctrl+M)`);

    // Notificar a janela principal para alternar a ActionBar
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('actionbar-toggle');
    }
  });
});

app.on('window-all-closed', () => {
  const { globalShortcut } = require('electron');
  globalShortcut.unregisterAll();
  stopModuleAccessRealtime().catch(() => {
    // Sem impacto funcional durante shutdown.
  });
  app.quit()
})
ipcMain.on('audio-data', (event, buffer) => {
  const nodeBuffer = Buffer.from(buffer);

  // Se o microfone estiver pausado, não envia áudio nem para transcrição nem para o assistant
  if (isMicrophonePaused) {
    return;
  }

  // Inicia o Deepgram se ainda não estiver rodando (só no modo classic)
  assistant.startDeepgram();

  // Comportamento normal: transcreve E processa (avatar reage ou apenas transcreve se modo estiver ativo)
  // O transcribeOnlyMode é controlado internamente pelo assistant via Ctrl+O
  assistant.processAudioStream(nodeBuffer);
});

// Handler para mudar o provedor de IA (OpenAI vs Gemini) no modo classic
ipcMain.handle('set-ai-provider', async (event, provider: 'openai' | 'gemini' | 'deepseek') => {
  console.log(`🤖 Mudando provedor de IA para: ${provider}`);
  assistant.setAIProvider(provider);
  return { success: true };
});

// Handler para mudar o modelo de voz (TTS) no modo classic
ipcMain.handle('set-voice-model', async (event, voiceModel: 'polly' | 'elevenlabs') => {
  console.log(`🔊 Mudando modelo de voz para: ${voiceModel}`);
  assistant.setTTSProvider(voiceModel);
  return { success: true };
});

// Handler para recarregar o assistente (quando o usuário seleciona outro assistente)
ipcMain.handle('reload-assistant', async () => {
  console.log('🔄 Recarregando assistente...');
  await assistant.reloadAssistant();
  return { success: true };
});

// Handler para atualizar o estado de gravação contínua no VoiceAssistant
ipcMain.handle('set-continuous-recording', async (event, enabled: boolean) => {
  console.log(`🎥 Continuous Recording: ${enabled ? 'Ativado' : 'Desativado'}`);
  assistant.setContinuousRecordingEnabled(enabled);
  return { success: true };
});

// Handler para resetar a sessão Gemini Live (limpar histórico)
ipcMain.handle('reset-live-session', async () => {
  console.log('🔄 Resetando sessão Gemini Live...');
  assistant.resetLiveSession();
  return { success: true };
});

// Handler para enviar contexto de conversa ao Gemini Live
ipcMain.handle('send-conversation-context', async (event, data: { 
  transcriptions: Array<{ speaker: string; text: string }>;
  summary?: string;
}) => {
  try {
    console.log(`📝 [IPC] Enviando contexto de conversa ao Gemini Live (${data.transcriptions.length} transcrições, resumo: ${data.summary ? 'SIM' : 'NÃO'})`);
    const sent = await assistant.sendConversationContext(data.transcriptions, data.summary);
    
    if (sent) {
      console.log(`✅ [IPC] Contexto enviado com sucesso!`);
      return { success: true, sent: true };
    } else {
      console.warn(`⚠️ [IPC] Contexto NÃO foi enviado (verifique logs acima)`);
      return { success: true, sent: false, reason: 'Veja logs do GeminiLive para detalhes' };
    }
  } catch (error: any) {
    console.error('❌ [IPC] Erro ao enviar contexto de conversa:', error);
    return { success: false, error: error.message };
  }
});

// Handler para enviar contexto de código expandido ao LLM/Avatar
ipcMain.handle('send-code-context', async (event, data: {
  originalCode: string;
  fileName: string;
  referencesContext: string;
  userInstruction?: string;
}) => {
  try {
    console.log(`\n💻 [IPC] Enviando contexto de código ao Avatar`);
    console.log(`   📄 Arquivo: ${data.fileName}`);
    console.log(`   📝 Código: ${data.originalCode.length} caracteres`);
    console.log(`   🔗 Referências: ${data.referencesContext.length} caracteres`);
    
    // Usar a nova função dedicada para contexto de código (turnComplete=false)
    const sent = await assistant.sendCodeContext(
      data.fileName,
      data.originalCode,
      data.referencesContext,
      data.userInstruction
    );
    
    if (sent) {
      console.log(`✅ [IPC] Contexto de código enviado com sucesso!`);
      return { success: true, sent: true };
    } else {
      console.warn(`⚠️ [IPC] Contexto de código NÃO foi enviado`);
      return { success: true, sent: false, reason: 'Verifique se o Gemini Live está ativo' };
    }
  } catch (error: any) {
    console.error('❌ [IPC] Erro ao enviar contexto de código:', error);
    return { success: false, error: error.message };
  }
});

// Handler para encerrar a aplicação
ipcMain.on('quit-app', () => {
  console.log('👋 Encerrando aplicação...');
  app.quit();
});

// ===============================================
// HANDLERS DE CONFIGURAÇÕES DA TRANSCRIÇÃO
// ===============================================

ipcMain.handle('db:get-transcription-settings', async () => {
  try {
    const settings = getTranscriptionSettings();
    console.log('📖 [IPC] Configurações de transcrição carregadas:', settings);
    return { success: true, settings };
  } catch (error) {
    console.error('❌ [IPC] Erro ao carregar configurações de transcrição:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:set-transcription-settings', async (event, settings: {
  fontSize?: number;
  windowOpacity?: number;
  includeAvatarInConversation?: boolean;
  avatarInteractionCount?: number;
  avatarInteractionMode?: 'fixed' | 'dynamic';
  avatarResponseChance?: number;
}) => {
  try {
    setTranscriptionSettings(settings);
    console.log('💾 [IPC] Configurações de transcrição salvas:', settings);
    return { success: true };
  } catch (error) {
    console.error('❌ [IPC] Erro ao salvar configurações de transcrição:', error);
    return { success: false, error: error.message };
  }
});


// Screen Recording Logic
ipcMain.handle('get-screen-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL() // Send as DataURL due to serialization
  }));
});

// Store last saved recording path
let lastRecordingPath: string | null = null;

// Temp directory for recording segments
const fs = require('fs');
const recordingTempDir = path.join(app.getPath('userData'), 'recording_buffer');
console.log('Recording temp dir:', recordingTempDir);
// Ensure temp directory exists
if (!fs.existsSync(recordingTempDir)) {
  fs.mkdirSync(recordingTempDir, { recursive: true });
}

// Save a recording segment to disk
ipcMain.handle('save-segment', async (event, buffer: ArrayBuffer, segmentId: string) => {
  const nodeBuffer = Buffer.from(buffer);
  const segmentPath = path.join(recordingTempDir, `segment_${segmentId}.webm`);

  fs.writeFileSync(segmentPath, nodeBuffer);
  console.log(`📹 Segment saved: ${segmentPath} (${(nodeBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

  return segmentPath;
});

// Delete old segments
ipcMain.handle('delete-segments', async (event, segmentPaths: string[]) => {
  for (const segmentPath of segmentPaths) {
    try {
      if (fs.existsSync(segmentPath)) {
        fs.unlinkSync(segmentPath);
      }
    } catch (err) {
      console.warn(`Failed to delete segment: ${segmentPath}`, err);
    }
  }
  return true;
});

// Concatenate segments into final MP4 video file using FFmpeg
ipcMain.handle('concatenate-segments', async (event, segmentPaths: string[], outputFilename: string) => {
  const videosPath = app.getPath('videos');

  // Change extension to .mp4
  const mp4Filename = outputFilename.replace('.webm', '.mp4');
  const outputPath = path.join(videosPath, mp4Filename);

  // Filter out non-existent segments
  const validPaths = segmentPaths.filter(p => fs.existsSync(p));

  if (validPaths.length === 0) {
    console.warn('No segments to concatenate');
    return null;
  }

  console.log(`🎥 Converting ${validPaths.length} segments to MP4...`);

  return new Promise<string | null>((resolve) => {
    let ffmpegCommand = ffmpeg();

    if (validPaths.length === 1) {
      // Single segment - just convert directly
      ffmpegCommand = ffmpegCommand.input(validPaths[0]);
    } else {
      // Multiple segments - use concat demuxer
      const concatFilePath = path.join(recordingTempDir, 'concat_list.txt');
      const concatContent = validPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
      fs.writeFileSync(concatFilePath, concatContent);

      ffmpegCommand = ffmpegCommand
        .input(concatFilePath)
        .inputOptions(['-f', 'concat', '-safe', '0']);
    }

    ffmpegCommand
      .outputOptions([
        '-c:v', 'copy',           // Copy video stream (fast)
        '-c:a', 'aac',            // Re-encode audio to AAC (MP4 compatible)
        '-b:a', '192k',           // Audio bitrate
        '-movflags', '+faststart', // Enable seeking from start
        '-y'                       // Overwrite output
      ])
      .output(outputPath)
      .on('start', (cmd) => {
        console.log(`🎬 FFmpeg started: ${cmd}`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`🎬 Converting: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('end', () => {
        console.log(`🎥 Recording saved: ${outputPath}`);

        // Clean up concat file if it exists
        const concatFilePath = path.join(recordingTempDir, 'concat_list.txt');
        try { fs.unlinkSync(concatFilePath); } catch { }

        // Store for later reference
        lastRecordingPath = outputPath;
        assistant.setLastRecordingPath(outputPath);

        resolve(outputPath);
      })
      .on('error', (err, stdout, stderr) => {
        console.error('FFmpeg error:', err.message);
        console.error('FFmpeg stderr:', stderr);

        // Fallback: just concatenate webm files
        console.log('Falling back to raw concatenation...');
        const buffers: Buffer[] = [];
        for (const segmentPath of validPaths) {
          const data = fs.readFileSync(segmentPath);
          buffers.push(data);
        }
        const combined = Buffer.concat(buffers);
        const webmPath = path.join(videosPath, outputFilename);
        fs.writeFileSync(webmPath, combined);

        lastRecordingPath = webmPath;
        assistant.setLastRecordingPath(webmPath);

        resolve(webmPath);
      })
      .run();
  });
});

// Legacy: Save recording buffer to file (for compatibility)
ipcMain.handle('save-recording', async (event, buffer: ArrayBuffer, filename: string) => {
  const nodeBuffer = Buffer.from(buffer);

  // Save to user's Videos folder or app data
  const videosPath = app.getPath('videos');
  const savePath = path.join(videosPath, filename);

  fs.writeFileSync(savePath, nodeBuffer);
  console.log(`🎥 Recording saved: ${savePath} (${(nodeBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

  // Store for later reference
  lastRecordingPath = savePath;
  assistant.setLastRecordingPath(savePath);

  return savePath;
});

ipcMain.on('analyze-video', (event, buffer) => {
  const nodeBuffer = Buffer.from(buffer);

  // Save for debugging
  const debugPath = path.join(app.getPath('userData'), 'latest_recording.webm');
  require('fs').writeFileSync(debugPath, nodeBuffer);
  console.log(`🎥 Vídeo salvo para debug em: ${debugPath}`);

  // Check current mode
  const currentMode = assistant.getMode();
  console.log(`🎥 Modo atual: ${currentMode}`);

  if (currentMode === 'live') {
    // In Live mode, the Gemini Live already has real-time screen context
    // We just notify that recording stopped - Gemini Live will respond with native audio
    console.log("🎥 Modo Live: Gemini Live já tem contexto da tela em tempo real");
    // The tool response was already sent, Gemini Live will generate audio response
  } else {
    // In Classic mode, use Gemini for video analysis + TTS
    assistant.analyzeVideo(nodeBuffer).catch(err => {
      console.error("Error analyzing video:", err);
    });
  }
});

// Eventos do Assistant -> Frontend
ipcMain.on('set-assistant-mode', (event, mode: 'classic' | 'live') => {
  assistant.setMode(mode).catch((error) => {
    console.error('❌ Erro ao alternar modo do assistente:', error);
  });
});

// Screen sharing for Gemini Live
ipcMain.on('screen-frame', (event, base64Image: string) => {
  assistant.sendScreenFrame(base64Image);
});

assistant.on('transcription', (text) => {
  mainWindow.webContents.send('transcription', text);
});

assistant.on('audio-ready', (filePath, buffer) => {
  mainWindow.webContents.send('play-audio', buffer);
});

assistant.on('audio-chunk', (chunk) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('audio-chunk', chunk);
  }
});

assistant.on('audio-end', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('audio-end');
  }
});

// Handle user interruption (barge-in) - stop audio playback
assistant.on('interrupted', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('audio-interrupted');
  }
});

assistant.on('ai-response', (text) => {
  mainWindow.webContents.send('ai-response', text);
});

assistant.on('code-detected', (code) => {
  mainWindow.webContents.send('show-code', code);
});

assistant.on('control-recording', (action) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('control-recording', action);
  }
});

assistant.on('avatar-action', (type, value) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('avatar-action', { type, value });
  }
});

assistant.on('control-screen-share', (action) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    console.log(`[IPC] Sending control-screen-share: ${action}`);
    mainWindow.webContents.send('control-screen-share', action);
  }
});

assistant.on('save-recording', (durationSeconds: number) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    console.log(`[IPC] Sending save-recording-command: ${durationSeconds}s`);
    mainWindow.webContents.send('save-recording-command', durationSeconds);
  }
});

assistant.on('take-screenshot', async () => {
  try {
    console.log("📸 Iniciando captura de tela...");

    // 1. Obter informações do display PRIMÁRIO
    const display = screen.getPrimaryDisplay();

    // 2. Calcular a resolução física real (Lidar com DPI/Escala e Telas 4K)
    // display.size retorna o tamanho lógico. Multiplicamos pelo scaleFactor para obter os pixels reais.
    const width = display.size.width * display.scaleFactor;
    const height = display.size.height * display.scaleFactor;

    console.log(`📏 Resolução detectada (física): ${width}x${height} (Escala: ${display.scaleFactor}x)`);

    // 3. Solicitar a fonte JÁ no tamanho correto
    // Isso evita capturar pequeno e tentar esticar depois.
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: width, height: height }
    });

    const primarySource = sources[0];

    if (primarySource) {
      // A imagem já está no tamanho total, não precisa usar .resize() a menos que queira diminuir
      const originalImage = primarySource.thumbnail;

      // --- DEBUG LOCAL (Salvar PNG Lossless) ---
      const debugPath = path.join(app.getPath('userData'), 'last_screenshot.png');
      // toPNG() garante qualidade sem perdas
      fs.writeFileSync(debugPath, originalImage.toPNG());
      console.log(`📸 Screenshot Full HD+ salvo em: ${debugPath}`);

      // --- LÓGICA DO ASSISTENTE ---
      const currentMode = assistant.getMode();
      console.log(`📸 Modo atual: ${currentMode}`);

      if (currentMode === 'live') {
        // Para streaming (Gemini Live), PNG pode ser pesado demais.
        // JPEG com qualidade 90+ é o melhor equilíbrio entre velocidade e qualidade visual.
        const base64Image = originalImage.toJPEG(90).toString('base64');

        console.log("📸 Enviando screenshot para Gemini Live...");
        assistant.sendScreenFrame(base64Image);

        // Adicionar screenshot à galeria do backend
        const screenshotId = `screenshot-${Date.now()}`;
        assistant.addMediaToGallery({
          id: screenshotId,
          type: 'screenshot',
          path: debugPath,
          timestamp: Date.now()
        });

        createScreenshotGalleryWindow().then(() => {
          sendScreenshotToGallery(base64Image);
        });
      } else {
        // Modo Clássico (OpenAI Vision geralmente aceita PNG ou JPEG)
        const base64Image = originalImage.toPNG().toString('base64');

        assistant.analyzeScreenshot(base64Image).catch(err => {
          console.error("Erro ao analisar screenshot:", err);
        });

        // Adicionar screenshot à galeria do backend
        const screenshotId = `screenshot-${Date.now()}`;
        assistant.addMediaToGallery({
          id: screenshotId,
          type: 'screenshot',
          path: debugPath,
          timestamp: Date.now()
        });

        createScreenshotGalleryWindow().then(() => {
          sendScreenshotToGallery(base64Image);
        });
      }
    }
  } catch (error) {
    console.error("Erro ao capturar screenshot:", error);
  }
});

// Forward transcriptions to transcription window
assistant.on('user-transcription', (text: string) => {
  if (transcriptionWindow && !transcriptionWindow.isDestroyed()) {
    transcriptionWindow.webContents.send('user-transcription', text);
  }
});

assistant.on('model-transcription', (text: string) => {
  if (transcriptionWindow && !transcriptionWindow.isDestroyed()) {
    transcriptionWindow.webContents.send('model-transcription', text);
  }
});

// Limpar galeria do frontend após compartilhamento bem-sucedido
assistant.on('clear-gallery', () => {
  console.log('🗑️ Limpando galeria do frontend após compartilhamento');
  if (screenshotGalleryWindow && !screenshotGalleryWindow.isDestroyed()) {
    screenshotGalleryWindow.webContents.send('clear-gallery');
  }
  // Também limpar variáveis locais de screenshots
  currentSessionScreenshots = [];
  pendingScreenshots = [];
});

// Enviar resultados de conhecimento para a janela dedicada
assistant.on('knowledge-results', async (results: any[]) => {
  console.log(`📚 Knowledge results found: ${results.length} items`);
  
  // Abrir ou focar a janela de resultados
  await openKnowledgeResultsWindow();
  
  // Aguardar janela estar pronta e enviar resultados
  setTimeout(() => {
    if (knowledgeResultsWindow && !knowledgeResultsWindow.isDestroyed()) {
      knowledgeResultsWindow.webContents.send('knowledge-results', results);
    }
  }, 300);
});


// ========================================
// DETECÇÃO AUTOMÁTICA DE EDITORES/IDEs
// ========================================

// Configuração dos Editores Suportados
// 'processName': Nome do executável na lista de tarefas (Task Manager/Activity Monitor)
// 'cmd': Comando para chamar via terminal
// 'args': Como passar o arquivo e linha. {path} e {line} são placeholders.
const SUPPORTED_EDITORS = [
  { 
    id: 'antigravity', 
    processName: process.platform === 'win32' ? 'Antigravity.exe' : 'Antigravity', 
    cmd: 'antigravity', 
    args: '--goto "{path}:{line}"' 
  },
  { 
    id: 'trae', 
    processName: process.platform === 'win32' ? 'Trae.exe' : 'Trae', 
    cmd: 'trae', 
    args: '--goto "{path}:{line}"' 
  },
  { 
    id: 'cursor', 
    processName: process.platform === 'win32' ? 'Cursor.exe' : 'Cursor', 
    cmd: 'cursor', 
    args: '--goto "{path}:{line}"' 
  },
  { 
    id: 'vscode', 
    processName: process.platform === 'win32' ? 'Code.exe' : 'Electron',
    cmd: 'code', 
    args: '--goto "{path}:{line}"' 
  },
  { 
    id: 'windsurf', 
    processName: process.platform === 'win32' ? 'Windsurf.exe' : 'Windsurf', 
    cmd: 'windsurf', 
    args: '--goto "{path}:{line}"' 
  },
];

// Função para verificar se um processo está rodando
async function isEditorRunning(processName: string): Promise<boolean> {
  try {
    const command = process.platform === 'win32' 
      ? `tasklist /FI "IMAGENAME eq ${processName}"` 
      : `ps -A | grep -v grep | grep "${processName}"`;
      
    const { stdout } = await execAsync(command);
    return stdout.toLowerCase().includes(processName.toLowerCase());
  } catch (e) {
    return false;
  }
}

// Função para verificar se o comando existe no PATH (instalado)
async function isCommandAvailable(cmd: string): Promise<boolean> {
  try {
    const checkCmd = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
    await execAsync(checkCmd);
    return true;
  } catch {
    return false;
  }
}

// Abrir arquivo no editor detectado automaticamente
ipcMain.handle('open-file-in-editor', async (_event, filePath: string, line?: number) => {
  try {
    const fs = require('fs');
    
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }

    // Estratégia 1: Procurar um editor que JÁ esteja rodando (Prioridade Máxima)
    for (const editor of SUPPORTED_EDITORS) {
      if (await isEditorRunning(editor.processName)) {
        if (await isCommandAvailable(editor.cmd)) {
          console.log(`✅ Detectado ${editor.id} rodando. Abrindo nele...`);
          const cmdArgs = line 
            ? editor.args.replace('{path}', filePath).replace('{line}', line.toString())
            : `"${filePath}"`;
          
          await execAsync(`${editor.cmd} ${cmdArgs}`);
          return { success: true, openedWith: editor.id };
        }
      }
    }

    // Estratégia 2: Se nenhum estiver rodando, procurar o primeiro instalado da lista
    for (const editor of SUPPORTED_EDITORS) {
      if (await isCommandAvailable(editor.cmd)) {
        console.log(`📥 Nenhum editor rodando. Encontrado ${editor.id} instalado.`);
        const cmdArgs = line 
            ? editor.args.replace('{path}', filePath).replace('{line}', line.toString())
            : `"${filePath}"`;
            
        await execAsync(`${editor.cmd} ${cmdArgs}`);
        return { success: true, openedWith: editor.id };
      }
    }

    // Estratégia 3: Fallback para o padrão do SO
    console.log('⚠️ Nenhum editor compatível encontrado. Usando padrão do sistema.');
    await shell.openPath(filePath);
    return { success: true, openedWith: 'system-default' };

  } catch (error: any) {
    console.error('Error opening file:', error);
    // Fallback de emergência
    shell.openPath(filePath);
    return { success: false, error: error.message };
  }
});

// Helper para localizar o arquivo .model3.json
ipcMain.handle('find-model-file', async (event, modelName) => {
  try {
    const fs = require('fs');
    const path = require('path');

    let modelsPath;
    if (process.env.NODE_ENV === 'production') {
      modelsPath = path.join(process.resourcesPath, 'renderer', 'public', 'models', modelName);
      // Failover for some production builds structure
      if (!fs.existsSync(modelsPath)) {
        modelsPath = path.join(app.getAppPath(), 'renderer', 'public', 'models', modelName);
      }
    } else {
      modelsPath = path.join(app.getAppPath(), 'renderer', 'public', 'models', modelName);
    }

    console.log(`Searching for model file in: ${modelsPath}`);

    if (!fs.existsSync(modelsPath)) {
      console.error(`Directory not found: ${modelsPath}`);
      return null;
    }

    const files = await fs.promises.readdir(modelsPath);
    const modelFile = files.find(file => file.endsWith('.model3.json'));

    return modelFile || null;
  } catch (error) {
    console.error("Error finding model file:", error);
    return null;
  }
});

// ========================================
// SCREENSHOT SHARING
// ========================================
import { ScreenshotShareService } from './lib/screenshot-share-service';
const screenshotShareService = new ScreenshotShareService();

ipcMain.handle('share-screenshot', async (event, options: { platform: 'whatsapp' | 'email' | 'drive', recipient?: string, message?: string }) => {
  try {
    console.log(`📤 [IPC] Share screenshot request:`, options);

    // Obter caminho do último screenshot
    const screenshotPath = await screenshotShareService.getLatestScreenshotPath();

    if (!screenshotPath) {
      return {
        success: false,
        message: 'Nenhum screenshot encontrado. Por favor, tire um screenshot primeiro.',
        platform: options.platform,
      };
    }

    // Compartilhar screenshot
    const result = await screenshotShareService.shareScreenshot({
      platform: options.platform,
      recipient: options.recipient,
      message: options.message,
      screenshotPath,
    });

    console.log(`📤 [IPC] Share result:`, result);
    return result;
  } catch (error) {
    console.error('❌ [IPC] Error sharing screenshot:', error);
    return {
      success: false,
      message: `Erro ao compartilhar: ${error.message}`,
      platform: options.platform,
    };
  }
});

// ========================================
// DESKTOP AUDIO TRANSCRIPTION
// ========================================

import { DeepgramService } from './lib/services/deepgram-service';
import { initializeSqliteDatabase } from './lib/sqlite-database';

// Serviço Deepgram separado apenas para transcrição do desktop
let desktopDeepgramService: DeepgramService | null = null;
let desktopTranscriptionWindow: Electron.WebContents | null = null;

// Iniciar transcrição do desktop
ipcMain.handle('start-desktop-transcription', async (event) => {
  try {
    const denied = await getModuleAccessDeniedPayload('meeting-assistance', 'start-desktop-transcription');
    if (denied) return denied;

    console.log('[DesktopTranscription] Iniciando serviço Deepgram...');

    // Guardar referência à janela que iniciou a transcrição
    desktopTranscriptionWindow = event.sender;

    if (!desktopDeepgramService) {
      desktopDeepgramService = new DeepgramService();

      // Listener para transcrições finais
      desktopDeepgramService.on('transcription-final', (text: string) => {
        if (desktopTranscriptionWindow && !desktopTranscriptionWindow.isDestroyed()) {
          desktopTranscriptionWindow.send('desktop-transcription', {
            text,
            isFinal: true
          });
        }
      });

      // Listener para status
      desktopDeepgramService.on('status', (status: string) => {
        if (desktopTranscriptionWindow && !desktopTranscriptionWindow.isDestroyed()) {
          desktopTranscriptionWindow.send('desktop-transcription-status', status);
        }
      });

      // Listener para erros
      desktopDeepgramService.on('error', (error: any) => {
        console.error('[DesktopTranscription] Erro:', error);
        if (desktopTranscriptionWindow && !desktopTranscriptionWindow.isDestroyed()) {
          desktopTranscriptionWindow.send('desktop-transcription-error', error);
        }
      });
    }

    desktopDeepgramService.start();
    console.log('[DesktopTranscription] Serviço Deepgram iniciado');
    return true;
  } catch (error) {
    console.error('[DesktopTranscription] Erro ao iniciar:', error);
    throw error;
  }
});

// Parar transcrição do desktop
ipcMain.handle('stop-desktop-transcription', async () => {
  try {
    console.log('[DesktopTranscription] Parando serviço Deepgram...');

    if (desktopDeepgramService) {
      desktopDeepgramService.stop();
      desktopDeepgramService.removeAllListeners();
      desktopDeepgramService = null;
    }

    desktopTranscriptionWindow = null;

    console.log('[DesktopTranscription] Serviço Deepgram parado');
    return true;
  } catch (error) {
    console.error('[DesktopTranscription] Erro ao parar:', error);
    throw error;
  }
});

// Receber chunks de áudio do desktop e enviar para Deepgram
ipcMain.on('desktop-audio-chunk', (event, buffer: ArrayBuffer) => {
  if (desktopDeepgramService) {
    const nodeBuffer = Buffer.from(buffer);
    desktopDeepgramService.processAudioStream(nodeBuffer);
  }
});
