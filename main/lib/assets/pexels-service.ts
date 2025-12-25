/**
 * Pexels Service
 * 
 * Serviço para integração com a API do Pexels para busca de fotos e vídeos.
 * Utilizado pelo sistema de IA para encontrar mídias baseadas em prompts
 * gerados a partir da análise do áudio.
 * 
 * Documentação: https://www.pexels.com/api/documentation/
 * 
 * IMPORTANTE: Sempre creditar os fotógrafos/videomakers conforme guidelines do Pexels.
 */

import type {
  MediaResult,
  MediaSearchParams,
  MediaSearchResponse,
  MediaSearchService,
  MediaVideoFile,
  MediaImageSizes,
  MediaAuthor,
} from './types';

// ========================================
// TIPOS ESPECÍFICOS DO PEXELS
// ========================================

interface PexelsPhotoSrc {
  original: string;
  large2x: string;
  large: string;
  medium: string;
  small: string;
  portrait: string;
  landscape: string;
  tiny: string;
}

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  photographer_id: number;
  avg_color: string;
  src: PexelsPhotoSrc;
  liked: boolean;
  alt: string;
}

interface PexelsVideoFile {
  id: number;
  quality: 'hd' | 'sd' | 'hls';
  file_type: string;
  width: number | null;
  height: number | null;
  fps: number;
  link: string;
}

interface PexelsVideoPicture {
  id: number;
  picture: string;
  nr: number;
}

interface PexelsVideoUser {
  id: number;
  name: string;
  url: string;
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  url: string;
  image: string;
  duration: number;
  user: PexelsVideoUser;
  video_files: PexelsVideoFile[];
  video_pictures: PexelsVideoPicture[];
}

interface PexelsPhotoSearchResponse {
  page: number;
  per_page: number;
  total_results: number;
  photos: PexelsPhoto[];
  next_page?: string;
  prev_page?: string;
}

interface PexelsVideoSearchResponse {
  page: number;
  per_page: number;
  total_results: number;
  url: string;
  videos: PexelsVideo[];
  next_page?: string;
  prev_page?: string;
}

// ========================================
// PEXELS SERVICE
// ========================================

export class PexelsService implements MediaSearchService {
  readonly providerName = 'pexels';
  
  private readonly apiKey: string;
  private readonly baseUrlPhotos = 'https://api.pexels.com/v1';
  private readonly baseUrlVideos = 'https://api.pexels.com/videos';
  
  // Rate limit tracking
  private rateLimitRemaining: number = 200;
  private rateLimitReset: number = 0;
  
  constructor(apiKey?: string) {
    const key = apiKey || process.env.PEXELS_API_KEY;
    if (!key) {
      throw new Error('PEXELS_API_KEY não encontrada. Defina no .env ou passe como parâmetro.');
    }
    this.apiKey = key;
  }
  
  // ========================================
  // MÉTODOS AUXILIARES
  // ========================================
  
