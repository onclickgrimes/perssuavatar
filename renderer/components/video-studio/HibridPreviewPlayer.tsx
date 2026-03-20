import React, { useRef, useEffect, useState, useMemo, useImperativeHandle } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { ProjectState } from '../../types/video-studio';

// Este componente tenta ser compatível (duck typing) com o Player do Remotion
// para que o PreviewStep.tsx não precise ser drasticamente alterado.
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
  const [VideoProjectComposition, setVideoProjectComposition] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const remotionPlayerRef = useRef<PlayerRef>(null);

  // Estados do player híbrido
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);

  // Callback para simular o EventEmitter do Remotion
  const listenersRef = useRef<{ [key: string]: Function[] }>({
    frameupdate: [],
    play: [],
    pause: []
  });

  const addEventListener = (event: string, callback: Function) => {
    if (!listenersRef.current[event]) listenersRef.current[event] = [];
    listenersRef.current[event].push(callback);
  };
  const removeEventListener = (event: string, callback: Function) => {
    if (!listenersRef.current[event]) return;
    listenersRef.current[event] = listenersRef.current[event].filter(cb => cb !== callback);
  };
  const emit = (event: string, data?: any) => {
    listenersRef.current[event]?.forEach(cb => cb(data));
  };

  // Encontrar o segmento ativo para o tempo atual
  const activeSegment = useMemo(() => {
    if (!project?.segments) return null;
    const active = project.segments
      .slice()
      .reverse()
      .find((s: any) => s.start <= currentTimeSec && s.end > currentTimeSec);
    return active || project.segments[0];
  }, [project, currentTimeSec]);

  const activeRawVideoUrl = activeSegment?.imageUrl || activeSegment?.asset_url || activeSegment?.background?.url;

  // Carregar a composição (já preparada para motionGraphicsOnly)
  useEffect(() => {
    const loadComponents = async () => {
      try {
        const compositionModule = await import('../../../remotion/compositions/VideoProject');
        setVideoProjectComposition(() => compositionModule.VideoProjectComposition);
        setIsLoading(false);
      } catch (err: any) {
        console.error('Error loading hybrid preview:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };
    loadComponents();
  }, []);

  // Forçar `motionGraphicsOnly` no projeto
  const hybridProject = useMemo(() => {
    if (!project) return null;
    return {
      ...project,
      config: {
        ...(project.config || {}),
        motionGraphicsOnly: true,
      }
    };
  }, [project]);

  // Expor a API do Remotion Player para o PreviewStep
  useImperativeHandle(ref, () => {
    const api = {
      play: () => {
        setIsPlaying(true);
      },
      pause: () => {
        setIsPlaying(false);
      },
      seekTo: (frame: number) => {
        const timeSec = frame / fps;
        setCurrentTimeSec(timeSec);
        if (videoRef.current && activeSegment && activeRawVideoUrl) {
          // Calcular a posição relativa dentro do vídeo atual
          let relativeTime = timeSec - activeSegment.start;
          if (relativeTime < 0) relativeTime = 0;
          
          videoRef.current.currentTime = relativeTime;
        }
        // Avisar o Remotion também
        remotionPlayerRef.current?.seekTo(frame);
        emit('frameupdate', { detail: { frame } });
      },
      isPlaying: () => isPlaying,
      addEventListener,
      removeEventListener,
    };
    
    if (onPlayerReady) {
      onPlayerReady(api);
    }
    return api;
  }, [fps, activeSegment, activeRawVideoUrl, isPlaying]);

  // Loop de Animação quando está em play
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      if (!isPlaying) return;

      const deltaObj = (time - lastTime) / 1000;
      lastTime = time;

      setCurrentTimeSec((prev) => {
        let newTime = prev + deltaObj;
        const durationSec = durationInFrames / fps;
        
        if (newTime >= durationSec) {
          newTime = durationSec;
          setIsPlaying(false);
          emit('pause');
        }

        const currentFrame = Math.round(newTime * fps);
        emit('frameupdate', { detail: { frame: currentFrame } });
        remotionPlayerRef.current?.seekTo(currentFrame);
        return newTime;
      });

      animationFrameId = requestAnimationFrame(loop);
    };

    if (isPlaying) {
      // Se não havia um vídeo tocando na sincronia exata, dar o play no vídeo nativo
      if (videoRef.current && videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      }
      emit('play');
      lastTime = performance.now();
      animationFrameId = requestAnimationFrame(loop);
    } else {
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
      emit('pause');
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, durationInFrames, fps]);

  // Se trocar o clipe ao passar o tempo
  useEffect(() => {
    if (videoRef.current && activeSegment) {
       let relativeTime = currentTimeSec - activeSegment.start;
       if (relativeTime < 0) relativeTime = 0;
       
       // Se o delta for muito grande (mais de meio segundo de diferença), forçamos o sync
       if (Math.abs(videoRef.current.currentTime - relativeTime) > 0.5) {
         videoRef.current.currentTime = relativeTime;
       }

       if (isPlaying && videoRef.current.paused) {
         videoRef.current.play().catch(() => {});
       }
    }
  }, [activeRawVideoUrl, activeSegment]);

  if (isLoading) return <div>Carregando Preview Híbrido...</div>;
  if (error) return <div>Erro no Preview: {error}</div>;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* 1. LAYER DE VÍDEO NATIVO OTIMIZADO */}
      <div style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {activeRawVideoUrl ? (
          activeRawVideoUrl.match(/\.(mp4|mov|webm)$/i) || activeRawVideoUrl.startsWith('blob:') ? (
            <video
              ref={videoRef}
              src={activeRawVideoUrl}
              style={{ width: '100%', height: '100%', objectFit: project?.config?.fitVideoToScene ? 'cover' : 'contain' }}
              muted
              playsInline
            />
          ) : (
             <img 
               src={activeRawVideoUrl} 
               style={{ width: '100%', height: '100%', objectFit: project?.config?.fitVideoToScene ? 'cover' : 'contain' }}
               alt="Timeline"
             />
          )
        ) : (
          <div style={{ color: '#555' }}>Nenhuma Mídia Ativa</div>
        )}
      </div>

      {/* 2. LAYER DO REMOTION COM MOTION GRAPHICS TRANSPARENTE */}
      <div style={{ position: 'absolute', width: '100%', height: '100%', pointerEvents: 'none' }}>
        {VideoProjectComposition && hybridProject && (
          <Player
            ref={remotionPlayerRef}
            component={VideoProjectComposition}
            inputProps={{ project: hybridProject }}
            durationInFrames={durationInFrames}
            fps={fps}
            compositionWidth={project?.config?.width || 1080}
            compositionHeight={project?.config?.height || 1920}
            style={{ backgroundColor: 'transparent', width: '100%', height: '100%' }}
            controls={false}
          />
        )}
      </div>
    </div>
  );
});

export default HibridPreviewPlayer;
