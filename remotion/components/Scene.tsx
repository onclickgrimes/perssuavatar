/**
 * Scene Component
 * 
 * Renderiza uma cena individual baseada na configuração.
 * Suporta diferentes tipos de assets e aplica efeitos de câmera.
 */
import React from 'react';
import { AbsoluteFill, Img, Video, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Scene as SceneType, CameraMovement } from '../types/project';
import { applyCameraEffect } from '../utils/camera-effects';
import { TextOverlayComponent } from './TextOverlay';

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
  
  // Aplicar efeito de câmera
  const cameraEffect = applyCameraEffect(scene.camera_movement, {
    frame: relativeFrame,
    durationInFrames: sceneDurationFrames,
    fps,
  });
  
  // Debug camera effect
  if (relativeFrame % 30 === 0 && scene.camera_movement === 'trail_printing') { // Log a cada segundo
    console.log(`[Scene ${scene.id}] Camera Movement: ${scene.camera_movement}, Frame: ${relativeFrame}/${sceneDurationFrames}`);
    console.log('🔍 Verificando condição trail_printing:', {
      camera_movement: scene.camera_movement,
      é_igual: scene.camera_movement === 'trail_printing',
      tipo: typeof scene.camera_movement
    });
  }
  
  // Trail printing effect - renderiza múltiplas frames
  if (scene.camera_movement === 'trail_printing') {
    console.log('✅ ENTRANDO NO IF DO TRAIL_PRINTING!');
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
  // Debug log - MUITO IMPORTANTE
  if (relativeFrame % 30 === 0) {
    console.log('🎬 TrailPrintingEffect RENDERIZANDO', { sceneId: scene.id, frame: relativeFrame });
  }
  
  // Configuração do efeito
  const trailCount = 6; // Número de "ecos"/rastros
  const baseOpacity = 0.2; // Opacidade base de cada rastro
  
  // Criar array de índices para os rastros (do mais antigo ao mais recente)
  const trails = Array.from({ length: trailCount }, (_, i) => i);
  
  // Criar efeito de movimento suave usando seno
  const waveFactor = Math.sin(relativeFrame * 0.02) * 15;
  
  return (
    <AbsoluteFill>
      {/* Container com overflow hidden */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
        }}
      >
        {/* Renderizar cada rastro, do mais antigo ao mais recente */}
        {trails.map((trailIndex) => {
          // Calcular opacidade decrescente (mais antigo = mais transparente)
          const opacity = baseOpacity * (1 - trailIndex / (trailCount + 2));
          
          // Offset de posição para criar um efeito de trailing
          // Rastros mais antigos ficam ligeiramente atrás
          const horizontalOffset = trailIndex * 8 - waveFactor * (trailIndex / trailCount);
          const verticalOffset = Math.sin((relativeFrame - trailIndex * 3) * 0.03) * (trailIndex * 2);
          
          // Escala ligeiramente menor para rastros mais antigos
          const scale = 1 - (trailIndex * 0.01);
          
          // Rotação sutil baseada no índice do rastro
          const rotation = (trailIndex - trailCount / 2) * 0.3;
          
          return (
            <div
              key={trailIndex}
              style={{
                position: 'absolute',
                inset: 0,
                opacity,
                transform: `
                  translate(${-horizontalOffset}px, ${verticalOffset}px) 
                  scale(${scale}) 
                  rotate(${rotation}deg)
                `,
                transformOrigin: 'center center',
                filter: `blur(${trailIndex * 0.5}px)`, // Blur progressivo
              }}
            >
              <AssetRenderer scene={scene} />
            </div>
          );
        })}
        
        {/* Frame atual (100% de opacidade) */}
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
  
  // Estilos base para preencher o container
  const fillStyles: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };
  
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
        fontFamily: 'Inter, sans-serif',
        padding: '40px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 20 }}>🖼️</div>
      <div style={{ fontSize: 18, opacity: 0.7 }}>Imagem Placeholder</div>
      <div style={{ fontSize: 14, opacity: 0.5, marginTop: 10, maxWidth: 600 }}>
        {description}
      </div>
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
        fontFamily: 'Inter, sans-serif',
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
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{ fontSize: 80, marginBottom: 20 }}>🤖</div>
      <div style={{ fontSize: 18, opacity: 0.7 }}>Avatar</div>
    </div>
  );
};
