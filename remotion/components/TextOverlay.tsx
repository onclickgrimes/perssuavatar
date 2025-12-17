/**
 * Text Overlay Component
 * 
 * Renderiza texto sobreposto na cena com diferentes estilos e animações.
 */
import React from 'react';
import { interpolate, spring, useVideoConfig } from 'remotion';
import type { TextOverlay } from '../types/project';

interface TextOverlayProps {
  config: NonNullable<TextOverlay>;
  relativeFrame: number;
  sceneDurationFrames: number;
}

export const TextOverlayComponent: React.FC<TextOverlayProps> = ({
  config,
  relativeFrame,
  sceneDurationFrames,
}) => {
  const { fps } = useVideoConfig();
  
  // Animação de entrada
  const animation = getAnimation(config.animation || 'fade', relativeFrame, sceneDurationFrames, fps);
  
  // Posicionamento
  const positionStyles = getPositionStyles(config.position || 'bottom');
  
  // Estilo visual
  const visualStyle = getVisualStyle(config.style || 'subtitle', config);
  
  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyles,
        ...animation,
        ...visualStyle,
      }}
    >
      {config.text}
    </div>
  );
};

// ========================================
// POSITION STYLES
// ========================================

function getPositionStyles(position: string): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px 40px',
    maxWidth: '80%',
  };
  
  switch (position) {
    case 'top':
      return { ...base, top: '10%', left: '50%', transform: 'translateX(-50%)' };
    case 'center':
      return { ...base, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    case 'bottom':
      return { ...base, bottom: '10%', left: '50%', transform: 'translateX(-50%)' };
    case 'top-left':
      return { ...base, top: '10%', left: '5%' };
    case 'top-right':
      return { ...base, top: '10%', right: '5%' };
    case 'bottom-left':
      return { ...base, bottom: '10%', left: '5%' };
    case 'bottom-right':
      return { ...base, bottom: '10%', right: '5%' };
    default:
      return { ...base, bottom: '10%', left: '50%', transform: 'translateX(-50%)' };
  }
}

// ========================================
// VISUAL STYLES
// ========================================

function getVisualStyle(
  style: string,
  config: NonNullable<TextOverlay>
): React.CSSProperties {
  const baseStyle: React.CSSProperties = {
    fontFamily: 'Inter, Arial, sans-serif',
    textAlign: 'center',
    color: config.color || '#FFFFFF',
    textShadow: '0 2px 10px rgba(0,0,0,0.8)',
  };
  
  switch (style) {
    case 'title':
      return {
        ...baseStyle,
        fontSize: config.fontSize || 72,
        fontWeight: 800,
        letterSpacing: '-0.02em',
        textTransform: 'uppercase',
      };
      
    case 'subtitle':
      return {
        ...baseStyle,
        fontSize: config.fontSize || 36,
        fontWeight: 500,
        backgroundColor: config.backgroundColor || 'rgba(0,0,0,0.6)',
        padding: '15px 30px',
        borderRadius: 8,
      };
      
    case 'caption':
      return {
        ...baseStyle,
        fontSize: config.fontSize || 24,
        fontWeight: 400,
        backgroundColor: config.backgroundColor || 'rgba(0,0,0,0.7)',
        padding: '10px 20px',
        borderRadius: 4,
      };
      
    case 'highlight':
      return {
        ...baseStyle,
        fontSize: config.fontSize || 48,
        fontWeight: 700,
        backgroundColor: config.backgroundColor || '#FFD700',
        color: config.color || '#000000',
        padding: '10px 30px',
        borderRadius: 4,
        textShadow: 'none',
      };
      
    case 'quote':
      return {
        ...baseStyle,
        fontSize: config.fontSize || 32,
        fontWeight: 400,
        fontStyle: 'italic',
        borderLeft: '4px solid #FFD700',
        paddingLeft: 20,
        backgroundColor: config.backgroundColor || 'rgba(0,0,0,0.5)',
        padding: '20px 30px 20px 25px',
      };
      
    default:
      return baseStyle;
  }
}

// ========================================
// ANIMATIONS
// ========================================

function getAnimation(
  animation: string,
  frame: number,
  durationInFrames: number,
  fps: number
): React.CSSProperties {
  const fadeInEnd = Math.min(30, durationInFrames * 0.2);
  const fadeOutStart = durationInFrames - Math.min(30, durationInFrames * 0.2);
  
  // Opacity padrão (fade in/out)
  const opacity = interpolate(
    frame,
    [0, fadeInEnd, fadeOutStart, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  switch (animation) {
    case 'none':
      return { opacity: 1 };
      
    case 'fade':
      return { opacity };
      
    case 'typewriter':
      // Nota: Typewriter real precisaria de lógica especial no texto
      return { opacity };
      
    case 'slide_up':
      const slideY = interpolate(
        frame,
        [0, fadeInEnd],
        [50, 0],
        { extrapolateRight: 'clamp' }
      );
      return { 
        opacity,
        transform: `translateY(${slideY}px)`,
      };
      
    case 'pop':
      const scale = spring({
        frame,
        fps,
        config: {
          damping: 10,
          stiffness: 100,
        },
      });
      return { 
        opacity,
        transform: `scale(${scale})`,
      };
      
    case 'bounce':
      const bounceScale = spring({
        frame,
        fps,
        config: {
          damping: 8,
          stiffness: 200,
        },
      });
      return { 
        opacity,
        transform: `scale(${bounceScale})`,
      };
      
    default:
      return { opacity };
  }
}
