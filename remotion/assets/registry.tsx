/**
 * ASSET REGISTRY - Componentes React para Renderização
 * 
 * Este arquivo combina os metadados de definitions.ts com os componentes React.
 * Use este arquivo APENAS no frontend (Remotion/React).
 * 
 * Para adicionar um novo asset_type:
 * 1. Adicione os metadados em definitions.ts
 * 2. Crie o componente aqui e adicione ao ASSET_COMPONENTS
 */
import React from 'react';
import { AbsoluteFill, Img, Video, Audio, useVideoConfig, useCurrentFrame, interpolate } from 'remotion';
import { ASSET_DEFINITIONS, type AssetType } from './definitions';
import { GeometricPatterns } from '../components/GeometricPatterns';
import { WavyGrid } from '../components/WavyGrid';
import { Timeline3D, Timeline3DProps } from '../components/Timeline3D';
import { ChromaKeyMedia, greenScreenPreset, blueScreenPreset } from '../components/ChromaKeyMedia';
import { useProjectConfig } from '../contexts/ProjectConfigContext';
import { calculatePlaybackRate, getPlaybackRateInfo } from '../utils/playback-rate';

// ========================================
// TIPOS (definidos localmente para evitar dependência circular)
// ========================================

export interface SceneProps {
  asset_type: string;
  asset_url?: string;
  /** Duração real do asset de vídeo em segundos */
  asset_duration?: number;
  background?: {
    type?: string;
    url?: string;
    color?: string;
  };
  chroma_key?: {
    color?: 'green' | 'blue' | 'custom';
  };
  timeline_config?: {
    items?: Array<{
      id: string;
      year: string;
      label: string;
      image?: string;
    }>;
  };
  audio?: {
    volume?: number;
    fadeIn?: number;
    fadeOut?: number;
  };
  /** Prop interna para silenciar áudio em camadas de efeito */
  muteAudio?: boolean;
}

export interface AssetComponentProps {
  scene: SceneProps;
  /** Duração da cena em segundos (para cálculo de playbackRate) */
  sceneDurationSeconds?: number;
}

export type AssetComponent = React.FC<AssetComponentProps>;

// ========================================
// COMPONENTES REUTILIZÁVEIS
// ========================================

/** Renderiza imagens (genérico para todos os tipos de imagem) */
const ImageAsset: AssetComponent = ({ scene }) => {
  const { width, height } = useVideoConfig();
  
  if (!scene.asset_url) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#1a1a2e' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100%',
          color: '#666' 
        }}>
          Imagem não disponível
        </div>
      </AbsoluteFill>
    );
  }
  
  return (
    <AbsoluteFill>
      <Img
        src={scene.asset_url}
        style={{
          width,
          height,
          objectFit: 'cover',
        }}
      />
    </AbsoluteFill>
  );
};

/** Renderiza vídeos (genérico para todos os tipos de vídeo) */
const VideoAsset: AssetComponent = ({ scene, sceneDurationSeconds }) => {
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const projectConfig = useProjectConfig();
  
  // Calcular playbackRate se fitVideoToScene estiver ativo e temos as durações
  const fitVideoToScene = projectConfig.fitVideoToScene !== false; // default: true
  let playbackRate = 1.0;
  
  if (fitVideoToScene && scene.asset_duration && sceneDurationSeconds && scene.asset_duration > 0 && sceneDurationSeconds > 0) {
    playbackRate = calculatePlaybackRate(scene.asset_duration, sceneDurationSeconds);
  }
  
  if (!scene.asset_url) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#1a1a2e' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100%',
          color: '#666' 
        }}>
          Vídeo não disponível
        </div>
      </AbsoluteFill>
    );
  }
  
  const baseVolume = scene.audio?.volume ?? 1;
  const fadeInFrames = (scene.audio?.fadeIn ?? 0) * fps;
  const fadeOutFrames = (scene.audio?.fadeOut ?? 0) * fps;
  const durationFrames = (sceneDurationSeconds || 0) * fps;

  // Cálculo de volume com fades lineares (evita erros de monotonicidade do interpolate)
  const fadeInScale = fadeInFrames > 0 ? Math.min(1, frame / fadeInFrames) : 1;
  const fadeOutScale = fadeOutFrames > 0 ? Math.max(0, Math.min(1, (durationFrames - frame) / fadeOutFrames)) : 1;
  const volume = baseVolume * fadeInScale * fadeOutScale;
  
  return (
    <AbsoluteFill>
      <Video
        src={scene.asset_url}
        style={{
          width,
          height,
          objectFit: 'cover',
        }}
        volume={Math.max(0, volume)}
        playbackRate={playbackRate}
        muted={scene.muteAudio || volume <= 0}
      />
    </AbsoluteFill>
  );
};

/** Renderiza áudios extras */
const AudioAsset: AssetComponent = ({ scene, sceneDurationSeconds }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const baseVolume = scene.audio?.volume ?? 1;
  const fadeInFrames = (scene.audio?.fadeIn ?? 0) * fps;
  const fadeOutFrames = (scene.audio?.fadeOut ?? 0) * fps;
  const durationFrames = (sceneDurationSeconds || 0) * fps;

  if (!scene.asset_url) return null;

  // Cálculo de volume com fades lineares
  const fadeInScale = fadeInFrames > 0 ? Math.min(1, frame / fadeInFrames) : 1;
  const fadeOutScale = fadeOutFrames > 0 ? Math.max(0, Math.min(1, (durationFrames - frame) / fadeOutFrames)) : 1;
  const volume = baseVolume * fadeInScale * fadeOutScale;

  return (
    <Audio
      src={scene.asset_url}
      volume={Math.max(0, volume)}
      muted={scene.muteAudio || volume <= 0}
    />
  );
};

