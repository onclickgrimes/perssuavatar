import React from 'react';
import { FILMORA, formatTimecode } from './constants';
import { ASPECT_RATIO_DIMENSIONS } from '../../../shared/utils/project-converter';
import { TRANSITION_LIST } from '../../../../remotion/utils/transitions';

interface SidebarProps {
  sidebarTab: 'info' | 'transitions';
  setSidebarTab: (tab: 'info' | 'transitions') => void;
  durationInSeconds: number;
  segmentsCount: number;
  selectedRatio: string;
  audioUrl: string;
  selectedSeg: any | null;
  handleTransitionChange: (segmentId: number, transition: string) => void;
  handleApplyTransitionToAll: (transition: string) => void;
  handleTransformChange?: (segmentId: number, transform: any) => void;
  handleAudioChange?: (audioConfig: any) => void;
  fitVideoToScene: boolean;
  onFitVideoToSceneChange: (value: boolean) => void;
  mainAudioVolume?: number;
  handleMainAudioVolumeChange?: (volume: number) => void;
}

// ========================================
// SIDEBAR DIREITA (Propriedades + Transições)
// ========================================
export function Sidebar({
  sidebarTab,
  setSidebarTab,
  durationInSeconds,
  segmentsCount,
  selectedRatio,
  audioUrl,
  selectedSeg,
  handleTransitionChange,
  handleApplyTransitionToAll,
  handleTransformChange,
  handleAudioChange,
  fitVideoToScene,
  onFitVideoToSceneChange,
  mainAudioVolume = 1.0,
  handleMainAudioVolumeChange,
}: SidebarProps) {
  return (
    <div className="w-full h-full flex flex-col overflow-hidden" style={{ background: FILMORA.bgDark, borderColor: FILMORA.border }}>
      {/* Tabs */}
      <div className="flex border-b flex-shrink-0" style={{ borderColor: FILMORA.border }}>
        {(['info', 'transitions'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setSidebarTab(tab)}
            className="flex-1 py-2 text-center text-[10px] font-semibold tracking-wider uppercase transition-colors"
            style={{ 
              color: sidebarTab === tab ? FILMORA.accent : FILMORA.textDim,
              borderBottom: sidebarTab === tab ? `2px solid ${FILMORA.accent}` : '2px solid transparent',
            }}
          >
            {tab === 'info' ? 'Info' : 'Transições'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {sidebarTab === 'info' ? (
          /* ====== TAB INFO ====== */
          <div className="p-3 space-y-3">
            <div className="rounded p-3" style={{ background: FILMORA.surface }}>
              <div className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: FILMORA.textDim }}>Duração</div>
              <div className="text-sm font-bold font-mono" style={{ color: FILMORA.text }}>
                {formatTimecode(durationInSeconds)}
              </div>
            </div>

            <div className="rounded p-3" style={{ background: FILMORA.surface }}>
              <div className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: FILMORA.textDim }}>Cenas</div>
              <div className="text-sm font-bold" style={{ color: FILMORA.text }}>
                {segmentsCount}
              </div>
            </div>

            <div className="rounded p-3" style={{ background: FILMORA.surface }}>
              <div className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: FILMORA.textDim }}>Resolução</div>
              <div className="text-sm font-bold" style={{ color: FILMORA.text }}>
                {ASPECT_RATIO_DIMENSIONS[selectedRatio]?.width}×{ASPECT_RATIO_DIMENSIONS[selectedRatio]?.height}
              </div>
            </div>

            <div className="rounded p-3" style={{ background: FILMORA.surface }}>
              <div className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: FILMORA.textDim }}>FPS</div>
              <div className="text-sm font-bold" style={{ color: FILMORA.text }}>30</div>
            </div>

            <div className="rounded p-3" style={{ background: FILMORA.surface }}>
              <div className="flex justify-between items-center mb-1.5">
                <div className="text-[9px] uppercase tracking-wider" style={{ color: FILMORA.textDim }}>Áudio Base</div>
                <div className="text-[9px] font-bold" style={{ color: mainAudioVolume > 0 ? FILMORA.accent : FILMORA.textMuted }}>
                  {Math.round(mainAudioVolume * 100)}%
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="range" 
                  min="0" max="100" step="1"
                  value={Math.round(mainAudioVolume * 100)}
                  onChange={(e) => handleMainAudioVolumeChange?.(Number(e.target.value) / 100)}
                  className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <button 
                  onClick={() => handleMainAudioVolumeChange?.(mainAudioVolume > 0 ? 0 : 1)}
                  className="p-1 hover:bg-white/10 rounded"
                  style={{ color: mainAudioVolume > 0 ? FILMORA.text : FILMORA.textMuted }}
                >
                  {mainAudioVolume > 0 ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                  )}
                </button>
              </div>
            </div>

            {/* Toggle: Ajustar vídeo à cena */}
            <div className="rounded p-3" style={{ background: FILMORA.surface }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: FILMORA.textDim }}>Ajustar vídeo</div>
                  <div className="text-[9px]" style={{ color: FILMORA.textMuted }}>Acelera/desacelera para caber na cena</div>
                </div>
                <button
                  onClick={() => onFitVideoToSceneChange(!fitVideoToScene)}
                  className="relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ml-2"
                  style={{
                    background: fitVideoToScene ? FILMORA.accent : FILMORA.border,
                  }}
                  title={fitVideoToScene ? 'Desativar ajuste de velocidade' : 'Ativar ajuste de velocidade'}
                >
                  <div
                    className="absolute top-[2px] w-[14px] h-[14px] rounded-full transition-transform"
                    style={{
                      background: '#fff',
                      left: fitVideoToScene ? '16px' : '2px',
                    }}
                  />
                </button>
              </div>
            </div>

            {/* Transformações (PiP) */}
            {selectedSeg && handleTransformChange && (
              <div className="rounded p-3 bg-opacity-50" style={{ background: FILMORA.surface }}>
                <div className="text-[10px] font-bold tracking-wider mb-3 uppercase" style={{ color: FILMORA.text }}>
                  Transformação (Cena #{selectedSeg.id})
                </div>
                
                {/* Escala (Zoom) */}
                <div className="mb-3">
                  <div className="flex justify-between text-[9px] mb-1">
                    <span style={{ color: FILMORA.textDim }}>Escala (Zoom)</span>
                    <span style={{ color: FILMORA.textMuted }}>{Math.round((selectedSeg.transform?.scale || 1) * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="10" max="300" step="1"
                    value={Math.round((selectedSeg.transform?.scale || 1) * 100)}
                    onChange={(e) => handleTransformChange(selectedSeg.id, { scale: Number(e.target.value) / 100 })}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Posição X */}
                <div className="mb-3">
                  <div className="flex justify-between text-[9px] mb-1">
                    <span style={{ color: FILMORA.textDim }}>Posição X</span>
                    <span style={{ color: FILMORA.textMuted }}>{selectedSeg.transform?.positionX || 0}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="-200" max="200" step="1"
                    value={selectedSeg.transform?.positionX || 0}
                    onChange={(e) => handleTransformChange(selectedSeg.id, { positionX: Number(e.target.value) })}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Posição Y */}
                <div className="mb-3">
                  <div className="flex justify-between text-[9px] mb-1">
                    <span style={{ color: FILMORA.textDim }}>Posição Y</span>
                    <span style={{ color: FILMORA.textMuted }}>{selectedSeg.transform?.positionY || 0}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="-200" max="200" step="1"
                    value={selectedSeg.transform?.positionY || 0}
                    onChange={(e) => handleTransformChange(selectedSeg.id, { positionY: Number(e.target.value) })}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Opacidade */}
                <div>
                  <div className="flex justify-between text-[9px] mb-1">
                    <span style={{ color: FILMORA.textDim }}>Opacidade</span>
                    <span style={{ color: FILMORA.textMuted }}>{Math.round((selectedSeg.transform?.opacity ?? 1) * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" max="100" step="1"
                    value={Math.round((selectedSeg.transform?.opacity ?? 1) * 100)}
                    onChange={(e) => handleTransformChange(selectedSeg.id, { opacity: Number(e.target.value) / 100 })}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* Configurações de Áudio */}
            {selectedSeg && handleAudioChange && (
              <div className="rounded p-3 bg-opacity-50" style={{ background: FILMORA.surface }}>
                <div className="text-[10px] font-bold tracking-wider mb-3 uppercase" style={{ color: FILMORA.text }}>
                  Áudio (Cena #{selectedSeg.id})
                </div>

                {/* Volume */}
                <div className="mb-3">
                  <div className="flex justify-between text-[9px] mb-1">
                    <span style={{ color: FILMORA.textDim }}>Volume / Ganho</span>
                    <span style={{ color: FILMORA.textMuted }}>{Math.round((selectedSeg.audio?.volume ?? 1) * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" max="200" step="1"
                    value={Math.round((selectedSeg.audio?.volume ?? 1) * 100)}
                    onChange={(e) => handleAudioChange({ volume: Number(e.target.value) / 100 })}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                </div>

                {/* Fade In */}
                <div className="mb-3">
                  <div className="flex justify-between text-[9px] mb-1">
                    <span style={{ color: FILMORA.textDim }}>Fade-in (seg)</span>
                    <span style={{ color: FILMORA.textMuted }}>{(selectedSeg.audio?.fadeIn ?? 0).toFixed(1)}s</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" max="10" step="0.1"
                    value={selectedSeg.audio?.fadeIn ?? 0}
                    onChange={(e) => handleAudioChange({ fadeIn: Number(e.target.value) })}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                </div>

                {/* Fade Out */}
                <div>
                  <div className="flex justify-between text-[9px] mb-1">
                    <span style={{ color: FILMORA.textDim }}>Fade-out (seg)</span>
                    <span style={{ color: FILMORA.textMuted }}>{(selectedSeg.audio?.fadeOut ?? 0).toFixed(1)}s</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" max="10" step="0.1"
                    value={selectedSeg.audio?.fadeOut ?? 0}
                    onChange={(e) => handleAudioChange({ fadeOut: Number(e.target.value) })}
                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ====== TAB TRANSIÇÕES ====== */
          <div className="p-3 space-y-3">
            {selectedSeg ? (
              <>
                {/* Segmento selecionado */}
                <div className="rounded p-2.5" style={{ background: FILMORA.surface }}>
                  <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: FILMORA.textDim }}>Cena selecionada</div>
                  <div className="text-xs font-bold truncate" style={{ color: FILMORA.text }}>#{selectedSeg.id} — {selectedSeg.text}</div>
                </div>

                {/* Transição atual */}
                <div className="text-[9px] uppercase tracking-wider" style={{ color: FILMORA.textDim }}>
                  Transição de entrada
                </div>

                {/* Grid de transições */}
                <div className="grid grid-cols-2 gap-1.5">
                  {TRANSITION_LIST.map(tr => {
                    const currentTransition = selectedSeg.transition || 'fade';
                    const isActive = currentTransition === tr.value;
                    return (
                      <button
                        key={tr.value}
                        onClick={() => handleTransitionChange(selectedSeg.id, tr.value)}
                        className="rounded p-2 text-left transition-all hover:brightness-125"
                        style={{
                          background: isActive ? `${FILMORA.accent}20` : FILMORA.surface,
                          border: `1px solid ${isActive ? FILMORA.accent : FILMORA.border}`,
                        }}
                        title={tr.description}
                      >
                        <div className="text-[9px] font-semibold truncate" style={{ color: isActive ? FILMORA.accent : FILMORA.text }}>
                          {tr.label}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Aplicar a todos */}
                <button
                  onClick={() => handleApplyTransitionToAll(selectedSeg.transition || 'fade')}
                  className="w-full rounded py-1.5 text-[10px] font-semibold transition-all hover:brightness-110"
                  style={{ background: FILMORA.accent, color: '#000' }}
                >
                  Aplicar "{TRANSITION_LIST.find(t => t.value === (selectedSeg.transition || 'fade'))?.label}" a todas
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: FILMORA.surface }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: FILMORA.textDim }}>
                    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                    <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                  </svg>
                </div>
                <p className="text-[10px] leading-relaxed" style={{ color: FILMORA.textDim }}>
                  Selecione uma cena na timeline para alterar sua transição
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
