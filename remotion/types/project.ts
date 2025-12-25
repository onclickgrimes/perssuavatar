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
  'zoom_transition',  // Zoom dramático de transição
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
  'video_stock',      // Vídeo de stock (banco de dados local/Supabase)
  'video_kling',      // Vídeo gerado pelo Kling
  'video_runway',     // Vídeo gerado pelo Runway
  'video_pika',       // Vídeo gerado pelo Pika
  'video_static',     // Vídeo estático (já existente)
  'video_chromakey',  // Vídeo com chroma key (remoção de fundo verde/azul)
  'avatar',           // Avatar animado (Live2D, etc)
  'text_only',        // Apenas texto/tipografia
  'solid_color',      // Cor sólida de fundo
  'geometric_patterns', // Padrões geométricos animados
  'wavy_grid',        // Grade ondulada 3D estilo Daniel Penin
  'timeline_3d',      // Linha do tempo 3D histórica
]);

export type AssetType = z.infer<typeof AssetTypeSchema>;

/**
 * Opções de Asset Types com labels, descrições, ícones e cores
 * Fonte única de verdade para todo o sistema
 */
export const ASSET_TYPE_OPTIONS: Record<AssetType, {
  label: string;
  description: string;
  icon: string;
  badgeColor: string; // Cor para badges/tags (tailwind classes)
  aiDescription: string; // Descrição para a IA
}> = {
  image_flux: {
    label: 'Imagem (Flux)',
    description: 'Imagem estática gerada por IA Flux',
    icon: '🖼️',
    badgeColor: 'bg-blue-500/20 text-blue-300',
    aiDescription: 'Imagem estática gerada por IA (ideal para cenas conceituais, abstratas ou quando precisar de controle visual total)',
  },
  image_dalle: {
    label: 'Imagem (DALL-E)',
    description: 'Imagem gerada pelo DALL-E da OpenAI',
    icon: '🎨',
    badgeColor: 'bg-emerald-500/20 text-emerald-300',
    aiDescription: 'Imagem gerada pelo DALL-E (estilo OpenAI, bom para ilustrações e conceitos)',
  },
  image_midjourney: {
    label: 'Imagem (Midjourney)',
    description: 'Imagem gerada pelo Midjourney',
    icon: '✨',
    badgeColor: 'bg-violet-500/20 text-violet-300',
    aiDescription: 'Imagem gerada pelo Midjourney (alta qualidade artística)',
  },
  image_static: {
    label: 'Imagem Estática',
    description: 'Imagem já existente (upload ou URL)',
    icon: '📷',
    badgeColor: 'bg-slate-500/20 text-slate-300',
    aiDescription: 'Imagem estática já existente',
  },
  video_stock: {
    label: 'Vídeo (Stock)',
    description: 'Vídeo de stock do banco de dados',
    icon: '📹',
    badgeColor: 'bg-green-500/20 text-green-300',
    aiDescription: 'Vídeo de stock do banco de dados (buscado semanticamente pelo prompt). Use para cenas que precisam de movimento real, pessoas, natureza, ações.',
  },
  video_kling: {
    label: 'Vídeo (Kling)',
    description: 'Vídeo gerado pela IA Kling',
    icon: '🎬',
    badgeColor: 'bg-purple-500/20 text-purple-300',
    aiDescription: 'Vídeo gerado por IA Kling (para ações humanas complexas ou cenas impossíveis de encontrar em stock)',
  },
  video_runway: {
    label: 'Vídeo (Runway)',
    description: 'Vídeo gerado pelo Runway Gen-2',
    icon: '🎥',
    badgeColor: 'bg-rose-500/20 text-rose-300',
    aiDescription: 'Vídeo gerado pelo Runway (alta qualidade, movimentos complexos)',
  },
  video_pika: {
    label: 'Vídeo (Pika)',
    description: 'Vídeo gerado pelo Pika Labs',
    icon: '🎞️',
    badgeColor: 'bg-pink-500/20 text-pink-300',
    aiDescription: 'Vídeo gerado pelo Pika Labs (estilo estilizado)',
  },
  video_static: {
    label: 'Vídeo Estático',
    description: 'Vídeo já existente (upload ou URL)',
    icon: '📼',
    badgeColor: 'bg-slate-500/20 text-slate-300',
    aiDescription: 'Vídeo estático já existente',
  },
  video_chromakey: {
    label: 'Vídeo Chroma Key',
    description: 'Vídeo com fundo verde/azul para composição',
    icon: '🟢',
    badgeColor: 'bg-lime-500/20 text-lime-300',
    aiDescription: 'Vídeo com fundo verde/azul para composição (avatar, apresentador virtual)',
  },
  avatar: {
    label: 'Avatar',
    description: 'Avatar animado (Live2D, etc)',
    icon: '👤',
    badgeColor: 'bg-teal-500/20 text-teal-300',
    aiDescription: 'Avatar animado para apresentação',
  },
  text_only: {
    label: 'Apenas Texto',
    description: 'Tela com apenas texto/tipografia',
    icon: '📝',
    badgeColor: 'bg-gray-500/20 text-gray-300',
    aiDescription: 'Apenas texto/tipografia na tela',
  },
  solid_color: {
    label: 'Cor Sólida',
    description: 'Fundo de cor sólida',
    icon: '🎨',
    badgeColor: 'bg-gray-500/20 text-gray-300',
    aiDescription: 'Fundo de cor sólida (use para transições, ênfase em texto, ou quando o foco for totalmente no áudio)',
  },
  geometric_patterns: {
    label: 'Padrões Geométricos',
    description: 'Background abstrato com padrões geométricos animados',
    icon: '🔷',
    badgeColor: 'bg-cyan-500/20 text-cyan-300',
    aiDescription: 'Background abstrato com padrões geométricos animados (ideal para temas tecnológicos, futuristas, infográficos)',
  },
  wavy_grid: {
    label: 'Wavy Grid',
    description: 'Grade ondulada 3D estilo Daniel Penin',
    icon: '🌊',
    badgeColor: 'bg-indigo-500/20 text-indigo-300',
    aiDescription: 'Background futurista com grade 3D ondulada estilo Daniel Penin (ideal para tech, inovação, conteúdo digital)',
  },
  timeline_3d: {
    label: 'Timeline 3D',
    description: 'Linha do tempo 3D para história',
    icon: '📊',
    badgeColor: 'bg-amber-500/20 text-amber-300',
    aiDescription: 'Linha do tempo 3D histórica (ideal para documentários, história, cronologias)',
  },
};

