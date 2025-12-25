import React, { useState, useEffect, useCallback } from 'react';

interface KnowledgeSource {
  id: number;
  assistant_id: string;
  name: string;
  path: string;
  type: 'folder' | 'file';
  extensions: string[];
  excludes: string[];
  use_gitignore: boolean;
  file_count: number;
  chunk_count: number;
  is_synced: boolean;
  last_synced_at: string | null;
}

interface SyncProgress {
  sourceId: number;
  total: number;
  current: number;
  currentFile: string;
  stage: 'scanning' | 'reading' | 'chunking' | 'embedding' | 'saving' | 'done';
}

interface KnowledgeTabProps {
  assistantId: string;
}

const STAGE_LABELS: Record<SyncProgress['stage'], string> = {
  scanning: 'Escaneando arquivos...',
  reading: 'Lendo arquivo...',
  chunking: 'Criando chunks...',
  embedding: 'Gerando embeddings...',
  saving: 'Salvando...',
  done: 'Concluído!',
};

const DEFAULT_EXCLUDES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
];

const DEFAULT_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cs', '.go',
  '.rs', '.rb', '.php', '.vue', '.svelte', '.html', '.css',
  '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.sql'
];

export default function KnowledgeTab({ assistantId }: KnowledgeTabProps) {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [syncingSourceId, setSyncingSourceId] = useState<number | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [stats, setStats] = useState<{ sources: number; files: number; chunks: number; syncedSources: number } | null>(null);
  
  // Modal de configuração
  const [configModalSource, setConfigModalSource] = useState<KnowledgeSource | null>(null);
  const [configExcludes, setConfigExcludes] = useState<string[]>([]);
  const [configExtensions, setConfigExtensions] = useState<string[]>([]);
  const [configUseGitignore, setConfigUseGitignore] = useState(true);
  const [newExclude, setNewExclude] = useState('');
  const [newExtension, setNewExtension] = useState('');

  // Modal de confirmação de exclusão
  const [deleteConfirmSource, setDeleteConfirmSource] = useState<KnowledgeSource | null>(null);

  // Carregar fontes e estatísticas
  const loadData = useCallback(async () => {
    if (!assistantId) return;
    
    setIsLoading(true);
    try {
      const [sourcesResult, statsResult] = await Promise.all([
        window.electron.knowledge.listSources(assistantId),
        window.electron.knowledge.getStats(assistantId),
      ]);

      if (sourcesResult.success) {
        setSources(sourcesResult.data);
      }
      if (statsResult.success) {
        setStats(statsResult.data);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setIsLoading(false);
    }
  }, [assistantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Listener de progresso de sincronização
  useEffect(() => {
    const unsubscribe = window.electron.knowledge.onSyncProgress((progress) => {
      setSyncProgress(progress);
      if (progress.stage === 'done') {
        setTimeout(() => {
          setSyncingSourceId(null);
          setSyncProgress(null);
          loadData();
        }, 1000);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [loadData]);

  // Adicionar nova pasta
  const handleAddFolder = async () => {
    const result = await window.electron.knowledge.selectFolder();
    if (result.success && result.data) {
      const folderPath = result.data;
      const folderName = folderPath.split(/[/\\]/).pop() || 'Nova Pasta';

      const createResult = await window.electron.knowledge.createSource({
        assistant_id: assistantId,
        name: folderName,
        path: folderPath,
        type: 'folder',
        excludes: DEFAULT_EXCLUDES,
        extensions: DEFAULT_EXTENSIONS,
      });

      if (createResult.success) {
        loadData();
      }
    }
  };

  // Sincronizar fonte
  const handleSync = async (sourceId: number) => {
    setSyncingSourceId(sourceId);
    setSyncProgress({ sourceId, total: 0, current: 0, currentFile: '', stage: 'scanning' });

    const result = await window.electron.knowledge.syncSource(sourceId);
    
    if (!result.success) {
      console.error('Erro na sincronização:', result.error);
      setSyncingSourceId(null);
      setSyncProgress(null);
    }
  };

  // Solicitar confirmação de exclusão
  const handleDeleteRequest = (source: KnowledgeSource) => {
    setDeleteConfirmSource(source);
  };

  // Confirmar exclusão
  const handleDeleteConfirm = async () => {
    if (!deleteConfirmSource) return;
    
    const result = await window.electron.knowledge.deleteSource(deleteConfirmSource.id);
    if (result.success) {
      loadData();
    }
    setDeleteConfirmSource(null);
  };

  // Cancelar exclusão
  const handleDeleteCancel = () => {
    setDeleteConfirmSource(null);
  };

  // Buscar conhecimento
  const handleSearch = async () => {
    if (!testQuery.trim()) return;

    setIsSearching(true);
    try {
      const result = await window.electron.knowledge.search(assistantId, testQuery, 5);
      if (result.success) {
        setTestResults(result.data);
      }
    } catch (error) {
      console.error('Erro na busca:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Abrir modal de configuração
  const openConfigModal = (source: KnowledgeSource) => {
    setConfigModalSource(source);
    setConfigExcludes([...source.excludes]);
    setConfigExtensions([...source.extensions]);
    setConfigUseGitignore(source.use_gitignore !== false);
    setNewExclude('');
    setNewExtension('');
  };

  // Fechar modal de configuração
  const closeConfigModal = () => {
    setConfigModalSource(null);
  };

  // Salvar configuração
  const handleSaveConfig = async () => {
    if (!configModalSource) return;

    const result = await window.electron.knowledge.updateSource(configModalSource.id, {
      excludes: configExcludes,
      extensions: configExtensions,
      use_gitignore: configUseGitignore,
    });

    if (result.success) {
      loadData();
      closeConfigModal();
    }
  };

  // Adicionar exclusão
  const handleAddExclude = () => {
    const value = newExclude.trim();
    if (value && !configExcludes.includes(value)) {
      setConfigExcludes([...configExcludes, value]);
      setNewExclude('');
    }
  };

  // Remover exclusão
  const handleRemoveExclude = (exclude: string) => {
    setConfigExcludes(configExcludes.filter(e => e !== exclude));
  };

  // Adicionar extensão
  const handleAddExtension = () => {
    let value = newExtension.trim().toLowerCase();
    if (!value.startsWith('.')) value = '.' + value;
    if (value.length > 1 && !configExtensions.includes(value)) {
      setConfigExtensions([...configExtensions, value]);
      setNewExtension('');
    }
  };

  // Remover extensão
  const handleRemoveExtension = (ext: string) => {
    setConfigExtensions(configExtensions.filter(e => e !== ext));
  };

  if (!assistantId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="text-6xl mb-4">📂</div>
        <h3 className="text-xl font-semibold text-white mb-2">Selecione um Assistente</h3>
        <p className="text-gray-400 text-sm">Escolha um assistente para gerenciar sua base de conhecimento.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header com estatísticas */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-white">Base de Conhecimento</h3>
          <p className="text-sm text-gray-400">
            Adicione pastas ou arquivos para que o assistente possa consultar durante as conversas.
          </p>
        </div>
        
        {stats && (
          <div className="flex gap-3 text-xs">
            <div className="px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <span className="text-blue-400 font-medium">{stats.files}</span>
              <span className="text-gray-400 ml-1">arquivos</span>
            </div>
            <div className="px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg">
              <span className="text-purple-400 font-medium">{stats.chunks}</span>
              <span className="text-gray-400 ml-1">chunks</span>
            </div>
          </div>
        )}
      </div>

      {/* Lista de Fontes */}
      <div className="flex-1 overflow-y-auto space-y-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#2a2a2a #000' }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center border border-dashed border-[#333] rounded-lg">
            <p className="text-gray-500 text-sm mb-2">Nenhuma fonte de conhecimento configurada</p>
            <button
              onClick={handleAddFolder}
              className="text-blue-400 hover:text-blue-300 text-sm underline"
            >
              Adicionar primeira pasta
            </button>
          </div>
        ) : (
          sources.map((source) => (
            <div
              key={source.id}
              className="p-3 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg hover:border-[#3a3a3a] transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{source.type === 'folder' ? '📁' : '📄'}</span>
                    <h4 className="text-white font-medium truncate">{source.name}</h4>
                    {source.is_synced && (
                      <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                        ✓ Sincronizado
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500 text-xs truncate mt-1" title={source.path}>
                    {source.path}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {source.is_synced && (
                      <span className="text-gray-600 text-xs">
                        {source.file_count} arquivos • {source.chunk_count} chunks
                      </span>
                    )}
                    {source.excludes.length > 0 && (
                      <span className="text-gray-600 text-xs">
                        • {source.excludes.length} exclusões
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {syncingSourceId === source.id ? (
                    <div className="flex items-center gap-2 text-xs">
                      <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                      <span className="text-blue-400">
                        {syncProgress ? `${syncProgress.current}/${syncProgress.total}` : 'Preparando...'}
                      </span>
                    </div>
                  ) : (
                    <>
                      {/* Botão Configurar */}
                      <button
                        onClick={() => openConfigModal(source)}
                        className="p-1.5 rounded hover:bg-gray-500/20 text-gray-400 hover:text-gray-300 transition-colors"
                        title="Configurar exclusões"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                      </button>
                      {/* Botão Sincronizar */}
                      <button
                        onClick={() => handleSync(source.id)}
                        className="p-1.5 rounded hover:bg-blue-500/20 text-gray-400 hover:text-blue-400 transition-colors"
                        title={source.is_synced ? 'Ressincronizar' : 'Sincronizar'}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                          <path d="M16 16h5v5" />
                        </svg>
                      </button>
                      {/* Botão Remover */}
                      <button
                        onClick={() => handleDeleteRequest(source)}
                        className="p-1.5 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
                        title="Remover"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Barra de progresso */}
              {syncingSourceId === source.id && syncProgress && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                    <span>{STAGE_LABELS[syncProgress.stage]}</span>
                    {syncProgress.currentFile && (
                      <span className="truncate max-w-[200px]">{syncProgress.currentFile}</span>
                    )}
                  </div>
                  <div className="h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{
                        width: syncProgress.total > 0
                          ? `${(syncProgress.current / syncProgress.total) * 100}%`
                          : '0%',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Botão Adicionar */}
      <button
        onClick={handleAddFolder}
        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 rounded-lg transition-colors font-medium text-sm border border-blue-600/20"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Adicionar Pasta
      </button>

      {/* Seção de Teste */}
      {stats && stats.chunks > 0 && (
        <div className="border-t border-[#222] pt-4">
          <h4 className="text-sm font-semibold text-white mb-2">Testar Busca</h4>
          <div className="flex gap-2">
            <input
              type="text"
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Digite uma pergunta para testar..."
              className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {isSearching ? 'Buscando...' : 'Buscar'}
            </button>
          </div>

          {testResults.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto space-y-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#2a2a2a #000' }}>
              {testResults.map((result, index) => (
                <div key={index} className="p-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded text-xs">
                  <div className="flex justify-between text-gray-400 mb-1">
                    <span>{result.file_name}</span>
                    <span>Linhas {result.start_line}-{result.end_line}</span>
                  </div>
                  <pre className="text-gray-300 whitespace-pre-wrap overflow-hidden text-xs font-mono">
                    {result.content.slice(0, 200)}{result.content.length > 200 ? '...' : ''}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de Configuração */}
      {configModalSource && (
        <div 
          className="fixed inset-0 z-[700] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => e.target === e.currentTarget && closeConfigModal()}
        >
          <div className="bg-[#0a0a0a] rounded-xl shadow-2xl border border-[#222] overflow-hidden w-[500px] max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#222] bg-[#0f0f0f] flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Configurar Fonte</h3>
                <p className="text-sm text-gray-400 truncate">{configModalSource.name}</p>
              </div>
              <button 
                onClick={closeConfigModal}
                className="p-1.5 rounded-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6" style={{ scrollbarWidth: 'thin', scrollbarColor: '#2a2a2a #000' }}>
              {/* Toggle .gitignore */}
              <div className="flex items-center justify-between p-4 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📋</span>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Usar .gitignore</h4>
                    <p className="text-xs text-gray-500">Ignora automaticamente tudo que está no .gitignore da pasta</p>
                  </div>
                </div>
                <button
                  onClick={() => setConfigUseGitignore(!configUseGitignore)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    configUseGitignore ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      configUseGitignore ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Seção de Exclusões */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-semibold text-white">Pastas/Arquivos a Ignorar (Adicional)</h4>
                    <p className="text-xs text-gray-500">Essas pastas e arquivos não serão processados (além do .gitignore)</p>
                  </div>
                </div>

                {/* Input para adicionar */}
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newExclude}
                    onChange={(e) => setNewExclude(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddExclude()}
                    placeholder="Ex: node_modules, .git, dist..."
                    className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={handleAddExclude}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                  >
                    Adicionar
                  </button>
                </div>

                {/* Lista de exclusões */}
                <div className="flex flex-wrap gap-2">
                  {configExcludes.map((exclude) => (
                    <span
                      key={exclude}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg group"
                    >
                      <span>🚫</span>
                      {exclude}
                      <button
                        onClick={() => handleRemoveExclude(exclude)}
                        className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {configExcludes.length === 0 && (
                    <span className="text-gray-500 text-xs">Nenhuma exclusão configurada</span>
                  )}
                </div>
              </div>

              {/* Seção de Extensões */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-semibold text-white">Extensões de Arquivo</h4>
                    <p className="text-xs text-gray-500">Apenas esses tipos de arquivo serão processados</p>
                  </div>
                </div>

                {/* Input para adicionar */}
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newExtension}
                    onChange={(e) => setNewExtension(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddExtension()}
                    placeholder="Ex: .ts, .py, .md..."
                    className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={handleAddExtension}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                  >
                    Adicionar
                  </button>
                </div>

                {/* Lista de extensões */}
                <div className="flex flex-wrap gap-2">
                  {configExtensions.map((ext) => (
                    <span
                      key={ext}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/10 border border-green-500/20 text-green-400 text-xs rounded-lg group"
                    >
                      <span>📄</span>
                      {ext}
                      <button
                        onClick={() => handleRemoveExtension(ext)}
                        className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {configExtensions.length === 0 && (
                    <span className="text-gray-500 text-xs">Nenhuma extensão configurada</span>
                  )}
                </div>
              </div>

              {/* Dica */}
              <div className="flex gap-2 p-3 bg-blue-600/5 border border-blue-600/20 rounded-lg">
                <svg className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <p className="text-xs text-blue-300 leading-relaxed">
                  Após alterar as configurações, você precisará <strong>ressincronizar</strong> a fonte para aplicar as mudanças.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#222] bg-[#0f0f0f] flex justify-end gap-3">
              <button
                onClick={closeConfigModal}
                className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#252525] text-white rounded-lg font-medium transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveConfig}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm shadow-lg shadow-blue-600/20"
              >
                Salvar Configurações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {deleteConfirmSource && (
        <div 
          className="fixed inset-0 z-[800] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => e.target === e.currentTarget && handleDeleteCancel()}
        >
          <div className="bg-[#0a0a0a] rounded-xl shadow-2xl border border-[#222] overflow-hidden w-[400px]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#222] bg-[#0f0f0f]">
              <h3 className="text-lg font-semibold text-white">Excluir Fonte de Conhecimento</h3>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-3">
              <p className="text-gray-300 text-sm">
                Tem certeza que deseja excluir <strong className="text-white">"{deleteConfirmSource.name}"</strong>?
              </p>
              <div className="flex gap-3 text-xs">
                <div className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <span className="text-red-400 font-medium">{deleteConfirmSource.file_count}</span>
                  <span className="text-gray-400 ml-1">arquivos</span>
                </div>
                <div className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <span className="text-red-400 font-medium">{deleteConfirmSource.chunk_count}</span>
                  <span className="text-gray-400 ml-1">chunks</span>
                </div>
              </div>
              <p className="text-gray-500 text-xs">
                Esta ação não pode ser desfeita. Todos os dados indexados serão permanentemente removidos.
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#222] bg-[#0f0f0f] flex justify-end gap-3">
              <button
                onClick={handleDeleteCancel}
                className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#252525] text-white rounded-lg font-medium transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors text-sm shadow-lg shadow-red-600/20"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
