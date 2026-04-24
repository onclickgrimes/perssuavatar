import React, { useRef, useEffect, useState, useMemo, useImperativeHandle, useCallback } from 'react';
import { calculatePlaybackRate } from '../../../remotion/utils/playback-rate';
import {
  mapOutputTimeToSourceTime,
  type TimelineKeepRange,
} from '../../../remotion/utils/silence-compaction';
import { MotionGraphicsTimelineLayer } from './preview-step/motion-graphics/MotionGraphicsTimelineLayer';
import {
  getMotionGraphicsData,
  isMotionGraphicsSegment,
} from './preview-step/motion-graphics/types';

interface TimelineSegment {
  id: number | string;
  start: number;
  end: number;
  track?: number;
  fileName?: string;
  transition?: string;
  transition_duration?: number;
  transitionDuration?: number;
  imageUrl?: string;
  asset_url?: string;
  assetType?: string;
  asset_type?: string;
  asset_duration?: number;
  assetDuration?: number;
  background?: { url?: string };
  transform?: {
    scale?: number;
    positionX?: number;
    positionY?: number;
    opacity?: number;
  };
  audio?: {
    volume?: number;
    fadeIn?: number;
    fadeOut?: number;
  };
  motionGraphics?: {
    code?: string;
    title?: string;
    updatedAt?: number;
    messages?: Array<{
      role: 'user' | 'assistant';
      content: string;
      timestamp?: number;
      provider?: string;
      model?: string;
    }>;
  };
}

const VIDEO_EXT_RE = /\.(mp4|webm|mov|mkv|avi|m4v)(\?.*)?$/i;
const AUDIO_EXT_RE = /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?)(\?.*)?$/i;
const PRELOAD_BEFORE_SEC = 1.5;
const PRELOAD_AFTER_SEC = 3;
const DEFAULT_TRANSITION_DURATION_SEC = 0.5;

const normalizeMediaUrl = (rawUrl?: string) => {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('http') || rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
    return rawUrl;
  }
  const filename = rawUrl.split(/[/\\]/).pop();
  return filename ? `http://localhost:9999/${filename}` : rawUrl;
};

const clampVolume = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const toPositiveNumber = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
};
const getRangeIndexForOutputTime = (timeSec: number, ranges: TimelineKeepRange[]) => {
  for (let index = 0; index < ranges.length; index++) {
    const range = ranges[index];
    if (timeSec >= range.outputStart && timeSec < range.outputEnd) {
      return index;
    }
  }

  return -1;
};

const isOutputTimeInRanges = (timeSec: number, ranges: TimelineKeepRange[]) => {
  return ranges.some((range) => timeSec >= range.outputStart && timeSec < range.outputEnd);
};
const isVideoSegment = (segment: TimelineSegment, url: string) => {
  // Prioriza o tipo REAL da mídia pela URL para evitar mismatch
  // (ex.: assetType "video_*" com imagem estática enviada manualmente).
  if (AUDIO_EXT_RE.test(url)) return false;
  if (IMAGE_EXT_RE.test(url) || url.startsWith('data:image/')) return false;
  if (VIDEO_EXT_RE.test(url) || url.startsWith('blob:')) return true;

  const assetType = (segment.assetType || segment.asset_type || '').toLowerCase();
  if (assetType.startsWith('audio')) return false;
  if (assetType.startsWith('video')) return true;
  return false;
};

const isAudioSegment = (segment: TimelineSegment, url: string) => {
  // Prioriza o tipo REAL da mídia pela URL.
  if (AUDIO_EXT_RE.test(url)) return true;
  if (IMAGE_EXT_RE.test(url) || url.startsWith('data:image/')) return false;
  if (VIDEO_EXT_RE.test(url) || url.startsWith('blob:')) return false;

  const assetType = (segment.assetType || segment.asset_type || '').toLowerCase();
  if (assetType.startsWith('audio')) return true;
  if (assetType.startsWith('video')) return false;
  return false;
};

