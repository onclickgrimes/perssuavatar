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

  // Share screenshot
  const handleShare = async (id: string, platform: 'whatsapp' | 'email' | 'drive') => {
    console.log(`📤 Compartilhando screenshot ${id} para ${platform}`);
    try {
      const result = await window.electron.invoke('share-screenshot', { platform });
      console.log('📤 Resultado do compartilhamento:', result);
      
      // Se você quiser exibir uma notificação ou feedback visual, pode adicionar aqui
      if (result.success) {
        console.log('✅ Screenshot compartilhado com sucesso!');
      } else {
        console.error('❌ Erro ao compartilhar:', result.message);
      }
    } catch (error) {
      console.error('❌ Erro ao compartilhar screenshot:', error);
    }
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
                className="absolute top-2 right-2 w-8 h-8 bg-red-600/90 hover:bg-red-500 backdrop-blur-sm rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 shadow-lg z-10"
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

              {/* Share Buttons - Abaixo da imagem */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-900/95 to-transparent p-3 flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {/* WhatsApp Button */}
                <button
                  onClick={() => handleShare(screenshot.id, 'whatsapp')}
                  className="w-9 h-9 bg-green-600/90 hover:bg-green-500 backdrop-blur-sm rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 shadow-lg"
                  aria-label="Compartilhar no WhatsApp"
                  title="WhatsApp"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                </button>

                {/* Email Button */}
                <button
                  onClick={() => handleShare(screenshot.id, 'email')}
                  className="w-9 h-9 bg-blue-600/90 hover:bg-blue-500 backdrop-blur-sm rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 shadow-lg"
                  aria-label="Enviar por Email"
                  title="Email"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                </button>

                {/* Google Drive Button */}
                <button
                  onClick={() => handleShare(screenshot.id, 'drive')}
                  className="w-9 h-9 bg-yellow-600/90 hover:bg-yellow-500 backdrop-blur-sm rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 shadow-lg"
                  aria-label="Salvar no Google Drive"
                  title="Google Drive"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                    <path d="M12.01 1.485l-8.5 14.715h3.99l4.51-7.815 4.502 7.815h3.99L12.01 1.485zm-9.76 17.03L6.74 23h10.519l4.49-4.485H2.25z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
