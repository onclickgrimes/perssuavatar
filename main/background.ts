import path from 'path'
import { app, ipcMain, BrowserWindow, screen, desktopCapturer } from 'electron'
import serve from 'electron-serve'
import { createWindow } from './helpers'
import { VoiceAssistant } from './lib/voice-assistant';
import ffmpeg from 'fluent-ffmpeg';
import { initializeDatabase } from './lib/database';
import { registerDatabaseHandlers } from './lib/database-handlers';

const isProd = process.env.NODE_ENV === 'production'

// Get ffmpeg path - different for dev vs prod
let ffmpegPath: string;
if (isProd) {
    // In production, ffmpeg-static will be in asar.unpacked
    ffmpegPath = require('ffmpeg-static');
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
} else {
    // In development, use the path directly from node_modules
    ffmpegPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
}
console.log('FFmpeg path:', ffmpegPath);
ffmpeg.setFfmpegPath(ffmpegPath);

export let mainWindow;
const assistant = new VoiceAssistant('elevenlabs');

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

; (async () => {
  await app.whenReady()

  // Inicializa o banco de dados
  initializeDatabase();
  registerDatabaseHandlers();

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
    alwaysOnTop: true, // Sobrepor todas as janelas por padrão
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
    // mainWindow.webContents.openDevTools()
  }
})()

app.on('window-all-closed', () => {
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

// Always on top toggle
ipcMain.on('set-always-on-top', (event, enabled: boolean) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setAlwaysOnTop(enabled);
    console.log(`🪟 Always on top: ${enabled}`);
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

let transcriptionWindow: BrowserWindow | null = null;

// Register global shortcut for transcription window
app.whenReady().then(() => {
  const { globalShortcut } = require('electron');
  
  globalShortcut.register('CommandOrControl+D', async () => {
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

    console.log('📝 Transcription window opened with Ctrl+D');
  });
});

app.on('window-all-closed', () => {
  const { globalShortcut } = require('electron');
  globalShortcut.unregisterAll();
  app.quit()
})
ipcMain.on('audio-data', (event, buffer) => {
  // Inicia o Deepgram se ainda não estiver rodando (só no modo classic)
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
                try { fs.unlinkSync(concatFilePath); } catch {}
                
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
    assistant.setMode(mode);
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

            // Check current mode
            const currentMode = assistant.getMode();
            console.log(`📸 Modo atual: ${currentMode}`);

            if (currentMode === 'live') {
                // In Live mode, send image directly to Gemini Live
                const base64Image = resizedImage.toJPEG(80).toString('base64'); // JPEG for smaller size
                console.log("📸 Enviando screenshot para Gemini Live...");
                assistant.sendScreenFrame(base64Image);
            } else {
                // In Classic mode, use OpenAI for analysis
                const base64Image = resizedImage.toPNG().toString('base64');
                assistant.analyzeScreenshot(base64Image).catch(err => {
                    console.error("Erro ao analisar screenshot:", err);
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