/** Renderiza vídeo com chroma key */
const ChromaKeyAsset: AssetComponent = ({ scene }) => {
  if (!scene.asset_url) {
    return (
      <AbsoluteFill style={{ backgroundColor: scene.background?.color || '#000000' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100%',
          color: '#666' 
        }}>
          Vídeo ChromaKey não disponível
        </div>
      </AbsoluteFill>
    );
  }
  
  const chromaPreset = scene.chroma_key?.color === 'blue' ? blueScreenPreset : greenScreenPreset;
  
  return (
    <AbsoluteFill style={{ backgroundColor: scene.background?.color || '#000000' }}>
      <ChromaKeyMedia
        src={scene.asset_url}
        type="video"
        chromaKey={chromaPreset}
      />
    </AbsoluteFill>
  );
};

/** Renderiza cor sólida */
const SolidColorAsset: AssetComponent = ({ scene }) => {
  const color = scene.background?.color || scene.asset_url || '#1a1a2e';
  return <AbsoluteFill style={{ backgroundColor: color }} />;
};

/** Renderiza apenas texto (sem background visual) */
const TextOnlyAsset: AssetComponent = ({ scene }) => {
  const color = scene.background?.color || '#1a1a2e';
  return <AbsoluteFill style={{ backgroundColor: color }} />;
};

/** Renderiza padrões geométricos animados */
const GeometricPatternsAsset: AssetComponent = () => (
  <AbsoluteFill>
    <GeometricPatterns />
  </AbsoluteFill>
);

/** Renderiza grade ondulada 3D */
const WavyGridAsset: AssetComponent = () => (
  <AbsoluteFill>
    <WavyGrid />
  </AbsoluteFill>
);

/** Renderiza timeline 3D histórica */
const Timeline3DAsset: AssetComponent = ({ scene }) => {
  const timelineItems: Timeline3DProps['items'] = scene.timeline_config?.items || [];
  return (
    <AbsoluteFill>
      <Timeline3D items={timelineItems} />
    </AbsoluteFill>
  );
};

/** Placeholder para tipos não implementados */
const PlaceholderAsset: AssetComponent = ({ scene }) => (
  <AbsoluteFill style={{ backgroundColor: '#1a1a2e' }}>
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100%',
      color: '#666',
      gap: '10px'
    }}>
      <span style={{ fontSize: '48px' }}>🚧</span>
      <span>Asset tipo "{scene.asset_type}" em desenvolvimento</span>
    </div>
  </AbsoluteFill>
);

// ========================================
// MAPEAMENTO DE COMPONENTES
// ========================================

/**
 * Mapeia cada asset_type para seu componente React.
 */
const ASSET_COMPONENTS: Record<AssetType, AssetComponent> = {
  // Imagens
  image_flux: ImageAsset,
  image_dalle: ImageAsset,
  image_midjourney: ImageAsset,
  image_pexels: ImageAsset,
  image_static: ImageAsset,
  
  // Vídeos
  video_stock: VideoAsset,
  video_pexels: VideoAsset,
  video_kling: VideoAsset,
  video_runway: VideoAsset,
  video_pika: VideoAsset,
  video_vo3: VideoAsset,
  video_veo2: VideoAsset,
  video_frame_animate: VideoAsset,
  video_static: VideoAsset,
  
  // Vídeo especial
  video_chromakey: ChromaKeyAsset,
  
  // Backgrounds especiais
  solid_color: SolidColorAsset,
  text_only: TextOnlyAsset,
  geometric_patterns: GeometricPatternsAsset,
  wavy_grid: WavyGridAsset,
  timeline_3d: Timeline3DAsset,
  audio: AudioAsset,
  
  // Não implementados ainda
  avatar: PlaceholderAsset,
};

// ========================================
// FUNÇÕES EXPORTADAS
// ========================================

/**
 * Helper para detectar se é áudio pela extensão do arquivo
 */
export const isAudioUrl = (url: string | undefined): boolean => {
  if (!url) return false;
  const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
  return audioExtensions.some(ext => url.toLowerCase().endsWith(ext));
};

/**
 * Obtém o componente para um determinado tipo de asset.
 * Retorna undefined se o tipo não existir.
 */
export const getAssetComponent = (assetType: AssetType): AssetComponent | undefined => {
  return ASSET_COMPONENTS[assetType];
};

/**
 * Obtém o componente de fallback para vídeos detectados automaticamente.
 */
export const getVideoFallbackComponent = (): AssetComponent => {
  return VideoAsset as AssetComponent;
};

/**
 * Obtém o componente de fallback para imagens detectadas automaticamente.
 */
export const getImageFallbackComponent = (): AssetComponent => {
  return ImageAsset;
};

// Re-exportar tipos e funções do definitions para conveniência
export { ASSET_DEFINITIONS, type AssetType } from './definitions';
