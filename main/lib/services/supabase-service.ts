import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getUserSettings } from '../database';
import { getObfuscatedSupabaseAnonKey, getObfuscatedSupabaseUrl } from './obfuscated-config';

export interface VideoMetadata {
  name: string; // Será mapeado para filename
  file_path?: string;
  category: string;
  is_chroma_key: boolean; // Vai para technical_data.is_chroma
  emotion: string;
  visual: string[]; // Será mapeado para visual_tags
  use_suggestion: string;
  luminance_score: string; // Vai para technical_data.luminance
  resolution: string; // Vai para technical_data.resolution
  aspect_ratio: string; // Vai para technical_data.aspect_ratio
  duration: number; // Vai para technical_data.duration
  description: string;
}

export interface VideoRecord extends VideoMetadata {
  id?: string; // UUID no Supabase
  embedding_cache?: number[]; // Mapeado para embedding (vector)
  created_at?: string;
  updated_at?: string;
}

export class SupabaseService {
  private client: SupabaseClient;
  private tableName = 'stock_videos'; // Usando a tabela existente no Supabase

  constructor() {
    const supabaseUrl = getObfuscatedSupabaseUrl();
    const supabaseKey = getObfuscatedSupabaseAnonKey();

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Credenciais do Supabase não configuradas no banco de dados.');
    }

    this.client = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Insere um vídeo no banco de dados vetorial
   */
  async insertVideo(video: VideoMetadata & { embedding_cache?: number[] }): Promise<VideoRecord | null> {
    const payload: any = {
      filename: video.name,
      file_path: video.file_path || video.name,
      category: video.category,
      emotion: video.emotion,
      visual_tags: video.visual,
      description: video.description,
      use_suggestion: video.use_suggestion,
      technical_data: {
        luminance: video.luminance_score,
        resolution: video.resolution,
        aspect_ratio: video.aspect_ratio,
        duration: video.duration,
        is_chroma: video.is_chroma_key,
      },
    };

    // Se tiver embedding, adiciona
    if (video.embedding_cache) {
      payload.embedding = JSON.stringify(video.embedding_cache);
    }

    const { data, error } = await this.client
      .from(this.tableName)
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Erro ao inserir vídeo:', error);
      return null;
    }

