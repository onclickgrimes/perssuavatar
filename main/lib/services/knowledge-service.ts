/**
 * Knowledge Service - Serviço de Base de Conhecimento
 * 
 * Gerencia a indexação e busca semântica de documentos/código
 * para enriquecer as respostas dos assistentes via RAG.
 */

import { OpenAI } from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import db from '../../../db';

// pdf-parse para extração de texto de PDFs
let pdfParse: any = null;
try {
  pdfParse = require('pdf-parse');
} catch (e) {
  console.warn('⚠️ pdf-parse não disponível. PDFs não serão processados.');
}

// ============================================
// TIPOS
// ============================================

export interface KnowledgeSource {
  id?: number;
  assistant_id: string;
  name: string;
  path: string;
  type: 'folder' | 'file';
  extensions?: string[];
  excludes?: string[];
  use_gitignore?: boolean; // Usar .gitignore para excluir arquivos
  file_count?: number;
  chunk_count?: number;
  is_synced?: boolean;
  last_synced_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface KnowledgeChunk {
  id?: number;
  source_id: number;
  file_path: string;
  file_name: string;
  content: string;
  chunk_index: number;
  start_line?: number;
  end_line?: number;
  embedding?: number[];
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface SyncProgress {
  total: number;
  current: number;
  currentFile: string;
  stage: 'scanning' | 'reading' | 'chunking' | 'embedding' | 'saving' | 'done' | 'comparing';
}

export interface SyncResult {
  success: boolean;
  files: number;
  chunks: number;
  added: number;
  updated: number;
  deleted: number;
  skipped: number;
  error?: string;
}

// ============================================
// CONFIGURAÇÕES
// ============================================

const CHUNK_SIZE = 1000; // Tamanho máximo de cada chunk em caracteres
const CHUNK_OVERLAP = 100; // Sobreposição entre chunks
const MAX_FILES_PER_BATCH = 10; // Arquivos por batch para gerar embeddings
const EMBEDDING_MODEL = 'text-embedding-3-small';

// ⚠️ LIMITES DE SEGURANÇA para evitar gastos excessivos
const MAX_FILE_SIZE_BYTES = 500 * 1024; // 500KB máximo por arquivo
const MAX_LINE_LENGTH = 1000; // Linhas muito longas = arquivo minificado
const MAX_CHUNKS_PER_FILE = 100; // Limite de chunks por arquivo
const MAX_TOTAL_TOKENS_ESTIMATE = 500000; // ~500k tokens por sync (estimativa)

// Extensões de código suportadas por padrão
// NOTA: .json removido por padrão (arquivos grandes como package-lock.json)
const DEFAULT_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cs', '.go',
  '.rs', '.rb', '.php', '.vue', '.svelte', '.html', '.css',
  '.md', '.txt', '.yaml', '.yml', '.toml', '.sql',
  '.pdf' // Suporte a PDFs
];

// Padrões a excluir por padrão
const DEFAULT_EXCLUDES = [
  // JavaScript/Node
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  // Python
  '__pycache__', '.venv', 'venv', 'env',
  // PHP - IMPORTANTE!
  'vendor', 'composer.lock',
  // IDEs
  '.idea', '.vscode',
  // Lock files (muito grandes, pouco úteis)
  '*.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  // Arquivos minificados
  '*.min.js', '*.min.css',
  // Mapas de source
  '*.map',
  // Logs
  '*.log', 'logs',
  // Cache
  '.cache', '.tmp', 'tmp',
];

// ===========================================
// CLASSE PRINCIPAL
// ===========================================

class KnowledgeService {
  private openai: OpenAI | null = null;
  private progressCallback: ((progress: SyncProgress) => void) | null = null;
  private embeddingProvider: 'openai' | 'ollama' = 'openai';
  private ollamaModel: string = 'nomic-embed-text';
  private ollamaBaseUrl: string = 'http://localhost:11434';

  constructor() {
    this.initOpenAI();
  }

  private initOpenAI(): void {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  private ensureOpenAI(): OpenAI {
    if (!this.openai) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY não encontrada. Configure no arquivo .env');
      }
      this.openai = new OpenAI({ apiKey });
    }
    return this.openai;
  }

  // ============================================
  // CONFIGURAÇÃO DE PROVIDER
  // ============================================

  /**
   * Define o provider de embeddings (openai ou ollama)
   */
  setEmbeddingProvider(provider: 'openai' | 'ollama'): void {
    const oldProvider = this.embeddingProvider;
    this.embeddingProvider = provider;
    console.log('\n🧠 ========================================');
    console.log(`🧠 PROVIDER DE EMBEDDING ALTERADO`);
    console.log(`🧠 De: ${oldProvider.toUpperCase()} → Para: ${provider.toUpperCase()}`);
    if (provider === 'ollama') {
      console.log(`🦙 Modelo atual: ${this.ollamaModel}`);
      console.log(`🦙 URL: ${this.ollamaBaseUrl}`);
    }
    console.log('🧠 ========================================\n');
  }

  /**
   * Define o modelo do Ollama para embeddings
   */
  setOllamaModel(model: string): void {
    const oldModel = this.ollamaModel;
    this.ollamaModel = model;
    console.log('\n🦙 ========================================');
    console.log(`🦙 MODELO OLLAMA ALTERADO`);
    console.log(`🦙 De: ${oldModel} → Para: ${model}`);
    console.log('🦙 ========================================\n');
  }

  /**
   * Retorna o provider atual
   */
  getEmbeddingProvider(): 'openai' | 'ollama' {
    return this.embeddingProvider;
  }

  // ============================================
  // CRUD - KNOWLEDGE SOURCES
  // ============================================

  /**
   * Lista todas as fontes de conhecimento de um assistente
   */
  async listSources(assistantId: string): Promise<KnowledgeSource[]> {
    const rows = await db('knowledge_sources')
      .where('assistant_id', assistantId)
      .orderBy('created_at', 'desc');

    return rows.map((row: any) => ({
      ...row,
      extensions: row.extensions ? JSON.parse(row.extensions) : DEFAULT_EXTENSIONS,
      excludes: row.excludes ? JSON.parse(row.excludes) : DEFAULT_EXCLUDES,
    }));
  }

