import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ProjectState } from '../../types/video-studio';
import { VideoPreviewPlayer } from './VideoPreviewPlayer';
import type { ChannelNiche } from './NicheModal';
import { 
  toRemotionFormat, 
  audioPathToUrl, 
  ASPECT_RATIO_DIMENSIONS 
} from '../../shared/utils/project-converter';
import { TRANSITION_LIST, type Transition } from '../../../remotion/utils/transitions';

interface PreviewStepProps {
  project: ProjectState;
  subtitleMode: 'paragraph' | 'word-by-word' | 'none';
  setSubtitleMode: (mode: 'paragraph' | 'word-by-word' | 'none') => void;
  onContinue: () => void;
  onBack: () => void;
  onAspectRatiosChange: (ratios: string[]) => void;
  onSegmentsUpdate?: (segments: any[]) => void;
  onSave?: () => Promise<void> | void;
  selectedNiche: ChannelNiche | null;
}

// ========================================
// FILMORA DARK PALETTE  
// ========================================
const FILMORA = {
  bg:         '#1a1a2e',   // Fundo geral
  bgDark:     '#0f0f1e',   // Painéis laterais / timeline
  bgDarker:   '#0a0a16',   // Fundo da timeline
  surface:    '#21213b',   // Cards / Containers
  surfaceAlt: '#2a2a4a',   // Containers hover
  border:     '#2d2d52',   // Bordas
  borderLight:'#3a3a60',   // Bordas mais claras
  accent:     '#00d4aa',   // Verde/Teal Filmora (primário)
  accentDark: '#00b894',   // Verde escuro
  accentHover:'#00e8bc',   // Verde hover
  text:       '#e8e8f0',   // Texto principal
  textMuted:  '#8888aa',   // Texto secundário
  textDim:    '#555570',   // Texto dim
  playhead:   '#ff3b5c',   // Playhead vermelho
  trackVideo: '#6c5ce7',   // Trilha vídeo — roxo
  trackImage: '#0984e3',   // Trilha imagem — azul
  trackAudio: '#00b894',   // Trilha áudio — verde (matching accent)
  ruler:      '#16162e',   // Régua
  rulerText:  '#6666aa',   // Texto régua
};

// ========================================
// CONSTANTES DA TIMELINE
// ========================================
const MIN_ZOOM = 5;
const MAX_ZOOM = 300;
const DEFAULT_ZOOM = 60;

const getRulerSteps = (zoom: number) => {
  if (zoom < 10) return { major: 60, minor: 10 };
  if (zoom < 20) return { major: 30, minor: 5 };
  if (zoom < 50) return { major: 15, minor: 5 };
  if (zoom < 100) return { major: 5, minor: 1 };
  if (zoom < 200) return { major: 2, minor: 1 };
  return { major: 1, minor: 0.5 };
};

const formatTimecode = (totalSec: number): string => {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const f = Math.round((totalSec % 1) * 30);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
};

const formatRulerTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:00`;
  return `00:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:00`;
};

// ========================================
// WAVEFORM COMPONENT
// ========================================
function AudioWaveformDisplay({ audioUrl, color, duration, widthScale }: {
  audioUrl: string;
  color: string;
  duration: number;
  widthScale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);

  useEffect(() => {
    if (!audioUrl) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new Ctx();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        if (!cancelled) setBuffer(decoded);
        audioCtx.close();
      } catch (e) {
        console.error('Erro ao carregar waveform:', e);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [audioUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, duration * widthScale);
    const height = 40;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = color;

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const idx = (i * step) + j;
        if (idx < data.length) {
          const datum = data[idx];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
      }
      const y = (1 + min) * amp;
      const h = Math.max(1, (max - min) * amp);
      ctx.fillRect(i, y, 1, h);
    }
  }, [buffer, duration, widthScale, color]);

  return (
    <canvas 
      ref={canvasRef} 
      style={{ width: Math.max(1, duration * widthScale), height: 40 }} 
      className="opacity-70 absolute top-0 left-0 pointer-events-none" 
    />
  );
}

// ========================================
// SCENE THUMBNAIL
// ========================================
function SceneThumbnail({ imageUrl, text }: { imageUrl?: string; text: string }) {
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

// ========================================
// SVG ICONS  (inline, estilo Filmora)
// ========================================
const Icons = {
  play: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21"/></svg>
  ),
  pause: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="3" width="5" height="18"/><rect x="14" y="3" width="5" height="18"/></svg>
  ),
  skipBack: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="11 19 2 12 11 5"/><polygon points="22 19 13 12 22 5"/></svg>
  ),
  skipForward: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 19 22 12 13 5"/><polygon points="2 19 11 12 2 5"/></svg>
  ),
  prevFrame: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="3" height="16"/><polygon points="20 4 10 12 20 20"/></svg>
  ),
  nextFrame: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="17" y="4" width="3" height="16"/><polygon points="4 4 14 12 4 20"/></svg>
  ),
  fullscreen: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
  ),
  scissors: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
  ),
  undo: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
  ),
  redo: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  ),
  trash: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
  ),
  zoom: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
  ),
  lock: (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  ),
  eye: (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
  ),
  music: (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
  ),
  film: (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/></svg>
  ),
  minus: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
  ),
  plus: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
  ),
  render: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
  ),
};


// ========================================
// COMPONENTE PRINCIPAL
// ========================================
export function PreviewStep({
  project,
  subtitleMode,
  setSubtitleMode,
  onContinue,
  onBack,
  onAspectRatiosChange,
  onSegmentsUpdate,
  onSave,
  selectedNiche,
}: PreviewStepProps) {
  // Aspect ratio
  const [selectedRatio, setSelectedRatio] = useState<string>(() => {
    return project.selectedAspectRatios?.[0] || '9:16';
  });
  const [showRatioMenu, setShowRatioMenu] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'info' | 'transitions'>('info');

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleBackClick = () => {
    if (hasUnsavedChanges) {
      if (!window.confirm("Você tem alterações não salvas. Tem certeza que deseja voltar? As alterações podem ser perdidas.")) {
        return;
      }
    }
    onBack();
  };

  const handleSaveClick = async () => {
    if (onSave) {
      setIsSaving(true);
      try {
        await onSave();
        setHasUnsavedChanges(false);
      } finally {
        setIsSaving(false);
      }
    }
  };

  // ========================================
  // ESTADOS DA TIMELINE
  // ========================================
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const currentTimeRef = useRef(0);
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<{ id: number; x: number; y: number } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scrollWrapperRef = useRef<HTMLDivElement>(null);
  const trackContainerRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(1000);

  // Refs DOM para atualização direta (sem re-render)
  const playheadRef = useRef<HTMLDivElement>(null);
  const playheadLabelRef = useRef<HTMLDivElement>(null);
  const timecodeRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // Player Remotion sync
  const playerRef = useRef<any>(null);
  const isSeekingFromTimelineRef = useRef(false);
  const frameListenerCleanupRef = useRef<(() => void) | null>(null);
  const zoomLevelRef = useRef(DEFAULT_ZOOM);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => { zoomLevelRef.current = zoomLevel; }, [zoomLevel]);

  const AVAILABLE_RATIOS = Object.keys(ASPECT_RATIO_DIMENSIONS);
  const currentRatios = project.selectedAspectRatios || ['9:16'];

  // Remotion project
  const remotionProject = useMemo(() => {
    const dims = ASPECT_RATIO_DIMENSIONS[selectedRatio] || { width: 1080, height: 1920 };
    return toRemotionFormat(project as any, {
      subtitleMode,
      width: dims.width,
      height: dims.height,
      fps: 30,
      componentsAllowed: selectedNiche?.components_allowed || project.componentsAllowed,
      audioUrl: audioPathToUrl(project.audioPath),
      defaultFont: selectedNiche?.default_font,
    });
  }, [project, subtitleMode, selectedRatio, selectedNiche]);
  
  useEffect(() => {
    if (!currentRatios.includes(selectedRatio)) {
      if (currentRatios.length > 0) setSelectedRatio(currentRatios[0]);
    }
  }, [currentRatios, selectedRatio]);

  const toggleAspectRatio = (ratio: string) => {
    let newRatios;
    if (currentRatios.includes(ratio)) {
      if (currentRatios.length <= 1) return;
      newRatios = currentRatios.filter(r => r !== ratio);
    } else {
      newRatios = [...currentRatios, ratio];
    }
    onAspectRatiosChange(newRatios);
    setHasUnsavedChanges(true);
  };

  // Duration
  const lastScene = project.segments[project.segments.length - 1];
  const durationInSeconds = lastScene ? lastScene.end : 10;
  const fps = 30;
  const durationInFrames = Math.ceil(durationInSeconds * fps);
  const getCssAspectRatio = (ratio: string) => ratio.replace(':', '/');
  const audioUrl = useMemo(() => audioPathToUrl(project.audioPath), [project.audioPath]);

  // ========================================
  // TIMELINE: Resize Observer
  // ========================================
  useEffect(() => {
    if (!scrollWrapperRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) setViewportWidth(entries[0].contentRect.width);
    });
    observer.observe(scrollWrapperRef.current);
    setViewportWidth(scrollWrapperRef.current.clientWidth);
    return () => observer.disconnect();
  }, []);

  // ========================================
  // Atualiza playhead e timecode via DOM direto (sem re-render)
  // ========================================
  const updatePlayheadDOM = useCallback((time: number) => {
    currentTimeRef.current = time;
    const zoom = zoomLevelRef.current;

    if (playheadRef.current) {
      playheadRef.current.style.transform = `translateX(${time * zoom}px)`;
    }
    if (playheadLabelRef.current) {
      playheadLabelRef.current.textContent = formatTimecode(time);
    }
    if (timecodeRef.current) {
      timecodeRef.current.textContent = formatTimecode(time);
    }
    // Progress bar no player
    if (progressRef.current && durationInSeconds > 0) {
      const pct = Math.min(100, (time / durationInSeconds) * 100);
      progressRef.current.style.width = `${pct}%`;
    }
  }, [durationInSeconds]);

  useEffect(() => {
    updatePlayheadDOM(currentTimeRef.current);
  }, [zoomLevel, updatePlayheadDOM]);

  // ========================================
  // SINCRONIZAÇÃO: Player → Timeline (sem re-render)
  // ========================================
  const handlePlayerReady = useCallback((player: any) => {
    if (frameListenerCleanupRef.current) {
      frameListenerCleanupRef.current();
      frameListenerCleanupRef.current = null;
    }

    playerRef.current = player;
    if (!player) return;

    const handleFrameUpdate = (e: any) => {
      if (isSeekingFromTimelineRef.current) return;
      const frame = e.detail.frame;
      const timeInSeconds = frame / fps;
      updatePlayheadDOM(timeInSeconds);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    player.addEventListener('frameupdate', handleFrameUpdate);
    player.addEventListener('play', handlePlay);
    player.addEventListener('pause', handlePause);
    frameListenerCleanupRef.current = () => {
      try {
        player.removeEventListener('frameupdate', handleFrameUpdate);
        player.removeEventListener('play', handlePlay);
        player.removeEventListener('pause', handlePause);
      } catch(_) {}
    };
  }, [fps, updatePlayheadDOM]);

  useEffect(() => {
    return () => {
      if (frameListenerCleanupRef.current) {
        frameListenerCleanupRef.current();
        frameListenerCleanupRef.current = null;
      }
    };
  }, []);

  // ========================================
  // TIMELINE: Seek bidirecional
  // ========================================
  const seekTo = useCallback((time: number) => {
    const safeTime = Math.max(0, Math.min(time, durationInSeconds));
    updatePlayheadDOM(safeTime);
    if (playerRef.current) {
      isSeekingFromTimelineRef.current = true;
      const frame = Math.round(safeTime * fps);
      playerRef.current.seekTo(frame);
      requestAnimationFrame(() => { isSeekingFromTimelineRef.current = false; });
    }
  }, [durationInSeconds, fps, updatePlayheadDOM]);

  // Player transport controls
  const handleTogglePlay = useCallback(() => {
    if (playerRef.current) {
      if (playerRef.current.isPlaying()) {
        playerRef.current.pause();
      } else {
        playerRef.current.play();
      }
    }
  }, []);

  const handleStepForward = useCallback(() => {
    seekTo(currentTimeRef.current + 1 / fps);
  }, [seekTo, fps]);

  const handleStepBackward = useCallback(() => {
    seekTo(currentTimeRef.current - 1 / fps);
  }, [seekTo, fps]);

  const handleSkipToStart = useCallback(() => {
    seekTo(0);
  }, [seekTo]);

  const handleSkipToEnd = useCallback(() => {
    seekTo(durationInSeconds);
  }, [seekTo, durationInSeconds]);
  // ========================================
  // TRANSITIONS: Alterar transição de um segmento
  // ========================================
  const handleTransitionChange = useCallback((segmentId: number, transition: string) => {
    if (!onSegmentsUpdate) return;
    const updated = project.segments.map(seg =>
      seg.id === segmentId ? { ...seg, transition } : seg
    );
    onSegmentsUpdate(updated);
    setHasUnsavedChanges(true);
  }, [project.segments, onSegmentsUpdate]);

  const handleApplyTransitionToAll = useCallback((transition: string) => {
    if (!onSegmentsUpdate) return;
    const updated = project.segments.map(seg => ({ ...seg, transition }));
    onSegmentsUpdate(updated);
    setHasUnsavedChanges(true);
  }, [project.segments, onSegmentsUpdate]);

  // Segmento selecionado
  const selectedSeg = selectedSegmentId != null ? project.segments.find(s => s.id === selectedSegmentId) : null;

  // ========================================
  // TIMELINE: Ruler Mouse Down
  // ========================================
  const handleRulerMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.playhead-handle')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startZoom = zoomLevel;
    let isDragging = false;

    const handleMouseMove = (mvEvent: MouseEvent) => {
      isDragging = true;
      const deltaX = mvEvent.clientX - startX;
      setZoomLevel(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, startZoom + (deltaX * 0.5))));
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (!isDragging && trackContainerRef.current) {
        const rect = trackContainerRef.current.getBoundingClientRect();
        seekTo(Math.max(0, upEvent.clientX - rect.left) / zoomLevel);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // ========================================
  // TIMELINE: Playhead Drag
  // ========================================
  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!trackContainerRef.current) return;
    const rect = trackContainerRef.current.getBoundingClientRect();

    const handleMouseMove = (mvEvent: MouseEvent) => {
      seekTo(Math.max(0, mvEvent.clientX - rect.left) / zoomLevel);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleZoomIn = () => setZoomLevel(z => Math.min(z * 1.5, MAX_ZOOM));
  const handleZoomOut = () => setZoomLevel(z => Math.max(z / 1.5, MIN_ZOOM));

  // Hover tooltip
  const handleSegmentMouseEnter = (e: React.MouseEvent, segId: number) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    const x = e.clientX;
    const y = e.clientY;
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredSegment({ id: segId, x, y });
    }, 800);
  };

  const handleSegmentMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredSegment(null);
  };

  const handleBackgroundClick = () => setSelectedSegmentId(null);

  // Progress bar seek
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(pct * durationInSeconds);
  };

  // Computations
  const totalTimelineWidth = Math.max(durationInSeconds * zoomLevel, viewportWidth);
  const hoveredSeg = hoveredSegment ? project.segments.find(s => s.id === hoveredSegment.id) : null;
  const visualSegments = project.segments;

  // ========================================================================
  // RENDER — FILMORA LAYOUT
  // ========================================================================
  return (
    <div className="flex flex-col h-full" style={{ background: FILMORA.bg, color: FILMORA.text, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* ================================================================ */}
      {/* TOP BAR — Title + Actions (como barra de menu do Filmora)        */}
      {/* ================================================================ */}
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: FILMORA.border, background: FILMORA.bgDark }}>
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold tracking-wide" style={{ color: FILMORA.text }}>
            Player
          </h2>
          <span className="text-xs px-2 py-0.5 rounded" style={{ color: FILMORA.textMuted, background: FILMORA.surface }}>
            Preview
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBackClick}
            className="px-4 py-1.5 rounded text-xs font-medium transition-all hover:brightness-110"
            style={{ background: FILMORA.surface, color: FILMORA.textMuted, border: `1px solid ${FILMORA.border}` }}
          >
            ← Voltar
          </button>
          
          {onSave && (
            <button
              onClick={handleSaveClick}
              disabled={isSaving}
              className="px-4 py-1.5 rounded text-xs font-medium transition-all hover:brightness-110 flex items-center gap-1.5"
              style={{ background: FILMORA.surface, color: FILMORA.text, border: `1px solid ${FILMORA.borderLight}`, opacity: isSaving ? 0.7 : 1 }}
            >
              <span className="opacity-80">💾</span> {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          )}

          <button
            onClick={onContinue}
            className="px-5 py-1.5 rounded text-xs font-bold transition-all hover:brightness-110 flex items-center gap-1.5"
            style={{ background: FILMORA.accent, color: '#000' }}
          >
            {Icons.render}
            Exportar
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* MAIN CONTENT — Player + Sidebar (estilo Filmora)                 */}
      {/* ================================================================ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ============ PLAYER AREA (Centro) ============ */}
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
                        {AVAILABLE_RATIOS.filter(r => !currentRatios.includes(r)).map(ratio => (
                          <button
                            key={ratio}
                            onClick={() => { toggleAspectRatio(ratio); setShowRatioMenu(false); setSelectedRatio(ratio); }}
                            className="w-full text-left px-3 py-1.5 text-[10px] transition-colors hover:brightness-125"
                            style={{ color: FILMORA.textMuted }}
                          >{ratio}</button>
                        ))}
                        {AVAILABLE_RATIOS.every(r => currentRatios.includes(r)) && (
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
                project={remotionProject}
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

        {/* ============ SIDEBAR DIREITA (Propriedades + Transições) ============ */}
        <div className="w-[240px] flex-shrink-0 flex flex-col border-l overflow-hidden" style={{ background: FILMORA.bgDark, borderColor: FILMORA.border }}>
          {/* Tabs */}
          <div className="flex border-b flex-shrink-0" style={{ borderColor: FILMORA.border }}>
            {(['info', 'transitions'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setSidebarTab(tab)}
                className="flex-1 py-2 text-center text-[10px] font-semibold tracking-wider uppercase transition-colors"
                style={{ 
                  color: sidebarTab === tab ? FILMORA.accent : FILMORA.textDim,
                  borderBottom: sidebarTab === tab ? `2px solid ${FILMORA.accent}` : '2px solid transparent',
                }}
              >
                {tab === 'info' ? 'Info' : 'Transições'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {sidebarTab === 'info' ? (
              /* ====== TAB INFO ====== */
              <div className="p-3 space-y-3">
                <div className="rounded p-3" style={{ background: FILMORA.surface }}>
                  <div className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: FILMORA.textDim }}>Duração</div>
                  <div className="text-sm font-bold font-mono" style={{ color: FILMORA.text }}>
                    {formatTimecode(durationInSeconds)}
                  </div>
                </div>

                <div className="rounded p-3" style={{ background: FILMORA.surface }}>
                  <div className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: FILMORA.textDim }}>Cenas</div>
                  <div className="text-sm font-bold" style={{ color: FILMORA.text }}>
                    {project.segments.length}
                  </div>
                </div>

                <div className="rounded p-3" style={{ background: FILMORA.surface }}>
                  <div className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: FILMORA.textDim }}>Resolução</div>
                  <div className="text-sm font-bold" style={{ color: FILMORA.text }}>
                    {ASPECT_RATIO_DIMENSIONS[selectedRatio]?.width}×{ASPECT_RATIO_DIMENSIONS[selectedRatio]?.height}
                  </div>
                </div>

                <div className="rounded p-3" style={{ background: FILMORA.surface }}>
                  <div className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: FILMORA.textDim }}>FPS</div>
                  <div className="text-sm font-bold" style={{ color: FILMORA.text }}>30</div>
                </div>

                <div className="rounded p-3" style={{ background: FILMORA.surface }}>
                  <div className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: FILMORA.textDim }}>Áudio</div>
                  <div className="text-xs font-medium truncate" style={{ color: audioUrl ? FILMORA.accent : FILMORA.textDim }}>
                    {audioUrl ? '✓ Carregado' : '— Sem áudio'}
                  </div>
                </div>
              </div>
            ) : (
              /* ====== TAB TRANSIÇÕES ====== */
              <div className="p-3 space-y-3">
                {selectedSeg ? (
                  <>
                    {/* Segmento selecionado */}
                    <div className="rounded p-2.5" style={{ background: FILMORA.surface }}>
                      <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: FILMORA.textDim }}>Cena selecionada</div>
                      <div className="text-xs font-bold truncate" style={{ color: FILMORA.text }}>#{selectedSeg.id} — {selectedSeg.text}</div>
                    </div>

                    {/* Transição atual */}
                    <div className="text-[9px] uppercase tracking-wider" style={{ color: FILMORA.textDim }}>
                      Transição de entrada
                    </div>

                    {/* Grid de transições */}
                    <div className="grid grid-cols-2 gap-1.5">
                      {TRANSITION_LIST.map(tr => {
                        const currentTransition = selectedSeg.transition || 'fade';
                        const isActive = currentTransition === tr.value;
                        return (
                          <button
                            key={tr.value}
                            onClick={() => handleTransitionChange(selectedSeg.id, tr.value)}
                            className="rounded p-2 text-left transition-all hover:brightness-125"
                            style={{
                              background: isActive ? `${FILMORA.accent}20` : FILMORA.surface,
                              border: `1px solid ${isActive ? FILMORA.accent : FILMORA.border}`,
                            }}
                            title={tr.description}
                          >
                            <div className="text-[9px] font-semibold truncate" style={{ color: isActive ? FILMORA.accent : FILMORA.text }}>
                              {tr.label}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Aplicar a todos */}
                    <button
                      onClick={() => handleApplyTransitionToAll(selectedSeg.transition || 'fade')}
                      className="w-full rounded py-1.5 text-[10px] font-semibold transition-all hover:brightness-110"
                      style={{ background: FILMORA.accent, color: '#000' }}
                    >
                      Aplicar "{TRANSITION_LIST.find(t => t.value === (selectedSeg.transition || 'fade'))?.label}" a todas
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: FILMORA.surface }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: FILMORA.textDim }}>
                        <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                        <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                      </svg>
                    </div>
                    <p className="text-[10px] leading-relaxed" style={{ color: FILMORA.textDim }}>
                      Selecione uma cena na timeline para alterar sua transição
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dica */}
          <div className="mt-auto p-3 flex-shrink-0">
            <div className="rounded p-2.5" style={{ background: `${FILMORA.accent}10`, border: `1px solid ${FILMORA.accent}30` }}>
              <p className="text-[9px] leading-relaxed" style={{ color: FILMORA.accent }}>
                💡 O preview usa qualidade reduzida. O vídeo final será renderizado em alta qualidade.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* TIMELINE TOOLBAR (estilo Filmora — ícones de edição)             */}
      {/* ================================================================ */}
      <div className="flex items-center px-3 py-1 gap-0.5 border-t border-b" style={{ background: FILMORA.bgDark, borderColor: FILMORA.border }}>
        {/* Tool icons */}
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

        {/* Zoom Controls (estilo Filmora — slider feel) */}
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

      {/* ================================================================ */}
      {/* TIMELINE (Ruler + Tracks + Playhead)                             */}
      {/* ================================================================ */}
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
            {/* Ruler spacer */}
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
                {/* Subtle grid */}
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
                      {/* Top accent bar */}
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
                    {/* Top accent bar */}
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
                {/* Handle */}
                <div 
                  className="playhead-handle absolute -top-[0px] left-1/2 -translate-x-1/2 w-8 h-6 cursor-pointer flex items-start justify-center pointer-events-auto group/handle z-50"
                  onMouseDown={handlePlayheadMouseDown}
                >
                  <div className="flex flex-col items-center">
                    {/* Playhead label */}
                    <div 
                      ref={playheadLabelRef} 
                      className="text-white text-[7px] font-bold font-mono px-1 py-[1px] rounded-t-sm shadow-md group-hover/handle:brightness-125 transition-all"
                      style={{ background: FILMORA.playhead }}
                    >
                      00:00:00:00
                    </div>
                    {/* Triangle */}
                    <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] drop-shadow-md"
                      style={{ borderTopColor: FILMORA.playhead }} />
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .filmora-scrollbar::-webkit-scrollbar { height: 6px; }
        .filmora-scrollbar::-webkit-scrollbar-track { background: ${FILMORA.bgDarker}; }
        .filmora-scrollbar::-webkit-scrollbar-thumb { background: ${FILMORA.border}; border-radius: 3px; }
        .filmora-scrollbar::-webkit-scrollbar-thumb:hover { background: ${FILMORA.borderLight}; }
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      `}} />
    </div>
  );
}
