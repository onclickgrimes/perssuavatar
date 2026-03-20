/**
 * Video Studio Types
 * 
 * Tipos específicos do frontend.
 * Os tipos de projeto/segmento estão em shared/utils/project-converter.ts (SSoT)
 */

// Re-exportar tipos do conversor (Single Source of Truth)
export type { 
  VideoSegment,
  VideoProject,
  WordTiming,
  HighlightWordConfig,
  ChromaKeyConfig,
  BackgroundConfig,
  TimelineConfig,
} from '../shared/utils/project-converter';

// ========================================
// WORKFLOW (específico do frontend)
// ========================================

export type WorkflowStep = 
  | 'upload'
  | 'transcribing'
  | 'analyzing'
  | 'keyframes'
  | 'prompts'
  | 'images'
  | 'preview'
  | 'rendering'
  | 'complete';

// ========================================
// ALIASES (compatibilidade)
// ========================================

import type { VideoSegment, VideoProject } from '../shared/utils/project-converter';

/** @deprecated Use VideoSegment */
export type TranscriptionSegment = VideoSegment;

/** Estado do projeto no frontend (estende VideoProject com props específicas de UI) */
export interface ProjectState extends VideoProject {
  audioFile?: File; // Específico do frontend (objeto File do browser)
  audioUrl?: string;
}

// ========================================
// HÍBRIDO (FFMPEG + REMOTION OVERLAYS)
// ========================================

/** 
 * Representa um clipe de vídeo/imagem longo processado pelo FFmpeg nativamente.
 * Contém dados essenciais de renderização (transições, effects...).
 */
export interface NativeVideoClip {
  id: number | string;
  sourceUrl: string;
  startTime: number;
  endTime: number;
  cameraMovement?: string;
  transition?: string;
  transitionDuration?: number;
}

/** 
 * Representa os gráficos, textos, e overlays que serão renderizados pelo 
 * Remotion com fundo transparente (Alpha Channel / WebM).
 */
export interface RemotionOverlayClip {
  id: number | string;
  startTime: number;
  endTime: number;
  textOverlay?: any;
  highlightWords?: any[];
  animatedSvg?: any;
}