/** Lista de asset types para seleção em UI (array simples) */
export const ASSET_TYPE_LIST = Object.entries(ASSET_TYPE_OPTIONS).map(([value, opt]) => ({
  value: value as AssetType,
  label: opt.label,
  description: opt.description,
  icon: opt.icon,
}));

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
  HighlightWord: { label: 'Highlight Word', description: 'Palavras em destaque animadas.' }
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

export type ChromaKeyConfig = z.infer<typeof ChromaKeyConfigSchema>;

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

  /** Configuração de chroma key (para vídeos com fundo verde/azul) */
  chroma_key: ChromaKeyConfigSchema,

  /** Configuração da linha do tempo 3D */
  timeline_config: TimelineConfigSchema.optional(),

  /** Configuração de background (opcional) */
  background: BackgroundConfigSchema,
  
  /** Metadados extras */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type Scene = z.infer<typeof SceneSchema>;

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
  
  /** Mapeamento de palavras para SVGs animados */
  svgAnimations: z.array(SvgAnimationConfigSchema).optional().describe(
    'Configura quais palavras nas legendas acionam quais SVGs. ' +
    'Exemplo: { svgName: "btc", keywords: ["btc", "bitcoin", "cripto"] }'
  ),

  /** Base URL para assets servidos localmente (ex: http://localhost:9999) */
  assetsBaseUrl: z.string().optional(),
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