  /**
   * Obtém uma fonte de conhecimento por ID
   */
  async getSource(id: number): Promise<KnowledgeSource | null> {
    const row = await db('knowledge_sources').where('id', id).first();
    if (!row) return null;

    return {
      ...row,
      extensions: row.extensions ? JSON.parse(row.extensions) : DEFAULT_EXTENSIONS,
      excludes: row.excludes ? JSON.parse(row.excludes) : DEFAULT_EXCLUDES,
    };
  }

  /**
   * Cria uma nova fonte de conhecimento
   */
  async createSource(source: Omit<KnowledgeSource, 'id' | 'created_at' | 'updated_at'>): Promise<KnowledgeSource> {
    const [id] = await db('knowledge_sources').insert({
      assistant_id: source.assistant_id,
      name: source.name,
      path: source.path,
      type: source.type || 'folder',
      extensions: JSON.stringify(source.extensions || DEFAULT_EXTENSIONS),
      excludes: JSON.stringify(source.excludes || DEFAULT_EXCLUDES),
      use_gitignore: source.use_gitignore !== false, // true por padrão
      file_count: 0,
      chunk_count: 0,
      is_synced: false,
    });

    return this.getSource(id) as Promise<KnowledgeSource>;
  }

  /**
   * Atualiza uma fonte de conhecimento
   */
  async updateSource(id: number, updates: Partial<KnowledgeSource>): Promise<KnowledgeSource | null> {
    const updateData: any = { ...updates, updated_at: new Date().toISOString() };
    
    if (updates.extensions) {
      updateData.extensions = JSON.stringify(updates.extensions);
    }
    if (updates.excludes) {
      updateData.excludes = JSON.stringify(updates.excludes);
    }

    await db('knowledge_sources').where('id', id).update(updateData);
    return this.getSource(id);
  }

  /**
   * Remove uma fonte de conhecimento e seus chunks
   */
  async deleteSource(id: number): Promise<boolean> {
    // 1. Primeiro deletar todos os chunks relacionados
    const chunksDeleted = await db('knowledge_chunks').where('source_id', id).del();
    console.log(`🗑️ Deletados ${chunksDeleted} chunks da fonte #${id}`);

    // 2. Depois deletar a fonte
    const deleted = await db('knowledge_sources').where('id', id).del();
    return deleted > 0;
  }

  // ============================================
  // SINCRONIZAÇÃO E INDEXAÇÃO
  // ============================================

  /**
   * Define callback para progresso da sincronização
   */
  setProgressCallback(callback: (progress: SyncProgress) => void): void {
    this.progressCallback = callback;
  }

  /**
   * Calcula o hash MD5 do conteúdo de um arquivo
   */
  private calculateFileHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Obtém os hashes dos arquivos já indexados para uma fonte
   */
  private async getIndexedFileHashes(sourceId: number): Promise<Map<string, string>> {
    const chunks = await db('knowledge_chunks')
      .where('source_id', sourceId)
      .where('chunk_index', 0) // Pegar apenas o primeiro chunk de cada arquivo
      .select('file_path', 'metadata');

    const hashMap = new Map<string, string>();
    for (const chunk of chunks) {
      try {
        const metadata = chunk.metadata ? JSON.parse(chunk.metadata) : {};
        if (metadata.file_hash) {
          hashMap.set(chunk.file_path, metadata.file_hash);
        }
      } catch (e) {
        // Ignorar erros de parse
      }
    }
    return hashMap;
  }

