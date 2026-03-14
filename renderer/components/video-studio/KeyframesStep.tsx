import React, { useState, useEffect, useMemo } from 'react';
import { TranscriptionSegment } from '../../types/video-studio';
import { ChannelNiche } from './NicheModal';

function normalizeWord(w: string) {
  return w.toLowerCase().replace(/[.,!?;:()\[\]{}"'\-—]/g, '');
}

function levenshteinDistance(s1: string, s2: string): number {
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;
  const matrix = [];
  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[s2.length][s1.length];
}

function syncTextWithLevenshtein(deepgramSegments: TranscriptionSegment[], originalScript: string): TranscriptionSegment[] {
  const originalWords = originalScript.trim().split(/\s+/).filter(w => w.length > 0);
  if (originalWords.length === 0) return deepgramSegments;

  const dWords: {text: string, segIdx: number, wordIdx: number}[] = [];
  deepgramSegments.forEach((seg, sIdx) => {
    if (seg.words) {
      seg.words.forEach((w, wIdx) => {
        dWords.push({ text: normalizeWord(w.punctuatedWord || w.word), segIdx: sIdx, wordIdx: wIdx });
      });
    }
  });

  if (dWords.length === 0) return deepgramSegments;

  const oWords = originalWords.map(w => ({ original: w, normalized: normalizeWord(w) }));
  const N = dWords.length;
  const M = oWords.length;

  const dp: number[][] = Array(N + 1).fill(0).map(() => Array(M + 1).fill(0));
  const ptr: number[][] = Array(N + 1).fill(0).map(() => Array(M + 1).fill(0));

  for (let i = 1; i <= N; i++) {
    dp[i][0] = dp[i - 1][0] + 1; 
    ptr[i][0] = 1; // 1 = D deletado
  }
  for (let j = 1; j <= M; j++) {
    dp[0][j] = dp[0][j - 1] + 1;
    ptr[0][j] = 2; // 2 = O inserido
  }

  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= M; j++) {
      const dWord = dWords[i - 1].text;
      const oWord = oWords[j - 1].normalized;
      
      const limit = Math.max(dWord.length, oWord.length, 1);
      const normalizedDist = levenshteinDistance(dWord, oWord) / limit;
      
      const matchCost = dp[i - 1][j - 1] + normalizedDist;
      const delCost = dp[i - 1][j] + 1; 
      const insCost = dp[i][j - 1] + 1; 

      if (matchCost <= delCost && matchCost <= insCost) {
        dp[i][j] = matchCost;
        ptr[i][j] = 0;
      } else if (delCost <= insCost) {
        dp[i][j] = delCost;
        ptr[i][j] = 1;
      } else {
        dp[i][j] = insCost;
        ptr[i][j] = 2;
      }
    }
  }

  let i = N;
  let j = M;
  const alignment = Array(N).fill(0).map(() => [] as string[]);

  while (i > 0 || j > 0) {
    if (i === 0) {
      alignment[0].unshift(oWords[j - 1].original);
      j--;
    } else if (j === 0) {
      i--;
    } else {
      const dir = ptr[i][j];
      if (dir === 0) {
        alignment[i - 1].unshift(oWords[j - 1].original);
        i--;
        j--;
      } else if (dir === 1) {
        i--;
      } else if (dir === 2) {
        alignment[i - 1].unshift(oWords[j - 1].original);
        j--;
      }
    }
  }

  const newSegments = JSON.parse(JSON.stringify(deepgramSegments)) as TranscriptionSegment[];
  
  for (let k = 0; k < N; k++) {
    const oWordsMapped = alignment[k];
    const targetInfo = dWords[k];
    const wordObj = newSegments[targetInfo.segIdx].words![targetInfo.wordIdx];
    
    if (oWordsMapped.length > 0) {
      const merged = oWordsMapped.join(' ');
      wordObj.punctuatedWord = merged;
      wordObj.word = normalizeWord(merged);
    } else {
      wordObj.punctuatedWord = "";
      wordObj.word = "";
    }
  }
  
  for (const seg of newSegments) {
    if (seg.words) {
      seg.text = seg.words.map(w => w.punctuatedWord).filter(w => w).join(' ') || "";
    }
  }

  return newSegments;
}

