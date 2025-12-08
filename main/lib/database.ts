import Store from 'electron-store';

// Schema de tipos para o banco de dados
interface DatabaseSchema {
  // Configurações do usuário
  userSettings: {
    ttsProvider: 'elevenlabs' | 'polly' | 'deepgram';
    assistantMode: 'classic' | 'live';
    alwaysOnTop: boolean;
    volume: number;
    selectedModel: string;
  };
  
  // Histórico de conversas
  conversationHistory: Array<{
    id: string;
    timestamp: number;
    userMessage: string;
    aiResponse: string;
    mode: 'classic' | 'live';
  }>;
  
  // Estado da janela
  windowState: {
    width: number;
    height: number;
    x: number;
    y: number;
  };
  
  // Gravações salvas
  recordings: Array<{
    id: string;
    filename: string;
    path: string;
    timestamp: number;
    duration: number;
  }>;
  
  // Screenshots salvos
  screenshots: Array<{
    id: string;
    path: string;
    timestamp: number;
  }>;
}

// Valores padrão
const defaults: DatabaseSchema = {
  userSettings: {
    ttsProvider: 'elevenlabs',
    assistantMode: 'live',
    alwaysOnTop: true,
    volume: 0.8,
    selectedModel: 'Yuki'
  },
  conversationHistory: [],
  windowState: {
    width: 1000,
    height: 600,
    x: 100,
    y: 100
  },
  recordings: [],
  screenshots: []
};

// Singleton da store
let storeInstance: Store<DatabaseSchema> | null = null;

/**
 * Inicializa a store do electron (singleton)
 */
export function initializeDatabase(): Store<DatabaseSchema> {
  if (!storeInstance) {
    storeInstance = new Store<DatabaseSchema>({
      name: 'avatar-ai-db',
      defaults,
      schema: {
        userSettings: {
          type: 'object',
          properties: {
            ttsProvider: { type: 'string', enum: ['elevenlabs', 'polly', 'deepgram'] },
            assistantMode: { type: 'string', enum: ['classic', 'live'] },
            alwaysOnTop: { type: 'boolean' },
            volume: { type: 'number', minimum: 0, maximum: 1 },
            selectedModel: { type: 'string' }
          }
        },
        conversationHistory: {
          type: 'array'
        },
        windowState: {
          type: 'object',
          properties: {
            width: { type: 'number' },
            height: { type: 'number' },
            x: { type: 'number' },
            y: { type: 'number' }
          }
        },
        recordings: {
          type: 'array'
        },
        screenshots: {
          type: 'array'
        }
      }
    });
    
    console.log('✅ Database initialized at:', storeInstance.path);
  }
  
  return storeInstance;
}

/**
 * Retorna a instância da store
 */
export function getDatabase(): Store<DatabaseSchema> {
  if (!storeInstance) {
    return initializeDatabase();
  }
  return storeInstance;
}

// ===============================================
// FUNÇÕES DE CONFIGURAÇÕES DO USUÁRIO
// ===============================================

export function getUserSettings() {
  const db = getDatabase();
  return db.get('userSettings');
}

export function setUserSettings(settings: Partial<DatabaseSchema['userSettings']>) {
  const db = getDatabase();
  const current = db.get('userSettings');
  db.set('userSettings', { ...current, ...settings });
  console.log('💾 User settings saved:', settings);
}

export function getTTSProvider() {
  const db = getDatabase();
  return db.get('userSettings.ttsProvider');
}

export function setTTSProvider(provider: 'elevenlabs' | 'polly' | 'deepgram') {
  const db = getDatabase();
  db.set('userSettings.ttsProvider', provider);
  console.log('💾 TTS provider saved:', provider);
}

export function getAssistantMode() {
  const db = getDatabase();
  return db.get('userSettings.assistantMode');
}

export function setAssistantMode(mode: 'classic' | 'live') {
  const db = getDatabase();
  db.set('userSettings.assistantMode', mode);
  console.log('💾 Assistant mode saved:', mode);
}

// ===============================================
// FUNÇÕES DE HISTÓRICO DE CONVERSAS
// ===============================================

export function getConversationHistory() {
  const db = getDatabase();
  return db.get('conversationHistory');
}

