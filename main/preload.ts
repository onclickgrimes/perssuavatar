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
  
  // Enviar contexto de código expandido para o LLM/Avatar
  sendCodeContext: (data: {
    originalCode: string;
    fileName: string;
    referencesContext: string;
    userInstruction?: string;
  }) => ipcRenderer.invoke('send-code-context', data),
  
  // Resetar sessão Gemini Live (limpar histórico)
  resetLiveSession: () => ipcRenderer.invoke('reset-live-session'),
  
  // Abrir janela do Video Studio
  openVideoStudioWindow: () => ipcRenderer.invoke('open-video-studio-window'),
  
  // Abrir janela do Social Media
  openSocialMediaWindow: () => ipcRenderer.invoke('open-social-media-window'),
  
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
    
    // Analisar segmentos com IA (aceita projeto completo ou array de segments)
    analyze: (projectOrSegments: any, options?: { provider?: 'gemini' | 'openai' | 'deepseek', nichePrompt?: string }) => 
      ipcRenderer.invoke('video-project:analyze', projectOrSegments, options),
    
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
    
    // Carregar projeto salvo
    load: (filePath: string) => 
      ipcRenderer.invoke('video-project:load', filePath),
    
    // Obter diretório de projetos
    getDirectory: () => 
      ipcRenderer.invoke('video-project:get-directory'),
    
    // Buscar vídeos no Supabase por busca semântica
    searchVideos: (query: string, limit?: number) =>
      ipcRenderer.invoke('video-project:search-videos', query, limit),
    
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
  },
  
  // ========================================
  // NICHE (Channel Niches) SERVICE
  // ========================================
  
  niche: {
    // Listar todos os nichos
    list: () => ipcRenderer.invoke('niche:list'),
    
    // Buscar nicho por ID
    get: (id: number) => ipcRenderer.invoke('niche:get', id),
    
    // Buscar nicho por nome
    getByName: (name: string) => ipcRenderer.invoke('niche:get-by-name', name),
    
    // Criar novo nicho
    create: (niche: {
      name: string;
      description?: string;
      icon?: string;
      ai_prompt: string;
      asset_types?: string[];
      emotions?: string[];
      use_image_prompts?: boolean;
      camera_movements?: string[];
      transitions?: string[];
      entry_animations?: string[];
      exit_animations?: string[];
      stock_categories?: string[];
      stock_rules?: string;
      default_colors?: string[];
      default_font?: string;
      components_allowed?: string[];
    }) => ipcRenderer.invoke('niche:create', niche),
    
    // Atualizar nicho existente
    update: (id: number, updates: any) => ipcRenderer.invoke('niche:update', id, updates),
    
    // Deletar nicho
    delete: (id: number) => ipcRenderer.invoke('niche:delete', id),
    
    // Gerar prompt completo para um nicho
    generatePrompt: (nicheId: number) => ipcRenderer.invoke('niche:generate-prompt', nicheId),
  },
  
  // ========================================
  // KNOWLEDGE (Base de Conhecimento) SERVICE
  // ========================================
  
  knowledge: {
    // Listar fontes de conhecimento de um assistente
    listSources: (assistantId: string) => ipcRenderer.invoke('knowledge:list-sources', assistantId),
    
    // Obter uma fonte de conhecimento
    getSource: (sourceId: number) => ipcRenderer.invoke('knowledge:get-source', sourceId),
    
    // Criar nova fonte de conhecimento
    createSource: (source: {
      assistant_id: string;
      name: string;
      path: string;
      type?: 'folder' | 'file';
      extensions?: string[];
      excludes?: string[];
      use_gitignore?: boolean;
    }) => ipcRenderer.invoke('knowledge:create-source', source),
    
    // Atualizar fonte de conhecimento
    updateSource: (sourceId: number, updates: any) => ipcRenderer.invoke('knowledge:update-source', sourceId, updates),
    
    // Deletar fonte de conhecimento
    deleteSource: (sourceId: number) => ipcRenderer.invoke('knowledge:delete-source', sourceId),
    
    // Sincronizar fonte (indexar arquivos)
    syncSource: (sourceId: number) => ipcRenderer.invoke('knowledge:sync-source', sourceId),
    
    // Buscar conhecimento relevante
    search: (assistantId: string, query: string, limit?: number) => 
      ipcRenderer.invoke('knowledge:search', assistantId, query, limit),
    
    // Obter contexto de conhecimento formatado
    getContext: (assistantId: string, query: string, maxTokens?: number) => 
      ipcRenderer.invoke('knowledge:get-context', assistantId, query, maxTokens),
    
    // Obter estatísticas
    getStats: (assistantId: string) => ipcRenderer.invoke('knowledge:get-stats', assistantId),
    
    // Selecionar pasta via diálogo do sistema
    selectFolder: () => ipcRenderer.invoke('knowledge:select-folder'),
    
    // Selecionar arquivos via diálogo do sistema
    selectFiles: () => ipcRenderer.invoke('knowledge:select-files'),
    
    // Listener para progresso de sincronização
    onSyncProgress: (callback: (data: { 
      sourceId: number; 
      total: number; 
      current: number; 
      currentFile: string; 
      stage: 'scanning' | 'reading' | 'chunking' | 'embedding' | 'saving' | 'done';
    }) => void) => {
      const subscription = (_: any, data: any) => callback(data);
      ipcRenderer.on('knowledge:sync-progress', subscription);
      return () => ipcRenderer.removeListener('knowledge:sync-progress', subscription);
    },

    // Listener para resultados de busca de conhecimento (popup)
    onKnowledgeResults: (callback: (results: Array<{
      id: number;
      file_path: string;
      file_name: string;
      start_line: number;
      end_line: number;
      match_line: number;  // Linha exata onde o termo aparece
      content: string;
      language: string;
      similarity: number;
    }>) => void) => {
      const subscription = (_: any, results: any) => callback(results);
      ipcRenderer.on('knowledge-results', subscription);
      return () => ipcRenderer.removeListener('knowledge-results', subscription);
    },

    // Abrir arquivo no editor padrão (com suporte a linha)
    openFileInEditor: (filePath: string, line?: number) => 
      ipcRenderer.invoke('open-file-in-editor', filePath, line),

    // Buscar referências de código (onde funções/classes são usadas)
    findReferences: (options: {
      filePath: string;
      content: string;
      basePath: string;
      maxDepth?: number;
      targetSymbol?: string;  // Símbolo específico clicado pelo usuário
    }) => ipcRenderer.invoke('knowledge:find-references', options),

    // Fechar janela de resultados de conhecimento
    closeKnowledgeResultsWindow: () => 
      ipcRenderer.send('close-knowledge-results-window'),
    
    // ========================================
    // OLLAMA (Local Embeddings)
    // ========================================
    
    // Verificar se Ollama está instalado no sistema
    checkOllamaInstalled: () => ipcRenderer.invoke('check-ollama-installed'),
    
    // Baixar modelo via 'ollama pull'
    pullModel: (modelName: string) => ipcRenderer.invoke('ollama-pull-model', modelName),
    
    // Listar modelos instalados no Ollama
    listOllamaModels: () => ipcRenderer.invoke('ollama-list-models'),
    
    // Configurar provider de embedding
    setEmbeddingProvider: (provider: 'openai' | 'ollama') => 
      ipcRenderer.invoke('set-embedding-provider', provider),
    
    // Configurar modelo Ollama para embeddings  
    setOllamaEmbeddingModel: (model: string) => 
      ipcRenderer.invoke('set-ollama-embedding-model', model),
    
    // Obter provider atual
    getEmbeddingProvider: () => ipcRenderer.invoke('get-embedding-provider'),
    
    // Listener para progresso de download de modelo
    onOllamaPullProgress: (callback: (data: { model: string; progress: string }) => void) => {
      const subscription = (_: any, data: { model: string; progress: string }) => callback(data);
      ipcRenderer.on('ollama-pull-progress', subscription);
      return () => { ipcRenderer.removeListener('ollama-pull-progress', subscription); };
    },
  },

  // ========================================
  // SOCIAL MEDIA SERVICE (Puppeteer)
  // ========================================
  
  socialMedia: {
    // Conectar a uma plataforma (abre Puppeteer)
    connectPlatform: (workspaceId: string, platform: 'instagram' | 'tiktok' | 'youtube') =>
      ipcRenderer.invoke('social-media:connect-platform', workspaceId, platform),
    
    // Cancelar conexão em andamento
    cancelConnection: (workspaceId: string, platform: 'instagram' | 'tiktok' | 'youtube') =>
      ipcRenderer.invoke('social-media:cancel-connection', workspaceId, platform),
    
    // Verificar se tem credenciais salvas
    hasCredentials: (workspaceId: string, platform: 'instagram' | 'tiktok' | 'youtube') =>
      ipcRenderer.invoke('social-media:has-credentials', workspaceId, platform),
    
    // Remover credenciais salvas
    removeCredentials: (workspaceId: string, platform: 'instagram' | 'tiktok' | 'youtube') =>
      ipcRenderer.invoke('social-media:remove-credentials', workspaceId, platform),
    
    // Abrir navegador para ver a conta
    openBrowser: (workspaceId: string, platform: 'instagram' | 'tiktok' | 'youtube') =>
      ipcRenderer.invoke('social-media:open-browser', workspaceId, platform),
    
    // Obter status do serviço
    getStatus: () => ipcRenderer.invoke('social-media:get-status'),
    
    // Listener: Status de conexão
    onConnectionStatus: (callback: (data: { workspaceId: string; platform: string; status: string }) => void) => {
      const subscription = (_: any, data: any) => callback(data);
      ipcRenderer.on('social-media:connection-status', subscription);
      return () => { ipcRenderer.removeListener('social-media:connection-status', subscription); };
    },
    
    // Listener: Conexão bem-sucedida
    onConnectionSuccess: (callback: (data: { workspaceId: string; platform: string; username: string }) => void) => {
      const subscription = (_: any, data: any) => callback(data);
      ipcRenderer.on('social-media:connection-success', subscription);
      return () => { ipcRenderer.removeListener('social-media:connection-success', subscription); };
    },
    
    // Listener: Erro de conexão
    onConnectionError: (callback: (data: { workspaceId: string; platform: string; error: string }) => void) => {
      const subscription = (_: any, data: any) => callback(data);
      ipcRenderer.on('social-media:connection-error', subscription);
      return () => { ipcRenderer.removeListener('social-media:connection-error', subscription); };
    },
  }
}

contextBridge.exposeInMainWorld('electron', handler)

export type IpcHandler = typeof handler
export type ElectronHandler = typeof handler
