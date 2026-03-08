import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NicheModal, ChannelNiche } from './NicheModal';

interface UploadStepProps {
  onUpload: (file: File, originalFile?: File) => void;
  selectedAspectRatios: string[];
  onAspectRatiosChange: (value: string[]) => void;
  selectedNiche: ChannelNiche | null;
  onNicheChange: (niche: ChannelNiche | null) => void;
  isTranscribing?: boolean;
  transcriptionMessage?: string;
}

const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '4:5', '3:4'];
const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#14b8a6', '#8b5cf6', '#ec4899'];
const MIN_ZOOM = 5;
const MAX_ZOOM = 300;
const DEFAULT_ZOOM = 80;

interface TimelineItem {
  id: string;
  file: File;
  buffer: AudioBuffer | null;
  duration: number;
  color: string;
}

// Converte Array de AudioBuffer para Wav Blob
function audioBufferToWav(buffer: AudioBuffer) {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArray = new ArrayBuffer(length);
  const view = new DataView(bufferArray);
  let offset = 0;

  function setUint16(data: number) { view.setUint16(offset, data, true); offset += 2; }
  function setUint32(data: number) { view.setUint32(offset, data, true); offset += 4; }

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit
  setUint32(0x61746164); // "data" chunk
  setUint32(length - 44); // chunk length

  const channels: Float32Array[] = [];
  for (let i = 0; i < numOfChan; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let pos = 0;
  while (pos < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][pos]));
      sample = (sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
    pos++;
  }

  return new Blob([bufferArray], { type: "audio/wav" });
}

