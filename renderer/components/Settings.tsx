import React, { useState, useEffect } from 'react';
import { useContinuousRecorder } from '../hooks/useContinuousRecorder';
import { useScreenShare } from '../hooks/useScreenShare';

interface SettingsProps {
  onSizeChange: (size: number) => void;
  onDragToggle: (enabled: boolean) => void;

  models: string[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  onScreenShareChange?: (isSharing: boolean) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

type TabId = 'api' | 'audio' | 'features' | 'shortcuts' | 'help';

export default function Settings({ 
  onSizeChange, 
  onDragToggle, 

  models,
  selectedModel,
  onModelChange,
  onScreenShareChange,
  isOpen: propIsOpen,
  onClose
}: SettingsProps) {
  // Internal state for uncontrolled mode (legacy support)
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = typeof propIsOpen !== 'undefined';
  const showSettings = isControlled ? propIsOpen : internalIsOpen;
  
  const [activeTab, setActiveTab] = useState<TabId>('api');
  
  // Existing states
  const [size, setSize] = useState(1);
  const [dragEnabled, setDragEnabled] = useState(true);

  const [assistantMode, setAssistantMode] = useState<'classic' | 'live'>('live');
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [dbStats, setDbStats] = useState<any>(null);
  
  // Continuous recorder & Screen Share
  const { isRecording, startRecording, stopRecording, saveLastSeconds, getBufferInfo } = useContinuousRecorder({ maxBufferSeconds: 600 });
  const { isSharing, startSharing, stopSharing } = useScreenShare({ fps: 1 });

  // Effects (Logics)
  useEffect(() => {
    if (assistantMode === 'live' && !isRecording) {
      startRecording();
    } else if (assistantMode === 'classic' && isRecording) {
      stopRecording();
    }
  }, [assistantMode, isRecording, startRecording, stopRecording]);

  useEffect(() => {
    const unsubscribe = window.electron.onSaveRecording(async (durationSeconds) => {
      const savedPath = await saveLastSeconds(durationSeconds);
      if (savedPath) {
        console.log(`[Settings] Recording saved to: ${savedPath}`);
        
        // Registrar gravação no banco de dados
        try {
          const filename = savedPath.split(/[\\/]/).pop() || 'recording.mp4';
          await window.electron.db.addRecording({
            filename,
            path: savedPath,
            duration: durationSeconds
          });
          console.log('💾 Gravação registrada no banco de dados');
        } catch (error) {
          console.error('❌ Erro ao registrar gravação:', error);
        }
      }
    });
    return () => { unsubscribe(); };
  }, [saveLastSeconds]);

  useEffect(() => {
    const unsubscribe = window.electron.onControlScreenShare((action) => {
      if (action === 'start' && !isSharing) startSharing();
      else if (action === 'stop' && isSharing) stopSharing();
    });
    return () => unsubscribe();
  }, [isSharing, startSharing, stopSharing]);

  // Carregar configurações do banco de dados ao iniciar
  useEffect(() => {
    async function loadSettings() {
      try {
        const settings = await window.electron.db.getUserSettings();
        console.log('📖 Configurações carregadas:', settings);
        
        if (settings) {
          // Aplicar configurações carregadas
          if (settings.assistantMode) {
            setAssistantMode(settings.assistantMode);
            window.electron.setAssistantMode(settings.assistantMode);
          }
          
          if (typeof settings.alwaysOnTop !== 'undefined') {
            setAlwaysOnTop(settings.alwaysOnTop);
            window.electron.setAlwaysOnTop(settings.alwaysOnTop);
          }
          
          if (settings.selectedModel) {
            onModelChange(settings.selectedModel);
          }
        }
      } catch (error) {
        console.error('❌ Erro ao carregar configurações:', error);
        // Se falhar, usa os defaults
        window.electron.setAssistantMode(assistantMode);
      }
    }
    
    loadSettings();
  }, []);

  useEffect(() => {
    onScreenShareChange?.(isSharing);
  }, [isSharing, onScreenShareChange]);

  // Salvar modelo selecionado no banco de dados quando mudar
  useEffect(() => {
    async function saveModel() {
      if (selectedModel) {
        try {
          await window.electron.db.setUserSettings({ selectedModel });
          console.log('💾 Modelo salvo:', selectedModel);
        } catch (error) {
          console.error('❌ Erro ao salvar modelo:', error);
        }
      }
    }
    saveModel();
  }, [selectedModel]);

  // Handlers
  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseFloat(e.target.value);
    setSize(newSize);
    
    // Apply scale directly to avatar instead of resizing window
    if (window.avatar && window.avatar.setScale) {
      window.avatar.setScale(newSize);
    }
    
    // Still notify parent for any other side effects (if needed)
    onSizeChange(newSize);
  };

  const handleDragToggle = () => {
    const newState = !dragEnabled;
    setDragEnabled(newState);
    onDragToggle(newState);
  };



  const handleModeToggle = async () => {
    const newMode = assistantMode === 'classic' ? 'live' : 'classic';
    setAssistantMode(newMode);
    window.electron.setAssistantMode(newMode);
    
    // Salvar no banco de dados
    try {
      await window.electron.db.setAssistantMode(newMode);
      console.log('💾 Modo salvo:', newMode);
    } catch (error) {
      console.error('❌ Erro ao salvar modo:', error);
    }
  };

  const handleAlwaysOnTopToggle = async () => {
    const newState = !alwaysOnTop;
    setAlwaysOnTop(newState);
    window.electron.setAlwaysOnTop(newState);
    
    // Salvar no banco de dados
    try {
      await window.electron.db.setUserSettings({ alwaysOnTop: newState });
      console.log('💾 Always on top salvo:', newState);
    } catch (error) {
      console.error('❌ Erro ao salvar always on top:', error);
    }
  };

  // ================================================
  // FUNÇÕES DO BANCO DE DADOS
  // ================================================

  // Carregar estatísticas do banco de dados
  const loadDatabaseStats = async () => {
    try {
      const stats = await window.electron.db.getStats();
      setDbStats(stats);
      console.log('📊 Estatísticas carregadas:', stats);
    } catch (error) {
      console.error('❌ Erro ao carregar estatísticas:', error);
    }
  };

  // Exportar dados do banco
  const handleExportData = async () => {
    try {
      const data = await window.electron.db.export();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `avatar-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      console.log('💾 Dados exportados com sucesso!');
    } catch (error) {
      console.error('❌ Erro ao exportar dados:', error);
    }
  };

  // Limpar histórico de conversas
  const handleClearHistory = async () => {
    if (confirm('Tem certeza que deseja limpar todo o histórico de conversas?')) {
      try {
        await window.electron.db.clearConversationHistory();
        await loadDatabaseStats(); // Atualiza estatísticas
        console.log('🗑️ Histórico limpo!');
      } catch (error) {
        console.error('❌ Erro ao limpar histórico:', error);
      }
    }
  };

  if (!showSettings && isControlled) return null;

  // Render Helpers
  const renderSidebarItem = (id: TabId, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors rounded-lg mb-1 ${
        activeTab === id 
          ? 'bg-[#1f1f1f] text-white border-l-2 border-blue-500' 
          : 'text-gray-400 hover:text-white hover:bg-[#1f1f1f]/50'
      }`}
    >
      <span className="text-lg">{icon}</span>
      {label}
    </button>
  );

  return (
    <div 
      className={isControlled 
        ? "fixed inset-0 z-[600] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 no-drag"
        : "absolute top-4 right-4 z-[200] no-drag"
      }
            onMouseEnter={() => window.electron.setIgnoreMouseEvents(false)}
      onMouseLeave={() => {
        if (!showSettings) window.electron.setIgnoreMouseEvents(true, { forward: true });
      }}
      onClick={(e) => {
        if (isControlled && e.target === e.currentTarget && onClose) onClose();
      }}
    >
      {!isControlled && (
        <button 
          onClick={() => setInternalIsOpen(!internalIsOpen)}
          className="p-2 bg-gray-800/80 text-white rounded-full hover:bg-gray-700 transition-colors pointer-events-auto shadow-lg"
        >
          ⚙️
        </button>
      )}

      {(showSettings || isControlled) && (
        <div className={`
            bg-[#0a0a0a] rounded-xl shadow-2xl border border-[#222] overflow-hidden flex flex-col no-drag
            ${isControlled ? 'w-[900px] h-[600px]' : 'absolute right-0 mt-2 w-80'}
        `}>
          {/* Header */}
          <div className="h-14 border-b border-[#222] flex items-center justify-between px-6 bg-[#0f0f0f] drag">
            <h2 className="text-lg font-bold text-white tracking-wide">Configurações</h2>
            {(isControlled && onClose) && (
              <button onClick={onClose} className="p-1.5 rounded-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white transition-colors no-drag">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
          </div>

          <div className="flex flex-1 overflow-hidden">
             {/* Sidebar */}
             <div className="w-64 bg-[#0a0a0a] border-r border-[#222] p-4 flex flex-col">
                <nav className="flex-1 space-y-1">
                   {renderSidebarItem('api', 'API e Modelos', '❖')}
                   {renderSidebarItem('audio', 'Áudio e Tela', '🎤')}
                   {renderSidebarItem('features', 'Recursos', '⚡')}
                   {renderSidebarItem('shortcuts', 'Atalhos', '⌨')}
                   {renderSidebarItem('help', 'Ajuda', '❓')}
                </nav>
                
                <div className="pt-4 border-t border-[#222]">
                   <button className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-400 hover:text-white hover:bg-[#1f1f1f]/50 rounded-lg transition-colors">
                      <span>👤</span> Conta
                   </button>
                   <button className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors mt-1">
                      <span>🌟</span> Premium
                   </button>
                </div>
             </div>

             {/* Content Area */}
             <div className="flex-1 bg-black p-8 overflow-y-auto custom-scrollbar">
                
                {/* --- API e Modelos (MOCKED) --- */}
                {activeTab === 'api' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                     <div>
                        <h3 className="text-xl font-medium text-white mb-1">Provedores de IA</h3>
                        <p className="text-sm text-gray-500 mb-6">Gerencie suas conexões com diferentes modelos de linguagem.</p>
                        
                        <div className="flex gap-4 mb-8">
                           <button className="flex-1 py-4 border-2 border-blue-600 bg-blue-900/10 rounded-xl flex flex-col items-center justify-center gap-2 text-white">
                              <span className="text-2xl">🤖</span>
                              <span className="font-semibold">OpenAI</span>
                              <span className="text-xs bg-blue-600 px-2 py-0.5 rounded-full">Ativo</span>
                           </button>
                           <button className="flex-1 py-4 border border-[#333] bg-[#111] hover:bg-[#1a1a1a] rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-white transition-all opacity-60">
                              <span className="text-2xl">⚡</span>
                              <span className="font-semibold">Google</span>
                           </button>
                           <button className="flex-1 py-4 border border-[#333] bg-[#111] hover:bg-[#1a1a1a] rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-white transition-all opacity-60">
                              <span className="text-2xl">🌐</span>
                              <span className="font-semibold">OpenRouter</span>
                           </button>
                        </div>
                     </div>

                     <div>
                        <h3 className="text-lg font-medium text-white mb-4">Chave de API</h3>
                        <div className="bg-[#111] border border-[#222] rounded-lg p-3 flex items-center justify-between">
                           <code className="text-gray-400 tracking-widest text-sm">sk-proj-****************************</code>
                           <button className="text-gray-500 hover:text-white px-2">Editar</button>
                        </div>
                        <p className="text-xs text-gray-600 mt-2">Sua chave é armazenada localmente e de forma segura.</p>
                     </div>
                  </div>
                )}

                {/* --- Áudio e Tela (MOCKED) --- */}
                {activeTab === 'audio' && (
                   <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-50">
                      <div className="text-4xl">🎤 🖥️</div>
                      <h3 className="text-xl font-medium text-white">Configurações de Áudio e Tela</h3>
                      <p className="text-gray-500 max-w-md">Em breve você poderá configurar dispositivos de entrada/saída, cancelamento de ruído e preferências avançadas de captura de tela.</p>
                   </div>
                )}

                {/* --- Recursos (REAL SETTINGS) --- */}
                {activeTab === 'features' && (
                   <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      
                      {/* Section: Avatar */}
                      <div className="space-y-4">
                         <h3 className="text-sm uppercase tracking-wider text-gray-500 font-semibold border-b border-[#222] pb-2">Aparência do Avatar</h3>
                         
                         <div className="grid grid-cols-2 gap-6">
                            <div>
                               <label className="block text-sm font-medium text-gray-300 mb-2">Modelo Live2D</label>
                               <select 
                                 value={selectedModel}
                                 onChange={(e) => onModelChange(e.target.value)}
                                 className="w-full bg-[#111] text-white rounded-lg p-3 border border-[#333] text-sm focus:ring-1 focus:ring-blue-500 outline-none hover:border-gray-500 transition-colors"
                               >
                                 {models.map(model => (
                                   <option key={model} value={model}>{model}</option>
                                 ))}
                               </select>
                            </div>

                            <div>
                              <div className="flex justify-between mb-2">
                                <label className="text-sm font-medium text-gray-300">Tamanho</label>
                                <span className="text-xs bg-[#222] px-2 py-0.5 rounded text-gray-400">{size}x</span>
                              </div>
                              <input 
                                type="range" 
                                min="0.5" 
                                max="2" 
                                step="0.1" 
                                value={size} 
                                onChange={handleSizeChange}
                                className="w-full accent-blue-600 h-1.5 bg-[#222] rounded-lg appearance-none cursor-pointer"
                              />
                            </div>
                         </div>
                      </div>

                      {/* Section: Janela e Comportamento */}
                      <div className="space-y-4">
                        <h3 className="text-sm uppercase tracking-wider text-gray-500 font-semibold border-b border-[#222] pb-2">Janela e Comportamento</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {/* Drag Toggle */}
                           <div className="flex items-center justify-between p-3 bg-[#111] rounded-lg border border-[#222]">
                             <span className="text-sm text-gray-300">Mover com Mouse</span>
                             <button onClick={handleDragToggle} className={`w-10 h-5 rounded-full transition-colors relative ${dragEnabled ? 'bg-green-600' : 'bg-gray-600'}`}>
                               <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${dragEnabled ? 'left-6' : 'left-1'}`} />
                             </button>
                           </div>



                           {/* Always On Top Toggle */}
                           <div className="flex items-center justify-between p-3 bg-[#111] rounded-lg border border-[#222]">
                             <span className="text-sm text-gray-300">Sobrepor Janelas</span>
                             <button onClick={handleAlwaysOnTopToggle} className={`w-10 h-5 rounded-full transition-colors relative ${alwaysOnTop ? 'bg-green-600' : 'bg-gray-600'}`}>
                               <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${alwaysOnTop ? 'left-6' : 'left-1'}`} />
                             </button>
                           </div>
                        </div>
                      </div>

                      {/* Section: Assistente e IA */}
                      <div className="space-y-4">
                         <h3 className="text-sm uppercase tracking-wider text-gray-500 font-semibold border-b border-[#222] pb-2">Modo Assistente</h3>
                         
                         <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 p-4 rounded-xl border border-purple-500/20">
                            <div className="flex items-center justify-between mb-4">
                               <div>
                                  <h4 className="font-semibold text-white">Modo Gemini Live</h4>
                                  <p className="text-xs text-gray-400 mt-1">Interação em tempo real com visão e voz</p>
                               </div>
                               <button 
                                 onClick={handleModeToggle}
                                 className={`w-12 h-6 rounded-full transition-colors relative ${assistantMode === 'live' ? 'bg-purple-600 shadow-[0_0_10px_rgba(147,51,234,0.5)]' : 'bg-gray-600'}`}
                               >
                                 <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${assistantMode === 'live' ? 'left-7' : 'left-1'}`} />
                               </button>
                            </div>

                            {assistantMode === 'live' && (
                               <div className="space-y-3 pt-2 border-t border-white/10">
                                  {/* Screen Share Control */}
                                  <div className="flex items-center justify-between">
                                     <span className="text-sm text-purple-200 flex items-center gap-2">🖥️ Compartilhar Visão da Tela</span>
                                     <button onClick={() => isSharing ? stopSharing() : startSharing()} className={`w-10 h-5 rounded-full transition-colors relative ${isSharing ? 'bg-blue-500' : 'bg-gray-600'}`}>
                                       <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${isSharing ? 'left-6' : 'left-1'}`} />
                                     </button>
                                  </div>
                                  
                                  {/* Manual Save Button */}
                                  <button 
                                    onClick={async () => {
                                       const path = await saveLastSeconds(30);
                                       if (path) alert(`Gravação salva em: ${path}`);
                                    }}
                                    className="w-full mt-2 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs text-white font-medium transition-colors flex items-center justify-center gap-2"
                                  >
                                     <span>💾</span> Salvar Replay (Últimos 30s)
                                  </button>
                               </div>
                            )}
                         </div>
                      </div>

                   </div>
                )}

                {/* --- Atalhos (MOCKED) --- */}
                {activeTab === 'shortcuts' && (
                   <div className="space-y-4 opacity-90 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <h3 className="text-xl font-medium text-white mb-6">Atalhos de Teclado</h3>
                      <div className="grid grid-cols-1 gap-3">
                         <div className="flex justify-between items-center bg-[#111] p-3 rounded-lg border border-[#222]">
                            <span className="text-gray-300">Abrir Barra de Ação</span>
                            <div className="flex gap-1"><kbd className="bg-[#333] px-2 py-1 rounded text-xs text-white border border-[#444]">Ctrl</kbd> <kbd className="bg-[#333] px-2 py-1 rounded text-xs text-white border border-[#444]">M</kbd></div>
                         </div>
                         <div className="flex justify-between items-center bg-[#111] p-3 rounded-lg border border-[#222]">
                            <span className="text-gray-300">Começar a Ouvir</span>
                            <div className="flex gap-1"><kbd className="bg-[#333] px-2 py-1 rounded text-xs text-white border border-[#444]">Ctrl</kbd> <kbd className="bg-[#333] px-2 py-1 rounded text-xs text-white border border-[#444]">D</kbd></div>
                         </div>
                         <div className="flex justify-between items-center bg-[#111] p-3 rounded-lg border border-[#222]">
                            <span className="text-gray-300">Alternar Microfone</span>
                            <div className="flex gap-1"><kbd className="bg-[#333] px-2 py-1 rounded text-xs text-white border border-[#444]">Ctrl</kbd> <kbd className="bg-[#333] px-2 py-1 rounded text-xs text-white border border-[#444]">Shift</kbd> <kbd className="bg-[#333] px-2 py-1 rounded text-xs text-white border border-[#444]">M</kbd></div>
                         </div>
                      </div>
                   </div>
                )}

                {/* --- Ajuda & Dados --- */}
                {activeTab === 'help' && (
                   <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div>
                         <h3 className="text-xl font-medium text-white mb-2">💾 Banco de Dados</h3>
                         <p className="text-sm text-gray-400 mb-6">Gerencie seus dados e configurações salvas</p>
                         
                         {/* Estatísticas */}
                         <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 border border-blue-500/20 rounded-xl p-6 mb-6">
                            <div className="flex items-center justify-between mb-4">
                               <h4 className="text-lg font-semibold text-white">📊 Estatísticas</h4>
                               <button 
                                  onClick={loadDatabaseStats}
                                  className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-xs font-medium transition-colors"
                               >
                                  🔄 Atualizar
                               </button>
                            </div>
                            
                            {dbStats ? (
                               <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <div className="bg-black/30 rounded-lg p-4 text-center">
                                     <div className="text-2xl font-bold text-blue-400">{dbStats.conversationCount || 0}</div>
                                     <div className="text-xs text-gray-400 mt-1">💬 Conversas</div>
                                  </div>
                                  <div className="bg-black/30 rounded-lg p-4 text-center">
                                     <div className="text-2xl font-bold text-purple-400">{dbStats.recordingCount || 0}</div>
                                     <div className="text-xs text-gray-400 mt-1">🎥 Gravações</div>
                                  </div>
                                  <div className="bg-black/30 rounded-lg p-4 text-center">
                                     <div className="text-2xl font-bold text-green-400">{dbStats.screenshotCount || 0}</div>
                                     <div className="text-xs text-gray-400 mt-1">📸 Screenshots</div>
                                  </div>
                                  <div className="bg-black/30 rounded-lg p-4 text-center">
                                     <div className="text-2xl font-bold text-amber-400">✓</div>
                                     <div className="text-xs text-gray-400 mt-1">⚙️ Configurado</div>
                                  </div>
                               </div>
                            ) : (
                               <div className="text-center py-8 text-gray-500">
                                  <p className="mb-4">Clique em "Atualizar" para carregar as estatísticas</p>
                               </div>
                            )}
                            
                            {dbStats && (
                               <div className="mt-4 pt-4 border-t border-white/10">
                                  <p className="text-xs text-gray-500">
                                     📁 Localização: <code className="text-blue-400">{dbStats.path}</code>
                                  </p>
                               </div>
                            )}
                         </div>
                         
                         {/* Ações */}
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button 
                               onClick={handleExportData}
                               className="p-4 bg-[#111] hover:bg-[#1a1a1a] border border-[#222] rounded-xl text-left transition-colors group"
                            >
                               <div className="flex items-center gap-3 mb-2">
                                  <span className="text-2xl">📦</span>
                                  <h4 className="font-bold text-white group-hover:text-blue-400 transition-colors">Exportar Dados</h4>
                               </div>
                               <p className="text-xs text-gray-500">Salve um backup completo em JSON</p>
                            </button>
                            
                            <button 
                               onClick={handleClearHistory}
                               className="p-4 bg-[#111] hover:bg-red-900/20 border border-[#222] hover:border-red-500/30 rounded-xl text-left transition-colors group"
                            >
                               <div className="flex items-center gap-3 mb-2">
                                  <span className="text-2xl">🗑️</span>
                                  <h4 className="font-bold text-white group-hover:text-red-400 transition-colors">Limpar Histórico</h4>
                               </div>
                               <p className="text-xs text-gray-500">Remove todas as conversas salvas</p>
                            </button>
                         </div>
                      </div>
                      
                      {/* Seção de Ajuda */}
                      <div className="pt-6 border-t border-[#222]">
                         <h3 className="text-xl font-medium text-white mb-4">❓ Precisa de Ajuda?</h3>
                         <div className="grid grid-cols-2 gap-4">
                            <button className="p-4 bg-[#111] hover:bg-[#1a1a1a] border border-[#222] rounded-xl text-left transition-colors">
                               <h4 className="font-bold text-white mb-1">📚 Documentação</h4>
                               <p className="text-xs text-gray-500">Guias completos e tutoriais</p>
                            </button>
                            <button className="p-4 bg-[#111] hover:bg-[#1a1a1a] border border-[#222] rounded-xl text-left transition-colors">
                               <h4 className="font-bold text-white mb-1">💬 Suporte</h4>
                               <p className="text-xs text-gray-500">Fale com nossa equipe</p>
                            </button>
                         </div>
                      </div>
                   </div>
                )}
             </div>
          </div>
          
          {/* Footer */}
          <div className="h-16 bg-[#0a0a0a] border-t border-[#222] flex items-center justify-between px-6">
             <button className="text-gray-500 hover:text-red-500 transition-colors" title="Deslogar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                   <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                   <polyline points="16 17 21 12 16 7"></polyline>
                   <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
             </button>
             <button onClick={onClose} className="bg-white text-black hover:bg-gray-200 px-6 py-2 rounded-lg font-medium text-sm transition-colors shadow-lg">
                Salvar
             </button>
          </div>
        </div>
      )}
    </div>
  );
}
