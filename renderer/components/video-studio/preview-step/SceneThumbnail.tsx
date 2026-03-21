import React, { useEffect, useMemo, useRef } from 'react';

interface SceneThumbnailProps {
  imageUrl?: string;
  text: string;
  isVideo?: boolean;
  duration?: number;
}

// ========================================
// SCENE THUMBNAIL (LEVE PARA TIMELINE)
// ========================================
export function SceneThumbnail({ imageUrl, text, isVideo, duration }: SceneThumbnailProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const src = useMemo(() => {
    if (!imageUrl) return '';

    if (imageUrl.startsWith('http') || imageUrl.startsWith('blob:') || imageUrl.startsWith('data:')) {
      return imageUrl;
    }

    const filename = imageUrl.split(/[/\\]/).pop();
    return `http://localhost:9999/${filename}`;
  }, [imageUrl]);

  const isVideoAsset = !!src && (isVideo || /\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(src));

  useEffect(() => {
    if (!isVideoAsset || !videoRef.current) return;

    const video = videoRef.current;

    const handleLoadedMetadata = () => {
      const mediaDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : (duration || 0);
      const previewTime = mediaDuration > 0
        ? Math.min(Math.max(mediaDuration * 0.15, 0.05), Math.max(0, mediaDuration - 0.05))
        : 0.1;

      try {
        video.currentTime = previewTime;
        video.pause();
      } catch (_) {
        // no-op
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [isVideoAsset, duration, src]);

  if (!src) return null;

  if (isVideoAsset) {
    return (
      <div className="absolute inset-0 pointer-events-none">
        <video
          ref={videoRef}
          src={src}
          className="absolute inset-0 w-full h-full object-cover"
          preload="metadata"
          muted
          playsInline
        />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={text}
      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}
