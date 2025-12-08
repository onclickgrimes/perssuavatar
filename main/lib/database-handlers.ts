import { ipcMain } from 'electron';
import * as db from './database';

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
    
    // Utilities
    'db:get-stats',
    'db:export',
    'db:get-path',
    'db:clear-all'
  ];
  
  handlers.forEach(handler => {
    ipcMain.removeHandler(handler);
  });
  
  console.log('🗑️ Database IPC handlers unregistered');
}
