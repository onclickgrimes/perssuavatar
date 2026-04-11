/**
 * Tipos para Projetos de Vídeo
 * 
 * Define a estrutura JSON que será usada pela IA para gerar vídeos.
 * Cada projeto contém múltiplas cenas que serão renderizadas em sequência.
 */
import { z } from 'zod';

// ========================================
// CAMERA MOVEMENTS
// ========================================

// Importar e re-exportar definições da SSoT em utils/camera-effects
import { 
  CAMERA_MOVEMENTS, 
  CameraMovementSchema, 
  CAMERA_MOVEMENT_LIST 
} from '../utils/camera-effects';

import type { CameraMovement } from '../utils/camera-effects';

export { 
  CAMERA_MOVEMENTS, 
  CameraMovementSchema, 
  CAMERA_MOVEMENT_LIST 
};

export type { CameraMovement };


// ========================================
// TRANSITIONS
// ========================================

// Importar e re-exportar definições da SSoT em utils/transitions
import { 
  TRANSITIONS, 
  TransitionSchema, 
  TRANSITION_LIST 
} from '../utils/transitions';

import type { Transition } from '../utils/transitions';

export { 
  TRANSITIONS, 
  TransitionSchema, 
  TRANSITION_LIST 
};

export type { Transition };

// ========================================
// ASSET TYPES (Gerador de mídia)
// ========================================

// Importar e re-exportar definições da SSoT em assets
import { 
  ASSET_DEFINITIONS, 
  AssetTypeSchema
} from '../assets/definitions';

import type { AssetType } from '../assets/definitions';

export { 
  ASSET_DEFINITIONS, 
  AssetTypeSchema
};

export type { AssetType };

// ========================================
// TIMELINE CONFIG
// ========================================

export const TimelineItemSchema = z.object({
  id: z.string(),
  year: z.string(),
  label: z.string(),
  image: z.string().optional(),
});

export const TimelineConfigSchema = z.object({
  items: z.array(TimelineItemSchema),
});

export type TimelineConfig = z.infer<typeof TimelineConfigSchema>;

// ========================================
// TEXT OVERLAY
// ========================================

