/**
 * Video Preview Component
 * 
 * Componente que mostra preview do vídeo usando @remotion/player
 * Permite visualizar o resultado antes de renderizar
 */
import React, { useMemo } from 'react';
import { Player } from '@remotion/player';
import { VideoProjectComposition } from '../../remotion/compositions/VideoProject';
import type { VideoProject } from '../../remotion/types/project';

interface VideoPreviewProps {
  /** Dados do projeto para preview */
  project: VideoProject;
  /** Largura do player (padrão: 100%) */
  width?: number | string;
  /** Altura do player (padrão: auto baseado em aspect ratio) */
  height?: number | string;
  /** Autoplay ao montar */
  autoPlay?: boolean;
  /** Loop infinito */
  loop?: boolean;
  /** Callback quando termina */
  // onEnded?: () => void;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({
  project,
  width = '100%',
  height,
  autoPlay = false,
  loop = true,
  // onEnded,
}) => {
  // Calcular duração em frames
  const fps = project.config?.fps || 30;
  const lastScene = project.scenes[project.scenes.length - 1];
  const durationInSeconds = lastScene ? lastScene.end_time : 10;
  const durationInFrames = Math.ceil(durationInSeconds * fps);

  // Dimensões do vídeo
  const videoWidth = project.config?.width || 1920;
  const videoHeight = project.config?.height || 1080;
  const aspectRatio = videoWidth / videoHeight;

  // Calcular altura se não fornecida
  const calculatedHeight = useMemo(() => {
    if (height) return height;
    if (typeof width === 'number') {
      return width / aspectRatio;
    }
    return 'auto';
  }, [height, width, aspectRatio]);

  return (
    <div 
      className="video-preview-container"
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        aspectRatio: typeof height === 'undefined' ? `${videoWidth}/${videoHeight}` : undefined,
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: '#000',
      }}
    >
      <Player
        component={VideoProjectComposition}
        inputProps={{ project }}
        durationInFrames={durationInFrames}
        fps={fps}
        compositionWidth={videoWidth}
        compositionHeight={videoHeight}
        style={{
          width: '100%',
          height: calculatedHeight,
        }}
        controls
        autoPlay={autoPlay}
        loop={loop}
        allowFullscreen
        clickToPlay
        doubleClickToFullscreen
        spaceKeyToPlayOrPause
        // onEnded={onEnded}
      />
    </div>
  );
};

export default VideoPreview;
