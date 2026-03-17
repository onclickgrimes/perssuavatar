import React, { useRef, useState } from 'react';
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

  // Tracks
  videoTrackCount: number;
  audioTrackCount: number;
  onAddVideoTrack: () => void;
  onAddAudioTrack: () => void;
  onFileUploadToTrack: (type: 'video' | 'audio', trackId: number, file: File) => void;
  onSegmentMove: (id: number, newStart: number, newTrack: number) => void;
  onSegmentTrim: (id: number, newStart: number, newEnd: number) => void;
  onAudioChange: (id: number, audio: any) => void;

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
  currentTimeRef: React.MutableRefObject<number>;
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
  
  videoTrackCount,
  audioTrackCount,
  onAddVideoTrack,
  onAddAudioTrack,
  onFileUploadToTrack,
  onSegmentMove,
  onSegmentTrim,
  onAudioChange,

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
  currentTimeRef,
}: TimelineProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUpload, setActiveUpload] = useState<{type: 'video'|'audio', trackId: number} | null>(null);

  const handleUploadClick = (type: 'video' | 'audio', trackId: number) => {
    setActiveUpload({ type, trackId });
    if (fileInputRef.current) {
      fileInputRef.current.accept = type === 'video' ? 'video/*,image/*' : 'audio/*';
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && activeUpload) {
      onFileUploadToTrack(activeUpload.type, activeUpload.trackId, e.target.files[0]);
    }
    setActiveUpload(null);
  };

  // Drag State for segments
  const [dragState, setDragState] = useState<{ 
    id: number; 
    startX: number; 
    startY: number;
    initialStart: number; 
    currentStart: number;
    initialTrack: number;
    currentTrack: number;
    type: 'video' | 'audio';
  } | null>(null);

  const getSnappedTime = (time: number, ignoreSegId: number) => {
    const snapThreshold = 10 / zoomLevel; // ~10 pixels visual threshold
    let closestTime = time;
    let minDiff = snapThreshold;

    const pointsToSnap: number[] = [];
    if (currentTimeRef && currentTimeRef.current !== undefined) {
      pointsToSnap.push(currentTimeRef.current);
    }
    visualSegments.forEach(seg => {
      if (seg.id !== ignoreSegId) {
        pointsToSnap.push(seg.start);
        pointsToSnap.push(seg.end);
      }
    });

    for (const point of pointsToSnap) {
      const diff = Math.abs(time - point);
      if (diff < minDiff) {
        minDiff = diff;
        closestTime = point;
      }
    }

    return closestTime;
  };

  const handleSegmentMouseDown = (e: React.MouseEvent, seg: any, type: 'video' | 'audio', currentTrackIndex: number) => {
    if (e.button !== 0) return; // Só permite clique esquerdo
    e.stopPropagation();
    e.preventDefault(); // Previne o drag-and-drop nativo do HTML5 que causa o ícone de proibido (🚫)
    setSelectedSegmentId(seg.id);
    const startX = e.clientX;
    const startY = e.clientY;
    const initialStart = seg.start;
    const initialTrack = currentTrackIndex;
    let currentStart = initialStart;
    let currentTrack = initialTrack;

    let hasMoved = false;

    const handleMouseMove = (mvEvent: MouseEvent) => {
      const deltaX = mvEvent.clientX - startX;
      const deltaY = mvEvent.clientY - startY;

      if (!hasMoved && Math.abs(deltaX) < 3 && Math.abs(deltaY) < 3) {
        return;
      }
      hasMoved = true;

      // Cálculo de X (Tempo) com Snapping
      let rawStart = initialStart + deltaX / zoomLevel;
      let rawEnd = rawStart + (seg.end - seg.start);

      const snappedStart = getSnappedTime(rawStart, seg.id);
      if (snappedStart !== rawStart) {
        rawStart = snappedStart;
      } else {
        const snappedEnd = getSnappedTime(rawEnd, seg.id);
        if (snappedEnd !== rawEnd) {
          rawStart = snappedEnd - (seg.end - seg.start);
        }
      }

      currentStart = Math.max(0, rawStart);

      // Cálculo de Y (Faixa/Track)
      // O deltaY será usado para ver quantos "blocos" de altura o mouse subiu ou desceu.
      // Altura da track de vídeo: 60px. Altura de track de áudio: 50px.
      const trackHeight = type === 'video' ? 60 : 50;
      const trackOffset = Math.round(deltaY / trackHeight);
      
      const maxTracks = type === 'video' ? videoTrackCount : audioTrackCount;
      if (type === 'video') {
        // V2 fica acima de V1 visualmente (arrastar pra baixo = deltaY > 0 = diminuir track index)
        currentTrack = Math.max(1, Math.min(maxTracks, initialTrack - trackOffset));
      } else {
        // A2 fica abaixo de A1 visualmente (arrastar pra baixo = deltaY > 0 = aumentar track index)
        currentTrack = Math.max(1, Math.min(maxTracks, initialTrack + trackOffset));
      }

      setDragState({ id: seg.id, startX, startY, initialStart, currentStart, initialTrack, currentTrack, type });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      
      setDragState(prev => {
        if (prev && (prev.currentStart !== prev.initialStart || prev.currentTrack !== prev.initialTrack)) {
          onSegmentMove(prev.id, prev.currentStart, prev.currentTrack);
        }
        return null;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Trim State
  const [trimState, setTrimState] = useState<{
    id: number;
    edge: 'left' | 'right';
    startX: number;
    initialStart: number;
    initialEnd: number;
    currentStart: number;
    currentEnd: number;
  } | null>(null);

  const handleTrimMouseDown = (e: React.MouseEvent, seg: any, edge: 'left' | 'right') => {
    if (e.button !== 0) return; // Só permite clique esquerdo
    e.stopPropagation();
    e.preventDefault(); // Previne o drag-and-drop nativo
    setSelectedSegmentId(seg.id);
    const startX = e.clientX;
    const initialStart = seg.start;
    const initialEnd = seg.end;
    let currentStart = initialStart;
    let currentEnd = initialEnd;

    let hasMoved = false;

    const handleMouseMove = (mvEvent: MouseEvent) => {
      const deltaX = mvEvent.clientX - startX;
      
      if (!hasMoved && Math.abs(deltaX) < 3) {
        return;
      }
      hasMoved = true;

      const deltaTime = deltaX / zoomLevel;

      if (edge === 'left') {
        const rawStart = initialStart + deltaTime;
        const snappedStart = getSnappedTime(rawStart, seg.id);
        currentStart = Math.min(initialEnd - 0.1, Math.max(0, snappedStart));
      } else {
        const rawEnd = initialEnd + deltaTime;
        const snappedEnd = getSnappedTime(rawEnd, seg.id);
        currentEnd = Math.max(initialStart + 0.1, snappedEnd);
      }
      setTrimState({
        id: seg.id, edge, startX, initialStart, initialEnd, currentStart, currentEnd
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      
      setTrimState(prev => {
        if (prev && (prev.currentStart !== prev.initialStart || prev.currentEnd !== prev.initialEnd)) {
          onSegmentTrim(prev.id, prev.currentStart, prev.currentEnd);
        }
        return null;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Fade handle logic
  const handleFadeMouseDown = (e: React.MouseEvent, seg: any, type: 'fadeIn' | 'fadeOut') => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const initialDuration = seg.audio?.[type] ?? 0;
    
    const handleMouseMove = (mvEvent: MouseEvent) => {
      const deltaX = mvEvent.clientX - startX;
      const deltaTime = deltaX / zoomLevel;
      // Para fadeIn, arrastar para a direita aumenta
      // Para fadeOut, arrastar para a esquerda aumenta (deltaX negativo)
      let newDuration = type === 'fadeIn' ? initialDuration + deltaTime : initialDuration - deltaTime;
      
      const maxFade = (seg.end - seg.start) / 2.1; // Limita a quase metade
      newDuration = Math.max(0, Math.min(newDuration, maxFade));
      
      onAudioChange(seg.id, { [type]: newDuration });
    };
    
    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const [showAddMenu, setShowAddMenu] = useState(false);

  return (
    <div className="flex-shrink-0 relative overflow-hidden" style={{ background: FILMORA.bgDarker, minHeight: '160px' }}>
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />

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
        <div className="flex-shrink-0 w-[100px] z-20" style={{ background: FILMORA.bgDark, borderRight: `1px solid ${FILMORA.border}` }}>
          <div className="h-[24px] border-b relative flex items-center px-1.5" style={{ borderColor: FILMORA.border }}>
             <button 
               className="text-[10px] bg-[#3B82F6]/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/40 w-[18px] h-[18px] rounded flex items-center justify-center transition-all"
               onClick={() => setShowAddMenu(!showAddMenu)}
               title="Adicionar Linha (De Vídeo ou Áudio)"
             >
               {Icons.plus}
             </button>
             {showAddMenu && (
               <>
                 <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
                 <div className="absolute top-[22px] left-1 bg-[#252528] border border-[#3e3e42] rounded shadow-2xl z-50 flex flex-col py-1 w-32">
                   <button className="text-left px-3 py-1.5 text-[10px] text-gray-300 hover:bg-white/10 hover:text-white transition-colors" onClick={() => { onAddVideoTrack(); setShowAddMenu(false); }}>
                      + Faixa de Vídeo
                   </button>
                   <button className="text-left px-3 py-1.5 text-[10px] text-gray-300 hover:bg-white/10 hover:text-white transition-colors" onClick={() => { onAddAudioTrack(); setShowAddMenu(false); }}>
                      + Faixa de Áudio
                   </button>
                 </div>
               </>
             )}
          </div>
          
          {/* Video Tracks */}
          {Array.from({ length: videoTrackCount }).reverse().map((_, i) => {
            const trackIndex = videoTrackCount - i;
            return (
              <div key={`vl-${trackIndex}`} className="h-[60px] flex items-center px-2 gap-1.5 border-b relative group" style={{ borderColor: `${FILMORA.border}80` }}>
                <div className="flex items-center gap-1" style={{ color: FILMORA.textDim }}>
                  {Icons.film}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[9px] font-semibold truncate" style={{ color: FILMORA.textMuted }}>V{trackIndex}</span>
                  <div className="flex gap-0.5 mt-0.5" style={{ color: FILMORA.textDim }}>
                    {Icons.lock}
                    {Icons.eye}
                  </div>
                </div>
                <button 
                  className="opacity-0 group-hover:opacity-100 absolute right-2 w-5 h-5 flex items-center justify-center rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 transition-all border border-blue-500/30"
                  title="Importar Mídia"
                  onClick={() => handleUploadClick('video', trackIndex)}
                >
                  {Icons.plus}
                </button>
              </div>
            );
          })}

          {/* Audio Tracks */}
          {Array.from({ length: audioTrackCount }).map((_, i) => {
            const trackIndex = i + 1;
            return (
              <div key={`al-${trackIndex}`} className="h-[50px] flex items-center px-2 gap-1.5 border-b relative group" style={{ borderColor: `${FILMORA.border}80` }}>
                <div className="flex items-center gap-1" style={{ color: FILMORA.textDim }}>
                  {Icons.music}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[9px] font-semibold truncate" style={{ color: FILMORA.textMuted }}>A{trackIndex}</span>
                  <div className="flex gap-0.5 mt-0.5" style={{ color: FILMORA.textDim }}>
                    {Icons.lock}
                    {Icons.eye}
                  </div>
                </div>
                <button 
                  className="opacity-0 group-hover:opacity-100 absolute right-2 w-5 h-5 flex items-center justify-center rounded bg-green-600/20 text-green-400 hover:bg-green-600/40 transition-all border border-green-500/30"
                  title="Importar Áudio"
                  onClick={() => handleUploadClick('audio', trackIndex)}
                >
                  {Icons.plus}
                </button>
              </div>
            );
          })}
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

            {/* ====== VIDEO TRACKS ====== */}
            {Array.from({ length: videoTrackCount }).reverse().map((_, i) => {
              const trackIndex = videoTrackCount - i;
              return (
              <div key={`v-${trackIndex}`} className="relative h-[60px] border-b" style={{ background: FILMORA.bgDarker, borderColor: `${FILMORA.border}60` }}>
                <div className="absolute inset-0 opacity-[0.02]" style={{
                  backgroundImage: `repeating-linear-gradient(90deg, white 0, white 1px, transparent 1px, transparent ${zoomLevel}px)`,
                  backgroundSize: `${zoomLevel}px 100%`
                }} />

                {visualSegments
                  .filter(s => !(s.assetType || '').startsWith('audio'))
                  .filter(s => {
                    const isDragging = dragState?.id === s.id;
                    const trackToRender = isDragging ? dragState.currentTrack : (s.track || 1);
                    return trackToRender === trackIndex;
                  })
                  .map((seg) => {
                  const isDragging = dragState?.id === seg.id;
                  const isTrimming = trimState?.id === seg.id;
                  
                  const computedStart = isTrimming ? trimState.currentStart : (isDragging ? dragState.currentStart : seg.start);
                  const computedEnd = isTrimming ? trimState.currentEnd : (isDragging ? dragState.currentStart + (seg.end - seg.start) : seg.end);
                  const duration = computedEnd - computedStart;
                  
                  const left = computedStart * zoomLevel;
                  const width = Math.max(4, duration * zoomLevel);
                  
                  const isVideo = (seg.assetType || '').startsWith('video');
                  const isSelected = selectedSegmentId === seg.id;
                  const trackColor = isVideo ? FILMORA.trackVideo : FILMORA.trackImage;

                  return (
                    <div
                      key={seg.id}
                      className={`absolute top-[3px] bottom-[3px] rounded-[3px] overflow-hidden cursor-pointer transition-shadow group/clip ${
                        isSelected ? 'z-10' : 'hover:z-10'
                      } ${isDragging || isTrimming ? 'opacity-80 z-20 scale-[1.05] shadow-2xl' : ''}`}
                      style={{ 
                        left, 
                        width,
                        background: `linear-gradient(180deg, ${trackColor}35 0%, ${trackColor}18 100%)`,
                        border: `1px solid ${isSelected ? trackColor : `${trackColor}40`}`,
                        boxShadow: isSelected ? `0 0 10px ${trackColor}30, inset 0 1px 0 ${trackColor}20` : 'none',
                      }}
                      onMouseDown={(e) => handleSegmentMouseDown(e, seg, 'video', trackIndex)}
                      onClick={(e) => e.stopPropagation()}
                      onMouseEnter={(e) => handleSegmentMouseEnter(e, seg.id)}
                      onMouseLeave={handleSegmentMouseLeave}
                    >
                      {/* BORDAS DE TRIM */}
                      {!isDragging && (
                        <>
                          <div 
                            className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize z-30 hover:bg-white/20 transition-colors"
                            onMouseDown={(e) => handleTrimMouseDown(e, seg, 'left')}
                          />
                          <div 
                            className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize z-30 hover:bg-white/20 transition-colors"
                            onMouseDown={(e) => handleTrimMouseDown(e, seg, 'right')}
                          />
                        </>
                      )}

                      <SceneThumbnail imageUrl={seg.imageUrl || seg.asset_url} text={seg.text} />
                      <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-black/40 pointer-events-none" />
                      <div className="absolute inset-0 flex items-center px-1.5 z-10 pointer-events-none">
                        <span className="text-[8px] font-medium truncate" style={{ color: '#ffffffcc' }}>
                          {seg.text}
                        </span>
                      </div>
                      
                      {/* FADE HANDLES (VIDEO) */}
                      {isSelected && (
                        <>
                          <div 
                            className="absolute top-0 left-0 w-3 h-3 cursor-alias z-40 flex items-center justify-center group/fade"
                            onMouseDown={(e) => handleFadeMouseDown(e, seg, 'fadeIn')}
                            title="Fade In"
                          >
                            <div className="w-1.5 h-1.5 bg-white rounded-full opacity-0 group-hover/fade:opacity-100 shadow-sm" />
                            <div 
                              className="absolute top-0 left-0 border-l-[12px] border-l-white/20 border-b-[12px] border-b-transparent pointer-events-none" 
                              style={{ width: (seg.audio?.fadeIn ?? 0) * zoomLevel }}
                            />
                          </div>
                          <div 
                            className="absolute top-0 right-0 w-3 h-3 cursor-alias z-40 flex items-center justify-center group/fade"
                            onMouseDown={(e) => handleFadeMouseDown(e, seg, 'fadeOut')}
                            title="Fade Out"
                          >
                            <div className="w-1.5 h-1.5 bg-white rounded-full opacity-0 group-hover/fade:opacity-100 shadow-sm" />
                            <div 
                              className="absolute top-0 right-0 border-r-[12px] border-r-white/20 border-b-[12px] border-b-transparent pointer-events-none" 
                              style={{ width: (seg.audio?.fadeOut ?? 0) * zoomLevel }}
                            />
                          </div>
                        </>
                      )}

                      <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none" style={{ background: trackColor }} />
                    </div>
                  );
                })}
              </div>
            )})}

            {/* ====== AUDIO TRACKS ====== */}
            {Array.from({ length: audioTrackCount }).map((_, i) => {
              const trackIndex = i + 1;
              return (
              <div key={`a-${trackIndex}`} className="relative h-[50px] border-b" style={{ background: FILMORA.bgDarker, borderColor: `${FILMORA.border}60` }}>
                <div className="absolute inset-0 opacity-[0.02]" style={{
                  backgroundImage: `repeating-linear-gradient(90deg, white 0, white 1px, transparent 1px, transparent ${zoomLevel}px)`,
                  backgroundSize: `${zoomLevel}px 100%`
                }} />

                {/* Se for a primeira faixa de áudio e tiver o audioUrl base do projeto */}
                {trackIndex === 1 && audioUrl && (
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
                        ♫ Base
                      </span>
                    </div>
                  </div>
                )}

                {/* Segmentos de áudio upados pra essa faixa */}
                {visualSegments
                  .filter(s => (s.assetType || '').startsWith('audio'))
                  .filter(s => {
                    const isDragging = dragState?.id === s.id;
                    const trackToRender = isDragging ? dragState.currentTrack : (s.track || 1);
                    return trackToRender === trackIndex;
                  })
                  .map((seg) => {
                  const isDragging = dragState?.id === seg.id;
                  const isTrimming = trimState?.id === seg.id;
                  
                  const computedStart = isTrimming ? trimState.currentStart : (isDragging ? dragState.currentStart : seg.start);
                  const computedEnd = isTrimming ? trimState.currentEnd : (isDragging ? dragState.currentStart + (seg.end - seg.start) : seg.end);
                  const duration = computedEnd - computedStart;

                  const left = computedStart * zoomLevel;
                  const width = Math.max(4, duration * zoomLevel);
                  const isSelected = selectedSegmentId === seg.id;
                  
                  return (
                    <div
                      key={seg.id}
                      className={`absolute top-[3px] bottom-[3px] rounded-[3px] overflow-hidden cursor-pointer transition-shadow group/clip ${
                        isSelected ? 'z-10' : 'hover:z-10'
                      } ${isDragging || isTrimming ? 'opacity-80 z-20 scale-[1.05] shadow-2xl' : ''}`}
                      style={{ 
                        left, 
                        width,
                        background: `linear-gradient(180deg, ${FILMORA.trackAudio}35 0%, ${FILMORA.trackAudio}18 100%)`,
                        border: `1px solid ${isSelected ? FILMORA.trackAudio : `${FILMORA.trackAudio}40`}`,
                        boxShadow: isSelected ? `0 0 10px ${FILMORA.trackAudio}30, inset 0 1px 0 ${FILMORA.trackAudio}20` : 'none',
                      }}
                      onMouseDown={(e) => handleSegmentMouseDown(e, seg, 'audio', trackIndex)}
                      onClick={(e) => e.stopPropagation()}
                      onMouseEnter={(e) => handleSegmentMouseEnter(e, seg.id)}
                      onMouseLeave={handleSegmentMouseLeave}
                    >
                      {/* BORDAS DE TRIM */}
                      {!isDragging && (
                        <>
                          <div 
                            className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize z-30 hover:bg-white/20 transition-colors"
                            onMouseDown={(e) => handleTrimMouseDown(e, seg, 'left')}
                          />
                          <div 
                            className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize z-30 hover:bg-white/20 transition-colors"
                            onMouseDown={(e) => handleTrimMouseDown(e, seg, 'right')}
                          />
                        </>
                      )}

                      <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-black/40 pointer-events-none" />
                      <div className="absolute inset-0 flex items-center px-1.5 z-10 pointer-events-none">
                        <span className="text-[8px] font-medium truncate" style={{ color: '#ffffffcc' }}>
                          ♫ {seg.text}
                        </span>
                      </div>

                      {/* FADE HANDLES (AUDIO) */}
                      {isSelected && (
                        <>
                          <div 
                            className="absolute top-0 left-0 w-3 h-3 cursor-alias z-40 flex items-center justify-center group/fade"
                            onMouseDown={(e) => handleFadeMouseDown(e, seg, 'fadeIn')}
                            title="Fade In"
                          >
                            <div className="w-1.5 h-1.5 bg-white rounded-full opacity-0 group-hover/fade:opacity-100 shadow-sm" />
                            <div 
                              className="absolute top-0 left-0 bg-white/20 h-full pointer-events-none" 
                              style={{ 
                                width: (seg.audio?.fadeIn ?? 0) * zoomLevel,
                                clipPath: 'polygon(0 0, 100% 100%, 0 100%)'
                              }}
                            />
                          </div>
                          <div 
                            className="absolute top-0 right-0 w-3 h-3 cursor-alias z-40 flex items-center justify-center group/fade"
                            onMouseDown={(e) => handleFadeMouseDown(e, seg, 'fadeOut')}
                            title="Fade Out"
                          >
                            <div className="w-1.5 h-1.5 bg-white rounded-full opacity-0 group-hover/fade:opacity-100 shadow-sm" />
                            <div 
                              className="absolute top-0 right-0 bg-white/20 h-full pointer-events-none" 
                              style={{ 
                                width: (seg.audio?.fadeOut ?? 0) * zoomLevel,
                                clipPath: 'polygon(100% 0, 100% 100%, 0 100%)'
                              }}
                            />
                          </div>
                        </>
                      )}

                      <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none" style={{ background: FILMORA.trackAudio }} />
                    </div>
                  );
                })}

                {trackIndex === 1 && !audioUrl && visualSegments.filter(s => (s.track || 1) === trackIndex && (s.assetType || '').startsWith('audio')).length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-[10px]" style={{ color: FILMORA.textDim }}>Sem áudio</span>
                  </div>
                )}
              </div>
            )})}

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
