import { Player, type ErrorFallback, type PlayerRef } from '@remotion/player';
import React, { useEffect, useRef } from 'react';

const renderErrorFallback: ErrorFallback = ({ error }) => {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black px-6 text-center">
      <div>
        <p className="text-red-400 text-sm font-semibold mb-2">Erro em runtime no player Remotion</p>
        <p className="text-white/60 text-xs leading-relaxed">{error.message || 'Falha ao renderizar a composição.'}</p>
      </div>
    </div>
  );
};

interface MotionGraphicsPreviewPlayerProps {
  Component: React.ComponentType | null;
  durationInFrames: number;
  fps: number;
  compositionWidth: number;
  compositionHeight: number;
  isCompiling?: boolean;
  error?: string | null;
  onPlayerReady?: (player: any) => void;
}

export function MotionGraphicsPreviewPlayer({
  Component,
  durationInFrames,
  fps,
  compositionWidth,
  compositionHeight,
  isCompiling = false,
  error,
  onPlayerReady,
}: MotionGraphicsPreviewPlayerProps) {
  const playerRef = useRef<PlayerRef>(null);

  useEffect(() => {
    if (!onPlayerReady) return;

    if (!Component) {
      onPlayerReady(null);
      return;
    }

    if (playerRef.current) {
      onPlayerReady(playerRef.current);
    }
  }, [Component, compositionHeight, compositionWidth, durationInFrames, fps, onPlayerReady]);

  if (isCompiling) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="w-10 h-10 mx-auto mb-3 border-2 border-cyan-400/25 border-t-cyan-400 rounded-full animate-spin" />
          <p className="text-white/60 text-sm">Compilando composição Remotion...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black px-6 text-center">
        <div>
          <p className="text-red-400 text-sm font-semibold mb-2">Erro ao compilar a composição</p>
          <p className="text-white/60 text-xs leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  if (!Component) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black px-6 text-center">
        <div>
          <p className="text-white/75 text-sm font-semibold mb-2">Remotion pronto para gerar preview</p>
          <p className="text-white/40 text-xs leading-relaxed">
            Use a tab Remotion no painel de mídia para pedir uma composição à IA.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Player
      ref={playerRef}
      key={`${Component.toString()}-${compositionWidth}-${compositionHeight}-${durationInFrames}-${fps}`}
      component={Component}
      inputProps={{
        __motionGraphicsRuntimeErrorMode: 'full',
      }}
      durationInFrames={durationInFrames}
      fps={fps}
      compositionWidth={compositionWidth}
      compositionHeight={compositionHeight}
      controls={false}
      autoPlay={false}
      loop
      clickToPlay={false}
      spaceKeyToPlayOrPause={false}
      doubleClickToFullscreen={false}
      allowFullscreen={false}
      errorFallback={renderErrorFallback}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
      }}
    />
  );
}
