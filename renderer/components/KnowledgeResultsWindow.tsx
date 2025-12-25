import React, { useState, useEffect, useRef } from 'react';

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

// ============================================
// COMPONENTE CODE PREVIEW COM SYNTAX HIGHLIGHTING
// ============================================

interface CodePreviewProps {
  content: string;
  language: string;
  startLine: number;
  maxLines?: number;
}

const CodePreview = React.memo(function CodePreview({ content, language, startLine, maxLines = 8 }: CodePreviewProps) {
  // Contador de keys para garantir unicidade
  const keyCounter = useRef(0);
  const getUniqueKey = (prefix: string) => `${prefix}-${keyCounter.current++}`;

  // Resetar contador a cada render
  keyCounter.current = 0;

  // Syntax highlighting simples para código
  const highlightCode = (line: string): React.ReactNode => {
    const tokens: React.ReactNode[] = [];

    // Comentários
    const commentPattern = /(\/\/.*$|#.*$|\/\*[\s\S]*?\*\/)/g;

    // Primeiro, processa comentários (têm precedência)
    const commentMatch = line.match(commentPattern);
    if (commentMatch) {
      const commentIndex = line.indexOf(commentMatch[0]);
      if (commentIndex >= 0) {
        const beforeComment = line.slice(0, commentIndex);
        const comment = commentMatch[0];
        const afterComment = line.slice(commentIndex + comment.length);
        
        if (beforeComment) {
          tokens.push(...highlightCodePart(beforeComment));
        }
        tokens.push(
          <span key={getUniqueKey('comment')} className="text-[#6A9955]">{comment}</span>
        );
        if (afterComment) {
          tokens.push(...highlightCodePart(afterComment));
        }
        return tokens;
      }
    }

    return highlightCodePart(line);
  };

  const highlightCodePart = (line: string): React.ReactNode[] => {
    const tokens: React.ReactNode[] = [];
    let remaining = line;

    while (remaining.length > 0) {
      // Strings
      const stringMatch = remaining.match(/^(['"`])(?:(?!\1)[^\\]|\\.)*?\1/);
      if (stringMatch) {
        tokens.push(
          <span key={getUniqueKey('str')} className="text-[#CE9178]">{stringMatch[0]}</span>
        );
        remaining = remaining.slice(stringMatch[0].length);
        continue;
      }

      // Palavras-chave
      const keywordMatch = remaining.match(/^(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|class|extends|import|export|from|default|async|await|static|public|private|protected|interface|type|enum|implements|abstract|readonly|void|null|undefined|true|false|this|super|constructor|get|set|of|in|typeof|instanceof|as|is|def|self|elif|pass|lambda|yield|with|assert|raise|except|print|None|True|False)\b/);
      if (keywordMatch) {
        tokens.push(
          <span key={getUniqueKey('kw')} className="text-[#C586C0]">{keywordMatch[0]}</span>
        );
        remaining = remaining.slice(keywordMatch[0].length);
        continue;
      }

      // Funções (nome seguido de parênteses)
      const funcMatch = remaining.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/);
      if (funcMatch) {
        tokens.push(
          <span key={getUniqueKey('fn')} className="text-[#DCDCAA]">{funcMatch[0]}</span>
        );
        remaining = remaining.slice(funcMatch[0].length);
        continue;
      }

      // Números
      const numMatch = remaining.match(/^(\d+\.?\d*|0x[a-fA-F0-9]+)\b/);
      if (numMatch) {
        tokens.push(
          <span key={getUniqueKey('num')} className="text-[#B5CEA8]">{numMatch[0]}</span>
        );
        remaining = remaining.slice(numMatch[0].length);
        continue;
      }

      // Propriedades (após ponto)
      const propMatch = remaining.match(/^\.([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (propMatch) {
        tokens.push(
          <span key={getUniqueKey('dot')} className="text-white">.</span>
        );
        tokens.push(
          <span key={getUniqueKey('prop')} className="text-[#9CDCFE]">{propMatch[1]}</span>
        );
        remaining = remaining.slice(propMatch[0].length);
        continue;
      }

      // Operadores e pontuação
      const opMatch = remaining.match(/^([{}()\[\];:,=+\-*/<>!&|?]+)/);
      if (opMatch) {
        tokens.push(
          <span key={getUniqueKey('op')} className="text-white">{opMatch[0]}</span>
        );
        remaining = remaining.slice(opMatch[0].length);
        continue;
      }

      // Identificadores e outros caracteres (variáveis)
      const identMatch = remaining.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (identMatch) {
        tokens.push(
          <span key={getUniqueKey('id')} className="text-[#9CDCFE]">{identMatch[0]}</span>
        );
        remaining = remaining.slice(identMatch[0].length);
        continue;
      }

      // Caracter desconhecido - adiciona como está
      tokens.push(
        <span key={getUniqueKey('char')} className="text-white">{remaining[0]}</span>
      );
      remaining = remaining.slice(1);
    }

    return tokens;
  };

  // Dividir conteúdo em linhas e limitar
  const lines = content.split('\n').slice(0, maxLines);
  const hasMore = content.split('\n').length > maxLines;

  return (
    <div className="overflow-x-auto text-white">
      <table className="w-full">
        <tbody>
          {lines.map((codeLine, lineIdx) => (
            <tr key={lineIdx} className="hover:bg-[#1a1a1a]">
              <td className="px-2 py-0.5 text-[10px] text-gray-500 select-none text-right border-r border-[#333] w-8 font-mono">
                {startLine + lineIdx}
              </td>
              <td className="px-2 py-0.5 text-xs font-mono whitespace-pre">
                {highlightCode(codeLine)}
              </td>
            </tr>
          ))}
          {hasMore && (
            <tr>
              <td className="px-2 py-0.5 text-[10px] text-gray-500 select-none text-right border-r border-[#333] w-8">
                ...
              </td>
              <td className="px-2 py-0.5 text-xs text-gray-400 italic">
                ... mais {content.split('\n').length - maxLines} linhas
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});

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
    <div className="w-full h-screen flex flex-col p-2 text-white">
      {/* Main Container */}
      <div className="flex-1 bg-[#0a0a0a] rounded-xl shadow-2xl border border-[#222] flex flex-col overflow-hidden relative font-['Inter',sans-serif] text-white">
        
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
                    <div className="bg-[#0d0d0d] rounded-lg overflow-hidden border border-[#1a1a1a]">
                      <CodePreview 
                        content={result.content}
                        language={result.language}
                        startLine={result.start_line}
                        maxLines={6}
                      />
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
