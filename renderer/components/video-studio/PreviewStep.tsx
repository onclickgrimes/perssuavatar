import React, { useState, useRef, useEffect, useCallback, useMemo, useReducer } from 'react';
import type { MotionGraphicsReferenceImage, ProjectState } from '../../types/video-studio';
import type { ChannelNiche } from './NicheModal';
import { 
  audioPathToUrl, 
  ASPECT_RATIO_DIMENSIONS 
} from '../../shared/utils/project-converter';
import {
  buildSilenceCompactionRanges,
  compactTimelineSegments,
  getCompactedDuration,
  mapOutputTimeToSourceTime,
  normalizeSilencePaddingMs,
  type TimelineKeepRange,
} from '../../../remotion/utils/silence-compaction';

import {
  FILMORA,
  DEFAULT_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  formatTimecode,
} from './preview-step/constants';

import { PlayerArea } from './preview-step/PlayerArea';
import { MediaPanel } from './preview-step/MediaPanel';
import { Sidebar } from './preview-step/Sidebar';
import { TimelineToolbar } from './preview-step/TimelineToolbar';
import { Timeline } from './preview-step/Timeline';
import { compileMotionGraphicsCode } from './preview-step/motion-graphics/compiler';
import type {
  MediaPanelTab,
  MotionGraphicsClipSummary,
  MotionGraphicsChatMessage,
} from './preview-step/motion-graphics/types';
import {
  MOTION_GRAPHICS_ASSET_TYPE,
  getMotionGraphicsData,
  getMotionGraphicsSegmentLabel,
  isMotionGraphicsSegment,
} from './preview-step/motion-graphics/types';

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
  removeAudioSilences: boolean;
  onRemoveAudioSilencesChange: (val: boolean) => void;
  mainAudioVolume: number;
  onMainAudioVolumeChange: (val: number) => void;
  onProjectConfigChange?: (updater: (prevConfig: any) => any) => void;
}

const getKeepRangeKey = (range: Partial<TimelineKeepRange>) => {
  return [
    Number(range.sourceStart || 0).toFixed(4),
    Number(range.sourceEnd || 0).toFixed(4),
    Number(range.outputStart || 0).toFixed(4),
    Number(range.outputEnd || 0).toFixed(4),
  ].join('|');
};

const normalizeAudioMutedRanges = (rawRanges: any): TimelineKeepRange[] => {
  if (!Array.isArray(rawRanges)) {
    return [];
  }

  return rawRanges
    .map((range: any) => ({
      sourceStart: Number(range?.sourceStart || 0),
      sourceEnd: Number(range?.sourceEnd || 0),
      outputStart: Number(range?.outputStart || 0),
      outputEnd: Number(range?.outputEnd || 0),
    }))
    .filter((range) => range.sourceEnd > range.sourceStart);
};

const isAudioProjectSegment = (segment: { assetType?: string } | null | undefined) => {
  return String(segment?.assetType || '').toLowerCase().startsWith('audio');
};

interface PreviewHistoryState {
  segments: any[];
  audioMutedRanges: TimelineKeepRange[];
}

interface PreviewHistoryStore {
  entries: PreviewHistoryState[];
  index: number;
}

type PreviewHistoryAction =
  | { type: 'push'; snapshot: PreviewHistoryState }
  | { type: 'set-index'; index: number };

const areMutedRangeListsEqual = (left: TimelineKeepRange[], right: TimelineKeepRange[]) => {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  for (let i = 0; i < left.length; i += 1) {
    if (getKeepRangeKey(left[i]) !== getKeepRangeKey(right[i])) {
      return false;
    }
  }

  return true;
};

const areSegmentsSnapshotsEqual = (left: any[], right: any[]) => {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch (_) {
    return false;
  }
};

const isSameHistorySnapshot = (left: PreviewHistoryState, right: PreviewHistoryState) => {
  return (
    areSegmentsSnapshotsEqual(left.segments, right.segments) &&
    areMutedRangeListsEqual(left.audioMutedRanges, right.audioMutedRanges)
  );
};

const buildInitialHistoryStore = (project: ProjectState): PreviewHistoryStore => ({
  entries: [
    {
      segments: project.segments,
      audioMutedRanges: normalizeAudioMutedRanges((project?.config as any)?.audioMutedRanges),
    },
  ],
  index: 0,
});