const getActiveSegmentsAtTime = (segments: TimelineSegment[], timeSec: number) => {
  return segments
    .filter((segment) => segment.start <= timeSec && segment.end > timeSec)
    .sort((a, b) => {
      const trackA = a.track || 1;
      const trackB = b.track || 1;
      if (trackA !== trackB) return trackA - trackB;
      return a.start - b.start;
    });
};

type TransitionStyles = {
  opacity?: number;
  transform?: string;
  filter?: string;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const normalizeTransitionType = (transition: unknown): string => {
  const normalized = String(transition || 'fade').trim().toLowerCase();
  return normalized || 'fade';
};

const getTransitionDurationSec = (segment?: TimelineSegment | null): number => {
  if (!segment) return DEFAULT_TRANSITION_DURATION_SEC;
  const raw = Number(segment.transition_duration ?? segment.transitionDuration ?? DEFAULT_TRANSITION_DURATION_SEC);
  if (!Number.isFinite(raw)) return DEFAULT_TRANSITION_DURATION_SEC;
  return Math.max(0, raw);
};

const getTransitionStyles = (
  transitionType: string,
  progress: number,
  isEntering: boolean,
): TransitionStyles => {
  const safeProgress = clamp01(progress);
  const enterOpacity = safeProgress;
  const exitOpacity = 1 - safeProgress;
  const normalizedTransition = normalizeTransitionType(transitionType);

  switch (normalizedTransition) {
    case 'none':
      return {};
    case 'slide_left': {
      const x = isEntering ? (1 - safeProgress) * 100 : -safeProgress * 100;
      return { transform: `translateX(${x}%)` };
    }
    case 'slide_right': {
      const x = isEntering ? (safeProgress - 1) * 100 : safeProgress * 100;
      return { transform: `translateX(${x}%)` };
    }
    case 'slide_up': {
      const y = isEntering ? (1 - safeProgress) * 100 : -safeProgress * 100;
      return { transform: `translateY(${y}%)` };
    }
    case 'slide_down': {
      const y = isEntering ? (safeProgress - 1) * 100 : safeProgress * 100;
      return { transform: `translateY(${y}%)` };
    }
    case 'zoom_in': {
      const scale = isEntering
        ? 0.85 + (safeProgress * 0.15)
        : 1 + (safeProgress * 0.15);
      return {
        opacity: isEntering ? enterOpacity : exitOpacity,
        transform: `scale(${scale})`,
      };
    }
    case 'zoom_out': {
      const scale = isEntering
        ? 1.15 - (safeProgress * 0.15)
        : 1 - (safeProgress * 0.15);
      return {
        opacity: isEntering ? enterOpacity : exitOpacity,
        transform: `scale(${scale})`,
      };
    }
    case 'blur': {
      const blurPx = isEntering ? (1 - safeProgress) * 12 : safeProgress * 12;
      return {
        opacity: isEntering ? enterOpacity : exitOpacity,
        filter: `blur(${blurPx.toFixed(2)}px)`,
      };
    }
    case 'glitch': {
      const jitter = isEntering ? (1 - safeProgress) * 12 : safeProgress * 12;
      const direction = isEntering ? 1 : -1;
      return {
        opacity: isEntering ? enterOpacity : exitOpacity,
        transform: `translateX(${(jitter * direction).toFixed(2)}px)`,
        filter: `hue-rotate(${(jitter * 2).toFixed(2)}deg)`,
      };
    }
    case 'zoom_transition':
      return {
        opacity: isEntering ? enterOpacity : exitOpacity,
        transform: isEntering
          ? `scale(${(0.9 + safeProgress * 0.1).toFixed(4)})`
          : `scale(${(1 + safeProgress * 0.35).toFixed(4)})`,
      };
    case 'fade':
    case 'crossfade':
    case 'wipe_left':
    case 'wipe_right':
    default:
      return {
        opacity: isEntering ? enterOpacity : exitOpacity,
      };
  }
};

const getSegmentRenderKey = (segment: TimelineSegment) =>
  `${segment.id}-${segment.start}-${segment.end}-${segment.track || 1}`;

interface SegmentTransitionMeta {
  nextOnTrack: TimelineSegment | null;
  entryTransitionType: string;
  entryDurationSec: number;
  exitTransitionType: string;
  exitDurationSec: number;
  visibleEndSec: number;
}

const getEffectiveVisibleEndSec = (
  segment: TimelineSegment,
  transitionMeta?: SegmentTransitionMeta,
) => {
  if (isMotionGraphicsSegment(segment)) {
    return segment.end;
  }

  return transitionMeta?.visibleEndSec ?? segment.end;
};

const getSegmentVolumeAtTime = (segment: TimelineSegment, timeSec: number) => {
  const baseVolume = clampVolume(segment.audio?.volume ?? 1);
  if (baseVolume <= 0) return 0;

  const relativeTime = Math.max(0, timeSec - segment.start);
  const duration = Math.max(0.001, segment.end - segment.start);
  const fadeIn = Math.max(0, segment.audio?.fadeIn ?? 0);
  const fadeOut = Math.max(0, segment.audio?.fadeOut ?? 0);

  const fadeInScale = fadeIn > 0 ? Math.min(1, relativeTime / fadeIn) : 1;
  const remaining = Math.max(0, duration - relativeTime);
  const fadeOutScale = fadeOut > 0 ? Math.max(0, Math.min(1, remaining / fadeOut)) : 1;

  return clampVolume(baseVolume * fadeInScale * fadeOutScale);
};

// Mantém API compatível com o controller esperado no PreviewStep
// (play/pause/seek/events), sem dependência de Remotion.
export const HibridPreviewPlayer = React.forwardRef(({
  project,
  durationInFrames,
  fps,
  onPlayerReady,
}: {
  project: any;
  durationInFrames: number;
  fps: number;
  onPlayerReady?: (player: any) => void;
}, ref) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);

  const isPlayingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const pendingSeekFrameRef = useRef<number | null>(null);
  const pendingSeekRafRef = useRef<number | null>(null);
  const pendingCanPlayRef = useRef<WeakSet<HTMLMediaElement>>(new WeakSet());
  const layerVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const lastMainAudioRangeIndexRef = useRef<number>(-1);
  const layerAudioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const mainAudioRef = useRef<HTMLAudioElement | null>(null);

  const listenersRef = useRef<{ [key: string]: Function[] }>({
    frameupdate: [],
    play: [],
    pause: [],
  });

  const addEventListener = useCallback((event: string, callback: Function) => {
    if (!listenersRef.current[event]) listenersRef.current[event] = [];
    listenersRef.current[event].push(callback);
  }, []);

  const removeEventListener = useCallback((event: string, callback: Function) => {
    if (!listenersRef.current[event]) return;
    listenersRef.current[event] = listenersRef.current[event].filter((cb) => cb !== callback);
  }, []);

  const emit = useCallback((event: string, data?: any) => {
    listenersRef.current[event]?.forEach((cb) => cb(data));
  }, []);

  const timelineSegments = useMemo<TimelineSegment[]>(() => {
    if (Array.isArray(project?.segments)) {
      return project.segments.map((segment: any) => ({
        ...segment,
        start: Number(segment.start || 0),
        end: Number(segment.end || 0),
      }));
    }

    if (Array.isArray(project?.scenes)) {
      return project.scenes.map((scene: any) => ({
        ...scene,
        start: Number(scene.start_time || 0),
        end: Number(scene.end_time || 0),
        imageUrl: scene.asset_url,
        assetType: scene.asset_type,
      }));
    }

    return [];
  }, [project]);

  const timelineDurationSec = useMemo(() => {
    const segmentsDuration = timelineSegments.reduce((max, segment) => Math.max(max, segment.end || 0), 0);
    const framesDuration = durationInFrames > 0 ? durationInFrames / fps : 0;
    return Math.max(segmentsDuration, framesDuration, 0);
  }, [timelineSegments, durationInFrames, fps]);

  const orderedTimelineSegments = useMemo(() => {
    return [...timelineSegments].sort((a, b) => {
      const trackA = a.track || 1;
      const trackB = b.track || 1;
      if (trackA !== trackB) return trackA - trackB;
      if (a.start !== b.start) return a.start - b.start;
      if (a.end !== b.end) return a.end - b.end;
      return String(a.id).localeCompare(String(b.id));
    });
  }, [timelineSegments]);

  const transitionMetaBySegment = useMemo(() => {
    const byTrack = new Map<number, TimelineSegment[]>();
    const metadata = new Map<string, SegmentTransitionMeta>();

    orderedTimelineSegments.forEach((segment) => {
      const track = segment.track || 1;
      if (!byTrack.has(track)) {
        byTrack.set(track, []);
      }
      byTrack.get(track)!.push(segment);
    });

    byTrack.forEach((trackSegments) => {
      for (let index = 0; index < trackSegments.length; index++) {
        const segment = trackSegments[index];
        const previousSegment = index > 0 ? trackSegments[index - 1] : null;
        const nextSegment = index < trackSegments.length - 1 ? trackSegments[index + 1] : null;
        const entryTransitionType = normalizeTransitionType(segment.transition);
        const rawEntryDurationSec = getTransitionDurationSec(segment);
        const entryDurationSec = previousSegment && entryTransitionType !== 'none'
          ? rawEntryDurationSec
          : 0;
        const exitTransitionType = normalizeTransitionType(nextSegment?.transition);
        const rawExitDurationSec = getTransitionDurationSec(nextSegment);
        const exitDurationSec = nextSegment && exitTransitionType !== 'none'
          ? rawExitDurationSec
          : 0;
        const visibleEndSec = nextSegment
          ? Math.max(segment.end, nextSegment.start + exitDurationSec)
          : segment.end;

        metadata.set(getSegmentRenderKey(segment), {
          nextOnTrack: nextSegment,
          entryTransitionType,
          entryDurationSec,
          exitTransitionType,
          exitDurationSec,
          visibleEndSec,
        });
      }
    });

    return metadata;
  }, [orderedTimelineSegments]);

  const activeSegments = useMemo(() => {
    return getActiveSegmentsAtTime(orderedTimelineSegments, currentTimeSec);
  }, [orderedTimelineSegments, currentTimeSec]);

  const hasVisibleSegmentAtCurrentTime = useMemo(() => {
    return orderedTimelineSegments.some((segment) => {
      const metadata = transitionMetaBySegment.get(getSegmentRenderKey(segment));
      const visibleEndSec = getEffectiveVisibleEndSec(segment, metadata);
      return currentTimeSec >= segment.start && currentTimeSec < visibleEndSec;
    });
  }, [orderedTimelineSegments, transitionMetaBySegment, currentTimeSec]);

  // Mantém ativos + uma janela de pré-carga para reduzir tela preta no scrub rápido.
  const renderSegments = useMemo(() => {
    return orderedTimelineSegments.filter((segment) => {
      const metadata = transitionMetaBySegment.get(getSegmentRenderKey(segment));
      const visibleEndSec = getEffectiveVisibleEndSec(segment, metadata);
      return visibleEndSec > currentTimeSec - PRELOAD_BEFORE_SEC
        && segment.start < currentTimeSec + PRELOAD_AFTER_SEC;
    });
  }, [orderedTimelineSegments, transitionMetaBySegment, currentTimeSec]);

  const mainAudioUrl = useMemo(() => {
    const backgroundMusicSrc = project?.config?.backgroundMusic?.src;
    if (backgroundMusicSrc) {
      return normalizeMediaUrl(backgroundMusicSrc);
    }
    return normalizeMediaUrl(project?.audioPath);
  }, [project?.config?.backgroundMusic?.src, project?.audioPath]);

  const mainAudioVolume = useMemo(() => {
    const directConfigVolume = project?.config?.mainAudioVolume;
    if (typeof directConfigVolume === 'number') return clampVolume(directConfigVolume);

    const backgroundMusicVolume = project?.config?.backgroundMusic?.volume;
    if (typeof backgroundMusicVolume === 'number') return clampVolume(backgroundMusicVolume);

    return 1;
  }, [project?.config?.backgroundMusic?.volume, project?.config?.mainAudioVolume]);

  const fitVideoToScene = project?.config?.fitVideoToScene ?? true;
  const compositionWidth = Number(project?.config?.width || 1080);
  const compositionHeight = Number(project?.config?.height || 1920);
  const removeAudioSilences = project?.config?.removeAudioSilences ?? false;
  const audioKeepRanges = useMemo<TimelineKeepRange[]>(() => {
    return Array.isArray(project?.config?.audioKeepRanges) ? project.config.audioKeepRanges : [];
  }, [project?.config?.audioKeepRanges]);
  const audioMutedRanges = useMemo<TimelineKeepRange[]>(() => {
    return Array.isArray(project?.config?.audioMutedRanges) ? project.config.audioMutedRanges : [];
  }, [project?.config?.audioMutedRanges]);

  const syncMediaElement = useCallback((
    media: HTMLMediaElement,
    targetRelativeTime: number,
    shouldPlay: boolean,
    volume: number,
    playbackRate = 1,
  ) => {
    if (!media) return;

    const safePlaybackRate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
    if (media.playbackRate !== safePlaybackRate) {
      media.playbackRate = safePlaybackRate;
    }

    const safeDuration = Number.isFinite(media.duration) && media.duration > 0
      ? Math.max(0, media.duration - 0.05)
      : null;
    const safeTime = safeDuration == null ? targetRelativeTime : Math.min(targetRelativeTime, safeDuration);

    if (!shouldPlay || Math.abs(media.currentTime - safeTime) > 0.2) {
      try {
        media.currentTime = safeTime;
      } catch (_) {
        // no-op
      }
    }

    const safeVolume = clampVolume(volume);
    media.volume = safeVolume;
    media.muted = safeVolume <= 0;

    if (shouldPlay) {
      if (media.paused) {
        if (media.readyState >= 2) {
          media.play().catch(() => { });
        } else {
          if (pendingCanPlayRef.current.has(media)) return;
          pendingCanPlayRef.current.add(media);
          const handleCanPlay = () => {
            media.removeEventListener('canplay', handleCanPlay);
            pendingCanPlayRef.current.delete(media);
            if (isPlayingRef.current) {
              media.play().catch(() => { });
            }
          };
          media.addEventListener('canplay', handleCanPlay, { once: true });
        }
      }
    } else if (!media.paused) {
      media.pause();
    }
  }, []);

  const syncSegmentMedia = useCallback((
    segment: TimelineSegment,
    media: HTMLMediaElement,
    timeSec: number,
    shouldPlay: boolean,
  ) => {
    const isVideo = media instanceof HTMLVideoElement;
    const sceneDuration = Math.max(0, segment.end - segment.start);
    // Preferimos a duracao real do arquivo quando ela ja foi carregada.
    // Isso evita acelerar demais em projetos antigos com asset_duration incorreto.
    const mediaDuration = toPositiveNumber(media.duration);
    const segmentAssetDuration = toPositiveNumber(segment.asset_duration)
      ?? toPositiveNumber(segment.assetDuration);
    const assetDuration = mediaDuration ?? segmentAssetDuration;
    const playbackRate = fitVideoToScene && isVideo && assetDuration && sceneDuration > 0
      ? calculatePlaybackRate(assetDuration, sceneDuration)
      : 1;

    const targetRelativeTime = Math.max(0, timeSec - segment.start) * playbackRate;
    const volume = getSegmentVolumeAtTime(segment, timeSec);
    syncMediaElement(media, targetRelativeTime, shouldPlay, volume, playbackRate);
  }, [fitVideoToScene, syncMediaElement]);

  const syncMainAudio = useCallback((timeSec: number, shouldPlay: boolean) => {
    if (!mainAudioRef.current) return;
    const media = mainAudioRef.current;
    const outputTime = Math.max(0, timeSec);
    const sourceTime = removeAudioSilences && audioKeepRanges.length > 0
      ? mapOutputTimeToSourceTime(outputTime, audioKeepRanges)
      : outputTime;
    const currentRangeIndex = removeAudioSilences && audioKeepRanges.length > 0
      ? getRangeIndexForOutputTime(outputTime, audioKeepRanges)
      : -1;
    const crossedCompactionBoundary = currentRangeIndex !== lastMainAudioRangeIndexRef.current;
    if (crossedCompactionBoundary && Math.abs(media.currentTime - sourceTime) > 0.001) {
      try {
        media.currentTime = sourceTime;
      } catch (_) {
        // no-op
      }
    }
    lastMainAudioRangeIndexRef.current = currentRangeIndex;
    const isMutedAtTime = removeAudioSilences
      && audioMutedRanges.length > 0
      && isOutputTimeInRanges(outputTime, audioMutedRanges);
    const effectiveVolume = isMutedAtTime ? 0 : mainAudioVolume;
    syncMediaElement(media, sourceTime, shouldPlay, effectiveVolume);
  }, [audioKeepRanges, audioMutedRanges, mainAudioVolume, removeAudioSilences, syncMediaElement]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    currentTimeRef.current = currentTimeSec;

    const activeIds = new Set(activeSegments.map((segment) => String(segment.id)));

    activeSegments.forEach((segment) => {
      const url = normalizeMediaUrl(segment.imageUrl || segment.asset_url || segment.background?.url);
      if (!url) return;

      if (isVideoSegment(segment, url)) {
        const video = layerVideoRefs.current[String(segment.id)];
        if (!video) return;

        syncSegmentMedia(segment, video, currentTimeSec, isPlaying);
        return;
      }

      if (isAudioSegment(segment, url)) {
        const audio = layerAudioRefs.current[String(segment.id)];
        if (!audio) return;

        syncSegmentMedia(segment, audio, currentTimeSec, isPlaying);
      }
    });

    Object.entries(layerVideoRefs.current).forEach(([segmentId, video]) => {
      if (!video) return;
      if (!activeIds.has(segmentId) && !video.paused) {
        video.pause();
      }
    });

    Object.entries(layerAudioRefs.current).forEach(([segmentId, audio]) => {
      if (!audio) return;
      if (!activeIds.has(segmentId) && !audio.paused) {
        audio.pause();
      }
    });

    if (mainAudioUrl) {
      syncMainAudio(currentTimeSec, isPlaying);
    } else if (mainAudioRef.current && !mainAudioRef.current.paused) {
      mainAudioRef.current.pause();
    }
  }, [currentTimeSec, activeSegments, mainAudioUrl, syncMainAudio, syncSegmentMedia, isPlaying]);

  useEffect(() => {
    const clampedTime = Math.max(0, Math.min(currentTimeRef.current, timelineDurationSec));
    if (clampedTime !== currentTimeRef.current) {
      currentTimeRef.current = clampedTime;
      setCurrentTimeSec(clampedTime);
    }
  }, [timelineDurationSec]);

  const applyFrameNow = useCallback((safeFrame: number) => {
    const timeSec = safeFrame / fps;
    currentTimeRef.current = timeSec;
    setCurrentTimeSec(timeSec);
    emit('frameupdate', { detail: { frame: safeFrame } });
  }, [fps, emit]);

  const seekToFrame = useCallback((frame: number) => {
    const maxFrame = Math.max(0, Math.round(timelineDurationSec * fps));
    const safeFrame = Math.max(0, Math.min(frame, maxFrame));
    pendingSeekFrameRef.current = safeFrame;

    if (pendingSeekRafRef.current !== null) return;

    pendingSeekRafRef.current = requestAnimationFrame(() => {
      pendingSeekRafRef.current = null;
      const frameToApply = pendingSeekFrameRef.current;
      pendingSeekFrameRef.current = null;
      if (frameToApply == null) return;
      applyFrameNow(frameToApply);
    });
  }, [timelineDurationSec, fps, applyFrameNow]);

  const api = useMemo(() => ({
    play: () => {
      isPlayingRef.current = true;
      setIsPlaying(true);
    },
    pause: () => {
      isPlayingRef.current = false;
      setIsPlaying(false);
    },
    seekTo: (frame: number) => seekToFrame(frame),
    isPlaying: () => isPlayingRef.current,
    addEventListener,
    removeEventListener,
  }), [seekToFrame, addEventListener, removeEventListener]);

  useImperativeHandle(ref, () => api, [api]);

  useEffect(() => {
    if (onPlayerReady) {
      onPlayerReady(api);
    }
  }, [onPlayerReady, api]);

  useEffect(() => {
    let animationFrameId: number | null = null;
    let lastTime = performance.now();

    const loop = (timestamp: number) => {
      if (!isPlaying) return;

      const deltaSec = (timestamp - lastTime) / 1000;
      lastTime = timestamp;

      let nextTime = currentTimeRef.current + deltaSec;
      if (nextTime >= timelineDurationSec) {
        nextTime = timelineDurationSec;
        isPlayingRef.current = false;
        setIsPlaying(false);
        emit('pause');
      }

      currentTimeRef.current = nextTime;
      setCurrentTimeSec(nextTime);
      emit('frameupdate', { detail: { frame: Math.round(nextTime * fps) } });

      animationFrameId = requestAnimationFrame(loop);
    };

    if (isPlaying) {
      emit('play');
      lastTime = performance.now();
      animationFrameId = requestAnimationFrame(loop);
    } else {
      emit('pause');
    }

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying, timelineDurationSec, fps, emit]);

  useEffect(() => {
    return () => {
      if (pendingSeekRafRef.current !== null) {
        cancelAnimationFrame(pendingSeekRafRef.current);
        pendingSeekRafRef.current = null;
      }
      pendingSeekFrameRef.current = null;
      Object.values(layerVideoRefs.current).forEach((video) => {
        if (video && !video.paused) video.pause();
      });
      Object.values(layerAudioRefs.current).forEach((audio) => {
        if (audio && !audio.paused) audio.pause();
      });
      if (mainAudioRef.current && !mainAudioRef.current.paused) {
        mainAudioRef.current.pause();
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#000', overflow: 'hidden' }}>
      {!hasVisibleSegmentAtCurrentTime && (
        <div style={{ color: '#666', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          Nenhuma Mídia Ativa
        </div>
      )}

      {renderSegments.map((segment, index) => {
        const isMotionGraphics = isMotionGraphicsSegment(segment);
        const motionGraphicsData = getMotionGraphicsData(segment);
        const rawUrl = segment.imageUrl || segment.asset_url || segment.background?.url;
        const sourceUrl = normalizeMediaUrl(rawUrl);
        const segmentKey = getSegmentRenderKey(segment);
        const transitionMeta = transitionMetaBySegment.get(segmentKey);
        const nextOnTrack = transitionMeta?.nextOnTrack || null;
        const visibleEndSec = getEffectiveVisibleEndSec(segment, transitionMeta);
        const isVisibleAtCurrentTime = currentTimeSec >= segment.start && currentTimeSec < visibleEndSec;
        const track = segment.track || 1;
        const transform = segment.transform || {};
        const scale = transform.scale ?? 1;
        const positionX = transform.positionX ?? 0;
        const positionY = transform.positionY ?? 0;
        const baseOpacity = transform.opacity ?? 1;
        const isVideo = isVideoSegment(segment, sourceUrl);
        const isAudio = isAudioSegment(segment, sourceUrl);
        const entryDurationSec = transitionMeta?.entryDurationSec ?? 0;
        const isInEntryTransition = entryDurationSec > 0
          && currentTimeSec >= segment.start
          && currentTimeSec < segment.start + entryDurationSec;
        const entryProgress = isInEntryTransition
          ? (currentTimeSec - segment.start) / entryDurationSec
          : 1;
        const exitDurationSec = transitionMeta?.exitDurationSec ?? 0;
        const exitStartSec = nextOnTrack?.start ?? Number.POSITIVE_INFINITY;
        const isInExitTransition = exitDurationSec > 0
          && currentTimeSec >= exitStartSec
          && currentTimeSec < exitStartSec + exitDurationSec;
        const exitProgress = isInExitTransition
          ? (currentTimeSec - exitStartSec) / exitDurationSec
          : 0;
        const transitionStyles = isInExitTransition
          ? getTransitionStyles(transitionMeta?.exitTransitionType || 'fade', exitProgress, false)
          : isInEntryTransition
            ? getTransitionStyles(transitionMeta?.entryTransitionType || 'fade', entryProgress, true)
            : {};
        const transitionOpacity = transitionStyles.opacity ?? 1;
        const layerStyle: React.CSSProperties = {
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: transitionStyles.transform || 'none',
          transformOrigin: 'center center',
          filter: transitionStyles.filter,
          opacity: isVisibleAtCurrentTime ? clamp01(baseOpacity * transitionOpacity) : 0,
          zIndex: track * 10 + index,
          pointerEvents: 'none',
          willChange: 'opacity, transform, filter',
        };
        const contentStyle: React.CSSProperties = {
          width: '100%',
          height: '100%',
          transform: `translate(${positionX}%, ${positionY}%) scale(${scale})`,
          transformOrigin: 'center center',
        };

        const mediaStyle: React.CSSProperties = {
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          backgroundColor: '#000',
        };

        if (isMotionGraphics) {
          const code = String(motionGraphicsData?.code || '').trim();
          if (!code) {
            return null;
          }

          const currentFrame = Math.round(Math.max(0, currentTimeSec - segment.start) * fps);
          const segmentDurationInFrames = Math.max(1, Math.round(Math.max(0.1, segment.end - segment.start) * fps));

          return (
            <div key={segmentKey} style={layerStyle}>
              <div style={contentStyle}>
                <MotionGraphicsTimelineLayer
                  code={code}
                  currentFrame={currentFrame}
                  durationInFrames={segmentDurationInFrames}
                  fps={fps}
                  compositionWidth={compositionWidth}
                  compositionHeight={compositionHeight}
                  segmentId={segment.id}
                  isPlaying={isPlaying && currentTimeSec >= segment.start && currentTimeSec < segment.end}
                />
              </div>
            </div>
          );
        }
        if (!sourceUrl) return null;

        if (isVideo) {
          return (
            <div key={segmentKey} style={layerStyle}>
              <div style={contentStyle}>
                <video
                  ref={(element) => {
                    layerVideoRefs.current[String(segment.id)] = element;
                  }}
                  src={sourceUrl}
                  style={mediaStyle}
                  playsInline
                  preload="auto"
                  onLoadedMetadata={(event) => {
                    syncSegmentMedia(segment, event.currentTarget, currentTimeRef.current, isPlayingRef.current);
                  }}
                />
              </div>
            </div>
          );
        }

        if (isAudio) {
          return (
            <audio
              key={segmentKey}
              ref={(element) => {
                layerAudioRefs.current[String(segment.id)] = element;
              }}
              src={sourceUrl}
              preload="auto"
              onLoadedMetadata={(event) => {
                syncSegmentMedia(segment, event.currentTarget, currentTimeRef.current, isPlayingRef.current);
              }}
            />
          );
        }

        return (
          <div key={segmentKey} style={layerStyle}>
            <div style={contentStyle}>
              <img
                src={sourceUrl}
                style={mediaStyle}
                alt={`Mídia ${segment.id}`}
              />
            </div>
          </div>
        );
      })}

      {mainAudioUrl && (
        <audio
          ref={mainAudioRef}
          src={mainAudioUrl}
          preload="auto"
          onLoadedMetadata={() => {
            syncMainAudio(currentTimeRef.current, isPlayingRef.current);
          }}
        />
      )}
    </div>
  );
});

export default HibridPreviewPlayer;