export const TextOverlaySchema = z.object({
  text: z.string(),
  position: z.enum(['top', 'center', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right']).default('bottom'),
  style: z.enum(['subtitle', 'title', 'caption', 'highlight', 'quote']).default('subtitle'),
  animation: z.enum(['none', 'fade', 'typewriter', 'slide_up', 'pop', 'bounce']).default('fade'),
  fontSize: z.number().optional(),
  color: z.string().optional(),
  backgroundColor: z.string().optional(),
  // Palavras individuais do Deepgram para modo palavra-por-palavra
  words: z.array(z.object({
    word: z.string(),
    start: z.number(),
    end: z.number(),
    confidence: z.number(),
    speaker: z.number(),
    punctuatedWord: z.string(),
  })).optional(),
}).optional();

export type TextOverlay = z.infer<typeof TextOverlaySchema>;

// ========================================
// HIGHLIGHT WORDS (Palavras Destacadas)
// ========================================

export const HighlightWordSchema = z.object({
  /** Palavra ou frase a ser destacada */
  text: z.string(),
  /** Tempo de aparição em segundos (relativo ao início da cena) */
  time: z.number(),
  /** Duração da exibição em segundos */
  duration: z.number().default(1.5),
  /** Animação de entrada */
  entryAnimation: z.enum(['pop', 'bounce', 'explode', 'slide_up', 'zoom_in', 'fade', 'wave', 'none']).default('pop'),
  /** Animação de saída */
  exitAnimation: z.enum(['evaporate', 'fade', 'implode', 'slide_down', 'dissolve', 'scatter', 'wave', 'none']).default('evaporate'),
  /** Tamanho do texto (em pixels ou 'small', 'medium', 'large', 'huge') */
  size: z.union([z.number(), z.enum(['small', 'medium', 'large', 'huge'])]).default('large'),
  /** Cor do texto */
  color: z.string().default('#FFFFFF'),
  /** Cor de destaque/fundo */
  highlightColor: z.string().optional(),
  /** Posição na tela */
  position: z.enum([
    'center', 
    'top', 
    'top-center',
    'bottom', 
    'bottom-center',
    'top-left', 
    'top-right', 
    'bottom-left', 
    'bottom-right',
    'left',
    'center-left',
    'right',
    'center-right'
  ]).default('center'),
  /** Estilo adicional (bold, italic, etc) */
  fontWeight: z.enum(['normal', 'bold', 'black']).default('bold'),
  /** Efeito adicional */
  effect: z.enum(['none', 'glow', 'shadow', 'outline', 'neon']).default('glow'),
});

export type HighlightWord = z.infer<typeof HighlightWordSchema>;

// ========================================
// ENTRY ANIMATIONS (Animações de Entrada)
// ========================================

export const ENTRY_ANIMATION_OPTIONS = {
  pop: { label: 'Pop', description: 'Escala rápida com bounce.' },
  bounce: { label: 'Bounce', description: 'Múltiplos bounces ao aparecer.' },
  explode: { label: 'Explode', description: 'Explosão com rotação.' },
  slide_up: { label: 'Slide Up', description: 'Desliza de baixo para cima.' },
  zoom_in: { label: 'Zoom In', description: 'Aparece com zoom crescente.' },
  fade: { label: 'Fade', description: 'Aparece gradualmente.' },
  wave: { label: 'Wave', description: 'Efeito de onda na entrada (texto preenche de baixo pra cima).' },
  none: { label: 'Nenhum', description: 'Sem animação de entrada.' },
} as const;

export type EntryAnimation = keyof typeof ENTRY_ANIMATION_OPTIONS;

export const ENTRY_ANIMATION_LIST = Object.entries(ENTRY_ANIMATION_OPTIONS).map(([value, opt]) => ({
  value: value as EntryAnimation,
  label: opt.label,
  description: opt.description,
}));

// ========================================
// EXIT ANIMATIONS (Animações de Saída)
// ========================================

export const EXIT_ANIMATION_OPTIONS = {
  evaporate: { label: 'Evaporate', description: 'Some como vapor para cima.' },
  fade: { label: 'Fade', description: 'Desaparece gradualmente.' },
  implode: { label: 'Implode', description: 'Colapsa para o centro.' },
  slide_down: { label: 'Slide Down', description: 'Desliza de cima para baixo.' },
  dissolve: { label: 'Dissolve', description: 'Dissolução gradual com blur.' },
  scatter: { label: 'Scatter', description: 'Dispersa em pedaços.' },
  wave: { label: 'Wave', description: 'Efeito de onda na saída (texto esvazia de cima pra baixo).' },
  none: { label: 'Nenhum', description: 'Sem animação de saída.' },
} as const;

export type ExitAnimation = keyof typeof EXIT_ANIMATION_OPTIONS;

export const EXIT_ANIMATION_LIST = Object.entries(EXIT_ANIMATION_OPTIONS).map(([value, opt]) => ({
  value: value as ExitAnimation,
  label: opt.label,
  description: opt.description,
}));

// ========================================
// EMOTIONS (Emoções para Cenas)
// ========================================

export const EMOTION_OPTIONS = {
  // Calma e Paz
  calma: { label: 'Calma', category: 'peaceful' },
  paz: { label: 'Paz', category: 'peaceful' },
  serenidade: { label: 'Serenidade', category: 'peaceful' },
  contemplação: { label: 'Contemplação', category: 'peaceful' },
  reflexão: { label: 'Reflexão', category: 'thoughtful' },
  
  // Energia e Movimento
  empolgação: { label: 'Empolgação', category: 'energetic' },
  curiosidade: { label: 'Curiosidade', category: 'energetic' },
  surpresa: { label: 'Surpresa', category: 'energetic' },
  urgência: { label: 'Urgência', category: 'energetic' },
  inovação: { label: 'Inovação', category: 'energetic' },
  
  // Profunda e Séria
  seriedade: { label: 'Seriedade', category: 'serious' },
  nostalgia: { label: 'Nostalgia', category: 'serious' },
  admiração: { label: 'Admiração', category: 'serious' },
  mistério: { label: 'Mistério', category: 'serious' },
  
  // Positive
  alegria: { label: 'Alegria', category: 'positive' },
  
  // Neutral
  neutro: { label: 'Neutro', category: 'neutral' },
} as const;

export type Emotion = keyof typeof EMOTION_OPTIONS;

export const EMOTION_LIST = Object.keys(EMOTION_OPTIONS) as Emotion[];

// ========================================
// REMOTION COMPONENTS (Componentes Permitidos)
// ========================================

export const REMOTION_COMPONENT_OPTIONS = {
  HighlightWord: { label: 'Highlight Word', description: 'Palavras em destaque animadas.' },
  AnimatedSvgOverlay: { label: 'Animated SVG Overlay', description: 'SVGs animados que aparecem quando palavras-chave são faladas.' },
} as const;

export type RemotionComponent = keyof typeof REMOTION_COMPONENT_OPTIONS;

export const REMOTION_COMPONENT_LIST = Object.entries(REMOTION_COMPONENT_OPTIONS).map(([value, opt]) => ({
  value: value as RemotionComponent,
  label: opt.label,
  description: opt.description,
}));


// ========================================
// VISUAL CONCEPT
// ========================================

export const VisualConceptSchema = z.object({
  description: z.string().describe('Descrição visual da cena'),
  art_style: z.string().optional().describe('Estilo artístico (photorealistic, cartoon, etc)'),
  emotion: z.string().optional().describe('Emoção a transmitir'),
  color_palette: z.array(z.string()).optional().describe('Paleta de cores'),
  lighting: z.string().optional().describe('Tipo de iluminação'),
});

export type VisualConcept = z.infer<typeof VisualConceptSchema>;

// ========================================
// CHROMA KEY CONFIG
// ========================================

export const ChromaKeyConfigSchema = z.object({
  /** Cor base para remoção (green, blue, ou custom) */
  color: z.enum(['green', 'blue', 'custom']).default('green'),
  /** Cor customizada em formato RGB (apenas se color === 'custom') */
  customColor: z.object({
    r: z.number().min(0).max(255),
    g: z.number().min(0).max(255),
    b: z.number().min(0).max(255),
  }).optional(),
  /** Limiar para detecção da cor (0-255), padrão: 100 */
  threshold: z.number().min(0).max(255).default(100),
  /** Suavização das bordas (0-1), padrão: 0.2 */
  smoothing: z.number().min(0).max(1).default(0.2),
}).optional();

export type ChromaKeyConfig = z.infer<typeof ChromaKeyConfigSchema>;

// ========================================
// PIP / TRANSFORM CONFIG
// ========================================

export const TransformConfigSchema = z.object({
  scale: z.number().optional().describe('Escala de tamanho do clipe'),
  positionX: z.number().optional().describe('Posição X no eixo horizontal (%)'),
  positionY: z.number().optional().describe('Posição Y no eixo vertical (%)'),
  opacity: z.number().optional().describe('Opacidade (0 a 1)'),
}).optional();

export type TransformConfig = z.infer<typeof TransformConfigSchema>;

// ========================================
// AUDIO CONFIG
// ========================================

export const AudioConfigSchema = z.object({
  /** URL ou path do arquivo de áudio */
  src: z.string().optional(),
  /** Volume de 0 a 2 (0% a 200%) */
  volume: z.number().min(0).max(2).default(1),
  /** Fade in em segundos */
  fadeIn: z.number().optional(),
  /** Fade out em segundos */
  fadeOut: z.number().optional(),
  /** Se deve usar TTS para gerar o áudio do transcript */
  useTTS: z.boolean().default(false),
  /** Voz do TTS */
  ttsVoice: z.string().optional(),
}).optional();

export type AudioConfig = z.infer<typeof AudioConfigSchema>;

// ========================================
// BACKGROUND CONFIG
// ========================================

export const BackgroundConfigSchema = z.object({
  type: z.enum(['image', 'video', 'solid_color']),
  url: z.string().optional(),
  color: z.string().optional(),
}).optional();

export type BackgroundConfig = z.infer<typeof BackgroundConfigSchema>;

// ========================================
// SCENE
// ========================================

export const SceneSchema = z.object({
  /** ID único da cena */
  id: z.number(),
  
  /** Faixa / camada da timeline (Z-Index) */
  track: z.number().optional(),
  
  /** Tempo de início em segundos */
  start_time: z.number(),
  
  /** Tempo de fim em segundos */
  end_time: z.number(),
  
  /** Transcrição/narração do segmento */
  transcript_segment: z.string().optional(),
  
  /** Conceito visual da cena */
  visual_concept: VisualConceptSchema,
  
  /** Tipo de asset (define qual gerador usar) */
  asset_type: AssetTypeSchema,
  
  /** URL ou path do asset (se já existir) */
  asset_url: z.string().optional(),
  
  /** Duração real do asset de vídeo em segundos (para cálculo de playbackRate) */
  asset_duration: z.number().optional(),
  
  /** Prompt para geração do asset */
  prompt_suggestion: z.string().optional(),
  
  /** Movimento de câmera durante a cena */
  camera_movement: CameraMovementSchema.default('static'),
  
  /** Transição para a próxima cena */
  transition: TransitionSchema.default('fade'),
  
  /** Duração da transição em segundos */
  transition_duration: z.number().default(0.5),
  
  /** Overlay de texto */
  text_overlay: TextOverlaySchema,
  
  /** Palavras/frases destacadas para animar durante a cena */
  highlight_words: z.array(HighlightWordSchema).optional(),
  
  /** Configuração de áudio específica da cena */
  audio: AudioConfigSchema,

  /** Configuração de chroma key (para vídeos com fundo verde/azul) */
  chroma_key: ChromaKeyConfigSchema,

  /** Configuração da linha do tempo 3D */
  timeline_config: TimelineConfigSchema.optional(),

  /** Configuração de background (opcional) */
  background: BackgroundConfigSchema,

  /** Configuração da transformação visual (PiP, zoom, opacidade, posição) */
  transform: TransformConfigSchema,
  
  /** Silenciar áudio (usado internamente para evitar duplicação em efeitos) */
  muteAudio: z.boolean().optional(),

  /** Metadados extras */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type Scene = z.infer<typeof SceneSchema>;

// ========================================
// REFACTOR HÍBRIDO FFMPEG / REMOTION (Phase 3)
// ========================================

export const NativeVideoClipSchema = z.object({
  id: z.number().or(z.string()),
  sourceUrl: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  cameraMovement: CameraMovementSchema.optional(),
  transition: TransitionSchema.optional(),
  transitionDuration: z.number().optional(),
});

export type NativeVideoClip = z.infer<typeof NativeVideoClipSchema>;

export const RemotionOverlayClipSchema = z.object({
  id: z.number().or(z.string()),
  startTime: z.number(),
  endTime: z.number(),
  textOverlay: TextOverlaySchema.optional(),
  highlightWords: z.array(HighlightWordSchema).optional(),
});

export type RemotionOverlayClip = z.infer<typeof RemotionOverlayClipSchema>;

// ========================================
// SVG ANIMATIONS (Palavras → SVGs)
// ========================================

export const SvgAnimationConfigSchema = z.object({
  /** Nome do arquivo SVG (sem extensão) */
  svgName: z.string(),
  /** Palavras-chave que acionam este SVG (case-insensitive) */
  keywords: z.array(z.string()),
});

export type SvgAnimationConfig = z.infer<typeof SvgAnimationConfigSchema>;

// ========================================
// PROJECT CONFIG
// ========================================

export const ProjectConfigSchema = z.object({
  /** Largura do vídeo */
  width: z.number().default(1920),
  
  /** Altura do vídeo */
  height: z.number().default(1080),
  
  /** FPS do vídeo */
  fps: z.number().default(30),
  
  /** Cor de fundo padrão */
  backgroundColor: z.string().default('#000000'),
  
  /** Modo de exibição das legendas */
  subtitleMode: z.enum(['paragraph', 'word-by-word', 'none']).optional(),
  
  /** Áudio de fundo (música) */
  backgroundMusic: z.object({
    src: z.string(),
    volume: z.number().min(0).max(1).default(0.3),
  }).optional(),
  
  /** Estilo de texto padrão */
  defaultTextStyle: z.object({
    fontFamily: z.string().default('Inter, sans-serif'),
    color: z.string().default('#FFFFFF'),
    shadowColor: z.string().default('rgba(0,0,0,0.8)'),
  }).optional(),
  
  /** Mapeamento de palavras para SVGs animados */
  svgAnimations: z.array(SvgAnimationConfigSchema).optional().describe(
    'Configura quais palavras nas legendas acionam quais SVGs. ' +
    'Exemplo: { svgName: "btc", keywords: ["btc", "bitcoin", "cripto"] }'
  ),

  /** Base URL para assets servidos localmente (ex: http://localhost:9999) */
  assetsBaseUrl: z.string().optional(),

  /** Componentes Remotion permitidos (ex: ['HighlightWord', 'AnimatedSvgOverlay']) */
  componentsAllowed: z.array(z.string()).optional(),

  /** Fonte padrão do projeto (Google Fonts) */
  defaultFont: z.string().optional(),

  /** Se true, acelera/desacelera vídeos para caber na duração da cena (padrão: true) */
  fitVideoToScene: z.boolean().optional(),

  /** Se true, remove intervalos de silêncio entre segmentos narrados e junta a timeline */
  removeAudioSilences: z.boolean().optional(),

  /** Intervalos do áudio original preservados após compactar a timeline */
  audioKeepRanges: z.array(z.object({
    sourceStart: z.number(),
    sourceEnd: z.number(),
    outputStart: z.number(),
    outputEnd: z.number(),
  })).optional(),

  /** Intervalos compactados da timeline onde o áudio base deve ficar mudo */
  audioMutedRanges: z.array(z.object({
    sourceStart: z.number(),
    sourceEnd: z.number(),
    outputStart: z.number(),
    outputEnd: z.number(),
  })).optional(),
  
  /** Apenas para renderização Híbrida/Preview: renderizar apenas overlays/textos com fundo transparente */
  motionGraphicsOnly: z.boolean().optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

// ========================================
// VIDEO PROJECT (Root)
// ========================================

export const VideoProjectSchema = z.object({
  /** Título do projeto */
  project_title: z.string(),
  
  /** Descrição do projeto */
  description: z.string().optional(),
  
  /** Configurações do vídeo */
  config: ProjectConfigSchema.optional(),
  
  /** Lista de cenas */
  scenes: z.array(SceneSchema),
  
  /** Versão do schema */
  schema_version: z.string().default('1.0'),
  
  /** Timestamp de criação */
  created_at: z.string().optional(),
  
  /** Tags/categorias */
  tags: z.array(z.string()).optional(),
});

export type VideoProject = z.infer<typeof VideoProjectSchema>;

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Calcula a duração total do projeto em segundos
 */
export function calculateProjectDuration(project: VideoProject): number {
  if (project.scenes.length === 0) return 0;
  return project.scenes.reduce((maxDuration, scene) => {
    return Math.max(maxDuration, scene.end_time);
  }, 0);
}

/**
 * Calcula a duração total em frames
 */
export function calculateProjectFrames(project: VideoProject, fps: number = 30): number {
  return Math.ceil(calculateProjectDuration(project) * fps);
}

/**
 * Valida e parseia um JSON de projeto
 */
export function parseVideoProject(json: unknown): VideoProject {
  return VideoProjectSchema.parse(json);
}

/**
 * Exemplo de projeto para referência
 */
export const EXAMPLE_PROJECT: VideoProject = {
  project_title: "Exemplo de Vídeo",
  description: "Um vídeo de exemplo para demonstrar a estrutura",
  config: {
    width: 1920,
    height: 1080,
    fps: 30,
    backgroundColor: '#0a0a0a',
  },
  scenes: [
    {
      id: 1,
      start_time: 0,
      end_time: 5,
      transcript_segment: "Bem-vindo ao nosso vídeo de exemplo!",
      visual_concept: {
        description: "Tela de abertura com logo",
        art_style: "modern, minimalist",
        emotion: "profissional",
      },
      asset_type: 'solid_color',
      camera_movement: 'static',
      transition: 'fade',
      transition_duration: 0.5,
      text_overlay: {
        text: "Bem-vindo!",
        position: 'center',
        style: 'title',
        animation: 'pop',
      },
    },
    {
      id: 2,
      start_time: 5,
      end_time: 12,
      transcript_segment: "Este é um exemplo de cena com imagem gerada por IA.",
      visual_concept: {
        description: "Paisagem futurista",
        art_style: "photorealistic, 8k",
        emotion: "inspirador",
      },
      asset_type: 'image_flux',
      asset_url: '', // Será preenchido após geração
      prompt_suggestion: "futuristic cityscape, neon lights, flying cars, 8k --ar 16:9",
      camera_movement: 'ken_burns',
      transition: 'crossfade',
      transition_duration: 1,
    },
  ],
  schema_version: '1.0',
};
