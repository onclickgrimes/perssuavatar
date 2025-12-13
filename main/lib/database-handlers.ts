import { ipcMain, BrowserWindow } from 'electron';
import * as db from './database';
import { getSummaryService } from './services/summary-service';

/**
 * Registra todos os handlers IPC relacionados ao banco de dados
 * Chame esta função uma vez no background.ts durante a inicialização
 */
export function registerDatabaseHandlers() {
  console.log('📦 Registering database IPC handlers...');
  
  // ===============================================
  // USER SETTINGS
  // ===============================================
  
  ipcMain.handle('db:get-user-settings', () => {
    return db.getUserSettings();
  });
  
  ipcMain.handle('db:set-user-settings', (event, settings) => {
    db.setUserSettings(settings);
    return true;
  });
  
  ipcMain.handle('db:get-tts-provider', () => {
    return db.getTTSProvider();
  });
  
  ipcMain.handle('db:set-tts-provider', (event, provider) => {
    db.setTTSProvider(provider);
    return true;
  });
  
  ipcMain.handle('db:get-assistant-mode', () => {
    return db.getAssistantMode();
  });
  
  ipcMain.handle('db:set-assistant-mode', (event, mode) => {
    db.setAssistantMode(mode);
    return true;
  });
  
  // ===============================================
  // CONVERSATION HISTORY
  // ===============================================
  
  ipcMain.handle('db:get-conversation-history', () => {
    return db.getConversationHistory();
  });
  
  ipcMain.handle('db:add-conversation', (event, conversation) => {
    return db.addConversation(conversation);
  });
  
  ipcMain.handle('db:clear-conversation-history', () => {
    db.clearConversationHistory();
    return true;
  });
  
  ipcMain.handle('db:get-recent-conversations', (event, limit = 10) => {
    return db.getRecentConversations(limit);
  });
  
  // ===============================================
  // WINDOW STATE
  // ===============================================
  
  ipcMain.handle('db:get-window-state', () => {
    return db.getWindowState();
  });
  
  ipcMain.handle('db:save-window-state', (event, state) => {
    db.saveWindowState(state);
    return true;
  });
  
  // ===============================================
  // RECORDINGS
  // ===============================================
  
  ipcMain.handle('db:get-recordings', () => {
    return db.getRecordings();
  });
  
  ipcMain.handle('db:add-recording', (event, recording) => {
    return db.addRecording(recording);
  });
  
  ipcMain.handle('db:delete-recording', (event, recordingId) => {
    db.deleteRecording(recordingId);
    return true;
  });
  
  ipcMain.handle('db:get-recent-recordings', (event, limit = 10) => {
    return db.getRecentRecordings(limit);
  });
  
  // ===============================================
  // SCREENSHOTS
  // ===============================================
  
  ipcMain.handle('db:get-screenshots', () => {
    return db.getScreenshots();
  });
  
  ipcMain.handle('db:add-screenshot', (event, screenshot) => {
    return db.addScreenshot(screenshot);
  });
  
  ipcMain.handle('db:delete-screenshot', (event, screenshotId) => {
    db.deleteScreenshot(screenshotId);
    return true;
  });
  
  // ===============================================
  // ASSISTANTS
  // ===============================================
  
  ipcMain.handle('db:get-assistants', () => {
    return db.getAssistants();
  });
  
  ipcMain.handle('db:get-assistant-by-id', (event, assistantId) => {
    return db.getAssistantById(assistantId);
  });
  
  ipcMain.handle('db:create-assistant', (event, assistant) => {
    return db.createAssistant(assistant);
  });
  
  ipcMain.handle('db:update-assistant', (event, assistantId, updates) => {
    return db.updateAssistant(assistantId, updates);
  });
  
  ipcMain.handle('db:delete-assistant', (event, assistantId) => {
    db.deleteAssistant(assistantId);
    return true;
  });
  
  // ===============================================
  // UTILITIES
  // ===============================================
  
  ipcMain.handle('db:get-stats', () => {
    return db.getDatabaseStats();
  });
  
  ipcMain.handle('db:export', () => {
    return db.exportDatabase();
  });
  
  ipcMain.handle('db:get-path', () => {
    return db.getDatabasePath();
  });
  
  ipcMain.handle('db:clear-all', () => {
    db.clearAllData();
    return true;
  });
  
  // ===============================================
  // SUMMARY SERVICE
  // ===============================================
  
  ipcMain.handle('summary:get-selected-assistant', () => {
    const summaryService = getSummaryService();
    return summaryService.getSelectedAssistant();
  });
  
  ipcMain.handle('summary:generate', async (event, transcription: Array<{ speaker: string; text: string }>) => {
    const summaryService = getSummaryService();
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    
    try {
      const result = await summaryService.generateSummary(transcription, (chunk) => {
        // Enviar chunk para o renderer via IPC
        if (senderWindow && !senderWindow.isDestroyed()) {
          senderWindow.webContents.send('summary:chunk', chunk);
        }
      });
      
      return { success: true, result };
    } catch (error: any) {
      console.error('[SummaryHandler] Erro ao gerar resumo:', error);
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('summary:abort', () => {
    const summaryService = getSummaryService();
    summaryService.abort();
    return true;
  });
  
  console.log('✅ Database IPC handlers registered');
}

/**
 * Remove todos os handlers IPC do banco de dados
 * Útil para cleanup durante desenvolvimento
 */
export function unregisterDatabaseHandlers() {
  const handlers = [
    // User Settings
    'db:get-user-settings',
    'db:set-user-settings',
    'db:get-tts-provider',
    'db:set-tts-provider',
    'db:get-assistant-mode',
    'db:set-assistant-mode',
    
    // Conversation History
    'db:get-conversation-history',
    'db:add-conversation',
    'db:clear-conversation-history',
    'db:get-recent-conversations',
    
    // Window State
    'db:get-window-state',
    'db:save-window-state',
    
    // Recordings
    'db:get-recordings',
    'db:add-recording',
    'db:delete-recording',
    'db:get-recent-recordings',
    
    // Screenshots
    'db:get-screenshots',
    'db:add-screenshot',
    'db:delete-screenshot',
    
    // Assistants
    'db:get-assistants',
    'db:get-assistant-by-id',
    'db:create-assistant',
    'db:update-assistant',
    'db:delete-assistant',
    
    // Utilities
    'db:get-stats',
    'db:export',
    'db:get-path',
    'db:clear-all',
    
    // Summary Service
    'summary:get-selected-assistant',
    'summary:generate',
    'summary:abort'
  ];
  
  handlers.forEach(handler => {
    ipcMain.removeHandler(handler);
  });
  
  console.log('🗑️ Database IPC handlers unregistered');
}
