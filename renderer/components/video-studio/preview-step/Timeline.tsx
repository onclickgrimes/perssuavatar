import React from 'react';
import { FILMORA, getRulerSteps, formatRulerTime, formatTimecode } from './constants';
import { Icons } from './Icons';
import { SceneThumbnail } from './SceneThumbnail';
import { AudioWaveformDisplay } from './AudioWaveformDisplay';

interface TimelineProps {
  // Data
  visualSegments: any[];
  durationInSeconds: number;
  audioUrl: string;
  zoomLevel: number;
  viewportWidth: number;
  totalTimelineWidth: number;
  selectedSegmentId: number | null;
  setSelectedSegmentId: (id: number | null) => void;

  // Hover
  hoveredSegment: { id: number; x: number; y: number } | null;
  hoveredSeg: any | null;
  handleSegmentMouseEnter: (e: React.MouseEvent, segId: number) => void;
  handleSegmentMouseLeave: () => void;

  // Events
  handleBackgroundClick: () => void;
  handleRulerMouseDown: (e: React.MouseEvent) => void;
  handlePlayheadMouseDown: (e: React.MouseEvent) => void;

  // Refs
  scrollWrapperRef: React.RefObject<HTMLDivElement>;
  trackContainerRef: React.RefObject<HTMLDivElement>;
  playheadRef: React.RefObject<HTMLDivElement>;
  playheadLabelRef: React.RefObject<HTMLDivElement>;
}

