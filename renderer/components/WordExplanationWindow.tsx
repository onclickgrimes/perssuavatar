import React, { useState, useEffect, useRef } from 'react';

// ============================================
// COMPONENTE LIGHTMARKDOWN (simplificado)
// ============================================

interface LightMarkdownProps {
  content: string;
  className?: string;
  fontSize?: number;
}

const LightMarkdown = React.memo(function LightMarkdown({ content, className = '', fontSize = 12 }: LightMarkdownProps) {
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
              <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                {language || 'code'}
              </span>
            </div>
            <pre className="p-3 font-mono text-gray-300 overflow-x-auto" style={{ fontSize: `${fontSize - 2}px` }}>
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
          <h1 key={getUniqueKey('h1')} className="font-bold text-white mt-4 mb-2 border-b border-[#333] pb-1" style={{ fontSize: `${fontSize + 4}px` }}>
            {line.slice(2)}
          </h1>
        );
        i++;
        continue;
      }

      // Título H2 (##)
      if (line.startsWith('## ')) {
        elements.push(
          <h2 key={getUniqueKey('h2')} className="font-bold text-white mt-3 mb-2" style={{ fontSize: `${fontSize + 2}px` }}>
            {line.slice(3)}
          </h2>
        );
        i++;
        continue;
      }

      // Título H3 (###)
      if (line.startsWith('### ')) {
        elements.push(
          <h3 key={getUniqueKey('h3')} className="font-bold text-gray-200 mt-2 mb-1" style={{ fontSize: `${fontSize + 1}px` }}>
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
              <li key={idx} className="flex items-start gap-2 text-gray-200" style={{ fontSize: `${fontSize}px` }}>
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
              <li key={idx} className="flex items-start gap-2 text-gray-200" style={{ fontSize: `${fontSize}px` }}>
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
        .replace(/\*([^*]+)\*/g, '<em class="italic text-gray-200">$1</em>')
        .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-[#1a1a1a] text-cyan-300 rounded font-mono" style="font-size: ' + (fontSize - 1) + 'px">$1</code>');
      
      elements.push(
        <p 
          key={getUniqueKey('p')} 
          className="text-gray-200 leading-relaxed my-1"
          style={{ fontSize: `${fontSize}px` }}
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
  
  // Configurações de aparência
  const [fontSize, setFontSize] = useState(12); // px
  const [windowOpacity, setWindowOpacity] = useState(100); // %
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  
  // Ref para controlar se usuário está no final da página
  const isUserAtBottom = useRef(true);

  // Configurar listeners
  useEffect(() => {
    if (!window.electron) return;

    // Listener para receber a palavra, contexto e configurações de aparência
    const handleWordData = (data: { 
      word: string; 
      context: string; 
      appearanceSettings?: { fontSize: number; opacity: number } 
    }) => {
      console.log('[WordExplanation] Recebendo dados:', data.word);
      console.log('[WordExplanation] appearanceSettings recebido:', JSON.stringify(data.appearanceSettings));
      
      setWord(data.word);
      setExplanationContent('');
      setIsGenerating(true);
      
      // Aplicar configurações de aparência herdadas
      if (data.appearanceSettings) {
        console.log('[WordExplanation] Aplicando fontSize:', data.appearanceSettings.fontSize, 'opacity:', data.appearanceSettings.opacity);
        setFontSize(data.appearanceSettings.fontSize);
        setWindowOpacity(data.appearanceSettings.opacity);
      } else {
        console.log('[WordExplanation] Nenhuma configuração recebida, usando padrões');
      }
      
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

  // Handler de scroll para detectar se usuário está no final
  const handleScroll = () => {
    const container = scrollRef.current;
    if (container) {
      const threshold = 20; // Tolerância de 20px
      const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
      isUserAtBottom.current = isAtBottom;
    }
  };

  // Auto-scroll quando conteúdo atualiza (só se estiver no final)
  useEffect(() => {
    if (!explanationContent) return;
    
    if (isUserAtBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [explanationContent]);

  // Fechar popup ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettingsPopup(false);
      }
    };

    if (showSettingsPopup) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettingsPopup]);

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
    <div 
      className="w-full h-screen flex flex-col font-['Montserrat',sans-serif] overflow-hidden"
      style={{ 
        opacity: windowOpacity / 100,
        background: 'transparent'
      }}
    >
      {/* Container com bordas arredondadas */}
      <div className="flex-1 flex flex-col bg-black rounded-2xl overflow-hidden border border-[#333] m-1 shadow-2xl">
        
        {/* Header - Arrastável */}
        <div 
          className="h-10 bg-[#0a0a0a] flex items-center justify-between px-3 border-b border-[#222] flex-shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4"/>
              <path d="M12 8h.01"/>
            </svg>
            <h1 className="text-xs font-medium text-white">
              Explicando: <span className="text-cyan-400 font-bold">{word || '...'}</span>
            </h1>
          </div>
          
          <button
            onClick={handleClose}
            className="word-explanation-icon hover:opacity-80 transition-opacity p-1"
            style={{ WebkitAppRegion: 'no-drag', color: 'white' } as React.CSSProperties}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" style={{ stroke: 'white' }}>
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Conteúdo */}
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 bg-black"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#333 #000'
          }}
        >
          {explanationContent ? (
            <div>
              <LightMarkdown content={explanationContent} fontSize={fontSize} />
              {isGenerating && (
                <span className="inline-block w-1 h-3 bg-cyan-400/50 ml-0.5 animate-pulse" />
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-2 text-gray-300">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                <span style={{ fontSize: `${fontSize}px` }}>Gerando explicação...</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-[#222] bg-[#0a0a0a] flex-shrink-0">
          {/* Lado esquerdo - botões de ação */}
          <div className="flex items-center gap-2">
            {isGenerating && (
              <button
                onClick={handleAbort}
                className="px-2 py-1 text-gray-400 text-[10px] hover:text-white transition-colors"
              >
                × Abortar
              </button>
            )}
          </div>
          
          {/* Lado direito - engrenagem e fechar */}
          <div className="flex items-center gap-2 text-white">
            <style>{`
              .word-explanation-icon svg, 
              .word-explanation-icon svg path, 
              .word-explanation-icon svg circle { 
                stroke: white !important; 
                fill: none !important;
                color: white !important;
              }
            `}</style>
            
            {/* Botão de configurações */}
            <div className="relative" ref={settingsRef}>
              <button
                className="word-explanation-icon p-1.5 hover:bg-white/10 transition-colors rounded-full"
                onClick={() => setShowSettingsPopup(!showSettingsPopup)}
                title="Configurações"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'white' }}>
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
              
              {/* Popup de configurações */}
              {showSettingsPopup && (
                <div 
                  className="absolute bottom-full right-0 mb-2 w-56 bg-[#0f0f0f] border border-[#333] rounded-lg shadow-2xl p-3 z-50"
                  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                  <h4 className="text-[10px] font-medium uppercase tracking-wider mb-3 text-white">Aparência</h4>
                  
                  {/* Tamanho da fonte */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-white">Fonte</span>
                      <span className="text-[10px] text-cyan-400">{fontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="20"
                      value={fontSize}
                      onChange={(e) => setFontSize(Number(e.target.value))}
                      className="w-full h-1 bg-[#222] rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                  </div>
                  
                  {/* Opacidade */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-white">Opacidade</span>
                      <span className="text-[10px] text-cyan-400">{windowOpacity}%</span>
                    </div>
                    <input
                      type="range"
                      min="30"
                      max="100"
                      value={windowOpacity}
                      onChange={(e) => setWindowOpacity(Number(e.target.value))}
                      className="w-full h-1 bg-[#222] rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                  </div>
                </div>
              )}
            </div>
            
            <button
              onClick={handleClose}
              className="word-explanation-icon px-3 py-1 bg-[#1a1a1a] hover:bg-[#252525] text-white text-[10px] rounded-md transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
