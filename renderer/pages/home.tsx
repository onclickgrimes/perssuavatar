import React, { useState } from 'react';
import Avatar from '../components/Avatar';
import CodePopup from '../components/CodePopup';
import Settings from '../components/Settings';
import { useMicrophone } from '../hooks/useMicrophone';

export default function HomePage() {
  // Initialize microphone
  useMicrophone();

  const [dragEnabled, setDragEnabled] = useState(true);
  const [bgVisible, setBgVisible] = useState(false);
  const [selectedModel, setSelectedModel] = useState('freeca');
  
  const models = [
    'freeca', 'Haru', 'Hiyori', 'Mao', 'Mark', 'Natori', 'Rice', 'Wanko', 'Yuino', '简'
  ];

  const handleSizeChange = (scale: number) => {
    // ...
    const baseWidth = 500;
    const baseHeight = 500;
    window.electron.resizeWindow(Math.round(baseWidth * scale), Math.round(baseHeight * scale));
  };

  return (
    <div className={`w-screen h-screen overflow-hidden ${bgVisible ? 'bg-gray-900/80' : 'bg-transparent'}`}>
      {/* Drag Handle */}
      {dragEnabled && (
        <div 
            className="absolute top-0 left-0 w-full h-full z-[50] cursor-move drag" 
            onMouseEnter={() => window.electron.setIgnoreMouseEvents(false)}
            onMouseLeave={() => window.electron.setIgnoreMouseEvents(true, { forward: true })}
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
      />
    </div>
  );
}