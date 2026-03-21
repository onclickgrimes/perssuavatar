import React from 'react';
import { FILMORA } from './constants';
import { Icons } from './Icons';
import { VideoPreviewPlayer } from '../VideoPreviewPlayer';

interface PlayerAreaProps {
  // Subtitle mode
  subtitleMode: 'paragraph' | 'word-by-word' | 'none';
  setSubtitleMode: (mode: 'paragraph' | 'word-by-word' | 'none') => void;
  setHasUnsavedChanges: (val: boolean) => void;

  // Aspect ratio
  selectedRatio: string;
  setSelectedRatio: (ratio: string) => void;
  currentRatios: string[];
  showRatioMenu: boolean;
  setShowRatioMenu: (val: boolean) => void;
  toggleAspectRatio: (ratio: string) => void;
  availableRatios: string[];

  // Player
  previewProject: any;
  durationInFrames: number;
  fps: number;
  handlePlayerReady: (player: any) => void;
  getCssAspectRatio: (ratio: string) => string;

  // Transport controls
  isPlaying: boolean;
  handleTogglePlay: () => void;
  handleStepForward: () => void;
  handleStepBackward: () => void;
  handleSkipToStart: () => void;
  handleSkipToEnd: () => void;
  handleProgressClick: (e: React.MouseEvent<HTMLDivElement>) => void;

  // Refs
  progressRef: React.RefObject<HTMLDivElement>;
  timecodeRef: React.RefObject<HTMLSpanElement>;
}

