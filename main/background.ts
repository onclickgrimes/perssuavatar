import path from 'path'
import { app, ipcMain, BrowserWindow, screen, desktopCapturer } from 'electron'
import serve from 'electron-serve'
import { createWindow } from './helpers'
import { VoiceAssistant } from './lib/voice-assistant';
export let mainWindow;
const assistant = new VoiceAssistant('elevenlabs');
const isProd = process.env.NODE_ENV === 'production'

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

; (async () => {
  await app.whenReady()

  // Permissão de Microfone
  app.on('web-contents-created', (event, contents) => {
    contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'media') {
        return callback(true);
      }
      callback(false);
    });
  });

  mainWindow = createWindow('main', {
    width: 1000,
    height: 600,
    transparent: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // SEGURANÇA MÁXIMA
      contextIsolation: true,
    },
  })

  // Global Mouse Tracking Loop
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const point = screen.getCursorScreenPoint();
      mainWindow.webContents.send('global-mouse-move', point);
    }
  }, 50); // 20 FPS update rate

  if (isProd) {
    await mainWindow.loadURL('app://./home')
  } else {
    const port = process.argv[2]
    await mainWindow.loadURL(`http://localhost:${port}/home`)
    mainWindow.webContents.openDevTools()
  }
})()

app.on('window-all-closed', () => {
  app.quit()
})

ipcMain.on('message', async (event, arg) => {
  event.reply('message', `${arg} World!`)
})


// Controle de cliques (Click-through)
// ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
//   const win = BrowserWindow.fromWebContents(event.sender);
//   if (win) {
//     win.setIgnoreMouseEvents(ignore, options);
//   }
// });

ipcMain.on('resize-window', (event, width, height) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setSize(width, height);
  }
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

// Recebe áudio do frontend e manda pro Deepgram
ipcMain.on('audio-data', (event, buffer) => {
  // Inicia o Deepgram se ainda não estiver rodando
  assistant.startDeepgram();

  // Converta ArrayBuffer para Buffer se necessário e envie para o assistant
  const nodeBuffer = Buffer.from(buffer);
  assistant.processAudioStream(nodeBuffer);
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

ipcMain.on('analyze-video', (event, buffer) => {
    const nodeBuffer = Buffer.from(buffer);
    
    // Save for debugging
    const debugPath = path.join(app.getPath('userData'), 'latest_recording.webm');
    require('fs').writeFileSync(debugPath, nodeBuffer);
    console.log(`🎥 Vídeo salvo para debug em: ${debugPath}`);

    assistant.analyzeVideo(nodeBuffer).catch(err => {
        console.error("Error analyzing video:", err);
    });
});

// Eventos do Assistant -> Frontend
assistant.on('transcription', (text) => {
  mainWindow.webContents.send('transcription', text);
});

assistant.on('audio-ready', (filePath, buffer) => {
  mainWindow.webContents.send('play-audio', buffer);
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

assistant.on('take-screenshot', async () => {
    try {
        console.log("📸 Tirando screenshot...");
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
        const primarySource = sources[0]; // Usually the first one or filter by name

        if (primarySource) {
            const display = screen.getPrimaryDisplay();
            const { width, height } = display.size;
            
            // Half resolution
            const halfWidth = Math.round(width / 2);
            const halfHeight = Math.round(height / 2);

            console.log(`Redimensionando screenshot para: ${halfWidth}x${halfHeight}`);
            
            // Resize using NativeImage
            const resizedImage = primarySource.thumbnail.resize({ width: halfWidth, height: halfHeight });
            
            // Salvar imagem localmente para debug
            const debugPath = path.join(app.getPath('userData'), 'last_screenshot.png');
            require('fs').writeFileSync(debugPath, resizedImage.toPNG());
            console.log(`📸 Screenshot salvo em: ${debugPath}`);

            const base64Image = resizedImage.toPNG().toString('base64');
            
            // Send back to assistant for analysis
            assistant.analyzeScreenshot(base64Image).catch(err => {
                console.error("Erro ao analisar screenshot:", err);
            });
        }
    } catch (error) {
        console.error("Erro ao capturar screenshot:", error);
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