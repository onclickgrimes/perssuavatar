import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ProjectState } from '../../types/video-studio';
import { VideoPreviewPlayer } from './VideoPreviewPlayer';
import type { ChannelNiche } from './NicheModal';
import { 
  toRemotionFormat, 
  audioPathToUrl, 
  ASPECT_RATIO_DIMENSIONS 
} from '../../shared/utils/project-converter';

interface PreviewStepProps {
  project: ProjectState;
  subtitleMode: 'paragraph' | 'word-by-word' | 'none';
  setSubtitleMode: (mode: 'paragraph' | 'word-by-word' | 'none') => void;
  onContinue: () => void;
  onBack: () => void;
  onAspectRatiosChange: (ratios: string[]) => void;
  selectedNiche: ChannelNiche | null;
}

// ========================================
// CONSTANTES DA TIMELINE
// ========================================
const MIN_ZOOM = 5;
const MAX_ZOOM = 300;
const DEFAULT_ZOOM = 60;

const TRACK_COLORS = {
  video: '#8b5cf6',   // Roxo
  image: '#3b82f6',   // Azul
  audio: '#ec4899',   // Rosa
};

// Regras Adaptativas para a Régua da Timeline
const getRulerSteps = (zoom: number) => {
  if (zoom < 10) return { major: 60, minor: 10 };
  if (zoom < 20) return { major: 30, minor: 5 };
  if (zoom < 50) return { major: 15, minor: 5 };
  if (zoom < 100) return { major: 5, minor: 1 };
  if (zoom < 200) return { major: 2, minor: 1 };
  return { major: 1, minor: 0.5 };
};

