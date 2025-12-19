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
        
      case 'wave':
        // Efeito de onda: texto aparece vazado e enche de baixo pra cima
        // Não aplicamos transformações aqui, o efeito é feito via CSS
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
        
      case 'wave':
        // Efeito de onda: texto esvazia de cima pra baixo
        // Não aplicamos transformações aqui, o efeito é feito via CSS
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
  
  // ========================================
  // EFEITO WAVE (Preenchimento de baixo pra cima)
  // ========================================
  
  let waveClipPath = 'none';
  let waveStroke = 'none';
  let waveStrokeWidth = 0;
  let waveFillOpacity = 1;
  
  // Se a animação é wave, calcular o progresso do preenchimento
  if (highlight.entryAnimation === 'wave' || highlight.exitAnimation === 'wave') {
    const isEntry = highlight.entryAnimation === 'wave' && frameInHighlight < entryDuration;
    const isExit = highlight.exitAnimation === 'wave' && frameInHighlight > exitStart;
    
    let fillProgress = 1; // 1 = totalmente preenchido, 0 = vazio
    
    if (isEntry) {
      // Durante entrada: enche de baixo pra cima (0 -> 1)
      fillProgress = frameInHighlight / entryDuration;
    } else if (isExit) {
      // Durante saída: esvazia de cima pra baixo (1 -> 0)
      fillProgress = 1 - ((frameInHighlight - exitStart) / exitDuration);
    }
    
    // Clip path que revela de baixo pra cima
    const clipPercent = fillProgress * 100;
    waveClipPath = `inset(${100 - clipPercent}% 0 0 0)`;
    
    // Outline sempre visível
    waveStroke = textColor;
    waveStrokeWidth = 3;
    
    // Opacidade do preenchimento baseado no progresso
    waveFillOpacity = fillProgress;
  }
  
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 100 }}>
      <div
        style={{
          position: 'absolute',
          ...positionStyles,
          transform: `translate(-50%, -50%) ${combinedTransform}`,
          opacity: combinedOpacity,
          filter: exitFilter,
        }}
      >
        {/* Renderizar diferente se for efeito wave */}
        {(highlight.entryAnimation === 'wave' || highlight.exitAnimation === 'wave') ? (
          <WaveText
            text={highlight.text}
            fontSize={fontSize}
            fontWeight={weight === 'black' ? 900 : weight === 'bold' ? 700 : 400}
            color={textColor}
            fillProgress={(() => {
              const isEntry = highlight.entryAnimation === 'wave' && frameInHighlight < entryDuration;
              const isExit = highlight.exitAnimation === 'wave' && frameInHighlight > exitStart;
              
              if (isEntry) {
                return frameInHighlight / entryDuration;
              } else if (isExit) {
                return 1 - ((frameInHighlight - exitStart) / exitDuration);
              }
              return 1;
            })()}
            frame={frameInHighlight}
          />
        ) : (
          // Renderização normal para outros efeitos
          <div
            style={{
          fontSize: `${fontSize}px`,
          fontWeight: weight === 'black' ? 900 : weight === 'bold' ? 700 : 400,
          color: textColor,
          textShadow,
          backgroundColor: highlight.highlightColor,
          padding: highlight.highlightColor ? '10px 30px' : undefined,
          borderRadius: highlight.highlightColor ? '15px' : undefined,
          whiteSpace: 'nowrap',
          fontFamily: 'Pricedown',
          letterSpacing: '0.05em',
          textAlign: 'center',
        }}
      >
        {highlight.text}
      </div>
        )}
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

// ========================================
// WAVE TEXT COMPONENT
// ========================================

interface WaveTextProps {
  text: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  fillProgress: number; // 0 = vazio, 1 = cheio
  frame: number;
}

