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
    <div className="w-full h-screen flex flex-col p-2">
      {/* Main Container */}
      <div className="flex-1 bg-[#0a0a0a] rounded-xl shadow-2xl border border-[#222] flex flex-col overflow-hidden relative font-['Inter',sans-serif]">
        
        {/* Header */}
        <div 
          className="h-14 bg-[#0f0f0f] flex items-center justify-between px-3 gap-3 flex-shrink-0 border-b border-[#222]"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          {/* Title Section */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center border border-purple-500/30">
              <span className="text-base">📚</span>
            </div>
            <div className="flex flex-col min-w-0">
              <h1 className="text-white font-semibold text-sm truncate">Conhecimento</h1>
              <span className="text-[10px] text-gray-500">
                {results.length} {results.length === 1 ? 'resultado' : 'resultados'}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div 
            className="flex items-center gap-1.5 bg-[#1a1a1a] rounded-lg px-1.5 py-1 border border-[#2a2a2a] flex-shrink-0"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <button 
              onClick={handleClose}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#252525] bg-red-600/10 text-red-500 hover:text-red-400 transition-colors"
              title="Fechar"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Results List */}
        <div 
          className="flex-1 overflow-y-auto px-3 py-2 bg-black" 
          style={{ 
            scrollbarWidth: 'thin', 
            scrollbarColor: '#1a1a1a #0a0a0a' 
          }}
        >
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <div className="w-16 h-16 rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center mb-4">
                <span className="text-3xl">🔍</span>
              </div>
              <p className="text-sm font-medium text-gray-400">Aguardando resultados...</p>
              <p className="text-xs mt-1 text-gray-600">Pergunte ao avatar sobre o código</p>
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((result, index) => (
                <div 
                  key={result.id || index}
                  className="group bg-[#0f0f0f] rounded-lg border border-[#1a1a1a] hover:border-[#2a2a2a] hover:bg-[#111] transition-all cursor-pointer"
                  onClick={() => handleOpenFile(result)}
                >
                  <div className="p-3">
                    {/* File Info */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded bg-[#1a1a1a] flex items-center justify-center text-sm">
                          {getFileIcon(result.language)}
                        </div>
                        <span className="text-white font-medium text-sm truncate">
                          {result.file_name}
                        </span>
                        <span className="px-1.5 py-0.5 bg-[#1a1a1a] text-gray-500 text-[10px] rounded">
                          L{result.start_line}-{result.end_line}
                        </span>
                      </div>
                      <button 
                        className="opacity-0 group-hover:opacity-100 px-2.5 py-1 bg-[#1a1a1a] hover:bg-[#252525] text-gray-300 hover:text-white text-xs rounded border border-[#2a2a2a] transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenFile(result);
                        }}
                      >
                        Abrir
                      </button>
                    </div>

                    {/* Code Preview */}
                    <div className="bg-[#0d0d0d] rounded-lg p-2 overflow-hidden border border-[#1a1a1a]">
                      <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap break-words overflow-hidden leading-relaxed" style={{ maxHeight: '100px' }}>
                        {result.content.slice(0, 400)}{result.content.length > 400 ? '...' : ''}
                      </pre>
                    </div>

                    {/* File Path */}
                    <div className="mt-2 text-[10px] text-gray-600 truncate flex items-center gap-1" title={result.file_path}>
                      <span className="text-gray-500">📁</span>
                      <span className="truncate">{result.file_path}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 bg-[#0f0f0f] border-t border-[#1a1a1a] text-[10px] text-gray-600 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <span>💡</span>
            <span>Clique em um resultado para abrir no editor</span>
          </span>
        </div>
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
