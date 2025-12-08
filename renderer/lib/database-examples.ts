/**
 * EXEMPLO DE USO DO BANCO DE DADOS NO FRONTEND (Renderer Process)
 * 
 * Este arquivo demonstra como usar as funções do banco de dados
 * no frontend através do IPC do Electron.
 * 
 * IMPORTANTE: Você precisa adicionar estas funções ao preload.ts primeiro!
 */

// ===============================================
// EXEMPLO 1: Salvar configurações do usuário
// ===============================================
async function saveUserSettings() {
  const settings = {
    ttsProvider: 'elevenlabs' as const,
    assistantMode: 'live' as const,
    volume: 0.9,
    alwaysOnTop: true,
    selectedModel: 'Yuki'
  };
  
  await window.electron.db.setUserSettings(settings);
  console.log('✅ Configurações salvas!');
}

// ===============================================
// EXEMPLO 2: Carregar configurações do usuário
// ===============================================
async function loadUserSettings() {
  const settings = await window.electron.db.getUserSettings();
  console.log('📖 Configurações carregadas:', settings);
  
  // Aplicar as configurações na UI
  // setTTSProvider(settings.ttsProvider);
  // setVolume(settings.volume);
  // etc...
  
  return settings;
}

// ===============================================
// EXEMPLO 3: Salvar TTS Provider
// ===============================================
async function changeTTSProvider(provider: 'elevenlabs' | 'polly' | 'deepgram') {
  await window.electron.db.setTTSProvider(provider);
  console.log(`✅ TTS Provider alterado para: ${provider}`);
}

// ===============================================
// EXEMPLO 4: Adicionar conversa ao histórico
// ===============================================
async function saveConversation(userMessage: string, aiResponse: string, mode: 'classic' | 'live') {
  const conversation = await window.electron.db.addConversation({
    userMessage,
    aiResponse,
    mode
  });
  
  console.log('💾 Conversa salva:', conversation);
  return conversation;
}

// ===============================================
// EXEMPLO 5: Buscar últimas conversas
// ===============================================
async function loadRecentConversations(limit = 10) {
  const conversations = await window.electron.db.getRecentConversations(limit);
  console.log(`📚 Últimas ${limit} conversas:`, conversations);
  
  // Exibir no UI
  conversations.forEach(conv => {
    console.log(`👤 Usuário: ${conv.userMessage}`);
    console.log(`🤖 AI: ${conv.aiResponse}`);
    console.log(`⏰ Data: ${new Date(conv.timestamp).toLocaleString()}`);
    console.log('---');
  });
  
  return conversations;
}

// ===============================================
// EXEMPLO 6: Limpar histórico de conversas
// ===============================================
async function clearHistory() {
  await window.electron.db.clearConversationHistory();
  console.log('🗑️ Histórico limpo!');
}

// ===============================================
// EXEMPLO 7: Salvar estado da janela
// ===============================================
async function saveWindowPosition(x: number, y: number, width: number, height: number) {
  await window.electron.db.saveWindowState({ x, y, width, height });
  console.log('💾 Posição da janela salva');
}

// ===============================================
// EXEMPLO 8: Carregar estado da janela
// ===============================================
async function loadWindowState() {
  const state = await window.electron.db.getWindowState();
  console.log('🪟 Estado da janela:', state);
  return state;
}

// ===============================================
// EXEMPLO 9: Salvar gravação
// ===============================================
async function saveRecordingMetadata(filename: string, path: string, duration: number) {
  const recording = await window.electron.db.addRecording({
    filename,
    path,
    duration
  });
  
  console.log('🎥 Gravação salva:', recording);
  return recording;
}

// ===============================================
// EXEMPLO 10: Listar gravações recentes
// ===============================================
async function listRecentRecordings() {
  const recordings = await window.electron.db.getRecentRecordings(5);
  
  console.log('🎬 Últimas 5 gravações:');
  recordings.forEach(rec => {
    console.log(`📹 ${rec.filename}`);
    console.log(`   Caminho: ${rec.path}`);
    console.log(`   Duração: ${rec.duration}s`);
    console.log(`   Data: ${new Date(rec.timestamp).toLocaleString()}`);
  });
  
  return recordings;
}

// ===============================================
// EXEMPLO 11: Ver estatísticas do banco
// ===============================================
async function showDatabaseStats() {
  const stats = await window.electron.db.getStats();
  
  console.log('📊 ESTATÍSTICAS DO BANCO DE DADOS');
  console.log('================================');
  console.log(`📁 Caminho: ${stats.path}`);
  console.log(`💬 Conversas: ${stats.conversationCount}`);
  console.log(`🎥 Gravações: ${stats.recordingCount}`);
  console.log(`📸 Screenshots: ${stats.screenshotCount}`);
  console.log(`⚙️ Configurações:`, stats.settings);
  
  return stats;
}

// ===============================================
// EXEMPLO 12: Exportar todos os dados
// ===============================================
async function exportAllData() {
  const data = await window.electron.db.export();
  console.log('💾 Dados exportados:', data);
  
  // Você pode salvar isso em um arquivo JSON
  const json = JSON.stringify(data, null, 2);
  console.log(json);
  
  return data;
}

// ===============================================
// EXEMPLO DE COMPONENTE REACT
// ===============================================

/*
import { useState, useEffect } from 'react';

function SettingsComponent() {
  const [settings, setSettings] = useState(null);
  
  // Carrega as configurações ao montar o componente
  useEffect(() => {
    loadSettings();
  }, []);
  
  async function loadSettings() {
    const data = await window.ipc.invoke('db:get-user-settings');
    setSettings(data);
  }
  
  async function updateTTSProvider(provider) {
    await window.ipc.invoke('db:set-tts-provider', provider);
    loadSettings(); // Recarrega para atualizar a UI
  }
  
  async function updateVolume(volume) {
    await window.ipc.invoke('db:set-user-settings', { volume });
    loadSettings();
  }
  
  if (!settings) return <div>Carregando...</div>;
  
  return (
    <div>
      <h2>Configurações</h2>
      
      <label>
        TTS Provider:
        <select 
          value={settings.ttsProvider} 
          onChange={(e) => updateTTSProvider(e.target.value)}
        >
          <option value="elevenlabs">ElevenLabs</option>
          <option value="polly">AWS Polly</option>
          <option value="deepgram">Deepgram</option>
        </select>
      </label>
      
      <label>
        Volume:
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.1"
          value={settings.volume} 
          onChange={(e) => updateVolume(parseFloat(e.target.value))}
        />
      </label>
    </div>
  );
}
*/

// ===============================================
// EXPORTAR FUNÇÕES DE EXEMPLO
// ===============================================
export {
  saveUserSettings,
  loadUserSettings,
  changeTTSProvider,
  saveConversation,
  loadRecentConversations,
  clearHistory,
  saveWindowPosition,
  loadWindowState,
  saveRecordingMetadata,
  listRecentRecordings,
  showDatabaseStats,
  exportAllData
};
