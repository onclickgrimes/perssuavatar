import path from 'path'
import { app, ipcMain, BrowserWindow, screen, desktopCapturer } from 'electron'
import serve from 'electron-serve'
import { createWindow } from './helpers'
import { VoiceAssistant } from './lib/voice-assistant';
export let mainWindow;
const assistant = new VoiceAssistant('polly');
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