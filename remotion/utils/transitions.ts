/**
 * Transition Effects
 * 
 * Funções para aplicar transições entre cenas.
 * Cada função retorna styles CSS para entrada e saída.
 */
import { interpolate } from 'remotion';
import { z } from 'zod';

// ========================================
// INTERFACES
// ========================================

export interface TransitionParams {
  /** Frame relativo dentro da transição (0 = início, transitionFrames = fim) */
  frame: number;
  /** Duração da transição em frames */
  transitionFrames: number;
  /** Se é transição de entrada (true) ou saída (false) */
  isEntering: boolean;
}

export interface TransitionStyles {
  opacity?: number;
  transform?: string;
  filter?: string;
}

// ========================================
// TRANSITIONS (SSoT + Implementation)
// ========================================

/**
 * Registro completo de transições: Metadados + Implementação
 * SSoT (Single Source of Truth) para todo o sistema.
 */
export const TRANSITIONS = {
  none: {
    label: 'Corte Seco',
    description: 'Corte seco - sem transição, mudança instantânea (usado para impacto imediato ou ritmo rápido).',
    apply: () => ({}),
  },
  fade: {
    label: 'Fade',
    description: 'Fade suave - transição gradual de opacidade (usado para mudanças naturais e fluidas).',
    apply: (progress: number) => fade(progress),
  },
  crossfade: {
    label: 'Crossfade',
    description: 'Dissolve entre cenas - sobreposição gradual (usado para continuidade temporal ou temática).',
    apply: (progress: number) => fade(progress),
  },
  slide_left: {
    label: 'Slide Esquerda',
    description: 'Desliza para esquerda - revela próxima cena da direita (usado para progressão ou avanço na narrativa).',
    apply: (progress: number, params: TransitionParams) => slideHorizontal(progress, params.isEntering ? 100 : -100),
  },
  slide_right: {
    label: 'Slide Direita',
    description: 'Desliza para direita - revela próxima cena da esquerda (usado para retrocesso ou flashback).',
    apply: (progress: number, params: TransitionParams) => slideHorizontal(progress, params.isEntering ? -100 : 100),
  },
  slide_up: {
    label: 'Slide Cima',
    description: 'Desliza para cima - revela próxima cena de baixo (usado para elevação ou conclusão).',
    apply: (progress: number, params: TransitionParams) => slideVertical(progress, params.isEntering ? 100 : -100),
  },
  slide_down: {
    label: 'Slide Baixo',
    description: 'Desliza para baixo - revela próxima cena de cima (usado para descida ou aprofundamento).',
    apply: (progress: number, params: TransitionParams) => slideVertical(progress, params.isEntering ? -100 : 100),
  },
  zoom_in: {
    label: 'Zoom In',
    description: 'Zoom crescente na transição - aproximação dramática (usado para foco ou intensificação).',
    apply: (progress: number, params: TransitionParams) => zoomTransition(progress, params.isEntering ? 0.5 : 1.5),
  },
  zoom_out: {
    label: 'Zoom Out',
    description: 'Zoom decrescente na transição - afastamento revelador (usado para contexto ou distanciamento).',
    apply: (progress: number, params: TransitionParams) => zoomTransition(progress, params.isEntering ? 1.5 : 0.5),
  },
  wipe_left: {
    label: 'Wipe Esquerda',
    description: 'Wipe para esquerda - limpa a tela horizontalmente (usado para mudança definitiva).',
    apply: (progress: number) => wipe(progress, 'left'),
  },
  wipe_right: {
    label: 'Wipe Direita',
    description: 'Wipe para direita - limpa a tela horizontalmente (usado para mudança definitiva).',
    apply: (progress: number) => wipe(progress, 'right'),
  },
  blur: {
    label: 'Blur',
    description: 'Desfoque entre cenas - transição suave com blur (usado para sonhos, memórias ou passagem de tempo).',
    apply: (progress: number) => blurTransition(progress),
  },
  glitch: {
    label: 'Glitch',
    description: 'Efeito glitch digital - transição com distorção (usado para erro, falha ou estilo cyberpunk).',
    apply: (progress: number, params: TransitionParams) => glitch(progress, params.frame),
  },
  zoom_transition: {
    label: 'Zoom Dramático',
    description: 'Zoom dramático de transição - aproxima fortemente a cena atual e inicia a próxima (usado para impacto visual e conexão entre cenas).',
    apply: (progress: number, params: TransitionParams) => params.isEntering ? { opacity: 1 } : zoomTransitionOut(progress),
  },
} as const;

/** Type derivado das chaves do registro */
export type Transition = keyof typeof TRANSITIONS;

/** Zod Schema para validação */
export const TransitionSchema = z.enum(
  Object.keys(TRANSITIONS) as [Transition, ...Transition[]]
);

/** Lista formatada para UI (Selects) */
export const TRANSITION_LIST = Object.entries(TRANSITIONS).map(([value, opt]) => ({
  value: value as Transition,
  label: opt.label,
  description: opt.description,
}));

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
  
  const effect = TRANSITIONS[transition];
  if (effect) {
    // @ts-ignore - TS não consegue inferir params opcionais corretamente no map
    return effect.apply(progress, params);
  }
  
  return { opacity: 1 };
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

function zoomTransitionOut(progress: number): TransitionStyles {
  // Zoom dramático de saída
  // progress vai de 1 (início) para 0 (fim saída) quando isEntering = false
  // Inverter: quando progress = 1, zoom = 1 (normal)
  //           quando progress = 0, zoom = 5 (máximo - muito dramático!)
  const scale = interpolate(progress, [0, 1], [5, 1]);
  const opacity = interpolate(progress, [0, 0.3, 1], [0, 0.8, 1]);
  
  // Deslocamento para terminar no CENTRO de um quadrado da grade
  // Aproximadamente 25% de offset para não terminar nas linhas
  const offsetX = interpolate(progress, [0, 1], [25, 0]);
  const offsetY = interpolate(progress, [0, 1], [25, 0]);
  
  // Efeito bokeh (blur) no final do zoom
  // Aumenta o blur quanto mais próximo do fim (progress -> 0)
  const blurAmount = interpolate(progress, [0, 0.5, 1], [20, 5, 0]);
  
  return {
    opacity,
    transform: `translate(${offsetX}%, ${offsetY}%) scale(${scale})`,
    filter: `blur(${blurAmount}px)`,
  };
}

/**
 * Calcula o número de frames para uma transição
 */
export function transitionSecondsToFrames(seconds: number, fps: number): number {
  return Math.round(seconds * fps);
}