  /**
   * Faz uma requisição à API do Pexels
   */
  private async request<T>(url: string): Promise<T> {
    console.log(`📷 Pexels API: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': this.apiKey,
      },
    });
    
    // Atualiza informações de rate limit
    const limitRemaining = response.headers.get('X-Ratelimit-Remaining');
    const limitReset = response.headers.get('X-Ratelimit-Reset');
    
    if (limitRemaining) {
      this.rateLimitRemaining = parseInt(limitRemaining, 10);
    }
    if (limitReset) {
      this.rateLimitReset = parseInt(limitReset, 10);
    }
    
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(`Pexels rate limit excedido. Reset em: ${new Date(this.rateLimitReset * 1000).toISOString()}`);
      }
      throw new Error(`Pexels API error: ${response.status} ${response.statusText}`);
    }
    
    return response.json() as Promise<T>;
  }
  
  /**
   * Converte parâmetros de busca para query string do Pexels
   */
  private buildQueryParams(params: MediaSearchParams): URLSearchParams {
    const query = new URLSearchParams();
    
    query.set('query', params.query);
    
    if (params.orientation) {
      query.set('orientation', params.orientation);
    }
    
    if (params.size) {
      query.set('size', params.size);
    }
    
    if (params.color) {
      query.set('color', params.color);
    }
    
    if (params.locale) {
      query.set('locale', params.locale);
    } else {
      // Default para português brasileiro
      query.set('locale', 'pt-BR');
    }
    
    if (params.page) {
      query.set('page', params.page.toString());
    }
    
    if (params.perPage) {
      query.set('per_page', Math.min(params.perPage, 80).toString()); // Max 80
    } else {
      query.set('per_page', '15'); // Default
    }
    
    return query;
  }
  
  /**
   * Converte uma foto do Pexels para o formato padronizado
   */
  private mapPhoto(photo: PexelsPhoto, searchQuery?: string): MediaResult {
    const imageSizes: MediaImageSizes = {
      original: photo.src.original,
      large2x: photo.src.large2x,
      large: photo.src.large,
      medium: photo.src.medium,
      small: photo.src.small,
      portrait: photo.src.portrait,
      landscape: photo.src.landscape,
      tiny: photo.src.tiny,
    };
    
    const author: MediaAuthor = {
      id: photo.photographer_id,
      name: photo.photographer,
      url: photo.photographer_url,
    };
    
    return {
      id: photo.id,
      type: 'photo',
      provider: 'pexels',
      width: photo.width,
      height: photo.height,
      url: photo.url,
      thumbnail: photo.src.medium,
      description: photo.alt,
      author,
      imageSizes,
      avgColor: photo.avg_color,
      suggestedAssetType: 'image_static',
      directUrl: photo.src.original,
      searchQuery,
    };
  }
  
  /**
   * Converte um vídeo do Pexels para o formato padronizado
   */
  private mapVideo(video: PexelsVideo, searchQuery?: string): MediaResult {
    const videoFiles: MediaVideoFile[] = video.video_files.map(file => ({
      id: file.id,
      quality: file.quality,
      fileType: file.file_type,
      width: file.width,
      height: file.height,
      fps: file.fps,
      link: file.link,
    }));
    
    const author: MediaAuthor = {
      id: video.user.id,
      name: video.user.name,
      url: video.user.url,
    };
    
    // Encontra a melhor qualidade disponível para o link direto
    const bestQuality = videoFiles
      .filter(f => f.quality === 'hd' && f.width !== null)
      .sort((a, b) => (b.width || 0) - (a.width || 0))[0]
      || videoFiles.find(f => f.quality === 'sd')
      || videoFiles[0];
    
    return {
      id: video.id,
      type: 'video',
      provider: 'pexels',
      width: video.width,
      height: video.height,
      url: video.url,
      duration: video.duration,
      thumbnail: video.image,
      author,
      videoFiles,
      suggestedAssetType: 'video_stock',
      directUrl: bestQuality?.link || video.video_files[0]?.link || '',
      searchQuery,
    };
  }
  
  // ========================================
  // MÉTODOS PÚBLICOS DE BUSCA
  // ========================================
  
  /**
   * Busca fotos no Pexels
   */
  async searchPhotos(params: MediaSearchParams): Promise<MediaSearchResponse> {
    console.log(`🔍 Pexels: Buscando fotos para "${params.query}"`);
    
    const queryParams = this.buildQueryParams(params);
    const url = `${this.baseUrlPhotos}/search?${queryParams.toString()}`;
    
    const response = await this.request<PexelsPhotoSearchResponse>(url);
    
    const results: MediaResult[] = response.photos.map(photo => 
      this.mapPhoto(photo, params.query)
    );
    
    console.log(`  ✅ ${results.length} fotos encontradas (total: ${response.total_results})`);
    
    return {
      results,
      page: response.page,
      perPage: response.per_page,
      totalResults: response.total_results,
      hasNextPage: !!response.next_page,
      hasPrevPage: !!response.prev_page,
    };
  }
  
  /**
   * Busca vídeos no Pexels
   */
  async searchVideos(params: MediaSearchParams): Promise<MediaSearchResponse> {
    console.log(`🔍 Pexels: Buscando vídeos para "${params.query}"`);
    
    const queryParams = this.buildQueryParams(params);
    const url = `${this.baseUrlVideos}/search?${queryParams.toString()}`;
    
    const response = await this.request<PexelsVideoSearchResponse>(url);
    
    let results: MediaResult[] = response.videos.map(video => 
      this.mapVideo(video, params.query)
    );
    
    // Aplica filtros de duração se especificados
    if (params.minDuration !== undefined || params.maxDuration !== undefined) {
      results = results.filter(video => {
        if (!video.duration) return true;
        if (params.minDuration !== undefined && video.duration < params.minDuration) return false;
        if (params.maxDuration !== undefined && video.duration > params.maxDuration) return false;
        return true;
      });
    }
    
    console.log(`  ✅ ${results.length} vídeos encontrados (total: ${response.total_results})`);
    
    return {
      results,
      page: response.page,
      perPage: response.per_page,
      totalResults: response.total_results,
      hasNextPage: !!response.next_page,
      hasPrevPage: !!response.prev_page,
    };
  }
  
  /**
   * Busca fotos e vídeos no Pexels
   */
  async searchAll(params: MediaSearchParams): Promise<MediaSearchResponse> {
    console.log(`🔍 Pexels: Buscando fotos e vídeos para "${params.query}"`);
    
    // Divide o perPage entre fotos e vídeos
    const perPageEach = Math.ceil((params.perPage || 15) / 2);
    
    const [photosResponse, videosResponse] = await Promise.all([
      this.searchPhotos({ ...params, perPage: perPageEach }),
      this.searchVideos({ ...params, perPage: perPageEach }),
    ]);
    
    // Combina resultados intercalando fotos e vídeos
    const combined: MediaResult[] = [];
    const maxLen = Math.max(photosResponse.results.length, videosResponse.results.length);
    
    for (let i = 0; i < maxLen; i++) {
      if (i < photosResponse.results.length) {
        combined.push(photosResponse.results[i]);
      }
      if (i < videosResponse.results.length) {
        combined.push(videosResponse.results[i]);
      }
    }
    
    return {
      results: combined.slice(0, params.perPage || 15),
      page: params.page || 1,
      perPage: params.perPage || 15,
      totalResults: photosResponse.totalResults + videosResponse.totalResults,
      hasNextPage: photosResponse.hasNextPage || videosResponse.hasNextPage,
      hasPrevPage: photosResponse.hasPrevPage || videosResponse.hasPrevPage,
    };
  }
  
  /**
   * Obtém uma foto específica por ID
   */
  async getPhotoById(id: number | string): Promise<MediaResult | null> {
    console.log(`📷 Pexels: Buscando foto ID ${id}`);
    
    try {
      const url = `${this.baseUrlPhotos}/photos/${id}`;
      const photo = await this.request<PexelsPhoto>(url);
      return this.mapPhoto(photo);
    } catch (error) {
      console.error(`  ❌ Erro ao buscar foto ${id}:`, error);
      return null;
    }
  }
  
  /**
   * Obtém um vídeo específico por ID
   */
  async getVideoById(id: number | string): Promise<MediaResult | null> {
    console.log(`🎬 Pexels: Buscando vídeo ID ${id}`);
    
    try {
      const url = `${this.baseUrlVideos}/videos/${id}`;
      const video = await this.request<PexelsVideo>(url);
      return this.mapVideo(video);
    } catch (error) {
      console.error(`  ❌ Erro ao buscar vídeo ${id}:`, error);
      return null;
    }
  }
  
  // ========================================
  // MÉTODOS ADICIONAIS DO PEXELS
  // ========================================
  
  /**
   * Obtém fotos curadas (trending) do Pexels
   */
  async getCuratedPhotos(page: number = 1, perPage: number = 15): Promise<MediaSearchResponse> {
    console.log(`📷 Pexels: Buscando fotos curadas`);
    
    const url = `${this.baseUrlPhotos}/curated?page=${page}&per_page=${Math.min(perPage, 80)}`;
    const response = await this.request<PexelsPhotoSearchResponse>(url);
    
    const results: MediaResult[] = response.photos.map(photo => 
      this.mapPhoto(photo, 'curated')
    );
    
    return {
      results,
      page: response.page,
      perPage: response.per_page,
      totalResults: response.total_results,
      hasNextPage: !!response.next_page,
      hasPrevPage: !!response.prev_page,
    };
  }
  
  /**
   * Obtém vídeos populares do Pexels
   */
  async getPopularVideos(page: number = 1, perPage: number = 15): Promise<MediaSearchResponse> {
    console.log(`🎬 Pexels: Buscando vídeos populares`);
    
    const url = `${this.baseUrlVideos}/popular?page=${page}&per_page=${Math.min(perPage, 80)}`;
    const response = await this.request<PexelsVideoSearchResponse>(url);
    
    const results: MediaResult[] = response.videos.map(video => 
      this.mapVideo(video, 'popular')
    );
    
    return {
      results,
      page: response.page,
      perPage: response.per_page,
      totalResults: response.total_results,
      hasNextPage: !!response.next_page,
      hasPrevPage: !!response.prev_page,
    };
  }
  
  /**
   * Busca mídia para um prompt de cena (otimizado para IA)
   * 
   * Este método é especialmente útil quando a IA gera prompts visuais
   * baseados na análise do áudio.
   * 
   * @param prompt - Prompt visual gerado pela IA
   * @param options - Opções adicionais de busca
   * @returns Lista de mídias relevantes
   */
  async searchForScene(
    prompt: string,
    options: {
      preferVideo?: boolean;
      orientation?: MediaSearchParams['orientation'];
      minDuration?: number;
      maxDuration?: number;
      limit?: number;
    } = {}
  ): Promise<MediaResult[]> {
    console.log(`🎬 Pexels: Buscando mídia para cena: "${prompt}"`);
    
    const {
      preferVideo = true,
      orientation,
      minDuration,
      maxDuration,
      limit = 5,
    } = options;
    
    const params: MediaSearchParams = {
      query: prompt,
      orientation,
      minDuration,
      maxDuration,
      perPage: limit,
    };
    
    if (preferVideo) {
      // Primeiro tenta vídeos
      const videoResults = await this.searchVideos(params);
      
      if (videoResults.results.length >= limit) {
        return videoResults.results.slice(0, limit);
      }
      
      // Se não encontrar vídeos suficientes, busca fotos também
      const photosNeeded = limit - videoResults.results.length;
      const photoResults = await this.searchPhotos({ ...params, perPage: photosNeeded });
      
      return [...videoResults.results, ...photoResults.results].slice(0, limit);
    } else {
      // Busca fotos primeiro
      const photoResults = await this.searchPhotos(params);
      
      if (photoResults.results.length >= limit) {
        return photoResults.results.slice(0, limit);
      }
      
      // Se não encontrar fotos suficientes, busca vídeos
      const videosNeeded = limit - photoResults.results.length;
      const videoResults = await this.searchVideos({ ...params, perPage: videosNeeded });
      
      return [...photoResults.results, ...videoResults.results].slice(0, limit);
    }
  }
  
  /**
   * Retorna informações sobre o rate limit atual
   */
  getRateLimitInfo(): { remaining: number; resetAt: Date } {
    return {
      remaining: this.rateLimitRemaining,
      resetAt: new Date(this.rateLimitReset * 1000),
    };
  }
  
  /**
   * Gera o texto de atribuição para uma mídia
   * (Conforme guidelines do Pexels)
   */
  getAttribution(media: MediaResult): string {
    if (media.type === 'photo') {
      return `Photo by ${media.author.name} on Pexels`;
    } else {
      return `Video by ${media.author.name} on Pexels`;
    }
  }
  
  /**
   * Gera HTML de atribuição para uma mídia
   * (Conforme guidelines do Pexels)
   */
  getAttributionHtml(media: MediaResult): string {
    const typeText = media.type === 'photo' ? 'Photo' : 'Video';
    return `<a href="${media.url}">${typeText}</a> by <a href="${media.author.url}">${media.author.name}</a> on <a href="https://www.pexels.com">Pexels</a>`;
  }
}

// ========================================
// SINGLETON INSTANCE
// ========================================

let pexelsServiceInstance: PexelsService | null = null;

/**
 * Obtém a instância singleton do serviço Pexels
 */
export function getPexelsService(): PexelsService {
  if (!pexelsServiceInstance) {
    pexelsServiceInstance = new PexelsService();
  }
  return pexelsServiceInstance;
}

/**
 * Cria uma nova instância do serviço Pexels com uma API key específica
 */
export function createPexelsService(apiKey: string): PexelsService {
  return new PexelsService(apiKey);
}
