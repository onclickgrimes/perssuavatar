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

  /**
   * Buscar referências de código - Encontra onde funções/classes são usadas
   * @param filePath - Caminho do arquivo fonte
   * @param content - Conteúdo do código para extrair símbolos
   * @param basePath - Diretório base para busca
   * @param maxDepth - Profundidade máxima de busca (níveis de referência)
   * @param targetSymbol - Símbolo específico clicado pelo usuário (opcional)
   */
  ipcMain.handle('knowledge:find-references', async (_event, options: {
    filePath: string;
    content: string;
    basePath: string;
    maxDepth?: number;
    targetSymbol?: string;  // Símbolo específico clicado pelo usuário
  }) => {
    const { exec } = require('child_process');
    const path = require('path');
    const fs = require('fs');
    
    const { filePath, content, basePath, maxDepth = 3, targetSymbol } = options;
    
    try {
      console.log(`\n🔍 [REFERENCES] Buscando referências para: ${path.basename(filePath)}`);
      console.log(`   Profundidade máxima: ${maxDepth} níveis`);
      
      // Se tiver um símbolo específico clicado, usar esse
      // Caso contrário, extrair símbolos do código
      let symbols: string[];
      
      if (targetSymbol && targetSymbol.length > 2) {
        // Usuário clicou em um símbolo específico - buscar definição e usos
        symbols = [targetSymbol];
        console.log(`   🎯 Símbolo alvo (clicado): "${targetSymbol}"`);
      } else {
        // Extrair símbolos do código (funções, classes, variáveis exportadas)
        symbols = extractSymbols(content);
        console.log(`   Símbolos extraídos: ${symbols.join(', ')}`);
      }
      
      if (symbols.length === 0) {
        return { success: true, data: { symbols: [], references: [], context: '' } };
      }
      
      // 2. Buscar referências para cada símbolo
      const allReferences: Array<{
        symbol: string;
        level: number;
        filePath: string;
        lineNumber: number;
        lineContent: string;
        isDefinition?: boolean;  // Marca se é a definição do símbolo
      }> = [];
      
      const visitedFiles = new Set<string>();
      visitedFiles.add(path.normalize(filePath)); // Não incluir o arquivo original
      
      // Função para buscar referências de um símbolo
      const findRefsForSymbol = (symbol: string, currentLevel: number): Promise<void> => {
        return new Promise((resolve) => {
          if (currentLevel > maxDepth) {
            resolve();
            return;
          }
          
          // Converter basePath para formato Windows se necessário
          const winBasePath = basePath.replace(/\//g, '\\');
          
          // Comando de busca - findstr é mais rápido que PowerShell no Windows
          const grepCommand = process.platform === 'win32'
            ? `findstr /S /N /C:"${symbol}" "${winBasePath}\\main\\*.ts" "${winBasePath}\\main\\*.tsx" "${winBasePath}\\renderer\\*.ts" "${winBasePath}\\renderer\\*.tsx" 2>nul`
            : `grep -rn "${symbol}" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" "${basePath}"`;
          
          
          exec(grepCommand, { maxBuffer: 1024 * 1024 * 10, timeout: 30000 }, (error: any, stdout: string, stderr: string) => {
            if (error && !stdout) {
              resolve();
              return;
            }
            
            // No Windows, linhas podem ter \r no final
            const lines = stdout.split('\n').map(l => l.replace(/\r$/, '').trim()).filter(l => l);
            console.log(`   [GREP] "${symbol}": ${lines.length} ocorrências encontradas`);
            
            const newFilesToSearch: string[] = [];
            
            for (const line of lines.slice(0, 30)) { // Limitar a 30 resultados por símbolo
              // Parse formato Windows: C:\path\file.ts:123: content
              // Parse formato Linux: /path/file.ts:123:content
              // Note: Windows paths have "C:" which contains a colon
              let match;
              
              if (process.platform === 'win32') {
                // Windows: procurar padrão drive:path:numero:content
                match = line.match(/^([A-Za-z]:\\[^:]+):(\d+):(.*)$/);
              } else {
                // Linux: /path:numero:content
                match = line.match(/^([^:]+):(\d+):(.*)$/);
              }
              
              if (!match) continue;
              
              const [, refPath, lineNum, lineContent] = match;
              const normalizedPath = path.normalize(refPath);
              
              // Ignorar node_modules, .git, e arquivos já visitados
              if (normalizedPath.includes('node_modules') || 
                  normalizedPath.includes('.git') ||
                  normalizedPath.includes('dist') ||
                  normalizedPath.includes('.next')) {
                continue;
              }
              
              // Verificar se a linha é uma definição do símbolo
              // Padrões para detectar definição: func name, name =, name:, etc
              const defPatterns = [
                `function\\s+${symbol}\\b`,           // function openExplanationWindow
                `class\\s+${symbol}\\b`,               // class MyClass  
                `const\\s+${symbol}\\s*[=:]`,          // const openExplanationWindow =
                `let\\s+${symbol}\\s*[=:]`,            // let var =
                `${symbol}\\s*:\\s*\\(`,               // openExplanationWindow: (  
                `${symbol}\\s*:\\s*async`,             // name: async
                `${symbol}\\s*:\\s*\\{`,               // tilt_head_right: { (propriedade de objeto)
                `${symbol}\\s*=\\s*\\(`,               // name = (
                `${symbol}\\s*=\\s*async`,             // name = async
                `${symbol}\\s*=\\s*function`,          // name = function
                `${symbol}\\s*=\\s*\\{`,               // name = { (objeto)
                `'${symbol}'\\s*:`,                    // 'name':
                `"${symbol}"\\s*:`,                    // "name":
              ];
              
              const defRegex = new RegExp(`(${defPatterns.join('|')})`, 'i');
              const isDefinition = defRegex.test(lineContent);
              
              // Se é targetSymbol (símbolo clicado), INCLUIR a definição (é o que queremos!)
              // Se não é targetSymbol, pular definições (queremos só usos)
              if (isDefinition && !targetSymbol) {
                continue;
              }
              
              // Log apenas definições encontradas (útil para debug)
              if (isDefinition) {
                console.log(`   ✅ [DEF] ${path.basename(normalizedPath)}:${lineNum} - definição encontrada`);
              }
              
              
              allReferences.push({
                symbol,
                level: currentLevel,
                filePath: normalizedPath,
                lineNumber: parseInt(lineNum),
                lineContent: lineContent.trim().substring(0, 300), // Limitar tamanho
                isDefinition
              });
              
              // Se ainda não visitamos este arquivo, adicionar para próximo nível
              if (!visitedFiles.has(normalizedPath) && currentLevel < maxDepth) {
                visitedFiles.add(normalizedPath);
                newFilesToSearch.push(normalizedPath);
              }
            }
            
            // Buscar recursivamente nos novos arquivos encontrados
            // MAS: Se targetSymbol está definido, NÃO fazer busca em cascata
            // (queremos apenas as referências do símbolo clicado, não de outros símbolos)
            if (!targetSymbol && currentLevel < maxDepth && newFilesToSearch.length > 0) {
              // Para o próximo nível, extrair símbolos dos arquivos que referenciam
              const promises = newFilesToSearch.slice(0, 5).map(async (newFile) => {
                try {
                  const newContent = await fs.promises.readFile(newFile, 'utf-8');
                  const newSymbols = extractSymbols(newContent);
                  for (const newSymbol of newSymbols.slice(0, 3)) {
                    await findRefsForSymbol(newSymbol, currentLevel + 1);
                  }
                } catch (e) {
                  // Ignorar erros de leitura
                }
              });
              Promise.all(promises).then(() => resolve());
            } else {
              resolve();
            }
          });
        });
      };
      
      // Buscar referências para cada símbolo principal
      for (const symbol of symbols.slice(0, 5)) { // Limitar a 5 símbolos principais
        await findRefsForSymbol(symbol, 1);
      }
      
      // 3. Formatar contexto para o LLM
      let context = `\n=== REFERÊNCIAS DE CÓDIGO (${allReferences.length} encontradas) ===\n\n`;
      context += `📄 Arquivo original: ${path.basename(filePath)}\n`;
      context += `🔗 Símbolos analisados: ${symbols.slice(0, 5).join(', ')}\n\n`;
      
      // Se é um símbolo clicado, mostrar primeiro a DEFINIÇÃO
      if (targetSymbol) {
        const definitions = allReferences.filter(r => r.isDefinition);
        if (definitions.length > 0) {
          context += `🎯 === DEFINIÇÃO DE "${targetSymbol}" ===\n`;
          for (const def of definitions.slice(0, 3)) {
            context += `📁 ${path.basename(def.filePath)} (linha ${def.lineNumber}):\n`;
            context += `   ${def.lineContent}\n\n`;
          }
        } else {
          context += `⚠️ Definição de "${targetSymbol}" não encontrada no projeto.\n\n`;
        }
        
        // Mostrar também onde é usado
        const usages = allReferences.filter(r => !r.isDefinition);
        if (usages.length > 0) {
          context += `📍 === ONDE "${targetSymbol}" É USADO ===\n`;
          const byFile = new Map<string, typeof usages>();
          for (const ref of usages) {
            const existing = byFile.get(ref.filePath) || [];
            existing.push(ref);
            byFile.set(ref.filePath, existing);
          }
          
          for (const [file, refs] of byFile) {
            context += `📁 ${path.basename(file)}:\n`;
            for (const ref of refs.slice(0, 5)) {
              context += `   L${ref.lineNumber}: ${ref.lineContent}\n`;
            }
            context += '\n';
          }
        }
      } else {
        // Agrupar por nível (modo tradicional)
        for (let level = 1; level <= maxDepth; level++) {
          const levelRefs = allReferences.filter(r => r.level === level);
          if (levelRefs.length === 0) continue;
          
          context += `--- Nível ${level}: Onde o código é usado ---\n`;
          
          // Agrupar por arquivo
          const byFile = new Map<string, typeof levelRefs>();
          for (const ref of levelRefs) {
            const existing = byFile.get(ref.filePath) || [];
            existing.push(ref);
            byFile.set(ref.filePath, existing);
          }
          
          for (const [file, refs] of byFile) {
            context += `\n📁 ${path.basename(file)}:\n`;
            for (const ref of refs.slice(0, 5)) {
              context += `   L${ref.lineNumber}: ${ref.lineContent}\n`;
            }
          }
          context += '\n';
        }
      }
      
      context += `=== FIM DAS REFERÊNCIAS ===\n`;
      
      console.log(`✅ [REFERENCES] Encontradas ${allReferences.length} referências em ${visitedFiles.size} arquivos`);
      
      return { 
        success: true, 
        data: { 
          symbols, 
          references: allReferences.slice(0, 50), // Limitar resposta
          context,
          filesVisited: visitedFiles.size
        } 
      };
    } catch (error: any) {
      console.error('❌ Erro ao buscar referências:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('✅ Knowledge handlers registrados');
}

/**
 * Extrai símbolos exportados de código TypeScript/JavaScript
 */
function extractSymbols(content: string): string[] {
  const symbols: string[] = [];
  
  // Funções exportadas: export function name, export async function name
  const exportFuncRegex = /export\s+(async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match;
  while ((match = exportFuncRegex.exec(content)) !== null) {
    symbols.push(match[2]);
  }
  
  // Classes exportadas: export class Name
  const exportClassRegex = /export\s+(default\s+)?class\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
  while ((match = exportClassRegex.exec(content)) !== null) {
    symbols.push(match[2]);
  }
  
  // Constantes/variáveis exportadas: export const name
  const exportConstRegex = /export\s+const\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
  while ((match = exportConstRegex.exec(content)) !== null) {
    symbols.push(match[1]);
  }
  
  // Métodos públicos de classe: public methodName(
  const publicMethodRegex = /public\s+(async\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  while ((match = publicMethodRegex.exec(content)) !== null) {
    if (!['constructor'].includes(match[2])) {
      symbols.push(match[2]);
    }
  }
  
  // Funções arrow exportadas: export const name = () =>
  const arrowExportRegex = /export\s+const\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(async\s*)?\([^)]*\)\s*(:\s*[^=]+)?\s*=>/g;
  while ((match = arrowExportRegex.exec(content)) !== null) {
    if (!symbols.includes(match[1])) {
      symbols.push(match[1]);
    }
  }
  
  return [...new Set(symbols)]; // Remover duplicatas
}

export default registerKnowledgeHandlers;
