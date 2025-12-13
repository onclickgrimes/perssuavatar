import React, { useState, useRef, useEffect } from 'react';
import { useDesktopAudioTranscriber } from '../hooks/useDesktopAudioTranscriber';
import { useMicrophoneAudioLevel } from '../hooks/useMicrophoneAudioLevel';
import AudioSourceSelector from './AudioSourceSelector';

interface TranscriptionWindowProps {
  onClose?: () => void;
}

type TabMode = 'transcription' | 'summary';

type Message = {
  id: string;
  speaker: 'VOCÊ' | 'OUTROS';
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

  console.log(`[TranscriptionFilter] 🔍 Texto desktop normalizado: "${normalizedDesktop}"`);
  console.log(`[TranscriptionFilter] 🔍 Modelo consolidado: ${consolidatedModelText.length} caracteres`);
  console.log(`[TranscriptionFilter] 🔍 Modelo consolidado normalizado: "${consolidatedModelText.substring(0, 150)}..."`);

  // 1. Verificar se o texto do desktop está contido no modelo consolidado
  if (consolidatedModelText.includes(normalizedDesktop)) {
    console.log(`[TranscriptionFilter] ✅ Descartando (substring encontrada no modelo consolidado):`);
    console.log(`  Desktop: "${text}"`);
    console.log(`  Modelo consolidado: "${consolidatedModelText}"`);
    return true;
  }

  // 2. Verificar se o modelo consolidado está contido no desktop
  if (normalizedDesktop.includes(consolidatedModelText) && consolidatedModelText.length > 5) {
    console.log(`[TranscriptionFilter] ✅ Descartando (modelo consolidado encontrado no desktop):`);
    console.log(`  Desktop: "${text}"`);
    console.log(`  Modelo consolidado: "${consolidatedModelText}"`);
    return true;
  }

  // 3. Verificar similaridade com o texto consolidado
  if (consolidatedModelText.length > 0) {
    const similarity = calculateSimilarity(normalizedDesktop, consolidatedModelText);
    
    if (similarity >= similarityThreshold) {
      console.log(`[TranscriptionFilter] ✅ Descartando (${similarity.toFixed(1)}% similar ao consolidado):`);
      console.log(`  Desktop: "${text}"`);
      console.log(`  Modelo consolidado: "${consolidatedModelText}"`);
      return true;
    }
    
    console.log(`[TranscriptionFilter] 📊 Similaridade: ${similarity.toFixed(1)}% (threshold: ${similarityThreshold}%)`);
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
    console.log(`[TranscriptionFilter] 📊 Palavras em comum: ${matchingWords}/${words.length} = ${wordMatchPercentage.toFixed(1)}%`);
    
    if (wordMatchPercentage >= 70) {
      console.log(`[TranscriptionFilter] ✅ Descartando (${wordMatchPercentage.toFixed(1)}% palavras em comum):`);
      console.log(`  Desktop: "${text}"`);
      console.log(`  Palavras correspondentes: ${matchingWords}/${words.length}`);
      return true;
    }
  }

  console.log(`[TranscriptionFilter] ❌ Não passou em nenhum filtro, liberando como OUTROS`);
  return false;
}

