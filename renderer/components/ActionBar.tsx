import React from 'react';

interface ActionBarProps {
  isVisible: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}

export default function ActionBar({ isVisible, onClose, onOpenSettings }: ActionBarProps) {
  if (!isVisible) return null;

  return (
    <div 
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[500] flex flex-col items-center gap-2 no-drag font-sans"
      onMouseEnter={() => window.electron.setIgnoreMouseEvents(false)}
      onMouseLeave={() => window.electron.setIgnoreMouseEvents(true, { forward: true })}
    >
      {/* 1. Context Selector Button (Pílula Superior) */}
      <button className="flex items-center gap-2 bg-[#141414] hover:bg-[#1f1f1f] transition-colors rounded-full px-4 py-1.5 shadow-lg border border-[#2a2a2a]">
        {/* Intelligence Icon */}
        <div className="text-gray-400">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C7.58 2 4 5.58 4 10C4 12.91 5.6 15.46 8 16.82V19C8 19.55 8.45 20 9 20H15C15.55 20 16 19.55 16 19V16.82C18.4 15.46 20 12.91 20 10C20 5.58 16.42 2 12 2ZM12 11C11.45 11 11 10.55 11 10C11 9.45 11.45 9 12 9C12.55 9 13 9.45 13 10C13 10.55 12.55 11 12 11Z" opacity="0.8"/>
              <path d="M10 21H14V22H10V21Z" opacity="0.5"/>
           </svg>
        </div>
        
        {/* Text */}
        <span className="text-white text-sm font-medium">Sales Assistant</span>
        
        {/* Chevron Down */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-400 ml-1">
          <path d="M6 9L12 15L18 9" />
        </svg>
      </button>


      {/* 2. Main Action Bar */}
      <div className="flex items-center bg-[#141414] rounded-2xl p-1 shadow-2xl border border-[#2a2a2a] h-12">
        
        {/* A. Left Section (Tools & Navigation) */}
        <div className="flex items-center gap-1 px-2">
          {/* Drag Handle */}
          <div className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 p-1 mr-1 drag">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
               <path d="M5 9C6.10457 9 7 9.89543 7 11V13C7 14.1046 6.10457 15 5 15C3.89543 15 3 14.1046 3 13V11C3 9.89543 3.89543 9 5 9Z" />
               <path d="M12 9C13.1046 9 14 9.89543 14 11V13C14 14.1046 13.1046 15 12 15C10.8954 15 10 14.1046 10 13V11C10 9.89543 10.8954 9 12 9Z" />
               <path d="M19 9C20.1046 9 21 9.89543 21 11V13C21 14.1046 20.1046 15 19 15C17.8954 15 17 14.1046 17 13V11C17 9.89543 17.8954 9 19 9Z" />
            </svg>
          </div>

          {/* Settings Button */}
          <button 
            onClick={onOpenSettings}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#252525] hover:bg-[#333] text-gray-400 hover:text-white transition-all shadow-sm group"
            title="Configurações"
          >
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:rotate-90 transition-transform">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>

          {/* History Button */}
          <button 
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#252525] hover:bg-[#333] text-gray-400 hover:text-white transition-all shadow-sm"
            title="Histórico"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v4l3 3"></path>
              <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"></path>
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div className="w-[1px] h-6 bg-[#333] mx-1"></div>

        {/* B. Center Section (Input Placeholder) */}
        <div className="flex-1 flex items-center bg-[#1f1f1f] rounded-lg px-3 py-1.5 mx-2 h-9 border border-[#2a2a2a] min-w-[200px] cursor-text group">
          
          {/* Visual Keys */}
          <div className="flex items-center gap-1.5 mr-3 opacity-60 group-hover:opacity-80 transition-opacity">
            <div className="flex items-center justify-center px-1.5 h-5 bg-[#333] rounded text-[10px] font-bold text-gray-300 border-b border-[#111] shadow-[0_1px_0_rgba(0,0,0,0.5)]">
              Ctrl
            </div>
            <div className="flex items-center justify-center w-5 h-5 bg-[#333] rounded text-[10px] font-bold text-gray-300 border-b border-[#111] shadow-[0_1px_0_rgba(0,0,0,0.5)]">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 14l-4-4 4-4"/>
                  <path d="M5 10h11a4 4 0 1 1 0 8h-1"/>
              </svg>
            </div>
          </div>

          <span className="text-gray-400 text-sm font-medium">Perguntar</span>
        </div>

        {/* C. Right Section (Primary Action) */}
        <button className="h-10 ml-1 pl-3 pr-4 rounded-xl bg-[#0066FF] hover:bg-[#005ce6] text-white flex items-center gap-3 shadow-[0_0_15px_rgba(0,102,255,0.3)] transition-all transform hover:scale-[1.02] active:scale-[0.98]">
          <div className="flex items-center gap-1">
             <div className="flex items-center justify-center px-1.5 h-5 bg-[#3b87ff] rounded text-[10px] font-bold text-white border-b-2 border-[#004ec2] shadow-sm">
              Ctrl
            </div>
            <div className="flex items-center justify-center w-5 h-5 bg-[#3b87ff] rounded text-[10px] font-bold text-white border-b-2 border-[#004ec2] shadow-sm">
              D
            </div>
          </div>
          <span className="font-semibold text-sm tracking-wide">Começar a Ouvir</span>
        </button>

      </div>
    </div>
  );
}
