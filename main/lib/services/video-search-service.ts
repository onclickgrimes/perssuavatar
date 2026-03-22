import { OpenAI } from 'openai';
import { getSupabaseService, VideoRecord } from './supabase-service';
import { getPrimaryApiKey } from '../credentials';

/**
 * Serviço de busca vetorial/semântica de vídeos
 * Toda a lógica de IA roda no app Electron, não no Supabase
 */
export class VideoSearchService {
  private openai: OpenAI | null = null;
  private openaiApiKey: string | null = null;
  private supabase: ReturnType<typeof getSupabaseService>;
  
  constructor() {
    this.supabase = getSupabaseService();
  }

  private getOpenAIClient(): OpenAI {
    const apiKey = getPrimaryApiKey('openai');
    if (!apiKey) {
      throw new Error('OpenAI API key não encontrada. Cadastre em Configurações > API e Modelos.');
    }

    if (this.openai && this.openaiApiKey === apiKey) {
      return this.openai;
    }

    this.openai = new OpenAI({ apiKey });
    this.openaiApiKey = apiKey;
    return this.openai;
  }

  /**
   * Gera embedding para um texto usando OpenAI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.getOpenAIClient().embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float',
    });
    
    return response.data[0].embedding;
  }

  /**
   * Calcula similaridade de cosseno entre dois vetores
   * Retorna um valor entre -1 e 1, onde 1 é máxima similaridade
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vetores devem ter o mesmo tamanho');
    }

    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Busca semântica: gera embedding da query e compara com todos os vídeos
   * Retorna vídeos ordenados por similaridade
   */
  async semanticSearch(
    query: string, 
    limit: number = 10,
    minSimilarity: number = 0.5
  ): Promise<(VideoRecord & { similarity: number })[]> {
    console.log(`🔍 Busca semântica: "${query}"`);

    // 1. Gera embedding da query
    console.log('  → Gerando embedding da busca...');
    const queryEmbedding = await this.generateEmbedding(query);

    // 2. Busca todos os vídeos que têm embedding
    console.log('  → Buscando vídeos no Supabase...');
    const allVideos = await this.supabase.listVideos(0, 10000);
    const videosWithEmbedding = allVideos.filter(v => v.embedding_cache && Array.isArray(v.embedding_cache));

    console.log(`  → ${videosWithEmbedding.length} vídeos com embeddings encontrados`);

    if (videosWithEmbedding.length === 0) {
      console.warn('  ⚠️  Nenhum vídeo com embedding! Execute generate-embeddings primeiro.');
      return [];
    }

    // 3. Calcula similaridade para cada vídeo
    console.log('  → Calculando similaridades...');
    const videosWithScores = videosWithEmbedding.map((video) => {
      const similarity = this.cosineSimilarity(queryEmbedding, video.embedding_cache!);
      
      return {
        ...video,
        similarity,
      };
    });

    // 4. Filtra por similaridade mínima e ordena
    const filtered = videosWithScores
      .filter(v => v.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    console.log(`  ✅ ${filtered.length} resultados relevantes encontrados`);

    return filtered;
  }

  /**
   * Busca híbrida: combina busca por texto + busca semântica
   * Útil para melhor precisão
   */
  async hybridSearch(
    query: string, 
    limit: number = 10
  ): Promise<VideoRecord[]> {
    console.log(`🔍 Busca híbrida: "${query}"`);

    // 1. Busca por texto simples (rápida)
    console.log('  → Buscando por texto...');
    const textResults = await this.supabase.searchByText(query, limit * 2);

    // 2. Busca semântica
    console.log('  → Buscando semanticamente...');
    const semanticResults = await this.semanticSearch(query, limit * 2, 0.5);
    
    // 3. Combina resultados removendo duplicatas
    const combined = new Map<string, { video: VideoRecord; score: number }>();

    // Adiciona resultados de texto (score baseado na posição)
    textResults.forEach((video, index) => {
      const score = 1 - (index / textResults.length); // Score decrescente
      combined.set(video.id!, { video, score });
    });

    // Adiciona resultados semânticos (score = similaridade)
    semanticResults.forEach((result) => {
      const existing = combined.get(result.id!);
      if (existing) {
        // Se já existe, aumenta o score (foi encontrado por ambos os métodos)
        existing.score = (existing.score + result.similarity) / 2;
      } else {
        combined.set(result.id!, { video: result, score: result.similarity });
      }
    });

    // 4. Ordena por score e retorna
    const sorted = Array.from(combined.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.video);

    console.log(`  ✅ ${sorted.length} resultados combinados`);

    return sorted;
  }

  /**
   * Busca por filtros + busca semântica
   * Aplica filtros primeiro, depois busca semântica nos resultados
   */
  async filterAndSearch(
    filters: {
      category?: string;
      aspectRatio?: string;
      minDuration?: number;
      maxDuration?: number;
      emotion?: string;
      chromaKey?: boolean;
    },
    semanticQuery?: string,
    limit: number = 10
  ): Promise<VideoRecord[]> {
    console.log('🔍 Busca com filtros');

    // 1. Busca inicial com filtros
    let videos = await this.supabase.listVideos(0, 10000);
    
    // Aplica filtros
    if (filters.category) {
      videos = videos.filter(v => v.category === filters.category);
      console.log(`  → Filtro categoria: ${videos.length} vídeos`);
    }
    if (filters.aspectRatio) {
      videos = videos.filter(v => v.aspect_ratio === filters.aspectRatio);
      console.log(`  → Filtro aspect ratio: ${videos.length} vídeos`);
    }
    if (filters.minDuration !== undefined) {
      videos = videos.filter(v => v.duration >= filters.minDuration!);
      console.log(`  → Filtro duração mínima: ${videos.length} vídeos`);
    }
    if (filters.maxDuration !== undefined) {
      videos = videos.filter(v => v.duration <= filters.maxDuration!);
      console.log(`  → Filtro duração máxima: ${videos.length} vídeos`);
    }
    if (filters.emotion) {
      videos = videos.filter(v => 
        v.emotion.toLowerCase().includes(filters.emotion!.toLowerCase())
      );
      console.log(`  → Filtro emoção: ${videos.length} vídeos`);
    }
    if (filters.chromaKey !== undefined) {
      videos = videos.filter(v => v.is_chroma_key === filters.chromaKey);
      console.log(`  → Filtro chroma key: ${videos.length} vídeos`);
    }

    // 2. Se tem query semântica, aplica busca vetorial nos resultados filtrados
    if (semanticQuery && videos.length > 0) {
      console.log('  → Aplicando busca semântica...');
      
      // Gera embedding da query
      const queryEmbedding = await this.generateEmbedding(semanticQuery);
      
      // Filtra apenas vídeos com embedding
      const videosWithEmbedding = videos.filter(v => v.embedding_cache);
      
      if (videosWithEmbedding.length === 0) {
        console.warn('  ⚠️  Nenhum vídeo filtrado tem embedding');
        return videos.slice(0, limit);
      }

      // Calcula similaridade
      const withScores = videosWithEmbedding.map(video => ({
        ...video,
        similarity: this.cosineSimilarity(queryEmbedding, video.embedding_cache!),
      }));

      // Ordena por similaridade
      return withScores
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    }

    // 3. Se não tem query semântica, apenas retorna os filtrados
    return videos.slice(0, limit);
  }

  /**
   * Busca vídeos similares a um vídeo específico
   */
  async findSimilarVideos(
    videoId: string, 
    limit: number = 5
  ): Promise<(VideoRecord & { similarity: number })[]> {
    console.log(`🔍 Buscando vídeos similares ao ID ${videoId}`);

    // 1. Busca o vídeo de referência
    const referenceVideo = await this.supabase.getVideoById(videoId);
    
    if (!referenceVideo) {
      throw new Error(`Vídeo ${videoId} não encontrado`);
    }

    if (!referenceVideo.embedding_cache) {
      throw new Error(`Vídeo ${videoId} não tem embedding`);
    }

    // 2. Busca todos os outros vídeos com embedding
    const allVideos = await this.supabase.listVideos(0, 10000);
    const otherVideos = allVideos.filter(v => 
      v.id !== videoId && 
      v.embedding_cache && 
      Array.isArray(v.embedding_cache)
    );

    // 3. Calcula similaridade
    const withScores = otherVideos.map(video => ({
      ...video,
      similarity: this.cosineSimilarity(referenceVideo.embedding_cache!, video.embedding_cache!),
    }));

    // 4. Ordena e retorna os mais similares
    return withScores
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }
}

// Singleton instance
let videoSearchServiceInstance: VideoSearchService | null = null;

export function getVideoSearchService(): VideoSearchService {
  if (!videoSearchServiceInstance) {
    videoSearchServiceInstance = new VideoSearchService();
  }
  return videoSearchServiceInstance;
}
