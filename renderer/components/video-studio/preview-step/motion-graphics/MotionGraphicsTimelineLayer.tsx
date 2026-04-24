import { Player, type ErrorFallback, type PlayerRef } from '@remotion/player';
import React, { useEffect, useMemo, useRef } from 'react';
import { compileMotionGraphicsCode } from './compiler';

const overlayErrorFallback: ErrorFallback = ({ error }) => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderRadius: 10,
        background: 'rgba(127,29,29,0.82)',
        color: '#fecaca',
        fontSize: 11,
        textAlign: 'center',
      }}
    >
      {error.message || 'Falha ao renderizar o clip Remotion.'}
    </div>
  );
};

interface MotionGraphicsTimelineLayerProps {
  code: string;
  currentFrame: number;
  durationInFrames: number;
  fps: number;
  compositionWidth: number;
  compositionHeight: number;
  segmentId: number | string;
  isPlaying?: boolean;
}

export function MotionGraphicsTimelineLayer({
  code,
  currentFrame,
  durationInFrames,
  fps,
  compositionWidth,
  compositionHeight,
  segmentId,
  isPlaying = false,
}: MotionGraphicsTimelineLayerProps) {
  const playerRef = useRef<PlayerRef>(null);
  const compilation = useMemo(() => compileMotionGraphicsCode(code), [code]);
  const safeDurationInFrames = Math.max(1, durationInFrames);
  const safeFrame = Math.max(0, Math.min(currentFrame, safeDurationInFrames - 1));

  useEffect(() => {
    if (!playerRef.current || !compilation.Component) {
      return;
    }

    try {
      const currentPlayerFrame = typeof playerRef.current.getCurrentFrame === 'function'
        ? playerRef.current.getCurrentFrame()
        : null;
      const syncTolerance = isPlaying ? Math.max(2, Math.round(fps * 0.15)) : 0;
      const shouldSeek = currentPlayerFrame == null
        || Math.abs(currentPlayerFrame - safeFrame) > syncTolerance;

      if (shouldSeek) {
        playerRef.current.seekTo(safeFrame);
      }

      if (isPlaying) {
        if (!playerRef.current.isPlaying()) {
          playerRef.current.play();
        }
      } else if (playerRef.current.isPlaying()) {
        playerRef.current.pause();
      }
    } catch (_) {
      // no-op
    }
  }, [compilation.Component, fps, isPlaying, safeFrame]);

  useEffect(() => {
    return () => {
      try {
        playerRef.current?.pause();
      } catch (_) {
        // no-op
      }
    };
  }, []);

  if (compilation.error || !compilation.Component) {
    return compilation.error ? overlayErrorFallback({ error: new Error(compilation.error) }) : null;
  }

  return (
    <Player
      ref={playerRef}
      key={`${segmentId}-${compositionWidth}-${compositionHeight}-${safeDurationInFrames}-${fps}`}
      component={compilation.Component}
      inputProps={{
        __motionGraphicsRuntimeErrorMode: 'compact',
        segmentId,
        segmentDurationInFrames: safeDurationInFrames,
        segmentDurationInSeconds: safeDurationInFrames / fps,
      }}
      durationInFrames={safeDurationInFrames}
      fps={fps}
      compositionWidth={compositionWidth}
      compositionHeight={compositionHeight}
      controls={false}
      autoPlay={false}
      loop={false}
      clickToPlay={false}
      spaceKeyToPlayOrPause={false}
      doubleClickToFullscreen={false}
      allowFullscreen={false}
      initialFrame={safeFrame}
      showPosterWhenPaused={false}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: 'transparent',
        pointerEvents: 'none',
      }}
      errorFallback={overlayErrorFallback}
    />
  );
}