interface KeyframesStepProps {
  segments: TranscriptionSegment[];
  onUpdateEmotion: (id: number, emotion: string) => void;
  onContinue: () => void;
  onBack: () => void;
  onMoveWords?: (fromSegmentId: number, toSegmentId: number, wordIndices: number[]) => void;
  onSegmentsUpdate?: (newSegments: TranscriptionSegment[]) => void;
  niche?: ChannelNiche | null;
}

export function KeyframesStep({
  segments,
  onUpdateEmotion,
  onContinue,
  onBack,
  onMoveWords,
  onSegmentsUpdate,
  niche,
}: KeyframesStepProps) {
  const emotions = ['surpresa', 'empolgação', 'nostalgia', 'seriedade', 'alegria', 'tristeza', 'raiva', 'medo', 'neutro'];

  const [selectedWords, setSelectedWords] = useState<{ segmentId: number, indices: number[] }>({ segmentId: -1, indices: [] });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);

  const [minHighlightThreshold, setMinHighlightThreshold] = useState(1);
  const [maxHighlightThreshold, setMaxHighlightThreshold] = useState(10);
  const [currentHighlightIndex, setCurrentHighlightIndex] = useState(0);

  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [originalScriptText, setOriginalScriptText] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncOriginalText = async () => {
    if (!originalScriptText.trim() || !onSegmentsUpdate) return;
    
    setIsSyncing(true);
    // Timeout para permitir que a UI mostre o estado "Sincronizando..."
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      const newSegments = syncTextWithLevenshtein(segments, originalScriptText);
      onSegmentsUpdate(newSegments);
      setIsSyncModalOpen(false);
      setOriginalScriptText('');
    } catch (e) {
      console.error('Erro ao sincronizar texto:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const segmentProjections = useMemo(() => {
    return segments.map((segment, index) => {
      let projectedStart = segment.start;
      let projectedEnd = segment.end;

      if (selectedWords.indices.length > 0) {
        const selSegIdx = segments.findIndex(s => s.id === selectedWords.segmentId);
        const selSeg = segments[selSegIdx];

        if (selSeg && selSeg.words) {
          const sorted = [...selectedWords.indices].sort((a, b) => a - b);
          const isContiguous = sorted.every((val, i) => val === sorted[0] + i);
          const isAtStart = sorted[0] === 0;
          const isAtEnd = sorted[sorted.length - 1] === selSeg.words.length - 1;
          const isFullSegment = isAtStart && isAtEnd;

          const startSelectedTime = selSeg.words[sorted[0]].start;
          const endSelectedTime = selSeg.words[sorted[sorted.length - 1]].end;

          if (isContiguous) {
            if (segment.id === selSeg.id) {
              if (isFullSegment) {
                projectedStart = segment.start;
                projectedEnd = segment.start; // Resulta em 0s de duração
              } else if (isAtStart) {
                projectedStart = selSeg.words[sorted[sorted.length - 1] + 1]?.start || segment.end;
              } else if (isAtEnd) {
                projectedEnd = selSeg.words[sorted[0] - 1]?.end || segment.start;
              }
            } else {
              if (isAtStart && selSegIdx > 0 && segment.id === segments[selSegIdx - 1].id) {
                projectedEnd = endSelectedTime;
              }
              if (isAtEnd && selSegIdx < segments.length - 1 && segment.id === segments[selSegIdx + 1].id) {
                projectedStart = startSelectedTime;
              }
            }
          }
        }
      }

      const projectedDuration = Math.max(0, projectedEnd - projectedStart);
      const isDurationChanged = Math.abs(projectedDuration - (segment.end - segment.start)) > 0.01;

      return {
        projectedStart, projectedEnd, projectedDuration, isDurationChanged
      };
    });
  }, [segments, selectedWords]);

  const highlightedSegmentIds = useMemo(() => {
    return segments.filter((segment, index) => {
      const dur = segmentProjections[index].projectedDuration;
      return dur !== 0 && (dur < minHighlightThreshold || dur > maxHighlightThreshold);
    }).map(s => s.id);
  }, [segments, segmentProjections, minHighlightThreshold, maxHighlightThreshold]);

  useEffect(() => {
    if (highlightedSegmentIds.length > 0 && currentHighlightIndex >= highlightedSegmentIds.length) {
      setCurrentHighlightIndex(0);
    }
  }, [highlightedSegmentIds.length, currentHighlightIndex]);


  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      setDragStartIdx(null);
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const handleMouseDown = (segmentId: number, index: number, segmentLength: number, event: React.MouseEvent) => {
    const isEdge = index === 0 || index === segmentLength - 1;
    
    // Se clicar no meio, apenas ignora e se não tiver com Shift, limpa a seleção existente
    if (!isEdge) {
      if (!event.shiftKey) {
        setSelectedWords({ segmentId: -1, indices: [] });
      }
      return;
    }

    if (event.shiftKey && selectedWords.segmentId === segmentId && selectedWords.indices.length > 0) {
      const lastSelected = selectedWords.indices[selectedWords.indices.length - 1];
      const start = Math.min(lastSelected, index);
      const end = Math.max(lastSelected, index);
      const newIndices = [];
      for (let i = start; i <= end; i++) newIndices.push(i);
      setSelectedWords({ segmentId, indices: newIndices });
    } else {
      setIsDragging(true);
      setDragStartIdx(index);
      setSelectedWords({ segmentId, indices: [index] });
    }
  };

  const handleMouseEnter = (segmentId: number, index: number) => {
    if (isDragging && dragStartIdx !== null && selectedWords.segmentId === segmentId) {
      const start = Math.min(dragStartIdx, index);
      const end = Math.max(dragStartIdx, index);
      const newIndices = [];
      for (let i = start; i <= end; i++) {
        newIndices.push(i);
      }
      setSelectedWords({ segmentId, indices: newIndices });
    }
  };

  const handleMoveUp = (segmentId: number, segmentIndex: number) => {
    if (segmentIndex === 0) return;
    const sorted = [...selectedWords.indices].sort((a, b) => a - b);
    const isContiguous = sorted.every((val, i) => val === sorted[0] + i);
    const isAtStart = sorted[0] === 0;
    if (!(isContiguous && isAtStart)) return;

    const prevSegment = segments[segmentIndex - 1];
    if (onMoveWords) {
      onMoveWords(segmentId, prevSegment.id, selectedWords.indices);
      setSelectedWords({ segmentId: -1, indices: [] });
    }
  };

  const handleMoveDown = (segmentId: number, segmentIndex: number) => {
    if (segmentIndex === segments.length - 1) return;
    const segment = segments[segmentIndex];
    if (!segment || !segment.words) return;
    
    const sorted = [...selectedWords.indices].sort((a, b) => a - b);
    const isContiguous = sorted.every((val, i) => val === sorted[0] + i);
    const isAtEnd = sorted[sorted.length - 1] === segment.words.length - 1;
    if (!(isContiguous && isAtEnd)) return;

    const nextSegment = segments[segmentIndex + 1];
    if (onMoveWords) {
      onMoveWords(segmentId, nextSegment.id, selectedWords.indices);
      setSelectedWords({ segmentId: -1, indices: [] });
    }
  };

  const handleAddSegment = (index: number) => {
    const newSegments = JSON.parse(JSON.stringify(segments));
    
    // Default duration for new segment
    const defaultDuration = 0.0;
    
    // Determine insertion time
    let insertionTime = 0;
    if (index === -1) {
      // Adding at start
      insertionTime = 0;
    } else {
      // Adding after index
      const prevSegment = newSegments[index];
      insertionTime = prevSegment.end;
    }
    
    // Shift subsequent segments
    // If adding at start (index -1), loop from 0
    // If adding after index, loop from index + 1
    const startIndex = index + 1;
    
    for (let i = startIndex; i < newSegments.length; i++) {
      const seg = newSegments[i];
      seg.start += defaultDuration;
      seg.end += defaultDuration;
      if (seg.words) {
        seg.words.forEach((w: any) => {
          w.start += defaultDuration;
          w.end += defaultDuration;
        });
      }
    }

    // Usar o primeiro asset type permitido pelo nicho ou image_static como fallback
    const defaultAssetType = niche?.asset_types?.[0] || 'image_static';

    const newSegment: TranscriptionSegment = {
      id: 0, // Temporary ID, will be renumbered
      text: '',
      start: insertionTime,
      end: insertionTime + defaultDuration,
      speaker: 0,
      words: [],
      emotion: 'neutro',
      assetType: defaultAssetType,
    };

    // Insert new segment
    newSegments.splice(index + 1, 0, newSegment);

    // Renumber IDs sequentially
    newSegments.forEach((seg: any, idx: number) => {
      seg.id = idx + 1;
    });

    if (onSegmentsUpdate) {
      onSegmentsUpdate(newSegments);
      setSelectedWords({ segmentId: -1, indices: [] });
    }
  };

  const handleDeleteSegment = (index: number) => {
    const newSegments = JSON.parse(JSON.stringify(segments));
    const deletedSegment = newSegments[index];
    const duration = deletedSegment.end - deletedSegment.start;

    // Remover o segmento
    newSegments.splice(index, 1);

    // Ajustar o tempo dos segmentos subsequentes para preencher o buraco
    for (let i = index; i < newSegments.length; i++) {
      const seg = newSegments[i];
      seg.start -= duration;
      seg.end -= duration;
      if (seg.words) {
        seg.words.forEach((w: any) => {
          w.start -= duration;
          w.end -= duration;
        });
      }
    }

    // Renumber IDs sequentially
    newSegments.forEach((seg: any, idx: number) => {
      seg.id = idx + 1;
    });

    if (onSegmentsUpdate) {
      onSegmentsUpdate(newSegments);
      setSelectedWords({ segmentId: -1, indices: [] });
    }
  };

  const handleContinueWithCleanup = () => {
    const validSegments = segments.filter(seg => {
      const hasWords = seg.words && seg.words.length > 0;
      const hasText = seg.text && seg.text.trim().length > 0;
      return hasWords || hasText;
    });

    if (validSegments.length !== segments.length && onSegmentsUpdate) {
      console.log(`Removidos ${segments.length - validSegments.length} segmentos vazios.`);
      onSegmentsUpdate(validSegments);
      setTimeout(() => {
         onContinue();
      }, 100);
      return;
    }
    
    onContinue();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Keyframes & Emoções</h2>
          <p className="text-white/60">Revise e ajuste as emoções sugeridas para cada segmento</p>
        </div>
        <div className="flex flex-col items-end gap-4 mt-1">
          <div className="flex gap-3 items-center">
            <button
              onClick={onBack}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
            >
              ← Voltar
            </button>
            
            {onSegmentsUpdate && (
              <button
                onClick={() => setIsSyncModalOpen(true)}
                className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/50 rounded-lg transition-all flex items-center gap-2 group relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-400/10 to-blue-500/0 translate-x-[-100%] group-hover:animate-[shimmer_1.5s_infinite]" />
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></svg>
                Usar Roteiro Original
              </button>
            )}

            <button
              onClick={handleContinueWithCleanup}
              className="px-6 py-2 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white rounded-lg font-medium transition-all"
            >
              Continuar →
            </button>
          </div>
          <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg text-xs shadow-sm w-[260px]">
            <div className="flex flex-1 items-center justify-between gap-1.5">
              <span className="text-white/70">Min:</span>
              <input 
                type="range" min="1" max="10" step="1" 
                value={minHighlightThreshold} 
                onChange={e => setMinHighlightThreshold(Number(e.target.value))} 
                className="w-12 accent-red-500" 
              />
              <span className="font-mono text-red-400 font-bold w-4 text-right">{Math.round(minHighlightThreshold)}s</span>
            </div>
            <div className="w-[1px] h-4 bg-white/10" />
            <div className="flex flex-1 items-center justify-between gap-1.5">
              <span className="text-white/70">Max:</span>
              <input 
                type="range" min="8" max="15" step="1" 
                value={maxHighlightThreshold} 
                onChange={e => setMaxHighlightThreshold(Number(e.target.value))} 
                className="w-12 accent-red-500" 
              />
              <span className="font-mono text-red-400 font-bold w-6 text-right">{Math.round(maxHighlightThreshold)}s</span>
            </div>
          </div>
        </div>
      </div>

      {highlightedSegmentIds.length > 0 && (
        <div className="fixed right-2 top-1/2 -translate-y-1/2 flex flex-col items-center bg-black/80 border border-red-500/30 p-1.5 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.3)] z-50">
          <span className="text-[9px] text-red-400 font-bold mb-1 mt-1 leading-none drop-shadow-sm">{currentHighlightIndex + 1}/{highlightedSegmentIds.length}</span>
          <button 
            onClick={() => {
              const prevIdx = (currentHighlightIndex - 1 + highlightedSegmentIds.length) % highlightedSegmentIds.length;
              setCurrentHighlightIndex(prevIdx);
              document.getElementById(`segment-${highlightedSegmentIds[prevIdx]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            className="p-1 text-white hover:text-red-400 hover:bg-white/10 rounded-full transition-colors"
            title="Destacado Anterior"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
          </button>
          <div className="w-5 h-[1px] bg-red-500/20 my-0.5" />
          <button 
            onClick={() => {
              const nextIdx = (currentHighlightIndex + 1) % highlightedSegmentIds.length;
              setCurrentHighlightIndex(nextIdx);
              document.getElementById(`segment-${highlightedSegmentIds[nextIdx]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            className="p-1 text-white hover:text-red-400 hover:bg-white/10 rounded-full transition-colors"
            title="Próximo Destacado"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </button>
        </div>
      )}

      <div className="flex flex-col pb-20">
        {/* Botão de adicionar no início */}
        <div 
          className="relative h-6 -mt-2 mb-2 group w-full flex items-center justify-center cursor-pointer z-10"
          onClick={() => handleAddSegment(-1)}
          title="Inserir nova cena no início"
        >
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-white/20 opacity-0 group-hover:opacity-100 transition-all duration-300 w-[98%] mx-auto" />
          <div className="relative z-10 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transform scale-50 group-hover:scale-100 transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.5)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          </div>
        </div>

        {segments.map((segment, index) => {
          const proj = segmentProjections[index];
          const projectedStart = proj.projectedStart;
          const projectedEnd = proj.projectedEnd;
          const projectedDuration = proj.projectedDuration;
          const isDurationChanged = proj.isDurationChanged;
          
          const isHighlighted = highlightedSegmentIds.includes(segment.id);
          const isCurrentHighlight = highlightedSegmentIds.length > 0 && highlightedSegmentIds[currentHighlightIndex] === segment.id;
          
          const isEmptySegment = (!segment.words || segment.words.length === 0) && (!segment.text || segment.text.trim().length === 0);

          return (
          <React.Fragment key={segment.id}>
          <div
            id={`segment-${segment.id}`}
            className={`p-6 border rounded-xl transition-all relative mb-4 group/segment ${
              isHighlighted 
                ? isCurrentHighlight 
                  ? 'bg-red-500/10 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]' 
                  : 'bg-red-500/5 border-red-500/50'
                : isDurationChanged 
                  ? 'bg-yellow-500/5 border-yellow-500/30' 
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            {/* Botão de Excluir (apenas para segmentos vazios) */}
            {isEmptySegment && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteSegment(index);
                }}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg flex items-center justify-center opacity-0 group-hover/segment:opacity-100 transition-opacity z-20 transform hover:scale-110"
                title="Excluir segmento vazio"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            )}

            <div className="flex items-start justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="bg-white/10 text-white/80 px-2 py-1 rounded text-xs font-bold font-mono">
                    #{segment.id}
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-bold font-mono transition-colors ${
                    isHighlighted ? 'bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                    : isDurationChanged ? 'bg-yellow-500 text-black shadow-[0_0_10px_rgba(234,179,8,0.5)]' 
                    : 'bg-pink-500/20 text-pink-300'
                  }`}>
                    ⏱ {projectedDuration.toFixed(2)}s
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-mono transition-colors ${isDurationChanged ? 'bg-yellow-500/20 text-yellow-300' : 'bg-white/10 text-white/60'}`}>
                    {projectedStart.toFixed(2)}s - {projectedEnd.toFixed(2)}s
                  </span>
                  <span className="text-xs text-white/40">Speaker {segment.speaker}</span>
                  {(segment.words || []).length > 0 && (
                    <span className="text-xs text-yellow-400">
                      Arraste pelas palavras para selecionar e mover
                    </span>
                  )}
                </div>
                <p className="text-white text-lg leading-relaxed relative mt-6 mb-4">
                  {segment.words && segment.words.length > 0 ? (
                    (() => {
                      let isValidSelection = false;
                      let canMoveUp = false;
                      let canMoveDown = false;
                      let selectedDuration = 0;
                      let firstSelectedIdx = -1;
                      let lastSelectedIdx = -1;

                      if (selectedWords.segmentId === segment.id && selectedWords.indices.length > 0) {
                        const sorted = [...selectedWords.indices].sort((a, b) => a - b);
                        const isContiguous = sorted.every((val, i) => val === sorted[0] + i);
                        const isAtStart = sorted[0] === 0;
                        const isAtEnd = sorted[sorted.length - 1] === segment.words.length - 1;
                        
                        if (isContiguous && (isAtStart || isAtEnd)) {
                          isValidSelection = true;
                          firstSelectedIdx = sorted[0];
                          lastSelectedIdx = sorted[sorted.length - 1];
                          const startSelectedTime = segment.words[firstSelectedIdx].start;
                          const endSelectedTime = segment.words[lastSelectedIdx].end;
                          selectedDuration = endSelectedTime - startSelectedTime;
                          canMoveUp = isAtStart && index > 0;
                          canMoveDown = isAtEnd && index < segments.length - 1;
                        }
                      }

                      return segment.words.map((word, wIdx) => {
                        const isSelected = selectedWords.segmentId === segment.id && selectedWords.indices.includes(wIdx);
                        const isEdgeWord = wIdx === 0 || wIdx === segment.words.length - 1;
                        const isSelectableTarget = isEdgeWord || (isDragging && selectedWords.segmentId === segment.id);
                        
                        const showUpAction = isValidSelection && canMoveUp && wIdx === firstSelectedIdx;
                        const showDownAction = isValidSelection && canMoveDown && wIdx === lastSelectedIdx;

                        return (
                          <React.Fragment key={wIdx}>
                            <span
                              onMouseDown={(e) => handleMouseDown(segment.id, wIdx, segment.words!.length, e)}
                              onMouseEnter={() => handleMouseEnter(segment.id, wIdx)}
                              className={`px-1 rounded transition-colors inline-block select-none relative ${
                                isSelected 
                                  ? 'bg-yellow-500 text-black font-medium cursor-text' 
                                  : isSelectableTarget
                                    ? 'hover:bg-white/10 cursor-text'
                                    : 'text-white cursor-default'
                              }`}
                            >
                              {showUpAction && (
                                <span className="absolute top-1/2 -translate-y-1/2 right-full mr-1 flex flex-col items-center justify-center z-20">
                                  <button
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); handleMoveUp(segment.id, index); }}
                                    className="bg-green-500 hover:bg-green-400 text-white p-1.5 rounded-full shadow-[0_0_10px_rgba(34,197,94,1)] transition-transform hover:scale-110 flex items-center justify-center animate-bounce"
                                    title="Mover para Cima"
                                  >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                                  </button>
                                  <div className="whitespace-nowrap bg-black/80 text-yellow-400 text-[10px] font-bold px-1.5 py-0.5 mt-1 rounded border border-yellow-500/50 shadow-[0_0_8px_rgba(234,179,8,0.8)] pointer-events-none">
                                    {selectedDuration.toFixed(2)}s
                                  </div>
                                </span>
                              )}
                              {word.punctuatedWord || word.word}
                              {showDownAction && (
                                <span className="absolute top-1/2 -translate-y-1/2 left-full ml-1 flex flex-col items-center justify-center z-20">
                                  <button
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); handleMoveDown(segment.id, index); }}
                                    className="bg-green-500 hover:bg-green-400 text-white p-1.5 rounded-full shadow-[0_0_10px_rgba(34,197,94,1)] transition-transform hover:scale-110 flex items-center justify-center animate-bounce"
                                    title="Mover para Baixo"
                                  >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
                                  </button>
                                  <div className="whitespace-nowrap bg-black/80 text-yellow-400 text-[10px] font-bold px-1.5 py-0.5 mt-1 rounded border border-yellow-500/50 shadow-[0_0_8px_rgba(234,179,8,0.8)] pointer-events-none">
                                    {selectedDuration.toFixed(2)}s
                                  </div>
                                </span>
                              )}
                            </span>
                            {' '}
                          </React.Fragment>
                        );
                      });
                    })()
                  ) : (
                    segment.text
                  )}
                </p>
              </div>
              
              <div className="flex flex-col gap-3 max-w-xs">
                <div className="flex flex-wrap gap-2">
                {emotions.map((emotion) => (
                  <button
                    key={emotion}
                    onClick={() => onUpdateEmotion(segment.id, emotion)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                      segment.emotion === emotion
                        ? 'bg-pink-500 text-white'
                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                    }`}
                  >
                    {emotion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
          
          {index < segments.length - 1 && (
            <div 
              className="relative h-6 -mt-2 mb-2 group w-full flex items-center justify-center cursor-pointer z-10"
              onClick={() => handleAddSegment(index)}
              title="Inserir nova cena aqui"
            >
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-white/20 opacity-0 group-hover:opacity-100 transition-all duration-300 w-[98%] mx-auto" />
              <div className="relative z-10 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transform scale-50 group-hover:scale-100 transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.5)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
              </div>
            </div>
          )}
          </React.Fragment>
        )})}
        
        {/* Botão de adicionar no final */}
        <div 
          className="relative h-6 -mt-2 mb-2 group w-full flex items-center justify-center cursor-pointer z-10"
          onClick={() => handleAddSegment(segments.length - 1)}
          title="Inserir nova cena no final"
        >
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-white/20 opacity-0 group-hover:opacity-100 transition-all duration-300 w-[98%] mx-auto" />
          <div className="relative z-10 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transform scale-50 group-hover:scale-100 transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.5)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          </div>
        </div>
      </div>

      {isSyncModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-[#111] border border-white/10 rounded-2xl p-6 w-full max-w-2xl shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></svg>
              Sincronizar Roteiro Original
            </h3>
            <p className="text-white/60 mb-6 text-sm">
              Cole o roteiro oficial abaixo. O algoritmo usará Distância de Levenshtein para reparar palavras erradas pelo Deepgram sem perder nenhum dos timestamps de áudio que já foram calculados.
            </p>

            <textarea
              className="w-full h-[250px] bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-blue-500 focus:outline-none resize-none mb-6 font-mono leading-relaxed"
              placeholder="Cole o texto original aqui..."
              value={originalScriptText}
              onChange={e => setOriginalScriptText(e.target.value)}
              disabled={isSyncing}
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsSyncModalOpen(false)}
                disabled={isSyncing}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSyncOriginalText}
                disabled={isSyncing || !originalScriptText.trim()}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSyncing ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sincronizando Mágica...
                  </>
                ) : 'Sincronizar Agora'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