export function addConversation(conversation: Omit<DatabaseSchema['conversationHistory'][0], 'id' | 'timestamp'>) {
  const db = getDatabase();
  const history = db.get('conversationHistory');
  
  const newConversation = {
    id: `conv_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    timestamp: Date.now(),
    ...conversation
  };
  
  history.push(newConversation);
  db.set('conversationHistory', history);
  
  console.log('💾 Conversation saved:', newConversation.id);
  return newConversation;
}

export function clearConversationHistory() {
  const db = getDatabase();
  db.set('conversationHistory', []);
  console.log('🗑️ Conversation history cleared');
}

export function getRecentConversations(limit: number = 10) {
  const db = getDatabase();
  const history = db.get('conversationHistory');
  return history.slice(-limit).reverse(); // Últimas N conversas, mais recentes primeiro
}

// ===============================================
// FUNÇÕES DE ESTADO DA JANELA
// ===============================================

export function getWindowState() {
  const db = getDatabase();
  return db.get('windowState');
}

export function saveWindowState(state: Partial<DatabaseSchema['windowState']>) {
  const db = getDatabase();
  const current = db.get('windowState');
  db.set('windowState', { ...current, ...state });
  console.log('💾 Window state saved:', state);
}

// ===============================================
// FUNÇÕES DE GRAVAÇÕES
// ===============================================

export function getRecordings() {
  const db = getDatabase();
  return db.get('recordings');
}

export function addRecording(recording: Omit<DatabaseSchema['recordings'][0], 'id' | 'timestamp'>) {
  const db = getDatabase();
  const recordings = db.get('recordings');
  
  const newRecording = {
    id: `rec_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    timestamp: Date.now(),
    ...recording
  };
  
  recordings.push(newRecording);
  db.set('recordings', recordings);
  
  console.log('💾 Recording saved:', newRecording.id);
  return newRecording;
}

export function deleteRecording(recordingId: string) {
  const db = getDatabase();
  const recordings = db.get('recordings');
  const filtered = recordings.filter(r => r.id !== recordingId);
  db.set('recordings', filtered);
  console.log('🗑️ Recording deleted:', recordingId);
}

export function getRecentRecordings(limit: number = 10) {
  const db = getDatabase();
  const recordings = db.get('recordings');
  return recordings.slice(-limit).reverse();
}

// ===============================================
// FUNÇÕES DE SCREENSHOTS
// ===============================================

export function getScreenshots() {
  const db = getDatabase();
  return db.get('screenshots');
}

export function addScreenshot(screenshot: Omit<DatabaseSchema['screenshots'][0], 'id' | 'timestamp'>) {
  const db = getDatabase();
  const screenshots = db.get('screenshots');
  
  const newScreenshot = {
    id: `ss_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    timestamp: Date.now(),
    ...screenshot
  };
  
  screenshots.push(newScreenshot);
  db.set('screenshots', screenshots);
  
  console.log('💾 Screenshot saved:', newScreenshot.id);
  return newScreenshot;
}

export function deleteScreenshot(screenshotId: string) {
  const db = getDatabase();
  const screenshots = db.get('screenshots');
  const filtered = screenshots.filter(s => s.id !== screenshotId);
  db.set('screenshots', filtered);
  console.log('🗑️ Screenshot deleted:', screenshotId);
}

// ===============================================
// FUNÇÕES UTILITÁRIAS
// ===============================================

/**
 * Limpa todos os dados do banco (CUIDADO!)
 */
export function clearAllData() {
  const db = getDatabase();
  db.clear();
  console.log('🗑️ All data cleared');
}

/**
 * Exporta todos os dados do banco
 */
export function exportDatabase() {
  const db = getDatabase();
  return db.store;
}

/**
 * Retorna o caminho do arquivo de banco de dados
 */
export function getDatabasePath() {
  const db = getDatabase();
  return db.path;
}

/**
 * Estatísticas do banco de dados
 */
export function getDatabaseStats() {
  const db = getDatabase();
  return {
    path: db.path,
    conversationCount: db.get('conversationHistory').length,
    recordingCount: db.get('recordings').length,
    screenshotCount: db.get('screenshots').length,
    settings: db.get('userSettings')
  };
}

export default {
  initializeDatabase,
  getDatabase,
  
  // User Settings
  getUserSettings,
  setUserSettings,
  getTTSProvider,
  setTTSProvider,
  getAssistantMode,
  setAssistantMode,
  
  // Conversation History
  getConversationHistory,
  addConversation,
  clearConversationHistory,
  getRecentConversations,
  
  // Window State
  getWindowState,
  saveWindowState,
  
  // Recordings
  getRecordings,
  addRecording,
  deleteRecording,
  getRecentRecordings,
  
  // Screenshots
  getScreenshots,
  addScreenshot,
  deleteScreenshot,
  
  // Utilities
  clearAllData,
  exportDatabase,
  getDatabasePath,
  getDatabaseStats
};
