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
