import React, { useState, useEffect, useRef } from 'react';

// ============================================
// COMPONENTE LIGHTMARKDOWN (simplificado)
// ============================================

interface LightMarkdownProps {
  content: string;
  className?: string;
}

const LightMarkdown = React.memo(function LightMarkdown({ content, className = '' }: LightMarkdownProps) {
  const keyCounter = React.useRef(0);
  const getUniqueKey = (prefix: string) => `${prefix}-${keyCounter.current++}`;

  const parseMarkdown = (text: string) => {
    keyCounter.current = 0;
    const elements: React.ReactNode[] = [];
    const lines = text.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Bloco de código (```)
      if (line.trim().startsWith('```')) {
        const language = line.trim().slice(3).trim();
        const codeLines: string[] = [];
        i++;
        
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        
        elements.push(
          <div key={getUniqueKey('codeblock')} className="my-3 rounded-lg overflow-hidden bg-[#0d0d0d] border border-[#222]">
            <div className="px-3 py-1.5 bg-[#161616] border-b border-[#222]">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
                {language || 'code'}
              </span>
            </div>
            <pre className="p-3 text-xs font-mono text-gray-300 overflow-x-auto">
              {codeLines.join('\n')}
            </pre>
          </div>
        );
        i++;
        continue;
      }

      // Título H1 (#)
      if (line.startsWith('# ')) {
        elements.push(
          <h1 key={getUniqueKey('h1')} className="text-lg font-bold text-white mt-4 mb-2 border-b border-[#333] pb-1">
            {line.slice(2)}
          </h1>
        );
        i++;
        continue;
      }

      // Título H2 (##)
      if (line.startsWith('## ')) {
        elements.push(
          <h2 key={getUniqueKey('h2')} className="text-base font-bold text-white mt-3 mb-2">
            {line.slice(3)}
          </h2>
        );
        i++;
        continue;
      }

      // Título H3 (###)
      if (line.startsWith('### ')) {
        elements.push(
          <h3 key={getUniqueKey('h3')} className="text-sm font-bold text-gray-200 mt-2 mb-1">
            {line.slice(4)}
          </h3>
        );
        i++;
        continue;
      }

      // Lista com bullet (-)
      if (line.trim().startsWith('- ')) {
        const listItems: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('- ')) {
          listItems.push(lines[i].trim().slice(2));
          i++;
        }
        elements.push(
          <ul key={getUniqueKey('ul')} className="my-2 space-y-1">
            {listItems.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs text-gray-200">
                <span className="text-cyan-400 mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // Lista numerada (1. 2. 3.)
      if (/^\d+\.\s/.test(line.trim())) {
        const listItems: string[] = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
          listItems.push(lines[i].trim().replace(/^\d+\.\s/, ''));
          i++;
        }
        elements.push(
          <ol key={getUniqueKey('ol')} className="my-2 space-y-1">
            {listItems.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs text-gray-200">
                <span className="text-cyan-400 font-medium min-w-[16px]">{idx + 1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        );
        continue;
      }

      // Linha vazia
      if (line.trim() === '') {
        elements.push(<div key={getUniqueKey('br')} className="h-2" />);
        i++;
        continue;
      }

      // Parágrafo normal - processar negrito e itálico
      const processedLine = line
        .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-white">$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em class="italic text-gray-300">$1</em>')
        .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-[#1a1a1a] text-cyan-300 rounded text-[11px] font-mono">$1</code>');
      
      elements.push(
        <p 
          key={getUniqueKey('p')} 
          className="text-xs text-gray-200 leading-relaxed my-1"
          dangerouslySetInnerHTML={{ __html: processedLine }}
        />
      );
      i++;
    }

    return elements;
  };

  if (!content || content.trim() === '') {
    return null;
  }

  return (
    <div className={`font-['Montserrat',sans-serif] text-white ${className}`}>
      {parseMarkdown(content)}
    </div>
  );
});

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function WordExplanationWindow() {
  const [word, setWord] = useState<string>('');
  const [explanationContent, setExplanationContent] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Configurar listeners
  useEffect(() => {
    if (!window.electron) return;

    // Listener para receber a palavra e contexto
    const handleWordData = (data: { word: string; context: string }) => {
      console.log('[WordExplanation] Recebendo dados:', data.word);
      setWord(data.word);
      setExplanationContent('');
      setIsGenerating(true);
      // Scroll para o topo quando receber nova palavra
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
    };

    // Listener para chunks de streaming
    const handleChunk = (chunk: string) => {
      setExplanationContent(prev => prev + chunk);
    };

    // Listener para fim da geração
    const handleComplete = () => {
      setIsGenerating(false);
    };

    // Registrar listeners
    const unsubWord = window.electron.on('word-explanation:data', (data: any) => handleWordData(data));
    const unsubChunk = window.electron.on('word-explanation:chunk', (chunk: any) => handleChunk(chunk));
    const unsubComplete = window.electron.on('word-explanation:complete', handleComplete);

    return () => {
      unsubWord?.();
      unsubChunk?.();
      unsubComplete?.();
    };
  }, []);

  // Auto-scroll quando conteúdo atualiza
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [explanationContent]);

  // Fechar janela
  const handleClose = () => {
    window.electron?.send?.('word-explanation:close', null);
    window.close();
  };

  // Abortar geração
  const handleAbort = () => {
    window.electron?.summary?.abort();
    setIsGenerating(false);
  };

  return (
    <div className="w-full h-screen flex flex-col bg-[#0a0a0a] text-white font-['Montserrat',sans-serif]">
      {/* Header - Arrastável */}
      <div 
        className="h-12 bg-[#0f0f0f] flex items-center justify-between px-4 border-b border-[#222] flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4"/>
            <path d="M12 8h.01"/>
          </svg>
          <h1 className="text-sm font-medium">
            Explicando: <span className="text-cyan-400 font-bold">{word || '...'}</span>
          </h1>
        </div>
        
        <button
          onClick={handleClose}
          className="text-gray-500 hover:text-white transition-colors p-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* Conteúdo */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#333 #0a0a0a'
        }}
      >
        {explanationContent ? (
          <div>
            <LightMarkdown content={explanationContent} />
            {isGenerating && (
              <span className="inline-block w-1 h-3 bg-cyan-400/50 ml-0.5 animate-pulse" />
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2 text-gray-500">
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
              <span className="text-xs">Gerando explicação...</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#222] flex-shrink-0">
        {isGenerating && (
          <button
            onClick={handleAbort}
            className="px-3 py-1.5 text-gray-400 text-xs hover:text-white transition-colors"
          >
            × Abortar
          </button>
        )}
        <button
          onClick={handleClose}
          className="px-4 py-1.5 bg-[#1a1a1a] hover:bg-[#252525] text-white text-xs rounded-lg transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
