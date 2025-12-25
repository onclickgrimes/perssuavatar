/**
 * Tipos para serviços de busca de assets (mídias)
 * 
 * Define interfaces padronizadas para resultados de busca de mídia
 * de diferentes provedores (Pexels, Unsplash, Pixabay, etc.)
 */

import type { AssetType } from '../../../remotion/types/project';

// ========================================
// RESULTADO DE MÍDIA (Padronizado)
// ========================================

/**
 * Arquivo de vídeo com diferentes qualidades/resoluções
 */
export interface MediaVideoFile {
  id: number | string;
  quality: 'hd' | 'sd' | 'hls' | '4k';
  fileType: string;
  width: number | null;
  height: number | null;
  fps?: number;
  link: string;
}

/**
 * Imagem com diferentes tamanhos
 */
export interface MediaImageSizes {
  original: string;
  large2x: string;
  large: string;
  medium: string;
  small: string;
  portrait: string;
  landscape: string;
  tiny: string;
}

/**
 * Autor/Fotógrafo/Videomaker da mídia
 */
export interface MediaAuthor {
  id: number | string;
  name: string;
  url: string;
}

/**
 * Resultado de mídia padronizado (pode ser foto ou vídeo)
 */
export interface MediaResult {
  /** ID único da mídia no provedor */
  id: number | string;
  
  /** Tipo da mídia */
  type: 'photo' | 'video';
  
  /** Provedor de origem */
  provider: 'pexels' | 'unsplash' | 'pixabay' | 'supabase' | 'local';
  
  /** Largura em pixels */
  width: number;
  
  /** Altura em pixels */
  height: number;
  
  /** URL da página da mídia no provedor */
  url: string;
  
  /** Duração em segundos (apenas para vídeos) */
  duration?: number;
  
  /** URL da thumbnail/preview */
  thumbnail: string;
  
  /** Descrição/alt text da mídia */
  description?: string;
  
  /** Autor da mídia */
  author: MediaAuthor;
  
  /** URLs de diferentes tamanhos (para fotos) */
  imageSizes?: MediaImageSizes;
  
  /** Arquivos de vídeo em diferentes qualidades */
  videoFiles?: MediaVideoFile[];
  
  /** Cor média (hex) */
  avgColor?: string;
  
  /** Asset type sugerido para uso no projeto */
  suggestedAssetType: AssetType;
  
  /** URL direta para uso (melhor qualidade disponível) */
  directUrl: string;
  
  /** Query/prompt usado para encontrar esta mídia */
  searchQuery?: string;
  
  /** Pontuação de relevância (0-1) se aplicável */
  relevanceScore?: number;
}

// ========================================
// PARÂMETROS DE BUSCA
// ========================================

/**
 * Orientação da mídia
 */
export type MediaOrientation = 'landscape' | 'portrait' | 'square';

/**
 * Tamanho mínimo da mídia
 */
export type MediaSize = 'small' | 'medium' | 'large';

/**
 * Parâmetros de busca de mídia
 */
export interface MediaSearchParams {
  /** Termo de busca */
  query: string;
  
  /** Tipo de mídia a buscar */
  mediaType?: 'photo' | 'video' | 'all';
  
  /** Orientação desejada */
  orientation?: MediaOrientation;
  
  /** Tamanho mínimo */
  size?: MediaSize;
  
  /** Cor desejada (nome ou hex) */
  color?: string;
  
  /** Localidade da busca */
  locale?: string;
  
  /** Número da página */
  page?: number;
  
  /** Resultados por página */
  perPage?: number;
  
  /** Duração mínima em segundos (vídeos) */
  minDuration?: number;
  
  /** Duração máxima em segundos (vídeos) */
  maxDuration?: number;
}

/**
 * Resposta paginada de busca
 */
export interface MediaSearchResponse {
  /** Resultados da busca */
  results: MediaResult[];
  
  /** Página atual */
  page: number;
  
  /** Resultados por página */
  perPage: number;
  
  /** Total de resultados disponíveis */
  totalResults: number;
  
  /** Tem próxima página? */
  hasNextPage: boolean;
  
  /** Tem página anterior? */
  hasPrevPage: boolean;
}

// ========================================
// INTERFACE BASE PARA SERVICES
// ========================================

/**
 * Interface base que todos os serviços de busca de mídia devem implementar
 */
export interface MediaSearchService {
  /** Nome do provedor */
  readonly providerName: string;
  
  /** Busca fotos */
  searchPhotos(params: MediaSearchParams): Promise<MediaSearchResponse>;
  
  /** Busca vídeos */
  searchVideos(params: MediaSearchParams): Promise<MediaSearchResponse>;
  
  /** Busca fotos e vídeos */
  searchAll(params: MediaSearchParams): Promise<MediaSearchResponse>;
  
  /** Obtém uma foto por ID */
  getPhotoById(id: number | string): Promise<MediaResult | null>;
  
  /** Obtém um vídeo por ID */
  getVideoById(id: number | string): Promise<MediaResult | null>;
}
