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
}

export function MotionGraphicsTimelineLayer({
  code,
  currentFrame,
  durationInFrames,
  fps,
  compositionWidth,
  compositionHeight,
  segmentId,
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
      playerRef.current.seekTo(safeFrame);
      playerRef.current.pause();
    } catch (_) {
      // no-op
    }
  }, [compilation.Component, safeFrame]);

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