  /**
   * Sincroniza uma fonte de conhecimento (indexa apenas arquivos novos/alterados)
   */
  async syncSource(sourceId: number, forceFullSync: boolean = false): Promise<SyncResult> {
    const source = await this.getSource(sourceId);
    if (!source) {
      return { success: false, files: 0, chunks: 0, added: 0, updated: 0, deleted: 0, skipped: 0, error: 'Fonte não encontrada' };
    }

    try {
      this.ensureOpenAI();

      // 1. Escanear arquivos atuais
      this.emitProgress({ total: 0, current: 0, currentFile: '', stage: 'scanning' });
      const currentFiles = await this.scanFiles(source);
      console.log(`📁 Encontrados ${currentFiles.length} arquivos no diretório`);

      // 2. Obter hashes dos arquivos já indexados
      this.emitProgress({ total: 0, current: 0, currentFile: '', stage: 'comparing' });
      const indexedHashes = forceFullSync ? new Map<string, string>() : await this.getIndexedFileHashes(sourceId);
      const indexedFiles = new Set(indexedHashes.keys());
      console.log(`� ${indexedHashes.size} arquivos já indexados`);

      // 3. Categorizar arquivos
      const filesToAdd: string[] = [];
      const filesToUpdate: string[] = [];
      const filesToDelete: string[] = [];
      const filesToSkip: string[] = [];

      // Verificar arquivos atuais
      for (const filePath of currentFiles) {
        const content = await this.readFileContent(filePath);
        if (!content || content.trim().length === 0) {
          continue; // Ignorar arquivos vazios
        }

        const currentHash = this.calculateFileHash(content);

        if (!indexedHashes.has(filePath)) {
          // Arquivo novo
          filesToAdd.push(filePath);
        } else if (indexedHashes.get(filePath) !== currentHash) {
          // Arquivo modificado
          filesToUpdate.push(filePath);
        } else {
          // Arquivo não alterado
          filesToSkip.push(filePath);
        }
      }

      // Verificar arquivos deletados
      const currentFilesSet = new Set(currentFiles);
      for (const indexedFile of indexedFiles) {
        if (!currentFilesSet.has(indexedFile)) {
          filesToDelete.push(indexedFile);
        }
      }

      console.log(`📊 Resumo: +${filesToAdd.length} novos, ~${filesToUpdate.length} alterados, -${filesToDelete.length} deletados, =${filesToSkip.length} inalterados`);

      // 4. Se não há nada para sincronizar
      if (filesToAdd.length === 0 && filesToUpdate.length === 0 && filesToDelete.length === 0) {
        console.log('✨ Base de conhecimento já está atualizada!');
        await this.updateSource(sourceId, {
          is_synced: true,
          last_synced_at: new Date().toISOString(),
        });
        return { 
          success: true, 
          files: currentFiles.length, 
          chunks: 0, 
          added: 0, 
          updated: 0, 
          deleted: 0, 
          skipped: filesToSkip.length 
        };
      }

      // 5. Deletar chunks de arquivos removidos ou que serão atualizados
      const filesToRemoveChunks = [...filesToDelete, ...filesToUpdate];
      if (filesToRemoveChunks.length > 0) {
        await db('knowledge_chunks')
          .where('source_id', sourceId)
          .whereIn('file_path', filesToRemoveChunks)
          .del();
        console.log(`🗑️ Removidos chunks de ${filesToRemoveChunks.length} arquivos`);
      }

      // 6. Preparar lista de arquivos para processar
      const filesToProcess = [...filesToAdd, ...filesToUpdate];

      // 7. Processar cada arquivo (novo ou alterado)
      let totalChunks = 0;
      let totalTokensEstimate = 0; // Estimativa de tokens para monitoramento
      const fileContentCache = new Map<string, { content: string; hash: string }>();
      
      // Pré-carregar conteúdo dos arquivos a processar
      console.log(`📊 Pré-carregando ${filesToProcess.length} arquivos...`);
      for (const filePath of filesToProcess) {
        const content = await this.readFileContent(filePath);
        if (content && content.trim().length > 0) {
          fileContentCache.set(filePath, {
            content,
            hash: this.calculateFileHash(content)
          });

          // Estimar tokens (1 token ≈ 4 caracteres para inglês, 3 para código)
          const tokensEstimate = Math.ceil(content.length / 3);
          totalTokensEstimate += tokensEstimate;
        }
      }

      // ⚠️ ALERTA DE SEGURANÇA: Verificar estimativa de tokens
      console.log(`💰 Estimativa de tokens para embedding: ~${totalTokensEstimate.toLocaleString()} tokens`);
      if (totalTokensEstimate > MAX_TOTAL_TOKENS_ESTIMATE) {
        console.warn(`🚨 ALERTA: Estimativa de tokens (${totalTokensEstimate.toLocaleString()}) excede limite seguro (${MAX_TOTAL_TOKENS_ESTIMATE.toLocaleString()})!`);
        console.warn(`   Considere reduzir o número de arquivos ou aumentar as exclusões.`);
      }

      for (let i = 0; i < filesToProcess.length; i++) {
        const filePath = filesToProcess[i];
        const fileName = path.basename(filePath);
        const cached = fileContentCache.get(filePath);

        if (!cached) {
          console.warn(`⚠️ Arquivo vazio ou não processável: ${fileName}`);
          continue;
        }

        this.emitProgress({
          total: filesToProcess.length,
          current: i + 1,
          currentFile: fileName,
          stage: 'reading',
        });

        try {
          const { content, hash } = cached;

          // Criar chunks
          this.emitProgress({
            total: filesToProcess.length,
            current: i + 1,
            currentFile: fileName,
            stage: 'chunking',
          });
          const chunks = this.createChunks(content, filePath);

          // Adicionar hash aos metadados dos chunks
          for (const chunk of chunks) {
            chunk.metadata = {
              ...chunk.metadata,
              file_hash: hash,
            };
          }

          // Gerar embeddings
          this.emitProgress({
            total: filesToProcess.length,
            current: i + 1,
            currentFile: fileName,
            stage: 'embedding',
          });
          const chunksWithEmbeddings = await this.generateEmbeddings(chunks);

          // Salvar no banco
          this.emitProgress({
            total: filesToProcess.length,
            current: i + 1,
            currentFile: fileName,
            stage: 'saving',
          });

          for (const chunk of chunksWithEmbeddings) {
            await db('knowledge_chunks').insert({
              source_id: sourceId,
              file_path: chunk.file_path,
              file_name: chunk.file_name,
              content: chunk.content,
              chunk_index: chunk.chunk_index,
              start_line: chunk.start_line,
              end_line: chunk.end_line,
              embedding: JSON.stringify(chunk.embedding),
              metadata: JSON.stringify(chunk.metadata || {}),
            });
          }

          totalChunks += chunksWithEmbeddings.length;
          console.log(`✅ ${fileName}: ${chunksWithEmbeddings.length} chunks`);
        } catch (error) {
          console.error(`❌ Erro ao processar ${filePath}:`, error);
        }

        // Delay para evitar rate limit da OpenAI
        if (i < filesToProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      // 8. Contar chunks existentes (incluindo os não alterados)
      const existingChunksCount = await db('knowledge_chunks')
        .where('source_id', sourceId)
        .count('* as count')
        .first();
      const totalChunksInDb = existingChunksCount?.count || 0;

      // 9. Atualizar fonte
      await this.updateSource(sourceId, {
        file_count: currentFiles.length,
        chunk_count: Number(totalChunksInDb),
        is_synced: true,
        last_synced_at: new Date().toISOString(),
      });

      this.emitProgress({
        total: filesToProcess.length,
        current: filesToProcess.length,
        currentFile: '',
        stage: 'done',
      });

      console.log(`✨ Sincronização concluída: +${filesToAdd.length} novos, ~${filesToUpdate.length} alterados, ${totalChunks} chunks processados`);
      return { 
        success: true, 
        files: currentFiles.length, 
        chunks: totalChunks, 
        added: filesToAdd.length, 
        updated: filesToUpdate.length, 
        deleted: filesToDelete.length, 
        skipped: filesToSkip.length 
      };
    } catch (error: any) {
      console.error('❌ Erro na sincronização:', error);
      return { success: false, files: 0, chunks: 0, added: 0, updated: 0, deleted: 0, skipped: 0, error: error.message };
    }
  }

  /**
   * Lê e parseia o arquivo .gitignore
   */
  private readGitignore(basePath: string): string[] {
    const gitignorePath = path.join(basePath, '.gitignore');
    const patterns: string[] = [];

    try {
      if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        const lines = content.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          // Ignorar comentários e linhas vazias
          if (trimmed && !trimmed.startsWith('#')) {
            // Remover barra final se houver
            const pattern = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
            patterns.push(pattern);
          }
        }

        console.log(`📋 .gitignore encontrado: ${patterns.length} padrões`);
      }
    } catch (error) {
      console.warn('⚠️ Erro ao ler .gitignore:', error);
    }

    return patterns;
  }

