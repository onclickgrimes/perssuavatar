import React, { useRef, useEffect, useState, useMemo, useImperativeHandle, useCallback } from 'react';
import { calculatePlaybackRate } from '../../../remotion/utils/playback-rate';
import {
  mapOutputTimeToSourceTime,
  type TimelineKeepRange,
} from '../../../remotion/utils/silence-compaction';

interface TimelineSegment {
  id: number | string;
  start: number;
  end: number;
  track?: number;
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
}

const VIDEO_EXT_RE = /\.(mp4|webm|mov|mkv|avi|m4v)(\?.*)?$/i;
const AUDIO_EXT_RE = /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i;
const PRELOAD_BEFORE_SEC = 1.5;
const PRELOAD_AFTER_SEC = 3;

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
const isVideoSegment = (segment: TimelineSegment, url: string) => {
  // Prioriza o tipo REAL da mídia pela URL para evitar mismatch
  // (ex.: assetType "video_*" com imagem estática enviada manualmente).
  if (AUDIO_EXT_RE.test(url)) return false;
  if (VIDEO_EXT_RE.test(url) || url.startsWith('blob:')) return true;

  const assetType = (segment.assetType || segment.asset_type || '').toLowerCase();
  if (assetType.startsWith('audio')) return false;
  if (assetType.startsWith('video')) return true;
  return false;
};

const isAudioSegment = (segment: TimelineSegment, url: string) => {
  // Prioriza o tipo REAL da mídia pela URL.
  if (AUDIO_EXT_RE.test(url)) return true;
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

  const activeSegments = useMemo(() => {
    return getActiveSegmentsAtTime(timelineSegments, currentTimeSec);
  }, [timelineSegments, currentTimeSec]);

  // Mantém ativos + uma janela de pré-carga para reduzir tela preta no scrub rápido.
  const renderSegments = useMemo(() => {
    return timelineSegments.filter((segment) => {
      return segment.end > currentTimeSec - PRELOAD_BEFORE_SEC
        && segment.start < currentTimeSec + PRELOAD_AFTER_SEC;
    });
  }, [timelineSegments, currentTimeSec]);

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
  const removeAudioSilences = project?.config?.removeAudioSilences ?? false;
  const audioKeepRanges = useMemo<TimelineKeepRange[]>(() => {
    return Array.isArray(project?.config?.audioKeepRanges) ? project.config.audioKeepRanges : [];
  }, [project?.config?.audioKeepRanges]);

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
    const assetDuration = toPositiveNumber(segment.asset_duration)
      ?? toPositiveNumber(segment.assetDuration)
      ?? toPositiveNumber(media.duration);
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
    syncMediaElement(media, sourceTime, shouldPlay, mainAudioVolume);
  }, [audioKeepRanges, mainAudioVolume, removeAudioSilences, syncMediaElement]);

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
      {activeSegments.length === 0 && (
        <div style={{ color: '#666', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          Nenhuma Mídia Ativa
        </div>
      )}

      {renderSegments.map((segment, index) => {
        const rawUrl = segment.imageUrl || segment.asset_url || segment.background?.url;
        const sourceUrl = normalizeMediaUrl(rawUrl);
        if (!sourceUrl) return null;

        const track = segment.track || 1;
        const transform = segment.transform || {};
        const scale = transform.scale ?? 1;
        const positionX = transform.positionX ?? 0;
        const positionY = transform.positionY ?? 0;
        const opacity = transform.opacity ?? 1;
        const isVideo = isVideoSegment(segment, sourceUrl);
        const isAudio = isAudioSegment(segment, sourceUrl);
        const isActive = segment.start <= currentTimeSec && segment.end > currentTimeSec;

        const layerStyle: React.CSSProperties = {
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `translate(${positionX}%, ${positionY}%) scale(${scale})`,
          transformOrigin: 'center center',
          opacity: isActive ? opacity : 0,
          zIndex: track * 10 + index,
          pointerEvents: 'none',
        };

        const mediaStyle: React.CSSProperties = {
          width: '100%',
          height: '100%',
          objectFit: fitVideoToScene ? 'cover' : 'contain',
        };

        if (isVideo) {
          return (
            <div key={`${segment.id}-${segment.start}-${segment.end}`} style={layerStyle}>
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
          );
        }

        if (isAudio) {
          return (
            <audio
              key={`${segment.id}-${segment.start}-${segment.end}`}
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
          <div key={`${segment.id}-${segment.start}-${segment.end}`} style={layerStyle}>
            <img
              src={sourceUrl}
              style={mediaStyle}
              alt={`Mídia ${segment.id}`}
            />
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
