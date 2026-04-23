/**
 * ASSET DEFINITIONS - Single Source of Truth para METADADOS
 * 
 * Este arquivo contém apenas metadados e é seguro para uso no backend.
 * Para adicionar um novo asset_type, atualize aqui E no registry.tsx
 * 
 * NOTA: Este arquivo NÃO contém componentes React (backend-safe).
 * Os componentes estão em registry.tsx para uso no frontend.
 */
import { z } from 'zod';

// ========================================
// ASSET DEFINITIONS - ÚNICA FONTE DA VERDADE (Metadados)
// ========================================

export const ASSET_DEFINITIONS = {
  // ==================== IMAGENS ====================
  image_flux: {
    label: 'Imagem (Flux)',
    description: 'Imagem gerada por modelo Flux',
    icon: '🧠',
    badgeColor: 'bg-fuchsia-500/20 text-fuchsia-300',
    aiDescription: 'Imagem gerada por IA via modelo Flux.',
  },
  image_dalle: {
    label: 'Imagem (DALL·E)',
    description: 'Imagem gerada por modelo DALL·E',
    icon: '🎨',
    badgeColor: 'bg-violet-500/20 text-violet-300',
    aiDescription: 'Imagem gerada por IA via modelo DALL·E.',
  },
  image_midjourney: {
    label: 'Imagem (Midjourney)',
    description: 'Imagem gerada por Midjourney',
    icon: '🖼️',
    badgeColor: 'bg-indigo-500/20 text-indigo-300',
    aiDescription: 'Imagem gerada por IA via Midjourney.',
  },
  image_pexels: {
    label: 'Imagem (Pexels)',
    description: 'Foto gratuita de alta qualidade do Pexels',
    icon: '📸',
    badgeColor: 'bg-teal-500/20 text-teal-300',
    aiDescription: 'Foto de stock gratuita do Pexels (ideal para cenas realistas, natureza, pessoas, locais, objetos). Busca automática por prompt.',
  },
  image_static: {
    label: 'Imagem Estática',
    description: 'Imagem já existente (upload ou URL)',
    icon: '📷',
    badgeColor: 'bg-slate-500/20 text-slate-300',
    aiDescription: 'Imagem estática já existente',
  },

  // ==================== VÍDEOS ====================
  video_stock: {
    label: 'Vídeo (Stock)',
    description: 'Vídeo de stock do banco de dados local',
    icon: '📹',
    badgeColor: 'bg-green-500/20 text-green-300',
    aiDescription: 'Vídeo de stock do banco de dados local (buscado semanticamente pelo prompt). Use para cenas que precisam de movimento real, pessoas, natureza, ações. Escreva o imagePrompt em inglês com palavras-chave descritivas para busca semântica. Exemplo: "businessman working on laptop in modern office" ou "aerial view of ocean waves at sunset".',
  },
  video_pexels: {
    label: 'Vídeo (Pexels)',
    description: 'Vídeo gratuito de alta qualidade do Pexels',
    icon: '🎬',
    badgeColor: 'bg-teal-500/20 text-teal-300',
    aiDescription: 'Vídeo de stock gratuito do Pexels (ideal para cenas com movimento real, natureza, pessoas, cidades, ações cotidianas). Escreva o imagePrompt em inglês para ser buscado no Pexels. Exemplo: "A Man Walking along an Empty Road on a Foggy Night".',
  },
  video_kling: {
    label: 'Vídeo (Kling)',
    description: 'Vídeo gerado pelo Kling',
    icon: '🎥',
    badgeColor: 'bg-cyan-500/20 text-cyan-300',
    aiDescription: 'Vídeo gerado por IA via Kling.',
  },
  video_runway: {
    label: 'Vídeo (Runway)',
    description: 'Vídeo gerado pelo Runway',
    icon: '🎞️',
    badgeColor: 'bg-emerald-500/20 text-emerald-300',
    aiDescription: 'Vídeo gerado por IA via Runway.',
  },
  video_pika: {
    label: 'Vídeo (Pika)',
    description: 'Vídeo gerado pelo Pika',
    icon: '📽️',
    badgeColor: 'bg-sky-500/20 text-sky-300',
    aiDescription: 'Vídeo gerado por IA via Pika.',
  },
  video_vo3: {
    label: 'Vídeo (Veo 3)',
    description: 'Vídeo gerado pelo Google Veo 3 via Flow',
    icon: '🌊',
    badgeColor: 'bg-sky-500/20 text-sky-300',
    aiDescription: 'Vídeo cinematográfico gerado pelo Google Veo 3 (alta qualidade, movimentos naturais, iluminação realista). Crie prompts detalhados em inglês para o modelo Veo 3 Pro, para vídeos **com duração máxima de 8 segundos**. O prompt deve ser relativamente extenso. IMPORTANTE: Para manter consistência visual em múltiplas cenas, você deve repetir **exatamente as mesmas descrições detalhadas** dos personagens e do ambiente em **todos** os prompts, mesmo se a cena for diferente. Isso garante continuidade visual no Veo 3. Descreva o ambiente completo: - Local, horário, iluminação (ex: dia claro, luz natural) - Elementos do cenário e sons de fundo, se houver (ex: som de trânsito, barulho de natureza) - Descreva a cena — o que os personagens fazem, sua interação. Estilo de filmagem (ex: câmera fixa, câmera na mão, ângulo da câmera). Repita todos os detalhes dos personagens e do ambiente em todas as cenas.',
  },
  video_veo2: {
    label: 'Vídeo (Veo 2)',
    description: 'Vídeo gerado pelo Google Veo 2 (API oficial, sem áudio)',
    icon: '🌊',
    badgeColor: 'bg-blue-500/20 text-blue-300',
    aiDescription: `Vídeos de 8 segundos gerados pelo Google Veo 2. Crie prompts em JSON detalhados em inglês descrevendo a cena a partir da narração. IMPORTANTE: Para manter consistência visual em múltiplas cenas, você deve repetir **exatamente as mesmas descrições detalhadas** dos personagens e do ambiente em **todos** os prompts em que aparecerem. Isso garante continuidade visual. Descreva o ambiente completo: - Local, horário, iluminação (ex: dia claro, luz natural) - Elementos do cenário, se houver - Descreva a cena — o que os personagens fazem, sua interação. Estilo de filmagem (ex: câmera fixa, câmera na mão, ângulo da câmera).

Exemplo da estrutura do JSON:
{
  "video_generation_prompt": {
    "title": "scene title",

    "technical_specifications": {
      "lens_type": "Wide-angle",

      "resolution": "4K/Hyper-realistic",

      "aspect_ratio": "16:9"
    },

    "artistic_direction": {
      "style": "Cinematic wildlife documentary",

      "lighting": "Describe the scene lighting",

      "mood": "Example: Majestic, contemplative, ethereal"
    },

    "camera_control": {
      "movement": "Example: Static wide shot or very slow pan",

      "focus": "Example: Deep focus on the forest environment, sharpening on the jaguar as it enters the light"
    },

    "main_text_prompt": "Who the subjects are and what happens during the 8 seconds of the scene.",

    "timeline_breakdown": [
      {
        "time_interval": "0-3s",

        "action": "What happens in the first 3 seconds"
      },

      {
        "time_interval": "3-6s",

        "action": "What happens in the next 3 seconds"
      },

      {
        "time_interval": "6-8s",

        "action": "What happens in the final frame"
      }
    ]
  }
}`,
  },
  video_frame_animate:{
    label: 'Vídeo Frame Animate',
    description: 'Vídeo animado pelo primeiro frame',
    icon: '🎬',
    badgeColor: 'bg-green-500/20 text-green-300',
    aiDescription: 'Para CADA cena, gere um prompt detalhado em inglês para gerar uma IMAGEM ESTÁTICA que represente o PRIMEIRO FRAME dessa cena. Gere também um prompt para gerar o vídeo a partir do primeiro frame. Os campos são firstFrame e animateFrame.',
  },
  video_static: {
    label: 'Vídeo Estático',
    description: 'Vídeo já existente (upload ou URL)',
    icon: '📼',
    badgeColor: 'bg-slate-500/20 text-slate-300',
    aiDescription: 'Vídeo estático já existente',
  },

  // ==================== VÍDEOS ESPECIAIS ====================
  video_chromakey: {
    label: 'Vídeo Chroma Key',
    description: 'Vídeo com fundo verde/azul para composição',
    icon: '🟢',
    badgeColor: 'bg-lime-500/20 text-lime-300',
    aiDescription: 'Vídeo com fundo verde/azul para composição (avatar, apresentador virtual)',
  },

  // ==================== AVATARES ====================
  avatar: {
    label: 'Avatar',
    description: 'Avatar animado (Live2D, etc)',
    icon: '👤',
    badgeColor: 'bg-teal-500/20 text-teal-300',
    aiDescription: 'Avatar animado para apresentação',
  },

  // ==================== BACKGROUNDS SIMPLES ====================
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

  // ==================== BACKGROUNDS ANIMADOS ====================
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
  remotion_graphic: {
    label: 'Remotion Graphic',
    description: 'Motion graphic gerado por chat e renderizado pelo Remotion',
    icon: '✨',
    badgeColor: 'bg-amber-500/20 text-amber-300',
    aiDescription: 'Motion graphic customizado gerado por código Remotion.',
  },

  // ==================== ÁUDIO ====================
  audio: {
    label: 'Áudio',
    description: 'Clipe de áudio na timeline',
    icon: '🎵',
    badgeColor: 'bg-rose-500/20 text-rose-300',
    aiDescription: 'Clipe de áudio para trilhas e efeitos sonoros.',
  },
} as const;

// ========================================
// TIPOS E SCHEMAS DERIVADOS AUTOMATICAMENTE
// ========================================

/** Tipo union de todos os asset_types (derivado automaticamente) */
export type AssetType = keyof typeof ASSET_DEFINITIONS;

/** Lista de todos os asset_types como array (interno) */
const ASSET_TYPE_KEYS = Object.keys(ASSET_DEFINITIONS) as AssetType[];

/** Schema Zod para validação (derivado automaticamente) */
export const AssetTypeSchema = z.enum(
  ASSET_TYPE_KEYS as [AssetType, ...AssetType[]]
);
