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
    aiDescription: `Vídeos de 8 segundos gerados pelo Google Veo 2. Crie prompts em JSON detalhados em inglês descrevendo a cena a partir da narração. IMPORTANTE: Para manter consistência visual em múltiplas cenas, você deve repetir **exatamente as mesmas descrições detalhadas** dos personagens e do ambiente em **todos** os prompts em que aparecerem. Isso garante continuidade visual. Descreva o ambiente completo: - Local, horário, iluminação (ex: dia claro, luz natural) - Elementos do cenário, se houver - Descreva a cena — o que os personagens fazem, sua interação. Estilo de filmagem (ex: câmera fixa, câmera na mão, ângulo da câmera). Repita todos os detalhes dos personagens e do ambiente em todas as cenas.

Exemplo da estrutura do JSON:
{
  "video_generation_prompt": {
    "title": "Ousado in the Mist",
    "technical_specifications": {
      "frame_rate": "24fps (Cinematic)",
      "lens_type": "Wide-angle",
      "resolution": "4K/Hyper-realistic",
      "aspect_ratio": "16:9"
    },
    "artistic_direction": {
      "style": "Cinematic wildlife documentary",
      "lighting": "Soft natural morning light filtering through the canopy",
      "mood": "Majestic, contemplative, ethereal"
    },
    "camera_control": {
      "movement": "Static wide shot or very slow pan",
      "focus": "Deep focus on the forest environment, sharpening on the jaguar as he enters the light"
    },
    "IdOfTheCharactersInTheScene": "[1, 3]",
    "main_text_prompt": "Wide shot of Ousado, the golden-yellow jaguar with black rosettes, emerging from a light mist in the Pantanal forest. He moves like a silent ghost through the trees. Soft natural morning light filtering through the canopy creates a majestic and contemplative atmosphere. 4k resolution, hyper-realistic textures.",
    "timeline_breakdown": [
      {
        "time_range": "0-3s",
        "action": "A cinematic wide shot establishes the tranquil Pantanal forest enveloped in a light mist, with soft natural morning light filtering through the dense canopy."
      },
      {
        "time_range": "3-6s",
        "action": "Ousado, the majestic golden-yellow jaguar, emerges seamlessly from the mist, moving silently like a ghost through the trees."
      },
      {
        "time_range": "6-8s",
        "action": "The camera captures his hyper-realistic textures as he stops at the edge of the light shaft, holding a powerful and contemplative pause for the final frame."
      }
    ]
  }
}`,
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
  }
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
