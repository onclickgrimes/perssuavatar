import React, { useState, useEffect } from 'react';
import { TranscriptionSegment } from '../../types/video-studio';

interface ImagesStepProps {
  segments: TranscriptionSegment[];
  onUpdateImage: (id: number, imageUrl: string) => void;
  onContinue: () => void;
  onBack: () => void;
  aspectRatio?: string;
  onAspectRatioChange?: (value: string) => void;
}

export function ImagesStep({
  segments,
  onUpdateImage,
  onContinue,
  onBack,
  aspectRatio,
  onAspectRatioChange,
}: ImagesStepProps) {
  // Helper para converter caminho de arquivo em URL para preview
  const getMediaSrc = (mediaPath: string | undefined): string => {
    if (!mediaPath) return '';
    // Se já é uma URL (blob: ou http:), usar diretamente
    if (mediaPath.startsWith('blob:') || mediaPath.startsWith('http')) {
      return mediaPath;
    }
    // Caminho de arquivo Windows/Unix - converter para file:// URL
    // Substituir backslashes por forward slashes e encodar
    const normalizedPath = mediaPath.replace(/\\/g, '/');
    return `file:///${normalizedPath}`;
  };
  
  // Helper para detectar se é vídeo
  const isVideo = (url: string | undefined): boolean => {
    if (!url) return false;
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
    return videoExtensions.some(ext => url.toLowerCase().endsWith(ext));
  };
  
  const [generatingSegments, setGeneratingSegments] = useState<Set<number>>(new Set());
  const [uploadingSegments, setUploadingSegments] = useState<Set<number>>(new Set());
  const [vo3Progress, setVo3Progress] = useState<Record<number, string>>({});
  const [vo3Credits, setVo3Credits] = useState<number | null>(null);
  const [isCheckingCredits, setIsCheckingCredits] = useState<boolean>(false);
  // Serviço de geração selecionado por segmento (padrão: usa assetType do segmento)
  const [selectedService, setSelectedService] = useState<Record<number, string>>({});
  // Dropdown aberto para qual segmento
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  // Quantidade de imagens a gerar por segmento (só relevante para flow-image)
  const [imageCount, setImageCount] = useState<Record<number, number>>({});
  // Picker de imagem quando o Flow gera múltiplas imagens
  const [imagePicker, setImagePicker] = useState<{ segmentId: number; httpUrls: string[] } | null>(null);
  const [pickerSelectedIdx, setPickerSelectedIdx] = useState<number>(0);
  
  // Buscar créditos iniciais
  useEffect(() => {
    const fetchCredits = async () => {
      // Se tiver pelo menos um segmento vo3, buscar os créditos iniciais
      const hasVo3 = segments.some(s => s.assetType === 'video_vo3');
      if (hasVo3) {
        setIsCheckingCredits(true);
        try {
          const result = await window.electron?.videoProject?.getVo3Credits?.();
          if (result?.success && result.credits !== null) {
            setVo3Credits(result.credits);
          }
        } catch (error) {
          console.error('Erro ao buscar créditos Flow:', error);
        } finally {
          setIsCheckingCredits(false);
        }
      }
    };
    fetchCredits();
  }, [segments]);

  // Listener de progresso Veo3
  useEffect(() => {
    const cleanup = window.electron?.videoProject?.onVo3Progress?.((data) => {
      setVo3Progress(prev => {
        const next = { ...prev };
        generatingSegments.forEach(segId => { next[segId] = data.message; });
        return next;
      });
    });
    return () => { cleanup?.(); };
  }, [generatingSegments]);

  // Listener de progresso Veo2 Flow (via puppeteer)
  useEffect(() => {
    const cleanup = window.electron?.videoProject?.onVo2FlowProgress?.((data) => {
      setVo3Progress(prev => {
        const next = { ...prev };
        generatingSegments.forEach(segId => { next[segId] = data.message; });
        return next;
      });
    });
    return () => { cleanup?.(); };
  }, [generatingSegments]);

  // Listener de progresso Veo2 (API oficial)
  useEffect(() => {
    const cleanup = window.electron?.videoProject?.onVeo2Progress?.((data) => {
      setVo3Progress(prev => {
        const next = { ...prev };
        generatingSegments.forEach(segId => { next[segId] = data.message; });
        return next;
      });
    });
    return () => { cleanup?.(); };
  }, [generatingSegments]);

  // Handler para upload de mídia (imagem ou vídeo) - salva no disco
  const handleMediaUpload = async (segmentId: number, file: File) => {
    setUploadingSegments(prev => new Set([...prev, segmentId]));
    
    try {
      // Verificar se a API está disponível
      if (!window.electron?.videoProject?.saveImage) {
        console.error('saveImage API not available');
        // Fallback: usar blob URL (não funcionará na renderização)
        const mediaUrl = URL.createObjectURL(file);
        onUpdateImage(segmentId, mediaUrl);
      } else {
        // Converter File para ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Salvar no backend e obter caminho + URL HTTP
        const result = await window.electron.videoProject.saveImage(arrayBuffer, file.name, segmentId);
        
        if (result.success && result.httpUrl) {
          // Usar a URL HTTP para preview E renderização
          // O servidor HTTP estará rodando durante ambos
          onUpdateImage(segmentId, result.httpUrl);
          console.log(`✅ Media saved for segment ${segmentId}:`, result.httpUrl);
        } else {
          console.error('Failed to save media:', result.error);
          // Fallback: usar blob URL
          const mediaUrl = URL.createObjectURL(file);
          onUpdateImage(segmentId, mediaUrl);
        }
      }
    } catch (error) {
      console.error('Error uploading media:', error);
    } finally {
      setUploadingSegments(prev => {
        const next = new Set(prev);
        next.delete(segmentId);
        return next;
      });
    }
  };



  // Helper para extrair o prompt como string (suporta objeto JSON estruturado do video_veo2)
  const extractPromptString = (imagePrompt: unknown): string => {
    if (!imagePrompt) return '';
    if (typeof imagePrompt === 'string') return imagePrompt;
    if (typeof imagePrompt === 'object' && imagePrompt !== null) {
      // Tentar extrair main_text_prompt da estrutura do video_veo2
      const structured = imagePrompt as Record<string, unknown>;
      const vgp = structured.video_generation_prompt as Record<string, unknown> | undefined;
      if (vgp?.main_text_prompt && typeof vgp.main_text_prompt === 'string') {
        return vgp.main_text_prompt;
      }
      // Fallback: serializar o objeto
      return JSON.stringify(imagePrompt);
    }
    return String(imagePrompt);
  };

  // Serviços disponíveis para geração
  const GENERATION_SERVICES = [
    { id: 'veo3',       label: 'Veo 3 (Flow)',     icon: '🌊', description: 'Google Veo 3.1 via Google Flow' },
    { id: 'veo2-flow',  label: 'Veo 2 (Flow)',     icon: '🌊', description: 'Google Veo 2 Fast via Google Flow' },
    { id: 'flow-image', label: 'Imagem (Flow)',    icon: '🖼️', description: 'Gerar imagem com Google Flow' },
    { id: 'veo2',       label: 'Veo 2 (API)',      icon: '🌊', description: 'Google Veo 2 via API oficial' },
  ];

  // Obtém o serviço efetivo a usar para um segmento
  const getEffectiveService = (segment: TranscriptionSegment): string => {
    if (selectedService[segment.id]) return selectedService[segment.id];
    if (segment.assetType === 'video_vo3') return 'veo3';
    return 'veo2-flow'; // padrão
  };

  // Handler para gerar mídia com IA
  const handleRegenerate = async (segmentId: number, forceService?: string) => {
    const segment = segments.find(s => s.id === segmentId);
    if (!segment) return;

    const service = forceService || getEffectiveService(segment);
    setGeneratingSegments(prev => new Set([...prev, segmentId]));

    try {
      // ── VEO 2 FLOW (Google Flow via Puppeteer, modelo Veo 2 - Fast) ──
      if (service === 'veo2-flow') {
        const count = imageCount[segmentId] ?? 1;
        console.log(`🌊 [Veo2Flow] Gerando ${count} vídeo(s) para segmento ${segmentId}...`);
        setVo3Progress(prev => ({ ...prev, [segmentId]: 'Iniciando geração Veo 2 Flow...' }));

        const veo2FlowTimeoutMs = 10 * 60 * 1000;
        const veo2FlowPromise = window.electron?.videoProject?.generateVo2Flow?.({
          prompt: extractPromptString(segment.imagePrompt) || `Cinematic scene: ${segment.text}`,
          aspectRatio: aspectRatio,
          count,
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout: geração Veo 2 Flow excedeu 10 minutos.')), veo2FlowTimeoutMs)
        );
        const result = await Promise.race([veo2FlowPromise, timeoutPromise]) as any;

        if (result?.success && (result.httpUrl || result.videoPath)) {
          onUpdateImage(segmentId, result.httpUrl || result.videoPath);
        } else {
          console.error(`❌ [Veo2Flow] Falha:`, result?.error);
          alert(`Falha na geração Veo 2 Flow: ${result?.error}`);
        }

      // ── VEO 3 (Google Flow via Puppeteer) ──
      } else if (service === 'veo3') {
        const count = imageCount[segmentId] ?? 1;
        if (vo3Credits !== null && vo3Credits < 20) {
          alert(`Créditos insuficientes! Você tem ${vo3Credits} créditos e precisa de pelo menos 20 para gerar um vídeo no Flow.`);
          setGeneratingSegments(prev => { const next = new Set(prev); next.delete(segmentId); return next; });
          return;
        }
        console.log(`🌊 [Veo3] Gerando ${count} vídeo(s) para segmento ${segmentId}...`);
        setVo3Progress(prev => ({ ...prev, [segmentId]: 'Iniciando geração Veo 3...' }));

        // Timeout de 12 min para Veo3
        const veo3TimeoutMs = 12 * 60 * 1000;
        const veo3Promise = window.electron?.videoProject?.generateVo3({
          prompt: extractPromptString(segment.imagePrompt) || `Cinematic scene: ${segment.text}`,
          aspectRatio: aspectRatio,
          count,
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout: geração Veo 3 excedeu 12 minutos. Verifique se o navegador do Flow está aberto.')), veo3TimeoutMs)
        );
        const result = await Promise.race([veo3Promise, timeoutPromise]) as any;

        if (result?.success && (result.httpUrl || result.videoPath)) {
          onUpdateImage(segmentId, result.httpUrl || result.videoPath);
          if (result.credits !== undefined) setVo3Credits(result.credits);
        } else {
          console.error(`❌ [Veo3] Falha:`, result?.error);
          alert(`Falha na geração Veo 3: ${result?.error}`);
        }

      // ── FLOW IMAGE (Google Flow modo "Criar imagens") ──
      } else if (service === 'flow-image') {
        console.log(`🖼️ [FlowImg] Gerando imagem para segmento ${segmentId}...`);
        const count = imageCount[segmentId] ?? 1;
        setVo3Progress(prev => ({ ...prev, [segmentId]: `Gerando ${count} imagem(ns) com Flow...` }));

        const result = await window.electron?.videoProject?.generateFlowImage({
          prompt: extractPromptString(segment.imagePrompt) || `Cinematic scene: ${segment.text}`,
          count,
          aspectRatio,
        });

        if (result?.success && result.httpUrls?.length > 0) {
          if (result.httpUrls.length === 1) {
            onUpdateImage(segmentId, result.httpUrls[0]);
          } else {
            setImagePicker({ segmentId, httpUrls: result.httpUrls });
            setPickerSelectedIdx(0);
          }
        } else {
          console.error(`❌ [FlowImg] Falha:`, result?.error);
          alert(`Falha na geração de imagem via Flow: ${result?.error}`);
        }

      // ── VEO 2 (API oficial) ──
      } else {
        console.log(`🌊 [Veo2] Gerando vídeo para segmento ${segmentId}...`);

        // Se já existe uma imagem (não vídeo), usa como referência
        const isExistingVideo = isVideo(segment.imageUrl);
        const referenceImagePath = (segment.imageUrl && !isExistingVideo) ? segment.imageUrl : undefined;

        if (referenceImagePath) {
          setVo3Progress(prev => ({ ...prev, [segmentId]: 'Animando imagem com Veo 2...' }));
        } else {
          setVo3Progress(prev => ({ ...prev, [segmentId]: 'Gerando vídeo com Veo 2...' }));
        }

        const result = await window.electron?.videoProject?.generateVeo2({
          prompt: extractPromptString(segment.imagePrompt) || `Cinematic animation of the scene: ${segment.text}`,
          aspectRatio: aspectRatio,
          referenceImagePath,
        });
        if (result?.success && (result.httpUrl || result.videoPath)) {
          onUpdateImage(segmentId, result.httpUrl || result.videoPath);
        } else {
          console.error(`❌ [Veo2] Falha:`, result?.error);
          alert(`Falha na geração Veo 2: ${result?.error}`);
        }
      }
    } catch (error) {
      console.error('Erro ao gerar mídia:', error);
    } finally {
      setGeneratingSegments(prev => {
        const newSet = new Set(prev);
        newSet.delete(segmentId);
        return newSet;
      });
      setVo3Progress(prev => {
        const next = { ...prev };
        delete next[segmentId];
        return next;
      });
    }
  };

  // Handler para remover imagem
  const handleRemoveImage = (segmentId: number) => {
    onUpdateImage(segmentId, '');
  };

  const segmentsWithMedia = segments.filter(seg => !!seg.imageUrl);

  // Helper para label do botão principal
  const getGenerateLabel = (segment: TranscriptionSegment, isGenerating: boolean): string => {
    if (isGenerating) {
      const progress = vo3Progress[segment.id];
      if (progress) return progress;
      return '...';
    }
    // Se já tem vídeo → "Gerar novamente"
    if (isVideo(segment.imageUrl)) return '↻ Gerar novamente';
    // Se tem imagem (não vídeo) → label depende do serviço
    const svc = getEffectiveService(segment);
    if (segment.imageUrl && !isVideo(segment.imageUrl)) {
      if (svc === 'flow-image') return '🖼️ Gerar nova Imagem';
      return '🖼️ Animar Imagem';
    }
    // Sem mídia → label baseado no serviço
    if (svc === 'veo3') return '🌊 Gerar com Veo 3';
    if (svc === 'veo2-flow') return '🌊 Gerar com Veo 2 Flow';
    if (svc === 'flow-image') return '🖼️ Imagem com Flow';
    return '🌊 Gerar com Veo 2';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Imagens e Vídeos das Cenas</h2>
          <p className="text-white/60">Refaça ou faça upload das suas próprias imagens ou vídeos (opcional)</p>
        </div>
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
            Renderizar Vídeo →
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="text-white/60 text-sm">
            {segmentsWithMedia.length} de {segments.length} prontas
          </span>
        </div>
        {segmentsWithMedia.length === 0 && (
          <span className="text-blue-400 text-sm">
            ℹ️ Você pode renderizar sem mídias (apenas texto/legendas)
          </span>
        )}

        {/* Aspect Ratio Selector */}
        {onAspectRatioChange && (
          <div className="flex items-center gap-2 ml-4 border-l border-white/10 pl-4">
            <span className="text-white/60 text-sm">Formato:</span>
            <select
              value={aspectRatio || '9:16'}
              onChange={(e) => onAspectRatioChange(e.target.value)}
              className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-sm focus:border-pink-500 focus:outline-none"
            >
              <option value="9:16">Vertical (9:16)</option>
              <option value="16:9">Horizontal (16:9)</option>
              <option value="1:1">Quadrado (1:1)</option>
            </select>
          </div>
        )}


        {/* Mostra créditos do Veo 3 se existir algum segmento configurado */}
        {segments.some(s => s.assetType === 'video_vo3') && (
          <div className="ml-auto flex items-center gap-2 px-3 py-1 bg-[#1a73e8]/20 rounded-full border border-[#1a73e8]/30">
            <span className="text-xl">✨</span>
            <span className="text-[#8ab4f8] font-medium text-sm">
              {isCheckingCredits ? 'Verificando créditos...' : vo3Credits !== null ? `${vo3Credits} Créditos Flow` : 'Créditos indisponíveis'}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {segments.map((segment) => {
          const isGenerating = generatingSegments.has(segment.id);
          const isUploading = uploadingSegments.has(segment.id);
          const hasImage = !!segment.imageUrl;

          return (
            <div
              key={segment.id}
              className="bg-white/5 border border-white/10 rounded-xl overflow-hidden transition-all"
            >
              {/* Preview de imagem ou área de upload */}
              <div className="aspect-video relative group">

                {/* Mini-select de quantidade (Flow Image) */}
                {getEffectiveService(segment) === 'flow-image' && !isGenerating && (
                  <div className="absolute top-2 right-2 z-10">
                    <select
                      value={imageCount[segment.id] ?? 1}
                      onChange={e => setImageCount(prev => ({ ...prev, [segment.id]: Number(e.target.value) }))}
                      onClick={e => e.stopPropagation()}
                      title="Quantidade de imagens a gerar"
                      className="bg-black/60 border border-white/20 text-white text-xs rounded-md px-1.5 py-0.5 backdrop-blur-sm cursor-pointer focus:outline-none focus:border-pink-500 hover:border-white/40 transition-all"
                    >
                      <option value={1}>1 imagem</option>
                      <option value={2}>2 imagens</option>
                      <option value={3}>3 imagens</option>
                      <option value={4}>4 imagens</option>
                    </select>
                  </div>
                )}

                {/* Mini-select de quantidade (Vídeo Flow: veo3 / veo2-flow) */}
                {(getEffectiveService(segment) === 'veo3' || getEffectiveService(segment) === 'veo2-flow') && !isGenerating && (
                  <div className="absolute top-2 right-2 z-10">
                    <select
                      value={imageCount[segment.id] ?? 1}
                      onChange={e => setImageCount(prev => ({ ...prev, [segment.id]: Number(e.target.value) }))}
                      onClick={e => e.stopPropagation()}
                      title="Quantidade de vídeos a gerar"
                      className="bg-black/60 border border-cyan-500/30 text-cyan-200 text-xs rounded-md px-1.5 py-0.5 backdrop-blur-sm cursor-pointer focus:outline-none focus:border-cyan-400 hover:border-cyan-400/50 transition-all"
                    >
                      <option value={1}>1 vídeo</option>
                      <option value={2}>2 vídeos</option>
                      <option value={3}>3 vídeos</option>
                      <option value={4}>4 vídeos</option>
                    </select>
                  </div>
                )}
                {(isGenerating || isUploading) ? (
                  <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-purple-500/10 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-10 h-10 mx-auto mb-2 border-2 border-pink-500/30 border-t-pink-500 rounded-full animate-spin" />
                      <p className="text-white/60 text-sm">
                        {isUploading ? 'Enviando...' : (vo3Progress[segment.id] || 'Gerando...')}
                      </p>
                    </div>
                  </div>
                ) : hasImage ? (
                  <>
                    {isVideo(segment.imageUrl) ? (
                      <video
                        src={getMediaSrc(segment.imageUrl)}
                        className="w-full h-full object-cover"
                        autoPlay
                        loop
                        muted
                        playsInline
                      />
                    ) : (
                      <img
                        src={getMediaSrc(segment.imageUrl)}
                        alt={`Cena ${segment.id}`}
                        className="w-full h-full object-cover"
                      />
                    )}
                    {/* Overlay de ações */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleRemoveImage(segment.id)}
                        className="px-3 py-2 bg-red-500/80 hover:bg-red-500 text-white rounded-lg text-sm transition-all"
                      >
                        🗑️ Remover
                      </button>
                      <label className="px-3 py-2 bg-blue-500/80 hover:bg-blue-500 text-white rounded-lg text-sm cursor-pointer transition-all">
                        📁 Trocar
                        <input
                          type="file"
                          accept="image/*,video/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleMediaUpload(segment.id, file);
                          }}
                        />
                      </label>
                    </div>

                  </>
                ) : (
                  <label 
                    className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-purple-500/10 flex items-center justify-center cursor-pointer hover:from-pink-500/20 hover:to-purple-500/20 transition-all"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.add('from-pink-500/30', 'to-purple-500/30');
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.remove('from-pink-500/30', 'to-purple-500/30');
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.remove('from-pink-500/30', 'to-purple-500/30');
                      const file = e.dataTransfer.files?.[0];
                      if (file && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
                        handleMediaUpload(segment.id, file);
                      }
                    }}
                  >
                    <div className="text-center pointer-events-none">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-2 text-white/40">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                      </svg>
                      <p className="text-white/60 text-sm mb-2">Arraste uma imagem ou vídeo aqui</p>
                      <p className="text-white/40 text-xs">ou clique para selecionar</p>
                    </div>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleMediaUpload(segment.id, file);
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Info do segmento */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-pink-500/20 text-pink-300 rounded text-xs">
                    Cena {segment.id}
                  </span>
                  <span className="px-2 py-0.5 bg-white/10 text-white/50 rounded text-xs">
                    {segment.emotion}
                  </span>
                  {segment.assetType && (
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      segment.assetType === 'video_vo3' || segment.assetType === 'video_veo2'
                        ? 'bg-cyan-500/20 text-cyan-300' 
                        : 'bg-purple-500/20 text-purple-300'
                    }`}>
                      {segment.assetType}
                    </span>
                  )}
                </div>
                <p className="text-white/80 text-sm line-clamp-2 mb-1">{segment.text}</p>
                {segment.imagePrompt && (
                  <p className="text-white/40 text-xs line-clamp-1 mb-3 italic">
                    Prompt: {extractPromptString(segment.imagePrompt)}
                  </p>
                )}
                
                {/* Botão de geração com dropdown de serviço */}
                <div className="flex gap-0 relative">
                  {/* Botão principal */}
                  <button
                    onClick={() => handleRegenerate(segment.id)}
                    disabled={isGenerating}
                    className={`flex-1 py-2 px-3 rounded-l-lg text-sm transition-all ${
                      isGenerating
                        ? 'bg-white/5 text-white/30 cursor-not-allowed'
                        : getEffectiveService(segment) === 'veo3'
                          ? 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300'
                          : 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-300'
                    }`}
                  >
                    {getGenerateLabel(segment, isGenerating)}
                  </button>

                  {/* Separador | */}
                  <div className={`self-stretch w-px opacity-40 ${
                    isGenerating ? 'bg-white/20' :
                    getEffectiveService(segment) === 'veo3' ? 'bg-cyan-400' : 'bg-orange-400'
                  }`} />

                  {/* Botão: ✕ para cancelar se travado, ▼ para dropdown quando ocioso */}
                  {isGenerating ? (
                    <button
                      title="Cancelar geração"
                      onClick={() => {
                        setGeneratingSegments(prev => { const s = new Set(prev); s.delete(segment.id); return s; });
                        setVo3Progress(prev => { const n = { ...prev }; delete n[segment.id]; return n; });
                      }}
                      className="px-2.5 py-2 rounded-r-lg text-sm bg-red-500/20 hover:bg-red-500/40 text-red-400 transition-all"
                    >
                      ✕
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setOpenDropdown(openDropdown === segment.id ? null : segment.id)}
                        className={`px-2 py-2 rounded-r-lg text-sm transition-all ${
                          getEffectiveService(segment) === 'veo3'
                            ? 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300'
                            : 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-300'
                        }`}
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                          <path d="M6 8L1 3h10z"/>
                        </svg>
                      </button>

                      {/* Dropdown de serviços */}
                      {openDropdown === segment.id && (
                        <div
                          className="absolute bottom-full right-0 mb-1 z-50 bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl overflow-hidden min-w-[180px]"
                          onMouseLeave={() => setOpenDropdown(null)}
                        >
                          <div className="px-3 py-2 text-white/40 text-xs border-b border-white/10 uppercase tracking-wider">
                            Serviço de geração
                          </div>
                          {GENERATION_SERVICES.map(svc => {
                            const isActive = getEffectiveService(segment) === svc.id;
                            return (
                              <button
                                key={svc.id}
                                onClick={() => {
                                  setSelectedService(prev => ({ ...prev, [segment.id]: svc.id }));
                                  // Resetar count para 1 ao trocar para serviço de vídeo
                                  if (svc.id === 'veo3' || svc.id === 'veo2-flow') {
                                    setImageCount(prev => ({ ...prev, [segment.id]: 1 }));
                                  }
                                  setOpenDropdown(null);
                                }}
                                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-all hover:bg-white/10 ${
                                  isActive ? 'text-white bg-white/5' : 'text-white/70'
                                }`}
                              >
                                <span>{svc.icon}</span>
                                <div>
                                  <div className="font-medium">{svc.label}</div>
                                  <div className="text-white/40 text-xs">{svc.description}</div>
                                </div>
                                {isActive && (
                                  <span className="ml-auto text-green-400 text-xs">✓</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal picker de imagens geradas pelo Flow */}
      {imagePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-[560px] max-h-[90vh] overflow-y-auto shadow-2xl">
            <h3 className="text-white font-bold text-lg mb-1">🖼️ Escolha uma imagem</h3>
            <p className="text-white/50 text-sm mb-4">Clique na imagem desejada para selecioná-la para a cena.</p>

            <div className="grid grid-cols-2 gap-3 mb-5">
              {imagePicker.httpUrls.map((url, idx) => (
                <button
                  key={idx}
                  onClick={() => setPickerSelectedIdx(idx)}
                  className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                    pickerSelectedIdx === idx
                      ? 'border-pink-500 ring-2 ring-pink-500/40'
                      : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  <img
                    src={getMediaSrc(url)}
                    alt={`Opção ${idx + 1}`}
                    className="w-full aspect-video object-cover"
                  />
                  {pickerSelectedIdx === idx && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-pink-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 py-1 text-center text-white/70 text-xs">
                    Opção {idx + 1}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  onUpdateImage(imagePicker.segmentId, imagePicker.httpUrls[pickerSelectedIdx]);
                  setImagePicker(null);
                }}
                className="flex-1 py-2.5 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white rounded-xl font-medium transition-all"
              >
                Usar esta imagem
              </button>
              <button
                onClick={() => setImagePicker(null)}
                className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
