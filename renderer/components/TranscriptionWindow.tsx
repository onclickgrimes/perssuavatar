import React, { useState, useRef, useEffect } from 'react';

interface TranscriptionWindowProps {
  onClose?: () => void;
}

type TabMode = 'transcription' | 'summary';

type Message = {
  id: string;
  speaker: 'VOCÊ' | 'OUTROS';
  text: string;
  timestamp: Date;
};

export default function TranscriptionWindow({ onClose }: TranscriptionWindowProps = {}) {
  const [activeTab, setActiveTab] = useState<TabMode>('transcription');
  const [language, setLanguage] = useState('Portuguese (BR)');
  const [isPaused, setIsPaused] = useState(false);
  const [showAudioMeters, setShowAudioMeters] = useState(true);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', speaker: 'VOCÊ', text: 'Alô?', timestamp: new Date() },
    { id: '2', speaker: 'OUTROS', text: 'Alô?', timestamp: new Date() },
    { id: '3', speaker: 'VOCÊ', text: 'Eu quero saber quem é que transa nessa porra.', timestamp: new Date() },
    { id: '4', speaker: 'OUTROS', text: 'Como é que é?', timestamp: new Date() },
  ]);
  const [userAudioLevel, setUserAudioLevel] = useState(70);
  const [otherAudioLevel, setOtherAudioLevel] = useState(30);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isOverResizeHandle, setIsOverResizeHandle] = useState(false);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Simulate audio levels
  useEffect(() => {
    const interval = setInterval(() => {
      setUserAudioLevel(Math.random() * 100);
      setOtherAudioLevel(Math.random() * 100);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Click-through for transparent areas - usando uma abordagem mais estável
  useEffect(() => {
    // Estado inicial: permitir eventos do mouse
    window.electron?.setIgnoreMouseEvents?.(false);

    let isMouseOverWindow = false;

    const enableMouseEvents = () => {
      if (!isMouseOverWindow || isResizing || isOverResizeHandle) {
        isMouseOverWindow = true;
        window.electron?.setIgnoreMouseEvents?.(false);
      }
    };

    const disableMouseEvents = (e: MouseEvent) => {
      // Só desabilita se realmente saiu da janela e não está redimensionando ou sobre o handle
      if (!isResizing && !isOverResizeHandle && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const isOutside = 
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom;
        
        if (isOutside) {
          isMouseOverWindow = false;
          window.electron?.setIgnoreMouseEvents?.(true, { forward: true });
        }
      }
    };

    // Adicionar listeners nos elementos específicos
    const container = containerRef.current;

    if (container) {
      container.addEventListener('mouseenter', enableMouseEvents);
      container.addEventListener('mouseleave', disableMouseEvents as any);
    }

    return () => {
      if (container) {
        container.removeEventListener('mouseenter', enableMouseEvents);
        container.removeEventListener('mouseleave', disableMouseEvents as any);
      }
      // Restore mouse events on unmount
      window.electron?.setIgnoreMouseEvents?.(false);
    };
  }, [isResizing, isOverResizeHandle]);

  // Manual resize implementation
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsResizing(true);
    // Garantir que os eventos do mouse sejam capturados durante o resize
    window.electron?.setIgnoreMouseEvents?.(false);

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = window.innerWidth;
    const startHeight = window.innerHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const newWidth = Math.max(300, Math.min(startWidth + deltaX, window.screen.availWidth - 100));
      const newHeight = Math.max(300, Math.min(startHeight + deltaY, window.screen.availHeight - 100));

      window.electron?.resizeWindow?.(newWidth, newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else if (typeof window !== 'undefined' && window.close) {
      window.close();
    }
  };

  const handleStop = () => {
    handleClose();
  };

  return (
    <div className="w-full h-screen flex flex-col p-2">
      {/* Main Container */}
      <div ref={containerRef} className="flex-1 bg-[#0a0a0a] rounded-xl shadow-2xl border border-[#222] flex flex-col overflow-hidden relative">
        
        {/* Header */}
        <div 
          className="h-14 bg-[#0f0f0f] flex items-center justify-center px-2 sm:px-3 gap-2 sm:gap-3 flex-shrink-0 border-b border-[#222]"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          {/* Language Selector */}
          <div className="flex items-center flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <select 
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-[#1a1a1a] text-gray-300 text-xs px-2 sm:px-3 py-1.5 rounded-lg border border-[#2a2a2a] focus:outline-none cursor-pointer appearance-none pr-6 sm:pr-8 min-w-0"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 6px center'
              }}
            >
              <option>🇧🇷 Portuguese (BR)</option>
              <option>🇺🇸 English (US)</option>
              <option>🇪🇸 Spanish (ES)</option>
            </select>
          </div>

          {/* Tab Toggle - Transcription/Summary */}
          <div 
            className="flex items-center bg-[#1a1a1a] rounded-lg p-0.5 border border-[#2a2a2a] flex-1 max-w-[200px] min-w-0 overflow-hidden"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <button
              onClick={() => setActiveTab('transcription')}
              className={`flex-1 flex items-center justify-center px-1.5 sm:px-2 py-1 rounded text-xs font-medium transition-all min-w-0 ${
                activeTab === 'transcription'
                  ? 'bg-[#2a2a2a] text-white'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <span className="truncate">Transcrição</span>

            </button>
            <button
              onClick={() => setActiveTab('summary')}
              className={`flex-1 flex items-center justify-center px-1.5 sm:px-2 py-1 rounded text-xs font-medium transition-all min-w-0 ${
                activeTab === 'summary'
                  ? 'bg-[#2a2a2a] text-white'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <span className="truncate">Resumo</span>

            </button>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 sm:gap-1.5 bg-[#1a1a1a] rounded-lg px-1 sm:px-1.5 py-1 border border-[#2a2a2a] flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded hover:bg-[#252525] text-gray-400 hover:text-white transition-colors"
              title={isPaused ? 'Retomar' : 'Pausar'}
            >
              {isPaused ? (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              ) : (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
                </svg>
              )}
            </button>
            
            <button
              onClick={handleStop}
              className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded hover:bg-[#252525] bg-red-600/10 text-red-500 hover:text-red-400 transition-colors"
              title="Parar"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="5" width="14" height="14"/>
              </svg>
            </button>

            <button
              onClick={handleClose}
              className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded hover:bg-[#252525] text-gray-400 hover:text-white transition-colors"
              title="Fechar"
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 bg-black" style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#1a1a1a #0a0a0a'
        }}>
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.speaker === 'VOCÊ' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[85%] ${message.speaker === 'VOCÊ' ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                <span className={`text-[9px] font-semibold tracking-wide uppercase ${
                  message.speaker === 'VOCÊ' ? 'text-blue-400' : 'text-gray-500'
                }`}>
                  {message.speaker}
                </span>
                <div className={`px-2.5 py-1.5 rounded-md text-xs leading-snug ${
                  message.speaker === 'VOCÊ'
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#1f1f1f] text-white'
                }`}>
                  {message.text}
                </div>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Audio Meters Section */}
        <div className="border-t border-[#222] bg-[#0f0f0f] px-4 py-3 flex-shrink-0">
          {/* Header com Toggle */}
          <div className="flex items-center justify-center mb-3">
            <button
              onClick={() => setShowAudioMeters(!showAudioMeters)}
              className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] hover:bg-[#252525] rounded-full transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-gray-400">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
              <span className="text-xs font-medium text-white">Medidores de áudio</span>
              <span className="text-[10px] text-gray-500 ml-1">
                {showAudioMeters ? 'Clique para ocultar' : 'Clique para mostrar'}
              </span>
            </button>
          </div>

          {/* Audio Meters */}
          {showAudioMeters && (
            <div className="space-y-3">
              {/* User Audio Meter */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-semibold text-white w-14 uppercase tracking-wide">VOCÊ</span>
                <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-75"
                    style={{ 
                      width: `${userAudioLevel}%`,
                      background: 'linear-gradient(90deg, #06b6d4, #22d3ee)'
                    }}
                  />
                </div>
                <button className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
              </div>

              {/* Others Audio Meter */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-semibold text-white w-14 uppercase tracking-wide">OUTROS</span>
                <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-75"
                    style={{ 
                      width: `${otherAudioLevel}%`,
                      background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)'
                    }}
                  />
                </div>
                <button className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Resize Handle */}
        <div 
          ref={resizeHandleRef}
          onMouseDown={handleResizeStart}
          onMouseEnter={() => {
            setIsOverResizeHandle(true);
            // Garantir que os eventos sejam capturados quando sobre o resize handle
            window.electron?.setIgnoreMouseEvents?.(false);
          }}
          onMouseLeave={() => {
            setIsOverResizeHandle(false);
          }}
          className="absolute bottom-0 right-0 w-8 h-8 cursor-nwse-resize group z-50"
          style={{ 
            WebkitAppRegion: 'no-drag',
            // Adicionar uma área maior de hit-testing
            padding: '4px'
          } as React.CSSProperties}
        >
          <div className="absolute bottom-0.5 right-0.5 w-4 h-4 flex items-end justify-end pointer-events-none">
            <svg width="12" height="12" viewBox="0 0 16 16" className="text-gray-600 group-hover:text-gray-400 transition-colors">
              <path fill="currentColor" d="M16 0v16H0L16 0zM14 10l-4 4v-4h4zm0-4l-2 2H8l6-6v4z"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Floating Analyze Button */}
      <div className="flex justify-center mt-3">
        <button className="flex items-center gap-3 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all hover:scale-[1.02] font-medium text-sm">
          <span className="px-2.5 py-0.5 bg-blue-800 rounded text-white text-xs font-semibold">Ctrl+D</span>
          <span>Analisar Transcrição</span>
        </button>
      </div>
    </div>
  );
}
