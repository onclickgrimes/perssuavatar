import React, { useState, useEffect, useRef } from 'react';
import Avatar from '../components/Avatar';
import CodePopup from '../components/CodePopup';
import Settings from '../components/Settings';
import ActionBar from '../components/ActionBar';
import RadialMenu from '../components/RadialMenu';
import { useMicrophone } from '../hooks/useMicrophone';

export default function HomePage() {
  // Initialize microphone
  useMicrophone();

  const [dragEnabled, setDragEnabled] = useState(true);
  const [selectedModel, setSelectedModel] = useState('Yuki');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showActionBar, setShowActionBar] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMicrophonePaused, setIsMicrophonePaused] = useState(false);
  const [isAvatarReactionDisabled, setIsAvatarReactionDisabled] = useState(false);
  const [isTranscriptionHidden, setIsTranscriptionHidden] = useState(false);
  const isHoveringAvatarRef = useRef(false);
  
  const models = [
    'Yuki', 'Haru', 'Hiyori', 'Mao', 'Mark', 'Natori', 'Rice', 'Wanko', 'Yuino', 'DevilYuki'
  ];

  const handleSizeChange = (scale: number) => {
    // Size is now handled directly by Avatar component via window.avatar.setScale()
    // No need to resize the window anymore
  };

  // Listen for ESC to close UI
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC to close
      if (e.key === 'Escape') {
         if (isSettingsOpen) {
            setIsSettingsOpen(false);
         } else if (showActionBar) {
            setShowActionBar(false);
         }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showActionBar, isSettingsOpen]);

  const handleOpenSettings = () => {
    // Open modal directly, do NOT toggle action bar
    setIsSettingsOpen(true);
  };

  const handleOpenHistory = () => {
    console.log('📜 Histórico clicado (funcionalidade a implementar)');
    // TODO: Implementar janela de histórico
  };

  const handleStartListening = async () => {
    console.log('🎤 Começar a ouvir acionado');
    await window.electron.openTranscriptionWindow();
  };

  const handleAsk = () => {
    console.log('💬 Perguntar acionado');
    // TODO: Implementar funcionalidade de perguntar (Ctrl+Enter)
  };

  // When UI is open (ActionBar or Settings), disable click-through to allow interaction
  useEffect(() => {
    const uiOpen = showActionBar || isSettingsOpen;
    
    console.log('[HomePage] UI Open state changed:', { showActionBar, isSettingsOpen, uiOpen });
    
    if (uiOpen) {
      // UI is open: capture all mouse events
      // Use timeout to ensure this runs after any pending Avatar hit test
      const timer = setTimeout(() => {
        console.log('[HomePage] Forcing setIgnoreMouseEvents(false) - UI is open');
        window.electron.setIgnoreMouseEvents(false);
      }, 10);
      
      return () => clearTimeout(timer);
    } else {
      // UI closed: Avatar.tsx hit test logic will take over
      console.log('[HomePage] UI closed - Avatar hit test will manage mouse events');
    }
  }, [showActionBar, isSettingsOpen]);

  // Listen for microphone status changes from backend (Ctrl+P)
  useEffect(() => {
    const unsubscribe = window.electron.onMicrophoneStatusChanged((isPaused) => {
      console.log(`🎤 Microphone status changed: ${isPaused ? 'Pausado' : 'Ativo'}`);
      setIsMicrophonePaused(isPaused);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Listen for avatar reaction status changes from backend (Ctrl+O)
  useEffect(() => {
    const unsubscribe = window.electron.onAvatarReactionStatusChanged((isDisabled) => {
      console.log(`🤖 Avatar reaction status changed: ${isDisabled ? 'Desabilitada' : 'Habilitada'}`);
      setIsAvatarReactionDisabled(isDisabled);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Listen for ActionBar toggle from global shortcut (Ctrl+M)
  useEffect(() => {
    const unsubscribe = window.electron.onActionBarToggle(() => {
      console.log(`🎯 ActionBar toggle recebido do atalho global`);
      setShowActionBar(prev => !prev);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Verificar estado da janela de transcrição periodicamente
  useEffect(() => {
    const checkTranscriptionWindow = async () => {
      const result = await window.electron?.isTranscriptionWindowOpen?.();
      if (result) {
        // Se a janela existe mas não está visível, está "minimizada"
        setIsTranscriptionHidden(result.isOpen && !result.isVisible);
      }
    };
    
    // Verificar a cada 1 segundo
    const interval = setInterval(checkTranscriptionWindow, 1000);
    checkTranscriptionWindow(); // Verificar imediatamente
    
    return () => clearInterval(interval);
  }, []);



  return (
    <div className="w-screen h-screen overflow-hidden bg-transparent">
      <Avatar modelName={selectedModel} uiOpen={showActionBar || isSettingsOpen} />
      <CodePopup />
      
      {/* Menu Radial - Ativado ao segurar botão direito do mouse */}
      <RadialMenu
        onOpenSettings={handleOpenSettings}
        onOpenHistory={handleOpenHistory}
        onStartListening={handleStartListening}
        onAsk={handleAsk}
      />
      <Settings 
        onSizeChange={handleSizeChange}
        onDragToggle={setDragEnabled}

        models={models}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        onScreenShareChange={setIsScreenSharing}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Action Bar - Toggle with CTRL+M */}
      <ActionBar 
        isVisible={showActionBar}
        onClose={() => setShowActionBar(false)}
        onOpenSettings={handleOpenSettings}
      />

      {/* Indicadores - Direita abaixo do avatar, empilhados verticalmente */}
      {/* 🔧 AJUSTE: Modifique o valor '10px' abaixo para mover para esquerda (aumentar) ou direita (diminuir) */}
      <div className="absolute bottom-1/4 right-[calc(45%-30px)] z-[9999] flex flex-col gap-1.5 pointer-events-auto">
        {/* Screen Share Indicator - Eye icon */}
        {isScreenSharing && (
          <div className="relative group pointer-events-auto">
            <div 
              className="flex items-center justify-center w-7 h-7 bg-blue-600/90 backdrop-blur-sm rounded-full shadow-lg animate-pulse cursor-help"
            >
              <svg 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="white" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            {/* Tooltip */}
            <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[999]">
              Yuki está olhando sua tela
              <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-blue-600"></div>
            </div>
          </div>
        )}

        {/* Microphone Paused Indicator - Mic-off icon */}
        {isMicrophonePaused && (
          <div className="relative group pointer-events-auto">
            <div 
              className="flex items-center justify-center w-7 h-7 bg-red-600/90 backdrop-blur-sm rounded-full shadow-lg animate-pulse cursor-help"
            >
              <svg 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="white" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <line x1="2" x2="22" y1="2" y2="22"/>
                <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/>
                <path d="M5 10v2a7 7 0 0 0 12 5"/>
                <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
                <line x1="12" x2="12" y1="19" y2="22"/>
              </svg>
            </div>
            {/* Tooltip */}
            <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[999]">
              Microfone pausado (Ctrl+P)
              <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-red-600"></div>
            </div>
          </div>
        )}

        {/* Avatar Reaction Disabled Indicator - Ear-off icon */}
        {isAvatarReactionDisabled && (
          <div className="relative group pointer-events-auto">
            <div 
              className="flex items-center justify-center w-7 h-7 bg-orange-600/90 backdrop-blur-sm rounded-full shadow-lg animate-pulse cursor-help"
            >
              <svg 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="white" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M6 18.5a3.5 3.5 0 1 0 7 0c0-1.57.92-2.52 2.04-3.46"/>
                <path d="M6 8.5c0-.75.13-1.47.36-2.14"/>
                <path d="M8.8 3.15A6.5 6.5 0 0 1 19 8.5c0 1.63-.44 2.81-1.09 3.76"/>
                <path d="M12.5 6A2.5 2.5 0 0 1 15 8.5M10 13a2 2 0 0 0 1.82-1.18"/>
                <line x1="2" x2="22" y1="2" y2="22"/>
              </svg>
            </div>
            {/* Tooltip */}
            <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-orange-600 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[999]">
              Reação desabilitada (Ctrl+O)
              <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-orange-600"></div>
            </div>
          </div>
        )}

        {/* Transcription Window Minimized Indicator - Text icon */}
        {isTranscriptionHidden && (
          <div className="relative group pointer-events-auto">
            <button 
              onClick={async () => {
                await window.electron?.showTranscriptionWindow?.();
                setIsTranscriptionHidden(false);
              }}
              className="flex items-center justify-center w-7 h-7 bg-purple-600/90 backdrop-blur-sm rounded-full shadow-lg hover:bg-purple-500 transition-colors cursor-pointer"
            >
              <svg 
                width="18" 
                height="18" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="white" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                <line x1="9" x2="15" y1="10" y2="10"/>
                <line x1="12" x2="12" y1="7" y2="13"/>
              </svg>
            </button>
            {/* Tooltip */}
            <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[999]">
              Abrir Transcrição (Ctrl+D)
              <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-purple-600"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}