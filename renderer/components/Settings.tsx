import React, { useState } from 'react';
import { useScreenRecorder } from '../hooks/useScreenRecorder';

interface SettingsProps {
  onSizeChange: (size: number) => void;
  onDragToggle: (enabled: boolean) => void;
  onBackgroundToggle: (visible: boolean) => void;
}

export default function Settings({ onSizeChange, onDragToggle, onBackgroundToggle }: SettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [size, setSize] = useState(1);
  const [dragEnabled, setDragEnabled] = useState(true);
  const [bgVisible, setBgVisible] = useState(false);
  
  const { isRecording, startRecording, stopRecording } = useScreenRecorder();

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

  return (
    <div 
      className="absolute top-4 right-4 z-[200] no-drag"
      // Ensure the container itself is interactive when hovering
      onMouseEnter={() => {
          window.electron.setIgnoreMouseEvents(false);
      }}
      onMouseLeave={() => {
        // Only ignore mouse events if the menu is NOT open
        if (!isOpen) {
            window.electron.setIgnoreMouseEvents(true, { forward: true });
        }
      }}
    >
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 bg-gray-800/80 text-white rounded-full hover:bg-gray-700 transition-colors cursor-pointer pointer-events-auto"
      >
        ⚙️
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-gray-900/90 backdrop-blur-md p-4 rounded-lg shadow-xl border border-gray-700 text-white">
          <h3 className="text-lg font-semibold mb-4">Configurações</h3>
          
          <div className="space-y-4">
            {/* Size Control */}
            <div>
              <label className="block text-sm mb-1">Tamanho ({size}x)</label>
              <input 
                type="range" 
                min="0.5" 
                max="2" 
                step="0.1" 
                value={size} 
                onChange={handleSizeChange}
                className="w-full"
              />
            </div>

            {/* Drag Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm">Mover com Mouse</span>
              <button 
                onClick={handleDragToggle}
                className={`w-12 h-6 rounded-full transition-colors relative ${dragEnabled ? 'bg-green-600' : 'bg-gray-600'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${dragEnabled ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            {/* Background Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm">Mostrar Fundo</span>
              <button 
                onClick={handleBgToggle}
                className={`w-12 h-6 rounded-full transition-colors relative ${bgVisible ? 'bg-green-600' : 'bg-gray-600'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${bgVisible ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            <div className="pt-2 border-t border-gray-700 space-y-2">
                <button 
                    onClick={() => isRecording ? stopRecording() : startRecording()}
                    className={`w-full py-2 rounded text-sm transition-colors ${
                        isRecording 
                        ? 'bg-red-600 animate-pulse text-white hover:bg-red-700' 
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                >
                    {isRecording ? '⏹ Parar Gravação' : '📷 Analisar Tela (Max 20MB)'}
                </button>

                <button 
                    onClick={() => window.electron.openSettings()}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
                >
                    Mais Configurações
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
