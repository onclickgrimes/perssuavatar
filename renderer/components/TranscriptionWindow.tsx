import React, { useState, useRef, useEffect } from 'react';
import { Lightbulb } from 'lucide-react';
import { useDesktopAudioTranscriber } from '../hooks/useDesktopAudioTranscriber';
import { useMicrophoneAudioLevel } from '../hooks/useMicrophoneAudioLevel';
import AudioSourceSelector from './AudioSourceSelector';

interface TranscriptionWindowProps {
  onClose?: () => void;
}

type TabMode = 'transcription' | 'summary';

type Message = {
  id: string;
  speaker: string; // Pode ser 'VOCÊ', 'ASSISTENTE', ou o nome da fonte de áudio
  text: string;
  timestamp: Date;
};

// Buffer para armazenar transcrições do modelo (avatar)
type ModelTranscription = {
  text: string;
  timestamp: number;
};

// Função para calcular a distância de Levenshtein (similaridade entre strings)
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

// Função para calcular similaridade percentual entre dois textos
function calculateSimilarity(text1: string, text2: string): number {
  // Normalizar textos: lowercase, remover pontuação e espaços extras
  const normalize = (text: string) => 
    text.toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove pontuação
      .replace(/\s+/g, ' ')    // Normaliza espaços
      .trim();

  const normalized1 = normalize(text1);
  const normalized2 = normalize(text2);

  if (!normalized1 || !normalized2) return 0;

  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLength = Math.max(normalized1.length, normalized2.length);
  
  if (maxLength === 0) return 100;
  
  const similarity = ((maxLength - distance) / maxLength) * 100;
  return similarity;
}

// Função para normalizar texto (remover pontuação, acentos, espaços e converter para lowercase)
function normalizeText(text: string): string {
  return text.toLowerCase()
    .normalize('NFD')                          // Decompõe caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '')          // Remove marcas diacríticas (acentos)
    .replace(/[^\w\s]/g, '')                  // Remove pontuação
    .replace(/\s+/g, ' ')                     // Normaliza espaços
    .trim();
}

// Função para verificar se um texto é similar a algum texto do buffer
function isSimilarToModelTranscription(
  text: string, 
  modelBuffer: ModelTranscription[], 
  similarityThreshold: number = 60
): boolean {
  // Normalizar o texto do desktop
  const normalizedDesktop = normalizeText(text);
  
  if (!normalizedDesktop) return false;

  // Usar TODOS os fragmentos do buffer (já limitado por BUFFER_MAX_AGE)
  // Não filtrar novamente por TIME_WINDOW para evitar perder fragmentos
  const consolidatedModelText = modelBuffer
    .map(t => normalizeText(t.text))
    .filter(t => t.length > 0)
    .join(' ');

  // console.log(`[TranscriptionFilter] 🔍 Texto desktop normalizado: "${normalizedDesktop}"`);
  // console.log(`[TranscriptionFilter] 🔍 Modelo consolidado: ${consolidatedModelText.length} caracteres`);
  // console.log(`[TranscriptionFilter] 🔍 Modelo consolidado normalizado: "${consolidatedModelText.substring(0, 150)}..."`);

  // 1. Verificar se o texto do desktop está contido no modelo consolidado
  if (consolidatedModelText.includes(normalizedDesktop)) {
    // console.log(`[TranscriptionFilter] ✅ Descartando (substring encontrada no modelo consolidado):`);
    console.log(`  Desktop: "${text}"`);
    console.log(`  Modelo consolidado: "${consolidatedModelText}"`);
    return true;
  }

  // 2. Verificar se o modelo consolidado está contido no desktop
  if (normalizedDesktop.includes(consolidatedModelText) && consolidatedModelText.length > 5) {
    // console.log(`[TranscriptionFilter] ✅ Descartando (modelo consolidado encontrado no desktop):`);
    console.log(`  Desktop: "${text}"`);
    console.log(`  Modelo consolidado: "${consolidatedModelText}"`);
    return true;
  }

  // 3. Verificar similaridade com o texto consolidado
  if (consolidatedModelText.length > 0) {
    const similarity = calculateSimilarity(normalizedDesktop, consolidatedModelText);
    
    if (similarity >= similarityThreshold) {
      // console.log(`[TranscriptionFilter] ✅ Descartando (${similarity.toFixed(1)}% similar ao consolidado):`);
      console.log(`  Desktop: "${text}"`);
      console.log(`  Modelo consolidado: "${consolidatedModelText}"`);
      return true;
    }
    
    // console.log(`[TranscriptionFilter] 📊 Similaridade: ${similarity.toFixed(1)}% (threshold: ${similarityThreshold}%)`);
  }

  // 4. Verificar se partes significativas do desktop estão nos fragmentos individuais
  const words = normalizedDesktop.split(' ').filter(w => w.length > 2);
  if (words.length >= 3) {
    let matchingWords = 0;
    for (const word of words) {
      if (consolidatedModelText.includes(word)) {
        matchingWords++;
      }
    }
    
    const wordMatchPercentage = (matchingWords / words.length) * 100;
    // console.log(`[TranscriptionFilter] 📊 Palavras em comum: ${matchingWords}/${words.length} = ${wordMatchPercentage.toFixed(1)}%`);
    
    if (wordMatchPercentage >= 70) {
      // console.log(`[TranscriptionFilter] ✅ Descartando (${wordMatchPercentage.toFixed(1)}% palavras em comum):`);
      console.log(`  Desktop: "${text}"`);
      console.log(`  Palavras correspondentes: ${matchingWords}/${words.length}`);
      return true;
    }
  }

  // console.log(`[TranscriptionFilter] ❌ Não passou em nenhum filtro, liberando como OUTROS`);
  return false;
}

// Lista de navegadores conhecidos para extrair nome do site
const KNOWN_BROWSERS = [
  'Google Chrome',
  'Mozilla Firefox',
  'Microsoft Edge',
  'Safari',
  'Opera',
  'Brave',
  'Vivaldi',
  'Arc'
];

// Função para extrair o nome do site de títulos de janelas de navegadores
// Exemplo: "Curso - Udemy - Google Chrome" → "Udemy"
// Exemplo: "YouTube - Google Chrome" → "YouTube"
function extractSiteNameFromBrowserTitle(windowTitle: string): string | null {
  // Verificar se é um navegador conhecido
  const browserMatch = KNOWN_BROWSERS.find(browser => 
    windowTitle.toLowerCase().endsWith(browser.toLowerCase())
  );
  
  if (!browserMatch) {
    return null; // Não é um navegador
  }
  
  // Remover o nome do navegador do final
  // "Titulo - Site - Google Chrome" → "Titulo - Site"
  const withoutBrowser = windowTitle
    .slice(0, windowTitle.length - browserMatch.length)
    .trim()
    .replace(/[-–—]\s*$/, '') // Remove hífen no final
    .trim();
  
  if (!withoutBrowser) {
    return browserMatch; // Só tinha o nome do navegador
  }
  
  // Pegar a última parte antes do navegador (nome do site)
  // "Titulo - Site" → "Site"
  const parts = withoutBrowser.split(/\s*[-–—]\s*/);
  const siteName = parts[parts.length - 1].trim();
  
  return siteName || withoutBrowser;
}

// ============================================
// COMPONENTE LIGHTMARKDOWN
// ============================================

interface LightMarkdownProps {
  content: string;
  className?: string;
  onWordClick?: (word: string, context: string) => void;
}

