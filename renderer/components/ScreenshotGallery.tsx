import React from 'react';

interface Screenshot {
  id: string;
  data: string; // Base64 image data
  timestamp: number;
}

interface ScreenshotGalleryProps {
  screenshots: Screenshot[];
  onRemove: (id: string) => void;
}

export default function ScreenshotGallery({ screenshots, onRemove }: ScreenshotGalleryProps) {
  if (screenshots.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-[10000] flex flex-col gap-3 pointer-events-auto max-h-[calc(100vh-2rem)] overflow-y-auto pr-2 custom-scrollbar">
      {screenshots.map((screenshot) => (
        <div
          key={screenshot.id}
          className="relative group animate-slideIn"
        >
          {/* Screenshot Card */}
          <div className="relative bg-gray-900/95 backdrop-blur-md rounded-lg shadow-2xl border border-gray-700/50 overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-blue-500/20">
            {/* Image */}
            <img
              src={screenshot.data}
              alt={`Screenshot ${screenshot.id}`}
              className="w-64 h-auto object-cover"
            />
            
            {/* Remove Button - X no canto superior direito */}
            <button
              onClick={() => onRemove(screenshot.id)}
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

            {/* Timestamp */}
            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded text-xs text-gray-300">
              {new Date(screenshot.timestamp).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
