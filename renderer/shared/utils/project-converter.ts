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

/** Configuração de Transformação Visual (PiP) */
export interface TransformConfig {
  scale?: number;
  positionX?: number;
  positionY?: number;
  opacity?: number;
}

export const FLOW_WATERMARK_VIDEO_SERVICES = new Set(['veo3', 'veo3-lite-flow', 'veo2-flow']);
export const FLOW_WATERMARK_TRANSFORM: Pick<TransformConfig, 'scale' | 'positionX'> = {
  scale: 1.09,
  positionX: 3,
};

export function isFlowWatermarkVideoService(generationService: unknown): boolean {
  return typeof generationService === 'string'
    && FLOW_WATERMARK_VIDEO_SERVICES.has(generationService.trim());
}

export function ensureFlowWatermarkTransform<T extends { generationService?: string | null; transform?: TransformConfig }>(
  segment: T,
  options: { force?: boolean } = {}
): T {
  if (!isFlowWatermarkVideoService(segment.generationService)) {
    return segment;
  }

  const currentTransform = segment.transform || {};
  const hasValidScale = typeof currentTransform.scale === 'number' && Number.isFinite(currentTransform.scale);
  const hasValidPositionX = typeof currentTransform.positionX === 'number' && Number.isFinite(currentTransform.positionX);
  const nextScale = options.force || !hasValidScale
    ? FLOW_WATERMARK_TRANSFORM.scale
    : currentTransform.scale;
  const nextPositionX = options.force || !hasValidPositionX
    ? FLOW_WATERMARK_TRANSFORM.positionX
    : currentTransform.positionX;

  if (
    currentTransform === segment.transform
    && currentTransform.scale === nextScale
    && currentTransform.positionX === nextPositionX
  ) {
    return segment;
  }

  return {
    ...segment,
    transform: {
      ...currentTransform,
      scale: nextScale,
      positionX: nextPositionX,
    },
  };
}

/** Configuração de Áudio */
export interface AudioConfig {
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
}

export interface MotionGraphicsReferenceImage {
  id?: string;
  name?: string;
  path?: string;
  url?: string;
  dataUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  source?: 'upload' | 'frame' | 'scene';
}

export interface MotionGraphicsChatPersistedMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
  provider?: string;
  model?: string;
  attachedImages?: MotionGraphicsReferenceImage[];
  skillsUsed?: string[];
}

export interface MotionGraphicsSegmentData {
  code?: string;
  title?: string;
  durationInSeconds?: number;
  durationInFrames?: number;
  updatedAt?: number;
  messages?: MotionGraphicsChatPersistedMessage[];
}

/** Referência de personagem extraída/definida na modal de Personagens e Lugares */
export interface StoryCharacterReferenceItem {
  id: number;
  character: string;
  prompt_en: string;
  reference_id: number | null;
  imageUrl?: string;
}

/** Referência de lugar extraída/definida na modal de Personagens e Lugares */
export interface StoryLocationReferenceItem {
  id: number;
  location: string;
  prompt_en: string;
  reference_id: number | null;
  imageUrl?: string;
}

/** Estado persistente da modal de Personagens e Lugares */
export interface StoryReferencesState {
  characters?: StoryCharacterReferenceItem[];
  locations?: StoryLocationReferenceItem[];
  characterStyle?: string;
  locationStyle?: string;
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
  fileName?: string;
  
  // Deepgram
  words?: WordTiming[];
  
  // AI Analysis
  emotion?: string;
  imagePrompt?: string;
  IdOfTheCharactersInTheScene?: string;
  IdOfTheLocationInTheScene?: string;
  sceneDescription?: string;
  assetType?: string;
  cameraMovement?: string;
  transition?: string;
  transitionDuration?: number;
  track?: number;
  
  // Media
  imageUrl?: string;
  /** Preserva a última imagem estática válida para poder reutilizar após gerar vídeo */
  sourceImageUrl?: string;
  /** Serviço que gerou a mídia atual da cena (null quando upload manual do usuário) */
  generationService?: string | null;
  asset_url?: string;
  /** Duração real do asset de vídeo em segundos (para cálculo de playbackRate) */
  asset_duration?: number;
  
