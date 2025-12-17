import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

const handler = {
  send(channel: string, value: unknown) {
    ipcRenderer.send(channel, value)
  },
  on(channel: string, callback: (...args: unknown[]) => void) {
    const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
      callback(...args)
    ipcRenderer.on(channel, subscription)

    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  },
  // Audio
  sendAudioData: (buffer: ArrayBuffer) => ipcRenderer.send('audio-data', buffer),
  
  // Window Control
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => 
    ipcRenderer.send('set-ignore-mouse-events', ignore, options),

  // Events
  onTranscription: (callback: (text: string) => void) => {
    const subscription = (_: any, text: string) => callback(text);
    ipcRenderer.on('transcription', subscription);
    return () => ipcRenderer.removeListener('transcription', subscription);
  },
  onPlayAudio: (callback: (buffer: ArrayBuffer) => void) => {
    const subscription = (_: any, buffer: ArrayBuffer) => callback(buffer);
    ipcRenderer.on('play-audio', subscription);
    return () => ipcRenderer.removeListener('play-audio', subscription);
  },
  onAudioChunk: (callback: (chunk: ArrayBuffer) => void) => {
      const subscription = (_: any, chunk: ArrayBuffer) => callback(chunk);
      ipcRenderer.on('audio-chunk', subscription);
      return () => ipcRenderer.removeListener('audio-chunk', subscription);
  },
  onAudioEnd: (callback: () => void) => {
      const subscription = () => callback();
      ipcRenderer.on('audio-end', subscription);
      return () => ipcRenderer.removeListener('audio-end', subscription);
  },
  onShowCode: (callback: (code: string) => void) => {
    const subscription = (_: any, code: string) => callback(code);
    ipcRenderer.on('show-code', subscription);
    return () => ipcRenderer.removeListener('show-code', subscription);
  },
  onAiResponse: (callback: (text: string) => void) => {
    const subscription = (_: any, text: string) => callback(text);
    ipcRenderer.on('ai-response', subscription);
    return () => ipcRenderer.removeListener('ai-response', subscription);
  },
  onGlobalMouseMove: (callback: (coords: { x: number, y: number }) => void) => {
    const subscription = (_: any, coords: { x: number, y: number }) => callback(coords);
    ipcRenderer.on('global-mouse-move', subscription);
    return () => ipcRenderer.removeListener('global-mouse-move', subscription);
  },
  resizeWindow: (width: number, height: number) => ipcRenderer.send('resize-window', width, height),
  moveWindow: (x: number, y: number) => ipcRenderer.send('move-window', x, y),
  openSettings: () => ipcRenderer.send('open-settings'),
  setContentProtection: (enabled: boolean) => ipcRenderer.send('set-content-protection', enabled),
  setAlwaysOnTop: (enabled: boolean) => ipcRenderer.send('set-always-on-top', enabled),
  copyToClipboard: (text: string) => ipcRenderer.invoke('copy-to-clipboard', text),
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  analyzeVideo: (buffer: ArrayBuffer) => ipcRenderer.send('analyze-video', buffer),
  onControlRecording: (callback: (action: 'start' | 'stop') => void) => {
    const subscription = (_: any, action: 'start' | 'stop') => callback(action);
    ipcRenderer.on('control-recording', subscription);
    return () => {
        ipcRenderer.removeListener('control-recording', subscription);
    };
  },
  onAvatarAction: (callback: (action: { type: 'mood' | 'gesture', value: string }) => void) => {
      const subscription = (_: any, action: { type: 'mood' | 'gesture', value: string }) => callback(action);
      ipcRenderer.on('avatar-action', subscription);
      return () => ipcRenderer.removeListener('avatar-action', subscription);
  },
  findModelFile: (modelName: string) => ipcRenderer.invoke('find-model-file', modelName),
  setAssistantMode: (mode: 'classic' | 'live') => ipcRenderer.send('set-assistant-mode', mode),
  onAudioInterrupted: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on('audio-interrupted', subscription);
    return () => ipcRenderer.removeListener('audio-interrupted', subscription);
  },
  onControlScreenShare: (callback: (action: 'start' | 'stop') => void) => {
    const subscription = (_: any, action: 'start' | 'stop') => callback(action);
    ipcRenderer.on('control-screen-share', subscription);
    return () => { ipcRenderer.removeListener('control-screen-share', subscription); };
  },
  sendScreenFrame: (base64Image: string) => ipcRenderer.send('screen-frame', base64Image),
  // Segment-based recording (disk-based for low RAM usage)
  saveSegment: (buffer: ArrayBuffer, segmentId: string): Promise<string> =>
    ipcRenderer.invoke('save-segment', buffer, segmentId),
  deleteSegments: (segmentPaths: string[]): Promise<boolean> =>
    ipcRenderer.invoke('delete-segments', segmentPaths),
  concatenateSegments: (segmentPaths: string[], outputFilename: string): Promise<string | null> =>
    ipcRenderer.invoke('concatenate-segments', segmentPaths, outputFilename),
  // Legacy: Save recording buffer to file
  saveRecording: (buffer: ArrayBuffer, filename: string): Promise<string> => 
    ipcRenderer.invoke('save-recording', buffer, filename),
  // Listen for save recording command from voice
  onSaveRecording: (callback: (durationSeconds: number) => void) => {
    const subscription = (_: any, durationSeconds: number) => callback(durationSeconds);
    ipcRenderer.on('save-recording-command', subscription);
    return () => { ipcRenderer.removeListener('save-recording-command', subscription); };
  },
  onUserTranscription: (callback: (text: string) => void) => {
    const subscription = (_: any, text: string) => callback(text);
    ipcRenderer.on('user-transcription', subscription);
    return () => { ipcRenderer.removeListener('user-transcription', subscription); };
  },
  onModelTranscription: (callback: (text: string) => void) => {
    const subscription = (_: any, text: string) => callback(text);
    ipcRenderer.on('model-transcription', subscription);
    return () => { ipcRenderer.removeListener('model-transcription', subscription); };
  },
  
  // ========================================
  // DATABASE FUNCTIONS
  // ========================================
  
  // Método genérico invoke para todas as chamadas IPC
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  
  // User Settings (atalhos convenientes)
  db: {
    // User Settings
    getUserSettings: () => ipcRenderer.invoke('db:get-user-settings'),
    setUserSettings: (settings: any) => ipcRenderer.invoke('db:set-user-settings', settings),
    getTTSProvider: () => ipcRenderer.invoke('db:get-tts-provider'),
    setTTSProvider: (provider: 'elevenlabs' | 'polly' | 'deepgram') => 
      ipcRenderer.invoke('db:set-tts-provider', provider),
    getAssistantMode: () => ipcRenderer.invoke('db:get-assistant-mode'),
    setAssistantMode: (mode: 'classic' | 'live') => 
      ipcRenderer.invoke('db:set-assistant-mode', mode),
    
    // Conversation History
    getConversationHistory: () => ipcRenderer.invoke('db:get-conversation-history'),
    addConversation: (conversation: any) => ipcRenderer.invoke('db:add-conversation', conversation),
    clearConversationHistory: () => ipcRenderer.invoke('db:clear-conversation-history'),
    getRecentConversations: (limit?: number) => 
      ipcRenderer.invoke('db:get-recent-conversations', limit),
    
    // Window State
    getWindowState: () => ipcRenderer.invoke('db:get-window-state'),
    saveWindowState: (state: any) => ipcRenderer.invoke('db:save-window-state', state),
    
    // Recordings
    getRecordings: () => ipcRenderer.invoke('db:get-recordings'),
    addRecording: (recording: any) => ipcRenderer.invoke('db:add-recording', recording),
    deleteRecording: (recordingId: string) => ipcRenderer.invoke('db:delete-recording', recordingId),
    getRecentRecordings: (limit?: number) => ipcRenderer.invoke('db:get-recent-recordings', limit),
    
    // Screenshots
    getScreenshots: () => ipcRenderer.invoke('db:get-screenshots'),
    addScreenshot: (screenshot: any) => ipcRenderer.invoke('db:add-screenshot', screenshot),
    deleteScreenshot: (screenshotId: string) => ipcRenderer.invoke('db:delete-screenshot', screenshotId),
    
    // Assistants
    getAssistants: () => ipcRenderer.invoke('db:get-assistants'),
    getAssistantById: (assistantId: string) => ipcRenderer.invoke('db:get-assistant-by-id', assistantId),
    createAssistant: (assistant: any) => ipcRenderer.invoke('db:create-assistant', assistant),
    updateAssistant: (assistantId: string, updates: any) => 
      ipcRenderer.invoke('db:update-assistant', assistantId, updates),
    deleteAssistant: (assistantId: string) => ipcRenderer.invoke('db:delete-assistant', assistantId),
    
    // Transcription Settings
    getTranscriptionSettings: () => ipcRenderer.invoke('db:get-transcription-settings'),
    setTranscriptionSettings: (settings: {
      fontSize?: number;
      windowOpacity?: number;
      includeAvatarInConversation?: boolean;
      avatarInteractionCount?: number;
      avatarInteractionMode?: 'fixed' | 'dynamic';
      avatarResponseChance?: number;
    }) => ipcRenderer.invoke('db:set-transcription-settings', settings),
    
    // Utilities
    getStats: () => ipcRenderer.invoke('db:get-stats'),
    export: () => ipcRenderer.invoke('db:export'),
    getPath: () => ipcRenderer.invoke('db:get-path'),
    clearAll: () => ipcRenderer.invoke('db:clear-all')
  },
  
  // ========================================
  // SUMMARY SERVICE (Assistente na Transcrição)
  // ========================================
  
  summary: {
    // Obter assistente atualmente selecionado
    getSelectedAssistant: () => ipcRenderer.invoke('summary:get-selected-assistant'),
    
    // Gerar resumo da transcrição (streaming)
    generate: (transcription: Array<{ speaker: string; text: string }>) => 
      ipcRenderer.invoke('summary:generate', transcription),
    
    // Gerar sugestões de follow-up
    generateFollowUp: (transcription: Array<{ speaker: string; text: string }>) => 
      ipcRenderer.invoke('summary:generate-followup', transcription),
    
    // Explicar uma palavra do resumo (streaming)
    explainWord: (word: string, context?: string) =>
      ipcRenderer.invoke('summary:explain-word', word, context),
    
    // Abrir janela de explicação de palavra
    openExplanationWindow: (word: string, context?: string, appearanceSettings?: { fontSize: number; opacity: number }) =>
      ipcRenderer.invoke('word-explanation:open', word, context, appearanceSettings),
    
    // Abortar geração em andamento
    abort: () => ipcRenderer.invoke('summary:abort'),
    
    // Listener para chunks de streaming
    onChunk: (callback: (chunk: string) => void) => {
      const subscription = (_: any, chunk: string) => callback(chunk);
      ipcRenderer.on('summary:chunk', subscription);
      return () => ipcRenderer.removeListener('summary:chunk', subscription);
    },
    
    // Listener para chunks de explicação de palavra (streaming)
    onExplainWordChunk: (callback: (chunk: string) => void) => {
      const subscription = (_: any, chunk: string) => callback(chunk);
      ipcRenderer.on('summary:explain-word-chunk', subscription);
      return () => ipcRenderer.removeListener('summary:explain-word-chunk', subscription);
    }
  },
  
  // ========================================
  // DESKTOP AUDIO TRANSCRIPTION
  // ========================================
  
  // Enviar chunk de áudio do desktop para transcrição
  sendDesktopAudioChunk: (buffer: ArrayBuffer) => ipcRenderer.send('desktop-audio-chunk', buffer),
  
  // Controlar transcrição do desktop
  startDesktopTranscription: () => ipcRenderer.invoke('start-desktop-transcription'),
  stopDesktopTranscription: () => ipcRenderer.invoke('stop-desktop-transcription'),
  
  // Listener para transcrições do desktop
  onDesktopTranscription: (callback: (data: { text: string, isFinal: boolean }) => void) => {
    const subscription = (_: any, data: { text: string, isFinal: boolean }) => callback(data);
    ipcRenderer.on('desktop-transcription', subscription);
    return () => ipcRenderer.removeListener('desktop-transcription', subscription);
  },
  
  // Listener para status da transcrição
  onDesktopTranscriptionStatus: (callback: (status: string) => void) => {
    const subscription = (_: any, status: string) => callback(status);
    ipcRenderer.on('desktop-transcription-status', subscription);
    return () => ipcRenderer.removeListener('desktop-transcription-status', subscription);
  },
  
  // Listener para erros da transcrição
  onDesktopTranscriptionError: (callback: (error: any) => void) => {
    const subscription = (_: any, error: any) => callback(error);
    ipcRenderer.on('desktop-transcription-error', subscription);
    return () => ipcRenderer.removeListener('desktop-transcription-error', subscription);
  },
  
  // ========================================
  // MICROPHONE CONTROL
  // ========================================
  
  // Listener para mudanças de estado do microfone (pausado/ativo)
  onMicrophoneStatusChanged: (callback: (isPaused: boolean) => void) => {
    const subscription = (_: any, isPaused: boolean) => callback(isPaused);
    ipcRenderer.on('microphone-status-changed', subscription);
    return () => ipcRenderer.removeListener('microphone-status-changed', subscription);
  },
  
  // ========================================
  // TRANSCRIPTION WINDOW CONTROL
  // ========================================
  
  // Minimizar (esconder) a janela de transcrição
  minimizeTranscriptionWindow: () => ipcRenderer.send('minimize-transcription-window'),
  
  // Mostrar a janela de transcrição (ou abrir se não existir)
  showTranscriptionWindow: () => ipcRenderer.invoke('show-transcription-window'),
  
  // Verificar se a janela de transcrição está aberta/visível
  isTranscriptionWindowOpen: () => ipcRenderer.invoke('is-transcription-window-open'),
  
  // Listener para mudanças de estado da reação do avatar (habilitada/desabilitada)
  onAvatarReactionStatusChanged: (callback: (isDisabled: boolean) => void) => {
    const subscription = (_: any, isDisabled: boolean) => callback(isDisabled);
    ipcRenderer.on('avatar-reaction-status-changed', subscription);
    return () => ipcRenderer.removeListener('avatar-reaction-status-changed', subscription);
  },

  // Listener para toggle da ActionBar (Ctrl+M global)
  onActionBarToggle: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on('actionbar-toggle', subscription);
    return () => ipcRenderer.removeListener('actionbar-toggle', subscription);
  },

  // Listener para screenshots capturados
  onScreenshotCaptured: (callback: (base64Image: string) => void) => {
    const subscription = (_: any, base64Image: string) => callback(base64Image);
    ipcRenderer.on('screenshot-captured', subscription);
    return () => ipcRenderer.removeListener('screenshot-captured', subscription);
  },

  // Listener para gravações salvas
  onRecordingSaved: (callback: (data: { path: string, duration: number, thumbnail?: string }) => void) => {
    const subscription = (_: any, data: { path: string, duration: number, thumbnail?: string }) => callback(data);
    ipcRenderer.on('recording-saved', subscription);
    return () => ipcRenderer.removeListener('recording-saved', subscription);
  },

  // Listener para limpar galeria após compartilhamento
  onClearGallery: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on('clear-gallery', subscription);
    return () => ipcRenderer.removeListener('clear-gallery', subscription);
  },

  // Notificar backend que lista de screenshots está vazia
  notifyScreenshotsEmpty: () => ipcRenderer.send('screenshots-empty'),
  
  // Abrir janela de transcrição
  openTranscriptionWindow: () => ipcRenderer.invoke('open-transcription-window'),
  
  // Encerrar aplicação
  quitApp: () => ipcRenderer.send('quit-app'),
  
  // Enviar contexto de conversa ao Gemini Live (transcrições e resumos)
  sendConversationContext: (data: { 
    transcriptions: Array<{ speaker: string; text: string }>;
    summary?: string;
  }) => ipcRenderer.invoke('send-conversation-context', data),
  
  // Resetar sessão Gemini Live (limpar histórico)
  resetLiveSession: () => ipcRenderer.invoke('reset-live-session'),
  
  // Abrir janela do Video Studio
  openVideoStudioWindow: () => ipcRenderer.invoke('open-video-studio-window'),
  
  // ========================================
  // VIDEO PROJECT SERVICE
  // ========================================
  
  videoProject: {
    // Salvar arquivo de áudio e retornar caminho
    saveAudio: (arrayBuffer: ArrayBuffer, fileName: string) => 
      ipcRenderer.invoke('video-project:save-audio', arrayBuffer, fileName),
    
    // Salvar arquivo de imagem e retornar caminho
    saveImage: (arrayBuffer: ArrayBuffer, fileName: string, segmentId: number) => 
      ipcRenderer.invoke('video-project:save-image', arrayBuffer, fileName, segmentId),
    
    // Transcrever arquivo de áudio
    transcribe: (audioPath: string) => 
      ipcRenderer.invoke('video-project:transcribe', audioPath),
    
    // Analisar segmentos com IA
    analyze: (segments: any[], options?: { editingStyle?: string; authorConclusion?: string }) => 
      ipcRenderer.invoke('video-project:analyze', segments, options),
    
    // Converter projeto para formato Remotion
    convertToRemotion: (project: any) => 
      ipcRenderer.invoke('video-project:convert-to-remotion', project),
    
    // Renderizar projeto
    render: (project: any) => 
      ipcRenderer.invoke('video-project:render', project),
    
    // Salvar projeto como JSON
    save: (project: any) => 
      ipcRenderer.invoke('video-project:save', project),
    
    // Listar projetos salvos
    list: () => 
      ipcRenderer.invoke('video-project:list'),
    
    // Obter diretório de projetos
    getDirectory: () => 
      ipcRenderer.invoke('video-project:get-directory'),
    
    // Listener para status do projeto
    onStatus: (callback: (data: { stage: string; message: string }) => void) => {
      const subscription = (_: any, data: { stage: string; message: string }) => callback(data);
      ipcRenderer.on('video-project:status', subscription);
      return () => ipcRenderer.removeListener('video-project:status', subscription);
    },
    
    // Listener para progresso de renderização
    onRenderProgress: (callback: (data: { percent: number; frame: number; totalFrames: number }) => void) => {
      const subscription = (_: any, data: { percent: number; frame: number; totalFrames: number }) => callback(data);
      ipcRenderer.on('video-project:render-progress', subscription);
      return () => ipcRenderer.removeListener('video-project:render-progress', subscription);
    }
  }
}

contextBridge.exposeInMainWorld('electron', handler)

export type IpcHandler = typeof handler
export type ElectronHandler = typeof handler