// Draw Waveform Component
function WaveformDisplay({ buffer, color, duration, widthScale }: { buffer: AudioBuffer; color: string; duration: number; widthScale: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = duration * widthScale;
    const height = 64; 
    
    // Minimum 1px width to avoid canvas errors during dragging/fast updates
    canvas.width = Math.max(1, width) * dpr;
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

  return <canvas ref={canvasRef} style={{ width: Math.max(1, duration * widthScale), height: 64 }} className="opacity-90 absolute top-0 left-0 pointer-events-none" />;
}

// Regras Adaptativas para a Régua da Timeline
const getRulerSteps = (zoom: number) => {
    if (zoom < 10) return { major: 60, minor: 10 };     // Escala 1 min
    if (zoom < 20) return { major: 30, minor: 5 };      // Escala 30s
    if (zoom < 50) return { major: 15, minor: 5 };      // Escala 15s
    if (zoom < 100) return { major: 5, minor: 1 };      // Escala 5s
    if (zoom < 200) return { major: 2, minor: 1 };      // Escala 2s
    return { major: 1, minor: 0.5 };                    // Escala 1s
};

const formatRulerTime = (seconds: number) => {
    if (seconds === 0) return '0s';
    if (seconds < 60) return `${seconds}s`;
    
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    
    if (s === 0) return `${m}m`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export function UploadStep({
 
  onUpload,
  selectedAspectRatios = [],
  onAspectRatiosChange,
  selectedNiche,
  onNicheChange,
  isTranscribing = false,
  transcriptionMessage = '',
}: UploadStepProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isNicheModalOpen, setIsNicheModalOpen] = useState(false);
  const [ttsText, setTtsText] = useState('');
  const [ttsModel, setTtsModel] = useState('gemini-2.5-flash-preview-tts');
  const [ttsGenerating, setTtsGenerating] = useState(false);
  
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);

  // Estados da Timeline
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const startTimeRef = useRef<number>(0);
  const trackContainerRef = useRef<HTMLDivElement>(null);
  
  const scrollWrapperRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(1000);
  
  // Drag / Drop / Hover Refs
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [hoveredInfo, setHoveredInfo] = useState<{item: TimelineItem, x: number, y: number} | null>(null);
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, id: string | null} | null>(null);

  // Calcula a largura visual disponível pro editor pra preencher a régua
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

  // Atalhos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar se o usuário estiver digitando em um input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.size > 0 && !e.target?.toString().includes('Input')) {
          setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
          setSelectedIds(new Set());
          if (isPlaying) stopPlayback();
        }
      } else if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault(); // Evita a página de rolar para baixo
        togglePlayback();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, isPlaying, items, currentTime]); // <- dependências do togglePlayback implicito

  // Click global pra fechar menu de contexto
  useEffect(() => {
    const closeContext = () => setContextMenu(null);
    window.addEventListener('click', closeContext);
    return () => window.removeEventListener('click', closeContext);
  }, []);

  // Processa novos arquivos
  const processFiles = async (files: File[], position: 'start' | 'end') => {
    setIsDecoding(true);
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new Ctx();
      const newItems: TimelineItem[] = [];

      for(let i=0; i<files.length; i++) {
        const file = files[i];
        const arrayBuffer = await file.arrayBuffer();
        const buffer = await audioCtx.decodeAudioData(arrayBuffer);
        
        newItems.push({
          id: Math.random().toString(36).substr(2, 9) + '-' + Date.now(),
          file,
          buffer,
          duration: buffer.duration,
          color: COLORS[Math.floor(Math.random() * COLORS.length)]
        });
      }
      
      setItems(prev => position === 'start' ? [...newItems, ...prev] : [...prev, ...newItems]);
      if (isPlaying) stopPlayback();
    } catch (err) {
      console.error('Erro ao ler áudios:', err);
      alert('Houve um erro ao processar os arquivos de áudio suportados.');
    } finally {
      setIsDecoding(false);
    }
  };

  const handleGenerateTTS = async () => {
    if (!ttsText.trim() || !selectedNiche?.voice_id) return;
    
    setTtsGenerating(true);
    try {
      let currentStyle = '';
      if (selectedNiche.voice_styles && selectedNiche.voice_styles.length > 0) {
          const styleVar = selectedNiche.voice_styles[0];
          currentStyle = typeof styleVar === 'string' ? styleVar : (styleVar as any).name || '';
      }
      
      const fullText = currentStyle ? `${currentStyle} ${ttsText}` : ttsText;
      
      const result = await (window as any).electron.videoProject.generateTTS({
        text: fullText,
        voiceName: selectedNiche.voice_id,
        model: ttsModel
      });

      if (result.success && result.httpUrl) {
        // Obter o blob do audio gerado para inserir na timeline usando processFiles
        const response = await fetch(result.httpUrl);
        const blob = await response.blob();
        const file = new File([blob], result.filename || 'tts_audio.wav', { type: blob.type || 'audio/wav' });
        
        await processFiles([file], 'end');
        setTtsText(''); // Clear text after success
      } else {
        alert(result.error || 'Erro ao gerar TTS.');
      }
    } catch (err: any) {
      console.error('Erro ao chamar TTS:', err);
      alert('Houve um erro ao processar o TTS: ' + (err.message || String(err)));
    } finally {
      setTtsGenerating(false);
    }
  };

  const stopPlayback = useCallback(() => {
    sourceNodesRef.current.forEach(src => {
      try { src.stop(); } catch(e){}
      try { src.disconnect(); } catch(e){}
    });
    sourceNodesRef.current = [];
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(console.error);
    }
    audioCtxRef.current = null;
    setIsPlaying(false);
  }, []);

  const playFrom = useCallback((startOffset: number) => {
    if (items.length === 0) return;
    
    stopPlayback();
    
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    sourceNodesRef.current = [];
    
    let scheduledTime = ctx.currentTime;
    startTimeRef.current = ctx.currentTime - startOffset; 
    
    let currentClipStart = 0;

    for (let i = 0; i < items.length; i++) {
        const buffer = items[i].buffer;
        if (!buffer) continue;
        
        const clipEnd = currentClipStart + buffer.duration;
        
        // Só toca se a timeline "cortou" dentro do clip ou passou antes dele
        if (clipEnd > startOffset) {
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            
            const offsetInClip = Math.max(0, startOffset - currentClipStart);
            const durationToPlay = buffer.duration - offsetInClip;
            
            source.start(scheduledTime, offsetInClip);
            sourceNodesRef.current.push(source);
            
            scheduledTime += durationToPlay;
        }
        currentClipStart += buffer.duration;
    }
    
    setIsPlaying(true);
  }, [items, stopPlayback]);

  const togglePlayback = () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      playFrom(currentTime);
    }
  };

  const seekTo = useCallback((time: number) => {
    const safeTime = Math.max(0, Math.min(time, items.reduce((acc, it) => acc + it.duration, 0)));
    setCurrentTime(safeTime);
    if (isPlaying) {
        playFrom(safeTime);
    }
  }, [items, isPlaying, playFrom]);

  // RequestAnimationFrame loop do Playhead
  useEffect(() => {
    let rafId: number;
    const totalDuration = items.reduce((acc, it) => acc + (it.duration || 0), 0);
    
    const update = () => {
        if (!isPlaying || !audioCtxRef.current) return;
        
        const time = audioCtxRef.current.currentTime - startTimeRef.current;
        if (time >= totalDuration) {
            stopPlayback();
            setCurrentTime(totalDuration); // Fica preso no final
        } else {
            setCurrentTime(time);
            rafId = requestAnimationFrame(update);
        }
    };
    
    if (isPlaying) {
      rafId = requestAnimationFrame(update);
    }
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, items, stopPlayback]);

  // Arrastador da Régua (Apenas Zoom)
  const handleRulerMouseDown = (e: React.MouseEvent) => {
    // Se o click foi exatamente em cima do "handle" da agulha, não faça nada aqui (a agulha tem seu próprio handler)
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
        
        // Se não arrastou, é um clique simples para mover a agulha no ruler
        if (!isDragging && trackContainerRef.current) {
            const rect = trackContainerRef.current.getBoundingClientRect();
            let x = upEvent.clientX - rect.left;
            seekTo(Math.max(0, x) / zoomLevel);
        }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Arrastador exclusivo da Agulha (Playhead)
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

  // Drag and Drop (Arquivos externos)
  const handleMainDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.types.includes('application/x-timeline-item')) return;
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
    if (files.length > 0) processFiles(files, 'end');
  };

  // Drag and drop Timeline itens (Reordenamento)
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-timeline-item', idx.toString());
    setDraggedIdx(idx);
    e.stopPropagation();
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('application/x-timeline-item')) setDragOverIdx(idx);
  };
  const handleDropItem = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    
    // Tratamos reordenamento aqui
    if (e.dataTransfer.types.includes('application/x-timeline-item')) {
      e.stopPropagation();
      if (draggedIdx !== null && draggedIdx !== idx) {
          const newItems = [...items];
          const dragged = newItems.splice(draggedIdx, 1)[0];
          newItems.splice(idx, 0, dragged);
          setItems(newItems);
          if (isPlaying) stopPlayback();
      }
      setDraggedIdx(null);
      setDragOverIdx(null);
    }
    // Se for arquivo externo, não usamos stopPropagation, e deixamos o evento 
    // borbulhar (bubble up) até o handleMainDrop para cadastrar o áudio.
  };

  // Propriedades do Tooltip de Hover
  const handleItemMouseEnter = (e: React.MouseEvent, item: TimelineItem) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    const x = e.clientX;
    const y = e.clientY;
    
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredInfo({ item, x, y });
    }, 2000);
  };
  const handleItemMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredInfo(null);
  };

  // Botão Direito (Context Menu)
  const handleRightClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, id });
    if (!selectedIds.has(id)) {
        setSelectedIds(new Set([id]));
    }
  };

  // Cliques Esquerdo p/ Seleção
  const handleItemClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);
    if (e.ctrlKey || e.metaKey) {
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
    } else {
        newSet.clear();
        newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // Deselecionar ao clicar no fundo
  const handleBackgroundClick = () => {
    setSelectedIds(new Set());
  };

  const handleZoomIn = () => setZoomLevel(z => Math.min(z * 1.5, MAX_ZOOM));
  const handleZoomOut = () => setZoomLevel(z => Math.max(z / 1.5, MIN_ZOOM));

  const handleDeleteSelected = () => {
    setItems(items.filter(i => !selectedIds.has(i.id)));
    setSelectedIds(new Set());
    setContextMenu(null);
    if(isPlaying) stopPlayback();
  };

  const handleSubmit = async () => {
    if (items.length === 0) return;
    stopPlayback();
    
    setIsMerging(true);
    try {
      let offsetTime = 0;
      for (const item of items) {
        if (item.buffer) offsetTime += item.buffer.duration;
      }
      
      // 1. Renderizar áudio de BAIXA qualidade para transcrição (Mono, 16000Hz)
      const transSampleRate = 16000;
      const transChannels = 1;
      const transTotalLength = Math.ceil(offsetTime * transSampleRate);
      const transOfflineCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(transChannels, transTotalLength, transSampleRate);

      let currentOffset = 0;
      for (const item of items) {
        if (!item.buffer) continue;
        const source = transOfflineCtx.createBufferSource();
        source.buffer = item.buffer;
        source.connect(transOfflineCtx.destination);
        source.start(currentOffset);
        currentOffset += item.buffer.duration;
      }

      const transRenderedBuffer = await transOfflineCtx.startRendering();
      const transWavBlob = audioBufferToWav(transRenderedBuffer);
      const transcriptionFile = new File([transWavBlob], 'audio_transcricao.wav', { type: 'audio/wav' });

      // 2. Renderizar áudio em ALTA qualidade original para o vídeo (Stereo, 44100Hz)
      const origSampleRate = 44100;
      const origChannels = 2; // Stereo
      const origTotalLength = Math.ceil(offsetTime * origSampleRate);
      const origOfflineCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(origChannels, origTotalLength, origSampleRate);

      currentOffset = 0;
      for (const item of items) {
        if (!item.buffer) continue;
        const source = origOfflineCtx.createBufferSource();
        source.buffer = item.buffer;
        source.connect(origOfflineCtx.destination);
        source.start(currentOffset);
        currentOffset += item.buffer.duration;
      }

      const origRenderedBuffer = await origOfflineCtx.startRendering();
      const origWavBlob = audioBufferToWav(origRenderedBuffer);
      const originalFile = new File([origWavBlob], 'audio_processado.wav', { type: 'audio/wav' });
      
      onUpload(transcriptionFile, originalFile);
    } catch (error) {
      console.error('Erro ao juntar áudios:', error);
      alert('Ocorreu um erro ao juntar os áudios.');
    } finally {
      setIsMerging(false);
    }
  };

  const totalDuration = items.reduce((sum, i) => sum + (i.duration || 0), 0);

  // Função Reutilizável de Adição de File
  const renderDropZoneBoundary = (position: 'start'|'end') => (
    <label className="flex-shrink-0 w-10 h-full rounded-lg border-2 border-dashed border-white/20 bg-white/5 hover:bg-white/10 hover:border-pink-500 cursor-pointer flex items-center justify-center transition-colors group" title={`Adicionar no ${position === 'start' ? 'Início' : 'Fim'}`}>
       <input type="file" accept="audio/*" multiple className="hidden" onChange={(e) => {
           if (e.target.files) processFiles(Array.from(e.target.files), position);
           e.target.value = '';
       }} />
       <div className="w-5 h-5 rounded border border-white/20 group-hover:border-pink-500 border-dotted flex items-center justify-center text-white/40 group-hover:text-pink-400 text-sm">
           +
       </div>
    </label>
  );

  const toggleAspectRatio = (ratio: string) => {
    if (selectedAspectRatios.includes(ratio)) {
      onAspectRatiosChange(selectedAspectRatios.filter(r => r !== ratio));
    } else {
      onAspectRatiosChange([...selectedAspectRatios, ratio]);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] relative">
      
      {/* Tooltip de Info do Áudio */}
      {hoveredInfo && (
        <div 
           className="fixed z-[100] bg-black/90 backdrop-blur border border-white/20 p-3 rounded-lg shadow-2xl shadow-black max-w-[250px] pointer-events-none"
           style={{ left: hoveredInfo.x + 15, top: hoveredInfo.y + 15 }}
        >
           <p className="text-white text-sm font-bold truncate mb-1">{hoveredInfo.item.file.name}</p>
           <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-white/60 mt-2">
              <span>Duração:</span>
              <span className="text-right text-white/90">{hoveredInfo.item.duration.toFixed(2)}s</span>
              <span>Tamanho:</span>
              <span className="text-right text-white/90">{(hoveredInfo.item.file.size / 1024 / 1024).toFixed(2)} MB</span>
              <span>Taxa:</span>
              <span className="text-right text-white/90">{hoveredInfo.item.buffer?.sampleRate || 0} Hz</span>
           </div>
        </div>
      )}

      {/* Menu de Contexto (Botão Direito) */}
      {contextMenu && (
         <div 
           className="fixed z-[100] bg-gray-900 border border-white/10 rounded-lg shadow-xl py-1 min-w-[150px]"
           style={{ left: contextMenu.x, top: contextMenu.y }}
           onClick={(e) => e.stopPropagation()}
         >
            <button 
               onClick={handleDeleteSelected}
               className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/5 hover:text-red-300 flex items-center gap-2"
            >
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
               Deletar ({selectedIds.size})
            </button>
         </div>
      )}

      {/* TIMELINE PRINCIPAL ALWAYS VISIBLE */}
      <div 
         className="w-full bg-[#13131a] p-6 rounded-2xl border border-white/10 relative shadow-2xl transition-all"
         onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
         onDragLeave={() => setIsDragging(false)}
         onDrop={handleMainDrop}
      >
        {isDragging && (
           <div className="absolute inset-0 bg-pink-500/10 border-2 border-pink-500 border-dashed rounded-2xl z-50 pointer-events-none flex items-center justify-center">
              <span className="text-pink-400 font-bold text-xl bg-black/50 px-6 py-3 rounded-full backdrop-blur-md">Soltar áudios aqui</span>
           </div>
        )}
          
          <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-pink-500">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6"></path>
                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path>
              </svg>
              Editor de Áudio
            </h3>
            
            <div className="flex bg-black/50 p-1 rounded-lg border border-white/5 mx-auto lg:mx-0">
               <button onClick={handleZoomOut} className="w-8 h-8 rounded flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 active:scale-95" title="Zoom Out">-</button>
               <div className="flex items-center justify-center w-12 text-xs text-white/60 font-mono select-none">{Math.round(zoomLevel)}%</div>
               <button onClick={handleZoomIn} className="w-8 h-8 rounded flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 active:scale-95" title="Zoom In">+</button>
            </div>

            <div className="flex items-center gap-4 text-sm text-white/50 font-mono">
              <span className="text-white/90">{Math.floor(currentTime / 60)}:{(currentTime % 60).toFixed(2).padStart(5, '0')}</span> 
              <span>/</span> 
              <span>{Math.floor(totalDuration / 60)}:{(totalDuration % 60).toFixed(2).padStart(5, '0')}</span>
            </div>
          </div>
          <div className="flex gap-3 w-full h-[180px]">
              
              {renderDropZoneBoundary('start')}

              {/* TIMELINE EDITOR */}
              <div 
                 ref={scrollWrapperRef}
                 className="relative flex-1 min-w-0 h-full bg-black/60 border border-white/10 overflow-x-auto overflow-y-hidden rounded-xl custom-scrollbar flex"
                 onDragOver={(e) => e.preventDefault()}
                 onDrop={handleMainDrop}
                 onClick={handleBackgroundClick}
              >
                 {isDecoding && (
                   <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center">
                      <div className="w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
                   </div>
                 )}

                 <div className="h-full flex px-4">

                 <div 
                   className="relative h-full flex pt-[40px] pb-4 items-start mx-2 min-w-full" 
                   style={{ width: Math.max(totalDuration * zoomLevel, viewportWidth) }}
                 >
                    {/* Ruler (Agulha Target) - Clicável para Seek */}
                    <div 
                        className="absolute top-0 left-0 right-0 h-6 border-b border-white/20 cursor-text bg-white/5 hover:bg-white/10 transition-colors z-40"
                        onMouseDown={handleRulerMouseDown}
                        title="Clique ou arraste para buscar"
                    >
                        {(() => {
                            const { major, minor } = getRulerSteps(zoomLevel);
                            const maxTime = Math.ceil(Math.max(totalDuration, viewportWidth / zoomLevel));
                            const markers = [];
                            
                            for (let time = 0; time <= maxTime; time += minor) {
                                // Usa 10 como fator de correção do JS math precision (0.5 * 10 = 5)
                                const isMajor = Math.round(time * 10) % Math.round(major * 10) === 0;
                                
                                markers.push(
                                    <div 
                                       key={time} 
                                       className={`absolute bottom-0 border-l pointer-events-none ${isMajor ? 'top-1 border-white/50 z-10' : 'top-3 border-white/15 z-0'}`} 
                                       style={{ left: time * zoomLevel }}
                                    >
                                        {isMajor && (
                                           <span className="absolute -top-[10px] -translate-x-1/2 text-[10px] text-white/60 font-mono select-none bg-[#13131a]/90 backdrop-blur-sm px-[4px] py-[2px] rounded border border-white/5 shadow-md">
                                               {formatRulerTime(time)}
                                           </span>
                                        )}
                                    </div>
                                );
                            }
                            return markers;
                        })()}
                    </div>

                    {/* Container Track real (Onde as caixas ficam) */}
                    <div className="w-full flex relative z-10 h-[64px] border-y border-white/5 bg-white/[0.02]" ref={trackContainerRef}>
                        {items.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <span className="text-white/20 text-sm font-medium">Sua timeline está vazia. Comece adicionando áudios.</span>
                            </div>
                        )}
                        
                        {items.map((item, idx) => {
                           const isSelected = selectedIds.has(item.id);
                           return (
                               <div 
                                  key={item.id}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, idx)}
                                  onDragOver={(e) => handleDragOver(e, idx)}
                                  onDrop={(e) => handleDropItem(e, idx)}
                                  onClick={(e) => handleItemClick(e, item.id)}
                                  onContextMenu={(e) => handleRightClick(e, item.id)}
                                  onMouseEnter={(e) => handleItemMouseEnter(e, item)}
                                  onMouseLeave={handleItemMouseLeave}
                                  className={`relative h-[64px] rounded-lg overflow-hidden border-y-2 border-r-2 border-l-[4px] cursor-grab active:cursor-grabbing transition-colors flex-shrink-0 group ${dragOverIdx === idx ? 'border-pink-500 scale-[1.02] bg-white/20' : isSelected ? 'border-l-pink-500 border-y-pink-500/50 border-r-pink-500/50 bg-pink-500/10' : 'border-white/10 hover:border-white/30'}`}
                                  style={{ 
                                      width: Math.max(20, item.duration * zoomLevel), 
                                      backgroundColor: isSelected ? undefined : `${item.color}15`,
                                      borderLeftColor: item.color,
                                      marginLeft: dragOverIdx === idx && draggedIdx !== null && draggedIdx > idx ? 60 : 0, 
                                      marginRight: dragOverIdx === idx && draggedIdx !== null && draggedIdx < idx ? 60 : 0, 
                                  }}
                               >
                                  <div className="absolute top-1 left-2 max-w-[calc(100%-8px)] z-20 pointer-events-none drop-shadow-md flex flex-col">
                                     <span className="text-[10px] font-bold text-white/90 truncate pr-2 bg-black/40 px-1 rounded shadow-sm">{item.file.name}</span>
                                  </div>
                                  
                                  {item.buffer && (
                                     <WaveformDisplay buffer={item.buffer} color={item.color} duration={item.duration} widthScale={zoomLevel} />
                                  )}
                               </div>
                           );
                        })}
                    </div>

                    {/* Playhead (Agulha vermelha) */}
                    <div 
                       className="absolute top-0 w-[2px] bg-red-500 z-50 transition-transform group-hover:bg-red-400"
                       style={{ 
                          height: 'calc(100% - 16px)', 
                          transform: `translateX(${currentTime * zoomLevel}px)`,
                          transitionDuration: isPlaying ? '0ms' : '100ms'
                       }}
                    >
                       {/* Zona invisível maior para facilitar o clique/arrasto no topo da agulha */}
                       <div 
                          className="playhead-handle absolute -top-[20px] left-1/2 -translate-x-1/2 w-8 h-10 cursor-pointer flex items-center justify-center peer group/handle"
                          onMouseDown={handlePlayheadMouseDown}
                       >
                           {/* A ponta da agulha visual (Triângulo com texto) */}
                           <div className="flex flex-col items-center translate-y-[2px]">
                               <div className="bg-red-500 text-white text-[9px] font-bold px-[6px] py-[2px] rounded-t-sm shadow-sm group-hover/handle:bg-red-400 group-hover/handle:scale-110 transition-transform">
                                  {(currentTime).toFixed(1)}
                               </div>
                               <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-500 group-hover/handle:border-t-red-400 drop-shadow-md"></div>
                           </div>
                       </div>
                    </div>

                    </div>
                 </div>
              </div>
             
             {renderDropZoneBoundary('end')}

          </div>

          <p className="text-white/30 text-xs mt-2 text-center">
             Dica: Ctrl + Clique para selecionar vários arquivos. Arraste para reordenar. Delete para apagar. Mouse-over vê propriedades.
          </p>

          {/* Controles Principais */}
          <div className="flex justify-between items-center bg-black/40 p-5 rounded-2xl mt-4 border border-white/5 shadow-inner">
            
            <div className="flex-1">
               {selectedIds.size > 0 && (
                  <button onClick={handleDeleteSelected} className="text-sm bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white px-3 py-1.5 rounded-lg border border-red-500/30 transition-all">
                     Lixeira ({selectedIds.size})
                  </button>
               )}
            </div>
            
            <div className="flex items-center gap-4 flex-1 justify-center">
               <button onClick={() => seekTo(Math.max(0, currentTime - 5))} className="p-2 text-white/40 hover:text-white/80 transition-colors" title="Voltar 5s">
                   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 19 2 12 11 5 11 19"></polygon><polygon points="22 19 13 12 22 5 22 19"></polygon></svg>
               </button>

               <button
                  onClick={togglePlayback}
                  className={`w-14 h-14 flex items-center justify-center rounded-full transition-all hover:scale-105 active:scale-95 shadow-2xl border-2 ${isPlaying ? 'bg-white/10 text-white border-white/20' : 'bg-pink-500 hover:bg-pink-400 text-white border-pink-400 shadow-pink-500/30'}`}
               >
                  {isPlaying ? (
                     <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" />
                     </svg>
                  ) : (
                     <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" className="ml-1">
                        <path d="M5 3l14 9-14 9V3z" />
                     </svg>
                  )}
               </button>

               <button onClick={() => seekTo(Math.min(totalDuration, currentTime + 5))} className="p-2 text-white/40 hover:text-white/80 transition-colors" title="Avançar 5s">
                   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 19 22 12 13 5 13 19"></polygon><polygon points="2 19 11 12 2 5 2 19"></polygon></svg>
               </button>
            </div>

            <div className="flex-1 flex justify-end">
               <button
                 onClick={handleSubmit}
                 disabled={isMerging || isDecoding || isPlaying || items.length === 0 || isTranscribing}
                 className="px-6 py-2.5 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-400 hover:to-purple-400 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed text-white rounded-xl font-bold transition-all shadow-lg flex items-center gap-2 active:scale-95"
               >
                 {isMerging || isTranscribing ? (
                   <>
                     <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {isTranscribing ? transcriptionMessage : 'Processando...'}
                   </>
                 ) : (
                   <>
                     Transcrever
                     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                   </>
                 )}
               </button>
            </div>
          </div>
        </div>

      {/* Campos de Configuração (Nicho e Proporção) */}
      <div className="w-full max-w-5xl mt-8 grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Coluna 1: Configurações Gerais */}
        <div className="space-y-6">
          <div>
            <label className="block text-white/80 font-medium mb-2">Nicho do Canal</label>
            <button onClick={() => setIsNicheModalOpen(true)} className={`w-full p-4 rounded-xl border-2 transition-all text-left group hover:shadow-[0_0_20px_rgba(236,72,153,0.1)] ${selectedNiche ? 'border-pink-500/50 bg-pink-500/10' : 'border-white/10 bg-black/30 hover:border-white/30 hover:bg-white/5'}`}>
              {selectedNiche ? (
                <div className="flex items-center gap-3">
                  <span className="text-2xl drop-shadow-md">{selectedNiche.icon || '📺'}</span>
                  <div className="flex-1"><h4 className="text-white font-medium group-hover:text-pink-400 transition-colors">{selectedNiche.name}</h4><p className="text-white/50 text-sm mt-0.5">{selectedNiche.description}</p></div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center group-hover:bg-pink-500/20 transition-colors"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40 group-hover:text-pink-400"><path d="M12 5v14M5 12h14" /></svg></div>
                  <div className="flex-1"><span className="text-white/60 font-medium group-hover:text-white/90 transition-colors">Selecionar/Criar nicho do canal</span></div>
                </div>
              )}
            </button>
          </div>

          <div>
            <label className="block text-white/80 font-medium mb-2">Proporção do Vídeo</label>
            <div className="grid grid-cols-3 gap-3">
              {ASPECT_RATIOS.map((ratio) => (
                <button key={ratio} onClick={() => toggleAspectRatio(ratio)} className={`px-4 py-2 rounded-lg border transition-all text-sm font-medium ${selectedAspectRatios.includes(ratio) ? 'bg-pink-500 border-pink-500 text-white shadow-[0_0_10px_rgba(236,72,153,0.3)]' : 'bg-black/30 border-white/10 text-white/60 hover:bg-white/5 hover:border-white/30 hover:text-white'}`}>
                  {ratio}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Coluna 2: Texto para Geração de Voz (TTS) */}
        {selectedNiche && (
          <div className="space-y-4 bg-black/20 p-6 rounded-2xl border border-white/5 shadow-inner">
            <div>
              <div className="flex justify-between items-center mb-4">
                  <label className="text-white font-bold flex items-center gap-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-pink-500"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                    Gerar Faixa de Voz (TTS)
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={ttsModel}
                      onChange={(e) => setTtsModel(e.target.value)}
                      className="bg-black/40 border border-white/20 rounded-lg text-white text-xs px-2 py-1.5 outline-none focus:border-pink-500"
                    >
                      <option className="bg-gray-900 text-white" value="gemini-2.5-flash-preview-tts">Gemini 2.5 Flash</option>
                      <option className="bg-gray-900 text-white" value="gemini-2.5-pro-preview-tts">Gemini 2.5 Pro</option>
                    </select>
                    <span title="Voice ID mapeado no Nicho" className="text-xs bg-purple-500/10 text-purple-300 px-3 py-1.5 font-medium rounded-lg border border-purple-500/20 whitespace-nowrap">
                        Voz: <strong className="text-white">{selectedNiche.voice_id || 'Nenhuma configurada'}</strong>
                    </span>
                  </div>
              </div>

              {selectedNiche.voice_styles && selectedNiche.voice_styles.length > 0 && (
                <div className="mb-4 flex flex-col gap-2">
                  <div className="flex gap-2 items-center flex-wrap">
                      <span 
                          title={typeof selectedNiche.voice_styles[0] === 'string' ? selectedNiche.voice_styles[0] : (selectedNiche.voice_styles[0] as any).name}
                          className="text-xs bg-blue-500/10 text-blue-300 px-3 py-1.5 font-medium rounded-lg border border-blue-500/20 break-words flex-1 min-w-[150px]" 
                      >
                          Estilo / Tom: <strong className="text-white font-normal italic">
                              "{typeof selectedNiche.voice_styles[0] === 'string' ? selectedNiche.voice_styles[0] : (selectedNiche.voice_styles[0] as any).name}"
                          </strong>
                      </span>
                  </div>
                </div>
              )}

              <textarea 
                placeholder="Cole o roteiro ou digite o texto aqui para gerar a dublagem de IA com a voz selecionada no nicho..."
                className="w-full min-h-[140px] p-4 bg-black/40 border border-white/10 rounded-xl text-white text-sm outline-none focus:border-pink-500 focus:bg-black/60 transition-colors resize-y leading-relaxed scrollbar-thin scrollbar-thumb-white/10"
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
              />
              
              <button 
                onClick={handleGenerateTTS}
                className="mt-4 w-full py-3 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white hover:shadow-[0_0_20px_rgba(236,72,153,0.4)] rounded-xl font-bold transition-all disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed flex items-center justify-center gap-2 relative overflow-hidden group" 
                disabled={!ttsText.trim() || !selectedNiche.voice_id || ttsGenerating}
              >
                {!selectedNiche.voice_id ? (
                  <>Selecione uma Voz no Nicho</>
                ) : ttsGenerating ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Gerando Áudio...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    Gerar e Adicionar na Timeline
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      <NicheModal isOpen={isNicheModalOpen} onClose={() => setIsNicheModalOpen(false)} onSelect={onNicheChange} selectedNiche={selectedNiche} />
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.4); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.4); }
      `}} />
    </div>
  );
}