const LightMarkdown = React.memo(function LightMarkdown({ content, className = '', onWordClick }: LightMarkdownProps) {
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);
  // Contador global de keys para garantir unicidade
  const keyCounter = React.useRef(0);
  const getUniqueKey = (prefix: string) => `${prefix}-${keyCounter.current++}`;

  const copyToClipboard = async (text: string, index: number) => {
    try {
      // Usar Electron clipboard via IPC
      if (window.electron?.copyToClipboard) {
        await window.electron.copyToClipboard(text);
      } else {
        // Fallback para API do navegador
        await navigator.clipboard.writeText(text);
      }
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      console.error('Erro ao copiar:', error);
    }
  };

  // Syntax highlighting simples para código
  const highlightCode = (line: string): React.ReactNode => {
    const tokens: React.ReactNode[] = [];
    const remaining = line;

    // Comentários
    const commentPattern = /(\/\/.*$|#.*$|\/\*[\s\S]*?\*\/)/g;

    // Primeiro, processa comentários (têm precedência)
    const commentMatch = remaining.match(commentPattern);
    if (commentMatch) {
      const commentIndex = remaining.indexOf(commentMatch[0]);
      if (commentIndex >= 0) {
        const beforeComment = remaining.slice(0, commentIndex);
        const comment = commentMatch[0];
        const afterComment = remaining.slice(commentIndex + comment.length);
        
        if (beforeComment) {
          tokens.push(...highlightCodePart(beforeComment));
        }
        tokens.push(
          <span key={getUniqueKey('comment')} className="text-gray-500 italic">{comment}</span>
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
          <span key={getUniqueKey('str')} className="text-green-400">{stringMatch[0]}</span>
        );
        remaining = remaining.slice(stringMatch[0].length);
        continue;
      }

      // Palavras-chave
      const keywordMatch = remaining.match(/^(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|class|extends|import|export|from|default|async|await|static|public|private|protected|interface|type|enum|implements|abstract|readonly|void|null|undefined|true|false|this|super|constructor|get|set|of|in|typeof|instanceof|as|is|def|self|elif|pass|lambda|yield|with|assert|raise|except|print|None|True|False)\b/);
      if (keywordMatch) {
        tokens.push(
          <span key={getUniqueKey('kw')} className="text-purple-400">{keywordMatch[0]}</span>
        );
        remaining = remaining.slice(keywordMatch[0].length);
        continue;
      }

      // Funções (nome seguido de parênteses)
      const funcMatch = remaining.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/);
      if (funcMatch) {
        tokens.push(
          <span key={getUniqueKey('fn')} className="text-blue-400">{funcMatch[0]}</span>
        );
        remaining = remaining.slice(funcMatch[0].length);
        continue;
      }

      // Números
      const numMatch = remaining.match(/^(\d+\.?\d*|0x[a-fA-F0-9]+)\b/);
      if (numMatch) {
        tokens.push(
          <span key={getUniqueKey('num')} className="text-yellow-400">{numMatch[0]}</span>
        );
        remaining = remaining.slice(numMatch[0].length);
        continue;
      }

      // Propriedades (após ponto)
      const propMatch = remaining.match(/^\.([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (propMatch) {
        tokens.push(
          <span key={getUniqueKey('dot')} className="text-gray-300">.</span>
        );
        tokens.push(
          <span key={getUniqueKey('prop')} className="text-orange-300">{propMatch[1]}</span>
        );
        remaining = remaining.slice(propMatch[0].length);
        continue;
      }

      // Operadores e pontuação
      const opMatch = remaining.match(/^([{}()\[\];:,=+\-*/<>!&|?]+)/);
      if (opMatch) {
        tokens.push(
          <span key={getUniqueKey('op')} className="text-gray-400">{opMatch[0]}</span>
        );
        remaining = remaining.slice(opMatch[0].length);
        continue;
      }

      // Identificadores e outros caracteres
      const identMatch = remaining.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (identMatch) {
        tokens.push(
          <span key={getUniqueKey('id')} className="text-cyan-300">{identMatch[0]}</span>
        );
        remaining = remaining.slice(identMatch[0].length);
        continue;
      }

      // Caracter desconhecido - adiciona como está
      tokens.push(
        <span key={getUniqueKey('char')} className="text-gray-300">{remaining[0]}</span>
      );
      remaining = remaining.slice(1);
    }

    return tokens;
  };

  const parseMarkdown = (text: string) => {
    // Resetar contador de keys para cada renderização
    keyCounter.current = 0;
    
    const elements: React.ReactNode[] = [];
    const lines = text.split('\n');
    let i = 0;
    let codeBlockIndex = 0;

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
        
        const codeContent = codeLines.join('\n');
        const currentIndex = codeBlockIndex++;
        
        elements.push(
          <div key={getUniqueKey('codeblock')} className="my-3 rounded-lg overflow-hidden bg-[#0d0d0d] border border-[#222]">
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#161616] border-b border-[#222]">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
                {language || 'code'}
              </span>
              <button
                onClick={() => copyToClipboard(codeContent, currentIndex)}
                className="text-[10px] text-gray-500 hover:text-white transition-colors flex items-center gap-1"
              >
                {copiedIndex === currentIndex ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Copiado!
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    Copiar
                  </>
                )}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <tbody>
                  {codeLines.map((codeLine, lineIdx) => (
                    <tr key={lineIdx} className="hover:bg-[#1a1a1a]">
                      <td className="px-3 py-0.5 text-[10px] text-gray-600 select-none text-right border-r border-[#222] w-8">
                        {lineIdx + 1}
                      </td>
                      <td className="px-3 py-0.5 text-xs font-mono whitespace-pre">
                        {highlightCode(codeLine)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
        i++;
        continue;
      }

      // Título H1 (#)
      if (line.startsWith('# ')) {
        elements.push(
          <h1 key={getUniqueKey('h1')} className="text-lg font-bold text-white mt-4 mb-2 border-b border-[#333] pb-1">
            {parseInline(line.slice(2))}
          </h1>
        );
        i++;
        continue;
      }

      // Título H2 (##)
      if (line.startsWith('## ')) {
        elements.push(
          <h2 key={getUniqueKey('h2')} className="font-bold text-white mt-3 mb-2" style={{ fontSize: '1.1em' }}>
            {parseInline(line.slice(3))}
          </h2>
        );
        i++;
        continue;
      }

      // Título H3 (###)
      if (line.startsWith('### ')) {
        elements.push(
          <h3 key={getUniqueKey('h3')} className="font-bold text-gray-200 mt-2 mb-1" style={{ fontSize: '1em' }}>
            {parseInline(line.slice(4))}
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
              <li key={idx} className="flex items-start gap-2 text-gray-200">
                <span className="text-cyan-400 mt-0.5">•</span>
                <span>{parseInline(item)}</span>
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
              <li key={idx} className="flex items-start gap-2 text-gray-200">
                <span className="text-cyan-400 font-medium min-w-[16px]">{idx + 1}.</span>
                <span>{parseInline(item)}</span>
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

      // Parágrafo normal
      elements.push(
        <p key={getUniqueKey('p')} className="text-gray-200 leading-relaxed my-1">
          {parseInline(line)}
        </p>
      );
      i++;
    }

    return elements;
  };

  // Parse inline: negrito, itálico, código inline
  const parseInline = (text: string): React.ReactNode[] => {
    const result: React.ReactNode[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      // Código inline `code`
      const codeMatch = remaining.match(/`([^`]+)`/);
      if (codeMatch && codeMatch.index !== undefined) {
        if (codeMatch.index > 0) {
          result.push(...parseInlineStyles(remaining.slice(0, codeMatch.index)));
        }
        result.push(
          <code key={getUniqueKey('inlinecode')} className="px-1.5 py-0.5 bg-[#1a1a1a] text-cyan-300 rounded text-[11px] font-mono">
            {codeMatch[1]}
          </code>
        );
        remaining = remaining.slice((codeMatch.index || 0) + codeMatch[0].length);
        continue;
      }

      // Se não encontrou código inline, processa estilos
      result.push(...parseInlineStyles(remaining));
      break;
    }

    return result;
  };

  // Renderiza texto como palavras clicáveis
  const renderClickableText = (text: string, className: string = ''): React.ReactNode => {
    if (!onWordClick) {
      return <span key={getUniqueKey('text')} className={className}>{text}</span>;
    }

    // Dividir em palavras e espaços, preservando a estrutura
    const parts = text.split(/(\s+)/);
    
    return (
      <span key={getUniqueKey('clickable-container')} className={className}>
        {parts.map((part, index) => {
          // Se for espaço, mantém como está
          if (/^\s+$/.test(part)) {
            return <span key={`space-${index}`}>{part}</span>;
          }
          
          // Se for palavra, torna clicável
          const cleanWord = part.replace(/[^\w\u00C0-\u017F]/g, '');
          if (cleanWord.length >= 2) {
            return (
              <span
                key={`word-${index}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onWordClick(part, content);
                }}
                className="cursor-pointer hover:bg-white/10 hover:text-cyan-300 transition-colors rounded px-0.5 -mx-0.5"
                title={`Clique para explicar: ${cleanWord}`}
              >
                {part}
              </span>
            );
          }
          
          return <span key={`char-${index}`}>{part}</span>;
        })}
      </span>
    );
  };

  // Parse negrito e itálico
  const parseInlineStyles = (text: string): React.ReactNode[] => {
    const result: React.ReactNode[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      // Negrito **text**
      const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
      // Itálico *text*
      const italicMatch = remaining.match(/(?<!\*)\*([^*]+)\*(?!\*)/);

      // Encontrar o primeiro match
      let firstMatch: { type: 'bold' | 'italic'; match: RegExpMatchArray } | null = null;

      if (boldMatch && boldMatch.index !== undefined) {
        if (!firstMatch || boldMatch.index < (firstMatch.match.index || Infinity)) {
          firstMatch = { type: 'bold', match: boldMatch };
        }
      }
      if (italicMatch && italicMatch.index !== undefined) {
        if (!firstMatch || italicMatch.index < (firstMatch.match.index || Infinity)) {
          firstMatch = { type: 'italic', match: italicMatch };
        }
      }

      if (firstMatch) {
        const { type, match } = firstMatch;
        if ((match.index || 0) > 0) {
          result.push(renderClickableText(remaining.slice(0, match.index)));
        }

        if (type === 'bold') {
          result.push(
            <strong key={getUniqueKey('bold')} className="font-bold text-white">
              {onWordClick ? renderClickableText(match[1]) : match[1]}
            </strong>
          );
        } else {
          result.push(
            <em key={getUniqueKey('italic')} className="italic text-gray-300">
              {onWordClick ? renderClickableText(match[1]) : match[1]}
            </em>
          );
        }

        remaining = remaining.slice((match.index || 0) + match[0].length);
        continue;
      }

      // Sem mais matches, adiciona o resto
      if (remaining.length > 0) {
        result.push(renderClickableText(remaining));
      }
      break;
    }

    return result;
  };

  // Early return se não há conteúdo
  if (!content || content.trim() === '') {
    return null;
  }

  return (
    <div className={`font-['Montserrat',sans-serif] text-white ${className}`}>
      {parseMarkdown(content)}
    </div>
  );
});

