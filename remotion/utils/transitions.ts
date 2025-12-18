/**
 * Transition Effects
 * 
 * Funções para aplicar transições entre cenas.
 * Cada função retorna styles CSS para entrada e saída.
 */
import { interpolate } from 'remotion';
import type { Transition } from '../types/project';

interface TransitionParams {
  /** Frame relativo dentro da transição (0 = início, transitionFrames = fim) */
  frame: number;
  /** Duração da transição em frames */
  transitionFrames: number;
  /** Se é transição de entrada (true) ou saída (false) */
  isEntering: boolean;
}

interface TransitionStyles {
  opacity?: number;
  transform?: string;
  filter?: string;
}

/**
 * Configuração de todas as transições disponíveis
 */
export const TRANSITION_EFFECTS: Record<Transition, { description: string }> = {
  none: {
    description: 'Corte seco - sem transição, mudança instantânea (usado para impacto imediato ou ritmo rápido).',
  },
  fade: {
    description: 'Fade suave - transição gradual de opacidade (usado para mudanças naturais e fluidas).',
  },
  crossfade: {
    description: 'Dissolve entre cenas - sobreposição gradual (usado para continuidade temporal ou temática).',
  },
  slide_left: {
    description: 'Desliza para esquerda - revela próxima cena da direita (usado para progressão ou avanço na narrativa).',
  },
  slide_right: {
    description: 'Desliza para direita - revela próxima cena da esquerda (usado para retrocesso ou flashback).',
  },
  slide_up: {
    description: 'Desliza para cima - revela próxima cena de baixo (usado para elevação ou conclusão).',
  },
  slide_down: {
    description: 'Desliza para baixo - revela próxima cena de cima (usado para descida ou aprofundamento).',
  },
  zoom_in: {
    description: 'Zoom crescente na transição - aproximação dramática (usado para foco ou intensificação).',
  },
  zoom_out: {
    description: 'Zoom decrescente na transição - afastamento revelador (usado para contexto ou distanciamento).',
  },
  wipe_left: {
    description: 'Wipe para esquerda - limpa a tela horizontalmente (usado para mudança definitiva).',
  },
  wipe_right: {
    description: 'Wipe para direita - limpa a tela horizontalmente (usado para mudança definitiva).',
  },
  blur: {
    description: 'Desfoque entre cenas - transição suave com blur (usado para sonhos, memórias ou passagem de tempo).',
  },
  glitch: {
    description: 'Efeito glitch digital - transição com distorção (usado para erro, falha ou estilo cyberpunk).',
  },
};

/**
 * Aplica o efeito de transição baseado no tipo
 */
export function applyTransition(
  transition: Transition,
  params: TransitionParams
): TransitionStyles {
  const { frame, transitionFrames, isEntering } = params;
  
  // Normaliza o progresso de 0 a 1
  const progress = interpolate(
    frame,
    [0, transitionFrames],
    isEntering ? [0, 1] : [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  switch (transition) {
    case 'none':
      return {};
      
    case 'fade':
      return fade(progress);
      
    case 'crossfade':
      return fade(progress);
      
    case 'slide_left':
      return slideHorizontal(progress, isEntering ? 100 : -100);
      
    case 'slide_right':
      return slideHorizontal(progress, isEntering ? -100 : 100);
      
    case 'slide_up':
      return slideVertical(progress, isEntering ? 100 : -100);
      
    case 'slide_down':
      return slideVertical(progress, isEntering ? -100 : 100);
      
    case 'zoom_in':
      return zoomTransition(progress, isEntering ? 0.5 : 1.5);
      
    case 'zoom_out':
      return zoomTransition(progress, isEntering ? 1.5 : 0.5);
      
    case 'wipe_left':
      return wipe(progress, 'left');
      
    case 'wipe_right':
      return wipe(progress, 'right');
      
    case 'blur':
      return blurTransition(progress);
      
    case 'glitch':
      return glitch(progress, frame);
      
    default:
      return { opacity: 1 };
  }
}

// ========================================
// INDIVIDUAL TRANSITIONS
// ========================================

function fade(progress: number): TransitionStyles {
  return {
    opacity: progress,
  };
}

function slideHorizontal(progress: number, startOffset: number): TransitionStyles {
  const x = interpolate(progress, [0, 1], [startOffset, 0]);
  
  return {
    opacity: progress,
    transform: `translateX(${x}%)`,
  };
}

function slideVertical(progress: number, startOffset: number): TransitionStyles {
  const y = interpolate(progress, [0, 1], [startOffset, 0]);
  
  return {
    opacity: progress,
    transform: `translateY(${y}%)`,
  };
}

function zoomTransition(progress: number, startScale: number): TransitionStyles {
  const scale = interpolate(progress, [0, 1], [startScale, 1]);
  
  return {
    opacity: progress,
    transform: `scale(${scale})`,
  };
}

function wipe(progress: number, direction: 'left' | 'right'): TransitionStyles {
  // Wipe é feito via clip-path
  const percentage = progress * 100;
  
  return {
    opacity: 1,
    // Nota: clip-path precisa ser aplicado de forma diferente
    // Este é um fallback para opacity
  };
}

function blurTransition(progress: number): TransitionStyles {
  const blur = interpolate(progress, [0, 1], [20, 0]);
  
  return {
    opacity: progress,
    filter: `blur(${blur}px)`,
  };
}

function glitch(progress: number, frame: number): TransitionStyles {
  // Efeito glitch aleatório baseado no frame
  const glitchIntensity = interpolate(progress, [0, 0.5, 1], [20, 5, 0]);
  const offsetX = Math.sin(frame * 0.5) * glitchIntensity;
  const offsetY = Math.cos(frame * 0.7) * glitchIntensity * 0.5;
  
  return {
    opacity: progress,
    transform: `translate(${offsetX}px, ${offsetY}px)`,
    filter: progress < 0.8 ? `hue-rotate(${Math.sin(frame) * 30}deg)` : 'none',
  };
}

/**
 * Calcula o número de frames para uma transição
 */
export function transitionSecondsToFrames(seconds: number, fps: number): number {
  return Math.round(seconds * fps);
}
