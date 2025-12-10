import React, { useState, useEffect, useRef } from 'react';
import Avatar from '../components/Avatar';
import CodePopup from '../components/CodePopup';
import Settings from '../components/Settings';
import ActionBar from '../components/ActionBar';
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
  const isHoveringAvatarRef = useRef(false);
  
  const models = [
    'Yuki', 'Haru', 'Hiyori', 'Mao', 'Mark', 'Natori', 'Rice', 'Wanko', 'Yuino', 'DevilYuki'
  ];

  const handleSizeChange = (scale: number) => {
    // Size is now handled directly by Avatar component via window.avatar.setScale()
    // No need to resize the window anymore
  };

  // Listen for CTRL+M
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setShowActionBar(prev => !prev);
      }
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

  return (
    <div className="w-screen h-screen overflow-hidden bg-transparent">
      <Avatar modelName={selectedModel} uiOpen={showActionBar || isSettingsOpen} />
      <CodePopup />
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

      {/* Screen Share Indicator - Eye icon at bottom right */}
      {isScreenSharing && (
        <div 
          className="absolute bottom-4 right-4 z-[300] flex items-center gap-2 bg-blue-600/90 backdrop-blur-sm px-3 py-2 rounded-full shadow-lg animate-pulse"
          title="Yuki está olhando sua tela"
        >
          <span className="text-xl">👁️</span>
          {/* <span className="text-white text-sm font-medium">Olhando</span> */}
        </div>
      )}

      {/* Microphone Paused Indicator - Bottom left */}
      {isMicrophonePaused && (
        <div 
          className="absolute bottom-4 left-4 z-[300] flex items-center gap-2 bg-red-600/90 backdrop-blur-sm px-3 py-2 rounded-full shadow-lg animate-pulse"
          title="Microfone pausado (Ctrl+P para reativar)"
        >
          <span className="text-xl">🎤</span>
          <span className="text-white text-sm font-medium">Pausado</span>
        </div>
      )}

      {/* Avatar Reaction Disabled Indicator - Top left */}
      {isAvatarReactionDisabled && (
        <div 
          className="absolute top-4 left-4 z-[300] flex items-center gap-2 bg-orange-600/90 backdrop-blur-sm px-3 py-2 rounded-full shadow-lg animate-pulse"
          title="Reação do avatar desabilitada (Ctrl+O para reativar)"
        >
          <span className="text-xl">🤖</span>
          <span className="text-white text-sm font-medium">Sem Reação</span>
        </div>
      )}
    </div>
  );
}