    return this.mapToVideoRecord(data);
  }

  /**
   * Mapeia dados do Supabase para VideoRecord
   */
  private mapToVideoRecord(data: any): VideoRecord {
    const technicalData = data.technical_data || {};
    
    return {
      id: data.id,
      name: data.filename,
      file_path: data.file_path,
      category: data.category,
      emotion: data.emotion || '',
      visual: data.visual_tags || [],
      description: data.description || '',
      use_suggestion: data.use_suggestion || '',
      luminance_score: technicalData.luminance || '',
      resolution: technicalData.resolution || '',
      aspect_ratio: technicalData.aspect_ratio || '',
      duration: technicalData.duration || 0,
      is_chroma_key: technicalData.is_chroma || false,
      embedding_cache: data.embedding ? JSON.parse(data.embedding) : undefined,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  /**
   * Insere múltiplos vídeos de uma vez
   */
  async insertVideos(videos: (VideoMetadata & { embedding_cache?: number[] })[]): Promise<VideoRecord[]> {
    const payloads = videos.map(video => ({
      filename: video.name,
      file_path: video.file_path || video.name,
      category: video.category,
      emotion: video.emotion,
      visual_tags: video.visual,
      description: video.description,
      use_suggestion: video.use_suggestion,
      technical_data: {
        luminance: video.luminance_score,
        resolution: video.resolution,
        aspect_ratio: video.aspect_ratio,
        duration: video.duration,
        is_chroma: video.is_chroma_key,
      },
      embedding: video.embedding_cache ? JSON.stringify(video.embedding_cache) : null,
    }));

    const { data, error } = await this.client
      .from(this.tableName)
      .insert(payloads)
      .select();

    if (error) {
      console.error('Erro ao inserir vídeos:', error);
      return [];
    }

    return (data || []).map(d => this.mapToVideoRecord(d));
  }

  /**
   * Busca por texto na descrição, emoção ou sugestão de uso
   * Esta é uma busca simples por texto, não vetorial
   */
  async searchByText(query: string, limit: number = 50): Promise<VideoRecord[]> {
    const { data, error} = await this.client
      .from(this.tableName)
      .select('*')
      .or(`description.ilike.%${query}%,emotion.ilike.%${query}%,use_suggestion.ilike.%${query}%`)
      .limit(limit);

    if (error) {
      console.error('Erro na busca por texto:', error);
      return [];
    }

    return (data || []).map(d => this.mapToVideoRecord(d));
  }

  /**
   * Busca por categoria
   */
  async searchByCategory(category: string): Promise<VideoRecord[]> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('category', category);

    if (error) {
      console.error('Erro ao buscar por categoria:', error);
      return [];
    }

    return (data || []).map(d => this.mapToVideoRecord(d));
  }

  /**
   * Busca por emoção
   */
  async searchByEmotion(emotion: string): Promise<VideoRecord[]> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .ilike('emotion', `%${emotion}%`);

    if (error) {
      console.error('Erro ao buscar por emoção:', error);
      return [];
    }

    return (data || []).map(d => this.mapToVideoRecord(d));
  }

  /**
   * Busca por aspect ratio (procura em technical_data)
   */
  async searchByAspectRatio(aspectRatio: string): Promise<VideoRecord[]> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .filter('technical_data->aspect_ratio', 'eq', aspectRatio);

    if (error) {
      console.error('Erro ao buscar por aspect ratio:', error);
      return [];
    }

    return (data || []).map(d => this.mapToVideoRecord(d));
  }

  /**
   * Busca vídeos com chroma key (procura em technical_data)
   */
  async searchChromaKeyVideos(): Promise<VideoRecord[]> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .filter('technical_data->is_chroma', 'eq', true);

    if (error) {
      console.error('Erro ao buscar vídeos chroma key:', error);
      return [];
    }

    return (data || []).map(d => this.mapToVideoRecord(d));
  }

  /**
   * Busca por duração (em segundos) - procura em technical_data
   */
  async searchByDuration(minDuration: number, maxDuration: number): Promise<VideoRecord[]> {
    // Consulta filtrando dentro do JSON
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .gte('technical_data->duration', minDuration)
      .lte('technical_data->duration', maxDuration);

    if (error) {
      console.error('Erro ao buscar por duração:', error);
      return [];
    }

    return (data || []).map(d => this.mapToVideoRecord(d));
  }

  /**
   * Obtém um vídeo pelo ID
   */
  async getVideoById(id: string): Promise<VideoRecord | null> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Erro ao buscar vídeo por ID:', error);
      return null;
    }

    return this.mapToVideoRecord(data);
  }

  /**
   * Atualiza um vídeo
   */
  async updateVideo(id: string, updates: Partial<VideoMetadata & { embedding_cache?: number[] }>): Promise<VideoRecord | null> {
    const payload: any = {};

    // Mapeia campos simples
    if (updates.name) payload.filename = updates.name;
    if (updates.file_path) payload.file_path = updates.file_path;
    if (updates.category) payload.category = updates.category;
    if (updates.emotion) payload.emotion = updates.emotion;
    if (updates.visual) payload.visual_tags = updates.visual;
    if (updates.description) payload.description = updates.description;
    if (updates.use_suggestion) payload.use_suggestion = updates.use_suggestion;

    // Atualiza technical_data se algum campo técnico for fornecido
    if (updates.luminance_score || updates.resolution || updates.aspect_ratio || updates.duration !== undefined || updates.is_chroma_key !== undefined) {
      payload.technical_data = {};
      if (updates.luminance_score) payload.technical_data.luminance = updates.luminance_score;
      if (updates.resolution) payload.technical_data.resolution = updates.resolution;
      if (updates.aspect_ratio) payload.technical_data.aspect_ratio = updates.aspect_ratio;
      if (updates.duration !== undefined) payload.technical_data.duration = updates.duration;
      if (updates.is_chroma_key !== undefined) payload.technical_data.is_chroma = updates.is_chroma_key;
    }

    // Atualiza embedding se fornecido
    if (updates.embedding_cache) {
      payload.embedding = JSON.stringify(updates.embedding_cache);
    }

    const { data, error } = await this.client
      .from(this.tableName)
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Erro ao atualizar vídeo:', error);
      return null;
    }

    return this.mapToVideoRecord(data);
  }

  /**
   * Deleta um vídeo
   */
  async deleteVideo(id: string): Promise<boolean> {
    const { error } = await this.client
      .from(this.tableName)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erro ao deletar vídeo:', error);
      return false;
    }

    return true;
  }

  /**
   * Lista todos os vídeos (com paginação)
   */
  async listVideos(page: number = 0, pageSize: number = 50): Promise<VideoRecord[]> {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await this.client
      .from(this.tableName)
      .select('*')
      .range(from, to)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao listar vídeos:', error);
      return [];
    }

    return (data || []).map(d => this.mapToVideoRecord(d));
  }
}

// Singleton instance
let supabaseServiceInstance: SupabaseService | null = null;

export function getSupabaseService(): SupabaseService {
  if (!supabaseServiceInstance) {
    supabaseServiceInstance = new SupabaseService();
  }
  return supabaseServiceInstance;
}
