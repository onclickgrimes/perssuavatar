/**
 * EXEMPLO DE INTEGRAÇÃO DO BANCO DE DADOS COM SETTINGS.TSX
 * 
 * Este arquivo demonstra como integrar o sistema de banco de dados
 * com o componente Settings para persistir automaticamente as configurações.
 * 
 * Para usar, copie o código relevante para seu Settings.tsx
 */

import { useState, useEffect } from 'react';

export function SettingsWithDatabase() {
  // Estados locais
  const[assistantMode, setAssistantMode] = useState<'classic' | 'live'>('live');
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [selectedModel, setSelectedModel] = useState('Yuki');
  const [size, setSize] = useState(1);
  const [dragEnabled, setDragEnabled] = useState(true);
  
  // ================================================
  // CARREGAR CONFIGURAÇÕES AO INICIAR
  // ================================================
  useEffect(() => {
    loadSettings();
  }, []);
  
  async function loadSettings() {
    try {
      const settings = await window.electron.db.getUserSettings();
      
      // Aplicar as configurações carregadas
      if (settings) {
        setAssistantMode(settings.assistantMode || 'live');
        setAlwaysOnTop(settings.alwaysOnTop ?? true);
        setSelectedModel(settings.selectedModel || 'Yuki');
        
        // Aplicar configurações no Electron
        window.electron.setAssistantMode(settings.assistantMode);
        window.electron.setAlwaysOnTop(settings.alwaysOnTop);
        
        console.log('✅ Configurações carregadas do banco:', settings);
      }
    } catch (error) {
      console.error('❌ Erro ao carregar configurações:', error);
    }
  }
  
  // ================================================
  // SALVAR AUTOMATICAMENTE QUANDO MUDAR
  // ================================================
  
  // Salvar Assistant Mode
  const handleModeToggle = async () => {
    const newMode = assistantMode === 'classic' ? 'live' : 'classic';
    setAssistantMode(newMode);
    window.electron.setAssistantMode(newMode);
    
    // Salvar no banco de dados
    await window.electron.db.setAssistantMode(newMode);
    console.log('💾 Modo salvo:', newMode);
  };
  
  // Salvar Always On Top
  const handleAlwaysOnTopToggle = async () => {
    const newState = !alwaysOnTop;
    setAlwaysOnTop(newState);
    window.electron.setAlwaysOnTop(newState);
    
    // Salvar no banco de dados
    await window.electron.db.setUserSettings({ alwaysOnTop: newState });
    console.log('💾 Always on top salvo:', newState);
  };
  
  // Salvar Modelo Selecionado
  const handleModelChange = async (model: string) => {
    setSelectedModel(model);
    
    // Salvar no banco de dados
    await window.electron.db.setUserSettings({ selectedModel: model });
    console.log('💾 Modelo salvo:', model);
  };
  
  // Salvar Tamanho (com debounce para não salvar a cada movimento)
  const handleSizeChange = (newSize: number) => {
    setSize(newSize);
    
    // Debounce: salva apenas quando o usuário para de mexer
    clearTimeout((window as any).sizeDebounce);
    (window as any).sizeDebounce = setTimeout(async () => {
      // Você pode adicionar 'size' ao schema do banco se quiser persistir
      console.log('💾 Tamanho salvo:', newSize);
    }, 500);
  };
  
  // ================================================
  // SALVAR HISTÓRICO DE CONVERSAS
  // ================================================
  
  // Exemplo: Adicionar conversa ao histórico quando receber resposta da IA
  useEffect(() => {
    const unsubscribe = window.electron.onAiResponse(async (aiResponse) => {
      // Você precisaria capturar a mensagem do usuário também
      const userMessage = '...'; // Pegar de algum state
      
      await window.electron.db.addConversation({
        userMessage,
        aiResponse,
        mode: assistantMode
      });
      
      console.log('💾 Conversa salva no histórico');
    });
    
    // Retornar uma função de cleanup que chama o unsubscribe
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [assistantMode]);
  
  // ================================================
  // SALVAR METADATA DE GRAVAÇÕES
  // ================================================
  
  async function handleSaveRecording(path: string, duration: number) {
    const filename = path.split(/[\\/]/).pop() || 'recording.mp4';
    
    await window.electron.db.addRecording({
      filename,
      path,
      duration
    });
    
    console.log('💾 Gravação registrada no banco de dados');
  }
  
  // ================================================
  // VER ESTATÍSTICAS
  // ================================================
  
  async function showStats() {
    const stats = await window.electron.db.getStats();
    
    console.log('📊 ESTATÍSTICAS DO BANCO');
    console.log(`💬 Conversas: ${stats.conversationCount}`);
    console.log(`🎥 Gravações: ${stats.recordingCount}`);
    console.log(`📸 Screenshots: ${stats.screenshotCount}`);
  }
  
  // ================================================
  // EXPORTAR DADOS
  // ================================================
  
  async function exportData() {
    const data = await window.electron.db.export();
    
    // Criar arquivo JSON
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `avatar-backup-${Date.now()}.json`;
    a.click();
    
    console.log('💾 Dados exportados!');
  }
  
  // ================================================
  // LIMPAR HISTÓRICO
  // ================================================
  
  async function clearHistory() {
    if (confirm('Tem certeza que deseja limpar todo o histórico de conversas?')) {
      await window.electron.db.clearConversationHistory();
      console.log('🗑️ Histórico limpo!');
    }
  }
  
  return {
    // Estados
    assistantMode,
    alwaysOnTop,
    selectedModel,
    size,
    dragEnabled,
    
    // Handlers
    handleModeToggle,
    handleAlwaysOnTopToggle,
    handleModelChange,
    handleSizeChange,
    handleSaveRecording,
    
    // Utilities
    showStats,
    exportData,
    clearHistory,
    loadSettings
  };
}

// ================================================
// EXEMPLO DE HOOK CUSTOMIZADO
// ================================================

export function useSettings() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadSettings();
  }, []);
  
  async function loadSettings() {
    try {
      const data = await window.electron.db.getUserSettings();
      setSettings(data);
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
    } finally {
      setLoading(false);
    }
  }
  
  async function updateSettings(newSettings: Partial<any>) {
    await window.electron.db.setUserSettings(newSettings);
    await loadSettings(); // Recarrega
  }
  
  return {
    settings,
    loading,
    updateSettings,
    reload: loadSettings
  };
}

