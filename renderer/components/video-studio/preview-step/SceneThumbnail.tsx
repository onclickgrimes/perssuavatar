import React, { useEffect, useRef, useState } from 'react';

interface SceneThumbnailProps {
  imageUrl?: string;
  text: string;
  isVideo?: boolean;
  duration?: number;
}

// ========================================
// SCENE THUMBNAIL (COM FILMSTRIP DE VÍDEO)
// ========================================
export function SceneThumbnail({ imageUrl, text, isVideo, duration }: SceneThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [frameCount, setFrameCount] = useState(1);

  // Calcula quantos frames exibir baseado na largura do segmento na timeline
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      // Estima 1 frame a cada ~60 pixels de largura
      const count = Math.max(1, Math.ceil(width / 60));
      setFrameCount(count);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!imageUrl) return null;

  let src = imageUrl;
  if (!src.startsWith('http') && !src.startsWith('blob:') && !src.startsWith('data:')) {
    const filename = src.split(/[/\\]/).pop();
    src = `http://localhost:9999/${filename}`;
  }

  // Verifica se a mídia é um vídeo (passado por prop ou pela extensão do arquivo)
  const isVideoAsset = isVideo || /\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(src);

  if (isVideoAsset) {
    return (
      <div ref={containerRef} className="absolute inset-0 flex overflow-hidden pointer-events-none">
        {Array.from({ length: frameCount }).map((_, i) => {
          return (
            <div key={i} className="flex-1 h-full relative border-r border-black/20 last:border-0 min-w-[40px]">
              <video 
                src={src} 
                className="absolute inset-0 w-full h-full object-cover"
                preload="metadata"
                onLoadedMetadata={(e) => {
                  const video = e.currentTarget;
                  // Distribui o tempo dos frames ao longo da duração da mídia
                  const safeDuration = duration || video.duration || 5;
                  const time = (i / frameCount) * safeDuration;
                  if (!isNaN(time) && isFinite(time)) {
                    video.currentTime = time;
                  }
                }}
              />
            </div>
          );
        })}
      </div>
    );
  }

  // Fallback normal para Imagens
  return (
    <img 
      src={src} 
      alt={text}
      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}