const formatRulerTime = (seconds: number) => {
  if (seconds === 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (s === 0) return `${m}m`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// ========================================
// WAVEFORM COMPONENT (do áudio)
// ========================================
function AudioWaveformDisplay({ audioUrl, color, duration, widthScale }: {
  audioUrl: string;
  color: string;
  duration: number;
  widthScale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);

  useEffect(() => {
    if (!audioUrl) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new Ctx();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        if (!cancelled) setBuffer(decoded);
        audioCtx.close();
      } catch (e) {
        console.error('Erro ao carregar waveform:', e);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [audioUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, duration * widthScale);
    const height = 48;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = color;

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const idx = (i * step) + j;
        if (idx < data.length) {
          const datum = data[idx];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
      }
      const y = (1 + min) * amp;
      const h = Math.max(1, (max - min) * amp);
      ctx.fillRect(i, y, 1, h);
    }
  }, [buffer, duration, widthScale, color]);

  return (
    <canvas 
      ref={canvasRef} 
      style={{ width: Math.max(1, duration * widthScale), height: 48 }} 
      className="opacity-80 absolute top-0 left-0 pointer-events-none" 
    />
  );
}


// ========================================
// MINI THUMBNAIL PARA CENA
// ========================================
function SceneThumbnail({ imageUrl, text }: { imageUrl?: string; text: string }) {
  if (imageUrl) {
    // Converte caminhos locais para URL servida
    let src = imageUrl;
    if (!src.startsWith('http') && !src.startsWith('blob:') && !src.startsWith('data:')) {
      const filename = src.split(/[/\\]/).pop();
      src = `http://localhost:9999/${filename}`;
    }
    return (
      <img 
        src={src} 
        alt={text}
        className="absolute inset-0 w-full h-full object-cover rounded opacity-60"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  return null;
}


// ========================================
// COMPONENTE PRINCIPAL
// ========================================
export function PreviewStep({
  project,
  subtitleMode,
  setSubtitleMode,
  onContinue,
  onBack,
  onAspectRatiosChange,
  selectedNiche,
}: PreviewStepProps) {
  // Estado para proporção selecionada no preview
  const [selectedRatio, setSelectedRatio] = useState<string>(() => {
    return project.selectedAspectRatios?.[0] || '9:16';
  });

  const [showRatioMenu, setShowRatioMenu] = useState(false);

  // ========================================
  // ESTADOS DA TIMELINE
  // ========================================
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  // currentTime é um REF (não state) para evitar re-renders a 30fps
  const currentTimeRef = useRef(0);
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<{ id: number; x: number; y: number } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scrollWrapperRef = useRef<HTMLDivElement>(null);
  const trackContainerRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(1000);

  // Refs DOM para atualização direta (sem re-render)
  const playheadRef = useRef<HTMLDivElement>(null);
  const playheadLabelRef = useRef<HTMLDivElement>(null);
  const timecodeRef = useRef<HTMLSpanElement>(null);

  // Instância do Player Remotion para sincronização com a timeline
  const playerRef = useRef<any>(null);
  const isSeekingFromTimelineRef = useRef(false);
  const frameListenerCleanupRef = useRef<(() => void) | null>(null);
  const zoomLevelRef = useRef(DEFAULT_ZOOM);

  // Manter zoomLevelRef sincronizado com o state
  useEffect(() => { zoomLevelRef.current = zoomLevel; }, [zoomLevel]);

  const AVAILABLE_RATIOS = Object.keys(ASPECT_RATIO_DIMENSIONS);
  const currentRatios = project.selectedAspectRatios || ['9:16'];

  // ✅ Usar conversor centralizado
  const remotionProject = useMemo(() => {
    const dims = ASPECT_RATIO_DIMENSIONS[selectedRatio] || { width: 1080, height: 1920 };
    
    return toRemotionFormat(project as any, {
      subtitleMode,
      width: dims.width,
      height: dims.height,
      fps: 30,
      componentsAllowed: selectedNiche?.components_allowed || project.componentsAllowed,
      audioUrl: audioPathToUrl(project.audioPath),
      defaultFont: selectedNiche?.default_font,
    });
  }, [project, subtitleMode, selectedRatio, selectedNiche]);
  
  // Efeito para garantir que selectedRatio seja válido se as opções mudarem
  useEffect(() => {
    if (!currentRatios.includes(selectedRatio)) {
      if (currentRatios.length > 0) {
        setSelectedRatio(currentRatios[0]);
      }
    }
  }, [currentRatios, selectedRatio]);

  // Handler para adicionar/remover ratio
  const toggleAspectRatio = (ratio: string) => {
    let newRatios;
    if (currentRatios.includes(ratio)) {
      if (currentRatios.length <= 1) return;
      newRatios = currentRatios.filter(r => r !== ratio);
    } else {
      newRatios = [...currentRatios, ratio];
    }
    onAspectRatiosChange(newRatios);
  };

  // Calcular duração
  const lastScene = project.segments[project.segments.length - 1];
  const durationInSeconds = lastScene ? lastScene.end : 10;
  const fps = 30;
  const durationInFrames = Math.ceil(durationInSeconds * fps);

  const getCssAspectRatio = (ratio: string) => ratio.replace(':', '/');

  // Calcular URL do áudio
  const audioUrl = useMemo(() => audioPathToUrl(project.audioPath), [project.audioPath]);

  // ========================================
  // TIMELINE: Resize Observer
  // ========================================
  useEffect(() => {
    if (!scrollWrapperRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setViewportWidth(entries[0].contentRect.width);
      }
    });
    observer.observe(scrollWrapperRef.current);
    setViewportWidth(scrollWrapperRef.current.clientWidth);
    return () => observer.disconnect();
  }, []);

  // ========================================
  // Atualiza playhead e timecode via DOM direto (sem re-render)
  // ========================================
  const updatePlayheadDOM = useCallback((time: number) => {
    currentTimeRef.current = time;
    const zoom = zoomLevelRef.current;

    // Atualizar posição da agulha
    if (playheadRef.current) {
      playheadRef.current.style.transform = `translateX(${time * zoom}px)`;
    }
    // Atualizar label da agulha
    if (playheadLabelRef.current) {
      playheadLabelRef.current.textContent = time.toFixed(1);
    }
    // Atualizar timecode no header
    if (timecodeRef.current) {
      const m = Math.floor(time / 60);
      const s = (time % 60).toFixed(1).padStart(4, '0');
      timecodeRef.current.textContent = `${m}:${s}`;
    }
  }, []);

  // Quando o zoom muda, re-posicionar a agulha
  useEffect(() => {
    updatePlayheadDOM(currentTimeRef.current);
  }, [zoomLevel, updatePlayheadDOM]);

  // ========================================
  // SINCRONIZAÇÃO: Player Remotion -> Agulha da Timeline
  // Callback chamado quando o Player Remotion monta
  // Registra listener de frameupdate (atualiza DOM direto, SEM re-render)
  // ========================================
  const handlePlayerReady = useCallback((player: any) => {
    // Limpar listener anterior se existir
    if (frameListenerCleanupRef.current) {
      frameListenerCleanupRef.current();
      frameListenerCleanupRef.current = null;
    }

    playerRef.current = player;

    if (!player) return;

    const handleFrameUpdate = (e: any) => {
      if (isSeekingFromTimelineRef.current) return;
      const frame = e.detail.frame;
      const timeInSeconds = frame / fps;
      updatePlayheadDOM(timeInSeconds);
    };

    player.addEventListener('frameupdate', handleFrameUpdate);
    frameListenerCleanupRef.current = () => {
      try { player.removeEventListener('frameupdate', handleFrameUpdate); } catch(_) {}
    };
    console.log('🎯 [Timeline] Sincronização Player↔Agulha conectada (DOM direto)');
  }, [fps, updatePlayheadDOM]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (frameListenerCleanupRef.current) {
        frameListenerCleanupRef.current();
        frameListenerCleanupRef.current = null;
      }
    };
  }, []);

  // ========================================
  // TIMELINE: Seek (bidirecional)
  // Atualiza agulha E o Player Remotion
  // ========================================
  const seekTo = useCallback((time: number) => {
    const safeTime = Math.max(0, Math.min(time, durationInSeconds));
    updatePlayheadDOM(safeTime);

    // Sincronizar com o Player Remotion
    if (playerRef.current) {
      isSeekingFromTimelineRef.current = true;
      const frame = Math.round(safeTime * fps);
      playerRef.current.seekTo(frame);
      requestAnimationFrame(() => {
        isSeekingFromTimelineRef.current = false;
      });
    }
  }, [durationInSeconds, fps, updatePlayheadDOM]);

  // ========================================
  // TIMELINE: Ruler Mouse Down (zoom por arrasto + click seek)
  // ========================================
  const handleRulerMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.playhead-handle')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startZoom = zoomLevel;
    let isDragging = false;

    const handleMouseMove = (mvEvent: MouseEvent) => {
      isDragging = true;
      const deltaX = mvEvent.clientX - startX;
      setZoomLevel(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, startZoom + (deltaX * 0.5))));
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (!isDragging && trackContainerRef.current) {
        const rect = trackContainerRef.current.getBoundingClientRect();
        let x = upEvent.clientX - rect.left;
        seekTo(Math.max(0, x) / zoomLevel);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // ========================================
  // TIMELINE: Playhead Drag
  // ========================================
  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!trackContainerRef.current) return;
    const rect = trackContainerRef.current.getBoundingClientRect();

    const handleMouseMove = (mvEvent: MouseEvent) => {
      let x = mvEvent.clientX - rect.left;
      seekTo(Math.max(0, x) / zoomLevel);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // ========================================
  // TIMELINE: Zoom controls
  // ========================================
  const handleZoomIn = () => setZoomLevel(z => Math.min(z * 1.5, MAX_ZOOM));
  const handleZoomOut = () => setZoomLevel(z => Math.max(z / 1.5, MIN_ZOOM));

  // ========================================
  // TIMELINE: Hover tooltip
  // ========================================
  const handleSegmentMouseEnter = (e: React.MouseEvent, segId: number) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    const x = e.clientX;
    const y = e.clientY;
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredSegment({ id: segId, x, y });
    }, 800);
  };

  const handleSegmentMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredSegment(null);
  };

  // Deselecionar ao clicar no fundo
  const handleBackgroundClick = () => {
    setSelectedSegmentId(null);
  };

  // Calcula a largura total do conteúdo da timeline
  const totalTimelineWidth = Math.max(durationInSeconds * zoomLevel, viewportWidth);

  // Segmento hovered para tooltip
  const hoveredSeg = hoveredSegment ? project.segments.find(s => s.id === hoveredSegment.id) : null;

  // Separar segmentos por tipo de mídia
  const imageSegments = project.segments.filter(s => {
    const type = s.assetType || 'image_static';
    return type.startsWith('image') || type === 'chroma_key' || (!type.startsWith('video') && !type.startsWith('audio'));
  });

  const videoSegments = project.segments.filter(s => {
    const type = s.assetType || '';
    return type.startsWith('video');
  });

  // Combinar imagens e vídeos na trilha visual (em ordem)
  const visualSegments = project.segments; // Todos ficam na trilha visual pois cada cena tem uma mídia associada

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">👁️ Preview do Vídeo</h2>
          <p className="text-white/60">
            Visualize o resultado antes de renderizar
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
          >
            ← Voltar
          </button>
          <button
            onClick={onContinue}
            className="px-6 py-2 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white rounded-lg font-medium transition-all"
          >
            🎬 Renderizar Vídeo
          </button>
        </div>
      </div>

      {/* Player de Preview */}
      <div className="bg-black/50 rounded-xl overflow-hidden shadow-2xl">
        {/* Controles de Preview */}
        <div className="p-4 border-b border-white/10 flex flex-wrap gap-4 items-center justify-between">
          
          {/* Modo de Legenda */}
          <div className="flex items-center gap-3">
            <span className="text-white/60 text-sm">📝 Legenda:</span>
            <div className="flex bg-white/5 rounded-lg p-1 gap-1">
              <button
                onClick={() => setSubtitleMode('paragraph')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  subtitleMode === 'paragraph'
                    ? 'bg-purple-500 text-white shadow-lg'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                Parágrafo
              </button>
              <button
                onClick={() => setSubtitleMode('word-by-word')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  subtitleMode === 'word-by-word'
                    ? 'bg-purple-500 text-white shadow-lg'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                Palavra por Palavra
              </button>
              <button
                onClick={() => setSubtitleMode('none')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  subtitleMode === 'none'
                    ? 'bg-purple-500 text-white shadow-lg'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                Sem Legenda
              </button>
            </div>
          </div>

          {/* Seletor de Aspect Ratio */}
          <div className="flex items-center gap-3">
            <span className="text-white/60 text-sm relative">
                📐 Proporção:
            </span>
            <div className="flex bg-white/5 rounded-lg p-1 gap-1 flex-wrap">
            {currentRatios.map(ratio => (
                <div key={ratio} className="relative group">
                    <button
                        onClick={() => setSelectedRatio(ratio)}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all pr-7 ${
                        selectedRatio === ratio
                            ? 'bg-pink-500 text-white shadow-lg'
                            : 'text-white/60 hover:text-white hover:bg-white/10'
                        }`}
                    >
                        {ratio}
                    </button>
                    {currentRatios.length > 1 && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleAspectRatio(ratio);
                            }}
                            className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 hover:bg-black/20 rounded-full text-white/40 hover:text-white transition-all"
                            title="Remover"
                        >
                            ×
                        </button>
                    )}
                </div>
            ))}
            
            {/* Botão Adicionar */}
            <div className="relative">
                <button
                    onClick={() => setShowRatioMenu(!showRatioMenu)}
                    className="px-3 py-1.5 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 transition-all border border-dashed border-white/20 hover:border-white/40"
                    title="Adicionar Proporção"
                >
                    +
                </button>
                
                {/* Menu Dropdown */}
                {showRatioMenu && (
                    <>
                        <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => setShowRatioMenu(false)} 
                        />
                        <div className="absolute right-0 top-full mt-2 w-32 bg-gray-800 border border-white/10 rounded-lg shadow-xl z-20 overflow-hidden">
                            {AVAILABLE_RATIOS.filter(r => !currentRatios.includes(r)).map(ratio => (
                                <button
                                    key={ratio}
                                    onClick={() => {
                                        toggleAspectRatio(ratio);
                                        setShowRatioMenu(false);
                                        setSelectedRatio(ratio);
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
                                >
                                    {ratio}
                                </button>
                            ))}
                            {AVAILABLE_RATIOS.every(r => currentRatios.includes(r)) && (
                                <div className="px-4 py-2 text-xs text-white/40 italic">
                                    Todas selecionadas
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-center bg-black/80 py-8">
            <div className="relative shadow-2xl" style={{ 
                aspectRatio: getCssAspectRatio(selectedRatio),
                height: '50vh',
                maxHeight: '480px'
            }}>
            <VideoPreviewPlayer
                project={remotionProject}
                durationInFrames={durationInFrames}
                fps={fps}
                onPlayerReady={handlePlayerReady}
            />
            </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* TIMELINE ESTILO FILMORA                                       */}
      {/* ============================================================ */}
      <div className="bg-[#0d0d14] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        
        {/* Tooltip de Info do Segmento */}
        {hoveredSegment && hoveredSeg && (
          <div 
            className="fixed z-[100] bg-black/90 backdrop-blur border border-white/20 p-3 rounded-lg shadow-2xl shadow-black max-w-[280px] pointer-events-none"
            style={{ left: hoveredSegment.x + 15, top: hoveredSegment.y - 100 }}
          >
            <p className="text-white text-sm font-bold truncate mb-1">Cena {hoveredSeg.id}</p>
            <p className="text-white/60 text-xs line-clamp-2 mb-2">{hoveredSeg.text}</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-white/50">
              <span>Início:</span>
              <span className="text-right text-white/80">{hoveredSeg.start.toFixed(2)}s</span>
              <span>Fim:</span>
              <span className="text-right text-white/80">{hoveredSeg.end.toFixed(2)}s</span>
              <span>Duração:</span>
              <span className="text-right text-white/80">{(hoveredSeg.end - hoveredSeg.start).toFixed(2)}s</span>
              <span>Tipo:</span>
              <span className="text-right text-white/80">{hoveredSeg.assetType || 'image_static'}</span>
            </div>
          </div>
        )}

        {/* Header da Timeline */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-[#13131a]">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400">
              <rect x="2" y="2" width="20" height="20" rx="2" />
              <line x1="7" y1="2" x2="7" y2="22" />
              <line x1="17" y1="2" x2="17" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
            </svg>
            Timeline
          </h3>

          <div className="flex items-center gap-4">
            {/* Zoom Controls */}
            <div className="flex bg-black/50 p-0.5 rounded-lg border border-white/5">
              <button onClick={handleZoomOut} className="w-7 h-7 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 active:scale-95 text-sm" title="Zoom Out">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <div className="flex items-center justify-center w-10 text-[10px] text-white/50 font-mono select-none">{Math.round(zoomLevel)}%</div>
              <button onClick={handleZoomIn} className="w-7 h-7 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 active:scale-95 text-sm" title="Zoom In">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>

            {/* Timecode */}
            <div className="flex items-center gap-2 text-xs text-white/40 font-mono">
              <span ref={timecodeRef} className="text-white/80">0:00.0</span>
              <span>/</span>
              <span>{Math.floor(durationInSeconds / 60)}:{(durationInSeconds % 60).toFixed(1).padStart(4, '0')}</span>
            </div>
          </div>
        </div>

        {/* Timeline Body */}
        <div className="flex">
          
          {/* Labels das Trilhas (lado esquerdo fixo) */}
          <div className="flex-shrink-0 w-[100px] bg-[#0a0a12] border-r border-white/10 z-20">
            {/* Espaço para a régua */}
            <div className="h-[28px] border-b border-white/10" />
            
            {/* Label: Trilha Visual */}
            <div className="h-[72px] flex items-center px-3 border-b border-white/[0.06] gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold text-white/70 tracking-wide uppercase">Vídeo</span>
                <span className="text-[9px] text-white/30">{visualSegments.length} cenas</span>
              </div>
            </div>

            {/* Label: Trilha de Áudio */}
            <div className="h-[56px] flex items-center px-3 gap-2">
              <div className="w-2 h-2 rounded-full bg-pink-400 shadow-[0_0_6px_rgba(236,72,153,0.5)]" />
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold text-white/70 tracking-wide uppercase">Áudio</span>
                <span className="text-[9px] text-white/30">{audioUrl ? '1 faixa' : 'Vazio'}</span>
              </div>
            </div>
          </div>

          {/* Área Scrollável da Timeline */}
          <div 
            ref={scrollWrapperRef}
            className="relative flex-1 min-w-0 overflow-x-auto overflow-y-hidden custom-scrollbar"
            onClick={handleBackgroundClick}
          >
            <div 
              className="relative"
              style={{ width: totalTimelineWidth }}
              ref={trackContainerRef}
            >
              
              {/* ====== RÉGUA ====== */}
              <div 
                className="relative h-[28px] border-b border-white/15 cursor-text bg-[#16161f] hover:bg-[#1a1a25] transition-colors z-40"
                onMouseDown={handleRulerMouseDown}
                title="Clique para buscar / Arraste para zoom"
              >
                {(() => {
                  const { major, minor } = getRulerSteps(zoomLevel);
                  const maxTime = Math.ceil(Math.max(durationInSeconds, viewportWidth / zoomLevel));
                  const markers: React.ReactNode[] = [];

                  for (let time = 0; time <= maxTime; time += minor) {
                    const isMajor = Math.round(time * 10) % Math.round(major * 10) === 0;
                    markers.push(
                      <div 
                        key={time}
                        className={`absolute bottom-0 border-l pointer-events-none ${isMajor ? 'top-1 border-white/40 z-10' : 'top-3 border-white/10 z-0'}`}
                        style={{ left: time * zoomLevel }}
                      >
                        {isMajor && (
                          <span className="absolute -top-[9px] -translate-x-1/2 text-[9px] text-white/50 font-mono select-none px-[3px]">
                            {formatRulerTime(time)}
                          </span>
                        )}
                      </div>
                    );
                  }
                  return markers;
                })()}
              </div>

              {/* ====== TRILHA VISUAL (Imagens/Vídeos) ====== */}
              <div className="relative h-[72px] border-b border-white/[0.06] bg-[#0e0e17]">
                {/* Grid de fundo (estilo editor) */}
                <div className="absolute inset-0 opacity-[0.03]" style={{
                  backgroundImage: `repeating-linear-gradient(90deg, white 0, white 1px, transparent 1px, transparent ${zoomLevel}px)`,
                  backgroundSize: `${zoomLevel}px 100%`
                }} />

                {visualSegments.map((seg) => {
                  const left = seg.start * zoomLevel;
                  const width = Math.max(4, (seg.end - seg.start) * zoomLevel);
                  const isVideo = (seg.assetType || '').startsWith('video');
                  const isSelected = selectedSegmentId === seg.id;
                  const trackColor = isVideo ? TRACK_COLORS.video : TRACK_COLORS.image;

                  return (
                    <div
                      key={seg.id}
                      className={`absolute top-[4px] bottom-[4px] rounded-md overflow-hidden cursor-pointer transition-all group/clip ${
                        isSelected 
                          ? 'ring-2 ring-white/60 shadow-[0_0_12px_rgba(255,255,255,0.15)] z-10' 
                          : 'ring-1 ring-white/10 hover:ring-white/30 hover:z-10'
                      }`}
                      style={{ 
                        left, 
                        width,
                        backgroundColor: `${trackColor}15`,
                        borderLeft: `3px solid ${trackColor}`,
                      }}
                      onClick={(e) => { e.stopPropagation(); setSelectedSegmentId(seg.id); }}
                      onMouseEnter={(e) => handleSegmentMouseEnter(e, seg.id)}
                      onMouseLeave={handleSegmentMouseLeave}
                    >
                      {/* Background Image Thumbnail */}
                      <SceneThumbnail 
                        imageUrl={seg.imageUrl || seg.asset_url} 
                        text={seg.text} 
                      />

                      {/* Gradient overlay para legibilidade */}
                      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-black/60" />

                      {/* Informações */}
                      <div className="absolute inset-0 flex flex-col justify-between p-1.5 z-10">
                        <div className="flex items-center gap-1">
                          {/* Badge tipo */}
                          <span className={`inline-flex items-center gap-0.5 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${
                            isVideo 
                              ? 'bg-purple-500/40 text-purple-200' 
                              : 'bg-blue-500/40 text-blue-200'
                          }`}>
                            {isVideo ? (
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
                            ) : (
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                            )}
                            {isVideo ? 'VID' : 'IMG'}
                          </span>
                          <span className="text-[9px] text-white/60 font-mono">{seg.id}</span>
                        </div>
                        <span className="text-[9px] text-white/80 truncate leading-tight">{seg.text}</span>
                      </div>

                      {/* Borda de hover/seleção animada */}
                      <div className={`absolute inset-0 border-b-2 transition-colors ${
                        isSelected ? 'border-white/40' : 'border-transparent group-hover/clip:border-white/20'
                      }`} />
                    </div>
                  );
                })}
              </div>

              {/* ====== TRILHA DE ÁUDIO ====== */}
              <div className="relative h-[56px] bg-[#0c0c14]">
                {/* Grid de fundo */}
                <div className="absolute inset-0 opacity-[0.03]" style={{
                  backgroundImage: `repeating-linear-gradient(90deg, white 0, white 1px, transparent 1px, transparent ${zoomLevel}px)`,
                  backgroundSize: `${zoomLevel}px 100%`
                }} />

                {audioUrl && (
                  <div 
                    className="absolute top-[4px] bottom-[4px] rounded-md overflow-hidden ring-1 ring-pink-500/20"
                    style={{ 
                      left: 0, 
                      width: Math.max(4, durationInSeconds * zoomLevel),
                      backgroundColor: `${TRACK_COLORS.audio}08`,
                      borderLeft: `3px solid ${TRACK_COLORS.audio}`,
                    }}
                  >
                    {/* Waveform */}
                    <AudioWaveformDisplay 
                      audioUrl={audioUrl} 
                      color={TRACK_COLORS.audio} 
                      duration={durationInSeconds} 
                      widthScale={zoomLevel} 
                    />
                    
                    {/* Label */}
                    <div className="absolute top-1 left-2 z-10">
                      <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-pink-500/30 text-pink-200 flex items-center gap-1">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/></svg>
                        AUDIO
                      </span>
                    </div>
                  </div>
                )}

                {!audioUrl && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-white/15 text-xs">Sem áudio</span>
                  </div>
                )}
              </div>

              {/* ====== PLAYHEAD (Agulha vermelha) ====== */}
              <div 
                ref={playheadRef}
                className="absolute top-0 w-[2px] bg-red-500 z-50 pointer-events-none"
                style={{ 
                  height: '100%', 
                  transform: `translateX(0px)`,
                  boxShadow: '0 0 8px rgba(239,68,68,0.4)',
                }}
              >
                {/* Handle da agulha - clicável */}
                <div 
                  className="playhead-handle absolute -top-[0px] left-1/2 -translate-x-1/2 w-8 h-8 cursor-pointer flex items-start justify-center pointer-events-auto group/handle z-50"
                  onMouseDown={handlePlayheadMouseDown}
                >
                  <div className="flex flex-col items-center">
                    <div ref={playheadLabelRef} className="bg-red-500 text-white text-[8px] font-bold px-[5px] py-[1px] rounded-t-sm shadow-md group-hover/handle:bg-red-400 group-hover/handle:scale-110 transition-transform">
                      0.0
                    </div>
                    <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-red-500 group-hover/handle:border-t-red-400 drop-shadow-md" />
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Informações do projeto */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-white/5 rounded-lg text-center">
          <p className="text-white/60 text-sm">Duração</p>
          <p className="text-white text-lg font-bold">
            {Math.floor(durationInSeconds / 60)}:{String(Math.floor(durationInSeconds % 60)).padStart(2, '0')}
          </p>
        </div>
        <div className="p-4 bg-white/5 rounded-lg text-center">
          <p className="text-white/60 text-sm">Cenas</p>
          <p className="text-white text-lg font-bold">{project.segments.length}</p>
        </div>
        <div className="p-4 bg-white/5 rounded-lg text-center">
          <p className="text-white/60 text-sm">Resolução Atual</p>
          <p className="text-white text-lg font-bold">
            {ASPECT_RATIO_DIMENSIONS[selectedRatio]?.width}x{ASPECT_RATIO_DIMENSIONS[selectedRatio]?.height}
          </p>
        </div>
      </div>

      {/* Aviso sobre renderização */}
      <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
        <p className="text-purple-300 text-sm">
          💡 <strong>Dica:</strong> O preview usa qualidade reduzida para performance. 
          O vídeo final será renderizado em alta qualidade com aceleração por GPU.
        </p>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.4); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.3); }
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      `}} />
    </div>
  );
}
