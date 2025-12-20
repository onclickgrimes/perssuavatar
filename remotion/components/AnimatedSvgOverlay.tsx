/**
 * Animated SVG Overlay Component
 * 
 * Detecta palavras nas legendas que correspondem a nomes de SVGs
 * e os anima suavemente: sobem, giram por 2 segundos e descem
 */
import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, Img } from 'remotion';
import { useProjectConfig } from '../contexts/ProjectConfigContext';

// Lista padrão de SVGs (usado se não houver configuração customizada)
const DEFAULT_SVG_MAPPINGS = [
  { svgName: 'brave', keywords: ['brave'] },
  { svgName: 'btc', keywords: ['btc', 'bitcoin'] },
  { svgName: 'chrome', keywords: ['chrome'] },
  { svgName: 'facebook', keywords: ['facebook', 'fb'] },
  { svgName: 'nvidia', keywords: ['nvidia'] },
  { svgName: 'x', keywords: ['x', 'twitter'] },
  { svgName: 'tiktok', keywords: ['tiktok'] },
];

interface Word {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker: number;
  punctuatedWord: string;
}

interface AnimatedSvgOverlayProps {
  words?: Word[];
  sceneStartTime: number; // Tempo de início da cena em segundos
  relativeFrame: number;
  fps: number;
}

interface SvgAnimation {
  svgName: string;
  startTime: number; // Tempo absoluto em segundos
  endTime: number;   // Tempo absoluto em segundos
}

export const AnimatedSvgOverlay: React.FC<AnimatedSvgOverlayProps> = ({
  words = [],
  sceneStartTime,
  relativeFrame,
  fps,
}) => {
  const projectConfig = useProjectConfig();
  
  // Calcular tempo atual absoluto em segundos
  const currentTimeInSeconds = sceneStartTime + (relativeFrame / fps);

  // Usar configuração customizada ou fallback para padrão
  const svgMappings = projectConfig.svgAnimations || DEFAULT_SVG_MAPPINGS;

  // Encontrar SVGs a serem animados baseado nas palavras
  const svgAnimations = useMemo<SvgAnimation[]>(() => {
    if (!words || words.length === 0) return [];

    const animations: SvgAnimation[] = [];
    
    words.forEach((wordData) => {
      // Normalizar palavra para comparação (remover pontuação e converter para lowercase)
      const normalizedWord = wordData.word.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Verificar se a palavra corresponde a algum SVG configurado
      const matchingConfig = svgMappings.find(config => 
        config.keywords.some(keyword => 
          normalizedWord === keyword.toLowerCase().replace(/[^a-z0-9]/g, '')
        )
      );
      
      if (matchingConfig) {
        // Adicionar animação que começa quando a palavra é falada
        // e dura 2 segundos (subir + girar + descer)
        animations.push({
          svgName: matchingConfig.svgName,
          startTime: wordData.start,
          endTime: wordData.start + 2, // 2 segundos de animação
        });
      }
    });

    return animations;
  }, [words, svgMappings]);

  // Debug log
  if (relativeFrame === 0 && svgAnimations.length > 0) {
    console.log('🎨 SVG Animations found:', svgAnimations);
  }

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 90 }}>
      {svgAnimations.map((animation, index) => {
        // Verificar se esta animação deve estar visível no frame atual
        const isActive = currentTimeInSeconds >= animation.startTime && 
                        currentTimeInSeconds <= animation.endTime;
        
        if (!isActive) return null;

        return (
          <AnimatedSvg
            key={`${animation.svgName}-${animation.startTime}-${index}`}
            svgName={animation.svgName}
            currentTime={currentTimeInSeconds}
            startTime={animation.startTime}
            endTime={animation.endTime}
            index={index}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// ========================================
// ANIMATED SVG COMPONENT
// ========================================

interface AnimatedSvgProps {
  svgName: string;
  currentTime: number;
  startTime: number;
  endTime: number;
  index: number; // Para posicionamento variado
}

const AnimatedSvg: React.FC<AnimatedSvgProps> = ({
  svgName,
  currentTime,
  startTime,
  endTime,
  index,
}) => {
  const duration = endTime - startTime; // Deve ser 2 segundos
  const progress = (currentTime - startTime) / duration; // 0 a 1
  
  // Dividir a animação em 3 fases: subida (40%), rotação (40%), descida rápida (20%)
  const phaseRiseEnd = 0.40;    // 0 a 0.40: subir suavemente
  const phaseRotateEnd = 0.80;  // 0.40 a 0.80: girar na horizontal
  const phaseFallEnd = 1.0;     // 0.80 a 1.0: descer rapidamente
  
  // ========================================
  // FASE 1: SUBIR (0 - 0.40) - DE FORA DA TELA
  // ========================================
  let translateY = 0;
  let rotationY = 0; // Rotação horizontal (como moeda)
  let opacity = 1;
  let scale = 1;
  
  if (progress <= phaseRiseEnd) {
    // Subir suavemente de FORA da tela (200px abaixo) para posição final (-50px acima do centro)
    const riseProgress = progress / phaseRiseEnd;
    translateY = interpolate(riseProgress, [0, 1], [200, -50], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    
    // Fade in suave
    opacity = interpolate(riseProgress, [0, 0.2, 1], [0, 1, 1]);
    
    // Escalar de pequeno para normal
    scale = interpolate(riseProgress, [0, 0.6, 1], [0.3, 1.05, 1]);
  }
  
  // ========================================
  // FASE 2: GIRAR NA HORIZONTAL (0.40 - 0.80)
  // ========================================
  else if (progress <= phaseRotateEnd) {
    const rotateProgress = (progress - phaseRiseEnd) / (phaseRotateEnd - phaseRiseEnd);
    
    // Girar 360 graus no eixo Y (horizontal, como moeda girando)
    rotationY = interpolate(rotateProgress, [0, 1], [0, 360], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    
    translateY = -50; // Manter na posição elevada
    opacity = 1;
    scale = 1;
  }
  
  // ========================================
  // FASE 3: DESCER RAPIDAMENTE (0.80 - 1.0)
  // ========================================
  else {
    const fallProgress = (progress - phaseRotateEnd) / (phaseFallEnd - phaseRotateEnd);
    
    // Descer RAPIDAMENTE para fora da tela
    translateY = interpolate(fallProgress, [0, 1], [-50, 200], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    
    // Fade out rápido
    opacity = interpolate(fallProgress, [0, 0.5, 1], [1, 0.6, 0]);
    
    // Encolher rapidamente
    scale = interpolate(fallProgress, [0, 0.6, 1], [1, 0.7, 0.3]);
    
    // Manter a rotação final
    rotationY = 360;
  }
  
  // ========================================
  // POSICIONAMENTO
  // ========================================
  // Variar posição horizontal baseado no índice para evitar sobreposição
  const positions = [
    { left: '20%' },
    { left: '40%' },
    { left: '60%' },
    { left: '80%' },
    { left: '50%' },
  ];
  
  const position = positions[index % positions.length];
  
  return (
    <div
      style={{
        position: 'absolute',
        top: '30%', // Posição vertical base
        ...position,
        transform: `translateX(-50%) translateY(${translateY}px) rotateY(${rotationY}deg) scale(${scale})`,
        opacity,
        transition: 'none', // Sem transições CSS, apenas interpolação do Remotion
      }}
    >
      <Img
        src={`/svgs/${svgName}.svg`}
        style={{
          width: '120px',
          height: '120px',
          objectFit: 'contain',
          filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))',
        }}
      />
    </div>
  );
};

export default AnimatedSvgOverlay;
