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