  /**
   * Escaneia arquivos de uma fonte
   */
  private async scanFiles(source: KnowledgeSource): Promise<string[]> {
    const files: string[] = [];
    const extensions = source.extensions || DEFAULT_EXTENSIONS;
    let excludes = [...(source.excludes || DEFAULT_EXCLUDES)];

    // Adicionar padrões do .gitignore se habilitado
    if (source.use_gitignore !== false && source.type === 'folder') {
      const gitignorePatterns = this.readGitignore(source.path);
      excludes = [...new Set([...excludes, ...gitignorePatterns])];
    }

    const scanDir = async (dirPath: string): Promise<void> => {
      try {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          const relativePath = path.relative(source.path, fullPath);

          // Verificar exclusões
          const shouldExclude = excludes.some(pattern => {
            // Padrões glob simples
            if (pattern.startsWith('*')) {
              return entry.name.endsWith(pattern.slice(1));
            }
            if (pattern.startsWith('**')) {
              const suffix = pattern.slice(2);
              return relativePath.includes(suffix) || entry.name === suffix.replace(/^\//, '');
            }
            // Correspondência exata ou parcial
            return entry.name === pattern || 
                   relativePath === pattern ||
                   relativePath.startsWith(pattern + path.sep) ||
                   fullPath.includes(path.sep + pattern + path.sep);
          });

          if (shouldExclude) continue;

          if (entry.isDirectory()) {
            await scanDir(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (extensions.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ Não foi possível escanear: ${dirPath}`);
      }
    };

    if (source.type === 'folder') {
      await scanDir(source.path);
    } else {
      // Arquivo único
      if (fs.existsSync(source.path)) {
        files.push(source.path);
      }
    }

    return files;
  }

  /**
   * Divide o conteúdo de um arquivo em chunks
   */
  private createChunks(content: string, filePath: string): Omit<KnowledgeChunk, 'id' | 'source_id' | 'created_at' | 'updated_at'>[] {
    const lines = content.split('\n');
    const chunks: Omit<KnowledgeChunk, 'id' | 'source_id' | 'created_at' | 'updated_at'>[] = [];
    const fileName = path.basename(filePath);

    let currentChunk = '';
    let startLine = 0;
    let chunkIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const newContent = currentChunk + (currentChunk ? '\n' : '') + line;

      if (newContent.length > CHUNK_SIZE && currentChunk.length > 0) {
        // Salvar chunk atual
        chunks.push({
          file_path: filePath,
          file_name: fileName,
          content: currentChunk,
          chunk_index: chunkIndex,
          start_line: startLine + 1,
          end_line: i,
          metadata: { language: this.detectLanguage(filePath) },
        });

        chunkIndex++;
        
        // Começar novo chunk com overlap
        const overlapLines = Math.ceil(CHUNK_OVERLAP / 50); // Aproximadamente 50 chars por linha
        startLine = Math.max(0, i - overlapLines);
        currentChunk = lines.slice(startLine, i + 1).join('\n');
      } else {
        currentChunk = newContent;
      }
    }

    // Último chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        file_path: filePath,
        file_name: fileName,
        content: currentChunk,
        chunk_index: chunkIndex,
        start_line: startLine + 1,
        end_line: lines.length,
        metadata: { language: this.detectLanguage(filePath) },
      });
    }

    // ⚠️ Limitar número de chunks por arquivo
    if (chunks.length > MAX_CHUNKS_PER_FILE) {
      console.warn(`⚠️ Arquivo gerou muitos chunks (${chunks.length} > ${MAX_CHUNKS_PER_FILE}), truncando: ${fileName}`);
      return chunks.slice(0, MAX_CHUNKS_PER_FILE);
    }

    return chunks;
  }

  /**
   * Detecta a linguagem do arquivo pela extensão
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescript',
      '.js': 'javascript', '.jsx': 'javascript',
      '.py': 'python', '.java': 'java', '.cs': 'csharp',
      '.go': 'go', '.rs': 'rust', '.rb': 'ruby',
      '.php': 'php', '.vue': 'vue', '.svelte': 'svelte',
      '.html': 'html', '.css': 'css', '.scss': 'scss',
      '.md': 'markdown', '.json': 'json', '.yaml': 'yaml',
      '.sql': 'sql', '.sh': 'bash', '.txt': 'text',
      '.pdf': 'pdf',
    };
    return langMap[ext] || 'unknown';
  }

  /**
   * Lê o conteúdo de um arquivo, com suporte especial para PDFs
   * Inclui validações de segurança para evitar gastos excessivos
   */
  private async readFileContent(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);

    try {
      // 1. Verificar tamanho do arquivo ANTES de ler
      const stats = await fs.promises.stat(filePath);
      if (stats.size > MAX_FILE_SIZE_BYTES) {
        console.warn(`⚠️ Arquivo muito grande (${Math.round(stats.size / 1024)}KB > ${MAX_FILE_SIZE_BYTES / 1024}KB): ${fileName}`);
        return '';
      }

      // 2. Tratamento especial para PDFs
      if (ext === '.pdf') {
        if (!pdfParse) {
          console.warn(`⚠️ pdf-parse não disponível. Ignorando PDF: ${filePath}`);
          return '';
        }

        try {
          console.log(`📄 Extraindo texto do PDF: ${fileName}`);
          const dataBuffer = await fs.promises.readFile(filePath);
          const pdfData = await pdfParse(dataBuffer);
          
          // Limpar e normalizar o texto extraído
          let text = pdfData.text
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

          // Limitar tamanho do texto extraído do PDF
          if (text.length > MAX_FILE_SIZE_BYTES) {
            console.warn(`⚠️ PDF muito longo, truncando: ${fileName}`);
            text = text.substring(0, MAX_FILE_SIZE_BYTES);
          }

          console.log(`✅ PDF extraído: ${pdfData.numpages} páginas, ${text.length} caracteres`);
          return text;
        } catch (error) {
          console.error(`❌ Erro ao extrair texto do PDF ${filePath}:`, error);
          return '';
        }
      }

      // 3. Para outros arquivos, leitura normal como texto
      const content = await fs.promises.readFile(filePath, 'utf-8');

      // 4. Detectar arquivos minificados (linhas muito longas)
      const lines = content.split('\n');
      const avgLineLength = content.length / Math.max(1, lines.length);
      const maxLineInFile = Math.max(...lines.map(l => l.length));
      
      if (maxLineInFile > MAX_LINE_LENGTH * 5 || avgLineLength > MAX_LINE_LENGTH) {
        console.warn(`⚠️ Arquivo possivelmente minificado (linha máx: ${maxLineInFile} chars): ${fileName}`);
        return '';
      }

      return content;
    } catch (error: any) {
      // Erro ao ler arquivo (provavelmente binário)
      if (error.code === 'ERR_INVALID_ARG_VALUE' || error.message?.includes('encoding')) {
        console.warn(`⚠️ Arquivo binário ignorado: ${fileName}`);
      } else {
        console.error(`❌ Erro ao ler ${fileName}:`, error.message);
      }
      return '';
    }
  }

  /**
   * Gera embeddings para uma lista de chunks
   * Usa o provider configurado (OpenAI ou Ollama)
   */
  private async generateEmbeddings(
    chunks: Omit<KnowledgeChunk, 'id' | 'source_id' | 'created_at' | 'updated_at'>[]
  ): Promise<Omit<KnowledgeChunk, 'id' | 'source_id' | 'created_at' | 'updated_at'>[]> {
    console.log('\n🧠 ========================================');
    console.log('🧠 GERANDO EMBEDDINGS');
    console.log(`🧠 Provider configurado: ${this.embeddingProvider.toUpperCase()}`);
    console.log(`🧠 Total de chunks: ${chunks.length}`);
    console.log('🧠 ========================================\n');
    
    if (this.embeddingProvider === 'ollama') {
      console.log('🦙 Usando OLLAMA (local) para embeddings...');
      console.log(`🦙 Modelo: ${this.ollamaModel}`);
      console.log(`🦙 URL: ${this.ollamaBaseUrl}`);
      return this.generateEmbeddingsOllama(chunks);
    }
    console.log('☁️ Usando OPENAI (API) para embeddings...');
    return this.generateEmbeddingsOpenAI(chunks);
  }

  /**
   * Gera embeddings via OpenAI
   */
  private async generateEmbeddingsOpenAI(
    chunks: Omit<KnowledgeChunk, 'id' | 'source_id' | 'created_at' | 'updated_at'>[]
  ): Promise<Omit<KnowledgeChunk, 'id' | 'source_id' | 'created_at' | 'updated_at'>[]> {
    const openai = this.ensureOpenAI();
    const result: typeof chunks = [];

    // Processar em batches
    for (let i = 0; i < chunks.length; i += MAX_FILES_PER_BATCH) {
      const batch = chunks.slice(i, i + MAX_FILES_PER_BATCH);
      
      // Criar texto para embedding (inclui contexto do arquivo)
      const texts = batch.map(chunk => 
        `Arquivo: ${chunk.file_name}\nLinguagem: ${chunk.metadata?.language || 'unknown'}\n\n${chunk.content}`
      );

      try {
        const response = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: texts,
          encoding_format: 'float',
        });

        for (let j = 0; j < batch.length; j++) {
          result.push({
            ...batch[j],
            embedding: response.data[j].embedding,
          });
        }
      } catch (error) {
        console.error('❌ Erro ao gerar embeddings (OpenAI):', error);
        // Adicionar chunks sem embedding em caso de erro
        result.push(...batch);
      }
    }

    return result;
  }

  /**
   * Gera embeddings via Ollama (local)
   */
  private async generateEmbeddingsOllama(
    chunks: Omit<KnowledgeChunk, 'id' | 'source_id' | 'created_at' | 'updated_at'>[]
  ): Promise<Omit<KnowledgeChunk, 'id' | 'source_id' | 'created_at' | 'updated_at'>[]> {
    const result: typeof chunks = [];
    console.log(`🦙 [OLLAMA] Processando ${chunks.length} chunks localmente...`);
    let successCount = 0;
    let errorCount = 0;

    // Ollama processa um por vez (mas usa GPU)
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const text = `Arquivo: ${chunk.file_name}\nLinguagem: ${chunk.metadata?.language || 'unknown'}\n\n${chunk.content}`;

      try {
        console.log(`🦙 [OLLAMA] [${i + 1}/${chunks.length}] Gerando embedding para: ${chunk.file_name}`);
        const startTime = Date.now();
        
        const response = await fetch(`${this.ollamaBaseUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.ollamaModel,
            prompt: text
          }),
          signal: AbortSignal.timeout(30000) // 30s timeout
        });

        if (!response.ok) {
          throw new Error(`Ollama retornou ${response.status}`);
        }

        const data = await response.json();
        const elapsed = Date.now() - startTime;
        console.log(`🦙 [OLLAMA] ✅ Embedding gerado em ${elapsed}ms (tamanho: ${data.embedding?.length || 0} dimensões)`);
        
        result.push({
          ...chunk,
          embedding: data.embedding,
        });
        successCount++;
      } catch (error: any) {
        console.error(`🦙 [OLLAMA] ❌ Erro ao gerar embedding para ${chunk.file_name}:`, error.message);
        errorCount++;
        // Adicionar chunk sem embedding em caso de erro
        result.push(chunk);
      }
    }

    console.log(`\n🦙 [OLLAMA] ========================================`);
    console.log(`🦙 [OLLAMA] RESUMO: ${successCount} sucesso, ${errorCount} erros`);
    console.log(`🦙 [OLLAMA] ========================================\n`);

    return result;
  }

  /**
   * Gera embedding para uma única query (para busca)
   */
  private async generateQueryEmbedding(query: string): Promise<number[]> {
    console.log('\n🔍 ========================================');
    console.log('🔍 GERANDO EMBEDDING PARA BUSCA');
    console.log(`🔍 Provider: ${this.embeddingProvider.toUpperCase()}`);
    console.log(`🔍 Query: "${query.substring(0, 50)}..."`);
    console.log('🔍 ========================================');
    
    if (this.embeddingProvider === 'ollama') {
      try {
        console.log(`🦙 [OLLAMA] Gerando embedding da query com modelo: ${this.ollamaModel}`);
        const startTime = Date.now();
        
        const response = await fetch(`${this.ollamaBaseUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.ollamaModel,
            prompt: query
          }),
          signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) throw new Error(`Ollama retornou ${response.status}`);

        const data = await response.json();
        const elapsed = Date.now() - startTime;
        console.log(`🦙 [OLLAMA] ✅ Embedding da query gerado em ${elapsed}ms (${data.embedding?.length} dimensões)\n`);
        return data.embedding;
      } catch (error: any) {
        console.error('🦙 [OLLAMA] ❌ Erro, tentando fallback para OpenAI...', error.message);
        // Fallback para OpenAI
      }
    }

    // OpenAI
    const openai = this.ensureOpenAI();
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: query,
      encoding_format: 'float',
    });
    return response.data[0].embedding;
  }

  // ============================================
  // BUSCA SEMÂNTICA
  // ============================================

  /**
   * Busca chunks relevantes para uma query
   */
  async search(assistantId: string, query: string, limit: number = 5): Promise<KnowledgeChunk[]> {
    // Gerar embedding da query usando o provider configurado
    const queryEmbedding = await this.generateQueryEmbedding(query);

    // Buscar todas as fontes do assistente
    const sources = await this.listSources(assistantId);
    const sourceIds = sources.map(s => s.id);

    if (sourceIds.length === 0) {
      return [];
    }

    // Buscar todos os chunks das fontes
    const chunks = await db('knowledge_chunks')
      .whereIn('source_id', sourceIds as number[])
      .select('*');

    console.log(`\n🔎 [SEARCH] Total de chunks no banco: ${chunks.length}`);
    console.log(`🔎 [SEARCH] Query: "${query}"`);
    console.log(`🔎 [SEARCH] Query embedding dimensões: ${queryEmbedding.length}`);
    // ============================================
    // BUSCA LITERAL MELHORADA: Peso por Especificidade
    // ============================================
    // O problema: "function" aparece em milhares de chunks, mas "openExplanationWindow" é único.
    // Solução: Dar peso maior para palavras longas (mais específicas) e ignorar palavras muito genéricas.
    const queryLower = query.toLowerCase();
    
    // Lista de palavras genéricas de programação que aparecem em quase todo código
    // Estas não ajudam a diferenciar chunks, então são ignoradas
    const GENERIC_PROGRAMMING_WORDS = new Set([
      'function', 'const', 'let', 'var', 'class', 'interface', 'type', 'export', 'import',
      'return', 'async', 'await', 'new', 'this', 'that', 'null', 'undefined', 'true', 'false',
      'promise', 'string', 'number', 'boolean', 'object', 'array', 'void', 'any',
      'public', 'private', 'protected', 'static', 'readonly', 'abstract',
      'extends', 'implements', 'declare', 'default', 'module',
      'try', 'catch', 'throw', 'finally', 'error', 'log', 'console',
      'for', 'while', 'foreach', 'map', 'filter', 'reduce', 'find',
      'get', 'set', 'push', 'pop', 'shift', 'length', 'index',
      'callback', 'handler', 'listener', 'event', 'data', 'value', 'result', 'response',
      'props', 'state', 'use', 'react', 'component', 'render',
    ]);
    
    // Extrair palavras significativas da query
    const MIN_WORD_LENGTH = 3;
    const allQueryWords = queryLower
      .split(/[\s\-_.,;:!?()[\]{}'"]+/)  // Split em espaços e pontuação
      .filter(word => word.length >= MIN_WORD_LENGTH);
    
    // Separar palavras específicas (úteis) das genéricas
    const specificWords = allQueryWords.filter(w => !GENERIC_PROGRAMMING_WORDS.has(w));
    const genericWords = allQueryWords.filter(w => GENERIC_PROGRAMMING_WORDS.has(w));
    
    console.log(`\n🔍 [LITERAL] Análise da query:`);
    console.log(`   📌 Palavras específicas: [${specificWords.join(', ')}] (peso total)`);
    if (genericWords.length > 0) {
      console.log(`   ⚪ Palavras genéricas (ignoradas): [${genericWords.join(', ')}]`);
    }
    
    // Se não há palavras específicas, usar as genéricas mesmo (melhor que nada)
    const queryWords = specificWords.length > 0 ? specificWords : allQueryWords;
    
    // Função de peso baseada no comprimento da palavra
    // Palavras longas são mais específicas e recebem mais peso
    const getWordWeight = (word: string): number => {
      const len = word.length;
      if (len >= 15) return 3.0;  // Muito específico (ex: openExplanationWindow)
      if (len >= 10) return 2.0;  // Específico
      if (len >= 7) return 1.5;   // Moderado
      return 1.0;                  // Curto
    };
    
    // Calcular peso total das palavras da query
    const totalQueryWeight = queryWords.reduce((sum, w) => sum + getWordWeight(w), 0);
    
    // Função para calcular score de match ponderado por especificidade
    const calculateWeightedMatch = (text: string): { 
      matchedWeight: number; 
      matchedWords: string[];
      totalWeight: number;
    } => {
      const textLower = text.toLowerCase();
      const matchedWords: string[] = [];
      let matchedWeight = 0;
      
      for (const word of queryWords) {
        if (textLower.includes(word)) {
          matchedWords.push(word);
          matchedWeight += getWordWeight(word);
        }
      }
      
      return { matchedWeight, matchedWords, totalWeight: totalQueryWeight };
    };
    
    // Para compatibilidade com código existente
    const countMatchingWords = (text: string): { count: number; matched: string[] } => {
      const result = calculateWeightedMatch(text);
      return { count: result.matchedWords.length, matched: result.matchedWords };
    };
    
    // Encontrar chunks que contêm palavras ESPECÍFICAS da query
    const chunksWithLiteralMatch = chunks.filter((chunk: any) => {
      const { matchedWords } = calculateWeightedMatch((chunk.content || '') + ' ' + (chunk.file_name || ''));
      // Só conta como match se encontrar alguma palavra específica
      return matchedWords.some(w => specificWords.includes(w) || specificWords.length === 0);
    });
    
    if (chunksWithLiteralMatch.length > 0) {
      console.log(`🔍 [LITERAL] Encontrados ${chunksWithLiteralMatch.length} chunks com palavras específicas:`);
      
      // Mostrar os melhores matches (ordenados por peso ponderado)
      const sortedByWeight = chunksWithLiteralMatch
        .map((chunk: any) => {
          const { matchedWeight, matchedWords, totalWeight } = calculateWeightedMatch(
            (chunk.content || '') + ' ' + (chunk.file_name || '')
          );
          return { 
            chunk, 
            matchedWeight, 
            matchedWords,
            weightRatio: totalWeight > 0 ? matchedWeight / totalWeight : 0
          };
        })
        .sort((a, b) => b.matchedWeight - a.matchedWeight)
        .slice(0, 5);
      
      sortedByWeight.forEach((item: any, i: number) => {
        console.log(`   [${i+1}] ${item.chunk.file_name} (${item.chunk.start_line}-${item.chunk.end_line}) - peso: ${item.matchedWeight.toFixed(1)}/${totalQueryWeight.toFixed(1)} [${item.matchedWords.join(', ')}]`);
      });
    } else {
      console.warn(`⚠️ [LITERAL] NENHUM chunk contém as palavras específicas: [${queryWords.join(', ')}]`);
      console.warn(`   Isso pode significar que os arquivos com esses termos não foram indexados.`);
    }
    let dimensionMismatchCount = 0;
    
    // ============================================
    // BUSCA HÍBRIDA: Semântica + Keyword Boost Ponderado
    // ============================================
    // O modelo de embedding pode não capturar bem termos técnicos específicos.
    // Damos um boost proporcional ao PESO das palavras específicas encontradas.
    // Palavras longas/raras têm mais peso. Palavras genéricas (function, const) são ignoradas.
    // Boost máximo de 35% quando TODAS as palavras específicas são encontradas.
    const MAX_LITERAL_BOOST = 0.35;
    
    const chunksWithSimilarity = chunks
      .filter((chunk: any) => chunk.embedding)
      .map((chunk: any) => {
        const embedding = JSON.parse(chunk.embedding) as number[];
        
        // Log de diagnóstico para incompatibilidade de dimensões
        if (embedding.length !== queryEmbedding.length) {
          dimensionMismatchCount++;
          if (dimensionMismatchCount === 1) {
            console.warn(`⚠️ [SEARCH] INCOMPATIBILIDADE DE DIMENSÕES DETECTADA!`);
            console.warn(`   Query embedding: ${queryEmbedding.length} dimensões`);
            console.warn(`   Chunk embedding: ${embedding.length} dimensões`);
            console.warn(`   Chunk file: ${chunk.file_name}`);
            console.warn(`   Isso acontece quando você indexou com um provider (ex: OpenAI) e busca com outro (ex: Ollama).`);
            console.warn(`   SOLUÇÃO: Re-sincronize as fontes de conhecimento usando o mesmo provider.`);
          }
        }
        
        const semanticSimilarity = this.cosineSimilarity(queryEmbedding, embedding);
        
        // Verificar match literal por PALAVRAS PONDERADAS
        const { matchedWeight, matchedWords, totalWeight } = calculateWeightedMatch(
          (chunk.content || '') + ' ' + (chunk.file_name || '')
        );
        
        // Calcular weight ratio (proporção do peso encontrado vs peso total)
        const weightRatio = totalWeight > 0 ? matchedWeight / totalWeight : 0;
        const hasLiteralMatch = matchedWords.length > 0;
        
        // Score híbrido: similaridade semântica + boost proporcional ao peso
        // Se encontrou palavra de peso 3.0 de total 3.0 = 100% do boost
        // Se encontrou palavra de peso 1.0 de total 3.0 = 33% do boost
        const literalBoost = weightRatio * MAX_LITERAL_BOOST;
        const hybridScore = Math.min(1, semanticSimilarity + literalBoost);
        
        // ============================================
        // CALCULAR LINHA EXATA DO MATCH
        // ============================================
        // Encontra a linha exata onde a palavra mais específica aparece
        let matchLine = chunk.start_line; // Default: início do chunk
        
        if (hasLiteralMatch && matchedWords.length > 0) {
          const content = chunk.content || '';
          const lines = content.split('\n');
          
          // Priorizar palavras mais longas (mais específicas)
          const sortedWords = [...matchedWords].sort((a, b) => b.length - a.length);
          
          for (const word of sortedWords) {
            const wordLower = word.toLowerCase();
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(wordLower)) {
                matchLine = chunk.start_line + i;
                break;
              }
            }
            if (matchLine !== chunk.start_line) break; // Encontrou, parar
          }
        }
        
        return {
          ...chunk,
          embedding: undefined, // Remover embedding da resposta
          metadata: chunk.metadata ? JSON.parse(chunk.metadata) : {},
          similarity: hybridScore,      // Usar score híbrido
          semanticSimilarity,           // Guardar original para debug
          hasLiteralMatch,
          wordMatchCount: matchedWords.length,
          matchedWords,                 // Quais palavras foram encontradas
          matchedWeight,                // Peso das palavras encontradas
          weightRatio,                  // Proporção do peso encontrado
          match_line: matchLine,        // Linha exata onde o termo aparece
        };
      })
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, limit);
    
    if (dimensionMismatchCount > 0) {
      console.warn(`⚠️ [SEARCH] Total de ${dimensionMismatchCount} chunks com dimensões incompatíveis!`);
      console.warn(`   Os resultados podem ser ALEATÓRIOS porque a similaridade é 0 para todos.`);
    } else {
      const topResult = chunksWithSimilarity[0];
      console.log(`✅ [SEARCH] Busca híbrida completa. Top resultado:`);
      console.log(`   📄 ${topResult?.file_name} (${topResult?.start_line}-${topResult?.end_line})`);
      const boostInfo = topResult?.hasLiteralMatch 
        ? `SIM peso ${topResult.matchedWeight?.toFixed(1)}/${totalQueryWeight.toFixed(1)} +${(topResult.weightRatio * MAX_LITERAL_BOOST).toFixed(2)}`
        : 'NÃO';
      console.log(`   📊 Score híbrido: ${topResult?.similarity?.toFixed(4)} (semântico: ${topResult?.semanticSimilarity?.toFixed(4)}, literal: ${boostInfo})`);
      if (topResult?.matchedWords?.length > 0) {
        console.log(`   🔤 Palavras específicas encontradas: [${topResult.matchedWords.join(', ')}]`);
      }
    }
    
    // ============================================
    // DEBUG: Comparar resultados semânticos vs literais
    // ============================================
    const literalMatchesInResults = chunksWithSimilarity.filter((c: any) => c.hasLiteralMatch);
    if (literalMatchesInResults.length > 0) {
      console.log(`\n✅ [HÍBRIDO] ${literalMatchesInResults.length}/${limit} resultados contêm palavras da query (boost proporcional aplicado)`);
    } else if (chunksWithLiteralMatch.length > 0) {
      console.warn(`\n⚠️ [DEBUG] PROBLEMA: Existem ${chunksWithLiteralMatch.length} chunks com palavras da query, mas NENHUM apareceu nos top ${limit} resultados!`);
      
      // Calcular similaridade dos chunks literais para debug
      console.log(`   Calculando similaridade dos chunks com match literal...`);
      const literalChunksWithSim = chunks
        .filter((chunk: any) => {
          if (!chunk.embedding) return false;
          const { count } = countMatchingWords((chunk.content || '') + ' ' + (chunk.file_name || ''));
          return count > 0;
        })
        .map((chunk: any) => {
          const embedding = JSON.parse(chunk.embedding) as number[];
          const sim = this.cosineSimilarity(queryEmbedding, embedding);
          const { count, matched } = countMatchingWords((chunk.content || '') + ' ' + (chunk.file_name || ''));
          return { file_name: chunk.file_name, start_line: chunk.start_line, end_line: chunk.end_line, similarity: sim, wordCount: count, matched };
        })
        .sort((a: any, b: any) => b.similarity - a.similarity);
      
      literalChunksWithSim.slice(0, 3).forEach((c: any, i: number) => {
        console.log(`   [${i+1}] ${c.file_name} (${c.start_line}-${c.end_line}): similaridade = ${c.similarity.toFixed(4)}, palavras: ${c.wordCount}/${queryWords.length} [${c.matched.join(', ')}]`);
      });
      
      console.log(`   Top resultado semântico: ${chunksWithSimilarity[0]?.file_name} = ${chunksWithSimilarity[0]?.similarity?.toFixed(4)}`);
    }

    return chunksWithSimilarity;
  }

  /**
   * Calcula a similaridade de cosseno entre dois vetores
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Gera contexto de conhecimento para prompt do assistente
   */
  async getContextForQuery(assistantId: string, query: string, maxTokens: number = 2000): Promise<string> {
    const chunks = await this.search(assistantId, query, 5);

    if (chunks.length === 0) {
      return '';
    }

    let context = '=== CONHECIMENTO RELEVANTE ===\n\n';
    let tokenEstimate = 0;

    for (const chunk of chunks) {
      const chunkText = `📄 ${chunk.file_name} (linhas ${chunk.start_line}-${chunk.end_line}):\n\`\`\`${(chunk.metadata as any)?.language || ''}\n${chunk.content}\n\`\`\`\n\n`;
      const chunkTokens = Math.ceil(chunkText.length / 4); // Estimativa grosseira

      if (tokenEstimate + chunkTokens > maxTokens) break;

      context += chunkText;
      tokenEstimate += chunkTokens;
    }

    context += '=== FIM DO CONHECIMENTO ===\n';

    return context;
  }

  // ============================================
  // UTILITÁRIOS
  // ============================================

  private emitProgress(progress: SyncProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  /**
   * Obtém estatísticas de conhecimento de um assistente
   */
  async getStats(assistantId: string): Promise<{
    sources: number;
    files: number;
    chunks: number;
    syncedSources: number;
  }> {
    const sources = await this.listSources(assistantId);
    const totalFiles = sources.reduce((sum, s) => sum + (s.file_count || 0), 0);
    const totalChunks = sources.reduce((sum, s) => sum + (s.chunk_count || 0), 0);
    const syncedSources = sources.filter(s => s.is_synced).length;

    return {
      sources: sources.length,
      files: totalFiles,
      chunks: totalChunks,
      syncedSources,
    };
  }
}

// ============================================
// SINGLETON
// ============================================

let knowledgeServiceInstance: KnowledgeService | null = null;

export function getKnowledgeService(): KnowledgeService {
  if (!knowledgeServiceInstance) {
    knowledgeServiceInstance = new KnowledgeService();
  }
  return knowledgeServiceInstance;
}

export default KnowledgeService;
