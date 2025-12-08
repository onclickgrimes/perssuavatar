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
  const [bgVisible, setBgVisible] = useState(false);
  const [selectedModel, setSelectedModel] = useState('Yuki');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showActionBar, setShowActionBar] = useState(false);
  const isHoveringAvatarRef = useRef(false);
  
  const models = [
    'Yuki', 'Haru', 'Hiyori', 'Mao', 'Mark', 'Natori', 'Rice', 'Wanko', 'Yuino', 'DevilYuki'
  ];

  const handleSizeChange = (scale: number) => {
    // ...
    const baseWidth = 500;
    const baseHeight = 500;
    window.electron.resizeWindow(Math.round(baseWidth * scale), Math.round(baseHeight * scale));
  };

  // Listen for CTRL+M to toggle ActionBar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        // Toggle action bar only if mouse is over avatar area
        // Since the avatar takes full screen, we consider the user is hovering when the app is focused
        setShowActionBar(prev => !prev);
      }
      // ESC to close
      if (e.key === 'Escape' && showActionBar) {
        setShowActionBar(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showActionBar]);

  const handleOpenSettings = () => {
    window.electron.openSettings();
    setShowActionBar(false);
  };

  return (
    <div className={`w-screen h-screen overflow-hidden ${bgVisible ? 'bg-gray-900/80' : 'bg-transparent'}`}>
      {/* Drag Handle */}
      {dragEnabled && (
        <div 
            className="absolute top-0 left-0 w-full h-full z-[50] cursor-move drag" 
            onMouseEnter={() => {
              window.electron.setIgnoreMouseEvents(false);
              isHoveringAvatarRef.current = true;
            }}
            onMouseLeave={() => {
              window.electron.setIgnoreMouseEvents(true, { forward: true });
              isHoveringAvatarRef.current = false;
            }}
        />
      )}
      
      <Avatar modelName={selectedModel} />
      <CodePopup />
      <Settings 
        onSizeChange={handleSizeChange}
        onDragToggle={setDragEnabled}
        onBackgroundToggle={setBgVisible}
        models={models}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        onScreenShareChange={setIsScreenSharing}
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
    </div>
  );
}