const createMotionGraphicsMessage = (
  role: MotionGraphicsChatMessage['role'],
  content: string,
  extra?: Partial<Omit<MotionGraphicsChatMessage, 'id' | 'role' | 'content'>>,
): MotionGraphicsChatMessage => {
  const timestamp = extra?.timestamp || Date.now();
  return {
    id: `${role}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp,
    provider: extra?.provider,
    model: extra?.model,
    attachedImages: extra?.attachedImages,
    skillsUsed: extra?.skillsUsed,
  };
};

const previewHistoryReducer = (state: PreviewHistoryStore, action: PreviewHistoryAction): PreviewHistoryStore => {
  switch (action.type) {
    case 'push': {
      const truncatedEntries = state.entries.slice(0, state.index + 1);
      const lastSnapshot = truncatedEntries[truncatedEntries.length - 1];
      if (lastSnapshot && isSameHistorySnapshot(lastSnapshot, action.snapshot)) {
        return state;
      }

      const nextEntries = [...truncatedEntries, action.snapshot];
      return {
        entries: nextEntries,
        index: nextEntries.length - 1,
      };
    }
    case 'set-index': {
      if (!state.entries.length) {
        return state;
      }

      const boundedIndex = Math.max(0, Math.min(action.index, state.entries.length - 1));
      if (boundedIndex === state.index) {
        return state;
      }

      return {
        ...state,
        index: boundedIndex,
      };
    }
    default:
      return state;
  }
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
  fitVideoToScene,
  onFitVideoToSceneChange,
  removeAudioSilences,
  onRemoveAudioSilencesChange,
  mainAudioVolume,
  onMainAudioVolumeChange,
  onProjectConfigChange,
}: PreviewStepProps) {
  const legacyMotionGraphicsSnapshot = (project?.config as any)?.motionGraphics || null;

  // Aspect ratio
  const [selectedRatio, setSelectedRatio] = useState<string>(() => {
    return project.selectedAspectRatios?.[0] || '9:16';
  });
  const [showRatioMenu, setShowRatioMenu] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'info' | 'transitions'>('info');
  const [mediaPanelTab, setMediaPanelTab] = useState<MediaPanelTab>('pexels');

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [motionGraphicsGenerationError, setMotionGraphicsGenerationError] = useState<string | null>(null);
  const [isMotionGraphicsGenerating, setIsMotionGraphicsGenerating] = useState(false);
  const [selectedMotionGraphicsSegmentId, setSelectedMotionGraphicsSegmentId] = useState<number | null>(() => {
    const firstMotionGraphicsSegment = project.segments.find((segment) => isMotionGraphicsSegment(segment));
    return firstMotionGraphicsSegment ? Number(firstMotionGraphicsSegment.id) : null;
  });
  const legacyMotionGraphicsMigrationRef = useRef(false);

  // ========================================
  // HISTÓRICO (UNDO / REDO)
  // ========================================
  const [historyState, dispatchHistory] = useReducer(previewHistoryReducer, project, buildInitialHistoryStore);
  const history = historyState.entries;
  const historyIndex = historyState.index;

  const pushHistorySnapshot = useCallback((segments: any[], audioMutedRanges: TimelineKeepRange[]) => {
    dispatchHistory({
      type: 'push',
      snapshot: {
        segments,
        audioMutedRanges: normalizeAudioMutedRanges(audioMutedRanges),
      },
    });
  }, []);

  const handleSegmentsChange = useCallback((newSegments: any[], options?: { audioMutedRanges?: TimelineKeepRange[]; pushHistory?: boolean }) => {
    if (!onSegmentsUpdate) return;
    const currentMutedRanges = normalizeAudioMutedRanges((project?.config as any)?.audioMutedRanges);
    const nextMutedRanges = options?.audioMutedRanges ?? currentMutedRanges;

    if (options?.pushHistory !== false) {
      pushHistorySnapshot(newSegments, nextMutedRanges);
    }
    onSegmentsUpdate(newSegments);
    setHasUnsavedChanges(true);
  }, [onSegmentsUpdate, project?.config?.audioMutedRanges, pushHistorySnapshot]);

  const applyAudioMutedRangesChange = useCallback((nextMutedRanges: TimelineKeepRange[], options?: { segments?: any[]; pushHistory?: boolean }) => {
    if (!onProjectConfigChange) return;
    const normalizedRanges = normalizeAudioMutedRanges(nextMutedRanges);
    const snapshotSegments = options?.segments || project.segments;

    if (options?.pushHistory !== false) {
      pushHistorySnapshot(snapshotSegments, normalizedRanges);
    }

    onProjectConfigChange((prevConfig: any) => ({
      ...(prevConfig || {}),
      audioMutedRanges: normalizedRanges,
    }));
    setHasUnsavedChanges(true);
  }, [onProjectConfigChange, project.segments, pushHistorySnapshot]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      dispatchHistory({ type: 'set-index', index: newIndex });
      const snapshot = history[newIndex];

      if (onSegmentsUpdate) {
        onSegmentsUpdate(snapshot.segments);
      }
      if (onProjectConfigChange) {
        onProjectConfigChange((prevConfig: any) => ({
          ...(prevConfig || {}),
          audioMutedRanges: snapshot.audioMutedRanges,
        }));
      }
      setHasUnsavedChanges(true);
    }
  }, [history, historyIndex, onProjectConfigChange, onSegmentsUpdate]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      dispatchHistory({ type: 'set-index', index: newIndex });
      const snapshot = history[newIndex];

      if (onSegmentsUpdate) {
        onSegmentsUpdate(snapshot.segments);
      }
      if (onProjectConfigChange) {
        onProjectConfigChange((prevConfig: any) => ({
          ...(prevConfig || {}),
          audioMutedRanges: snapshot.audioMutedRanges,
        }));
      }
      setHasUnsavedChanges(true);
    }
  }, [history, historyIndex, onProjectConfigChange, onSegmentsUpdate]);

  // Estados para as faixas (tracks)
  const [videoTrackCount, setVideoTrackCount] = useState(1);
  const [audioTrackCount, setAudioTrackCount] = useState(1);

  // Recalcular quantidade de faixas se o projeto tiver segmentos em faixas maiores
  useEffect(() => {
    let maxV = 1;
    let maxA = 1;
    project.segments.forEach(seg => {
      if (seg.track) {
        if ((seg.assetType || '').startsWith('audio')) {
          if (seg.track > maxA) maxA = seg.track;
        } else {
          if (seg.track > maxV) maxV = seg.track;
        }
      }
    });
    if (maxV > videoTrackCount) setVideoTrackCount(maxV);
    if (maxA > audioTrackCount) setAudioTrackCount(maxA);
  }, [project.segments]);

  const handleAddVideoTrack = () => setVideoTrackCount(prev => prev + 1);
  const handleAddAudioTrack = () => setAudioTrackCount(prev => prev + 1);

  // ========================================
  // ESTADOS DA TIMELINE E COMPUTATIONS
  // ========================================
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const currentTimeRef = useRef(0);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<number[]>([]);
  const [selectedBaseAudioRangeKeys, setSelectedBaseAudioRangeKeys] = useState<string[]>([]);
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
  const durationProbeCacheRef = useRef<Set<string>>(new Set());
  const lastPlayheadTimeRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => { zoomLevelRef.current = zoomLevel; }, [zoomLevel]);

  const AVAILABLE_RATIOS = Object.keys(ASPECT_RATIO_DIMENSIONS);
  const currentRatios = project.selectedAspectRatios || ['9:16'];
  const isVerticalLayout = selectedRatio === '9:16' || selectedRatio === '3:4';
  const compositionDimensions = useMemo(() => {
    return ASPECT_RATIO_DIMENSIONS[selectedRatio] || { width: 1080, height: 1920 };
  }, [selectedRatio]);
  const audioSilencePaddingMs = useMemo(() => {
    return normalizeSilencePaddingMs((project?.config as any)?.audioSilencePaddingMs);
  }, [project?.config?.audioSilencePaddingMs]);

  const silenceCompactionRanges = useMemo<TimelineKeepRange[]>(() => {
    if (!removeAudioSilences) {
      return [];
    }

    return buildSilenceCompactionRanges(project.segments, {
      mergeAdjacentRanges: false,
      preservePaddingMs: audioSilencePaddingMs,
    });
  }, [audioSilencePaddingMs, project.segments, removeAudioSilences]);

  const mutedBaseAudioRanges = useMemo<TimelineKeepRange[]>(() => {
    return normalizeAudioMutedRanges((project?.config as any)?.audioMutedRanges);
  }, [project?.config?.audioMutedRanges]);

  const activeRangeKeys = useMemo(() => {
    return silenceCompactionRanges.map(getKeepRangeKey);
  }, [silenceCompactionRanges]);

  const activeRangeKeySet = useMemo(() => new Set(activeRangeKeys), [activeRangeKeys]);

  const effectiveMutedBaseAudioRangeKeys = useMemo(() => {
    return mutedBaseAudioRanges
      .map(getKeepRangeKey)
      .filter((key) => activeRangeKeySet.has(key));
  }, [activeRangeKeySet, mutedBaseAudioRanges]);

  useEffect(() => {
    setSelectedBaseAudioRangeKeys((prev) => prev.filter((key) => activeRangeKeySet.has(key)));
  }, [activeRangeKeySet]);

  const originalDurationInSeconds = useMemo(() => {
    if (!project.segments.length) {
      return 10;
    }

    return project.segments.reduce((maxDuration, segment) => {
      return Math.max(maxDuration, Number(segment.end || 0));
    }, 0);
  }, [project.segments]);

  const visualSegments = useMemo(() => {
    if (!removeAudioSilences || silenceCompactionRanges.length === 0) {
      return project.segments;
    }

    return compactTimelineSegments(project.segments, silenceCompactionRanges);
  }, [project.segments, removeAudioSilences, silenceCompactionRanges]);

  const durationInSeconds = removeAudioSilences && silenceCompactionRanges.length > 0
    ? getCompactedDuration(silenceCompactionRanges, originalDurationInSeconds)
    : originalDurationInSeconds;

  const applyZoomAnchoredToPlayhead = useCallback((nextZoomOrUpdater: number | ((currentZoom: number) => number)) => {
    const currentZoom = zoomLevelRef.current;
    const requestedZoom = typeof nextZoomOrUpdater === 'function'
      ? nextZoomOrUpdater(currentZoom)
      : nextZoomOrUpdater;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, requestedZoom));

    if (Math.abs(nextZoom - currentZoom) < 0.001) {
      return;
    }

    setZoomLevel(nextZoom);

    requestAnimationFrame(() => {
      const scrollWrapper = scrollWrapperRef.current;
      if (!scrollWrapper) return;

      const playheadLeft = currentTimeRef.current * nextZoom;
      const nextTimelineWidth = Math.max((durationInSeconds + 10) * nextZoom, scrollWrapper.clientWidth);
      const maxScrollLeft = Math.max(0, nextTimelineWidth - scrollWrapper.clientWidth);
      const targetScrollLeft = Math.max(0, Math.min(playheadLeft - scrollWrapper.clientWidth / 2, maxScrollLeft));
      scrollWrapper.scrollLeft = targetScrollLeft;
    });
  }, [durationInSeconds]);

  const handleFileUploadToTrack = useCallback(async (type: 'video' | 'audio', trackId: number, file: File) => {
    if (!onSegmentsUpdate) return;
    const isVideo = file.type.startsWith('video');
    const isImage = file.type.startsWith('image');
    const isAudio = file.type.startsWith('audio');
    const selectedBaseRange = removeAudioSilences
      && type === 'audio'
      && selectedBaseAudioRangeKeys.length === 1
      ? silenceCompactionRanges.find((range) => getKeepRangeKey(range) === selectedBaseAudioRangeKeys[0]) || null
      : null;
    const sourceInsertionStart = removeAudioSilences
      ? selectedBaseRange?.sourceStart ?? mapOutputTimeToSourceTime(currentTimeRef.current, silenceCompactionRanges)
      : currentTimeRef.current;
    
    // Fallback se type for video mas for um arquivo de audio:
    const assetType = isVideo ? 'video_file' : isAudio ? 'audio' : isImage ? 'image_static' : 'image_static';

    const maxId = project.segments.reduce((acc, curr) => Math.max(acc, curr.id), 0);
    const newId = maxId + 1;

    let url = URL.createObjectURL(file);
    let assetDuration: number | undefined = 5; // Duração padrão

    if (window.electron?.videoProject?.saveImage) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await window.electron.videoProject.saveImage(arrayBuffer, file.name, newId);
        if (result.success && result.httpUrl) {
          url = result.httpUrl;
          if (result.durationMs) {
            assetDuration = Number((result.durationMs / 1000).toFixed(2));
          }
        }
      } catch (e) {
        console.error('Error saving track media:', e);
      }
    }

    const selectedBaseRangeDuration = selectedBaseRange
      ? Math.max(0.1, Number(selectedBaseRange.sourceEnd) - Number(selectedBaseRange.sourceStart))
      : null;
    const insertedDuration = selectedBaseRangeDuration != null
      ? Math.min(selectedBaseRangeDuration, assetDuration || selectedBaseRangeDuration)
      : (assetDuration || 5);

    const newSegment: any = {
      id: newId,
      text: '', // <-- Deixe vazio para não aparecer como legenda no vídeo
      fileName: file.name, // <-- Nova propriedade para guardar o nome na UI
      start: sourceInsertionStart,
      end: sourceInsertionStart + insertedDuration,
      speaker: 0,
      assetType: assetType,
      imageUrl: url,
      track: trackId,
      asset_duration: assetDuration,
    };

    let nextMutedRangesForHistory = mutedBaseAudioRanges;
    if (selectedBaseRange && onProjectConfigChange) {
      const mutedMap = new Map<string, TimelineKeepRange>();

      mutedBaseAudioRanges.forEach((range) => {
        mutedMap.set(getKeepRangeKey(range), range);
      });
      mutedMap.set(getKeepRangeKey(selectedBaseRange), selectedBaseRange);

      nextMutedRangesForHistory = Array.from(mutedMap.values());
      applyAudioMutedRangesChange(nextMutedRangesForHistory, {
        segments: project.segments,
        pushHistory: false,
      });
      setSelectedBaseAudioRangeKeys([]);
    }

    const updated = [...project.segments, newSegment];
    handleSegmentsChange(updated, {
      audioMutedRanges: nextMutedRangesForHistory,
    });
  }, [
    applyAudioMutedRangesChange,
    handleSegmentsChange,
    mutedBaseAudioRanges,
    onProjectConfigChange,
    onSegmentsUpdate,
    project.segments,
    removeAudioSilences,
    selectedBaseAudioRangeKeys,
    silenceCompactionRanges,
  ]);

  const handleSegmentMove = useCallback((id: number, newStart: number, newTrack: number, options?: { pushHistory?: boolean }) => {
    if (!onSegmentsUpdate) return;
    const sourceStart = removeAudioSilences
      ? mapOutputTimeToSourceTime(newStart, silenceCompactionRanges)
      : newStart;

    const updated = project.segments.map(s => {
      if (s.id === id) {
        const duration = s.end - s.start;
        return { ...s, start: sourceStart, end: sourceStart + duration, track: newTrack };
      }
      return s;
    });
    // Ordena pelo tempo de início para manter a timeline consistente
    updated.sort((a, b) => a.start - b.start);
    handleSegmentsChange(updated, { pushHistory: options?.pushHistory });
  }, [handleSegmentsChange, onSegmentsUpdate, project.segments, removeAudioSilences, silenceCompactionRanges]);

  const handleSegmentTrim = useCallback((id: number, newStart: number, newEnd: number, options?: { pushHistory?: boolean }) => {
    if (!onSegmentsUpdate) return;
    const sourceStart = removeAudioSilences
      ? mapOutputTimeToSourceTime(newStart, silenceCompactionRanges)
      : newStart;
    const sourceEnd = removeAudioSilences
      ? mapOutputTimeToSourceTime(newEnd, silenceCompactionRanges)
      : newEnd;

    const updated = project.segments.map(s => {
      if (s.id === id) {
        return { ...s, start: sourceStart, end: sourceEnd };
      }
      return s;
    });
    updated.sort((a, b) => a.start - b.start);
    handleSegmentsChange(updated, { pushHistory: options?.pushHistory });
  }, [handleSegmentsChange, onSegmentsUpdate, project.segments, removeAudioSilences, silenceCompactionRanges]);

  const handleBackClick = useCallback(() => {
    if (hasUnsavedChanges) {
      if (!window.confirm("Você tem alterações não salvas. Tem certeza que deseja voltar? As alterações podem ser perdidas.")) {
        return;
      }
    }
    onBack();
  }, [hasUnsavedChanges, onBack]);

  const handleSaveClick = useCallback(async () => {
    if (onSave) {
      setIsSaving(true);
      try {
        await onSave();
        setHasUnsavedChanges(false);
      } finally {
        setIsSaving(false);
      }
    }
  }, [onSave]);

  const toolbarBackRef = useRef<() => void>(() => {});
  const toolbarSaveRef = useRef<(() => void | Promise<void>) | undefined>(undefined);
  const toolbarExportRef = useRef<() => void>(() => {});

  useEffect(() => {
    toolbarBackRef.current = handleBackClick;
    toolbarSaveRef.current = onSave ? handleSaveClick : undefined;
    toolbarExportRef.current = onContinue;
  }, [handleBackClick, handleSaveClick, onContinue, onSave]);

  const stableToolbarBack = useCallback(() => {
    toolbarBackRef.current();
  }, []);

  const stableToolbarSave = useCallback(() => {
    return toolbarSaveRef.current?.();
  }, []);

  const stableToolbarExport = useCallback(() => {
    toolbarExportRef.current();
  }, []);

  const canSave = Boolean(onSave);

  // Publica ações do preview para a barra de janela da página.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('video-studio:preview-toolbar', {
        detail: {
          onBack: stableToolbarBack,
          onSave: canSave ? stableToolbarSave : undefined,
          onExport: stableToolbarExport,
          canSave,
          isSaving,
        },
      })
    );

    return () => {
      window.dispatchEvent(
        new CustomEvent('video-studio:preview-toolbar', {
          detail: null,
        })
      );
    };
  }, [stableToolbarBack, stableToolbarSave, stableToolbarExport, canSave, isSaving]);



  // Computations
  const totalTimelineWidth = Math.max((durationInSeconds + 10) * zoomLevel, viewportWidth);
  const hoveredSeg = hoveredSegment ? visualSegments.find(s => s.id === hoveredSegment.id) : null;
  const effectiveMutedBaseAudioRanges = useMemo<TimelineKeepRange[]>(() => {
    if (effectiveMutedBaseAudioRangeKeys.length === 0) {
      return [];
    }
    const mutedKeySet = new Set(effectiveMutedBaseAudioRangeKeys);
    return silenceCompactionRanges.filter((range) => mutedKeySet.has(getKeepRangeKey(range)));
  }, [effectiveMutedBaseAudioRangeKeys, silenceCompactionRanges]);

  // Preview project (sem Remotion)
  const previewProject = useMemo(() => {
    return {
      ...project,
      segments: visualSegments,
      subtitleMode,
      config: {
        ...(project.config || {}),
        width: compositionDimensions.width,
        height: compositionDimensions.height,
        fps: project.config?.fps || 30,
        fitVideoToScene,
        removeAudioSilences,
        audioKeepRanges: silenceCompactionRanges,
        audioMutedRanges: effectiveMutedBaseAudioRanges,
        componentsAllowed: selectedNiche?.components_allowed || project.componentsAllowed,
        defaultFont: selectedNiche?.default_font,
      },
    };
  }, [
    fitVideoToScene,
    compositionDimensions.height,
    compositionDimensions.width,
    project,
    removeAudioSilences,
    selectedNiche,
    silenceCompactionRanges,
    effectiveMutedBaseAudioRanges,
    subtitleMode,
    visualSegments,
  ]);
  
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

  const fps = 30;
  const durationInFrames = Math.ceil(durationInSeconds * fps);
  const getCssAspectRatio = (ratio: string) => ratio.replace(':', '/');
  const audioUrl = useMemo(() => audioPathToUrl(project.audioPath), [project.audioPath]);

  // ========================================
  // RECOVER VIDEO DURATIONS IF MISSING
  // ========================================
  useEffect(() => {
    if (!onSegmentsUpdate || !project?.segments?.length) return;

    let cancelled = false;
    const segmentsToUpdate = [...project.segments];
    const promises: Promise<void>[] = [];

    segmentsToUpdate.forEach((seg, index) => {
      const isVideoAsset = seg.assetType?.startsWith('video_') || (seg as any).asset_type?.startsWith('video_');
      const rawUrl = seg.imageUrl || (seg as any).asset_url;
      const isVideoFile = rawUrl && /\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(rawUrl);
      const isBlob = rawUrl?.startsWith('blob:');
      
      const isVideo = isVideoAsset || isVideoFile || isBlob;

      if (isVideo && rawUrl && !seg.asset_duration) {
        const probeKey = `${seg.id}|${rawUrl}`;
        if (durationProbeCacheRef.current.has(probeKey)) {
          return;
        }
        durationProbeCacheRef.current.add(probeKey);

        const promise = new Promise<void>((resolve) => {
          const video = document.createElement('video');
          video.preload = 'metadata';

          const cleanup = () => {
            video.onloadedmetadata = null;
            video.onerror = null;
            video.removeAttribute('src');
            try {
              video.load();
            } catch (_) {
              // no-op
            }
          };

          video.onloadedmetadata = () => {
            if (video.duration && video.duration !== Infinity && video.duration > 0) {
              segmentsToUpdate[index] = { ...seg, asset_duration: video.duration };
            }
            cleanup();
            resolve();
          };
          video.onerror = () => {
            cleanup();
            resolve();
          };
          video.src = rawUrl;
        });
        promises.push(promise);
      }
    });

    if (!promises.length) return;

    Promise.all(promises).then(() => {
      if (cancelled) return;
      // Atualizamos se foi encontrada ao menos uma duração nova
      const actuallyChanged = segmentsToUpdate.some((seg, i) => seg.asset_duration !== project.segments[i].asset_duration);
      if (actuallyChanged) {
        onSegmentsUpdate(segmentsToUpdate);
      }
    });

    return () => {
      cancelled = true;
    };
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
  }, [isVerticalLayout]); // Re-subscribe when layout changes (vertical vs horizontal)

  // ========================================
  // Atualiza playhead e timecode via DOM direto (sem re-render)
  // ========================================
  const updatePlayheadDOM = useCallback((time: number) => {
    const previousTime = lastPlayheadTimeRef.current;
    lastPlayheadTimeRef.current = time;
    currentTimeRef.current = time;
    const zoom = zoomLevelRef.current;
    const playheadX = time * zoom;

    if (playheadRef.current) {
      playheadRef.current.style.transform = `translateX(${playheadX}px)`;
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

    const scrollWrapper = scrollWrapperRef.current;
    if (scrollWrapper) {
      const viewportStart = scrollWrapper.scrollLeft;
      const viewportWidth = scrollWrapper.clientWidth;
      const viewportEnd = viewportStart + viewportWidth;
      const edgeMargin = Math.min(160, viewportWidth * 0.2);
      const movingForward = time >= previousTime;
      const isOutsideLeft = playheadX < viewportStart + edgeMargin;
      const isOutsideRight = playheadX > viewportEnd - edgeMargin;

      if (isOutsideLeft || isOutsideRight) {
        const anchorRatio = movingForward ? 0.35 : 0.65;
        const nextTimelineWidth = Math.max((durationInSeconds + 10) * zoom, viewportWidth);
        const maxScrollLeft = Math.max(0, nextTimelineWidth - viewportWidth);
        const targetScrollLeft = Math.max(
          0,
          Math.min(playheadX - viewportWidth * anchorRatio, maxScrollLeft)
        );

        scrollWrapper.scrollLeft = targetScrollLeft;
      }
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
    handleSegmentsChange(updated);
  }, [project.segments, handleSegmentsChange]);

  const handleTransformChange = useCallback((segmentId: number, transform: any) => {
    if (!onSegmentsUpdate) return;
    const updated = project.segments.map(seg =>
      seg.id === segmentId ? { ...seg, transform: { ...seg.transform, ...transform } } : seg
    );
    handleSegmentsChange(updated);
  }, [project.segments, handleSegmentsChange]);

  const handleApplyTransitionToAll = useCallback((transition: string) => {
    if (!onSegmentsUpdate) return;
    const updated = project.segments.map(seg => ({ ...seg, transition }));
    handleSegmentsChange(updated);
  }, [project.segments, handleSegmentsChange, onSegmentsUpdate]);

  const handleAudioChange = useCallback((audio: any, options?: { pushHistory?: boolean }) => {
    if (!onSegmentsUpdate || selectedSegmentIds.length === 0) return;
    const updated = project.segments.map(seg =>
      selectedSegmentIds.includes(seg.id) 
        ? { ...seg, audio: { ...seg.audio, ...audio } } 
        : seg
    );
    handleSegmentsChange(updated, { pushHistory: options?.pushHistory });
  }, [project.segments, selectedSegmentIds, handleSegmentsChange, onSegmentsUpdate]);

  const handleMainAudioVolumeChange = useCallback((volume: number) => {
    onMainAudioVolumeChange(volume);
    setHasUnsavedChanges(true);
  }, [onMainAudioVolumeChange]);

  const handleAudioSilencePaddingMsChange = useCallback((paddingMs: number) => {
    if (!onProjectConfigChange) return;
    const normalizedPaddingMs = normalizeSilencePaddingMs(paddingMs);
    onProjectConfigChange((prevConfig: any) => ({
      ...(prevConfig || {}),
      audioSilencePaddingMs: normalizedPaddingMs,
    }));
    setHasUnsavedChanges(true);
  }, [onProjectConfigChange]);

  const handleApplyPexelsVideoToSelected = useCallback((media: {
    type?: 'video' | 'photo';
    directUrl?: string;
    duration?: number;
  }) => {
    if (!onSegmentsUpdate || selectedSegmentIds.length === 0) return;

    const targetSegmentId = selectedSegmentIds[0];

    const mediaType = String(media?.type || 'video').toLowerCase();
    const isVideoMedia = mediaType === 'video';
    const directUrl = String(media?.directUrl || '').trim();
    if (!directUrl) return;

    const normalizedDuration = Number(media?.duration);
    const nextAssetDuration = Number.isFinite(normalizedDuration) && normalizedDuration > 0
      ? Number(normalizedDuration.toFixed(2))
      : undefined;

    const updated = project.segments.map((segment) => {
      if (segment.id !== targetSegmentId) {
        return segment;
      }

      if (isMotionGraphicsSegment(segment)) {
        return segment;
      }

      return {
        ...segment,
        assetType: isVideoMedia ? 'video_stock' : 'image_static',
        imageUrl: directUrl,
        asset_url: directUrl,
        generationService: 'pexels',
        asset_duration: isVideoMedia ? (nextAssetDuration ?? segment.asset_duration) : segment.asset_duration,
      };
    });

    handleSegmentsChange(updated);
  }, [handleSegmentsChange, onSegmentsUpdate, project.segments, selectedSegmentIds]);

  const handleLibraryMediaDropToTrack = useCallback((payload: {
    trackType: 'video' | 'audio';
    trackId: number;
    dropTime: number;
    media: {
      type?: 'video' | 'photo';
      directUrl?: string;
      duration?: number;
    };
  }) => {
    if (!onSegmentsUpdate) return;
    if (payload.trackType !== 'video') return;

    const mediaType = String(payload.media?.type || 'video').toLowerCase();
    const isVideoMedia = mediaType === 'video';
    const directUrl = String(payload.media?.directUrl || '').trim();
    if (!directUrl) return;

    const sourceInsertionStart = removeAudioSilences
      ? mapOutputTimeToSourceTime(payload.dropTime, silenceCompactionRanges)
      : payload.dropTime;
    const safeStart = Math.max(0, sourceInsertionStart);
    const rawDuration = Number(payload.media?.duration);
    const clipDuration = isVideoMedia && Number.isFinite(rawDuration) && rawDuration > 0
      ? Number(rawDuration.toFixed(2))
      : 5;

    const maxId = project.segments.reduce((acc, curr) => Math.max(acc, curr.id), 0);
    const newId = maxId + 1;
    const newSegment: any = {
      id: newId,
      text: '',
      start: safeStart,
      end: safeStart + clipDuration,
      speaker: 0,
      assetType: isVideoMedia ? 'video_stock' : 'image_static',
      imageUrl: directUrl,
      asset_url: directUrl,
      track: payload.trackId,
      generationService: 'pexels',
      ...(isVideoMedia && { asset_duration: clipDuration }),
    };

    const updated = [...project.segments, newSegment].sort((left, right) => left.start - right.start);
    handleSegmentsChange(updated);
    setSelectedSegmentIds([newId]);
  }, [
    handleSegmentsChange,
    onSegmentsUpdate,
    project.segments,
    removeAudioSilences,
    silenceCompactionRanges,
  ]);

  // ========================================
  // ACTIONS (SPLIT, DELETE)
  // ========================================
  const handleDeleteSegment = useCallback(() => {
    if (selectedBaseAudioRangeKeys.length > 0 && removeAudioSilences) {
      const selectedKeySet = new Set(selectedBaseAudioRangeKeys);
      const rangesToMute = silenceCompactionRanges.filter((range) => selectedKeySet.has(getKeepRangeKey(range)));
      if (rangesToMute.length > 0 && onProjectConfigChange) {
        const mutedMap = new Map<string, TimelineKeepRange>();

        mutedBaseAudioRanges.forEach((range) => {
          mutedMap.set(getKeepRangeKey(range), range);
        });
        rangesToMute.forEach((range) => mutedMap.set(getKeepRangeKey(range), range));

        applyAudioMutedRangesChange(Array.from(mutedMap.values()), {
          segments: project.segments,
        });
      }

      setSelectedSegmentIds([]);
      setSelectedBaseAudioRangeKeys([]);
      return;
    }

    if (selectedSegmentIds.length === 0) return;
    const newSegments = project.segments.filter(s => !selectedSegmentIds.includes(s.id));
    handleSegmentsChange(newSegments);
    setSelectedSegmentIds([]);
  }, [
    applyAudioMutedRangesChange,
    handleSegmentsChange,
    mutedBaseAudioRanges,
    onProjectConfigChange,
    project.segments,
    removeAudioSilences,
    selectedBaseAudioRangeKeys,
    selectedSegmentIds,
    silenceCompactionRanges,
  ]);

  const handleSplitSegment = useCallback(() => {
    if (selectedSegmentIds.length === 0) return;
    
    // Split all selected segments that intersect with playhead
    const currentTime = removeAudioSilences
      ? mapOutputTimeToSourceTime(currentTimeRef.current, silenceCompactionRanges)
      : currentTimeRef.current;
    let anySplit = false;
    let newSegments = [...project.segments];
    
    // For simplicity, we split only the segments that are currently selected AND contain the playhead
    selectedSegmentIds.forEach(id => {
      const segmentIndex = newSegments.findIndex(s => s.id === id);
      if (segmentIndex === -1) return;
      
      const segment = newSegments[segmentIndex];
      if (currentTime > segment.start + 0.1 && currentTime < segment.end - 0.1) {
        const maxId = newSegments.reduce((acc, curr) => Math.max(acc, curr.id), 0);
        const newId = maxId + 1;
        
        const firstHalf = { ...segment, end: currentTime };
        const secondHalf = { ...segment, id: newId, start: currentTime };
        
        newSegments.splice(segmentIndex, 1, firstHalf, secondHalf);
        anySplit = true;
      }
    });

    if (anySplit) {
      handleSegmentsChange(newSegments);
    }
  }, [handleSegmentsChange, project.segments, removeAudioSilences, selectedSegmentIds, silenceCompactionRanges]);

  // Segmento selecionado
  const selectedSegments = project.segments.filter(s => selectedSegmentIds.includes(s.id));
  const selectedSeg = selectedSegments.length > 0 ? selectedSegments[0] : null;
  const motionGraphicsSegments = useMemo(() => {
    return project.segments
      .filter((segment) => isMotionGraphicsSegment(segment))
      .sort((left, right) => {
        if ((left.track || 1) !== (right.track || 1)) {
          return Number(left.track || 1) - Number(right.track || 1);
        }
        return Number(left.start || 0) - Number(right.start || 0);
      });
  }, [project.segments]);
  const selectedMotionGraphicsSegment = useMemo(() => {
    const explicitSelection = motionGraphicsSegments.find((segment) => Number(segment.id) === selectedMotionGraphicsSegmentId);
    if (explicitSelection) {
      return explicitSelection;
    }

    return selectedSeg && isMotionGraphicsSegment(selectedSeg) ? selectedSeg : null;
  }, [motionGraphicsSegments, selectedMotionGraphicsSegmentId, selectedSeg]);
  const selectedMotionGraphicsData = useMemo(() => {
    return getMotionGraphicsData(selectedMotionGraphicsSegment);
  }, [selectedMotionGraphicsSegment]);
  const selectedMotionGraphicsCode = String(selectedMotionGraphicsData?.code || '').trim();
  const selectedMotionGraphicsMessages = useMemo<MotionGraphicsChatMessage[]>(() => {
    const persistedMessages = Array.isArray(selectedMotionGraphicsData?.messages)
      ? selectedMotionGraphicsData.messages
      : [];

    return persistedMessages
      .filter((message) => message?.role === 'user' || message?.role === 'assistant')
      .map((message, index) => ({
        id: `persisted-${message.role}-${Number(message.timestamp || 0)}-${index}`,
        role: message.role,
        content: String(message.content || ''),
        timestamp: Number(message.timestamp || Date.now()),
        provider: message.provider ? String(message.provider) : undefined,
        model: message.model ? String(message.model) : undefined,
        attachedImages: Array.isArray(message.attachedImages) ? message.attachedImages : undefined,
        skillsUsed: Array.isArray(message.skillsUsed) ? message.skillsUsed : undefined,
      }));
  }, [selectedMotionGraphicsData]);
  const selectedMotionGraphicsCompileError = useMemo(() => {
    if (!selectedMotionGraphicsCode) {
      return null;
    }

    return compileMotionGraphicsCode(selectedMotionGraphicsCode).error;
  }, [selectedMotionGraphicsCode]);
  const remotionDurationLabel = useMemo(() => {
    const targetDurationInSeconds = selectedMotionGraphicsSegment
      ? Math.max(0, Number(selectedMotionGraphicsSegment.end || 0) - Number(selectedMotionGraphicsSegment.start || 0))
      : durationInSeconds;
    const targetDurationInFrames = Math.max(1, Math.ceil(targetDurationInSeconds * fps));
    return `${formatTimecode(targetDurationInSeconds)} • ${targetDurationInFrames}f @ ${fps}fps`;
  }, [durationInSeconds, fps, selectedMotionGraphicsSegment]);
  const motionGraphicsClips = useMemo<MotionGraphicsClipSummary[]>(() => {
    return motionGraphicsSegments.map((segment) => {
      const motionGraphics = getMotionGraphicsData(segment);
      return {
        id: Number(segment.id),
        track: Number(segment.track || 1),
        start: Number(segment.start || 0),
        end: Number(segment.end || 0),
        label: getMotionGraphicsSegmentLabel(segment),
        hasCode: Boolean(String(motionGraphics?.code || '').trim()),
        messageCount: Array.isArray(motionGraphics?.messages) ? motionGraphics.messages.length : 0,
        updatedAt: typeof motionGraphics?.updatedAt === 'number' ? motionGraphics.updatedAt : undefined,
      };
    });
  }, [motionGraphicsSegments]);

  useEffect(() => {
    if (!selectedSeg || !isMotionGraphicsSegment(selectedSeg)) {
      return;
    }

    const nextId = Number(selectedSeg.id);
    setSelectedMotionGraphicsSegmentId((previous) => (previous === nextId ? previous : nextId));
  }, [selectedSeg]);

  useEffect(() => {
    if (
      selectedMotionGraphicsSegmentId != null
      && motionGraphicsSegments.some((segment) => Number(segment.id) === selectedMotionGraphicsSegmentId)
    ) {
      return;
    }

    const fallbackSegmentId = motionGraphicsSegments.length > 0
      ? Number(motionGraphicsSegments[0].id)
      : null;

    setSelectedMotionGraphicsSegmentId((previous) => (
      previous === fallbackSegmentId ? previous : fallbackSegmentId
    ));
  }, [motionGraphicsSegments, selectedMotionGraphicsSegmentId]);

  const updateMotionGraphicsSegment = useCallback((
    segmentId: number,
    updater: (segment: any) => any,
    options?: { pushHistory?: boolean },
  ) => {
    const updated = project.segments
      .map((segment) => {
        if (segment.id !== segmentId) {
          return segment;
        }

        return updater(segment);
      })
      .sort((left, right) => left.start - right.start);

    handleSegmentsChange(updated, { pushHistory: options?.pushHistory });
  }, [handleSegmentsChange, project.segments]);

  const createMotionGraphicsSegment = useCallback((options?: {
    motionGraphics?: any;
    pushHistory?: boolean;
  }) => {
    if (!onSegmentsUpdate) {
      return null;
    }

    const sourceReferenceSegment = selectedSeg
      && !isAudioProjectSegment(selectedSeg)
      && !isMotionGraphicsSegment(selectedSeg)
      ? selectedSeg
      : null;
    const sourceInsertionStart = removeAudioSilences
      ? mapOutputTimeToSourceTime(currentTimeRef.current, silenceCompactionRanges)
      : currentTimeRef.current;
    const nextId = project.segments.reduce((maxId, segment) => Math.max(maxId, Number(segment.id || 0)), 0) + 1;
    const start = sourceReferenceSegment
      ? Number(sourceReferenceSegment.start || 0)
      : Math.max(0, Number(sourceInsertionStart || 0));
    const duration = sourceReferenceSegment
      ? Math.max(0.5, Number(sourceReferenceSegment.end || 0) - Number(sourceReferenceSegment.start || 0))
      : 5;
    const track = sourceReferenceSegment
      ? Math.max(1, Number(sourceReferenceSegment.track || 1) + 1)
      : Math.max(1, videoTrackCount || 1);
    const newSegment: any = {
      id: nextId,
      text: '',
      fileName: `Remotion ${nextId}`,
      start,
      end: start + duration,
      speaker: 0,
      assetType: MOTION_GRAPHICS_ASSET_TYPE,
      track,
      motionGraphics: options?.motionGraphics,
    };

    const updated = [...project.segments, newSegment].sort((left, right) => left.start - right.start);
    handleSegmentsChange(updated, { pushHistory: options?.pushHistory });
    setSelectedSegmentIds([nextId]);
    setSelectedBaseAudioRangeKeys([]);
    setSelectedMotionGraphicsSegmentId(nextId);
    setMediaPanelTab('remotion');
    return newSegment;
  }, [
    handleSegmentsChange,
    onSegmentsUpdate,
    project.segments,
    removeAudioSilences,
    selectedSeg,
    silenceCompactionRanges,
    videoTrackCount,
  ]);

  useEffect(() => {
    if (legacyMotionGraphicsMigrationRef.current) {
      return;
    }

    const legacyCode = String(legacyMotionGraphicsSnapshot?.code || '').trim();
    const legacyMessages = Array.isArray(legacyMotionGraphicsSnapshot?.messages)
      ? legacyMotionGraphicsSnapshot.messages
      : [];

    if (!legacyCode && legacyMessages.length === 0) {
      legacyMotionGraphicsMigrationRef.current = true;
      return;
    }

    const alreadyMigrated = motionGraphicsSegments.some((segment) => {
      const motionGraphics = getMotionGraphicsData(segment);
      return String(motionGraphics?.code || '').trim() === legacyCode;
    });

    legacyMotionGraphicsMigrationRef.current = true;

    if (!alreadyMigrated) {
      const nextId = project.segments.reduce((maxId, segment) => Math.max(maxId, Number(segment.id || 0)), 0) + 1;
      const topVisualTrack = project.segments.reduce((maxTrack, segment) => {
        if (isAudioProjectSegment(segment)) {
          return maxTrack;
        }

        return Math.max(maxTrack, Number(segment.track || 1));
      }, 1);
      const migratedSegment = {
        id: nextId,
        text: '',
        fileName: 'Remotion legado',
        start: 0,
        end: Math.max(1, originalDurationInSeconds || 5),
        speaker: 0,
        assetType: MOTION_GRAPHICS_ASSET_TYPE,
        track: topVisualTrack + 1,
        motionGraphics: {
          code: legacyCode,
          title: 'Remotion legado',
          updatedAt: Date.now(),
          messages: legacyMessages,
        },
      };

      handleSegmentsChange(
        [...project.segments, migratedSegment].sort((left, right) => left.start - right.start),
        { pushHistory: true },
      );
      setSelectedSegmentIds([nextId]);
      setSelectedMotionGraphicsSegmentId(nextId);
      setMediaPanelTab('remotion');
    }

    if (onProjectConfigChange) {
      onProjectConfigChange((prevConfig: any) => {
        if (!prevConfig?.motionGraphics) {
          return prevConfig || {};
        }

        const nextConfig = { ...(prevConfig || {}) };
        delete nextConfig.motionGraphics;
        return nextConfig;
      });
    }
  }, [
    handleSegmentsChange,
    legacyMotionGraphicsSnapshot,
    motionGraphicsSegments,
    onProjectConfigChange,
    originalDurationInSeconds,
    project.segments,
  ]);

  const handleSelectMotionGraphicsSegment = useCallback((segmentId: number) => {
    setSelectedMotionGraphicsSegmentId(segmentId);
    setSelectedSegmentIds([segmentId]);
    setSelectedBaseAudioRangeKeys([]);
    setMediaPanelTab('remotion');
  }, []);

  const buildMotionGraphicsTitle = useCallback((segment: any, prompt: string, summary?: string) => {
    const currentTitle = String(segment?.motionGraphics?.title || '').trim();
    if (currentTitle) {
      return currentTitle;
    }

    const rawTitle = String(summary || prompt || '').replace(/\s+/g, ' ').trim();
    if (!rawTitle) {
      return `Remotion ${segment?.id ?? ''}`.trim();
    }

    return rawTitle.length > 34
      ? `${rawTitle.slice(0, 34).trimEnd()}...`
      : rawTitle;
  }, []);

  const handleResetMotionGraphics = useCallback(() => {
    if (!selectedMotionGraphicsSegment) {
      setMotionGraphicsGenerationError(null);
      return;
    }

    updateMotionGraphicsSegment(Number(selectedMotionGraphicsSegment.id), (segment) => ({
      ...segment,
      fileName: `Remotion ${segment.id}`,
      motionGraphics: undefined,
    }), { pushHistory: true });
    setMotionGraphicsGenerationError(null);
  }, [selectedMotionGraphicsSegment, updateMotionGraphicsSegment]);

  const handleSubmitMotionGraphics = useCallback(async (
    promptText: string,
    options?: {
      attachedImages?: MotionGraphicsReferenceImage[];
      selectedSkills?: string[];
      provider?: 'gemini' | 'openai' | 'deepseek';
      model?: string;
    },
  ) => {
    const normalizedPrompt = String(promptText || '').trim();
    if (!normalizedPrompt || isMotionGraphicsGenerating) {
      return false;
    }

    const generateMotionGraphics = window.electron?.videoProject?.generateMotionGraphics;
    if (!generateMotionGraphics) {
      setMotionGraphicsGenerationError('Geração de motion graphics não disponível neste build.');
      return false;
    }

    const targetSegment = selectedMotionGraphicsSegment || createMotionGraphicsSegment({ pushHistory: false });
    if (!targetSegment) {
      return false;
    }

    const currentMotionGraphics = getMotionGraphicsData(targetSegment);
    const persistedMessages = Array.isArray(currentMotionGraphics?.messages)
      ? currentMotionGraphics.messages
      : [];
    const attachedImages = Array.isArray(options?.attachedImages)
      ? options!.attachedImages.filter((image) => image?.url || image?.path || image?.dataUrl)
      : [];
    const selectedSkills = Array.isArray(options?.selectedSkills)
      ? options.selectedSkills
        .map((skill) => String(skill || '').trim())
        .filter(Boolean)
      : [];
    const selectedProvider = options?.provider;
    const selectedModel = typeof options?.model === 'string' ? options.model.trim() : '';
    const userMessage = createMotionGraphicsMessage('user', normalizedPrompt, {
      attachedImages: attachedImages.length > 0 ? attachedImages : undefined,
    });
    const conversationHistory = [
      ...persistedMessages.map((message) => ({
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        provider: message.provider,
        model: message.model,
        attachedImages: message.attachedImages,
        skillsUsed: message.skillsUsed,
      })),
      {
        role: 'user' as const,
        content: normalizedPrompt,
        timestamp: userMessage.timestamp,
        attachedImages: attachedImages.length > 0 ? attachedImages : undefined,
      },
    ];

    setMotionGraphicsGenerationError(null);
    setIsMotionGraphicsGenerating(true);
    setMediaPanelTab('remotion');
    setSelectedMotionGraphicsSegmentId(Number(targetSegment.id));
    setSelectedSegmentIds([Number(targetSegment.id)]);
    setSelectedBaseAudioRangeKeys([]);

    try {
      const contextSegment = selectedSeg && !isAudioProjectSegment(selectedSeg)
        ? selectedSeg
        : targetSegment;
      const result = await generateMotionGraphics({
        prompt: normalizedPrompt,
        currentCode: String(currentMotionGraphics?.code || '').trim() || undefined,
        conversationHistory,
        referenceImages: attachedImages,
        selectedSkills,
        provider: selectedProvider,
        model: selectedModel || undefined,
        projectContext: {
          title: project.title,
          description: project.description,
          selectedRatio,
          durationInFrames,
          fps,
          selectedSegment: contextSegment ? {
            id: contextSegment.id,
            text: contextSegment.text,
            start: contextSegment.start,
            end: contextSegment.end,
            sceneDescription: contextSegment.sceneDescription,
            imagePrompt: contextSegment.imagePrompt,
          } : null,
          segments: project.segments.slice(0, 12).map((segment) => ({
            id: segment.id,
            text: segment.text,
            start: segment.start,
            end: segment.end,
            sceneDescription: segment.sceneDescription,
            imagePrompt: segment.imagePrompt,
          })),
        },
      }) as {
        success: boolean;
        code?: string;
        summary?: string;
        providerUsed?: string;
        modelUsed?: string;
        skillsUsed?: string[];
        error?: string;
      };

      if (!result?.success || !result.code) {
        throw new Error(result?.error || 'A IA não retornou uma composição válida.');
      }

      const assistantSummary = result.summary || (currentMotionGraphics?.code ? 'Composição atualizada.' : 'Nova composição criada.');
      const assistantMessage = createMotionGraphicsMessage(
        'assistant',
        assistantSummary,
        {
          provider: result.providerUsed,
          model: result.modelUsed,
          skillsUsed: Array.isArray(result.skillsUsed) ? result.skillsUsed : undefined,
        },
      );

      updateMotionGraphicsSegment(Number(targetSegment.id), (segment) => ({
        ...segment,
        motionGraphics: {
          code: result.code,
          title: buildMotionGraphicsTitle(segment, normalizedPrompt, assistantSummary),
          updatedAt: Date.now(),
          messages: [
            ...persistedMessages,
            {
              role: 'user' as const,
              content: normalizedPrompt,
              timestamp: userMessage.timestamp,
              attachedImages: attachedImages.length > 0 ? attachedImages : undefined,
            },
            {
              role: 'assistant' as const,
              content: assistantMessage.content,
              timestamp: assistantMessage.timestamp,
              provider: assistantMessage.provider,
              model: assistantMessage.model,
              skillsUsed: assistantMessage.skillsUsed,
            },
          ],
        },
      }), { pushHistory: true });
      return true;
    } catch (error: any) {
      setMotionGraphicsGenerationError(error?.message || 'Falha ao gerar a composição Remotion.');
      return false;
    } finally {
      setIsMotionGraphicsGenerating(false);
    }
  }, [
    buildMotionGraphicsTitle,
    createMotionGraphicsSegment,
    durationInFrames,
    fps,
    isMotionGraphicsGenerating,
    project.description,
    project.segments,
    project.title,
    selectedRatio,
    selectedSeg,
    selectedMotionGraphicsSegment,
    updateMotionGraphicsSegment,
  ]);

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
      applyZoomAnchoredToPlayhead(startZoom + (deltaX * 0.5));
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

  const handleZoomIn = () => applyZoomAnchoredToPlayhead(z => z * 1.5);
  const handleZoomOut = () => applyZoomAnchoredToPlayhead(z => z / 1.5);

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

  const handleBackgroundClick = () => {
    setSelectedSegmentIds([]);
    setSelectedBaseAudioRangeKeys([]);
  };

  // Progress bar seek
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(pct * durationInSeconds);
  };



  // ========================================
  // ESTADOS E LÓGICA DE RESIZE DOS PAINÉIS
  // ========================================
  const [sidebarWidth, setSidebarWidth] = useState(340);
  const [mediaPanelWidth, setMediaPanelWidth] = useState(320);
  const [playerPanelWidth, setPlayerPanelWidth] = useState(360);
  const [timelineHeight, setTimelineHeight] = useState(300);

  // Função genérica para lidar com o arraste das divisórias
  const startResize = (
    e: React.MouseEvent,
    setter: React.Dispatch<React.SetStateAction<number>>,
    isHorizontal: boolean,
    invert: boolean,
    min: number,
    max: number
  ) => {
    e.preventDefault();
    let lastPos = isHorizontal ? e.clientX : e.clientY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentPos = isHorizontal ? moveEvent.clientX : moveEvent.clientY;
      const delta = currentPos - lastPos;
      lastPos = currentPos;

      setter(prev => {
        // Se invert for true, mover o mouse para a direita/baixo diminui o tamanho do painel
        const newVal = invert ? prev - delta : prev + delta;
        return Math.min(Math.max(newVal, min), max);
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      // Força a timeline a recalcular largura após o resize da janela
      setViewportWidth(scrollWrapperRef.current?.clientWidth || 1000);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Componente visual da Divisória
  const Divider = ({ onMouseDown, isHorizontal }: { onMouseDown: (e: React.MouseEvent) => void, isHorizontal?: boolean }) => (
    <div
      onMouseDown={onMouseDown}
      className={`flex-shrink-0 bg-transparent transition-colors z-10 ${
        isHorizontal ? 'h-1 w-full cursor-row-resize' : 'w-1 h-full cursor-col-resize'
      }`}
    />
  );

  return (
    <div 
      className="flex flex-col w-full h-full overflow-hidden bg-filmora-bg text-filmora-text font-sans"
    >
      {/* Container principal com fundo escuro para criar os "espaços" entre os painéis */}
      <div className={`flex flex-1 min-h-0 overflow-hidden bg-[#0d0d0d] p-px ${isVerticalLayout ? 'flex-row' : 'flex-col'}`}>
        {isVerticalLayout ? (
          <>
            {/* COLUNA ESQUERDA (Mídia, Sidebar, Timeline) */}
            <div className="flex flex-col flex-1 min-w-0 h-full">
              
              {/* Linha Superior da Coluna Esquerda */}
              <div className="flex flex-1 min-h-0">
                {/* Painel de Mídia */}
                <div className="flex-1 min-w-0 bg-filmora-panel rounded-md border border-filmora-border overflow-hidden">
                  <MediaPanel
                  activeTab={mediaPanelTab}
                  onActiveTabChange={setMediaPanelTab}
                  selectedRatio={selectedRatio}
                  selectedSeg={selectedSeg}
                  onApplyPexelsVideoToSelected={handleApplyPexelsVideoToSelected}
                    remotionClips={motionGraphicsClips}
                    selectedRemotionClipId={selectedMotionGraphicsSegment ? Number(selectedMotionGraphicsSegment.id) : null}
                    onSelectRemotionClip={handleSelectMotionGraphicsSegment}
                    onCreateRemotionClip={() => createMotionGraphicsSegment({ pushHistory: true })}
                    remotionMessages={selectedMotionGraphicsMessages}
                    onRemotionSubmit={handleSubmitMotionGraphics}
                    isRemotionGenerating={isMotionGraphicsGenerating}
                    remotionGenerationError={motionGraphicsGenerationError}
                    remotionCompileError={selectedMotionGraphicsCompileError}
                    hasRemotionCode={Boolean(selectedMotionGraphicsCode)}
                    onResetRemotion={handleResetMotionGraphics}
                    remotionDurationLabel={remotionDurationLabel}
                  />
                </div>
                
                {/* Divisória Vertical (Mídia | Sidebar) */}
                <Divider onMouseDown={(e) => startResize(e, setSidebarWidth, true, true, 220, 680)} />

                {/* Sidebar */}
                <div 
                  className="shrink-0 bg-filmora-panel rounded border border-filmora-border flex flex-col overflow-hidden"
                  style={{ width: `${sidebarWidth}px` }}
                >
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
                    handleTransformChange={handleTransformChange}
                    handleAudioChange={handleAudioChange}
                    fitVideoToScene={fitVideoToScene}
                    onFitVideoToSceneChange={(val) => { onFitVideoToSceneChange(val); setHasUnsavedChanges(true); }}
                    removeAudioSilences={removeAudioSilences}
                    onRemoveAudioSilencesChange={(val) => { onRemoveAudioSilencesChange(val); setHasUnsavedChanges(true); }}
                    audioSilencePaddingMs={audioSilencePaddingMs}
                    onAudioSilencePaddingMsChange={handleAudioSilencePaddingMsChange}
                    mainAudioVolume={mainAudioVolume}
                    handleMainAudioVolumeChange={handleMainAudioVolumeChange}
                  />
                </div>
              </div>

              {/* Divisória Horizontal (Cima | Timeline) */}
              <Divider isHorizontal onMouseDown={(e) => startResize(e, setTimelineHeight, false, true, 150, 600)} />

              {/* Timeline */}
              <div 
                className="flex flex-col flex-shrink-0 bg-filmora-bg rounded border border-filmora-border"
                style={{ height: `${timelineHeight}px` }}
              >
                <TimelineToolbar 
                   zoomLevel={zoomLevel} 
                   onZoomChange={applyZoomAnchoredToPlayhead} 
                   handleZoomIn={handleZoomIn} 
                   handleZoomOut={handleZoomOut} 
                   onUndo={handleUndo} 
                   onRedo={handleRedo} 
                   onSplit={handleSplitSegment} 
                   onDelete={handleDeleteSegment} 
                   canUndo={historyIndex > 0} 
                   canRedo={historyIndex < history.length - 1} 
                   canSplit={selectedSegmentIds.length > 0} 
                   canDelete={selectedSegmentIds.length > 0 || selectedBaseAudioRangeKeys.length > 0} 
                />
                <Timeline 
                   visualSegments={visualSegments} 
                   durationInSeconds={durationInSeconds} 
                   audioUrl={audioUrl} 
                   audioKeepRanges={removeAudioSilences ? silenceCompactionRanges : undefined}
                   selectedBaseAudioRangeKeys={selectedBaseAudioRangeKeys}
                   mutedBaseAudioRangeKeys={effectiveMutedBaseAudioRangeKeys}
                   onSelectedBaseAudioRangeKeysChange={setSelectedBaseAudioRangeKeys}
                   zoomLevel={zoomLevel} 
                   viewportWidth={viewportWidth} 
                   totalTimelineWidth={totalTimelineWidth} 
                   selectedSegmentIds={selectedSegmentIds} 
                   setSelectedSegmentIds={setSelectedSegmentIds} 
                   videoTrackCount={videoTrackCount} 
                   audioTrackCount={audioTrackCount} 
                   onAddVideoTrack={handleAddVideoTrack} 
                   onAddAudioTrack={handleAddAudioTrack} 
                   onFileUploadToTrack={handleFileUploadToTrack} 
                   onLibraryMediaDrop={handleLibraryMediaDropToTrack}
                   onSegmentMove={handleSegmentMove} 
                   onSegmentTrim={handleSegmentTrim} 
                   onAudioChange={handleAudioChange} 
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
                   currentTimeRef={currentTimeRef} 
                />
              </div>
            </div>

            {/* Divisória Vertical (Esquerda | Player) */}
            <Divider onMouseDown={(e) => startResize(e, setPlayerPanelWidth, true, true, 220, 900)} />

            {/* COLUNA DIREITA (Player) */}
            <div 
              className="shrink-0 flex flex-col h-full bg-black rounded overflow-hidden"
              style={{ width: `${playerPanelWidth}px` }}
            >
              <PlayerArea 
                 previewMode="timeline"
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
                 previewProject={previewProject} 
                 durationInFrames={durationInFrames} 
                 fps={fps} 
                 handlePlayerReady={handlePlayerReady} 
                 getCssAspectRatio={getCssAspectRatio} 
                 compositionWidth={compositionDimensions.width}
                 compositionHeight={compositionDimensions.height}
                 motionGraphicsComponent={null}
                 motionGraphicsError={null}
                 isMotionGraphicsCompiling={false}
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
            </div>
          </>
        ) : (
          <>
            {/* LAYOUT HORIZONTAL (Cima: Mídia | Player | Sidebar) */}
            <div className="flex flex-1 min-h-0">
              {/* Painel de Mídia */}
              <div 
                className="shrink-0 bg-filmora-panel rounded border border-filmora-border overflow-hidden"
                style={{ width: `${mediaPanelWidth}px` }}
              >
                <MediaPanel
                  activeTab={mediaPanelTab}
                  onActiveTabChange={setMediaPanelTab}
                  selectedRatio={selectedRatio}
                  selectedSeg={selectedSeg}
                  onApplyPexelsVideoToSelected={handleApplyPexelsVideoToSelected}
                  remotionClips={motionGraphicsClips}
                  selectedRemotionClipId={selectedMotionGraphicsSegment ? Number(selectedMotionGraphicsSegment.id) : null}
                  onSelectRemotionClip={handleSelectMotionGraphicsSegment}
                  onCreateRemotionClip={() => createMotionGraphicsSegment({ pushHistory: true })}
                  remotionMessages={selectedMotionGraphicsMessages}
                  onRemotionSubmit={handleSubmitMotionGraphics}
                  isRemotionGenerating={isMotionGraphicsGenerating}
                  remotionGenerationError={motionGraphicsGenerationError}
                  remotionCompileError={selectedMotionGraphicsCompileError}
                  hasRemotionCode={Boolean(selectedMotionGraphicsCode)}
                  onResetRemotion={handleResetMotionGraphics}
                  remotionDurationLabel={remotionDurationLabel}
                />
              </div>

              {/* Divisória Vertical */}
              <Divider onMouseDown={(e) => startResize(e, setMediaPanelWidth, true, false, 180, 1100)} />

              {/* Player (Ocupa o centro livre) */}
              <div className="flex-1 min-w-[200px] flex flex-col h-full bg-black rounded overflow-hidden">
                <PlayerArea 
                   previewMode="timeline"
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
                   previewProject={previewProject} 
                   durationInFrames={durationInFrames} 
                   fps={fps} 
                   handlePlayerReady={handlePlayerReady} 
                   getCssAspectRatio={getCssAspectRatio} 
                   compositionWidth={compositionDimensions.width}
                   compositionHeight={compositionDimensions.height}
                   motionGraphicsComponent={null}
                   motionGraphicsError={null}
                   isMotionGraphicsCompiling={false}
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
              </div>

              {/* Divisória Vertical */}
              <Divider onMouseDown={(e) => startResize(e, setSidebarWidth, true, true, 220, 680)} />

              {/* Sidebar */}
              <div 
                className="shrink-0 bg-filmora-panel rounded border border-filmora-border flex flex-col"
                style={{ width: `${sidebarWidth}px` }}
              >
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
                   handleTransformChange={handleTransformChange} 
                   handleAudioChange={handleAudioChange} 
                   fitVideoToScene={fitVideoToScene} 
                   onFitVideoToSceneChange={(val) => { onFitVideoToSceneChange(val); setHasUnsavedChanges(true); }} 
                   removeAudioSilences={removeAudioSilences}
                   onRemoveAudioSilencesChange={(val) => { onRemoveAudioSilencesChange(val); setHasUnsavedChanges(true); }}
                   audioSilencePaddingMs={audioSilencePaddingMs}
                   onAudioSilencePaddingMsChange={handleAudioSilencePaddingMsChange}
                   mainAudioVolume={mainAudioVolume} 
                   handleMainAudioVolumeChange={handleMainAudioVolumeChange} 
                />
              </div>
            </div>

            {/* Divisória Horizontal */}
            <Divider isHorizontal onMouseDown={(e) => startResize(e, setTimelineHeight, false, true, 150, 600)} />

            {/* LAYOUT HORIZONTAL (Baixo: Timeline) */}
            <div 
              className="flex flex-col flex-shrink-0 bg-filmora-bg rounded border border-filmora-border"
              style={{ height: `${timelineHeight}px` }}
            >
              <TimelineToolbar 
                 zoomLevel={zoomLevel} 
                 onZoomChange={applyZoomAnchoredToPlayhead} 
                 handleZoomIn={handleZoomIn} 
                 handleZoomOut={handleZoomOut} 
                 onUndo={handleUndo} 
                 onRedo={handleRedo} 
                 onSplit={handleSplitSegment} 
                 onDelete={handleDeleteSegment} 
                 canUndo={historyIndex > 0} 
                 canRedo={historyIndex < history.length - 1} 
                 canSplit={selectedSegmentIds.length > 0} 
                 canDelete={selectedSegmentIds.length > 0 || selectedBaseAudioRangeKeys.length > 0} 
              />
              <Timeline 
                 visualSegments={visualSegments} 
                 durationInSeconds={durationInSeconds} 
                 audioUrl={audioUrl} 
                 audioKeepRanges={removeAudioSilences ? silenceCompactionRanges : undefined}
                 selectedBaseAudioRangeKeys={selectedBaseAudioRangeKeys}
                 mutedBaseAudioRangeKeys={effectiveMutedBaseAudioRangeKeys}
                 onSelectedBaseAudioRangeKeysChange={setSelectedBaseAudioRangeKeys}
                 zoomLevel={zoomLevel} 
                 viewportWidth={viewportWidth} 
                 totalTimelineWidth={totalTimelineWidth} 
                 selectedSegmentIds={selectedSegmentIds} 
                 setSelectedSegmentIds={setSelectedSegmentIds} 
                 videoTrackCount={videoTrackCount} 
                 audioTrackCount={audioTrackCount} 
                 onAddVideoTrack={handleAddVideoTrack} 
                 onAddAudioTrack={handleAddAudioTrack} 
                 onFileUploadToTrack={handleFileUploadToTrack} 
                 onLibraryMediaDrop={handleLibraryMediaDropToTrack}
                 onSegmentMove={handleSegmentMove} 
                 onSegmentTrim={handleSegmentTrim} 
                 onAudioChange={handleAudioChange} 
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
                 currentTimeRef={currentTimeRef} 
              />
            </div>
          </>
        )}
      </div>
    </div>
  );

}
