/**
 * Assets Services - Módulo de serviços para busca de mídias
 * 
 * Este módulo contém serviços para integração com diferentes provedores
 * de mídia (fotos e vídeos) usados pelo sistema de geração de vídeos.
 * 
 * Cada serviço implementa a interface MediaSearchService, garantindo
 * uma API consistente para busca de mídias independente do provedor.
 * 
 * Provedores disponíveis:
 * - Pexels: Fotos e vídeos gratuitos e de alta qualidade
 * 
 * @example
 * ```typescript
 * import { getPexelsService } from './lib/assets';
 * 
 * const pexels = getPexelsService();
 * const videos = await pexels.searchForScene('natureza floresta tropical');
 * ```
 */

// Tipos padronizados
export type {
  MediaResult,
  MediaSearchParams,
  MediaSearchResponse,
  MediaSearchService,
  MediaVideoFile,
  MediaImageSizes,
  MediaAuthor,
  MediaOrientation,
  MediaSize,
} from './types';

// Serviço Pexels
export {
  PexelsService,
  getPexelsService,
  createPexelsService,
} from './pexels-service';

// Re-export para facilitar importação direta
export { getPexelsService as default } from './pexels-service';