// ================================================
// EXEMPLO DE HOOK PARA HISTÓRICO DE CONVERSAS
// ================================================

export function useConversationHistory(limit = 10) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadHistory();
  }, [limit]);
  
  async function loadHistory() {
    try {
      const data = await window.electron.db.getRecentConversations(limit);
      setConversations(data);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    } finally {
      setLoading(false);
    }
  }
  
  async function addConversation(conversation: any) {
    await window.electron.db.addConversation(conversation);
    await loadHistory(); // Recarrega
  }
  
  async function clearHistory() {
    await window.electron.db.clearConversationHistory();
    await loadHistory(); // Recarrega
  }
  
  return {
    conversations,
    loading,
    addConversation,
    clearHistory,
    reload: loadHistory
  };
}

// ================================================
// EXEMPLO DE USO NO COMPONENTE
// ================================================

/*
function Settings() {
  const { settings, loading, updateSettings } = useSettings();
  const { conversations, addConversation, clearHistory } = useConversationHistory(5);
  
  if (loading) return <div>Carregando...</div>;
  
  return (
    <div>
      <h2>Configurações</h2>
      
      <select 
        value={settings?.assistantMode} 
        onChange={(e) => updateSettings({ assistantMode: e.target.value })}
      >
        <option value="classic">Classic</option>
        <option value="live">Live</option>
      </select>
      
      <h3>Últimas Conversas</h3>
      {conversations.map(conv => (
        <div key={conv.id}>
          <p><strong>Você:</strong> {conv.userMessage}</p>
          <p><strong>AI:</strong> {conv.aiResponse}</p>
          <small>{new Date(conv.timestamp).toLocaleString()}</small>
        </div>
      ))}
      
      <button onClick={clearHistory}>Limpar Histórico</button>
    </div>
  );
}
*/
