import React, { useState, useEffect, useRef } from 'react';

interface Screenshot {
  id: string;
  data: string;
  timestamp: number;
}

export default function ScreenshotGalleryPage() {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasHadScreenshots = useRef(false); // Track se já teve screenshots alguma vez

  // Listen for screenshot captured events
  useEffect(() => {
    const unsubscribe = window.electron.onScreenshotCaptured((base64Image: string) => {
      console.log('📸 Screenshot capturado na galeria');
      const newScreenshot: Screenshot = {
        id: `screenshot-${Date.now()}`,
        data: `data:image/png;base64,${base64Image}`,
        timestamp: Date.now()
      };
      
      setScreenshots(prev => [...prev, newScreenshot]);
      hasHadScreenshots.current = true; // Marca que já teve screenshots
      
      // Salvar no banco de dados
      window.electron.db.addScreenshot({
        base64Data: base64Image,
        context: 'User screenshot'
      }).catch(err => {
        console.error('Erro ao salvar screenshot no banco:', err);
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Remove screenshot
  const handleRemoveScreenshot = (id: string) => {
    setScreenshots(prev => prev.filter(s => s.id !== id));
    window.electron.db.deleteScreenshot(id).catch(err => {
      console.error('Erro ao deletar screenshot do banco:', err);
    });
  };

  // Update click-through based on content
  useEffect(() => {
    // Se não há screenshots, a janela toda deve ser click-through
    if (screenshots.length === 0) {
      window.electron.setIgnoreMouseEvents(true, { forward: true });
      
      // SÓ notificar para fechar se já teve screenshots antes
      // Evita fechar na primeira renderização (ainda sem screenshots)
      if (hasHadScreenshots.current) {
        console.log('📸 Última screenshot removida - notificando backend');
        if (window.electron.notifyScreenshotsEmpty) {
          window.electron.notifyScreenshotsEmpty();
        }
      }
    } else {
      // Se há screenshots, desabilita click-through para permitir interação
      window.electron.setIgnoreMouseEvents(false);
    }
  }, [screenshots]);

  // Handle mouse enter/leave on screenshots to manage click-through
  const handleMouseEnter = () => {
    window.electron.setIgnoreMouseEvents(false);
  };

  const handleMouseLeave = () => {
    // Verifica se o mouse ainda está sobre algum screenshot
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      window.electron.setIgnoreMouseEvents(true, { forward: true });
    }
  };

  if (screenshots.length === 0) {
    return <div className="w-screen h-screen bg-transparent" />;
  }

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden">
      <div 
        ref={containerRef}
        className="fixed top-4 right-4 flex flex-col gap-3 max-h-[calc(100vh-2rem)] overflow-y-auto pr-2 custom-scrollbar"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {screenshots.map((screenshot) => (
          <div
            key={screenshot.id}
            className="relative group animate-slideIn"
          >
            {/* Screenshot Card */}
            <div className="relative bg-gray-900/95 backdrop-blur-md rounded-lg shadow-2xl border border-gray-700/50 overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-blue-500/20 min-h-[60px]">
              {/* Image */}
              <img
                src={screenshot.data}
                alt={`Screenshot ${screenshot.id}`}
                className="w-64 h-auto object-cover"
                draggable={false}
              />
              
              {/* Remove Button - X no canto superior direito */}
              <button
                onClick={() => handleRemoveScreenshot(screenshot.id)}
                className="absolute top-2 right-2 w-8 h-8 bg-red-600/90 hover:bg-red-500 backdrop-blur-sm rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 shadow-lg"
                aria-label="Remover screenshot"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
