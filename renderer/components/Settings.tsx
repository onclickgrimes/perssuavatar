import React, { useState, useEffect } from 'react';
import { useContinuousRecorder } from '../hooks/useContinuousRecorder';
import { useScreenShare } from '../hooks/useScreenShare';

interface SettingsProps {
  onSizeChange: (size: number) => void;
  onDragToggle: (enabled: boolean) => void;
  onBackgroundToggle: (visible: boolean) => void;
  models: string[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  onScreenShareChange?: (isSharing: boolean) => void;
  // New props for controlled modal mode
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Settings({ 
  onSizeChange, 
  onDragToggle, 
  onBackgroundToggle,
  models,
  selectedModel,
  onModelChange,
  onScreenShareChange,
  isOpen: propIsOpen,
  onClose
}: SettingsProps) {
  // Internal state for uncontrolled mode (legacy support if needed)
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = typeof propIsOpen !== 'undefined';
  const showSettings = isControlled ? propIsOpen : internalIsOpen;
  
  const [size, setSize] = useState(1);
  const [dragEnabled, setDragEnabled] = useState(true);
  const [bgVisible, setBgVisible] = useState(false);
  const [assistantMode, setAssistantMode] = useState<'classic' | 'live'>('live');
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  
  // Continuous recorder for background recording
  const { isRecording, startRecording, stopRecording, saveLastSeconds, getBufferInfo } = useContinuousRecorder({ maxBufferSeconds: 600 });
  const { isSharing, startSharing, stopSharing } = useScreenShare({ fps: 1 });

  // ... (Effects remain the same, ommited for brevity but included in compilation) ...
    // Start continuous recording when in live mode
  useEffect(() => {
    if (assistantMode === 'live' && !isRecording) {
      console.log('[Settings] Starting continuous recording for live mode...');
      startRecording();
    } else if (assistantMode === 'classic' && isRecording) {
      console.log('[Settings] Stopping continuous recording for classic mode...');
      stopRecording();
    }
  }, [assistantMode, isRecording, startRecording, stopRecording]);

  // Listen for voice commands to save recording
  useEffect(() => {
    const unsubscribe = window.electron.onSaveRecording(async (durationSeconds) => {
      console.log(`[IPC] Received save-recording command: ${durationSeconds}s`);
      const bufferInfo = getBufferInfo();
      console.log(`[Settings] Buffer info: ${bufferInfo.duration.toFixed(1)}s, ${(bufferInfo.size / 1024 / 1024).toFixed(2)} MB`);
      
      const savedPath = await saveLastSeconds(durationSeconds);
      if (savedPath) {
        console.log(`[Settings] Recording saved to: ${savedPath}`);
      } else {
        console.warn('[Settings] Failed to save recording');
      }
    });
    return () => { unsubscribe(); };
  }, [saveLastSeconds, getBufferInfo]);

  // Listen for voice commands to control screen share
  useEffect(() => {
    const unsubscribe = window.electron.onControlScreenShare((action) => {
      console.log(`[IPC] Received control-screen-share action: ${action}`);
      if (action === 'start') {
        if (!isSharing) {
            console.log("Starting screen share via Voice Command");
            startSharing();
        }
      } else if (action === 'stop') {
        if (isSharing) {
            console.log("Stopping screen share via Voice Command");
            stopSharing();
        }
      }
    });
    return () => unsubscribe();
  }, [isSharing, startSharing, stopSharing]);

  // Set initial assistant mode on mount
  useEffect(() => {
    window.electron.setAssistantMode(assistantMode);
  }, []);

  // Notify parent when screen share state changes
  useEffect(() => {
    onScreenShareChange?.(isSharing);
  }, [isSharing, onScreenShareChange]);


  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseFloat(e.target.value);
    setSize(newSize);
    onSizeChange(newSize);
  };

  const handleDragToggle = () => {
    const newState = !dragEnabled;
    setDragEnabled(newState);
    onDragToggle(newState);
  };

  const handleBgToggle = () => {
    const newState = !bgVisible;
    setBgVisible(newState);
    onBackgroundToggle(newState);
  };

  const handleModeToggle = () => {
    const newMode = assistantMode === 'classic' ? 'live' : 'classic';
    setAssistantMode(newMode);
    window.electron.setAssistantMode(newMode);
  };

  const handleAlwaysOnTopToggle = () => {
    const newState = !alwaysOnTop;
    setAlwaysOnTop(newState);
    window.electron.setAlwaysOnTop(newState);
  };

  if (!showSettings && isControlled) return null;

  return (
    <div 
      className={isControlled 
        ? "fixed inset-0 z-[600] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        : "absolute top-4 right-4 z-[200] no-drag"
      }
      onMouseEnter={() => window.electron.setIgnoreMouseEvents(false)}
      onMouseLeave={() => {
        if (!showSettings) {
             window.electron.setIgnoreMouseEvents(true, { forward: true });
        }
      }}
      onClick={(e) => {
        // Close on backdrop click (only controlled mode)
        if (isControlled && e.target === e.currentTarget && onClose) {
           onClose();
        }
      }}
    >
      {!isControlled && (
        <button 
          onClick={() => setInternalIsOpen(!internalIsOpen)}
          className="p-2 bg-gray-800/80 text-white rounded-full hover:bg-gray-700 transition-colors cursor-pointer pointer-events-auto"
        >
          ⚙️
        </button>
      )}

      {(showSettings || isControlled) && (
        <div className={`
            bg-gray-900/95 backdrop-blur-md p-6 rounded-2xl shadow-2xl border border-gray-700 text-white
            ${isControlled ? 'w-80 relative animate-in fade-in zoom-in duration-200' : 'absolute right-0 mt-2 w-64'}
        `}>
          {isControlled && (
             <button 
                onClick={onClose}
                className="absolute top-3 right-3 text-gray-400 hover:text-white"
             >
                ✕
             </button>
          )}

          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <span className="text-2xl">⚙️</span> Configurações
          </h3>
          
          <div className="space-y-5">
            {/* Size Control */}
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">Tamanho Avatar</label>
                <span className="text-xs bg-gray-800 px-2 py-0.5 rounded text-gray-400">{size}x</span>
              </div>
              <input 
                type="range" 
                min="0.5" 
                max="2" 
                step="0.1" 
                value={size} 
                onChange={handleSizeChange}
                className="w-full accent-blue-600 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Toggles Grid */}
            <div className="space-y-3">
                <div className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg">
                  <span className="text-sm text-gray-300">Mover com Mouse</span>
                  <button 
                    onClick={handleDragToggle}
                    className={`w-10 h-5 rounded-full transition-colors relative ${dragEnabled ? 'bg-green-500' : 'bg-gray-600'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${dragEnabled ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg">
                  <span className="text-sm text-gray-300">Mostrar Fundo</span>
                  <button 
                    onClick={handleBgToggle}
                    className={`w-10 h-5 rounded-full transition-colors relative ${bgVisible ? 'bg-green-500' : 'bg-gray-600'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${bgVisible ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg">
                  <span className="text-sm text-gray-300">Sobrepor Janelas</span>
                  <button 
                    onClick={handleAlwaysOnTopToggle}
                    className={`w-10 h-5 rounded-full transition-colors relative ${alwaysOnTop ? 'bg-green-500' : 'bg-gray-600'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${alwaysOnTop ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
            </div>

            {/* Model Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Modelo Live2D</label>
              <select 
                value={selectedModel}
                onChange={(e) => onModelChange(e.target.value)}
                className="w-full bg-gray-800 text-white rounded-lg p-2.5 border border-gray-600 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {models.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>

            <div className="border-t border-gray-700 my-4"></div>

            {/* Assistant Mode Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Modo Gemini Live</span>
              <button 
                onClick={handleModeToggle}
                className={`w-12 h-6 rounded-full transition-colors relative ${assistantMode === 'live' ? 'bg-purple-600' : 'bg-gray-600'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${assistantMode === 'live' ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            {/* Screen Share Toggle - Only visible in Live mode */}
            {assistantMode === 'live' && (
              <div className="flex items-center justify-between bg-blue-900/20 p-2 rounded-lg border border-blue-900/50">
                <span className="text-sm text-blue-200 flex items-center gap-2">
                    🖥️ Compartilhar Tela
                </span>
                <button 
                  onClick={() => isSharing ? stopSharing() : startSharing()}
                  className={`w-10 h-5 rounded-full transition-colors relative ${isSharing ? 'bg-blue-500' : 'bg-gray-600'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${isSharing ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            )}

            <div className="pt-2">
                {/* Recording Status and Manual Save */}
                {assistantMode === 'live' && (
                  <div className="text-xs text-gray-400 mb-2 flex justify-center">
                    {isRecording ? (
                      <span className="flex items-center gap-1.5 px-2 py-1 bg-red-900/30 rounded-full border border-red-900/50">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                        Gravação contínua ativa
                      </span>
                    ) : (
                      <span>Gravação inativa</span>
                    )}
                  </div>
                )}
                
                <button 
                    onClick={async () => {
                      if (assistantMode === 'live') {
                        const path = await saveLastSeconds(30);
                        if (path) alert(`Gravação salva em: ${path}`);
                      } else {
                        isRecording ? stopRecording() : startRecording();
                      }
                    }}
                    className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all transform active:scale-95 ${
                        assistantMode === 'live'
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-900/30'
                        : isRecording 
                          ? 'bg-red-600 animate-pulse text-white' 
                          : 'bg-green-600 hover:bg-green-500 text-white'
                    }`}
                >
                    {assistantMode === 'live' 
                      ? '💾 Salvar Replay (30s)' 
                      : (isRecording ? '⏹ Parar Gravação' : '📷 Analisar Tela')
                    }
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
