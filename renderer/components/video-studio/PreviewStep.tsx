import React, { useState, useRef, useEffect, useCallback, useMemo, useReducer } from 'react';
import { ProjectState } from '../../types/video-studio';
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
  // Aspect ratio
  const [selectedRatio, setSelectedRatio] = useState<string>(() => {
    return project.selectedAspectRatios?.[0] || '9:16';
  });
  const [showRatioMenu, setShowRatioMenu] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'info' | 'transitions'>('info');

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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

  const silenceCompactionRanges = useMemo<TimelineKeepRange[]>(() => {
    if (!removeAudioSilences) {
      return [];
    }

    return buildSilenceCompactionRanges(project.segments, {
      mergeAdjacentRanges: false,
    });
  }, [project.segments, removeAudioSilences]);

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
    const dims = ASPECT_RATIO_DIMENSIONS[selectedRatio] || { width: 1080, height: 1920 };
    return {
      ...project,
      segments: visualSegments,
      subtitleMode,
      config: {
        ...(project.config || {}),
        width: dims.width,
        height: dims.height,
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
    project,
    removeAudioSilences,
    selectedNiche,
    selectedRatio,
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
  const [sidebarWidth, setSidebarWidth] = useState(350);
  const [mediaPanelWidth, setMediaPanelWidth] = useState(280);
  const [playerPanelWidth, setPlayerPanelWidth] = useState(400);
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
                <div className="flex-1 overflow-y-auto filmora-scrollbar flex items-center justify-center bg-filmora-panel rounded-md border border-filmora-border text-xs text-filmora-textMuted">
                  [ Painel de Mídia / Biblioteca ]
                </div>
                
                {/* Divisória Vertical (Mídia | Sidebar) */}
                <Divider onMouseDown={(e) => startResize(e, setSidebarWidth, true, true, 250, 600)} />

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
            <Divider onMouseDown={(e) => startResize(e, setPlayerPanelWidth, true, true, 300, 800)} />

            {/* COLUNA DIREITA (Player) */}
            <div 
              className="shrink-0 flex flex-col h-full bg-black rounded overflow-hidden"
              style={{ width: `${playerPanelWidth}px` }}
            >
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
                 previewProject={previewProject} 
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
            </div>
          </>
        ) : (
          <>
            {/* LAYOUT HORIZONTAL (Cima: Mídia | Player | Sidebar) */}
            <div className="flex flex-1 min-h-0">
              {/* Painel de Mídia */}
              <div 
                className="shrink-0 flex items-center justify-center bg-filmora-panel rounded border border-filmora-border text-xs text-filmora-textMuted"
                style={{ width: `${mediaPanelWidth}px` }}
              >
                [ Painel de Mídia / Biblioteca ]
              </div>

              {/* Divisória Vertical */}
              <Divider onMouseDown={(e) => startResize(e, setMediaPanelWidth, true, false, 200, 500)} />

              {/* Player (Ocupa o centro livre) */}
              <div className="flex-1 min-w-[300px] flex flex-col h-full bg-black rounded overflow-hidden">
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
                   previewProject={previewProject} 
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
              </div>

              {/* Divisória Vertical */}
              <Divider onMouseDown={(e) => startResize(e, setSidebarWidth, true, true, 250, 600)} />

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
