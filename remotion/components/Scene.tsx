/**
 * Scene Component
 * 
 * Renderiza uma cena individual baseada na configuração.
 * Suporta diferentes tipos de assets e aplica efeitos de câmera.
 */
import React from 'react';
import { AbsoluteFill, Html5Video, Img, Video, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Scene as SceneType, CameraMovement } from '../types/project';
import { applyCameraEffect } from '../utils/camera-effects';
import { TextOverlayComponent } from './TextOverlay';
import { HighlightWordComponent } from './HighlightWord';
import { AnimatedSvgOverlay } from './AnimatedSvgOverlay';
import { GeometricPatterns } from './GeometricPatterns';
import { WavyGrid } from './WavyGrid';
import { Timeline3D } from './Timeline3D';
import { ChromaKeyMedia, greenScreenPreset, blueScreenPreset } from './ChromaKeyMedia';
import { useProjectConfig } from '../contexts/ProjectConfigContext';


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
        {scene.text_overlay?.words && (
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
          <AssetRenderer scene={scene} />
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
      {scene.text_overlay?.words && (
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
              <AssetRenderer scene={scene} />
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
          <AssetRenderer scene={scene} />
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
}

const AssetRenderer: React.FC<AssetRendererProps> = ({ scene }) => {
  const { asset_type, asset_url, visual_concept } = scene;
  
  // Helper para detectar se é vídeo pela extensão do arquivo
  const isVideoUrl = (url: string | undefined): boolean => {
    if (!url) return false;
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
    return videoExtensions.some(ext => url.toLowerCase().endsWith(ext));
  };
  
  // Estilos base para preencher o container
  const fillStyles: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };
  
  // Se tiver URL, verificar se é vídeo automaticamente
  // Mas se for video_chromakey, deixar o switch tratar
  if (asset_url && asset_type !== 'video_chromakey') {
    if (isVideoUrl(asset_url)) {
      // É um vídeo - renderizar com componente Video
      return <Html5Video src={asset_url} style={fillStyles} />;
    }
  }
  
  switch (asset_type) {
    // Imagens
    case 'image_flux':
    case 'image_dalle':
    case 'image_midjourney':
    case 'image_static':
      if (asset_url) {
        return <Img src={asset_url} style={fillStyles} />;
      }
      // Placeholder se não houver URL
      return <PlaceholderImage description={visual_concept.description} />;
    
    // Vídeos
    case 'video_kling':
    case 'video_runway':
    case 'video_pika':
    case 'video_static':
      if (asset_url) {
        return <Video src={asset_url} style={fillStyles} />;
      }
      return <PlaceholderVideo description={visual_concept.description} />;
    
    // Vídeo com Chroma Key
    case 'video_chromakey':
      if (asset_url) {
        // Usar configuração de chroma key da cena ou preset padrão
        const chromaKeyConfig = scene.chroma_key || greenScreenPreset;
        
        return (
          <ChromaKeyMedia
            src={asset_url}
            type="video"
            chromaKey={{
              color: chromaKeyConfig.color || 'green',
              customColor: chromaKeyConfig.customColor,
              threshold: chromaKeyConfig.threshold ?? 100,
              smoothing: chromaKeyConfig.smoothing ?? 0.2,
            }}
          />
        );
      }
      return <PlaceholderVideo description={`Chroma Key: ${visual_concept.description}`} />;
    
    // Cor sólida
    case 'solid_color':
      const bgColor = visual_concept.color_palette?.[0] || '#000000';
      return (
        <div
          style={{
            ...fillStyles,
            backgroundColor: bgColor,
          }}
        />
      );
    
    // Padrões Geométricos
    case 'geometric_patterns':
      return <GeometricPatterns />;
    
    // Grade Ondulada 3D
    case 'wavy_grid':
      return <WavyGrid />;
    
    // Timeline 3D
    case 'timeline_3d':
       if (scene.timeline_config) {
            return <Timeline3D items={scene.timeline_config.items} />;
       }
       // Fallback mock data if allowed or just placeholder
       return <PlaceholderImage description="Timeline 3D (Sem configuração)" />;
    
    // Apenas texto
    case 'text_only':
      return (
        <div
          style={{
            ...fillStyles,
            backgroundColor: '#0a0a0a',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        />
      );
    
    // Avatar (placeholder por enquanto)
    case 'avatar':
      return <PlaceholderAvatar />;
    
    default:
      return <PlaceholderImage description="Cena sem asset definido" />;
  }
};

// ========================================
// PLACEHOLDERS
// ========================================

const PlaceholderImage: React.FC<{ description: string }> = ({ description }) => {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#1a1a2e',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        color: '#666',
        fontFamily: 'inherit',
        padding: '40px',
        textAlign: 'center',
      }}
    >
      {/* <div style={{ fontSize: 48, marginBottom: 20 }}>🖼️</div> */}
      {/* <div style={{ fontSize: 18, opacity: 0.7 }}>Imagem Placeholder</div> */}
      {/* <div style={{ fontSize: 14, opacity: 0.5, marginTop: 10, maxWidth: 600 }}>
        {description}
      </div> */}
    </div>
  );
};

const PlaceholderVideo: React.FC<{ description: string }> = ({ description }) => {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#1a1a2e',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        color: '#666',
        fontFamily: 'inherit',
        padding: '40px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 20 }}>🎬</div>
      <div style={{ fontSize: 18, opacity: 0.7 }}>Vídeo Placeholder</div>
      <div style={{ fontSize: 14, opacity: 0.5, marginTop: 10, maxWidth: 600 }}>
        {description}
      </div>
    </div>
  );
};

const PlaceholderAvatar: React.FC = () => {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#16213e',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        color: '#666',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ fontSize: 80, marginBottom: 20 }}>🤖</div>
      <div style={{ fontSize: 18, opacity: 0.7 }}>Avatar</div>
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
