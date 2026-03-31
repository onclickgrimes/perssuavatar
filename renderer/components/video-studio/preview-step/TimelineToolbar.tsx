import React from 'react';
import { FILMORA, MIN_ZOOM, MAX_ZOOM } from './constants';
import { Icons } from './Icons';

interface TimelineToolbarProps {
  zoomLevel: number;
  onZoomChange: (nextZoom: number) => void;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSplit: () => void;
  onDelete: () => void;
  canUndo: boolean;
  canRedo: boolean;
  canSplit: boolean;
  canDelete: boolean;
}

export function TimelineToolbar({ 
  zoomLevel, onZoomChange, handleZoomIn, handleZoomOut,
  onUndo, onRedo, onSplit, onDelete,
  canUndo, canRedo, canSplit, canDelete
}: TimelineToolbarProps) {
  return (
    <div className="flex items-center px-3 py-1 gap-0.5 border-t border-b" style={{ background: FILMORA.bgDark, borderColor: FILMORA.border }}>
      {[
        { icon: Icons.undo, onClick: onUndo, disabled: !canUndo },
        { icon: Icons.redo, onClick: onRedo, disabled: !canRedo },
        null,
        { icon: Icons.scissors, onClick: onSplit, disabled: !canSplit },
        { icon: Icons.trash, onClick: onDelete, disabled: !canDelete },
        null
      ].map((item, i) => 
        item === null ? (
          <div key={`sep-${i}`} className="w-px h-4 mx-1" style={{ background: FILMORA.border }} />
        ) : (
          <button 
            key={i} 
            onClick={item.onClick}
            disabled={item.disabled}
            className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${item.disabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/10'}`} 
            style={{ color: FILMORA.textDim }}
          >
            {item.icon}
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
            onZoomChange(MIN_ZOOM + pct * (MAX_ZOOM - MIN_ZOOM));
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
