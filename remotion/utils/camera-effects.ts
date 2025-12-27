/**
 * Camera Effects
 * 
 * Funções utilitárias para aplicar efeitos de câmera nas cenas.
 * Cada função retorna um objeto de transform CSS baseado no frame atual.
 */
import { interpolate, spring } from 'remotion';
import { z } from 'zod';

// ========================================
// INTERFACES
// ========================================

export interface CameraEffectParams {
  frame: number;
  durationInFrames: number;
  fps: number;
}

export interface CameraTransform {
  transform: string;
  transformOrigin?: string;
}

// ========================================
// CAMERA MOVEMENTS (SSoT + Implementation)
// ========================================

/**
 * Registro completo de movimentos de câmera: Metadados + Implementação
 * SSoT (Single Source of Truth) para todo o sistema.
 */
export const CAMERA_MOVEMENTS = {
  static: {
    label: 'Estático',
    description: 'Usado para foco total no conteúdo, clareza e estabilidade (falas diretas, explicações).',
    apply: () => ({ transform: 'scale(1) translate(0, 0)' }),
  },
  zoom_in_slow: {
    label: 'Zoom In Lento',
    description: 'Cria aproximação gradual para aumentar atenção, tensão leve ou destaque emocional.',
    apply: (params: CameraEffectParams) => zoomIn(params.frame, params.durationInFrames, 1, 1.15),
  },
  zoom_in_fast: {
    label: 'Zoom In Rápido',
    description: 'Impacto imediato, surpresa ou ênfase forte em um momento específico.',
    apply: (params: CameraEffectParams) => zoomIn(params.frame, params.durationInFrames, 1, 1.3),
  },
  zoom_out_slow: {
    label: 'Zoom Out Lento',
    description: 'Sensação de distanciamento, reflexão ou encerramento de ideia.',
    apply: (params: CameraEffectParams) => zoomOut(params.frame, params.durationInFrames, 1.15, 1),
  },
  zoom_out_fast: {
    label: 'Zoom Out Rápido',
    description: 'Quebra de expectativa, alívio de tensão ou mudança brusca de contexto.',
    apply: (params: CameraEffectParams) => zoomOut(params.frame, params.durationInFrames, 1.3, 1),
  },
  ken_burns: {
    label: 'Ken Burns',
    description: 'Movimento suave (pan + zoom) usado em imagens estáticas para estilo documentário ou narrativo.',
    apply: (params: CameraEffectParams) => kenBurns(params.frame, params.durationInFrames),
  },
  pan_left: {
    label: 'Pan Esquerda',
    description: 'Revelação horizontal de informação, cenário ou transição entre elementos.',
    apply: (params: CameraEffectParams) => panHorizontal(params.frame, params.durationInFrames, 5, -5),
  },
  pan_right: {
    label: 'Pan Direita',
    description: 'Revelação horizontal de informação, cenário ou transição entre elementos.',
    apply: (params: CameraEffectParams) => panHorizontal(params.frame, params.durationInFrames, -5, 5),
  },
  pan_up: {
    label: 'Pan Cima',
    description: 'Revelação vertical, hierarquia visual ou dramatização de escala.',
    apply: (params: CameraEffectParams) => panVertical(params.frame, params.durationInFrames, 5, -5),
  },
  pan_down: {
    label: 'Pan Baixo',
    description: 'Revelação vertical, hierarquia visual ou dramatização de escala.',
    apply: (params: CameraEffectParams) => panVertical(params.frame, params.durationInFrames, -5, 5),
  },
  shake: {
    label: 'Tremor',
    description: 'Transmite urgência, caos, tensão extrema ou impacto emocional.',
    apply: (params: CameraEffectParams) => shake(params.frame, params.fps),
  },
  rotate_cw: {
    label: 'Rotação Horário',
    description: 'Desorientação, instabilidade emocional ou efeito estilizado/dramático.',
    apply: (params: CameraEffectParams) => rotate(params.frame, params.durationInFrames, 0, 3),
  },
  rotate_ccw: {
    label: 'Rotação Anti-Horário',
    description: 'Desorientação, instabilidade emocional ou efeito estilizado/dramático.',
    apply: (params: CameraEffectParams) => rotate(params.frame, params.durationInFrames, 0, -3),
  },
  trail_printing: {
    label: 'Trail Printing',
    description: 'Efeito de rastro/blur de movimento (accordion blur) criando múltiplas exposições dos frames anteriores.',
    apply: (params: CameraEffectParams) => ({ transform: 'scale(1) translate(0, 0)' }),
  },
} as const;

