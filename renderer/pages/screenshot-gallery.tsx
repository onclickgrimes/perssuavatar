import React, { useState, useEffect, useRef } from 'react';

type MediaType = 'screenshot' | 'video';

interface MediaItem {
  id: string;
  type: MediaType;
  data?: string;        // base64 data for screenshots
  path?: string;        // file path for videos
  duration?: number;    // duration in seconds for videos
  timestamp: number;
}

export default function ScreenshotGalleryPage() {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasHadItems = useRef(false); // Track se já teve items alguma vez

  // Listen for screenshot captured events
  useEffect(() => {
    const unsubscribe = window.electron.onScreenshotCaptured((base64Image: string) => {
      console.log('📸 Screenshot capturado na galeria');
      const newItem: MediaItem = {
        id: `screenshot-${Date.now()}`,
        type: 'screenshot',
        data: `data:image/png;base64,${base64Image}`,
        timestamp: Date.now()
      };
      
      setMediaItems(prev => [...prev, newItem]);
      hasHadItems.current = true;
      
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

  // Listen for recording saved events
  useEffect(() => {
    const unsubscribe = window.electron.onRecordingSaved((data: { path: string, duration: number }) => {
      console.log('🎥 Gravação recebida na galeria:', data.path);
      const newItem: MediaItem = {
        id: `video-${Date.now()}`,
        type: 'video',
        path: data.path,
        duration: data.duration,
        timestamp: Date.now()
      };
      
      setMediaItems(prev => [...prev, newItem]);
      hasHadItems.current = true;
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Remove item (screenshot ou video)
  const handleRemoveItem = (id: string) => {
    const item = mediaItems.find(m => m.id === id);
    setMediaItems(prev => prev.filter(s => s.id !== id));
    
    // Deletar do banco baseado no tipo
    if (item?.type === 'screenshot') {
      window.electron.db.deleteScreenshot(id).catch(err => {
        console.error('Erro ao deletar screenshot do banco:', err);
      });
    } else if (item?.type === 'video') {
      window.electron.db.deleteRecording(id).catch(err => {
        console.error('Erro ao deletar gravação do banco:', err);
      });
    }
  };

  // Share item
  const handleShare = async (id: string, platform: 'whatsapp' | 'email' | 'drive') => {
    console.log(`📤 Compartilhando ${id} para ${platform}`);
    try {
      const result = await window.electron.invoke('share-screenshot', { platform });
      console.log('📤 Resultado do compartilhamento:', result);
      
      if (result.success) {
        console.log('✅ Compartilhado com sucesso!');
      } else {
        console.error('❌ Erro ao compartilhar:', result.message);
      }
    } catch (error) {
      console.error('❌ Erro ao compartilhar:', error);
    }
  };

  // Open video in default player
  const handleOpenVideo = (path: string) => {
    window.electron.invoke('shell-open-path', path).catch(err => {
      console.error('Erro ao abrir vídeo:', err);
    });
  };

  // Update click-through based on content
  useEffect(() => {
    if (mediaItems.length === 0) {
      window.electron.setIgnoreMouseEvents(true, { forward: true });
      
      if (hasHadItems.current) {
        console.log('📸 Galeria vazia - notificando backend');
        if (window.electron.notifyScreenshotsEmpty) {
          window.electron.notifyScreenshotsEmpty();
        }
      }
    } else {
      window.electron.setIgnoreMouseEvents(false);
    }
  }, [mediaItems]);

  // Handle mouse enter/leave
  const handleMouseEnter = () => {
    window.electron.setIgnoreMouseEvents(false);
  };

  const handleMouseLeave = () => {
    if (containerRef.current) {
      window.electron.setIgnoreMouseEvents(true, { forward: true });
    }
  };

  if (mediaItems.length === 0) {
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
        {mediaItems.map((item) => (
          <div
            key={item.id}
            className="relative group animate-slideIn"
          >
            {/* Media Card */}
            <div className="relative bg-gray-900/95 backdrop-blur-md rounded-lg shadow-2xl border border-gray-700/50 overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-blue-500/20 min-h-[60px]">
              
              {/* Renderização baseada no tipo */}
              {item.type === 'screenshot' ? (
                /* Screenshot: mostrar imagem */
                <img
                  src={item.data}
                  alt={`Screenshot ${item.id}`}
                  className="w-64 h-auto object-cover"
                  draggable={false}
                />
              ) : (
                /* Video: mostrar placeholder com ícone de play */
                <div 
                  className="w-64 h-36 bg-gradient-to-br from-purple-900/50 to-blue-900/50 flex flex-col items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => item.path && handleOpenVideo(item.path)}
                >
                  {/* Play Icon */}
                  <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mb-2">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                  </div>
                  {/* Duration */}
                  <span className="text-white/80 text-sm font-medium">
                    🎥 {item.duration ? `${item.duration}s` : 'Vídeo'}
                  </span>
                  {/* Filename */}
                  <span className="text-white/50 text-xs mt-1 px-2 truncate max-w-full">
                    {item.path?.split(/[\\/]/).pop()?.slice(0, 25)}
                  </span>
                </div>
              )}
              
              {/* Remove Button */}
              <button
                onClick={() => handleRemoveItem(item.id)}
                className="absolute top-2 right-2 w-8 h-8 bg-red-600/90 hover:bg-red-500 backdrop-blur-sm rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 shadow-lg z-10"
                aria-label="Remover item"
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

              {/* Type Badge */}
              <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                item.type === 'screenshot' 
                  ? 'bg-blue-500/80 text-white' 
                  : 'bg-purple-500/80 text-white'
              }`}>
                {item.type === 'screenshot' ? '📸' : '🎥'}
              </div>

              {/* Share Buttons */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-gray-900/95 to-transparent p-3 flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <button
                  onClick={() => handleShare(item.id, 'whatsapp')}
                  className="w-9 h-9 bg-green-600/90 hover:bg-green-500 backdrop-blur-sm rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 shadow-lg"
                  aria-label="Compartilhar no WhatsApp"
                  title="WhatsApp"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                </button>

                <button
                  onClick={() => handleShare(item.id, 'email')}
                  className="w-9 h-9 bg-blue-600/90 hover:bg-blue-500 backdrop-blur-sm rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 shadow-lg"
                  aria-label="Enviar por Email"
                  title="Email"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                </button>

                <button
                  onClick={() => handleShare(item.id, 'drive')}
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
