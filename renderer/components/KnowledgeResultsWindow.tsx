import React, { useState, useEffect } from 'react';

interface KnowledgeResult {
  id: number;
  file_path: string;
  file_name: string;
  start_line: number;
  end_line: number;
  content: string;
  language: string;
  similarity: number;
}

export default function KnowledgeResultsWindow() {
  const [results, setResults] = useState<KnowledgeResult[]>([]);

  useEffect(() => {
    const unsubscribe = window.electron.knowledge.onKnowledgeResults((newResults) => {
      console.log('Knowledge results received:', newResults);
      setResults(newResults);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleClose = () => {
    window.electron.knowledge.closeKnowledgeResultsWindow?.();
  };

  const handleOpenFile = async (result: KnowledgeResult) => {
    try {
      await window.electron.knowledge.openFileInEditor(result.file_path, result.start_line);
    } catch (error) {
      console.error('Error opening file:', error);
    }
  };

  return (
    <div className="w-full h-full bg-[#0a0a0a] text-white font-['Inter',sans-serif] flex flex-col overflow-hidden">
      {/* Header - Draggable */}
      <div 
        className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600/30 to-blue-600/30 border-b border-[#333]"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">📚</span>
          <h1 className="text-white font-semibold text-sm">Conhecimento Encontrado</h1>
          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full">
            {results.length} {results.length === 1 ? 'resultado' : 'resultados'}
          </span>
        </div>
        <button 
          onClick={handleClose}
          className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 #0a0a0a' }}>
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <span className="text-4xl mb-3">🔍</span>
            <p className="text-sm">Aguardando resultados de busca...</p>
            <p className="text-xs mt-1">Pergunte ao avatar sobre o código</p>
          </div>
        ) : (
          results.map((result, index) => (
            <div 
              key={result.id || index}
              className="group border-b border-[#222] last:border-0 hover:bg-white/5 transition-colors cursor-pointer"
              onClick={() => handleOpenFile(result)}
            >
              <div className="p-3">
                {/* File Info */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-blue-400">
                      {getFileIcon(result.language)}
                    </span>
                    <span className="text-white font-medium text-sm truncate">
                      {result.file_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-500">
                      Linhas {result.start_line}-{result.end_line}
                    </span>
                    <button 
                      className="opacity-0 group-hover:opacity-100 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenFile(result);
                      }}
                    >
                      Abrir
                    </button>
                  </div>
                </div>

                {/* Code Preview */}
                <div className="bg-[#1a1a1a] rounded-lg p-2 overflow-hidden">
                  <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-words overflow-hidden" style={{ maxHeight: '100px' }}>
                    {result.content.slice(0, 400)}{result.content.length > 400 ? '...' : ''}
                  </pre>
                </div>

                {/* File Path */}
                <div className="mt-2 text-xs text-gray-500 truncate" title={result.file_path}>
                  📁 {result.file_path}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-[#0f0f0f] border-t border-[#222] text-xs text-gray-500 flex items-center justify-between">
        <span>💡 Clique em um resultado para abrir no editor</span>
        <span className="text-gray-600">VS Code detectado automaticamente</span>
      </div>
    </div>
  );
}

// Helper para obter ícone baseado na linguagem
function getFileIcon(language: string): string {
  const icons: Record<string, string> = {
    typescript: '📘',
    javascript: '📙',
    python: '🐍',
    java: '☕',
    csharp: '💠',
    go: '🔷',
    rust: '🦀',
    ruby: '💎',
    php: '🐘',
    vue: '💚',
    svelte: '🧡',
    html: '🌐',
    css: '🎨',
    markdown: '📝',
    json: '📋',
    yaml: '⚙️',
    sql: '🗃️',
    text: '📄',
  };
  return icons[language] || '📄';
}