  // Components
  highlightWords?: HighlightWordConfig[];
  chroma_key?: ChromaKeyConfig;
  background?: BackgroundConfig;
  timeline_config?: TimelineConfig;
  transform?: TransformConfig;
  audio?: AudioConfig;
  motionGraphics?: MotionGraphicsSegmentData;
  firstFrame?: string;
  animateFrame?: string;
  imagePromptTraduzido?: string;
  firstFrameTraduzido?: string;
  animateFrameTraduzido?: string;
  // Compatibilidade com projetos antigos (legado)
  imagePromptOriginal?: string;
  firstFrameOriginal?: string;
  animateFrameOriginal?: string;
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
  subtitleMode?: 'paragraph' | 'word-by-word' | 'none';
  componentsAllowed?: string[];
  nicheId?: number;
  nicheName?: string;
  storyReferences?: StoryReferencesState;
  config?: {
    width?: number;
    height?: number;
    fps?: number;
    backgroundColor?: string;
    fitVideoToScene?: boolean;
    removeAudioSilences?: boolean;
    audioSilencePaddingMs?: number;
    audioMutedRanges?: Array<{
      sourceStart: number;
      sourceEnd: number;
      outputStart: number;
      outputEnd: number;
    }>;
    mainAudioVolume?: number;
    motionGraphics?: {
      code?: string;
      messages?: Array<{
        role: 'user' | 'assistant';
        content: string;
        timestamp?: number;
        provider?: string;
        model?: string;
        attachedImages?: MotionGraphicsReferenceImage[];
        skillsUsed?: string[];
      }>;
    };
  };
}

// ========================================
// LISTAS DE PROPRIEDADES (mapeamento automático)
// ========================================

const SEGMENT_PROPERTIES: (keyof VideoSegment)[] = [
  'id', 'text', 'start', 'end', 'speaker', 'words',
  'emotion', 'imagePrompt', 'IdOfTheCharactersInTheScene', 'IdOfTheLocationInTheScene', 'sceneDescription', 'assetType', 'cameraMovement', 'transition', 'transitionDuration', 'track',
  'fileName', 'imageUrl', 'sourceImageUrl', 'generationService', 'asset_url', 'asset_duration',
  'highlightWords', 'chroma_key', 'background', 'timeline_config', 'transform', 'audio', 'motionGraphics',
  'firstFrame',
  'animateFrame',
  'imagePromptTraduzido',
  'firstFrameTraduzido',
  'animateFrameTraduzido',
];

const PROJECT_PROPERTIES: (keyof VideoProject)[] = [
  'title', 'description', 'duration', 'audioPath', 'segments',
  'selectedAspectRatios', 'subtitleMode', 'componentsAllowed',
  'nicheId', 'nicheName', 'storyReferences', 'config',
];

export const hasSegmentTextOrWords = (segment: Partial<VideoSegment> | null | undefined): boolean => {
  const hasText = typeof segment?.text === 'string' && segment.text.length > 0;
  const hasWords = Array.isArray(segment?.words) && segment.words.length > 0;
  return hasText || hasWords;
};

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

  // Migração: projetos antigos usavam ...Original para armazenar tradução
  if (segment.imagePromptTraduzido == null && source.imagePromptOriginal != null) {
    segment.imagePromptTraduzido = source.imagePromptOriginal;
  }
  if (segment.firstFrameTraduzido == null && source.firstFrameOriginal != null) {
    segment.firstFrameTraduzido = source.firstFrameOriginal;
  }
  if (segment.animateFrameTraduzido == null && source.animateFrameOriginal != null) {
    segment.animateFrameTraduzido = source.animateFrameOriginal;
  }

  return ensureFlowWatermarkTransform(segment as VideoSegment);
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
export function toSaveFormat(project: VideoProject, niche?: { id?: number; name?: string; components_allowed?: string[] }): VideoProject {
  const mappedProject = mapProject(project);
  if (mappedProject.config) {
    const {
      apiKeys,
      mapboxAccessToken,
      mapbox,
      ...safeConfig
    } = mappedProject.config as Record<string, unknown>;
    mappedProject.config = safeConfig as VideoProject['config'];
  }

  return {
    ...mappedProject,
    componentsAllowed: niche?.components_allowed || project.componentsAllowed,
    nicheId: niche?.id || project.nicheId,
    nicheName: niche?.name || project.nicheName,
  };
}

