/**
 * Project Converter - Single Source of Truth
 * 
 * ⭐ ESTE É O ÚNICO ARQUIVO ONDE VOCÊ DEFINE TIPOS DE PROJETO ⭐
 * 
 * Adicionar uma nova propriedade:
 * 1. Adicionar à interface VideoSegment ou VideoProject
 * 2. Adicionar à lista SEGMENT_PROPERTIES ou PROJECT_PROPERTIES
 * 3. Pronto! Save/load/preview/render funcionam automaticamente.
 */

// ========================================
// TIPOS - Single Source of Truth
// ========================================

/** Palavra do Deepgram com timing */
export interface WordTiming {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker: number;
  punctuatedWord: string;
}

/** Configuração de Highlight Word */
export interface HighlightWordConfig {
  text: string;
  time: number;
  duration?: number;
  entryAnimation?: string;
  exitAnimation?: string;
  size?: string | number;
  position?: string;
  effect?: string;
  color?: string;
  highlightColor?: string;
  fontWeight?: string;
}

/** Configuração de Chroma Key */
export interface ChromaKeyConfig {
  color: 'green' | 'blue' | 'custom';
  customColor?: { r: number; g: number; b: number };
  threshold?: number;
  smoothing?: number;
}

/** Configuração de Background */
export interface BackgroundConfig {
  type: 'image' | 'video' | 'solid_color';
  url?: string;
  color?: string;
}

/** Configuração de Timeline 3D */
export interface TimelineConfig {
  items: Array<{
    id: string;
    year: string;
    label: string;
    image?: string;
  }>;
}

/**
 * ⭐ SEGMENTO - Adicione novas propriedades aqui!
 */
export interface VideoSegment {
  id: number;
  text: string;
  start: number;
  end: number;
  speaker: number;
  
  // Deepgram
  words?: WordTiming[];
  
  // AI Analysis
  emotion?: string;
  imagePrompt?: string;
  assetType?: string;
  cameraMovement?: string;
  transition?: string;
  
  // Media
  imageUrl?: string;
  asset_url?: string;
  
  // Components
  highlightWords?: HighlightWordConfig[];
  chroma_key?: ChromaKeyConfig;
  background?: BackgroundConfig;
  timeline_config?: TimelineConfig;
}

/**
 * ⭐ PROJETO - Adicione novas propriedades aqui!
 */
export interface VideoProject {
  title: string;
  description?: string;
  duration: number;
  audioPath?: string;
  segments: VideoSegment[];
  selectedAspectRatios?: string[];
  subtitleMode?: 'paragraph' | 'word-by-word';
  componentsAllowed?: string[];
  config?: {
    width?: number;
    height?: number;
    fps?: number;
    backgroundColor?: string;
  };
}

// ========================================
// LISTAS DE PROPRIEDADES (mapeamento automático)
// ========================================

const SEGMENT_PROPERTIES: (keyof VideoSegment)[] = [
  'id', 'text', 'start', 'end', 'speaker', 'words',
  'emotion', 'imagePrompt', 'assetType', 'cameraMovement', 'transition',
  'imageUrl', 'asset_url',
  'highlightWords', 'chroma_key', 'background', 'timeline_config',
];

const PROJECT_PROPERTIES: (keyof VideoProject)[] = [
  'title', 'description', 'duration', 'audioPath', 'segments',
  'selectedAspectRatios', 'subtitleMode', 'componentsAllowed', 'config',
];

// ========================================
// FUNÇÕES DE CONVERSÃO
// ========================================

/** Mapeia um segmento copiando todas as propriedades definidas */
export function mapSegment(source: any): VideoSegment {
  const segment: Partial<VideoSegment> = {};
  for (const prop of SEGMENT_PROPERTIES) {
    if (source[prop] !== undefined) {
      (segment as any)[prop] = source[prop];
    }
  }
  return segment as VideoSegment;
}

/** Mapeia um projeto copiando todas as propriedades definidas */
export function mapProject(source: any): VideoProject {
  const project: Partial<VideoProject> = {};
  for (const prop of PROJECT_PROPERTIES) {
    if (prop === 'segments' && source.segments) {
      project.segments = source.segments.map(mapSegment);
    } else if (source[prop] !== undefined) {
      (project as any)[prop] = source[prop];
    }
  }
  project.segments = project.segments || [];
  project.title = project.title || '';
  project.duration = project.duration || 0;
  return project as VideoProject;
}

/** Converte projeto para formato de salvamento */
export function toSaveFormat(project: VideoProject, niche?: { components_allowed?: string[] }): VideoProject {
  return {
    ...mapProject(project),
    componentsAllowed: niche?.components_allowed || project.componentsAllowed,
  };
}

/** Converte projeto carregado para estado do frontend */
export function fromSaveFormat(loaded: any): VideoProject {
  const project = mapProject(loaded);
  project.selectedAspectRatios = project.selectedAspectRatios || ['9:16'];
  return project;
}

/** Converte segmento para formato Remotion (Scene) */
export function segmentToRemotionScene(seg: VideoSegment): any {
  return {
    id: seg.id,
    start_time: seg.start,
    end_time: seg.end,
    transcript_segment: seg.text,
    visual_concept: {
      description: seg.text,
      art_style: 'photorealistic',
      emotion: seg.emotion || 'neutro',
    },
    asset_type: seg.assetType || 'image_static',
    asset_url: seg.asset_url || seg.imageUrl || '',
    prompt_suggestion: seg.imagePrompt || '',
    camera_movement: seg.cameraMovement || 'static',
    transition: seg.transition || 'fade',
    transition_duration: 0.5,
    text_overlay: {
      text: seg.text,
      position: 'bottom',
      style: 'subtitle',
      animation: 'fade',
      words: seg.words,
    },
    ...(seg.chroma_key && { chroma_key: seg.chroma_key }),
    ...(seg.highlightWords?.length && { highlight_words: seg.highlightWords }),
    ...(seg.background && { background: seg.background }),
    ...(seg.timeline_config && { timeline_config: seg.timeline_config }),
  };
}

/** Converte projeto para formato Remotion */
export function toRemotionFormat(
  project: VideoProject,
  options: {
    subtitleMode: 'paragraph' | 'word-by-word';
    width: number;
    height: number;
    fps?: number;
    componentsAllowed?: string[];
    audioUrl?: string;
    defaultFont?: string;
  }
): any {
  return {
    project_title: project.title,
    description: project.description,
    config: {
      width: options.width,
      height: options.height,
      fps: options.fps || 30,
      backgroundColor: '#0a0a0a',
      subtitleMode: options.subtitleMode,
      componentsAllowed: options.componentsAllowed || project.componentsAllowed,
      defaultFont: options.defaultFont,
      ...(options.audioUrl && {
        backgroundMusic: { src: options.audioUrl, volume: 1.0 },
      }),
    },
    scenes: project.segments.map(segmentToRemotionScene),
    schema_version: '1.0',
  };
}

// ========================================
// UTILITÁRIOS
// ========================================

export const ASPECT_RATIO_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '3:4': { width: 1080, height: 1440 },
};

export function audioPathToUrl(audioPath: string | undefined, baseUrl = 'http://localhost:9999'): string | undefined {
  if (!audioPath) return undefined;
  if (audioPath.startsWith('http')) return audioPath;
  return `${baseUrl}/${audioPath.split(/[\\/]/).pop()}`;
}