/** Type derivado das chaves do registro */
export type CameraMovement = keyof typeof CAMERA_MOVEMENTS;

/** Zod Schema para validação */
export const CameraMovementSchema = z.enum(
  Object.keys(CAMERA_MOVEMENTS) as [CameraMovement, ...CameraMovement[]]
);

/** Lista formatada para UI (Selects) */
export const CAMERA_MOVEMENT_LIST = Object.entries(CAMERA_MOVEMENTS).map(([value, opt]) => ({
  value: value as CameraMovement,
  label: opt.label,
  description: opt.description,
}));

/**
 * Aplica o efeito de câmera baseado no tipo
 */
export function applyCameraEffect(
  movement: CameraMovement,
  params: CameraEffectParams
): CameraTransform {
  const effect = CAMERA_MOVEMENTS[movement];
  if (effect) {
    return effect.apply(params);
  }
  return { transform: 'scale(1)' };
}

// ========================================
// INDIVIDUAL EFFECTS
// ========================================

function zoomIn(
  frame: number,
  durationInFrames: number,
  startScale: number,
  endScale: number
): CameraTransform {
  const scale = interpolate(
    frame,
    [0, durationInFrames],
    [startScale, endScale],
    { extrapolateRight: 'clamp' }
  );
  
  return {
    transform: `scale(${scale})`,
    transformOrigin: 'center center',
  };
}

function zoomOut(
  frame: number,
  durationInFrames: number,
  startScale: number,
  endScale: number
): CameraTransform {
  const scale = interpolate(
    frame,
    [0, durationInFrames],
    [startScale, endScale],
    { extrapolateRight: 'clamp' }
  );
  
  return {
    transform: `scale(${scale})`,
    transformOrigin: 'center center',
  };
}

function panHorizontal(
  frame: number,
  durationInFrames: number,
  startX: number,
  endX: number
): CameraTransform {
  const x = interpolate(
    frame,
    [0, durationInFrames],
    [startX, endX],
    { extrapolateRight: 'clamp' }
  );
  
  return {
    transform: `scale(1.1) translateX(${x}%)`,
  };
}

function panVertical(
  frame: number,
  durationInFrames: number,
  startY: number,
  endY: number
): CameraTransform {
  const y = interpolate(
    frame,
    [0, durationInFrames],
    [startY, endY],
    { extrapolateRight: 'clamp' }
  );
  
  return {
    transform: `scale(1.1) translateY(${y}%)`,
  };
}

function kenBurns(frame: number, durationInFrames: number): CameraTransform {
  // Efeito Ken Burns: zoom lento + pan suave
  const scale = interpolate(
    frame,
    [0, durationInFrames],
    [1, 1.2],
    { extrapolateRight: 'clamp' }
  );
  
  const x = interpolate(
    frame,
    [0, durationInFrames],
    [0, 3],
    { extrapolateRight: 'clamp' }
  );
  
  const y = interpolate(
    frame,
    [0, durationInFrames],
    [0, -2],
    { extrapolateRight: 'clamp' }
  );
  
  return {
    transform: `scale(${scale}) translate(${x}%, ${y}%)`,
    transformOrigin: 'center center',
  };
}

function shake(frame: number, fps: number): CameraTransform {
  // Tremor sutil
  const intensity = 2;
  const speed = 0.5;
  
  const x = Math.sin(frame * speed) * intensity;
  const y = Math.cos(frame * speed * 1.3) * intensity * 0.5;
  const rotation = Math.sin(frame * speed * 0.7) * 0.5;
  
  return {
    transform: `translate(${x}px, ${y}px) rotate(${rotation}deg)`,
  };
}

function rotate(
  frame: number,
  durationInFrames: number,
  startDeg: number,
  endDeg: number
): CameraTransform {
  const rotation = interpolate(
    frame,
    [0, durationInFrames],
    [startDeg, endDeg],
    { extrapolateRight: 'clamp' }
  );
  
  return {
    transform: `rotate(${rotation}deg)`,
    transformOrigin: 'center center',
  };
}
