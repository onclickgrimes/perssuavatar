import React from 'react';
import { FILMORA, MIN_ZOOM, MAX_ZOOM } from './constants';
import { Icons } from './Icons';

interface TimelineToolbarProps {
  zoomLevel: number;
  setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
}

export function TimelineToolbar({ zoomLevel, setZoomLevel, handleZoomIn, handleZoomOut }: TimelineToolbarProps) {
  return (
    <div className="flex items-center px-3 py-1 gap-0.5 border-t border-b" style={{ background: FILMORA.bgDark, borderColor: FILMORA.border }}>
      {[Icons.undo, Icons.redo, null, Icons.scissors, Icons.trash, null].map((icon, i) => 
        icon === null ? (
          <div key={`sep-${i}`} className="w-px h-4 mx-1" style={{ background: FILMORA.border }} />
        ) : (
          <button key={i} className="w-7 h-7 rounded flex items-center justify-center transition-colors hover:brightness-150" style={{ color: FILMORA.textDim }}>
            {icon}
          </button>
        )
      )}
      <div className="flex-1" />
      <div className="flex items-center gap-1.5">
        <button onClick={handleZoomOut} className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:brightness-150" style={{ color: FILMORA.textDim }}>
          {Icons.minus}
        </button>
        <div className="relative w-20 h-1 rounded-full cursor-pointer" style={{ background: FILMORA.border }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setZoomLevel(MIN_ZOOM + pct * (MAX_ZOOM - MIN_ZOOM));
          }}
        >
          <div className="absolute left-0 top-0 h-full rounded-full" style={{ background: FILMORA.accent, width: `${((zoomLevel - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%` }} />
          <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full" style={{ background: FILMORA.accent, left: `calc(${((zoomLevel - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}% - 5px)` }} />
        </div>
        <button onClick={handleZoomIn} className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:brightness-150" style={{ color: FILMORA.textDim }}>
          {Icons.plus}
        </button>
        <span className="text-[9px] font-mono ml-1 w-8 text-right" style={{ color: FILMORA.textDim }}>{Math.round(zoomLevel)}%</span>
      </div>
    </div>
  );
}
