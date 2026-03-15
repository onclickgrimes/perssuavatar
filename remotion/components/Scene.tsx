/**
 * Scene Component
 * 
 * Renderiza uma cena individual baseada na configuração.
 * Suporta diferentes tipos de assets e aplica efeitos de câmera.
 */
import React from 'react';
import { AbsoluteFill, Html5Video, Img, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Scene as SceneType, CameraMovement } from '../types/project';
import { applyCameraEffect } from '../utils/camera-effects';
import { TextOverlayComponent } from './TextOverlay';
import { HighlightWordComponent } from './HighlightWord';
import { AnimatedSvgOverlay } from './AnimatedSvgOverlay';
import { useProjectConfig } from '../contexts/ProjectConfigContext';
import { getAssetComponent, getVideoFallbackComponent, getImageFallbackComponent, type AssetType } from '../assets/registry';


interface SceneProps {
  scene: SceneType;
  /** Frame relativo ao início desta cena */
  relativeFrame: number;
  /** Duração desta cena em frames */
  sceneDurationFrames: number;
}

export const Scene: React.FC<SceneProps> = ({
  scene,
  relativeFrame,
  sceneDurationFrames,
}) => {
  const { fps } = useVideoConfig();
  const currentFrame = useCurrentFrame(); // Chamar hook no nível do componente
  const projectConfig = useProjectConfig();
  
  // Verificar se AnimatedSvgOverlay está habilitado
  const isAnimatedSvgEnabled = projectConfig.componentsAllowed?.includes('AnimatedSvgOverlay') ?? false;
  
  // Calcular o frame de início da cena
  const sceneStartFrame = currentFrame - relativeFrame;
  
  // Aplicar efeito de câmera
  const cameraEffect = applyCameraEffect(scene.camera_movement, {
    frame: relativeFrame,
    durationInFrames: sceneDurationFrames,
    fps,
  });
  
  // Debug: verificar highlight_words
  if (relativeFrame === 0 && scene.highlight_words) {
    console.log(`🎬 Scene ${scene.id} highlight_words:`, scene.highlight_words);
  }
  
  
  // Trail printing effect - renderiza múltiplas frames
  if (scene.camera_movement === 'trail_printing') {
    return (
      <AbsoluteFill>
        <TrailPrintingEffect
          scene={scene}
          relativeFrame={relativeFrame}
          sceneDurationFrames={sceneDurationFrames}
        />
        
        {/* Overlay de texto */}
        {scene.text_overlay && (
          <TextOverlayComponent
            config={scene.text_overlay}
            relativeFrame={relativeFrame}
            sceneDurationFrames={sceneDurationFrames}
            sceneStartTime={scene.start_time}
          />
        )}
        
        {/* Palavras destacadas */}
        {scene.highlight_words?.map((highlight, index) => (
          <HighlightWordComponent
            key={`highlight-${index}`}
            highlight={highlight}
            sceneStartFrame={sceneStartFrame}
            sceneDurationFrames={sceneDurationFrames}
          />
        ))}
        
        {/* SVGs animados baseados nas palavras das legendas */}
        {isAnimatedSvgEnabled && scene.text_overlay?.words && (
          <AnimatedSvgOverlay
            words={scene.text_overlay.words}
            sceneStartTime={scene.start_time}
            relativeFrame={relativeFrame}
            fps={fps}
          />
        )}
      </AbsoluteFill>
    );
  }
  
  return (
    <AbsoluteFill>
      {/* Container com efeito de câmera */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            ...cameraEffect,
          }}
        >
          {/* Renderiza o background se existir */}
          {scene.background && <BackgroundRenderer scene={scene} />}
          
          {/* Renderiza o asset baseado no tipo */}
          <AssetRenderer scene={scene} sceneDurationFrames={sceneDurationFrames} fps={fps} />
        </div>
      </div>
      
      {/* Overlay de texto */}
      {scene.text_overlay && (
        <TextOverlayComponent
          config={scene.text_overlay}
          relativeFrame={relativeFrame}
          sceneDurationFrames={sceneDurationFrames}
          sceneStartTime={scene.start_time}
        />
      )}
      
      {/* Palavras destacadas com animações */}
      {scene.highlight_words?.map((highlight, index) => (
        <HighlightWordComponent
          key={`highlight-${index}`}
          highlight={highlight}
          sceneStartFrame={sceneStartFrame}
          sceneDurationFrames={sceneDurationFrames}
        />
      ))}
      
      {/* SVGs animados baseados nas palavras das legendas */}
      {isAnimatedSvgEnabled && scene.text_overlay?.words && (
        <AnimatedSvgOverlay
          words={scene.text_overlay.words}
          sceneStartTime={scene.start_time}
          relativeFrame={relativeFrame}
          fps={fps}
        />
      )}
    </AbsoluteFill>
  );
};