// ========================================
// PLAYER AREA (Centro) — Preview + Transport Controls
// ========================================
export function PlayerArea({
  subtitleMode,
  setSubtitleMode,
  setHasUnsavedChanges,
  selectedRatio,
  setSelectedRatio,
  currentRatios,
  showRatioMenu,
  setShowRatioMenu,
  toggleAspectRatio,
  availableRatios,
  previewProject,
  durationInFrames,
  fps,
  handlePlayerReady,
  getCssAspectRatio,
  isPlaying,
  handleTogglePlay,
  handleStepForward,
  handleStepBackward,
  handleSkipToStart,
  handleSkipToEnd,
  handleProgressClick,
  progressRef,
  timecodeRef,
}: PlayerAreaProps) {
  return (
    <div className="flex-1 flex flex-col min-w-0" style={{ background: '#000' }}>

      {/* Controles de Preview (subtítulo + aspect ratio) */}
      <div className="flex items-center justify-between px-4 py-2 gap-4 flex-wrap" style={{ background: FILMORA.bgDark, borderBottom: `1px solid ${FILMORA.border}` }}>
        {/* Modo de Legenda */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: FILMORA.textDim }}>Legenda</span>
          <div className="flex rounded overflow-hidden" style={{ border: `1px solid ${FILMORA.border}` }}>
            {(['paragraph', 'word-by-word', 'none'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => { setSubtitleMode(mode); setHasUnsavedChanges(true); }}
                className="px-2.5 py-1 text-[10px] font-medium transition-all"
                style={{
                  background: subtitleMode === mode ? FILMORA.accent : 'transparent',
                  color: subtitleMode === mode ? '#000' : FILMORA.textMuted,
                }}
              >
                {mode === 'paragraph' ? 'Parágrafo' : mode === 'word-by-word' ? 'Palavra' : 'Nenhuma'}
              </button>
            ))}
          </div>
        </div>

        {/* Aspect Ratio */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: FILMORA.textDim }}>Proporção</span>
          <div className="flex rounded" style={{ border: `1px solid ${FILMORA.border}` }}>
            {currentRatios.map(ratio => (
              <div key={ratio} className="relative group">
                <button
                  onClick={() => setSelectedRatio(ratio)}
                  className="px-2.5 py-1 text-[10px] font-medium transition-all"
                  style={{
                    background: selectedRatio === ratio ? FILMORA.accent : 'transparent',
                    color: selectedRatio === ratio ? '#000' : FILMORA.textMuted,
                    paddingRight: currentRatios.length > 1 ? '18px' : undefined,
                  }}
                >
                  {ratio}
                </button>
                {currentRatios.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleAspectRatio(ratio); }}
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 w-3 h-3 flex items-center justify-center rounded-full text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: FILMORA.textDim }}
                  >×</button>
                )}
              </div>
            ))}
            <div className="relative">
              <button
                onClick={() => setShowRatioMenu(!showRatioMenu)}
                className="px-2 py-1 text-[10px] transition-all"
                style={{ color: FILMORA.textDim }}
              >+</button>
              {showRatioMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowRatioMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-24 rounded shadow-xl z-20 overflow-hidden" style={{ background: FILMORA.surface, border: `1px solid ${FILMORA.border}` }}>
                    {availableRatios.filter(r => !currentRatios.includes(r)).map(ratio => (
                      <button
                        key={ratio}
                        onClick={() => { toggleAspectRatio(ratio); setShowRatioMenu(false); setSelectedRatio(ratio); }}
                        className="w-full text-left px-3 py-1.5 text-[10px] transition-colors hover:brightness-125"
                        style={{ color: FILMORA.textMuted }}
                      >{ratio}</button>
                    ))}
                    {availableRatios.every(r => currentRatios.includes(r)) && (
                      <div className="px-3 py-1.5 text-[9px] italic" style={{ color: FILMORA.textDim }}>Todas</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ====== VIDEO PLAYER ====== */}
      <div className="flex-1 flex items-center justify-center relative min-h-[200px]" style={{ background: '#000' }}>
        <div className="relative" style={{ 
          aspectRatio: getCssAspectRatio(selectedRatio),
          height: '100%',
          maxHeight: '100%',
          maxWidth: '100%',
        }}>
          <VideoPreviewPlayer
            project={previewProject}
            durationInFrames={durationInFrames}
            fps={fps}
            onPlayerReady={handlePlayerReady}
          />
        </div>
      </div>

      {/* ====== TRANSPORT CONTROLS (estilo Filmora) ====== */}
      <div className="flex items-center justify-between px-4 py-2" style={{ background: FILMORA.bgDark, borderTop: `1px solid ${FILMORA.border}` }}>
        {/* Progress bar */}
        <div className="flex-1 mr-4 cursor-pointer group" onClick={handleProgressClick}>
          <div className="relative h-1 rounded-full overflow-hidden" style={{ background: FILMORA.border }}>
            <div ref={progressRef} className="absolute left-0 top-0 h-full rounded-full transition-none" style={{ background: FILMORA.accent, width: 0 }} />
            <div className="absolute left-0 top-0 h-full w-full rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,212,170,0.15)' }} />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-1">
          <button onClick={handleSkipToStart} className="w-7 h-7 rounded flex items-center justify-center transition-colors" style={{ color: FILMORA.textMuted }} title="Início">
            {Icons.skipBack}
          </button>
          <button onClick={handleStepBackward} className="w-7 h-7 rounded flex items-center justify-center transition-colors" style={{ color: FILMORA.textMuted }} title="Frame anterior">
            {Icons.prevFrame}
          </button>
          <button onClick={handleTogglePlay} className="w-9 h-9 rounded-full flex items-center justify-center transition-all" style={{ background: FILMORA.accent, color: '#000' }} title={isPlaying ? 'Pausar' : 'Play'}>
            {isPlaying ? Icons.pause : Icons.play}
          </button>
          <button onClick={handleStepForward} className="w-7 h-7 rounded flex items-center justify-center transition-colors" style={{ color: FILMORA.textMuted }} title="Próximo frame">
            {Icons.nextFrame}
          </button>
          <button onClick={handleSkipToEnd} className="w-7 h-7 rounded flex items-center justify-center transition-colors" style={{ color: FILMORA.textMuted }} title="Fim">
            {Icons.skipForward}
          </button>
        </div>

        {/* Timecode */}
        <div className="ml-4 font-mono text-[11px] tabular-nums tracking-wide" style={{ color: FILMORA.textMuted }}>
          <span ref={timecodeRef} style={{ color: FILMORA.text }}>00:00:00:00</span>
        </div>
      </div>
    </div>
  );
}
