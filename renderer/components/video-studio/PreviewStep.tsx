import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ProjectState } from '../../types/video-studio';
import type { ChannelNiche } from './NicheModal';
import { 
  toRemotionFormat, 
  audioPathToUrl, 
  ASPECT_RATIO_DIMENSIONS 
} from '../../shared/utils/project-converter';

import {
  FILMORA,
  DEFAULT_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  formatTimecode,
} from './preview-step/constants';

import { TopBar } from './preview-step/TopBar';
import { PlayerArea } from './preview-step/PlayerArea';
import { Sidebar } from './preview-step/Sidebar';
import { TimelineToolbar } from './preview-step/TimelineToolbar';
import { Timeline } from './preview-step/Timeline';

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
  fitVideoToScene: boolean;
  onFitVideoToSceneChange: (val: boolean) => void;
}

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
  fitVideoToScene,
  onFitVideoToSceneChange,
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
      fitVideoToScene,
    });
  }, [project, subtitleMode, selectedRatio, selectedNiche, fitVideoToScene]);
  
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
  // RECOVER VIDEO DURATIONS IF MISSING
  // ========================================
  useEffect(() => {
    if (!onSegmentsUpdate || !project?.segments) return;

    let hasMissingDurations = false;
    const segmentsToUpdate = [...project.segments];
    const promises: Promise<void>[] = [];

    segmentsToUpdate.forEach((seg, index) => {
      const isVideoAsset = seg.assetType?.startsWith('video_') || (seg as any).asset_type?.startsWith('video_');
      const isVideoFile = seg.imageUrl && /\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(seg.imageUrl);
      const isBlob = seg.imageUrl?.startsWith('blob:');
      
      const isVideo = isVideoAsset || isVideoFile || isBlob;

      if (isVideo && seg.imageUrl && !seg.asset_duration) {
        hasMissingDurations = true;
        const promise = new Promise<void>((resolve) => {
          const video = document.createElement('video');
          video.preload = 'metadata';
          video.onloadedmetadata = () => {
            if (video.duration && video.duration !== Infinity && video.duration > 0) {
              segmentsToUpdate[index] = { ...seg, asset_duration: video.duration };
            }
            resolve();
          };
          video.onerror = () => resolve();
          video.src = seg.imageUrl;
        });
        promises.push(promise);
      }
    });

    if (hasMissingDurations) {
      Promise.all(promises).then(() => {
         // Atualizamos se foi encontrada ao menos uma duração nova
         const actuallyChanged = segmentsToUpdate.some((seg, i) => seg.asset_duration !== project.segments[i].asset_duration);
         if (actuallyChanged) {
           onSegmentsUpdate(segmentsToUpdate);
         }
      });
    }
  }, [project.segments, onSegmentsUpdate]);

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
  // TRANSITIONS
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

      {/* TOP BAR */}
      <TopBar
        onBackClick={handleBackClick}
        onSaveClick={handleSaveClick}
        onContinue={onContinue}
        onSave={onSave}
        isSaving={isSaving}
      />

      {/* MAIN CONTENT — Player + Sidebar */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* PLAYER AREA */}
        <PlayerArea
          subtitleMode={subtitleMode}
          setSubtitleMode={setSubtitleMode}
          setHasUnsavedChanges={setHasUnsavedChanges}
          selectedRatio={selectedRatio}
          setSelectedRatio={setSelectedRatio}
          currentRatios={currentRatios}
          showRatioMenu={showRatioMenu}
          setShowRatioMenu={setShowRatioMenu}
          toggleAspectRatio={toggleAspectRatio}
          availableRatios={AVAILABLE_RATIOS}
          remotionProject={remotionProject}
          durationInFrames={durationInFrames}
          fps={fps}
          handlePlayerReady={handlePlayerReady}
          getCssAspectRatio={getCssAspectRatio}
          isPlaying={isPlaying}
          handleTogglePlay={handleTogglePlay}
          handleStepForward={handleStepForward}
          handleStepBackward={handleStepBackward}
          handleSkipToStart={handleSkipToStart}
          handleSkipToEnd={handleSkipToEnd}
          handleProgressClick={handleProgressClick}
          progressRef={progressRef}
          timecodeRef={timecodeRef}
        />

        {/* SIDEBAR */}
        <Sidebar
          sidebarTab={sidebarTab}
          setSidebarTab={setSidebarTab}
          durationInSeconds={durationInSeconds}
          segmentsCount={project.segments.length}
          selectedRatio={selectedRatio}
          audioUrl={audioUrl}
          selectedSeg={selectedSeg}
          handleTransitionChange={handleTransitionChange}
          handleApplyTransitionToAll={handleApplyTransitionToAll}
          fitVideoToScene={fitVideoToScene}
          onFitVideoToSceneChange={(val) => { onFitVideoToSceneChange(val); setHasUnsavedChanges(true); }}
        />
      </div>

      {/* TIMELINE TOOLBAR */}
      <TimelineToolbar
        zoomLevel={zoomLevel}
        setZoomLevel={setZoomLevel}
        handleZoomIn={handleZoomIn}
        handleZoomOut={handleZoomOut}
      />

      {/* TIMELINE */}
      <Timeline
        visualSegments={visualSegments}
        durationInSeconds={durationInSeconds}
        audioUrl={audioUrl}
        zoomLevel={zoomLevel}
        viewportWidth={viewportWidth}
        totalTimelineWidth={totalTimelineWidth}
        selectedSegmentId={selectedSegmentId}
        setSelectedSegmentId={setSelectedSegmentId}
        hoveredSegment={hoveredSegment}
        hoveredSeg={hoveredSeg}
        handleSegmentMouseEnter={handleSegmentMouseEnter}
        handleSegmentMouseLeave={handleSegmentMouseLeave}
        handleBackgroundClick={handleBackgroundClick}
        handleRulerMouseDown={handleRulerMouseDown}
        handlePlayheadMouseDown={handlePlayheadMouseDown}
        scrollWrapperRef={scrollWrapperRef}
        trackContainerRef={trackContainerRef}
        playheadRef={playheadRef}
        playheadLabelRef={playheadLabelRef}
      />

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