export function Timeline({
  visualSegments,
  durationInSeconds,
  audioUrl,
  zoomLevel,
  viewportWidth,
  totalTimelineWidth,
  selectedSegmentId,
  setSelectedSegmentId,
  hoveredSegment,
  hoveredSeg,
  handleSegmentMouseEnter,
  handleSegmentMouseLeave,
  handleBackgroundClick,
  handleRulerMouseDown,
  handlePlayheadMouseDown,
  scrollWrapperRef,
  trackContainerRef,
  playheadRef,
  playheadLabelRef,
}: TimelineProps) {
  return (
    <div className="flex-shrink-0 relative overflow-hidden" style={{ background: FILMORA.bgDarker, minHeight: '160px' }}>

      {/* Tooltip */}
      {hoveredSegment && hoveredSeg && (
        <div 
          className="fixed z-[100] backdrop-blur p-2.5 rounded shadow-2xl max-w-[260px] pointer-events-none"
          style={{ left: hoveredSegment.x + 15, top: hoveredSegment.y - 90, background: FILMORA.surface, border: `1px solid ${FILMORA.border}` }}
        >
          <p className="text-xs font-bold truncate mb-0.5" style={{ color: FILMORA.text }}>Cena {hoveredSeg.id}</p>
          <p className="text-[10px] mb-1.5 line-clamp-2" style={{ color: FILMORA.textMuted }}>{hoveredSeg.text}</p>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px]" style={{ color: FILMORA.textDim }}>
            <span>Início:</span><span className="text-right" style={{ color: FILMORA.textMuted }}>{hoveredSeg.start.toFixed(2)}s</span>
            <span>Fim:</span><span className="text-right" style={{ color: FILMORA.textMuted }}>{hoveredSeg.end.toFixed(2)}s</span>
            <span>Duração:</span><span className="text-right" style={{ color: FILMORA.textMuted }}>{(hoveredSeg.end - hoveredSeg.start).toFixed(2)}s</span>
            <span>Tipo:</span><span className="text-right" style={{ color: FILMORA.textMuted }}>{hoveredSeg.assetType || 'image_static'}</span>
          </div>
        </div>
      )}

      <div className="flex h-full">
        {/* Track Labels (esquerda fixa) */}
        <div className="flex-shrink-0 w-[80px] z-20" style={{ background: FILMORA.bgDark, borderRight: `1px solid ${FILMORA.border}` }}>
          <div className="h-[24px] border-b" style={{ borderColor: FILMORA.border }} />
          
          {/* Track 1: Video */}
          <div className="h-[60px] flex items-center px-2 gap-1.5 border-b" style={{ borderColor: `${FILMORA.border}80` }}>
            <div className="flex items-center gap-1" style={{ color: FILMORA.textDim }}>
              {Icons.film}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] font-semibold truncate" style={{ color: FILMORA.textMuted }}>V1</span>
              <div className="flex gap-0.5 mt-0.5" style={{ color: FILMORA.textDim }}>
                {Icons.lock}
                {Icons.eye}
              </div>
            </div>
          </div>

          {/* Track 2: Audio */}
          <div className="h-[50px] flex items-center px-2 gap-1.5" style={{ borderColor: `${FILMORA.border}80` }}>
            <div className="flex items-center gap-1" style={{ color: FILMORA.textDim }}>
              {Icons.music}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] font-semibold truncate" style={{ color: FILMORA.textMuted }}>A1</span>
              <div className="flex gap-0.5 mt-0.5" style={{ color: FILMORA.textDim }}>
                {Icons.lock}
                {Icons.eye}
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable timeline area */}
        <div 
          ref={scrollWrapperRef}
          className="relative flex-1 min-w-0 overflow-x-auto overflow-y-hidden filmora-scrollbar"
          onClick={handleBackgroundClick}
        >
          <div 
            className="relative"
            style={{ width: totalTimelineWidth }}
            ref={trackContainerRef}
          >
            {/* ====== RULER ====== */}
            <div 
              className="relative h-[24px] border-b cursor-text z-40"
              style={{ background: FILMORA.ruler, borderColor: FILMORA.border }}
              onMouseDown={handleRulerMouseDown}
              title="Clique para buscar / Arraste para zoom"
            >
              {(() => {
                const { major, minor } = getRulerSteps(zoomLevel);
                const maxTime = Math.ceil(Math.max(durationInSeconds, viewportWidth / zoomLevel));
                const markers: React.ReactNode[] = [];
                for (let time = 0; time <= maxTime; time += minor) {
                  const isMajor = Math.round(time * 10) % Math.round(major * 10) === 0;
                  markers.push(
                    <div 
                      key={time}
                      className="absolute bottom-0 pointer-events-none"
                      style={{ 
                        left: time * zoomLevel,
                        height: isMajor ? '100%' : '40%',
                        width: '1px',
                        background: isMajor ? FILMORA.borderLight : `${FILMORA.border}60`,
                      }}
                    >
                      {isMajor && (
                        <span className="absolute -top-[1px] -translate-x-1/2 text-[8px] font-mono select-none" style={{ color: FILMORA.rulerText }}>
                          {formatRulerTime(time)}
                        </span>
                      )}
                    </div>
                  );
                }
                return markers;
              })()}
            </div>

            {/* ====== VIDEO TRACK ====== */}
            <div className="relative h-[60px] border-b" style={{ background: FILMORA.bgDarker, borderColor: `${FILMORA.border}60` }}>
              <div className="absolute inset-0 opacity-[0.02]" style={{
                backgroundImage: `repeating-linear-gradient(90deg, white 0, white 1px, transparent 1px, transparent ${zoomLevel}px)`,
                backgroundSize: `${zoomLevel}px 100%`
              }} />

              {visualSegments.map((seg) => {
                const left = seg.start * zoomLevel;
                const width = Math.max(4, (seg.end - seg.start) * zoomLevel);
                const isVideo = (seg.assetType || '').startsWith('video');
                const isSelected = selectedSegmentId === seg.id;
                const trackColor = isVideo ? FILMORA.trackVideo : FILMORA.trackImage;

                return (
                  <div
                    key={seg.id}
                    className={`absolute top-[3px] bottom-[3px] rounded-[3px] overflow-hidden cursor-pointer transition-shadow group/clip ${
                      isSelected ? 'z-10' : 'hover:z-10'
                    }`}
                    style={{ 
                      left, 
                      width,
                      background: `linear-gradient(180deg, ${trackColor}35 0%, ${trackColor}18 100%)`,
                      border: `1px solid ${isSelected ? trackColor : `${trackColor}40`}`,
                      boxShadow: isSelected ? `0 0 10px ${trackColor}30, inset 0 1px 0 ${trackColor}20` : 'none',
                    }}
                    onClick={(e) => { e.stopPropagation(); setSelectedSegmentId(seg.id); }}
                    onMouseEnter={(e) => handleSegmentMouseEnter(e, seg.id)}
                    onMouseLeave={handleSegmentMouseLeave}
                  >
                    <SceneThumbnail imageUrl={seg.imageUrl || seg.asset_url} text={seg.text} />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-black/40" />
                    <div className="absolute inset-0 flex items-center px-1.5 z-10">
                      <span className="text-[8px] font-medium truncate" style={{ color: '#ffffffcc' }}>
                        {seg.text}
                      </span>
                    </div>
                    <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: trackColor }} />
                  </div>
                );
              })}
            </div>

            {/* ====== AUDIO TRACK ====== */}
            <div className="relative h-[50px]" style={{ background: FILMORA.bgDarker }}>
              <div className="absolute inset-0 opacity-[0.02]" style={{
                backgroundImage: `repeating-linear-gradient(90deg, white 0, white 1px, transparent 1px, transparent ${zoomLevel}px)`,
                backgroundSize: `${zoomLevel}px 100%`
              }} />

              {audioUrl && (
                <div 
                  className="absolute top-[3px] bottom-[3px] rounded-[3px] overflow-hidden"
                  style={{ 
                    left: 0, 
                    width: Math.max(4, durationInSeconds * zoomLevel),
                    background: `linear-gradient(180deg, ${FILMORA.trackAudio}25 0%, ${FILMORA.trackAudio}10 100%)`,
                    border: `1px solid ${FILMORA.trackAudio}40`,
                  }}
                >
                  <AudioWaveformDisplay 
                    audioUrl={audioUrl} 
                    color={FILMORA.trackAudio} 
                    duration={durationInSeconds} 
                    widthScale={zoomLevel} 
                  />
                  <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: FILMORA.trackAudio }} />
                  <div className="absolute top-1 left-1.5 z-10">
                    <span className="text-[7px] font-bold uppercase tracking-wider px-1 py-[1px] rounded-sm" 
                      style={{ background: `${FILMORA.trackAudio}40`, color: `${FILMORA.trackAudio}` }}>
                      ♫ Audio
                    </span>
                  </div>
                </div>
              )}

              {!audioUrl && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-[10px]" style={{ color: FILMORA.textDim }}>Sem áudio</span>
                </div>
              )}
            </div>

            {/* ====== PLAYHEAD ====== */}
            <div 
              ref={playheadRef}
              className="absolute top-0 w-[2px] z-50 pointer-events-none"
              style={{ 
                height: '100%', 
                transform: 'translateX(0px)',
                background: FILMORA.playhead,
                boxShadow: `0 0 6px ${FILMORA.playhead}60`,
              }}
            >
              <div 
                className="playhead-handle absolute -top-[0px] left-1/2 -translate-x-1/2 w-8 h-6 cursor-pointer flex items-start justify-center pointer-events-auto group/handle z-50"
                onMouseDown={handlePlayheadMouseDown}
              >
                <div className="flex flex-col items-center">
                  <div 
                    ref={playheadLabelRef} 
                    className="text-white text-[7px] font-bold font-mono px-1 py-[1px] rounded-t-sm shadow-md group-hover/handle:brightness-125 transition-all"
                    style={{ background: FILMORA.playhead }}
                  >
                    00:00:00:00
                  </div>
                  <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] drop-shadow-md"
                    style={{ borderTopColor: FILMORA.playhead }} />
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