/** Converte projeto carregado para estado do frontend */
export function fromSaveFormat(loaded: any): VideoProject {
  const project = mapProject(loaded);
  project.selectedAspectRatios = project.selectedAspectRatios || ['9:16'];

  const rawStoryReferences = project.storyReferences;
  project.storyReferences = {
    characters: Array.isArray(rawStoryReferences?.characters) ? rawStoryReferences?.characters : [],
    locations: Array.isArray(rawStoryReferences?.locations) ? rawStoryReferences?.locations : [],
    characterStyle: String(rawStoryReferences?.characterStyle || 'fotorrealista').trim() || 'fotorrealista',
    locationStyle: String(rawStoryReferences?.locationStyle || 'fotorrealista').trim() || 'fotorrealista',
  };

  return project;
}

/** Converte segmento para formato Remotion (Scene) */
export function segmentToRemotionScene(seg: VideoSegment): any {
  const normalizedSeg = ensureFlowWatermarkTransform(seg);

  return {
    id: normalizedSeg.id,
    track: normalizedSeg.track || 1,
    start_time: normalizedSeg.start,
    end_time: normalizedSeg.end,
    transcript_segment: normalizedSeg.text,
    visual_concept: {
      description: normalizedSeg.text,
      art_style: 'photorealistic',
      emotion: normalizedSeg.emotion || 'neutro',
    },
    asset_type: normalizedSeg.assetType || 'image_static',
    asset_url: normalizedSeg.asset_url || normalizedSeg.imageUrl || '',
    ...(normalizedSeg.asset_duration != null && { asset_duration: normalizedSeg.asset_duration }),
    prompt_suggestion: normalizedSeg.imagePrompt || '',
    camera_movement: normalizedSeg.cameraMovement || 'static',
    transition: normalizedSeg.transition || 'fade',
    transition_duration: Number(normalizedSeg.transitionDuration ?? 0.5),
    text_overlay: {
      text: normalizedSeg.text,
      position: 'bottom',
      style: 'subtitle',
      animation: 'fade',
      words: normalizedSeg.words,
    },
    ...(normalizedSeg.chroma_key && { chroma_key: normalizedSeg.chroma_key }),
    ...(normalizedSeg.highlightWords?.length && { highlight_words: normalizedSeg.highlightWords }),
    ...(normalizedSeg.background && { background: normalizedSeg.background }),
    ...(normalizedSeg.timeline_config && { timeline_config: normalizedSeg.timeline_config }),
    ...(normalizedSeg.transform && { transform: normalizedSeg.transform }),
    ...(normalizedSeg.motionGraphics && { motion_graphics: normalizedSeg.motionGraphics }),
    audio: {
      volume: normalizedSeg.audio?.volume ?? 1,
      fadeIn: normalizedSeg.audio?.fadeIn ?? 0,
      fadeOut: normalizedSeg.audio?.fadeOut ?? 0,
    },
  };
}

/** Converte projeto para formato Remotion */
export function toRemotionFormat(
  project: VideoProject,
  options: {
    subtitleMode: 'paragraph' | 'word-by-word' | 'none';
    width: number;
    height: number;
    fps?: number;
    componentsAllowed?: string[];
    audioUrl?: string;
    defaultFont?: string;
    fitVideoToScene?: boolean;
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
      fitVideoToScene: options.fitVideoToScene !== undefined ? options.fitVideoToScene : true,
      audioSilencePaddingMs: project.config?.audioSilencePaddingMs,
      ...(Array.isArray(project.config?.audioMutedRanges) && project.config.audioMutedRanges.length > 0 && {
        audioMutedRanges: project.config.audioMutedRanges,
      }),
      ...(options.audioUrl && {
        backgroundMusic: { 
          src: options.audioUrl, 
          volume: project.config?.mainAudioVolume ?? 1.0 
        },
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
  if (audioPath.startsWith('http') || audioPath.startsWith('blob:')) return audioPath;
  return `${baseUrl}/${audioPath.split(/[\\/]/).pop()}`;
}