const WaveText: React.FC<WaveTextProps> = ({ 
  text, 
  fontSize, 
  fontWeight, 
  color, 
  fillProgress,
  frame 
}) => {
  // Calcular a posição vertical da onda (de baixo pra cima)
  const waveBaseY = 100 - (fillProgress * 100);
  
  // Criar IDs únicos para os elementos SVG
  const clipId = `wave-clip-${text.replace(/\s/g, '-')}-${Math.random().toString(36).substr(2, 9)}`;
  

    // Animação da onda (movimento horizontal) - suave e elegante
  // const wavePhase1 = (frame * 0.4) % 1; // Onda principal (mais lenta)
  // const wavePhase2 = (frame * 0.6) % 1; // Onda secundária (um pouco mais rápida)
  // Animação da onda (movimento horizontal) - lenta e contemplativa
  const wavePhase1 = (frame * 0.1) % 1; // Onda principal (bem lenta)
  const wavePhase2 = (frame * 0.1) % 1; // Onda secundária (um pouco mais rápida)
  
  // Amplitude das ondas (quanto elas sobem e descem) - valores para ondulação visível
  const amplitude = 6; // 6% de altura - picos e vales bem definidos
  const amplitudeCrest = 10; // 10% para a crista - ondulação mais pronunciada
  
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Outline (sempre visível) */}
      <div
        style={{
          fontSize: `${fontSize}px`,
          fontWeight,
          color: 'transparent',
          WebkitTextStroke: `3px ${color}`,
          whiteSpace: 'nowrap',
          fontFamily: 'Pricedown',
          letterSpacing: '0.05em',
          textAlign: 'center',
        }}
      >
        {text}
      </div>
      
      {/* Container SVG para as ondas */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
          pointerEvents: 'none',
        }}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        <defs>
          {/* Definir o clipPath com ondas animadas */}
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            {/* Onda principal (sólida) - ondas longas e fluidas */}
            <path
              d={`
                M 0,${(waveBaseY + amplitude * Math.sin(wavePhase1 * Math.PI * 2)) / 100}
                Q 0.25,${(waveBaseY + amplitude * Math.sin((wavePhase1 + 0.25) * Math.PI * 2)) / 100}
                  0.5,${(waveBaseY + amplitude * Math.sin((wavePhase1 + 0.5) * Math.PI * 2)) / 100}
                Q 0.75,${(waveBaseY + amplitude * Math.sin((wavePhase1 + 0.75) * Math.PI * 2)) / 100}
                  1,${(waveBaseY + amplitude * Math.sin((wavePhase1 + 1) * Math.PI * 2)) / 100}
                L 1,1
                L 0,1
                Z
              `}
              vectorEffect="non-scaling-stroke"
            />
          </clipPath>
          
          {/* Clip para a onda transparente (crista) - ondas ainda maiores */}
          <clipPath id={`${clipId}-transparent`} clipPathUnits="objectBoundingBox">
            <path
              d={`
                M 0,${((waveBaseY - 8) + amplitudeCrest * Math.sin(wavePhase2 * Math.PI * 2)) / 100}
                Q 0.25,${((waveBaseY - 8) + amplitudeCrest * Math.sin((wavePhase2 + 0.25) * Math.PI * 2)) / 100}
                  0.5,${((waveBaseY - 8) + amplitudeCrest * Math.sin((wavePhase2 + 0.5) * Math.PI * 2)) / 100}
                Q 0.75,${((waveBaseY - 8) + amplitudeCrest * Math.sin((wavePhase2 + 0.75) * Math.PI * 2)) / 100}
                  1,${((waveBaseY - 8) + amplitudeCrest * Math.sin((wavePhase2 + 1) * Math.PI * 2)) / 100}
                L 1,1
                L 0,1
                Z
              `}
              vectorEffect="non-scaling-stroke"
            />
          </clipPath>
        </defs>
      </svg>
      
      {/* Preenchimento sólido com clip das ondas */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          fontSize: `${fontSize}px`,
          fontWeight,
          color,
          whiteSpace: 'nowrap',
          fontFamily: 'Pricedown',
          letterSpacing: '0.05em',
          textAlign: 'center',
          clipPath: `url(#${clipId})`,
        }}
      >
        {text}
      </div>
      
      {/* Onda transparente adicional (efeito de espuma na crista) */}
      {fillProgress > 0 && fillProgress < 1 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            fontSize: `${fontSize}px`,
            fontWeight,
            color,
            whiteSpace: 'nowrap',
            fontFamily: 'Pricedown',
            letterSpacing: '0.05em',
            textAlign: 'center',
            opacity: 0.4,
            clipPath: `url(#${clipId}-transparent)`,
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
};

export default HighlightWordComponent;
