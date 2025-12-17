/**
 * Camera Effects
 * 
 * Funções utilitárias para aplicar efeitos de câmera nas cenas.
 * Cada função retorna um objeto de transform CSS baseado no frame atual.
 */
import { interpolate, spring } from 'remotion';
import type { CameraMovement } from '../types/project';

interface CameraEffectParams {
  frame: number;
  durationInFrames: number;
  fps: number;
}

interface CameraTransform {
  transform: string;
  transformOrigin?: string;
}

export const CAMERA_EFFECTS: Record<CameraMovement, { description: string; apply: (params: CameraEffectParams) => CameraTransform }> = {
  static: {
    description: 'Usado para foco total no conteúdo, clareza e estabilidade (falas diretas, explicações).',
    apply: () => ({ transform: 'scale(1) translate(0, 0)' }),
  },
  zoom_in_slow: {
    description: 'Cria aproximação gradual para aumentar atenção, tensão leve ou destaque emocional.',
    apply: (params) => zoomIn(params.frame, params.durationInFrames, 1, 1.15),
  },
  zoom_in_fast: {
    description: 'Impacto imediato, surpresa ou ênfase forte em um momento específico.',
    apply: (params) => zoomIn(params.frame, params.durationInFrames, 1, 1.3),
  },
  zoom_out_slow: {
    description: 'Sensação de distanciamento, reflexão ou encerramento de ideia.',
    apply: (params) => zoomOut(params.frame, params.durationInFrames, 1.15, 1),
  },
  zoom_out_fast: {
    description: 'Quebra de expectativa, alívio de tensão ou mudança brusca de contexto.',
    apply: (params) => zoomOut(params.frame, params.durationInFrames, 1.3, 1),
  },
  ken_burns: {
    description: 'Movimento suave (pan + zoom) usado em imagens estáticas para estilo documentário ou narrativo.',
    apply: (params) => kenBurns(params.frame, params.durationInFrames),
  },
  pan_left: {
    description: 'Revelação horizontal de informação, cenário ou transição entre elementos.',
    apply: (params) => panHorizontal(params.frame, params.durationInFrames, 5, -5),
  },
  pan_right: {
    description: 'Revelação horizontal de informação, cenário ou transição entre elementos.',
    apply: (params) => panHorizontal(params.frame, params.durationInFrames, -5, 5),
  },
  pan_up: {
    description: 'Revelação vertical, hierarquia visual ou dramatização de escala.',
    apply: (params) => panVertical(params.frame, params.durationInFrames, 5, -5),
  },
  pan_down: {
    description: 'Revelação vertical, hierarquia visual ou dramatização de escala.',
    apply: (params) => panVertical(params.frame, params.durationInFrames, -5, 5),
  },
  shake: {
    description: 'Transmite urgência, caos, tensão extrema ou impacto emocional.',
    apply: (params) => shake(params.frame, params.fps),
  },
  rotate_cw: {
    description: 'Desorientação, instabilidade emocional ou efeito estilizado/dramático.',
    apply: (params) => rotate(params.frame, params.durationInFrames, 0, 3),
  },
  rotate_ccw: {
    description: 'Desorientação, instabilidade emocional ou efeito estilizado/dramático.',
    apply: (params) => rotate(params.frame, params.durationInFrames, 0, -3),
  },
};

/**
 * Aplica o efeito de câmera baseado no tipo
 */
export function applyCameraEffect(
  movement: CameraMovement,
  params: CameraEffectParams
): CameraTransform {
  const effect = CAMERA_EFFECTS[movement];
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