export default function TranscriptionWindow({ onClose }: TranscriptionWindowProps = {}) {
  const [activeTab, setActiveTab] = useState<TabMode>('transcription');
  const [language, setLanguage] = useState('Portuguese (BR)');
  const [isPaused, setIsPaused] = useState(false);
  const [showAudioMeters, setShowAudioMeters] = useState(true);
  const [filterAvatarTranscriptions, setFilterAvatarTranscriptions] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userAudioLevel, setUserAudioLevel] = useState(0);
  const [otherAudioLevel, setOtherAudioLevel] = useState(0);
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [selectedAudioSourceId, setSelectedAudioSourceId] = useState<string | null>(null);
  
  // Estados para a aba de Resumo
  const [summaryContent, setSummaryContent] = useState<string>('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryChatHistory, setSummaryChatHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [selectedAssistantName, setSelectedAssistantName] = useState<string>('Carregando...');
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isOverResizeHandle, setIsOverResizeHandle] = useState(false);

  // Buffers para acumular fragmentos de transcrição
  const userTranscriptionBuffer = useRef<string>('');
  const desktopTranscriptionBuffer = useRef<string>('');
  const userTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const desktopTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Buffer de transcrições do modelo (avatar) para comparação
  const modelTranscriptionBuffer = useRef<ModelTranscription[]>([]);

  // Refs para geração automática de resumo
  const autoSummaryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedMessageCount = useRef<number>(0);
  const summaryEndRef = useRef<HTMLDivElement>(null);

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
            
            console.log(`[TranscriptionFilter] 🔍 Verificando transcrição do desktop: "${desktopText}"`);
            console.log(`[TranscriptionFilter] 🔍 Filtro de avatar: ${filterAvatarTranscriptions ? 'ATIVO' : 'DESATIVADO'}`);
            console.log(`[TranscriptionFilter] 🔍 Buffer do modelo tem ${modelTranscriptionBuffer.current.length} fragmentos para comparar`);
            
            // ✅ FILTRAR TRANSCRIÇÕES DO AVATAR (se habilitado)
            let shouldAdd = true;
            
            if (filterAvatarTranscriptions) {
              // Verifica se a transcrição do desktop é similar ao que o modelo disse
              const isFiltered = isSimilarToModelTranscription(desktopText, modelTranscriptionBuffer.current);
              
              if (isFiltered) {
                console.log('[TranscriptionFilter] ❌ Transcrição filtrada (é do avatar)');
                shouldAdd = false;
              } else {
                console.log(`[TranscriptionFilter] ✅ Transcrição aprovada, adicionando como OUTROS`);
              }
            } else {
              console.log(`[TranscriptionFilter] ⚠️ Filtro desativado, adicionando sem verificar`);
            }
            
            if (shouldAdd) {
              addMessage('OUTROS', desktopText);
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

  // Iniciar transcrição do desktop e monitoramento do microfone automaticamente quando a janela abrir
  useEffect(() => {
    console.log('[TranscriptionWindow] Iniciando transcrição do desktop e monitoramento do microfone...');
    startTranscribing();
    startMonitoring();

    return () => {
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

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto scroll na aba de resumo quando novo conteúdo chega
  useEffect(() => {
    if (activeTab === 'summary') {
      summaryEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [summaryContent, summaryChatHistory, activeTab]);

  // Geração automática de resumo/feedback quando novas mensagens chegam
  useEffect(() => {
    if (!window.electron?.summary) return;
    if (isPaused) return;
    if (messages.length === 0) return;
    
    // Só gera se tem mensagens novas desde a última geração
    const newMessagesCount = messages.length - lastProcessedMessageCount.current;
    if (newMessagesCount <= 0) return;

    // Limpar timeout anterior
    if (autoSummaryTimeoutRef.current) {
      clearTimeout(autoSummaryTimeoutRef.current);
    }

    // Aguardar 4 segundos de "silêncio" antes de gerar feedback
    // Isso permite que a conversa se desenvolva antes de interromper com análise
    autoSummaryTimeoutRef.current = setTimeout(async () => {
      // Verificar novamente se ainda não está gerando
      if (isGeneratingSummary) return;
      
      // Só gerar se tem pelo menos 2 mensagens novas ou é a primeira geração
      const needsGeneration = newMessagesCount >= 2 || (lastProcessedMessageCount.current === 0 && messages.length >= 1);
      if (!needsGeneration) return;

      // Pegar apenas as mensagens NOVAS (a partir do último índice processado)
      const startIndex = lastProcessedMessageCount.current;
      const newMessages = messages.slice(startIndex);
      
      console.log(`[TranscriptionWindow] Gerando feedback (${newMessages.length} novas mensagens, índice ${startIndex}-${messages.length})`);
      
      setIsGeneratingSummary(true);
      setSummaryContent('');
      
      try {
        // Converter apenas as mensagens NOVAS para o formato esperado
        const transcription = newMessages.map(m => ({
          speaker: m.speaker,
          text: m.text
        }));
        
        const result = await window.electron.summary.generate(transcription);
        
        if (result.success) {
          // Só adicionar ao histórico se tiver conteúdo (IA pode ignorar conversas triviais)
          if (result.result && result.result.trim().length > 0) {
            setSummaryChatHistory(prev => [...prev, { 
              role: 'assistant', 
              content: result.result 
            }]);
            // Resetar o contador - próximas análises começam do índice atual
            lastProcessedMessageCount.current = messages.length;
            console.log(`[TranscriptionWindow] Resumo gerado! Próxima análise começa do índice ${messages.length}`);
          } else {
            // Conversa ignorada, mas ainda atualiza o contador para não reprocessar
            lastProcessedMessageCount.current = messages.length;
            console.log('[TranscriptionWindow] Conversa ignorada pela IA (não relevante)');
          }
          setSummaryContent('');
        } else {
          console.error('[TranscriptionWindow] Erro na geração automática:', result.error);
        }
      } catch (error) {
        console.error('[TranscriptionWindow] Erro na geração automática:', error);
      } finally {
        setIsGeneratingSummary(false);
      }
    }, 4000); // 4 segundos de debounce

    return () => {
      if (autoSummaryTimeoutRef.current) {
        clearTimeout(autoSummaryTimeoutRef.current);
      }
    };
  }, [messages, isPaused, isGeneratingSummary]);

  const addMessage = (speaker: 'VOCÊ' | 'OUTROS', text: string) => {
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
      
      console.log(`[TranscriptionFilter] Buffer do modelo: ${modelTranscriptionBuffer.current.length} fragmentos`);
      console.log(`[TranscriptionFilter] Preview: "${previewText}..."`);
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
      <div ref={containerRef} className="flex-1 bg-[#0a0a0a] rounded-xl shadow-2xl border border-[#222] flex flex-col overflow-hidden relative">
        
        {/* Header */}
        <div 
          className="h-14 bg-[#0f0f0f] flex items-center justify-center px-2 sm:px-3 gap-2 sm:gap-3 flex-shrink-0 border-b border-[#222]"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          {/* Language Selector */}
          <div className="flex items-center flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <select 
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-[#1a1a1a] text-gray-300 text-xs px-2 sm:px-3 py-1.5 rounded-lg border border-[#2a2a2a] focus:outline-none cursor-pointer appearance-none pr-6 sm:pr-8 min-w-0"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 6px center'
              }}
            >
              <option>🇧🇷 Portuguese (BR)</option>
              <option>🇺🇸 English (US)</option>
              <option>🇪🇸 Spanish (ES)</option>
            </select>
          </div>

          {/* Tab Toggle - Transcription/Summary */}
          <div 
            className="flex items-center bg-[#1a1a1a] rounded-lg p-0.5 border border-[#2a2a2a] flex-1 max-w-[200px] min-w-0 overflow-hidden"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <button
              onClick={() => setActiveTab('transcription')}
              className={`flex-1 flex items-center justify-center px-1.5 sm:px-2 py-1 rounded text-xs font-medium transition-all min-w-0 ${
                activeTab === 'transcription'
                  ? 'bg-[#2a2a2a] text-white'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <span className="truncate">Transcrição</span>

            </button>
            <button
              onClick={() => setActiveTab('summary')}
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
          <div className="flex items-center gap-1 sm:gap-1.5 bg-[#1a1a1a] rounded-lg px-1 sm:px-1.5 py-1 border border-[#2a2a2a] flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
              onClick={handleClose}
              className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded hover:bg-[#252525] text-gray-400 hover:text-white transition-colors"
              title="Fechar"
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
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 bg-black" style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#1a1a1a #0a0a0a'
          }}>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.speaker === 'VOCÊ' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] ${message.speaker === 'VOCÊ' ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                  <span className={`text-[9px] font-semibold tracking-wide uppercase ${
                    message.speaker === 'VOCÊ' ? 'text-blue-400' : 'text-gray-500'
                  }`}>
                    {message.speaker}
                  </span>
                  <div className={`px-2.5 py-1.5 rounded-md text-xs leading-snug ${
                    message.speaker === 'VOCÊ'
                      ? 'bg-blue-600 text-white'
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
          <div className="flex-1 flex flex-col overflow-hidden bg-black">
            {/* Área de Conteúdo do Resumo */}
            <div className="flex-1 overflow-y-auto px-4 py-3" style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#1a1a1a #000'
            }}>
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
                      <p className="text-gray-400 text-xs leading-relaxed whitespace-pre-wrap inline-block text-left max-w-[90%]">
                        → {chat.content}
                      </p>
                    </div>
                  ) : (
                    <p className="text-white text-xs leading-relaxed whitespace-pre-wrap">
                      {chat.content}
                    </p>
                  )}
                </div>
              ))}

              {/* Resumo sendo gerado (streaming) */}
              {(summaryContent || isGeneratingSummary) && summaryChatHistory.length === 0 && (
                <p className="text-white text-xs leading-relaxed whitespace-pre-wrap">
                  {summaryContent || (
                    <span className="text-gray-500">...</span>
                  )}
                  {isGeneratingSummary && summaryContent && (
                    <span className="inline-block w-1 h-3 bg-white/50 ml-0.5 animate-pulse" />
                  )}
                </p>
              )}

              {/* Resposta sendo gerada (streaming durante pergunta) */}
              {isGeneratingSummary && summaryChatHistory.length > 0 && (
                <div className="mb-4">
                  <p className="text-white text-xs leading-relaxed whitespace-pre-wrap">
                    {summaryContent || (
                      <span className="text-gray-500">...</span>
                    )}
                    {summaryContent && (
                      <span className="inline-block w-1 h-3 bg-white/50 ml-0.5 animate-pulse" />
                    )}
                  </p>
                </div>
              )}
              <div ref={summaryEndRef} />
            </div>

            {/* Botão de parar geração */}
            {isGeneratingSummary && (
              <div className="px-3 py-2 bg-black flex justify-center">
                <button
                  onClick={handleAbortSummary}
                  className="px-4 py-1 text-gray-400 text-xs hover:text-white transition-colors"
                >
                  × Parar
                </button>
              </div>
            )}
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

            {/* Toggle Compacto de Filtragem do Avatar */}
            <button
              onClick={() => setFilterAvatarTranscriptions(!filterAvatarTranscriptions)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#252525] rounded-full transition-colors border border-[#2a2a2a]"
              title={`Filtro de Avatar ${filterAvatarTranscriptions ? 'ATIVO' : 'DESATIVADO'} - Clique para ${filterAvatarTranscriptions ? 'desativar' : 'ativar'}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={filterAvatarTranscriptions ? 'text-green-400' : 'text-gray-500'}>
                <path d="M22 3L2 3 10 12.46 10 19 14 21 14 12.46 22 3z"/>
              </svg>
              <span className="text-[10px] text-gray-400">Filtro</span>
              {/* iOS-style toggle switch */}
              <div className={`relative w-8 h-4 rounded-full transition-colors ${
                filterAvatarTranscriptions ? 'bg-green-600' : 'bg-gray-600'
              }`}>
                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${
                  filterAvatarTranscriptions ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </div>
            </button>
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
                <span className="text-[10px] font-semibold text-white w-14 uppercase tracking-wide">OUTROS</span>
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
          className="absolute bottom-0 right-0 w-8 h-8 cursor-nwse-resize group z-50"
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
        onSourceSelect={(sourceId) => {
          setSelectedAudioSourceId(sourceId);
          console.log('[TranscriptionWindow] Fonte de áudio selecionada:', sourceId || 'Sistema Inteiro');
          // TODO: Reiniciar transcrição com nova fonte
        }}
      />
    </div>
  );
}