// ========================================
// TRAIL PRINTING EFFECT
// ========================================

interface TrailPrintingEffectProps {
  scene: SceneType;
  relativeFrame: number;
  sceneDurationFrames: number;
}

const TrailPrintingEffect: React.FC<TrailPrintingEffectProps> = ({
  scene,
  relativeFrame,
  sceneDurationFrames,
}) => {
  const { fps } = useVideoConfig();
  // Configuração do efeito - Motion Blur Style
  // NOTA: Este efeito funciona melhor com IMAGENS ou movimentos de CÂMERA
  // Com vídeos estáticos, o efeito é sutil pois não podemos mostrar frames anteriores
  const trailCount = 5;
  const baseOpacity = 0.3;
  
  const trails = Array.from({ length: trailCount }, (_, i) => i);
  const time = relativeFrame * 0.05;
  
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
        }}
      >
        {/* Camadas de blur para efeito de motion blur */}
        {trails.reverse().map((trailIndex) => {
          const opacity = baseOpacity * Math.pow(1 - trailIndex / trailCount, 1.5);
          const offset = trailIndex * 15;
          const rotation = Math.sin(time + trailIndex) * 1.5;
          const scale = 1 - trailIndex * 0.02;
          const blurAmount = trailIndex * 2;
          
          return (
            <div
              key={`trail-${trailIndex}`}
              style={{
                position: 'absolute',
                inset: 0,
                opacity,
                transform: `
                  translateX(${-offset}px) 
                  rotate(${rotation}deg)
                  scale(${scale})
                `,
                transformOrigin: 'center center',
                filter: `blur(${blurAmount}px)`,
                mixBlendMode: 'screen',
              }}
            >
              <AssetRenderer scene={scene} sceneDurationFrames={sceneDurationFrames} fps={fps} />
            </div>
          );
        })}
        
        {/* Camada principal */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
          }}
        >
          <AssetRenderer scene={scene} sceneDurationFrames={sceneDurationFrames} fps={fps} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ========================================
// ASSET RENDERER
// ========================================

interface AssetRendererProps {
  scene: SceneType;
  sceneDurationFrames?: number;
  fps?: number;
}

const AssetRenderer: React.FC<AssetRendererProps> = ({ scene, sceneDurationFrames, fps: propFps }) => {
  const { asset_type, asset_url } = scene;
  const { fps: configFps } = useVideoConfig();
  const fps = propFps || configFps;
  
  // Calcular duração da cena em segundos para o playbackRate
  const sceneDurationSeconds = sceneDurationFrames && fps ? sceneDurationFrames / fps : undefined;
  
  // Helper para detectar se é vídeo pela extensão do arquivo
  const isVideoUrl = (url: string | undefined): boolean => {
    if (!url) return false;
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
    return videoExtensions.some(ext => url.toLowerCase().endsWith(ext));
  };

  // Helper para detectar se é imagem pela extensão do arquivo
  const isImageUrl = (url: string | undefined): boolean => {
    if (!url) return false;
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff'];
    return imageExtensions.some(ext => url.toLowerCase().endsWith(ext));
  };
  
  // Obter componente do registry
  let Component = getAssetComponent(asset_type as AssetType);
  
  // Lógica de compatibilidade: Se tiver URL de vídeo, força renderização como vídeo
  // a menos que seja chroma_key (que tem tratamento próprio)
  if (asset_url && asset_type !== 'video_chromakey') {
    if (isVideoUrl(asset_url)) {
      Component = getVideoFallbackComponent();
    } else if (isImageUrl(asset_url)) {
      Component = getImageFallbackComponent();
    }
  }

  if (Component) {
    return <Component scene={scene} sceneDurationSeconds={sceneDurationSeconds} />;
  }
  
  // Fallback se não encontrar o componente
  return (
    <div style={{
      width: '100%', height: '100%', backgroundColor: '#1a1a2e',
      display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#666'
    }}>
      Asset tipo "{asset_type}" não encontrado no registro.
    </div>
  );
};

// ========================================
// BACKGROUND RENDERER
// ========================================

interface BackgroundRendererProps {
  scene: SceneType;
}

const BackgroundRenderer: React.FC<BackgroundRendererProps> = ({ scene }) => {
  const { background } = scene;
  
  if (!background) return null;
  
  const fillStyles: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    zIndex: -1, // Garante que fique atrás
  };
  
  switch (background.type) {
    case 'image':
      if (background.url) {
        return <Img src={background.url} style={fillStyles} />;
      }
      return null;
      
    case 'video':
      if (background.url) {
        return <Html5Video src={background.url} style={fillStyles} />;
      }
      return null;
      
    case 'solid_color':
      return (
        <div
          style={{
            ...fillStyles,
            backgroundColor: background.color || background.url || '#000000',
          }}
        />
      );
      
    default:
      return null;
  }
};
