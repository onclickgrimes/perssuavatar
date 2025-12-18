/**
 * Highlight Word Component
 * 
 * Componente para renderizar palavras destacadas com animações
 * de entrada (pop, bounce, etc) e saída (evaporate, dissolve, etc)
 */
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { HighlightWord } from '../types/project';

interface HighlightWordComponentProps {
  highlight: HighlightWord;
  sceneStartFrame: number;
  sceneDurationFrames: number;
}

export const HighlightWordComponent: React.FC<HighlightWordComponentProps> = ({
  highlight,
  sceneStartFrame,
  sceneDurationFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Calcular frames relativos à cena
  const relativeFrame = frame - sceneStartFrame;
  const startFrame = Math.round((highlight.time || 0) * fps);
  const durationFrames = Math.round((highlight.duration || 1.5) * fps);
  const endFrame = startFrame + durationFrames;
  
  // Debug log (comentar para produção)
  /*
  if (relativeFrame === 0 || (relativeFrame >= startFrame && relativeFrame <= startFrame + 2)) {
    console.log('🎯 HighlightWord:', {
      text: highlight.text,
      frame,
      sceneStartFrame,
      relativeFrame,
      startFrame,
      endFrame,
      durationFrames,
      shouldShow: relativeFrame >= startFrame && relativeFrame <= endFrame
    });
  }
  */
  
  // Não renderizar se fora do tempo
  if (relativeFrame < startFrame || relativeFrame > endFrame) {
    return null;
  }

  
  // Frames para animações (30% entrada, 40% estático, 30% saída)
  const entryDuration = durationFrames * 0.3;
  const exitStart = durationFrames * 0.7;
  const exitDuration = durationFrames * 0.3;
  
  const frameInHighlight = relativeFrame - startFrame;
  
  // ========================================
  // ANIMAÇÕES DE ENTRADA
  // ========================================
  
  let entryTransform = '';
  let entryOpacity = 1;
  
  if (frameInHighlight < entryDuration) {
    const entryProgress = frameInHighlight / entryDuration;
    
    switch (highlight.entryAnimation) {
      case 'pop':
        const popScale = interpolate(entryProgress, [0, 0.5, 1], [0, 1.3, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        entryTransform = `scale(${popScale})`;
        entryOpacity = interpolate(entryProgress, [0, 0.3, 1], [0, 1, 1]);
        break;
        
      case 'bounce':
        const bounceScale = interpolate(
          entryProgress,
          [0, 0.3, 0.5, 0.7, 1],
          [0, 1.4, 0.9, 1.1, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        entryTransform = `scale(${bounceScale})`;
        entryOpacity = interpolate(entryProgress, [0, 0.2, 1], [0, 1, 1]);
        break;
        
      case 'explode':
        const explodeScale = interpolate(entryProgress, [0, 0.4, 1], [0.3, 1.5, 1]);
        const explodeRotate = interpolate(entryProgress, [0, 1], [0, 360]);
        entryTransform = `scale(${explodeScale}) rotate(${explodeRotate}deg)`;
        entryOpacity = interpolate(entryProgress, [0, 0.3, 1], [0, 1, 1]);
        break;
        
      case 'slide_up':
        const slideY = interpolate(entryProgress, [0, 1], [100, 0]);
        entryTransform = `translateY(${slideY}px)`;
        entryOpacity = interpolate(entryProgress, [0, 0.5, 1], [0, 1, 1]);
        break;
        
      case 'zoom_in':
        const zoomScale = interpolate(entryProgress, [0, 1], [0.5, 1]);
        entryTransform = `scale(${zoomScale})`;
        entryOpacity = entryProgress;
        break;
        
      case 'fade':
        entryOpacity = entryProgress;
        break;
    }
  }
  
  // ========================================
  // ANIMAÇÕES DE SAÍDA
  // ========================================
  
  let exitTransform = '';
  let exitOpacity = 1;
  let exitFilter = '';
  let particleEffect = false;
  
  if (frameInHighlight > exitStart) {
    const exitProgress = (frameInHighlight - exitStart) / exitDuration;
    
    switch (highlight.exitAnimation) {
      case 'evaporate':
        // Efeito de evaporação: sobe, fica menor e transparente
        const evapY = interpolate(exitProgress, [0, 1], [0, -150]);
        const evapScale = interpolate(exitProgress, [0, 0.5, 1], [1, 0.8, 0.3]);
        exitOpacity = interpolate(exitProgress, [0, 0.6, 1], [1, 0.5, 0]);
        exitTransform = `translateY(${evapY}px) scale(${evapScale})`;
        exitFilter = `blur(${exitProgress * 8}px)`;
        particleEffect = true;
        break;
        
      case 'dissolve':
        exitOpacity = interpolate(exitProgress, [0, 1], [1, 0]);
        exitFilter = `blur(${exitProgress * 15}px)`;
        const dissolveScale = interpolate(exitProgress, [0, 1], [1, 1.2]);
        exitTransform = `scale(${dissolveScale})`;
        break;
        
      case 'implode':
        const implodeScale = interpolate(exitProgress, [0, 1], [1, 0]);
        const implodeRotate = interpolate(exitProgress, [0, 1], [0, -360]);
        exitTransform = `scale(${implodeScale}) rotate(${implodeRotate}deg)`;
        exitOpacity = interpolate(exitProgress, [0, 0.7, 1], [1, 1, 0]);
        break;
        
      case 'scatter':
        // Efeito de dispersão
        const scatterScale = interpolate(exitProgress, [0, 1], [1, 0.5]);
        const scatterRotate = interpolate(exitProgress, [0, 1], [0, 180]);
        exitOpacity = interpolate(exitProgress, [0, 1], [1, 0]);
        exitTransform = `scale(${scatterScale}) rotate(${scatterRotate}deg)`;
        exitFilter = `blur(${exitProgress * 10}px)`;
        particleEffect = true;
        break;
        
      case 'slide_down':
        const slideDownY = interpolate(exitProgress, [0, 1], [0, 100]);
        exitTransform = `translateY(${slideDownY}px)`;
        exitOpacity = interpolate(exitProgress, [0, 0.5, 1], [1, 1, 0]);
        break;
        
      case 'fade':
        exitOpacity = interpolate(exitProgress, [0, 1], [1, 0]);
        break;
    }
  }
  
  // ========================================
  // CÁLCULO DE TAMANHO
  // ========================================
  
  let fontSize: number;
  if (typeof highlight.size === 'number') {
    fontSize = highlight.size;
  } else {
    switch (highlight.size) {
      case 'small': fontSize = 48; break;
      case 'medium': fontSize = 72; break;
      case 'large': fontSize = 108; break;
      case 'huge': fontSize = 144; break;
      default: fontSize = 108;
    }
  }
  
  // ========================================
  // CÁLCULO DE POSIÇÃO
  // ========================================
  
  const positionStyles: React.CSSProperties = {};
  switch (highlight.position) {
    case 'center':
      positionStyles.top = '50%';
      positionStyles.left = '50%';
      break;
    case 'top':
    case 'top-center': // Alias para 'top'
      positionStyles.top = '20%';
      positionStyles.left = '50%';
      break;
    case 'bottom':
    case 'bottom-center': // Alias para 'bottom'
      positionStyles.bottom = '20%';
      positionStyles.left = '50%';
      break;
    case 'top-left':
      positionStyles.top = '15%';
      positionStyles.left = '15%';
      break;
    case 'top-right':
      positionStyles.top = '15%';
      positionStyles.right = '15%';
      break;
    case 'bottom-left':
      positionStyles.bottom = '15%';
      positionStyles.left = '15%';
      break;
    case 'bottom-right':
      positionStyles.bottom = '15%';
      positionStyles.right = '15%';
      break;
    case 'center-left':
    case 'left': // Centro vertical, esquerda horizontal
      positionStyles.top = '50%';
      positionStyles.left = '15%';
      break;
    case 'center-right':
    case 'right': // Centro vertical, direita horizontal
      positionStyles.top = '50%';
      positionStyles.right = '15%';
      break;
    default:
      // Fallback para center se posição inválida
      positionStyles.top = '50%';
      positionStyles.left = '50%';
      break;
  }
  
  // ========================================
  // VALORES PADRÃO
  // ========================================
  
  const textColor = highlight.color || '#FFFFFF';
  const effectType = highlight.effect || 'glow';
  const weight = highlight.fontWeight || 'bold';
  
  // ========================================
  // EFEITOS VISUAIS
  // ========================================
  
  let textShadow = '';
  switch (effectType) {
    case 'glow':
      textShadow = `
        0 0 20px ${textColor},
        0 0 40px ${textColor},
        0 0 60px ${textColor}
      `;
      break;
    case 'shadow':
      textShadow = '4px 4px 8px rgba(0,0,0,0.8)';
      break;
    case 'outline':
      textShadow = `
        -2px -2px 0 #000,
        2px -2px 0 #000,
        -2px 2px 0 #000,
        2px 2px 0 #000
      `;
      break;
    case 'neon':
      textShadow = `
        0 0 10px #fff,
        0 0 20px #fff,
        0 0 30px ${textColor},
        0 0 40px ${textColor},
        0 0 50px ${textColor},
        0 0 60px ${textColor},
        0 0 70px ${textColor}
      `;
      break;
  }

  
  // Combinar transformações
  const combinedTransform = [entryTransform, exitTransform].filter(Boolean).join(' ');
  const combinedOpacity = entryOpacity * exitOpacity;
  
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 100 }}>
      <div
        style={{
          position: 'absolute',
          ...positionStyles,
          transform: `translate(-50%, -50%) ${combinedTransform}`,
          opacity: combinedOpacity,
          filter: exitFilter,
          fontSize: `${fontSize}px`,
          fontWeight: weight === 'black' ? 900 : weight === 'bold' ? 700 : 400,
          color: textColor,
          textShadow,
          backgroundColor: highlight.highlightColor,
          padding: highlight.highlightColor ? '10px 30px' : undefined,
          borderRadius: highlight.highlightColor ? '15px' : undefined,
          whiteSpace: 'nowrap',
          fontFamily: 'Inter, Arial, sans-serif',
          letterSpacing: '0.05em',
          textAlign: 'center',
        }}
      >
        {highlight.text}
      </div>
      
      {/* Efeito de partículas para evaporate/scatter */}
      {particleEffect && frameInHighlight > exitStart && (
        <ParticleEffect
          text={highlight.text}
          progress={(frameInHighlight - exitStart) / exitDuration}
          positionStyles={positionStyles}
          color={textColor}
        />
      )}
    </AbsoluteFill>
  );
};

// ========================================
// PARTICLE EFFECT
// ========================================

interface ParticleEffectProps {
  text: string;
  progress: number;
  positionStyles: React.CSSProperties;
  color: string;
}

const ParticleEffect: React.FC<ParticleEffectProps> = ({ text, progress, positionStyles, color }) => {
  const particles = Array.from({ length: 20 }, (_, i) => {
    const angle = (i / 20) * Math.PI * 2;
    const distance = interpolate(progress, [0, 1], [0, 200]);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance - progress * 100; // Sobe também
    const opacity = interpolate(progress, [0, 0.5, 1], [0.8, 0.4, 0]);
    const scale = interpolate(progress, [0, 1], [1, 0.2]);
    
    return { x, y, opacity, scale };
  });
  
  return (
    <>
      {particles.map((particle, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            ...positionStyles,
            transform: `translate(-50%, -50%) translate(${particle.x}px, ${particle.y}px) scale(${particle.scale})`,
            opacity: particle.opacity,
            fontSize: '20px',
            color,
            fontWeight: 'bold',
          }}
        >
          •
        </div>
      ))}
    </>
  );
};

export default HighlightWordComponent;
