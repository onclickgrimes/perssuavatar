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

  const handleSizeChange = (scale: number) => {
    // Base size is 1000x600 (from create-window.ts)
    // We can resize relative to that or just resize relative to current?
    // Let's assume base is 500x500 for the avatar view?
    // Actually, create-window sets 1000x600.
    // Let's resize based on a base size.
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
      
      <Avatar />
      <CodePopup />
      <Settings 
        onSizeChange={handleSizeChange}
        onDragToggle={setDragEnabled}
        onBackgroundToggle={setBgVisible}
      />
    </div>
  );
}