import React from 'react';

// ========================================
// SCENE THUMBNAIL
// ========================================
export function SceneThumbnail({ imageUrl, text }: { imageUrl?: string; text: string }) {
  if (imageUrl) {
    let src = imageUrl;
    if (!src.startsWith('http') && !src.startsWith('blob:') && !src.startsWith('data:')) {
      const filename = src.split(/[/\\]/).pop();
      src = `http://localhost:9999/${filename}`;
    }
    return (
      <img 
        src={src} 
        alt={text}
        className="absolute inset-0 w-full h-full object-cover opacity-50"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  return null;
}
