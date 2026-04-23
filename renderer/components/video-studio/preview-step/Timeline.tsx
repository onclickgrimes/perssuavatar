import React, { useMemo, useRef, useState } from 'react';
import { FILMORA, getRulerSteps, formatRulerTime } from './constants';
import { Icons } from './Icons';
import { SceneThumbnail } from './SceneThumbnail';
import { AudioWaveformDisplay } from './AudioWaveformDisplay';
import {
  getMotionGraphicsSegmentLabel,
  isMotionGraphicsSegment,
} from './motion-graphics/types';
import {
  type TimelineKeepRange,
} from '../../../../remotion/utils/silence-compaction';

interface TimelineProps {
  // Data
  visualSegments: any[];
  durationInSeconds: number;
  audioUrl: string;
  audioKeepRanges?: TimelineKeepRange[];
  selectedBaseAudioRangeKeys: string[];
  mutedBaseAudioRangeKeys: string[];
  onSelectedBaseAudioRangeKeysChange: (keys: string[]) => void;
  zoomLevel: number;
  viewportWidth: number;
  totalTimelineWidth: number;
  selectedSegmentIds: number[];
  setSelectedSegmentIds: React.Dispatch<React.SetStateAction<number[]>>;

  // Tracks
  videoTrackCount: number;
  audioTrackCount: number;
  onAddVideoTrack: () => void;
  onAddAudioTrack: () => void;
  onFileUploadToTrack: (type: 'video' | 'audio', trackId: number, file: File) => void;
  onLibraryMediaDrop?: (payload: {
    trackType: 'video' | 'audio';
    trackId: number;
    dropTime: number;
    media: {
      type?: 'video' | 'photo';
      directUrl?: string;
      duration?: number;
    };
  }) => void;
  onSegmentMove: (id: number, newStart: number, newTrack: number, options?: { pushHistory?: boolean }) => void;
  onSegmentTrim: (id: number, newStart: number, newEnd: number, options?: { pushHistory?: boolean }) => void;
  onAudioChange: (audio: any, options?: { pushHistory?: boolean }) => void;

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

const RANGE_OVERLAP_EPSILON = 0.0001;

const isAudioTimelineSegment = (segment: any): boolean => {
  const assetType = String(segment?.assetType || segment?.asset_type || '').toLowerCase();
  return assetType.startsWith('audio');
};

interface LibraryDragMediaPayload {
  source?: string;
  id?: number | string;
  type?: 'video' | 'photo';
  directUrl?: string;
  duration?: number;
}

const MEDIA_DRAG_MIME = 'application/x-video-studio-media';
const MEDIA_DRAG_MIME_FALLBACK = 'text/x-video-studio-media';
const MEDIA_DRAG_TEXT_PREFIX = 'video-studio-media:';

const isValidLibraryPayload = (payload: any): payload is LibraryDragMediaPayload => {
  return Boolean(
    payload
    && payload.source === 'pexels-media-panel'
    && typeof payload.directUrl === 'string'
    && payload.directUrl.trim().length > 0,
  );
};

const getGlobalLibraryDragPayload = (): LibraryDragMediaPayload | null => {
  const globalPayload = (window as any).__VIDEO_STUDIO_LIBRARY_DRAG_PAYLOAD__;
  if (isValidLibraryPayload(globalPayload)) {
    return globalPayload;
  }
  return null;
};

const parseLibraryDragPayload = (dataTransfer: DataTransfer | null): LibraryDragMediaPayload | null => {
  if (!dataTransfer) {
    return getGlobalLibraryDragPayload();
  }

  const rawCandidates = [
    dataTransfer.getData(MEDIA_DRAG_MIME),
    dataTransfer.getData(MEDIA_DRAG_MIME_FALLBACK),
  ].filter(Boolean);

  const plainTextPayload = dataTransfer.getData('text/plain');
  if (plainTextPayload && plainTextPayload.startsWith(MEDIA_DRAG_TEXT_PREFIX)) {
    const encodedPayload = plainTextPayload.slice(MEDIA_DRAG_TEXT_PREFIX.length);
    try {
      rawCandidates.push(decodeURIComponent(encodedPayload));
    } catch (_) {
      // ignore malformed encoded payload
    }
  }

  for (const rawPayload of rawCandidates) {
    try {
      const parsed = JSON.parse(rawPayload);
      if (isValidLibraryPayload(parsed)) {
        return parsed;
      }
    } catch (_) {
      // ignore malformed payload
    }
  }

  const globalFallback = getGlobalLibraryDragPayload();
  if (globalFallback) return globalFallback;

  if (plainTextPayload && /^https?:\/\//i.test(plainTextPayload.trim())) {
    return {
      source: 'pexels-media-panel',
      type: 'video',
      directUrl: plainTextPayload.trim(),
    };
  }

  return null;
};

export function Timeline({
  visualSegments,
  durationInSeconds,
  audioUrl,
  audioKeepRanges,
  selectedBaseAudioRangeKeys,
  mutedBaseAudioRangeKeys,
  onSelectedBaseAudioRangeKeysChange,
  zoomLevel,
  viewportWidth,
  totalTimelineWidth,
  selectedSegmentIds,
  setSelectedSegmentIds,
  
  videoTrackCount,
  audioTrackCount,
  onAddVideoTrack,
  onAddAudioTrack,
  onFileUploadToTrack,
  onLibraryMediaDrop,
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
  const labelsScrollRef = useRef<HTMLDivElement>(null);
  const [activeUpload, setActiveUpload] = useState<{type: 'video'|'audio', trackId: number} | null>(null);
  const selectedBaseAudioRangeKeySet = useMemo(
    () => new Set(selectedBaseAudioRangeKeys),
    [selectedBaseAudioRangeKeys],
  );
  const mutedBaseAudioRangeKeySet = useMemo(
    () => new Set(mutedBaseAudioRangeKeys),
    [mutedBaseAudioRangeKeys],
  );
  const hasCompactedBaseRanges = Array.isArray(audioKeepRanges) && audioKeepRanges.length > 0;

  const baseAudioRanges = useMemo(() => {
    if (!Array.isArray(audioKeepRanges) || audioKeepRanges.length === 0) {
      return [];
    }

    return audioKeepRanges
      .map((range, index) => {
        const outputStart = Number(range.outputStart || 0);
        const outputEnd = Number(range.outputEnd || outputStart);
        const duration = Math.max(0, outputEnd - outputStart);

        return {
          ...range,
          key: `${Number(range.sourceStart || 0).toFixed(4)}|${Number(range.sourceEnd || 0).toFixed(4)}|${Number(range.outputStart || 0).toFixed(4)}|${Number(range.outputEnd || 0).toFixed(4)}`,
          duration,
        };
      })
      .filter((range) => range.duration > RANGE_OVERLAP_EPSILON)
      .filter((range) => !mutedBaseAudioRangeKeySet.has(range.key));
  }, [audioKeepRanges, mutedBaseAudioRangeKeySet]);

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

  // Marquee Selection State
  const [marqueeSelection, setMarqueeSelection] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [libraryDropTarget, setLibraryDropTarget] = useState<{ trackType: 'video' | 'audio'; trackId: number } | null>(null);

  const hasLibraryDragType = (dataTransfer: DataTransfer | null) => {
    if (!dataTransfer) return false;
    const types = Array.from(dataTransfer.types || []);
    return (
      types.includes(MEDIA_DRAG_MIME)
      || types.includes(MEDIA_DRAG_MIME_FALLBACK)
      || types.includes('text/plain')
    );
  };

  const canDropLibraryMediaOnTrack = (
    payload: LibraryDragMediaPayload | null,
    trackType: 'video' | 'audio',
    dataTransfer?: DataTransfer | null,
  ) => {
    if (trackType !== 'video') return false;
    if (!payload) return hasLibraryDragType(dataTransfer || null);
    return payload.type === 'video' || payload.type === 'photo';
  };

  const handleTrackDragOver = (event: React.DragEvent, trackType: 'video' | 'audio', trackId: number) => {
    const payload = parseLibraryDragPayload(event.dataTransfer);
    if (!canDropLibraryMediaOnTrack(payload, trackType, event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setLibraryDropTarget((prev) => (
      prev?.trackType === trackType && prev?.trackId === trackId
        ? prev
        : { trackType, trackId }
    ));
  };

  const handleTrackDragLeave = (event: React.DragEvent, trackType: 'video' | 'audio', trackId: number) => {
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
      return;
    }

    setLibraryDropTarget((prev) => (
      prev?.trackType === trackType && prev?.trackId === trackId ? null : prev
    ));
  };

  const handleTrackDrop = (event: React.DragEvent, trackType: 'video' | 'audio', trackId: number) => {
    const payload = parseLibraryDragPayload(event.dataTransfer);
    if (!canDropLibraryMediaOnTrack(payload, trackType, event.dataTransfer)) {
      setLibraryDropTarget(null);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setLibraryDropTarget(null);

    onLibraryMediaDrop?.({
      trackType,
      trackId,
      dropTime: Number(currentTimeRef.current || 0),
      media: {
        type: payload?.type,
        directUrl: payload?.directUrl,
        duration: payload?.duration,
      },
    });
  };

  const handleTimelineMouseDown = (e: React.MouseEvent) => {
    // Apenas se clicar no fundo (não em um segmento)
    if (e.currentTarget !== e.target && !(e.target as HTMLElement).classList.contains('track-background')) return;
    if (e.button !== 0) return;
    e.preventDefault(); // Impede seleção de texto nativa do navegador

    const rect = trackContainerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    setMarqueeSelection({
      startX,
      startY,
      currentX: startX,
      currentY: startY,
    });

    const isMultiSelect = e.ctrlKey || e.metaKey;
    if (!isMultiSelect) {
      setSelectedSegmentIds([]);
      onSelectedBaseAudioRangeKeysChange([]);
    }

    let latestClientX = e.clientX;
    let latestClientY = e.clientY;
    let autoScrollFrame: number | null = null;

    const updateSelection = (clientX: number, clientY: number) => {
      latestClientX = clientX;
      latestClientY = clientY;

      const wrapper = scrollWrapperRef.current;
      const container = trackContainerRef.current;
      if (!wrapper || !container) return;

      const containerRect = container.getBoundingClientRect();
      const currentX = clientX - containerRect.left;
      const currentY = clientY - containerRect.top;

      setMarqueeSelection({
        startX,
        startY,
        currentX,
        currentY,
      });

      const left = Math.min(startX, currentX);
      const right = Math.max(startX, currentX);
      const top = Math.min(startY, currentY);
      const bottom = Math.max(startY, currentY);

      const newlySelectedIds: number[] = [];

      visualSegments.forEach(seg => {
        const segStart = seg.start * zoomLevel;
        const segEnd = seg.end * zoomLevel;
        const isAudio = isAudioTimelineSegment(seg);
        
        let trackTop = 0;
        let trackBottom = 0;

        if (!isAudio) {
          // Video tracks are h-[60px] starting after Ruler (24px)
          // They are rendered as reverse: V2, V1...
          const videoTrackIndex = seg.track || 1;
          const displayIndex = videoTrackCount - videoTrackIndex;
          trackTop = 24 + displayIndex * 60;
          trackBottom = trackTop + 60;
        } else {
          // Audio tracks are h-[50px] starting after all Video tracks
          const audioTrackIndex = seg.track || 1;
          const displayIndex = audioTrackIndex - 1;
          trackTop = 24 + videoTrackCount * 60 + displayIndex * 50;
          trackBottom = trackTop + 50;
        }

        const horizontalOverlap = left < segEnd && right > segStart;
        const verticalOverlap = top < trackBottom && bottom > trackTop;

        if (horizontalOverlap && verticalOverlap) {
          newlySelectedIds.push(seg.id);
        }
      });

      if (isMultiSelect) {
        setSelectedSegmentIds(prev => {
          const combined = new Set([...prev, ...newlySelectedIds]);
          return Array.from(combined);
        });
      } else {
        setSelectedSegmentIds(newlySelectedIds);
      }
    };

    const stopAutoScroll = () => {
      if (autoScrollFrame !== null) {
        cancelAnimationFrame(autoScrollFrame);
        autoScrollFrame = null;
      }
    };

    const startAutoScroll = () => {
      if (autoScrollFrame !== null) return;

      const tick = () => {
        const wrapper = scrollWrapperRef.current;
        if (!wrapper) {
          autoScrollFrame = null;
          return;
        }

        const wrapperRect = wrapper.getBoundingClientRect();
        const edgeThreshold = 48;
        let deltaX = 0;

        if (latestClientX < wrapperRect.left + edgeThreshold) {
          deltaX = latestClientX - (wrapperRect.left + edgeThreshold);
        } else if (latestClientX > wrapperRect.right - edgeThreshold) {
          deltaX = latestClientX - (wrapperRect.right - edgeThreshold);
        }

        if (deltaX !== 0) {
          const maxStep = 24;
          const scrollStep = Math.max(-maxStep, Math.min(maxStep, deltaX * 0.35));
          const maxScrollLeft = wrapper.scrollWidth - wrapper.clientWidth;
          const nextScrollLeft = Math.max(0, Math.min(wrapper.scrollLeft + scrollStep, maxScrollLeft));

          if (nextScrollLeft !== wrapper.scrollLeft) {
            wrapper.scrollLeft = nextScrollLeft;
            updateSelection(latestClientX, latestClientY);
          }
        }

        autoScrollFrame = requestAnimationFrame(tick);
      };

      autoScrollFrame = requestAnimationFrame(tick);
    };

    const handleMouseMove = (mvEvent: MouseEvent) => {
      updateSelection(mvEvent.clientX, mvEvent.clientY);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      setMarqueeSelection(null);
      stopAutoScroll();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      // Se não arrastou quase nada, tratar como um clique simples no fundo
      const deltaX = Math.abs(upEvent.clientX - (startX + rect.left));
      const deltaY = Math.abs(upEvent.clientY - (startY + rect.top));
      if (deltaX < 3 && deltaY < 3) {
        onSelectedBaseAudioRangeKeysChange([]);
        handleBackgroundClick();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    startAutoScroll();
  };

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
    handleSegmentMouseLeave();
    if (e.button !== 0) return; // Só permite clique esquerdo
    e.stopPropagation();
    e.preventDefault(); // Previne o drag-and-drop nativo do HTML5 que causa o ícone de proibido (🚫)
    onSelectedBaseAudioRangeKeysChange([]);
    // Lógica de Multi-seleção
    setSelectedSegmentIds(prev => {
      if (e.ctrlKey || e.metaKey) {
        // Se já está selecionado, remove. Se não, adiciona.
        return prev.includes(seg.id) ? prev.filter(id => id !== seg.id) : [...prev, seg.id];
      }
      // Se não segurou Ctrl/Cmd, e clicou num item que não está selecionado, seleciona só ele.
      // Se clicou num item já selecionado, mantém a seleção múltipla para permitir arrastar todos.
      return prev.includes(seg.id) ? prev : [seg.id];
    });
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

      if (currentStart !== initialStart || currentTrack !== initialTrack) {
        onSegmentMove(seg.id, currentStart, currentTrack, { pushHistory: true });
      }
      setDragState(null);
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
    currentMouseX?: number;
    currentMouseY?: number;
  } | null>(null);

  const handleTrimMouseDown = (e: React.MouseEvent, seg: any, edge: 'left' | 'right') => {
    handleSegmentMouseLeave(); // Garante que o tooltip de hover suma ao clicar
    if (e.button !== 0) return; // Só permite clique esquerdo
    e.stopPropagation();
    e.preventDefault(); // Previne o drag-and-drop nativo
    onSelectedBaseAudioRangeKeysChange([]);
    setSelectedSegmentIds(prev => prev.includes(seg.id) ? prev : [seg.id]);
    
    const startX = e.clientX;
    const initialStart = seg.start;
    const initialEnd = seg.end;
    let currentStart = initialStart;
    let currentEnd = initialEnd;

    let hasMoved = false;

    // Inicializa o estado para o tooltip já aparecer no clique
    setTrimState({
      id: seg.id, edge, startX, initialStart, initialEnd, currentStart, currentEnd,
      currentMouseX: e.clientX,
      currentMouseY: e.clientY
    });

    const handleMouseMove = (mvEvent: MouseEvent) => {
      const deltaX = mvEvent.clientX - startX;
      
      if (!hasMoved && Math.abs(deltaX) < 3) {
        // Se mexeu muito pouco, apenas atualiza a posição do mouse no tooltip
        setTrimState(prev => prev ? { ...prev, currentMouseX: mvEvent.clientX, currentMouseY: mvEvent.clientY } : null);
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
        id: seg.id, edge, startX, initialStart, initialEnd, currentStart, currentEnd,
        currentMouseX: mvEvent.clientX,
        currentMouseY: mvEvent.clientY
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      if (currentStart !== initialStart || currentEnd !== initialEnd) {
        onSegmentTrim(seg.id, currentStart, currentEnd, { pushHistory: true });
      }
      setTrimState(null);
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
    let currentDuration = initialDuration;
    let hasMoved = false;
    
    const handleMouseMove = (mvEvent: MouseEvent) => {
      const deltaX = mvEvent.clientX - startX;
      const deltaTime = deltaX / zoomLevel;
      // Para fadeIn, arrastar para a direita aumenta
      // Para fadeOut, arrastar para a esquerda aumenta (deltaX negativo)
      let newDuration = type === 'fadeIn' ? initialDuration + deltaTime : initialDuration - deltaTime;
      
      const maxFade = (seg.end - seg.start) / 2.1; // Limita a quase metade
      newDuration = Math.max(0, Math.min(newDuration, maxFade));

      currentDuration = newDuration;
      hasMoved = true;
      onAudioChange({ [type]: newDuration }, { pushHistory: false });
    };
    
    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      if (hasMoved && Math.abs(currentDuration - initialDuration) > 0.0001) {
        onAudioChange({ [type]: currentDuration }, { pushHistory: true });
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const [showAddMenu, setShowAddMenu] = useState(false);

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden select-none h-full" style={{ background: FILMORA.bgDarker }}>
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />

      {/* Tooltip */}
      {hoveredSegment && hoveredSeg && (
        <div 
          className="fixed z-[100] backdrop-blur p-2.5 rounded shadow-2xl max-w-[260px] pointer-events-none"
          style={{ left: hoveredSegment.x + 15, top: hoveredSegment.y - 90, background: FILMORA.surface, border: `1px solid ${FILMORA.border}` }}
        >
          <p className="text-xs font-bold truncate mb-0.5" style={{ color: FILMORA.text }}>Cena {hoveredSeg.id}</p>
          <p className="text-[10px] mb-1.5 line-clamp-2" style={{ color: FILMORA.textMuted }}>
            {isMotionGraphicsSegment(hoveredSeg)
              ? getMotionGraphicsSegmentLabel(hoveredSeg)
              : hoveredSeg.fileName || hoveredSeg.text || 'Sem texto'}
          </p>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px]" style={{ color: FILMORA.textDim }}>
            <span>Início:</span><span className="text-right" style={{ color: FILMORA.textMuted }}>{hoveredSeg.start.toFixed(2)}s</span>
            <span>Fim:</span><span className="text-right" style={{ color: FILMORA.textMuted }}>{hoveredSeg.end.toFixed(2)}s</span>
            <span>Duração:</span><span className="text-right" style={{ color: FILMORA.textMuted }}>{(hoveredSeg.end - hoveredSeg.start).toFixed(2)}s</span>
            <span>Tipo:</span><span className="text-right" style={{ color: FILMORA.textMuted }}>{hoveredSeg.assetType || 'image_static'}</span>
          </div>
        </div>
      )}

      {/* Tooltip de Trim (Acompanha o mouse ao redimensionar a mídia) */}
      {trimState && trimState.currentMouseX && trimState.currentMouseY && (
        <div 
          className="fixed z-[120] backdrop-blur p-2 rounded shadow-2xl pointer-events-none flex flex-col items-center justify-center min-w-[120px]"
          style={{ 
            left: trimState.currentMouseX, 
            top: trimState.currentMouseY - 65, 
            transform: 'translateX(-50%)',
            background: FILMORA.bgDark, 
            border: `1px solid ${FILMORA.border}` 
          }}
        >
          <div className="text-[11px] font-bold" style={{ color: FILMORA.text }}>
            Duração: {(trimState.currentEnd - trimState.currentStart).toFixed(2)}s
          </div>
          <div className="text-[9px] mt-0.5" style={{ color: FILMORA.textMuted }}>
            Início: {trimState.currentStart.toFixed(2)}s | Fim: {trimState.currentEnd.toFixed(2)}s
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Track Labels (esquerda fixa) */}
        <div 
          ref={labelsScrollRef}
          className="flex-shrink-0 w-[100px] z-20 overflow-hidden" 
          style={{ background: FILMORA.bgDark, borderRight: `1px solid ${FILMORA.border}` }}
        >
          <div className="h-[24px] sticky top-0 bg-[#1e1e1e] border-b flex items-center px-1.5 z-30" style={{ borderColor: FILMORA.border }}>
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
          className="relative flex-1 min-w-0 overflow-auto filmora-scrollbar"
          onScroll={(e) => {
            if (labelsScrollRef.current) {
              labelsScrollRef.current.scrollTop = e.currentTarget.scrollTop;
            }
          }}
        >
          <div 
            className="relative"
            style={{ width: totalTimelineWidth }}
            ref={trackContainerRef}
            onMouseDown={handleTimelineMouseDown}
          >
            {/* MARQUEE SELECTION BOX */}
            {marqueeSelection && (
              <div 
                className="absolute z-[60] border border-blue-500 bg-blue-500/20 pointer-events-none"
                style={{
                  left: Math.min(marqueeSelection.startX, marqueeSelection.currentX),
                  top: Math.min(marqueeSelection.startY, marqueeSelection.currentY),
                  width: Math.abs(marqueeSelection.currentX - marqueeSelection.startX),
                  height: Math.abs(marqueeSelection.currentY - marqueeSelection.startY),
                }}
              />
            )}
            {/* ====== RULER ====== */}
            <div 
              className="sticky top-0 h-[24px] border-b cursor-text z-40"
              style={{ background: FILMORA.ruler, borderColor: FILMORA.border }}
              onMouseDown={handleRulerMouseDown}
              title="Clique para buscar / Arraste para zoom"
            >
              {(() => {
                const { major, minor } = getRulerSteps(zoomLevel);
                const visibleDuration = viewportWidth / zoomLevel;
                // Buffer de 10s + preencher largura da tela
                const rulerDuration = Math.max(durationInSeconds + 10, visibleDuration);
                const maxTime = Math.ceil(rulerDuration);
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
              const isDropTarget = libraryDropTarget?.trackType === 'video' && libraryDropTarget?.trackId === trackIndex;
              return (
              <div
                key={`v-${trackIndex}`}
                className="relative h-[60px] border-b"
                style={{
                  background: isDropTarget ? 'rgba(0,229,255,0.10)' : FILMORA.bgDarker,
                  borderColor: isDropTarget ? `${FILMORA.accent}99` : `${FILMORA.border}60`,
                }}
                onDragOver={(event) => handleTrackDragOver(event, 'video', trackIndex)}
                onDragLeave={(event) => handleTrackDragLeave(event, 'video', trackIndex)}
                onDrop={(event) => handleTrackDrop(event, 'video', trackIndex)}
              >
                <div className="absolute inset-0 opacity-[0.02] track-background" style={{
                  backgroundImage: `repeating-linear-gradient(90deg, white 0, white 1px, transparent 1px, transparent ${zoomLevel}px)`,
                  backgroundSize: `${zoomLevel}px 100%`
                }} />

                {visualSegments
                  .filter((s) => !isAudioTimelineSegment(s))
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
                  
                  const isMotionGraphics = isMotionGraphicsSegment(seg);
                  const isVideo = !isMotionGraphics && (seg.assetType || '').startsWith('video');
                  const isSelected = selectedSegmentIds.includes(seg.id);
                  const trackColor = isMotionGraphics
                    ? FILMORA.trackMotionGraphics
                    : isVideo
                      ? FILMORA.trackVideo
                      : FILMORA.trackImage;
                  const clipLabel = isMotionGraphics
                    ? getMotionGraphicsSegmentLabel(seg)
                    : seg.fileName || seg.text || 'Mídia';

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
                    >
                      {/* BORDAS DE TRIM */}
                      {!isDragging && (
                        <>
                          <div 
                            className="absolute left-0 top-0 bottom-0 w-3 cursor-col-resize z-30 hover:bg-white/20 transition-colors"
                            onMouseDown={(e) => handleTrimMouseDown(e, seg, 'left')}
                          />
                          <div 
                            className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize z-30 hover:bg-white/20 transition-colors"
                            onMouseDown={(e) => handleTrimMouseDown(e, seg, 'right')}
                          />
                        </>
                      )}

                      {isMotionGraphics ? (
                        <div className="absolute inset-0 pointer-events-none overflow-hidden">
                          <div
                            className="absolute inset-0 opacity-70"
                            style={{
                              background: [
                                'radial-gradient(circle at 20% 25%, rgba(245,158,11,0.35), transparent 36%)',
                                'radial-gradient(circle at 78% 30%, rgba(217,70,239,0.22), transparent 34%)',
                                'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(17,24,39,0.08) 55%, rgba(56,189,248,0.14))',
                              ].join(', '),
                            }}
                          />
                          <div
                            className="absolute inset-0 opacity-30"
                            style={{
                              backgroundImage: 'repeating-linear-gradient(120deg, rgba(255,255,255,0.12) 0, rgba(255,255,255,0.12) 8px, transparent 8px, transparent 18px)',
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div
                              className="rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.22em]"
                              style={{
                                border: `1px solid ${trackColor}66`,
                                background: 'rgba(15,23,42,0.72)',
                                color: '#fff7ed',
                              }}
                            >
                              Remotion
                            </div>
                          </div>
                        </div>
                      ) : (
                        <SceneThumbnail 
                          imageUrl={seg.imageUrl || seg.asset_url} 
                          text={seg.text} 
                          isVideo={isVideo}
                          duration={duration} 
                        />
                      )}

                      
                      {/* === NOVA BARRA SUPERIOR (HEADER DO CLIP) === */}
                      <div 
                        className="absolute top-0 left-0 right-0 h-[16px] bg-black/60 backdrop-blur-sm flex items-center px-1.5 z-30"
                        onMouseEnter={(e) => handleSegmentMouseEnter(e, seg.id)}
                        onMouseLeave={handleSegmentMouseLeave}
                      >
                        <span className="text-[8.5px] font-medium truncate pointer-events-none text-white/90">
                          {clipLabel}
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
              const isDropTarget = libraryDropTarget?.trackType === 'audio' && libraryDropTarget?.trackId === trackIndex;
              return (
              <div
                key={`a-${trackIndex}`}
                className="relative h-[50px] border-b"
                style={{
                  background: isDropTarget ? 'rgba(0,229,255,0.08)' : FILMORA.bgDarker,
                  borderColor: isDropTarget ? `${FILMORA.accent}99` : `${FILMORA.border}60`,
                }}
                onDragOver={(event) => handleTrackDragOver(event, 'audio', trackIndex)}
                onDragLeave={(event) => handleTrackDragLeave(event, 'audio', trackIndex)}
                onDrop={(event) => handleTrackDrop(event, 'audio', trackIndex)}
              >
                <div className="absolute inset-0 opacity-[0.02] track-background" style={{
                  backgroundImage: `repeating-linear-gradient(90deg, white 0, white 1px, transparent 1px, transparent ${zoomLevel}px)`,
                  backgroundSize: `${zoomLevel}px 100%`
                }} />

                {/* Se for a primeira faixa de áudio e tiver o audioUrl base do projeto */}
                {trackIndex === 1 && audioUrl && (
                  <>
                    {hasCompactedBaseRanges ? (
                      <>
                        {baseAudioRanges.map((range, index) => {
                          const left = range.outputStart * zoomLevel;
                          const width = Math.max(4, range.duration * zoomLevel);
                          const rangeKeepRange: TimelineKeepRange[] = [{
                            sourceStart: range.sourceStart,
                            sourceEnd: range.sourceEnd,
                            outputStart: 0,
                            outputEnd: range.duration,
                          }];
                          const isRangeSelected = selectedBaseAudioRangeKeySet.has(range.key);

                          return (
                            <div
                              key={`audio-base-${range.key}`}
                              className="absolute top-[3px] bottom-[3px] rounded-[3px] overflow-hidden transition-shadow"
                              style={{
                                left,
                                width,
                                cursor: 'pointer',
                                background: `linear-gradient(180deg, ${FILMORA.trackAudio}25 0%, ${FILMORA.trackAudio}10 100%)`,
                                border: `1px solid ${isRangeSelected ? FILMORA.trackAudio : `${FILMORA.trackAudio}40`}`,
                                boxShadow: isRangeSelected
                                  ? `0 0 10px ${FILMORA.trackAudio}30, inset 0 1px 0 ${FILMORA.trackAudio}20`
                                  : 'none',
                              }}
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                const isMultiSelect = event.ctrlKey || event.metaKey;
                                setSelectedSegmentIds([]);
                                onSelectedBaseAudioRangeKeysChange((() => {
                                  const previous = selectedBaseAudioRangeKeys;
                                  if (isMultiSelect) {
                                    const next = new Set(previous);
                                    if (next.has(range.key)) next.delete(range.key);
                                    else next.add(range.key);
                                    return Array.from(next);
                                  }

                                  return [range.key];
                                })());
                              }}
                              title="Clique para selecionar este trecho de áudio"
                            >
                              <AudioWaveformDisplay
                                audioUrl={audioUrl}
                                color={FILMORA.trackAudio}
                                duration={range.duration}
                                audioKeepRanges={rangeKeepRange}
                                widthScale={zoomLevel}
                              />
                              <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: FILMORA.trackAudio }} />
                              <div className="absolute top-1 left-1.5 z-10">
                                <span
                                  className="text-[7px] font-bold uppercase tracking-wider px-1 py-[1px] rounded-sm"
                                  style={{ background: `${FILMORA.trackAudio}40`, color: `${FILMORA.trackAudio}` }}
                                >
                                  {`♫ Base ${index + 1}`}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    ) : (
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
                          audioKeepRanges={audioKeepRanges}
                          widthScale={zoomLevel}
                        />
                        <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: FILMORA.trackAudio }} />
                        <div className="absolute top-1 left-1.5 z-10">
                          <span
                            className="text-[7px] font-bold uppercase tracking-wider px-1 py-[1px] rounded-sm"
                            style={{ background: `${FILMORA.trackAudio}40`, color: `${FILMORA.trackAudio}` }}
                          >
                            ♫ Base
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Segmentos de áudio upados pra essa faixa */}
                {visualSegments
                  .filter((s) => isAudioTimelineSegment(s))
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
                  const isSelected = selectedSegmentIds.includes(seg.id);
                  
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
                    >
                      {/* BORDAS DE TRIM */}
                      {!isDragging && (
                        <>
                          <div 
                            className="absolute left-0 top-0 bottom-0 w-3 cursor-col-resize z-30 hover:bg-white/20 transition-colors"
                            onMouseDown={(e) => handleTrimMouseDown(e, seg, 'left')}
                          />
                          <div 
                            className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize z-30 hover:bg-white/20 transition-colors"
                            onMouseDown={(e) => handleTrimMouseDown(e, seg, 'right')}
                          />
                        </>
                      )}


                      
                      {/* === NOVA BARRA SUPERIOR DE ÁUDIO === */}
                      <div 
                        className="absolute top-0 left-0 right-0 h-[16px] bg-black/40 backdrop-blur-sm flex items-center px-1.5 z-30"
                        onMouseEnter={(e) => handleSegmentMouseEnter(e, seg.id)}
                        onMouseLeave={handleSegmentMouseLeave}
                      >
                        <span className="text-[8.5px] font-medium truncate pointer-events-none text-white/90">
                          ♫ {seg.fileName || seg.text || 'Áudio'}
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

                {trackIndex === 1 && !audioUrl && visualSegments.filter((s) => (s.track || 1) === trackIndex && isAudioTimelineSegment(s)).length === 0 && (
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
                className="playhead-handle sticky top-0 left-1/2 -translate-x-1/2 w-8 h-6 cursor-pointer flex items-start justify-center pointer-events-auto group/handle z-50"
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
