/**
 * Knowledge Handlers - Handlers IPC para Base de Conhecimento
 * 
 * Gerencia a comunicação entre o renderer e o serviço de conhecimento
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import { getKnowledgeService, KnowledgeSource } from './services/knowledge-service';
import { getUserSettings } from './database';

/**
 * Obtém a janela principal da aplicação
 */
function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.find(w => !w.isDestroyed() && w.getTitle().includes('main')) || windows[0] || null;
}

/**
 * Registra todos os handlers IPC de conhecimento
 */
export function registerKnowledgeHandlers(): void {
  const knowledgeService = getKnowledgeService();

  // ============================================
  // CARREGAR CONFIGURAÇÕES SALVAS
  // ============================================
  
  // Carregar configurações de embedding do banco de dados
  try {
    const userSettings = getUserSettings();
    if (userSettings?.embeddingProvider) {
      console.log(`🧠 [INIT] Carregando provider de embedding salvo: ${userSettings.embeddingProvider}`);
      knowledgeService.setEmbeddingProvider(userSettings.embeddingProvider);
    }
    if (userSettings?.ollamaEmbeddingModel) {
      console.log(`🦙 [INIT] Carregando modelo Ollama salvo: ${userSettings.ollamaEmbeddingModel}`);
      knowledgeService.setOllamaModel(userSettings.ollamaEmbeddingModel);
    }
  } catch (e) {
    console.warn('⚠️ Erro ao carregar configurações de embedding:', e);
  }
  // ============================================
  // CRUD - KNOWLEDGE SOURCES
  // ============================================

  /**
   * Listar fontes de conhecimento de um assistente
   */
  ipcMain.handle('knowledge:list-sources', async (_event, assistantId: string) => {
    try {
      const sources = await knowledgeService.listSources(assistantId);
      return { success: true, data: sources };
    } catch (error: any) {
      console.error('❌ Erro ao listar fontes:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Obter uma fonte de conhecimento
   */
  ipcMain.handle('knowledge:get-source', async (_event, sourceId: number) => {
    try {
      const source = await knowledgeService.getSource(sourceId);
      return { success: true, data: source };
    } catch (error: any) {
      console.error('❌ Erro ao obter fonte:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Criar nova fonte de conhecimento
   */
  ipcMain.handle('knowledge:create-source', async (_event, source: Omit<KnowledgeSource, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const newSource = await knowledgeService.createSource(source);
      return { success: true, data: newSource };
    } catch (error: any) {
      console.error('❌ Erro ao criar fonte:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Atualizar fonte de conhecimento
   */
  ipcMain.handle('knowledge:update-source', async (_event, sourceId: number, updates: Partial<KnowledgeSource>) => {
    try {
      const updatedSource = await knowledgeService.updateSource(sourceId, updates);
      return { success: true, data: updatedSource };
    } catch (error: any) {
      console.error('❌ Erro ao atualizar fonte:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Deletar fonte de conhecimento
   */
  ipcMain.handle('knowledge:delete-source', async (_event, sourceId: number) => {
    try {
      const deleted = await knowledgeService.deleteSource(sourceId);
      return { success: true, data: deleted };
    } catch (error: any) {
      console.error('❌ Erro ao deletar fonte:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // SINCRONIZAÇÃO
  // ============================================

  /**
   * Sincronizar fonte de conhecimento (indexar arquivos)
   * @param sourceId - ID da fonte a sincronizar
   * @param forceFullSync - Se true, reindexar todos os arquivos ignorando cache
   */
  ipcMain.handle('knowledge:sync-source', async (_event, sourceId: number, forceFullSync: boolean = false) => {
    try {
      // Configurar callback de progresso
      const win = getMainWindow();
      knowledgeService.setProgressCallback((progress) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('knowledge:sync-progress', { sourceId, ...progress });
        }
      });

      const result = await knowledgeService.syncSource(sourceId, forceFullSync);
      return { success: result.success, data: result };
    } catch (error: any) {
      console.error('❌ Erro ao sincronizar fonte:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // BUSCA SEMÂNTICA
  // ============================================

  /**
   * Buscar conhecimento relevante para uma query
   */
  ipcMain.handle('knowledge:search', async (_event, assistantId: string, query: string, limit?: number) => {
    try {
      const chunks = await knowledgeService.search(assistantId, query, limit);
      return { success: true, data: chunks };
    } catch (error: any) {
      console.error('❌ Erro na busca:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Obter contexto de conhecimento formatado para prompt
   */
  ipcMain.handle('knowledge:get-context', async (_event, assistantId: string, query: string, maxTokens?: number) => {
    try {
      const context = await knowledgeService.getContextForQuery(assistantId, query, maxTokens);
      return { success: true, data: context };
    } catch (error: any) {
      console.error('❌ Erro ao obter contexto:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // ESTATÍSTICAS
  // ============================================

  /**
   * Obter estatísticas de conhecimento de um assistente
   */
  ipcMain.handle('knowledge:get-stats', async (_event, assistantId: string) => {
    try {
      const stats = await knowledgeService.getStats(assistantId);
      return { success: true, data: stats };
    } catch (error: any) {
      console.error('❌ Erro ao obter estatísticas:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // DIÁLOGOS DO SISTEMA
  // ============================================

  /**
   * Abrir diálogo para selecionar pasta
   */
  ipcMain.handle('knowledge:select-folder', async () => {
    try {
      const win = getMainWindow();
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openDirectory'],
        title: 'Selecionar Pasta de Conhecimento',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      return { success: true, data: result.filePaths[0] };
    } catch (error: any) {
      console.error('❌ Erro ao abrir diálogo:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Abrir diálogo para selecionar arquivos
   */
  ipcMain.handle('knowledge:select-files', async () => {
    try {
      const win = getMainWindow();
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openFile', 'multiSelections'],
        title: 'Selecionar Arquivos de Conhecimento',
        filters: [
          { name: 'Código', extensions: ['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'cs', 'go', 'rs', 'rb', 'php', 'vue', 'svelte'] },
          { name: 'Documentos', extensions: ['md', 'txt', 'json', 'yaml', 'yml', 'toml'] },
          { name: 'Web', extensions: ['html', 'css', 'scss', 'sql'] },
          { name: 'Todos', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      return { success: true, data: result.filePaths };
    } catch (error: any) {
      console.error('❌ Erro ao abrir diálogo:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // CONFIGURAÇÃO DE EMBEDDING
  // ============================================

  /**
   * Configurar provider de embeddings
   */
  ipcMain.handle('set-embedding-provider', async (_event, provider: 'openai' | 'ollama') => {
    try {
      knowledgeService.setEmbeddingProvider(provider);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Erro ao configurar provider de embedding:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Configurar modelo Ollama para embeddings
   */
  ipcMain.handle('set-ollama-embedding-model', async (_event, model: string) => {
    try {
      knowledgeService.setOllamaModel(model);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Erro ao configurar modelo Ollama:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Obter provider de embedding atual
   */
  ipcMain.handle('get-embedding-provider', async () => {
    try {
      const provider = knowledgeService.getEmbeddingProvider();
      return { success: true, data: provider };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Verificar se Ollama está instalado no sistema
   */
  ipcMain.handle('check-ollama-installed', async () => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      exec('ollama --version', (error: any) => {
        if (error) {
          resolve({ success: true, installed: false });
        } else {
          resolve({ success: true, installed: true });
        }
      });
    });
  });

  /**
   * Baixar modelo do Ollama via comando 'ollama pull'
   */
  ipcMain.handle('ollama-pull-model', async (event, modelName: string) => {
    const { spawn } = require('child_process');
    
    return new Promise((resolve) => {
      console.log(`🦙 Iniciando download do modelo: ${modelName}`);
      
      const ollama = spawn('ollama', ['pull', modelName], {
        shell: true
      });

      let lastProgress = '';

      ollama.stdout.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        if (output && output !== lastProgress) {
          lastProgress = output;
          // Enviar progresso para o renderer
          const mainWindow = getMainWindow();
          if (mainWindow) {
            mainWindow.webContents.send('ollama-pull-progress', {
              model: modelName,
              progress: output
            });
          }
        }
      });

      ollama.stderr.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        if (output && output !== lastProgress) {
          lastProgress = output;
          // Ollama usa stderr para progresso também
          const mainWindow = getMainWindow();
          if (mainWindow) {
            mainWindow.webContents.send('ollama-pull-progress', {
              model: modelName,
              progress: output
            });
          }
        }
      });

      ollama.on('close', (code: number) => {
        if (code === 0) {
          console.log(`✅ Modelo ${modelName} baixado com sucesso!`);
          resolve({ success: true, model: modelName });
        } else {
          console.error(`❌ Erro ao baixar modelo (código: ${code})`);
          resolve({ success: false, error: `Erro ao baixar modelo (código: ${code})` });
        }
      });

      ollama.on('error', (err: any) => {
        console.error('❌ Erro ao executar ollama:', err);
        resolve({ success: false, error: err.message });
      });
    });
  });

  /**
   * Listar modelos instalados no Ollama
   */
  ipcMain.handle('ollama-list-models', async () => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      exec('ollama list', (error: any, stdout: string) => {
        if (error) {
          resolve({ success: false, error: error.message });
          return;
        }
        
        // Parse da saída (formato: NAME ID SIZE MODIFIED)
        const lines = stdout.trim().split('\n').slice(1); // Pula header
        const models = lines.map((line: string) => {
          const parts = line.split(/\s+/);
          return parts[0]; // Nome do modelo
        }).filter((m: string) => m);
        
        resolve({ success: true, data: models });
      });
    });
  });

  console.log('✅ Knowledge handlers registrados');
}

export default registerKnowledgeHandlers;