export default function TranscriptionWindow({ onClose }: TranscriptionWindowProps = {}) {
  const [activeTab, setActiveTab] = useState<TabMode>('transcription');
  const [language, setLanguage] = useState('Portuguese (BR)');
  const [isPaused, setIsPaused] = useState(false);
  const [showAudioMeters, setShowAudioMeters] = useState(true);
  // Quando true: inclui transcrições do avatar (não filtra) E envia contexto periodicamente
  const [includeAvatarInConversation, setIncludeAvatarInConversation] = useState(false);
  // Configurações de interação do avatar (só usadas quando includeAvatarInConversation = true)
  const [avatarInteractionCount, setAvatarInteractionCount] = useState(10); // Mín 5, Máx 60, Padrão 10
  const [avatarInteractionMode, setAvatarInteractionMode] = useState<'fixed' | 'dynamic'>('fixed'); // fixo ou dinâmico (random)
  const [avatarResponseChance, setAvatarResponseChance] = useState(50); // Mín 40, Máx 90, Padrão 50 (só usado no modo dinâmico)
  const [messages, setMessages] = useState<Message[]>([]);
  const [userAudioLevel, setUserAudioLevel] = useState(0);
  const [otherAudioLevel, setOtherAudioLevel] = useState(0);
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [selectedAudioSourceId, setSelectedAudioSourceId] = useState<string | null>(null);
  const [selectedAudioSourceName, setSelectedAudioSourceName] = useState<string>('Sistema');
  
  // Estados para a aba de Resumo
  const [summaryContent, setSummaryContent] = useState<string>('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryChatHistory, setSummaryChatHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [selectedAssistantName, setSelectedAssistantName] = useState<string>('Carregando...');
  const [isBottomPanelExpanded, setIsBottomPanelExpanded] = useState(false);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(20); // Altura em porcentagem
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [followUpHistory, setFollowUpHistory] = useState<string[][]>([]); // Histórico de 2 gerações
  const [isGeneratingFollowUp, setIsGeneratingFollowUp] = useState(false);
  
  // Configurações de aparência
  const [summaryFontSize, setSummaryFontSize] = useState(12); // px
  const [windowOpacity, setWindowOpacity] = useState(100); // %
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const summaryContainerRef = useRef<HTMLDivElement>(null);
  const settingsPopupRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isOverResizeHandle, setIsOverResizeHandle] = useState(false);
  
  // Refs para controle de auto-scroll (só rola se estiver no fim)
  const transcriptionScrollRef = useRef<HTMLDivElement>(null);
  const summaryScrollRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomTranscription = useRef(true);
  const isUserAtBottomSummary = useRef(true);

  // Buffers para acumular fragmentos de transcrição
  const userTranscriptionBuffer = useRef<string>('');
  const desktopTranscriptionBuffer = useRef<string>('');
  const userTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const desktopTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Buffer de transcrições do modelo (avatar) para comparação
  const modelTranscriptionBuffer = useRef<ModelTranscription[]>([]);

  // Refs para geração automática de resumo
  const autoSummaryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoFollowUpTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedMessageCount = useRef<number>(0);
  const lastFollowUpMessageCount = useRef<number>(0);
  const summaryEndRef = useRef<HTMLDivElement>(null);
  // Buffer de mensagens para análise (empilha até 5, zera após resumo)
  const summaryMessagesBuffer = useRef<Array<{ speaker: string; text: string }>>([]);
  const MAX_SUMMARY_BUFFER_SIZE = 5;
  // Ref para evitar loops no useEffect (não depender de isGeneratingSummary)
  const isGeneratingRef = useRef(false);
  const isGeneratingFollowUpRef = useRef(false);
  const wasDraggingRef = useRef(false); // Para evitar toggle após arraste
  
  // Ref para rastrear quantas mensagens havia no último envio de contexto ao avatar
  const lastContextSentMessageCount = useRef<number>(0);
  // Ref para armazenar mensagens atuais (evita stale closure no setInterval)
  const messagesRef = useRef<Message[]>([]);
  
  // Refs para guardar a posição do scroll de cada aba
  const transcriptionScrollPosition = useRef(0);
  const summaryScrollPosition = useRef(0);

  // ========================================
  // CARREGAR/SALVAR CONFIGURAÇÕES DO BANCO
  // ========================================
  
  // Carregar configurações do banco de dados ao montar
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const result = await window.electron?.db?.getTranscriptionSettings?.();
        if (result?.success && result.settings) {
          const s = result.settings;
          console.log('[TranscriptionWindow] 📖 Configurações carregadas:', s);
          setSummaryFontSize(s.fontSize ?? 12);
          setWindowOpacity(s.windowOpacity ?? 100);
          setIncludeAvatarInConversation(s.includeAvatarInConversation ?? false);
          setAvatarInteractionCount(s.avatarInteractionCount ?? 10);
          setAvatarInteractionMode(s.avatarInteractionMode ?? 'fixed');
          setAvatarResponseChance(s.avatarResponseChance ?? 50);
        }
      } catch (error) {
        console.error('[TranscriptionWindow] ❌ Erro ao carregar configurações:', error);
      }
    };
    loadSettings();
  }, []);

  // Salvar configurações quando alteradas (debounced)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    // Ignorar a execução inicial
    if (saveTimeoutRef.current === null) {
      saveTimeoutRef.current = undefined as any;
      return;
    }
    
    // Debounce: salvar 500ms após a última alteração
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await window.electron?.db?.setTranscriptionSettings?.({
          fontSize: summaryFontSize,
          windowOpacity,
          includeAvatarInConversation,
          avatarInteractionCount,
          avatarInteractionMode,
          avatarResponseChance
        });
        console.log('[TranscriptionWindow] 💾 Configurações salvas');
      } catch (error) {
        console.error('[TranscriptionWindow] ❌ Erro ao salvar configurações:', error);
      }
    }, 500);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [summaryFontSize, windowOpacity, includeAvatarInConversation, avatarInteractionCount, avatarInteractionMode, avatarResponseChance]);

  // Hook para transcrição de áudio do desktop (OUTROS)
  const { startTranscribing, stopTranscribing, changeAudioSource, isTranscribing, status } = useDesktopAudioTranscriber({
    sourceId: selectedAudioSourceId, // Passa a fonte selecionada
    onAudioLevel: (level) => {
      // Atualizar nível de áudio em tempo real (antes da transcrição)
      setOtherAudioLevel(level);
    },
    onTranscription: (text, isFinal) => {
      if (isPaused) return;

      console.log('[DesktopAudio] Transcription:', text, 'isFinal:', isFinal);

      if (isFinal) {
        // Acumula fragmentos
        if (desktopTranscriptionBuffer.current) {
          desktopTranscriptionBuffer.current += ' ' + text.trim();
        } else {
          desktopTranscriptionBuffer.current = text.trim();
        }
        
        // Clear previous timeout
        if (desktopTimeoutRef.current) {
          clearTimeout(desktopTimeoutRef.current);
        }

        // Se tem buffer do usuário, finaliza ele primeiro
        if (userTranscriptionBuffer.current.trim()) {
          addMessage('VOCÊ', userTranscriptionBuffer.current.trim());
          userTranscriptionBuffer.current = '';
        }

        // Set new timeout para consolidar
        desktopTimeoutRef.current = setTimeout(() => {
          if (desktopTranscriptionBuffer.current.trim()) {
            const desktopText = desktopTranscriptionBuffer.current.trim();
            
            // console.log(`[TranscriptionFilter] 🔍 Verificando transcrição do desktop: "${desktopText}"`);
            // console.log(`[TranscriptionFilter] 🔍 Incluir Avatar: ${includeAvatarInConversation ? 'SIM' : 'NÃO'}`);
            // console.log(`[TranscriptionFilter] 🔍 Buffer do modelo tem ${modelTranscriptionBuffer.current.length} fragmentos para comparar`);
            
            // ✅ SEMPRE verificar se a transcrição é do avatar
            const isFromAvatar = isSimilarToModelTranscription(desktopText, modelTranscriptionBuffer.current);
            
            if (isFromAvatar) {
              if (!includeAvatarInConversation) {
                // Incluir Avatar desativado: filtra (descarta) transcrições do avatar
                console.log('[TranscriptionFilter] ❌ Transcrição filtrada (é do avatar, Incluir Avatar está OFF)');
              } else {
                // Incluir Avatar ativado: mostra transcrições do avatar como ASSISTENTE
                console.log('[TranscriptionFilter] 🤖 Transcrição do avatar, adicionando como ASSISTENTE');
                addMessage('ASSISTENTE', desktopText);
              }
            } else {
              // Não é do avatar: sempre adiciona com o nome da fonte selecionada
              // console.log(`[TranscriptionFilter] ✅ Transcrição de outra pessoa, adicionando como ${selectedAudioSourceName}`);
              addMessage(selectedAudioSourceName.toUpperCase(), desktopText);
            }
            
            desktopTranscriptionBuffer.current = '';
          }
        }, 1000);
      }
    },
    onError: (error) => {
      console.error('[DesktopAudio] Error:', error);
    },
    chunkIntervalMs: 100
  });

  // Hook para monitorar nível de áudio do microfone (usuário)
  const { startMonitoring, stopMonitoring } = useMicrophoneAudioLevel({
    onAudioLevel: (level) => {
      // Atualizar nível de áudio do usuário em tempo real
      setUserAudioLevel(level);
    }
  });

  // Fechar popup de configurações ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsPopupRef.current && !settingsPopupRef.current.contains(event.target as Node)) {
        setShowSettingsPopup(false);
      }
    };

    if (showSettingsPopup) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettingsPopup]);

  // Iniciar transcrição do desktop e monitoramento do microfone automaticamente quando a janela abrir
  useEffect(() => {
    // Pequeno delay para permitir que a UI renderize primeiro
    const initTimeout = setTimeout(() => {
      console.log('[TranscriptionWindow] Iniciando transcrição do desktop e monitoramento do microfone...');
      startTranscribing();
      startMonitoring();
    }, 100);

    return () => {
      clearTimeout(initTimeout);
      console.log('[TranscriptionWindow] Parando transcrição do desktop e monitoramento do microfone...');
      stopTranscribing();
      stopMonitoring();
      if (desktopTimeoutRef.current) clearTimeout(desktopTimeoutRef.current);
    };
  }, []);

  // Carregar assistente selecionado e configurar listener de chunks
  useEffect(() => {
    if (!window.electron?.summary) return;

    // Carregar nome do assistente
    const loadAssistant = async () => {
      try {
        const assistant = await window.electron.summary.getSelectedAssistant();
        if (assistant) {
          setSelectedAssistantName(assistant.name);
          console.log('[TranscriptionWindow] Assistente carregado:', assistant.name);
        }
      } catch (error) {
        console.error('[TranscriptionWindow] Erro ao carregar assistente:', error);
        setSelectedAssistantName('Assistente');
      }
    };

    loadAssistant();

    // Configurar listener para chunks de streaming
    const unsubscribeChunk = window.electron.summary.onChunk((chunk) => {
      // Quando receber o primeiro chunk, ativar o estado de geração
      setIsGeneratingSummary(true);
      setSummaryContent(prev => prev + chunk);
    });

    return () => {
      unsubscribeChunk?.();
    };
  }, []);

  // Trocar fonte de áudio sem desconectar Deepgram
  useEffect(() => {
    if (isTranscribing && changeAudioSource) {
      console.log('[TranscriptionWindow] Fonte de áudio mudou, trocando fonte...');
      changeAudioSource(selectedAudioSourceId);
    }
  }, [selectedAudioSourceId]);

  // Função para lidar com clique em palavra do resumo - abre nova janela
  const handleWordClick = async (word: string, context: string) => {
    // Limpar palavra de caracteres especiais
    const cleanWord = word.replace(/[^\w\u00C0-\u017F]/g, '').trim();
    if (!cleanWord || cleanWord.length < 2) return;
    
    console.log(`[TranscriptionWindow] Palavra clicada: "${cleanWord}" config: fontSize=${summaryFontSize}, opacity=${windowOpacity}`);
    
    // Abrir janela de explicação com as mesmas configurações de aparência
    try {
      await window.electron?.summary?.openExplanationWindow(cleanWord, context, {
        fontSize: summaryFontSize,
        opacity: windowOpacity
      });
    } catch (error) {
      console.error('[TranscriptionWindow] Erro ao abrir janela de explicação:', error);
    }
  };

  // Geração automática de resumo/feedback quando novas mensagens chegam
  useEffect(() => {
    if (!window.electron?.summary) return;
    if (isPaused) return;
    if (messages.length === 0) return;
    
    // Não processar se já está gerando
    if (isGeneratingRef.current) return;
    
    // Só gera se tem mensagens novas desde a última geração
    const newMessagesCount = messages.length - lastProcessedMessageCount.current;
    if (newMessagesCount <= 0) return;

    // Adicionar mensagens novas ao buffer
    const startIndex = lastProcessedMessageCount.current;
    const newMessages = messages.slice(startIndex);
    
    // Adicionar cada nova mensagem ao buffer
    newMessages.forEach(m => {
      summaryMessagesBuffer.current.push({
        speaker: m.speaker,
        text: m.text
      });
      // Manter apenas as últimas MAX_SUMMARY_BUFFER_SIZE mensagens
      if (summaryMessagesBuffer.current.length > MAX_SUMMARY_BUFFER_SIZE) {
        summaryMessagesBuffer.current.shift(); // Remove a mais antiga
      }
    });
    
    // Atualizar o contador de mensagens processadas
    lastProcessedMessageCount.current = messages.length;

    // Limpar timeout anterior do resumo
    if (autoSummaryTimeoutRef.current) {
      clearTimeout(autoSummaryTimeoutRef.current);
    }

    // Limpar timeout anterior do follow-up
    if (autoFollowUpTimeoutRef.current) {
      clearTimeout(autoFollowUpTimeoutRef.current);
    }

    // Aguardar 1,5 segundos de "silêncio" antes de gerar feedback
    autoSummaryTimeoutRef.current = setTimeout(async () => {
      // Verificar se ainda não está gerando (usar ref para evitar closure stale)
      if (isGeneratingRef.current) return;
      if (summaryMessagesBuffer.current.length === 0) return;
      
      console.log(`[TranscriptionWindow] Gerando feedback (buffer: ${summaryMessagesBuffer.current.length} mensagens)`);
      
      isGeneratingRef.current = true;
      // NÃO setar isGeneratingSummary(true) aqui - será setado quando receber o primeiro chunk
      setSummaryContent('');
      
      try {
        // Enviar todas as mensagens do buffer concatenadas
        const transcription = [...summaryMessagesBuffer.current];
        
        console.log(`[TranscriptionWindow] Mensagens enviadas para análise:`, transcription.map(m => `${m.speaker}: ${m.text.substring(0, 50)}...`));
        
        const result = await window.electron.summary.generate(transcription);
        
        if (result.success) {
          // Só adicionar ao histórico se tiver conteúdo (IA pode ignorar conversas triviais)
          if (result.result && result.result.trim().length > 0) {
            setSummaryChatHistory(prev => [...prev, { 
              role: 'assistant', 
              content: result.result 
            }]);
            
            // Contexto agora é enviado via intervalo de 10 segundos (ver useEffect abaixo)
            // Não enviar mais aqui na geração do sumário
            
            // ZERAR o buffer após resumo bem-sucedido
            summaryMessagesBuffer.current = [];
            console.log(`[TranscriptionWindow] Resumo gerado! Buffer zerado.`);
          } else {
            // Conversa ignorada - NÃO zera o buffer, continua acumulando
            console.log('[TranscriptionWindow] Conversa ignorada pela IA (não relevante) - buffer mantido');
          }
          setSummaryContent('');
        } else {
          console.error('[TranscriptionWindow] Erro na geração automática:', result.error);
        }
      } catch (error) {
        console.error('[TranscriptionWindow] Erro na geração automática:', error);
      } finally {
        isGeneratingRef.current = false;
        setIsGeneratingSummary(false);
      }
    }, 3000); // 1,5 segundos de debounce

    // Gerar follow-up de forma independente (também com 1,5s de debounce)
    autoFollowUpTimeoutRef.current = setTimeout(async () => {
      // Verificar se não está gerando follow-up
      if (isGeneratingFollowUpRef.current) return;
      if (summaryMessagesBuffer.current.length === 0) return;
      
      console.log(`[TranscriptionWindow] Gerando follow-up (buffer: ${summaryMessagesBuffer.current.length} mensagens)`);
      
      isGeneratingFollowUpRef.current = true;
      setIsGeneratingFollowUp(true);
      
      try {
        const transcription = [...summaryMessagesBuffer.current];
        const followUpResult = await window.electron.summary.generateFollowUp(transcription);
        
        if (followUpResult.success && followUpResult.topics.length > 0) {
          // Adicionar ao histórico mantendo apenas as 2 últimas gerações
          setFollowUpHistory(prev => {
            const newHistory = [...prev, followUpResult.topics];
            // Manter apenas as 2 últimas gerações
            return newHistory.slice(-2);
          });
          setIsBottomPanelExpanded(true); // Expandir automaticamente quando tiver tópicos
          console.log(`[TranscriptionWindow] Follow-up gerado: ${followUpResult.topics.length} tópicos`);
        }
      } catch (followUpError) {
        console.error('[TranscriptionWindow] Erro ao gerar follow-up:', followUpError);
      } finally {
        isGeneratingFollowUpRef.current = false;
        setIsGeneratingFollowUp(false);
      }
    }, 3000); // 1,5 segundos de debounce

    return () => {
      if (autoSummaryTimeoutRef.current) {
        clearTimeout(autoSummaryTimeoutRef.current);
      }
      if (autoFollowUpTimeoutRef.current) {
        clearTimeout(autoFollowUpTimeoutRef.current);
      }
    };
  }, [messages, isPaused]); // Removido isGeneratingSummary das dependências

  // ========================================
  // MANTER REF DE MENSAGENS ATUALIZADO
  // ========================================
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Refs para configurações (evita recriar intervalo quando mudam)
  const includeAvatarRef = useRef(includeAvatarInConversation);
  const avatarInteractionCountRef = useRef(avatarInteractionCount);
  const avatarInteractionModeRef = useRef(avatarInteractionMode);
  const avatarResponseChanceRef = useRef(avatarResponseChance);
  const summaryChatHistoryRef = useRef(summaryChatHistory);
  
  // Manter refs atualizados
  useEffect(() => {
    includeAvatarRef.current = includeAvatarInConversation;
  }, [includeAvatarInConversation]);
  
  useEffect(() => {
    avatarInteractionCountRef.current = avatarInteractionCount;
  }, [avatarInteractionCount]);
  
  useEffect(() => {
    avatarInteractionModeRef.current = avatarInteractionMode;
  }, [avatarInteractionMode]);
  
  useEffect(() => {
    avatarResponseChanceRef.current = avatarResponseChance;
  }, [avatarResponseChance]);
  
  useEffect(() => {
    summaryChatHistoryRef.current = summaryChatHistory;
  }, [summaryChatHistory]);

  // ========================================
  // ENVIO PERIÓDICO DE CONTEXTO PARA O AVATAR
  // ========================================
  useEffect(() => {
    // Criar intervalo apenas uma vez quando 'Incluir Avatar' for ativado
    if (!includeAvatarInConversation) return;
    
    console.log('[TranscriptionWindow] 🚀 Iniciando verificação periódica de contexto (a cada 3s)');
    
    const contextIntervalRef = setInterval(async () => {
      // Verificar se ainda está ativado
      if (!includeAvatarRef.current) return;
      
      // Usar ref para pegar mensagens atuais (evita stale closure)
      const currentMessages = messagesRef.current;
      if (currentMessages.length === 0) return;
      
      // Usar sempre o valor configurado pelo usuário como threshold
      const minNewMessages = avatarInteractionCountRef.current;
      
      // Contar apenas mensagens que NÃO são do avatar (ASSISTENTE)
      const nonAvatarMessages = currentMessages.filter(m => m.speaker.toUpperCase() !== 'ASSISTENTE');
      const newNonAvatarMessagesCount = nonAvatarMessages.length - lastContextSentMessageCount.current;
      
      if (newNonAvatarMessagesCount < minNewMessages) {
        console.log(`[TranscriptionWindow] ⏳ Aguardando (${newNonAvatarMessagesCount}/${minNewMessages} novas, modo: ${avatarInteractionModeRef.current})`);
        return;
      }
      
      // No modo dinâmico, X% de chance de pular esta oportunidade
      if (avatarInteractionModeRef.current === 'dynamic') {
        const chancePercent = avatarResponseChanceRef.current;
        const shouldRespond = Math.random() < (chancePercent / 100);
        if (!shouldRespond) {
          console.log(`[TranscriptionWindow] 🎲 Modo dinâmico: pulando esta vez (${chancePercent}% chance)`);
          // Atualizar contador mesmo pulando, para não acumular
          lastContextSentMessageCount.current = nonAvatarMessages.length;
          return;
        }
        console.log(`[TranscriptionWindow] 🎲 Modo dinâmico: avatar vai responder! (${chancePercent}% chance)`);
      }
      
      try {
        // Converter messages para o formato esperado pelo backend
        const fullHistory = currentMessages.map(m => ({
          speaker: m.speaker,
          text: m.text
        }));
        
        // Pegar o último resumo do histórico de chat (se existir)
        const currentSummaryHistory = summaryChatHistoryRef.current;
        const lastSummary = currentSummaryHistory.length > 0 
          ? currentSummaryHistory[currentSummaryHistory.length - 1].content 
          : undefined;
        
        console.log(`[TranscriptionWindow] ⏰ Enviando contexto (${fullHistory.length} mensagens, ${newNonAvatarMessagesCount} novas sem avatar, threshold: ${minNewMessages})...`);
        
        const contextResult = await window.electron?.sendConversationContext?.({
          transcriptions: fullHistory,
          summary: lastSummary
        });
        
        if (contextResult?.sent) {
          // Atualizar o contador com base em mensagens não-avatar
          lastContextSentMessageCount.current = nonAvatarMessages.length;
          console.log(`[TranscriptionWindow] ✅ Contexto enviado (${fullHistory.length} mensagens)`);
        } else if (contextResult?.success) {
          console.warn(`[TranscriptionWindow] ⚠️ Contexto NÃO enviado:`, contextResult.reason || 'Verifique se está no modo Live');
        }
      } catch (error) {
        console.error('[TranscriptionWindow] ❌ Erro ao enviar contexto periódico:', error);
      }
    }, 3000); // 3 segundos (verificação mais frequente)
    
    return () => {
      console.log('[TranscriptionWindow] 🛑 Parando verificação periódica de contexto');
      clearInterval(contextIntervalRef);
    };
  }, [includeAvatarInConversation]); // Só recria quando toggle liga/desliga


  const addMessage = (speaker: string, text: string) => {
    // Remove avatar tags from transcription display
    let cleanText = text.replace(/\{\{(mood|gesture):\w+\}\}/g, '').trim();
    
    // Normaliza espaços múltiplos para um único espaço
    cleanText = cleanText.replace(/\s+/g, ' ');
    
    if (!cleanText) return;

    setMessages(prev => [...prev, {
      id: Date.now().toString() + Math.random(),
      speaker,
      text: cleanText,
      timestamp: new Date()
    }]);
  };

  // Handlers de scroll para detectar se usuário está no final
  const handleTranscriptionScroll = () => {
    const container = transcriptionScrollRef.current;
    if (container) {
      const threshold = 20; // Tolerância de 20px
      const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
      isUserAtBottomTranscription.current = isAtBottom;
    }
  };

  const handleSummaryScroll = () => {
    const container = summaryScrollRef.current;
    if (container) {
      const threshold = 20;
      const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
      isUserAtBottomSummary.current = isAtBottom;
    }
  };

  // Função para alternar entre abas preservando a posição do scroll
  const handleTabChange = (newTab: TabMode) => {
    if (newTab === activeTab) return;
    
    // Salvar posição atual
    if (activeTab === 'transcription' && transcriptionScrollRef.current) {
      transcriptionScrollPosition.current = transcriptionScrollRef.current.scrollTop;
    } else if (activeTab === 'summary' && summaryScrollRef.current) {
      summaryScrollPosition.current = summaryScrollRef.current.scrollTop;
    }
    
    // Mudar aba
    setActiveTab(newTab);
    
    // Restaurar posição da nova aba após renderizar
    requestAnimationFrame(() => {
      if (newTab === 'transcription' && transcriptionScrollRef.current) {
        transcriptionScrollRef.current.scrollTop = transcriptionScrollPosition.current;
      } else if (newTab === 'summary' && summaryScrollRef.current) {
        summaryScrollRef.current.scrollTop = summaryScrollPosition.current;
      }
    });
  };

  // Auto-scroll para transcrições (só se estiver no final e houver mensagens)
  useEffect(() => {
    if (messages.length === 0) return;
    
    if (isUserAtBottomTranscription.current && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Auto-scroll para resumos (só se estiver no final e houver conteúdo)
  useEffect(() => {
    // Só fazer scroll se há conteúdo real
    if (!summaryContent && summaryChatHistory.length === 0) return;
    
    if (isUserAtBottomSummary.current && summaryEndRef.current) {
      summaryEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [summaryChatHistory, summaryContent]);

  // Click-through for transparent areas - usando uma abordagem mais estável
  useEffect(() => {
    // Estado inicial: permitir eventos do mouse
    window.electron?.setIgnoreMouseEvents?.(false);

    let isMouseOverWindow = false;

    const enableMouseEvents = () => {
      if (!isMouseOverWindow || isResizing || isOverResizeHandle) {
        isMouseOverWindow = true;
        window.electron?.setIgnoreMouseEvents?.(false);
      }
    };

    const disableMouseEvents = (e: MouseEvent) => {
      // Só desabilita se realmente saiu da janela e não está redimensionando ou sobre o handle
      if (!isResizing && !isOverResizeHandle && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const isOutside = 
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom;
        
        if (isOutside) {
          isMouseOverWindow = false;
          window.electron?.setIgnoreMouseEvents?.(true, { forward: true });
        }
      }
    };

    // Adicionar listeners nos elementos específicos
    const container = containerRef.current;

    if (container) {
      container.addEventListener('mouseenter', enableMouseEvents);
      container.addEventListener('mouseleave', disableMouseEvents as any);
    }

    return () => {
      if (container) {
        container.removeEventListener('mouseenter', enableMouseEvents);
        container.removeEventListener('mouseleave', disableMouseEvents as any);
      }
      // Restore mouse events on unmount
      window.electron?.setIgnoreMouseEvents?.(false);
    };
  }, [isResizing, isOverResizeHandle]);

  // Listen for transcriptions from IPC (apenas para "VOCÊ" - microfone)
  useEffect(() => {
    if (!window.electron) return;

    const handleUserTranscription = (text: string) => {
      if (isPaused) return;

      console.log('[TranscriptionWindow] User:', text);
      
      // Acumula fragmentos - adiciona espaço apenas se o buffer não estiver vazio
      userTranscriptionBuffer.current += text;

      // Clear previous timeout
      if (userTimeoutRef.current) {
        clearTimeout(userTimeoutRef.current);
      }

      // Se tem buffer do desktop, finaliza ele primeiro
      if (desktopTranscriptionBuffer.current.trim()) {
        addMessage('OUTROS', desktopTranscriptionBuffer.current.trim());
        desktopTranscriptionBuffer.current = '';
      }

      // Set new timeout para consolidar (reduzido para 1s)
      userTimeoutRef.current = setTimeout(() => {
        if (userTranscriptionBuffer.current.trim()) {
          addMessage('VOCÊ', userTranscriptionBuffer.current.trim());
          userTranscriptionBuffer.current = '';
        }
      }, 1000);
    };

    const unsubscribeUser = window.electron.onUserTranscription(handleUserTranscription);

    return () => {
      // Cleanup
      if (unsubscribeUser) unsubscribeUser();
      if (userTimeoutRef.current) clearTimeout(userTimeoutRef.current);
    };
  }, [isPaused]);

  // Listen for model transcriptions (avatar) para filtrar do desktop
  useEffect(() => {
    if (!window.electron) return;

    const handleModelTranscription = (text: string) => {
      if (isPaused) return;

      console.log('[TranscriptionWindow] Model (Avatar):', text);
      
      // Limpar tags de avatar e audio do texto antes de armazenar
      let cleanText = text
        .replace(/\{\{(mood|gesture):\w+\}\}/g, '') // Remove tags de avatar
        .replace(/\[[\w\s]+\]/g, '')                // Remove tags de áudio [sarcastically], [laughs], etc
        .trim();
      
      if (!cleanText) return;

      // Adicionar ao buffer de transcrições do modelo
      modelTranscriptionBuffer.current.push({
        text: cleanText,
        timestamp: Date.now()
      });

      // Limpar transcrições antigas do buffer (manter últimos 20 segundos)
      // Tempo maior para dar chance do Deepgram consolidar antes de expirar
      const BUFFER_MAX_AGE = 20000;
      const now = Date.now();
      modelTranscriptionBuffer.current = modelTranscriptionBuffer.current.filter(
        t => (now - t.timestamp) < BUFFER_MAX_AGE
      );

      // Log do buffer atualizado com preview do texto consolidado
      const previewText = modelTranscriptionBuffer.current
        .map(t => t.text)
        .join(' ')
        .substring(0, 100);
      
      // console.log(`[TranscriptionFilter] Buffer do modelo: ${modelTranscriptionBuffer.current.length} fragmentos`);
      // console.log(`[TranscriptionFilter] Preview: "${previewText}..."`);
    };

    const unsubscribeModel = window.electron.onModelTranscription?.(handleModelTranscription);

    return () => {
      if (unsubscribeModel) unsubscribeModel();
    };
  }, [isPaused]);

  // Manual resize implementation
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsResizing(true);
    // Garantir que os eventos do mouse sejam capturados durante o resize
    window.electron?.setIgnoreMouseEvents?.(false);

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = window.innerWidth;
    const startHeight = window.innerHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const newWidth = Math.max(300, Math.min(startWidth + deltaX, window.screen.availWidth - 100));
      const newHeight = Math.max(300, Math.min(startHeight + deltaY, window.screen.availHeight - 100));

      window.electron?.resizeWindow?.(newWidth, newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else if (typeof window !== 'undefined' && window.close) {
      window.close();
    }
  };

  const handleStop = () => {
    handleClose();
  };

  // Abortar geração em andamento
  const handleAbortSummary = () => {
    window.electron?.summary?.abort();
    setIsGeneratingSummary(false);
  };

  return (
    <div className="w-full h-screen flex flex-col p-2">
      {/* Main Container */}
      <div 
        ref={containerRef} 
        className="flex-1 bg-[#0a0a0a] rounded-xl shadow-2xl border border-[#222] flex flex-col overflow-hidden relative"
        style={{ opacity: windowOpacity / 100 }}
      >
        
        {/* Header */}
        <div 
          className="h-14 bg-[#0f0f0f] flex items-center justify-center px-2 sm:px-3 gap-2 sm:gap-3 flex-shrink-0 border-b border-[#222] window-drag"
        >
          {/* Language Selector foi movido para Configurações */}

          {/* Tab Toggle - Transcription/Summary */}
          <div 
            className="flex items-center bg-[#1a1a1a] rounded-lg p-0.5 border border-[#2a2a2a] flex-1 max-w-[200px] min-w-0 overflow-hidden"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <button
              onClick={() => handleTabChange('transcription')}
              className={`flex-1 flex items-center justify-center px-1.5 sm:px-2 py-1 rounded text-xs font-medium transition-all min-w-0 ${
                activeTab === 'transcription'
                  ? 'bg-[#2a2a2a] text-white'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <span className="truncate">Transcrição</span>

            </button>
            <button
              onClick={() => handleTabChange('summary')}
              className={`flex-1 flex items-center justify-center px-1.5 sm:px-2 py-1 rounded text-xs font-medium transition-all min-w-0 ${
                activeTab === 'summary'
                  ? 'bg-[#2a2a2a] text-white'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <span className="truncate">Resumo</span>

            </button>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 sm:gap-1.5 bg-[#1a1a1a] rounded-lg px-1 sm:px-1.5 py-1 border border-[#2a2a2a] flex-shrink-0 ml-auto" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded hover:bg-[#252525] text-gray-400 hover:text-white transition-colors"
              title={isPaused ? 'Retomar' : 'Pausar'}
            >
              {isPaused ? (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              ) : (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
                </svg>
              )}
            </button>
            
            <button
              onClick={handleStop}
              className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded hover:bg-[#252525] bg-red-600/10 text-red-500 hover:text-red-400 transition-colors"
              title="Parar"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="5" width="14" height="14"/>
              </svg>
            </button>

            <button
              onClick={() => window.electron?.minimizeTranscriptionWindow?.()}
              className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded hover:bg-[#252525] text-gray-400 hover:text-white transition-colors"
              title="Minimizar"
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Content Area - Condicional baseado na aba ativa */}
        {activeTab === 'transcription' ? (
          /* Chat Messages - Aba Transcrição */
          <div 
            ref={transcriptionScrollRef}
            onScroll={handleTranscriptionScroll}
            className="flex-1 overflow-y-auto px-3 py-2 space-y-2 bg-black" 
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#1a1a1a #0a0a0a',
              fontSize: `${summaryFontSize}px`
            }}
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.speaker === 'VOCÊ' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] ${message.speaker === 'VOCÊ' ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                  <span className={`text-[9px] font-semibold tracking-wide uppercase ${
                    message.speaker === 'VOCÊ' 
                      ? 'text-blue-400' 
                      : message.speaker === 'ASSISTENTE' 
                        ? 'text-purple-400' 
                        : 'text-gray-500'
                  }`}>
                    {message.speaker}
                  </span>
                  <div className={`px-2.5 py-1.5 rounded-md leading-snug ${
                    message.speaker === 'VOCÊ'
                      ? 'bg-blue-600 text-white'
                      : message.speaker === 'ASSISTENTE'
                        ? 'bg-purple-600/80 text-white'
                        : 'bg-[#1f1f1f] text-white'
                  }`}>
                    {message.text}
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        ) : (
          /* Summary Tab - Aba Resumo - Interface Minimalista */
          <div ref={summaryContainerRef} className="flex-1 flex flex-col overflow-hidden bg-black">
            {/* Área de Conteúdo do Resumo - ocupa o restante quando painel inferior expandido */}
            <div 
              ref={summaryScrollRef}
              onScroll={handleSummaryScroll}
              className={`overflow-y-auto px-4 py-3 ${isDraggingPanel ? '' : 'transition-all duration-300'}`} 
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#1a1a1a #000',
                flex: isBottomPanelExpanded ? `1 1 ${100 - bottomPanelHeight}%` : '1 1 auto',
                fontSize: `${summaryFontSize}px`
              }}
            >
              {/* Estado Inicial - Aguardando */}
              {!summaryContent && summaryChatHistory.length === 0 && !isGeneratingSummary && (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-500 text-xs">
                    {messages.length === 0 
                      ? 'Aguardando transcrição...' 
                      : 'Analisando conversa...'
                    }
                  </p>
                </div>
              )}

              {/* Histórico de Chat */}
              {summaryChatHistory.map((chat, index) => (
                <div key={index} className="mb-4">
                  {chat.role === 'user' ? (
                    <div className="text-right">
                      <p className="text-gray-400 leading-relaxed whitespace-pre-wrap inline-block text-left max-w-[90%]">
                        → {chat.content}
                      </p>
                    </div>
                  ) : (
                    <LightMarkdown content={chat.content} onWordClick={handleWordClick} />
                  )}
                </div>
              ))}

              {/* Resumo sendo gerado (streaming) - só mostra se há conteúdo */}
              {summaryContent && summaryChatHistory.length === 0 && (
                <div>
                  <LightMarkdown content={summaryContent} onWordClick={handleWordClick} />
                  {isGeneratingSummary && (
                    <span className="inline-block w-1 h-3 bg-white/50 ml-0.5 animate-pulse" />
                  )}
                </div>
              )}

              {/* Resposta sendo gerada (streaming durante pergunta) - só mostra se há conteúdo */}
              {summaryContent && summaryChatHistory.length > 0 && (
                <div className="mb-4">
                  <LightMarkdown content={summaryContent} onWordClick={handleWordClick} />
                  {isGeneratingSummary && (
                    <span className="inline-block w-1 h-3 bg-white/50 ml-0.5 animate-pulse" />
                  )}
                </div>
              )}
              <div ref={summaryEndRef} />
            </div>

            {/* Botão de parar geração - só mostra se há conteúdo sendo gerado */}
            {isGeneratingSummary && summaryContent && (
              <div className="px-3 py-2 bg-black flex justify-center">
                <button
                  onClick={handleAbortSummary}
                  className="px-4 py-1 text-gray-400 text-xs hover:text-white transition-colors"
                >
                  × Parar
                </button>
              </div>
            )}

            {/* Painel Inferior Colapsável - altura ajustável */}
            <div 
              className={`relative bg-[#0a0a0a] flex flex-col ${isDraggingPanel ? '' : 'transition-all duration-300 ease-in-out'}`}
              style={{
                flex: isBottomPanelExpanded ? `0 0 ${bottomPanelHeight}%` : '0 0 auto',
                minHeight: isBottomPanelExpanded ? `${bottomPanelHeight}%` : 'auto'
              }}
            >
              {/* Linha separadora arrastável - posicionada no topo absoluto */}
              <div 
                className={`absolute top-0 left-0 right-0 flex items-center justify-center h-3 ${
                  isDraggingPanel ? 'cursor-row-resize' : 'cursor-row-resize'
                }`}
                style={{ transform: 'translateY(-50%)' }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsDraggingPanel(true);
                  wasDraggingRef.current = false;
                  
                  const startY = e.clientY;
                  const startHeight = bottomPanelHeight;
                  const containerHeight = summaryContainerRef.current?.clientHeight || 400;
                  
                  const handleMouseMove = (moveEvent: MouseEvent) => {
                    wasDraggingRef.current = true;
                    const deltaY = startY - moveEvent.clientY;
                    const deltaPercent = (deltaY / containerHeight) * 100;
                    const newHeight = Math.max(10, Math.min(70, startHeight + deltaPercent));
                    setBottomPanelHeight(newHeight);
                    
                    if (!isBottomPanelExpanded) {
                      setIsBottomPanelExpanded(true);
                    }
                  };
                  
                  const handleMouseUp = () => {
                    setIsDraggingPanel(false);
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                  };
                  
                  document.addEventListener('mousemove', handleMouseMove);
                  document.addEventListener('mouseup', handleMouseUp);
                }}
              >
                {/* Linha esquerda */}
                <div className="flex-1 h-px bg-[#222] hover:bg-[#444] transition-colors" />
                {/* Botão para expandir/colapsar */}
                <button
                  className="flex items-center justify-center px-2 hover:opacity-100 opacity-70 transition-opacity group"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!wasDraggingRef.current) {
                      setIsBottomPanelExpanded(!isBottomPanelExpanded);
                    }
                    wasDraggingRef.current = false;
                  }}
                >
                  <svg 
                    width="18" 
                    height="18" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                    className={`text-gray-500 group-hover:text-gray-300 transition-all duration-300 ${
                      isBottomPanelExpanded ? 'rotate-0' : 'rotate-180 animate-pulse -translate-y-1'
                    }`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {/* Linha direita */}
                <div className="flex-1 h-px bg-[#222] hover:bg-[#444] transition-colors" />
              </div>
              
              {/* Conteúdo do Painel - visível apenas quando expandido */}
              {isBottomPanelExpanded && (
                <div className="flex-1 overflow-y-auto px-4 pt-3 pb-2" style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: '#1a1a1a #0a0a0a',
                  fontSize: `${summaryFontSize}px`
                }}>
                  {/* Estado de carregamento - só mostra se não tem histórico */}
                  {isGeneratingFollowUp && followUpHistory.length === 0 && (
                    <div className="flex items-center justify-center h-full">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" />
                        <p className="text-gray-500 text-xs">Gerando sugestões...</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Lista de tópicos inline - mostra todas as gerações do histórico */}
                  {followUpHistory.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-['Montserrat',sans-serif]">
                      {followUpHistory.flat().map((topic, index) => (
                        <button
                          key={index}
                          className="inline-flex items-center gap-1.5 text-white text-xs transition-all hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                          onClick={() => {
                            // TODO: Perguntar ao assistente sobre este tópico
                            console.log('[TranscriptionWindow] Tópico selecionado:', topic);
                          }}
                        >
                          <Lightbulb className="w-3 h-3 text-yellow-500" />
                          <span>{topic}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {/* Estado vazio */}
                  {!isGeneratingFollowUp && followUpHistory.length === 0 && (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-gray-600 text-xs">Aguardando análise da conversa...</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audio Meters Section */}
        <div className="border-t border-[#222] bg-[#0f0f0f] px-4 py-3 flex-shrink-0">
          {/* Header com Toggles */}
          <div className="flex items-center justify-between mb-3">
            {/* Toggle de Medidores de Áudio */}
            <button
              onClick={() => setShowAudioMeters(!showAudioMeters)}
              className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] hover:bg-[#252525] rounded-full transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-gray-400">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
              <span className="text-xs font-medium text-white">Medidores de áudio</span>
              <span className="text-[10px] text-gray-500 ml-1">
                {showAudioMeters ? 'Clique para ocultar' : 'Clique para mostrar'}
              </span>
            </button>

            {/* Toggle de Filtragem foi movido para Configurações */}

            {/* Botão de Configurações (Engrenagem) */}
            <div className="relative" ref={settingsPopupRef}>
              <button
                onClick={() => setShowSettingsPopup(!showSettingsPopup)}
                className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                  showSettingsPopup ? 'bg-[#333] text-white' : 'bg-[#1a1a1a] hover:bg-[#252525] text-gray-400 hover:text-white'
                }`}
                title="Configurações de aparência"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>

              {/* Popup de Configurações */}
              {showSettingsPopup && (
                <div 
                  className="fixed top-2 right-2 w-64 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl z-50 overflow-hidden"
                  style={{ maxHeight: 'calc(100vh - 100px)' }}
                >
                  {/* Header fixo */}
                  <div className="flex items-center justify-between p-4 pb-2 border-b border-[#333]">
                    <h3 className="text-white text-sm font-medium">Configurações</h3>
                    <button
                      onClick={() => setShowSettingsPopup(false)}
                      className="text-gray-500 hover:text-white transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>

                  {/* Conteúdo com scroll estilizado */}
                  <div 
                    className="p-4 overflow-y-auto settings-scrollbar" 
                    style={{ maxHeight: 'calc(100vh - 220px)' }}
                  >
                    {/* Tamanho da Fonte */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-gray-400 text-xs">Tamanho da Fonte</label>
                        <span className="text-white text-xs font-mono">{summaryFontSize}px</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="20"
                        value={summaryFontSize}
                        onChange={(e) => setSummaryFontSize(Number(e.target.value))}
                        className="w-full h-1 bg-[#333] rounded-full appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>

                    {/* Opacidade da Janela */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-gray-400 text-xs">Opacidade da Janela</label>
                        <span className="text-white text-xs font-mono">{windowOpacity}%</span>
                      </div>
                      <input
                        type="range"
                        min="30"
                        max="100"
                        value={windowOpacity}
                        onChange={(e) => setWindowOpacity(Number(e.target.value))}
                        className="w-full h-1 bg-[#333] rounded-full appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>

                    {/* Divisor */}
                    <div className="h-px bg-[#333] my-4" />

                    {/* Idioma + Incluir Avatar (na mesma linha) */}
                    <div className="flex items-center gap-3">
                      {/* Select de Idioma (compacto) */}
                      <select 
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="flex-1 bg-[#252525] text-white text-[10px] px-2 py-1.5 rounded-lg border border-[#333] focus:outline-none cursor-pointer"
                      >
                        <option>🇧🇷 PT-BR</option>
                        <option>🇺🇸 EN-US</option>
                        <option>🇪🇸 ES</option>
                      </select>

                      {/* Toggle Incluir Avatar */}
                      <div className="flex items-center gap-1.5">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={includeAvatarInConversation ? 'text-purple-400' : 'text-gray-500'}>
                          <circle cx="12" cy="8" r="5"/>
                          <path d="M20 21a8 8 0 0 0-16 0"/>
                        </svg>
                        <label className="text-gray-400 text-[12px]">Avatar</label>
                        <button
                          onClick={() => setIncludeAvatarInConversation(!includeAvatarInConversation)}
                          className={`relative w-8 h-4 rounded-full transition-colors ${
                            includeAvatarInConversation ? 'bg-purple-600' : 'bg-gray-600'
                          }`}
                        >
                          <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${
                            includeAvatarInConversation ? 'translate-x-4' : 'translate-x-0.5'
                          }`} />
                        </button>
                      </div>
                    </div>

                    {/* Configurações extras do Avatar (só aparecem quando incluído) */}
                    {includeAvatarInConversation && (
                      <div className="mt-3 pl-4 border-l-2 border-purple-500/30 space-y-3">
                        {/* Quantidade de mensagens */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-gray-400 text-xs">Interagir a cada</label>
                            <span className="text-purple-400 text-xs font-medium">{avatarInteractionCount} msgs</span>
                          </div>
                          <input
                            type="range"
                            min="5"
                            max="60"
                            value={avatarInteractionCount}
                            onChange={(e) => setAvatarInteractionCount(parseInt(e.target.value))}
                            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                          />
                          <div className="flex justify-between text-[9px] text-gray-500 mt-0.5">
                            <span>5</span>
                            <span>60</span>
                          </div>
                        </div>

                        {/* Modo de interação */}
                        <div>
                          <div className="flex items-center justify-between">
                            <label className="text-gray-400 text-xs">Modo dinâmico</label>
                            <button
                              onClick={() => setAvatarInteractionMode(avatarInteractionMode === 'fixed' ? 'dynamic' : 'fixed')}
                              className={`relative w-10 h-5 rounded-full transition-colors ${
                                avatarInteractionMode === 'dynamic' ? 'bg-purple-600' : 'bg-gray-600'
                              }`}
                            >
                              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                                avatarInteractionMode === 'dynamic' ? 'translate-x-5' : 'translate-x-0.5'
                              }`} />
                            </button>
                          </div>
                          <p className="text-[9px] text-gray-500 mt-1">
                            {avatarInteractionMode === 'dynamic' 
                              ? `${avatarResponseChance}% de chance de responder a cada ${avatarInteractionCount} msgs` 
                              : `Sempre responde após ${avatarInteractionCount} msgs`}
                          </p>
                          
                          {/* Slider de porcentagem (só aparece no modo dinâmico) */}
                          {avatarInteractionMode === 'dynamic' && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-gray-400 text-xs">Chance de resposta</label>
                                <span className="text-purple-400 text-xs font-medium">{avatarResponseChance}%</span>
                              </div>
                              <input
                                type="range"
                                min="40"
                                max="90"
                                value={avatarResponseChance}
                                onChange={(e) => setAvatarResponseChance(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                              />
                              <div className="flex justify-between text-[9px] text-gray-500 mt-0.5">
                                <span>40%</span>
                                <span>90%</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Audio Meters */}
          {showAudioMeters && (
            <div className="space-y-3">
              {/* User Audio Meter */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-semibold text-white w-14 uppercase tracking-wide">VOCÊ</span>
                <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-75"
                    style={{ 
                      width: `${userAudioLevel}%`,
                      background: 'linear-gradient(90deg, #06b6d4, #22d3ee)'
                    }}
                  />
                </div>
                <button className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
              </div>

              {/* Others Audio Meter */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-semibold text-white w-14 uppercase tracking-wide truncate" title={selectedAudioSourceName}>{selectedAudioSourceName}</span>
                <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-75"
                    style={{ 
                      width: `${otherAudioLevel}%`,
                      background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)'
                    }}
                  />
                </div>
                <button 
                  onClick={() => setShowSourceSelector(true)}
                  className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
                  title="Selecionar fonte de áudio"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Resize Handle */}
        <div 
          ref={resizeHandleRef}
          onMouseDown={handleResizeStart}
          onMouseEnter={() => {
            setIsOverResizeHandle(true);
            // Garantir que os eventos sejam capturados quando sobre o resize handle
            window.electron?.setIgnoreMouseEvents?.(false);
          }}
          onMouseLeave={() => {
            setIsOverResizeHandle(false);
          }}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize group z-50"
          style={{ 
            WebkitAppRegion: 'no-drag',
            // Adicionar uma área maior de hit-testing
            padding: '4px'
          } as React.CSSProperties}
        >
          <div className="absolute bottom-0.5 right-0.5 w-4 h-4 flex items-end justify-end pointer-events-none">
            <svg width="12" height="12" viewBox="0 0 16 16" className="text-gray-600 group-hover:text-gray-400 transition-colors">
              <path fill="currentColor" d="M16 0v16H0L16 0zM14 10l-4 4v-4h4zm0-4l-2 2H8l6-6v4z"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Floating Analyze Button */}
      <div className="flex justify-center mt-3">
        <button className="flex items-center gap-3 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all hover:scale-[1.02] font-medium text-sm">
          <span className="px-2.5 py-0.5 bg-blue-800 rounded text-white text-xs font-semibold">Ctrl+D</span>
          <span>Analisar Transcrição</span>
        </button>
      </div>

      {/* Audio Source Selector Modal */}
      <AudioSourceSelector
        isOpen={showSourceSelector}
        onClose={() => setShowSourceSelector(false)}
        currentSourceId={selectedAudioSourceId}
        onSourceSelect={(sourceId, sourceName) => {
          setSelectedAudioSourceId(sourceId);
          
          // Tentar extrair nome do site se for navegador
          const siteName = extractSiteNameFromBrowserTitle(sourceName);
          const displayName = siteName || sourceName;
          
          setSelectedAudioSourceName(displayName);
          console.log('[TranscriptionWindow] Fonte de áudio selecionada:', displayName, '(original:', sourceName, ')');
        }}
      />
    </div>
  );
}
