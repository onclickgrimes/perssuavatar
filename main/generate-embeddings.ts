import 'dotenv/config';
import { OpenAI } from 'openai';
import { getSupabaseService, VideoMetadata } from './lib/services/supabase-service';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Script para gerar embeddings dos vídeos usando OpenAI e salvar no Supabase
 * 
 * Uso:
 * 1. Processar pasta inteira:
 *    tsx main/generate-embeddings.ts --from-folder
 * 
 * 2. Processar JSON específico:
 *    tsx main/generate-embeddings.ts <caminho-para-json>
 * 
 * 3. Processar vídeos já no Supabase:
 *    tsx main/generate-embeddings.ts --from-supabase
 */

const VIDEOS_FOLDER = 'L:\\Video-Maker\\H00KS_JSONS';
const CACHE_FILE = path.join(process.cwd(), '.embeddings-cache.json');

interface VideoJSON {
  name: string;
  category: string;
  is_chroma_key: boolean;
  emotion: string;
  visual: string[];
  use_suggestion: string;
  luminance_score: string;
  resolution: string;
  aspect_ratio: string;
  duration: number;
  description: string;
}

interface ProcessedCache {
  videos: { [videoName: string]: { processedAt: string; jsonFile: string } };
  lastUpdate: string;
}

class EmbeddingGenerator {
  private openai: OpenAI;
  private supabase: ReturnType<typeof getSupabaseService>;
  private cache: ProcessedCache;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY não encontrada no .env');
    }

    this.openai = new OpenAI({ apiKey });
    this.supabase = getSupabaseService();
    this.cache = this.loadCache();
  }

  /**
   * Carrega o cache de vídeos já processados
   */
  private loadCache(): ProcessedCache {
    if (fs.existsSync(CACHE_FILE)) {
      try {
        const data = fs.readFileSync(CACHE_FILE, 'utf-8');
        return JSON.parse(data);
      } catch (error) {
        console.warn('⚠️  Erro ao carregar cache, criando novo:', error);
      }
    }

    return {
      videos: {},
      lastUpdate: new Date().toISOString(),
    };
  }

  /**
   * Salva o cache em disco
   */
  private saveCache(): void {
    this.cache.lastUpdate = new Date().toISOString();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2), 'utf-8');
  }

  /**
   * Verifica se um vídeo já foi processado
   */
  private isVideoProcessed(videoName: string): boolean {
    return videoName in this.cache.videos;
  }

  /**
   * Marca um vídeo como processado
   */
  private markVideoAsProcessed(videoName: string, jsonFile: string): void {
    this.cache.videos[videoName] = {
      processedAt: new Date().toISOString(),
      jsonFile,
    };
    this.saveCache();
  }

  /**
   * Gera o "Super Texto" concatenando todas as informações relevantes
   */
  private createSuperText(video: VideoJSON): string {
    return `
      Emotion: ${video.emotion}
      Visual Elements: ${video.visual.join(', ')}
      Usage Suggestion: ${video.use_suggestion}
      Description: ${video.description}
    `.replace(/\s+/g, ' ').trim();
  }

  /**
   * Gera embedding usando OpenAI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    console.log('  → Gerando embedding...');
    
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float',
    });

    return response.data[0].embedding;
  }

  /**
   * Processa um vídeo: gera embedding e salva no Supabase
   */
  async processVideo(video: VideoJSON, filePath?: string, jsonFile?: string): Promise<boolean> {
    // Verifica se já foi processado
    if (this.isVideoProcessed(video.name)) {
      console.log(`  ⏭️  Vídeo já processado (pulando)`);
      return true; // Retorna sucesso pois já está processado
    }

    console.log(`\n📹 Processando: ${video.name}`);

    try {
      // 1. Criar o super texto
      const superText = this.createSuperText(video);
      console.log(`  → Texto gerado (${superText.length} caracteres)`);
      console.log(superText);

      // 2. Gerar embedding
      const embedding = await this.generateEmbedding(superText);
      console.log(`  → Embedding gerado (${embedding.length} dimensões)`);

      // 3. Preparar dados para salvar
      const videoData: VideoMetadata & { embedding_cache: number[] } = {
        name: video.name,
        file_path: filePath || video.name,
        category: video.category,
        is_chroma_key: video.is_chroma_key,
        emotion: video.emotion,
        visual: video.visual,
        use_suggestion: video.use_suggestion,
        luminance_score: video.luminance_score,
        resolution: video.resolution,
        aspect_ratio: video.aspect_ratio,
        duration: video.duration,
        description: video.description,
        embedding_cache: embedding,
      };

      // 4. Verificar se já existe
      const existing = await this.supabase.listVideos(0, 10000);
      const existingVideo = existing.find(v => v.name === video.name);

      if (existingVideo) {
        // Atualizar embedding
        console.log('  → Atualizando vídeo existente...');
        await this.supabase.updateVideo(existingVideo.id!, {
          ...videoData,
        } as any);
      } else {
        // Inserir novo
        console.log('  → Inserindo novo vídeo...');
        await this.supabase.insertVideo(videoData as any);
      }

      // Marca como processado
      this.markVideoAsProcessed(video.name, jsonFile || 'unknown');
      console.log('  ✅ Sucesso!');
      return true;
    } catch (error) {
      console.error(`  ❌ Erro ao processar ${video.name}:`, error);
      return false;
    }
  }

  /**
   * Processa todos os JSONs de uma pasta
   */
  async processFromFolder(): Promise<void> {
    console.log('🚀 Processando todos os JSONs da pasta...\n');
    console.log(`📂 Pasta: ${VIDEOS_FOLDER}\n`);

    // Verifica se a pasta existe
    if (!fs.existsSync(VIDEOS_FOLDER)) {
      console.error(`❌ Pasta não encontrada: ${VIDEOS_FOLDER}`);
      process.exit(1);
    }

    // Lista todos os arquivos JSON
    const files = fs.readdirSync(VIDEOS_FOLDER).filter(f => f.endsWith('.json'));

    if (files.length === 0) {
      console.log('⚠️  Nenhum arquivo JSON encontrado na pasta');
      return;
    }

    console.log(`📦 Total de arquivos JSON: ${files.length}\n`);
    console.log('═'.repeat(60));

    let totalVideos = 0;
    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = path.join(VIDEOS_FOLDER, file);

      console.log(`\n\n${'═'.repeat(60)}`);
      console.log(`📄 Arquivo [${i + 1}/${files.length}]: ${file}`);
      console.log('═'.repeat(60));

      try {
        // Lê o arquivo JSON
        const jsonContent = fs.readFileSync(filePath, 'utf-8');
        const videos: VideoJSON[] = JSON.parse(jsonContent);

        console.log(`📦 Vídeos no arquivo: ${videos.length}`);
        totalVideos += videos.length;

        // Processa cada vídeo
        for (let j = 0; j < videos.length; j++) {
          const video = videos[j];
          console.log(`\n[${j + 1}/${videos.length}] ${video.name}`);

          const success = await this.processVideo(video, undefined, file);

          if (success) {
            if (this.cache.videos[video.name]) {
              totalProcessed++;
            } else {
              totalSkipped++;
            }
          } else {
            totalErrors++;
          }

          // Delay para não ultrapassar rate limit da OpenAI
          if (j < videos.length - 1) {
            console.log('  ⏳ Aguardando 1 segundo...');
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        console.log(`\n✅ Arquivo ${file} processado!`);
      } catch (error) {
        console.error(`\n❌ Erro ao processar arquivo ${file}:`, error);
        totalErrors++;
      }
    }

    // Resumo final
    console.log('\n\n' + '═'.repeat(60));
    console.log('📊 RESUMO GERAL:');
    console.log('═'.repeat(60));
    console.log(`  📂 Arquivos JSON processados: ${files.length}`);
    console.log(`  📦 Total de vídeos: ${totalVideos}`);
    console.log(`  ✅ Novos vídeos processados: ${totalProcessed}`);
    console.log(`  ⏭️  Vídeos já processados (pulados): ${totalSkipped}`);
    console.log(`  ❌ Erros: ${totalErrors}`);
    console.log(`\n💾 Cache salvo em: ${CACHE_FILE}`);
    console.log(`  Total no cache: ${Object.keys(this.cache.videos).length} vídeos`);
    console.log('\n✨ Processamento concluído!');
  }

  /**
   * Processa múltiplos vídeos de um arquivo JSON
   */
  async processFromJSON(jsonPath: string): Promise<void> {
    console.log('🚀 Iniciando processamento de embeddings...\n');
    console.log(`📂 Arquivo: ${jsonPath}\n`);

    // Lê o arquivo JSON
    const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
    const videos: VideoJSON[] = JSON.parse(jsonContent);

    console.log(`📦 Total de vídeos: ${videos.length}\n`);
    console.log('═'.repeat(60));

    // Processa cada vídeo
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let consecutiveErrors = 0; // Contador de erros consecutivos
    const MAX_CONSECUTIVE_ERRORS = 3;
    let i = 0;
    const jsonFileName = path.basename(jsonPath);

    for (i = 0; i < videos.length; i++) {
      const video = videos[i];
      console.log(`\n[${i + 1}/${videos.length}]`);

      const success = await this.processVideo(video, undefined, jsonFileName);
      
      if (success) {
        if (this.isVideoProcessed(video.name)) {
          successCount++;
          consecutiveErrors = 0; // Reset contador em caso de sucesso
        } else {
          skippedCount++;
        }
      } else {
        errorCount++;
        consecutiveErrors++;

        // Verifica se atingiu o limite de erros consecutivos
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error('\n' + '═'.repeat(60));
          console.error(`\n🛑 PROCESSAMENTO INTERROMPIDO!`);
          console.error(`   ${MAX_CONSECUTIVE_ERRORS} erros consecutivos detectados.`);
          console.error(`   Verifique a configuração do Supabase e tente novamente.\n`);
          console.error('💡 Dica: Certifique-se de que:');
          console.error('   1. A tabela "stock_videos" existe no Supabase');
          console.error('   2. As variáveis SUPABASE_URL e SUPABASE_PUBLISH_KEY estão corretas');
          console.error('   3. As políticas RLS estão configuradas corretamente\n');
          break;
        }
      }
      
      // Delay para não ultrapassar rate limit da OpenAI
      if (i < videos.length - 1 && !this.isVideoProcessed(videos[i + 1].name)) {
        console.log('  ⏳ Aguardando 1 segundo...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Resumo final
    console.log('\n' + '═'.repeat(60));
    console.log('\n📊 RESUMO FINAL:');
    console.log(`  ✅ Novos vídeos processados: ${successCount}`);
    console.log(`  ⏭️  Vídeos já processados (pulados): ${skippedCount}`);
    console.log(`  ❌ Erros: ${errorCount}`);
    console.log(`  📦 Total processado: ${i}/${videos.length}`);
    
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      console.log(`  ⚠️  Interrompido devido a erros consecutivos`);
    } else {
      console.log('\n✨ Processamento concluído!');
    }
  }

  /**
   * Processa vídeos que já estão no Supabase mas não têm embedding
   */
  async processFromSupabase(): Promise<void> {
    console.log('🚀 Gerando embeddings para vídeos no Supabase...\n');

    // Busca todos os vídeos
    const videos = await this.supabase.listVideos(0, 10000);
    
    // Filtra os que não têm embedding
    const videosWithoutEmbedding = videos.filter(v => !v.embedding_cache);

    console.log(`📦 Total de vídeos: ${videos.length}`);
    console.log(`🔍 Vídeos sem embedding: ${videosWithoutEmbedding.length}\n`);

    if (videosWithoutEmbedding.length === 0) {
      console.log('✅ Todos os vídeos já têm embeddings!');
      return;
    }

    console.log('═'.repeat(60));

    // Processa cada vídeo sem embedding
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < videosWithoutEmbedding.length; i++) {
      const video = videosWithoutEmbedding[i];
      console.log(`\n[${i + 1}/${videosWithoutEmbedding.length}]`);
      console.log(`📹 Processando: ${video.name}`);

      try {
        // Criar super texto
        const superText = this.createSuperText(video as VideoJSON);
        
        // Gerar embedding
        const embedding = await this.generateEmbedding(superText);
        console.log(`  → Embedding gerado (${embedding.length} dimensões)`);

        // Atualizar no Supabase
        console.log('  → Atualizando no Supabase...');
        await this.supabase.updateVideo(video.id!, {
          embedding_cache: embedding,
        } as any);

        console.log('  ✅ Sucesso!');
        successCount++;

        // Delay
        if (i < videosWithoutEmbedding.length - 1) {
          console.log('  ⏳ Aguardando 1 segundo...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        errorCount++;
        console.error(`  ❌ Erro:`, error);
      }
    }

    // Resumo final
    console.log('\n' + '═'.repeat(60));
    console.log('\n📊 RESUMO FINAL:');
    console.log(`  ✅ Sucessos: ${successCount}`);
    console.log(`  ❌ Erros: ${errorCount}`);
    console.log(`  📦 Total processado: ${videosWithoutEmbedding.length}`);
    console.log('\n✨ Processamento concluído!');
  }
}

// Executa o script
async function main() {
  try {
    const generator = new EmbeddingGenerator();
    
    const arg = process.argv[2];

    if (!arg) {
      console.error('❌ Uso incorreto!\n');
      console.log('Opções:');
      console.log('  1. Processar todos os JSONs de uma pasta:');
      console.log(`     npm run embeddings:generate -- --from-folder\n`);
      console.log('  2. Processar um JSON específico:');
      console.log('     npm run embeddings:generate <caminho-do-json>\n');
      console.log('  3. Processar vídeos já no Supabase:');
      console.log('     npm run embeddings:from-supabase\n');
      console.log(`📂 Pasta padrão: ${VIDEOS_FOLDER}`);
      console.log(`💾 Cache: ${CACHE_FILE}\n`);
      process.exit(1);
    }

    if (arg === '--from-folder') {
      await generator.processFromFolder();
    } else if (arg === '--from-supabase') {
      await generator.processFromSupabase();
    } else {
      if (!fs.existsSync(arg)) {
        console.error(`❌ Arquivo não encontrado: ${arg}`);
        process.exit(1);
      }
      await generator.processFromJSON(arg);
    }
  } catch (error) {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  }
}

main();
