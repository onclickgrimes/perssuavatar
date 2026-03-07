import React, { useState, useEffect, useMemo } from 'react';
import { TranscriptionSegment } from '../../types/video-studio';

interface KeyframesStepProps {
  segments: TranscriptionSegment[];
  onUpdateEmotion: (id: number, emotion: string) => void;
  onContinue: () => void;
  onBack: () => void;
  provider?: 'gemini' | 'openai' | 'deepseek';
  onProviderChange?: (p: 'gemini' | 'openai' | 'deepseek') => void;
  providerModel?: string;
  onProviderModelChange?: (m: string) => void;
  onMoveWords?: (fromSegmentId: number, toSegmentId: number, wordIndices: number[]) => void;
}

export function KeyframesStep({
  segments,
  onUpdateEmotion,
  onContinue,
  onBack,
  provider = 'gemini',
  onProviderChange,
  providerModel,
  onProviderModelChange,
  onMoveWords,
}: KeyframesStepProps) {
  const emotions = ['surpresa', 'empolgação', 'nostalgia', 'seriedade', 'alegria', 'tristeza', 'raiva', 'medo', 'neutro'];

  const [selectedWords, setSelectedWords] = useState<{ segmentId: number, indices: number[] }>({ segmentId: -1, indices: [] });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);

  const [minHighlightThreshold, setMinHighlightThreshold] = useState(1);
  const [maxHighlightThreshold, setMaxHighlightThreshold] = useState(10);
  const [currentHighlightIndex, setCurrentHighlightIndex] = useState(0);

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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Keyframes & Emoções</h2>
          <p className="text-white/60">Revise e ajuste as emoções sugeridas para cada segmento</p>
          
          {onProviderChange && (
            <div className="flex items-center gap-3 mt-6">
               <span className="text-white/60 text-sm">IA de Análise:</span>
               <select
                 value={provider}
                 onChange={(e) => onProviderChange(e.target.value as any)}
                 className="bg-black/30 border border-white/10 rounded-lg px-3 py-1 text-white text-sm focus:border-pink-500 focus:outline-none"
               >
                 <option value="gemini">Google Gemini</option>
                 <option value="openai">OpenAI</option>
                 <option value="deepseek">DeepSeek V3</option>
               </select>

               {onProviderModelChange && (
                 <>
                   <span className="text-white/60 text-sm ml-2">Modelo:</span>
                   <select
                     value={providerModel || ''}
                     onChange={(e) => onProviderModelChange(e.target.value)}
                     className="bg-black/30 border border-white/10 rounded-lg px-3 py-1 text-white text-sm focus:border-pink-500 focus:outline-none"
                   >
                     {provider === 'gemini' && (
                       <>
                         <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite ($0.25 inputs / $1.50 outputs)</option>
                         <option value="gemini-3-flash-preview">Gemini 3 Flash ($0.50 inputs / $3 outputs)</option>
                         <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro ($2 inputs / $12 outputs)</option>
                       </>
                     )}
                     {provider === 'openai' && (
                       <>
                         <option value="gpt-5-mini-2025-08-07">GPT 5 Mini ($0.25 inputs / $2.00 outputs)</option>
                         <option value="gpt-4.1-2025-04-14">GPT 4.1 ($2.00 inputs / $8.00 outputs)</option>
                       </>
                     )}
                     {provider === 'deepseek' && (
                       <>
                         <option value="deepseek-chat">DeepSeek Chat V3</option>
                         <option value="deepseek-reasoner">DeepSeek Reasoner R1</option>
                       </>
                     )}
                   </select>
                 </>
               )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-4 mt-1">
          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
            >
              ← Voltar
            </button>
            <button
              onClick={onContinue}
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

      <div className="space-y-4">
        {segments.map((segment, index) => {
          const proj = segmentProjections[index];
          const projectedStart = proj.projectedStart;
          const projectedEnd = proj.projectedEnd;
          const projectedDuration = proj.projectedDuration;
          const isDurationChanged = proj.isDurationChanged;
          
          const isHighlighted = highlightedSegmentIds.includes(segment.id);
          const isCurrentHighlight = highlightedSegmentIds.length > 0 && highlightedSegmentIds[currentHighlightIndex] === segment.id;

          return (
          <div
            key={segment.id}
            id={`segment-${segment.id}`}
            className={`p-6 border rounded-xl transition-all relative ${
              isHighlighted 
                ? isCurrentHighlight 
                  ? 'bg-red-500/10 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]' 
                  : 'bg-red-500/5 border-red-500/50'
                : isDurationChanged 
                  ? 'bg-yellow-500/5 border-yellow-500/30' 
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
            }`}
          >
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
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
              
              <div className="flex flex-wrap gap-2 max-w-xs">
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
        )})}
      </div>
    </div>
  );
}
