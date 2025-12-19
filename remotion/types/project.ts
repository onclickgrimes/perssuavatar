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

export const CameraMovementSchema = z.enum([
  'static',           // Sem movimento
  'zoom_in_slow',     // Zoom in lento
  'zoom_in_fast',     // Zoom in rápido
  'zoom_out_slow',    // Zoom out lento
  'zoom_out_fast',    // Zoom out rápido
  'pan_left',         // Pan para esquerda
  'pan_right',        // Pan para direita
  'pan_up',           // Pan para cima
  'pan_down',         // Pan para baixo
  'ken_burns',        // Ken Burns effect (zoom + pan suave)
  'shake',            // Shake/tremor
  'rotate_cw',        // Rotação horária
  'rotate_ccw',       // Rotação anti-horária
  'trail_printing',   // Accordion blur / trail printing effect
]);

export type CameraMovement = z.infer<typeof CameraMovementSchema>;

// ========================================
// TRANSITIONS
// ========================================

export const TransitionSchema = z.enum([
  'none',             // Sem transição (corte seco)
  'fade',             // Fade in/out
  'crossfade',        // Crossfade com próxima cena
  'slide_left',       // Slide para esquerda
  'slide_right',      // Slide para direita
  'slide_up',         // Slide para cima
  'slide_down',       // Slide para baixo
  'zoom_in',          // Zoom in transition
  'zoom_out',         // Zoom out transition
  'wipe_left',        // Wipe para esquerda
  'wipe_right',       // Wipe para direita
  'blur',             // Blur transition
  'glitch',           // Glitch effect
]);

export type Transition = z.infer<typeof TransitionSchema>;

// ========================================
// ASSET TYPES (Gerador de mídia)
// ========================================

export const AssetTypeSchema = z.enum([
  'image_flux',       // Imagem gerada pelo Flux
  'image_dalle',      // Imagem gerada pelo DALL-E
  'image_midjourney', // Imagem gerada pelo Midjourney
  'image_static',     // Imagem estática (já existente)
  'video_kling',      // Vídeo gerado pelo Kling
  'video_runway',     // Vídeo gerado pelo Runway
  'video_pika',       // Vídeo gerado pelo Pika
  'video_static',     // Vídeo estático (já existente)
  'avatar',           // Avatar animado (Live2D, etc)
  'text_only',        // Apenas texto/tipografia
  'solid_color',      // Cor sólida de fundo
]);

export type AssetType = z.infer<typeof AssetTypeSchema>;

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
// AUDIO CONFIG
// ========================================

export const AudioConfigSchema = z.object({
  /** URL ou path do arquivo de áudio */
  src: z.string().optional(),
  /** Volume de 0 a 1 */
  volume: z.number().min(0).max(1).default(1),
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
// SCENE
// ========================================

export const SceneSchema = z.object({
  /** ID único da cena */
  id: z.number(),
  
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

  
  /** Metadados extras */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type Scene = z.infer<typeof SceneSchema>;

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
  subtitleMode: z.enum(['paragraph', 'word-by-word']).optional(),
  
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
  const lastScene = project.scenes[project.scenes.length - 1];
  return lastScene.end_time;
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
