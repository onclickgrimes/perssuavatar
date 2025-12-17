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

/**
 * Aplica o efeito de câmera baseado no tipo
 */
export function applyCameraEffect(
  movement: CameraMovement,
  params: CameraEffectParams
): CameraTransform {
  const { frame, durationInFrames, fps } = params;
  
  switch (movement) {
    case 'static':
      return { transform: 'scale(1) translate(0, 0)' };
      
    case 'zoom_in_slow':
      return zoomIn(frame, durationInFrames, 1, 1.15);
      
    case 'zoom_in_fast':
      return zoomIn(frame, durationInFrames, 1, 1.3);
      
    case 'zoom_out_slow':
      return zoomOut(frame, durationInFrames, 1.15, 1);
      
    case 'zoom_out_fast':
      return zoomOut(frame, durationInFrames, 1.3, 1);
      
    case 'pan_left':
      return panHorizontal(frame, durationInFrames, 5, -5);
      
    case 'pan_right':
      return panHorizontal(frame, durationInFrames, -5, 5);
      
    case 'pan_up':
      return panVertical(frame, durationInFrames, 5, -5);
      
    case 'pan_down':
      return panVertical(frame, durationInFrames, -5, 5);
      
    case 'ken_burns':
      return kenBurns(frame, durationInFrames);
      
    case 'shake':
      return shake(frame, fps);
      
    case 'rotate_cw':
      return rotate(frame, durationInFrames, 0, 3);
      
    case 'rotate_ccw':
      return rotate(frame, durationInFrames, 0, -3);
      
    default:
      return { transform: 'scale(1)' };
  }
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
