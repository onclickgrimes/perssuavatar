import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { TranscriptionSegment } from '../../types/video-studio';

interface ImagesStepProps {
  segments: TranscriptionSegment[];
  onUpdateImage: (id: number, imageUrl: string, durationVideoSec?: number) => void;
  onContinue: () => void;
  onBack: () => void;
  aspectRatio?: string;
  onAspectRatioChange?: (value: string) => void;
}

interface SmartVideoPreviewProps {
  src: string;
}

const SmartVideoPreview = React.memo(function SmartVideoPreview({ src }: SmartVideoPreviewProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!wrapperRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const intersecting = entry.isIntersecting;
        if (intersecting) {
          setIsNearViewport(true);
        }
        setIsVisible(intersecting && entry.intersectionRatio > 0.1);
      },
      {
        root: null,
        // Renderiza o elemento um pouco antes de entrar na área visível.
        rootMargin: '320px 0px',
        threshold: [0, 0.1, 0.3],
      }
    );

    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isVisible) {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
      return;
    }

    video.pause();
  }, [isVisible, src]);

  return (
    <div ref={wrapperRef} className="w-full h-full bg-black/30">
      {isNearViewport ? (
        <video
          ref={videoRef}
          src={src}
          className="w-full h-full object-cover"
          loop
          muted
          playsInline
          preload="metadata"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white/40 text-xs">
          Preview pausado fora da tela
        </div>
      )}
    </div>
  );
});

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
  // Fila de seleções pendentes quando o Flow gera múltiplas imagens
  const [pickerQueue, setPickerQueue] = useState<{ segmentId: number; httpUrls: string[] }[]>([]);
  const [pickerSelectedIdx, setPickerSelectedIdx] = useState<number>(0);

  const [finalImages, setFinalImages] = useState<Record<number, string>>({});
  const [carouselIndices, setCarouselIndices] = useState<Record<number, number>>({});

  // ── Ingredients (Veo 3 - 3.1 Fast only) ──
  // 'frames' = usa Inicial/Final (padrão), 'ingredients' = usa até 3 imagens como ingredientes
  const [ingredientMode, setIngredientMode] = useState<Record<number, 'frames' | 'ingredients'>>({});
  const [ingredientImages, setIngredientImages] = useState<Record<number, string[]>>({});

  // ── Character Images ──
  const [showCharactersModal, setShowCharactersModal] = useState(false);
  const [characterImages, setCharacterImages] = useState<Record<number, string>>({});

  const handleCharacterImageUpload = async (charId: number, file: File) => {
    try {
      if (!window.electron?.videoProject?.saveImage) {
        const mediaUrl = URL.createObjectURL(file);
        setCharacterImages(prev => ({ ...prev, [charId]: mediaUrl }));
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const result = await window.electron.videoProject.saveImage(arrayBuffer, `character_${charId}_${file.name}`, 0);
        if (result.success && result.httpUrl) {
          setCharacterImages(prev => ({ ...prev, [charId]: result.httpUrl }));
        }
      }
    } catch (error) {
      console.error('Error uploading character image:', error);
    }
  };

  const handleRemoveCharacterImage = (charId: number) => {
    setCharacterImages(prev => {
      const next = { ...prev };
      delete next[charId];
      return next;
    });
  };

  const getCharactersInScene = (imagePrompt: unknown): string | null => {
    if (!imagePrompt) return null;
    let charsRaw: any = null;
    
    if (typeof imagePrompt === 'object' && imagePrompt !== null) {
      if ('IdOfTheCharactersInTheScene' in imagePrompt) {
        charsRaw = (imagePrompt as any).IdOfTheCharactersInTheScene;
      } else if (
        'video_generation_prompt' in imagePrompt && 
        typeof (imagePrompt as any).video_generation_prompt === 'object' && 
        'IdOfTheCharactersInTheScene' in (imagePrompt as any).video_generation_prompt
      ) {
        charsRaw = (imagePrompt as any).video_generation_prompt.IdOfTheCharactersInTheScene;
      }
    } else if (typeof imagePrompt === 'string') {
      try {
        const parsed = JSON.parse(imagePrompt);
        if (parsed.IdOfTheCharactersInTheScene) {
          charsRaw = parsed.IdOfTheCharactersInTheScene;
        } else if (parsed.video_generation_prompt?.IdOfTheCharactersInTheScene) {
          charsRaw = parsed.video_generation_prompt.IdOfTheCharactersInTheScene;
        }
      } catch (e) {
        // Fallback: extract using regex from raw string if not valid JSON
        charsRaw = imagePrompt;
      }
    }

    if (charsRaw) {
      if (typeof charsRaw === 'string') {
        // Handle formats like "[1] The Victim (Buffalo)" or "[1, 3] The Suspects"
        const bracketMatches = [...charsRaw.matchAll(/\[([\d\s,]+)\]/g)];
        if (bracketMatches.length > 0) {
          // Extract all numbers within brackets and join them
          const ids = bracketMatches
            .map(m => m[1])
            .join(',')
            .split(',')
            .map(s => parseInt(s.trim(), 10))
            .filter(n => !isNaN(n));
            
          if (ids.length > 0) {
            return ids.join(', ');
          }
        }

        // Handle simple numbers like "1, 2" or "1"
        const rawDigits = charsRaw.split(',').map(s => parseInt(s.replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
        if (rawDigits.length > 0) {
           return rawDigits.join(', ');
        }
        
        // Original fallback
        return charsRaw.replace(/[\[\]"]/g, '');
      }
      return String(charsRaw).replace(/[\[\]"]/g, '');
    }
    
    return null;
  };

  // ── Batch Processing (Processamento em lote) ──
  // Por padrão, todas as cenas estão selecionadas
  const [selectedScenes, setSelectedScenes] = useState<Set<number>>(() => new Set(segments.map(s => s.id)));
  const [showBatchDropdown, setShowBatchDropdown] = useState(false);
  const [showBatchSettings, setShowBatchSettings] = useState(false);
  const lastClickedSceneRef = useRef<number | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; currentSceneId: number | null }>({
    current: 0, total: 0, currentSceneId: null,
  });
  const [batchResults, setBatchResults] = useState<Record<number, 'success' | 'error' | 'skipped'>>({});
  const batchCancelledRef = useRef(false);
  const activeServicesRef = useRef<Record<number, string>>({});
  const generatingSegmentsRef = useRef<Set<number>>(new Set());
  const pendingProgressMessageRef = useRef<string | null>(null);
  const progressFlushTimerRef = useRef<any>(null);
  const hasVo3Segments = useMemo(
    () => segments.some(s => s.assetType === 'video_vo3' || s.assetType === 'video_veo2'),
    [segments]
  );
  const segmentsWithMediaCount = useMemo(
    () => segments.reduce((count, seg) => count + (seg.imageUrl ? 1 : 0), 0),
    [segments]
  );
  const batchStats = useMemo(() => {
    const values = Object.values(batchResults);
    const success = values.filter(v => v === 'success').length;
    const error = values.filter(v => v === 'error').length;
    return { success, error };
  }, [batchResults]);

  const queueProgressUpdate = useCallback((message: string) => {
    pendingProgressMessageRef.current = message || 'Gerando...';
    if (progressFlushTimerRef.current !== null) return;

    progressFlushTimerRef.current = window.setTimeout(() => {
      progressFlushTimerRef.current = null;
      const pendingMessage = pendingProgressMessageRef.current;
      const activeIds = Array.from(generatingSegmentsRef.current);

      if (!pendingMessage || activeIds.length === 0) return;

      setVo3Progress(prev => {
        let changed = false;
        const next = { ...prev };
        activeIds.forEach(segId => {
          if (next[segId] !== pendingMessage) {
            next[segId] = pendingMessage;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 150);
  }, []);

  useEffect(() => {
    generatingSegmentsRef.current = generatingSegments;
  }, [generatingSegments]);

  useEffect(() => {
    return () => {
      if (progressFlushTimerRef.current !== null) {
        clearTimeout(progressFlushTimerRef.current);
      }
    };
  }, []);

  // Quando os segmentos mudam, atualizar a seleção para incluir novos segmentos
  useEffect(() => {
    setSelectedScenes(prev => {
      let changed = false;
      const next = new Set(prev);
      segments.forEach(s => {
        if (!prev.has(s.id)) {
          next.add(s.id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [segments]);
  
  // Buscar créditos iniciais
  useEffect(() => {
    const fetchCredits = async () => {
      if (hasVo3Segments) {
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
  }, [hasVo3Segments]);

  // Listener de progresso Veo3
  useEffect(() => {
    const cleanup = window.electron?.videoProject?.onVo3Progress?.((data) => {
      queueProgressUpdate(data?.message || 'Gerando com Veo 3...');
    });
    return () => { cleanup?.(); };
  }, [queueProgressUpdate]);

  // Listener de progresso Veo3 (API oficial)
  useEffect(() => {
    const cleanup = window.electron?.videoProject?.onVeo3ApiProgress?.((data) => {
      queueProgressUpdate(data?.message || 'Gerando com API oficial...');
    });
    return () => { cleanup?.(); };
  }, [queueProgressUpdate]);

  // Listener de progresso Veo2 Flow (via puppeteer)
  useEffect(() => {
    const cleanup = window.electron?.videoProject?.onVo2FlowProgress?.((data) => {
      queueProgressUpdate(data?.message || 'Gerando com Veo 2 Flow...');
    });
    return () => { cleanup?.(); };
  }, [queueProgressUpdate]);

  // Listener de progresso Veo2 (API oficial)
  useEffect(() => {
    const cleanup = window.electron?.videoProject?.onVeo2Progress?.((data) => {
      queueProgressUpdate(data?.message || 'Gerando com Veo 2...');
    });
    return () => { cleanup?.(); };
  }, [queueProgressUpdate]);

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
          const duration = result.durationMs ? Number((result.durationMs / 1000).toFixed(2)) : undefined;
          onUpdateImage(segmentId, result.httpUrl, duration);
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



  const handleFinalMediaUpload = async (segmentId: number, file: File) => {
    setUploadingSegments(prev => new Set([...prev, segmentId]));
    try {
      if (!window.electron?.videoProject?.saveImage) {
        const mediaUrl = URL.createObjectURL(file);
        setFinalImages(prev => ({ ...prev, [segmentId]: mediaUrl }));
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const result = await window.electron.videoProject.saveImage(arrayBuffer, `final_${file.name}`, segmentId);
        if (result.success && result.httpUrl) {
          setFinalImages(prev => ({ ...prev, [segmentId]: result.httpUrl }));
        }
      }
    } catch (error) {
      console.error('Error uploading final media:', error);
    } finally {
      setUploadingSegments(prev => {
        const next = new Set(prev);
        next.delete(segmentId);
        return next;
      });
    }
  };

  const handleRemoveFinalImage = (segmentId: number) => {
    setFinalImages(prev => {
      const next = { ...prev };
      delete next[segmentId];
      return next;
    });
  };

  // Upload de imagem de ingrediente (max 3 por segmento)
  const handleIngredientUpload = async (segmentId: number, file: File) => {
    const current = ingredientImages[segmentId] || [];
    if (current.length >= 3) return; // limite de 3
    setUploadingSegments(prev => new Set([...prev, segmentId]));
    try {
      if (!window.electron?.videoProject?.saveImage) {
        const mediaUrl = URL.createObjectURL(file);
        setIngredientImages(prev => ({ ...prev, [segmentId]: [...(prev[segmentId] || []), mediaUrl] }));
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const result = await window.electron.videoProject.saveImage(arrayBuffer, `ingredient_${Date.now()}_${file.name}`, segmentId);
        if (result.success && result.httpUrl) {
          setIngredientImages(prev => ({ ...prev, [segmentId]: [...(prev[segmentId] || []), result.httpUrl] }));
        }
      }
    } catch (error) {
      console.error('Error uploading ingredient image:', error);
    } finally {
      setUploadingSegments(prev => { const n = new Set(prev); n.delete(segmentId); return n; });
    }
  };

  // Remover uma imagem de ingrediente específica
  const handleRemoveIngredient = (segmentId: number, index: number) => {
    setIngredientImages(prev => {
      const current = [...(prev[segmentId] || [])];
      current.splice(index, 1);
      return { ...prev, [segmentId]: current };
    });
  };

  // Helper para extrair o prompt como string (suporta objeto JSON estruturado do video_veo2)
  const extractPromptString = (imagePrompt: unknown): string => {
    if (!imagePrompt) return '';
    if (typeof imagePrompt === 'string') return imagePrompt;
    if (typeof imagePrompt === 'object' && imagePrompt !== null) {
      // Retornar o JSON inteiro conforme solicitado
      return JSON.stringify(imagePrompt);
    }
    return String(imagePrompt);
  };

  // Serviços disponíveis para geração
  const GENERATION_SERVICES = [
    { id: 'veo3',           label: 'Veo 3 (Flow)',     icon: '🌊', description: 'Google Veo 3.1 via Google Flow' },
    { id: 'veo3-api',       label: 'Veo 3.1 (API)',    icon: '🚀', description: 'Google Veo 3.1 via API Oficial' },
    { id: 'veo3-fast-api',  label: 'Veo 3.1 Fast',     icon: '⚡', description: 'Google Veo 3.1 Fast via API Oficial' },
    { id: 'grok',           label: 'Grok',             icon: '✖️', description: 'Geração de vídeo com Grok' },
    // { id: 'veo2-flow',      label: 'Veo 2 (Flow)',     icon: '🌊', description: 'Google Veo 2 Fast via Google Flow' },
    { id: 'flow-image',     label: 'Imagem (Flow)',    icon: '🖼️', description: 'Gerar imagem com Google Flow' },
    { id: 'veo2',           label: 'Veo 2 (API)',      icon: '🌊', description: 'Google Veo 2 via API oficial' },
  ];

  // Obtém o serviço efetivo a usar para um segmento
  const getEffectiveService = (segment: TranscriptionSegment): string => {
    // Se o usuário escolheu explicitamente um serviço, respeitar
    if (selectedService[segment.id]) return selectedService[segment.id];
    // Se modo Ingredients está ativo (e não trocou serviço), forçar veo3
    if (ingredientMode[segment.id] === 'ingredients') return 'veo3';
    if (segment.assetType === 'video_vo3') return 'veo3';
    // return 'veo2-flow'; // Veo 2 não está mais disponível no submenu do Flow
    return 'veo3'; // padrão
  };

  // Handler para gerar mídia com IA
  // Retorna true se a geração foi bem-sucedida, false caso contrário
  const handleRegenerate = async (segmentId: number, forceService?: string, silent = false): Promise<boolean> => {
    const segment = segments.find(s => s.id === segmentId);
    if (!segment) return false;

    const service = forceService || getEffectiveService(segment);
    activeServicesRef.current[segmentId] = service;
    setGeneratingSegments(prev => new Set([...prev, segmentId]));
    let success = false;

    try {
      // Usa a imagem atual como referência ou, se o segmento já virou vídeo, a imagem-base preservada
      const isExistingVideo = isVideo(segment.imageUrl);
      const preservedSourceImage = (segment.sourceImageUrl && !isVideo(segment.sourceImageUrl))
        ? segment.sourceImageUrl
        : undefined;
      const referenceImagePath = (segment.imageUrl && !isExistingVideo)
        ? segment.imageUrl
        : preservedSourceImage;
      const finalImagePath = finalImages[segmentId];

      // ── VEO 2 FLOW (Google Flow via Puppeteer, modelo Veo 2 - Fast) ──
      if (service === 'veo2-flow') {
        const count = imageCount[segmentId] ?? 1;
        console.log(`🌊 [Veo2Flow] Gerando ${count} vídeo(s) para segmento ${segmentId}...`);
        
        if (referenceImagePath) {
          setVo3Progress(prev => ({ ...prev, [segmentId]: 'Animando imagem com Veo 2 Flow...' }));
        } else {
          setVo3Progress(prev => ({ ...prev, [segmentId]: 'Iniciando geração Veo 2 Flow...' }));
        }

        const veo2FlowTimeoutMs = 10 * 60 * 1000;
        const veo2FlowPromise = window.electron?.videoProject?.generateVo2Flow?.({
          prompt: extractPromptString(segment.imagePrompt) || `Cinematic scene: ${segment.text}`,
          aspectRatio: aspectRatio,
          count,
          referenceImagePath,
          finalImagePath,
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout: geração Veo 2 Flow excedeu 10 minutos.')), veo2FlowTimeoutMs)
        );
        const result = await Promise.race([veo2FlowPromise, timeoutPromise]) as any;

        if (result?.success && (result.httpUrl || result.videoPath)) {
          const duration = result.durationMs ? Number((result.durationMs / 1000).toFixed(2)) : undefined;
          onUpdateImage(segmentId, result.httpUrl || result.videoPath, duration);
          success = true;
        } else {
          console.error(`❌ [Veo2Flow] Falha:`, result?.error);
          if (!silent) alert(`Falha na geração Veo 2 Flow: ${result?.error}`);
        }

      // ── VEO 3 (Google Flow via Puppeteer) ──
      } else if (service === 'veo3') {
        const count = imageCount[segmentId] ?? 1;
        if (vo3Credits !== null && vo3Credits < 20) {
          if (!silent) alert(`Créditos insuficientes! Você tem ${vo3Credits} créditos e precisa de pelo menos 20 para gerar um vídeo no Flow.`);
          setGeneratingSegments(prev => { const next = new Set(prev); next.delete(segmentId); return next; });
          return false;
        }

        // Verificar modo Ingredients e Personagens
        const isIngredientsExplicit = ingredientMode[segmentId] === 'ingredients';
        
        const charsMatch = getCharactersInScene(segment.imagePrompt);
        const charIds = charsMatch ? charsMatch.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [];
        const charsReferencePaths = charIds.map(id => characterImages[id]).filter(Boolean);
        
        const isIngredients = isIngredientsExplicit || charsReferencePaths.length > 0;
        const baseIngredientPaths = isIngredientsExplicit ? (ingredientImages[segmentId] || []) : [];
        
        // Combina ingredientes explícitos com imagens de personagens (máximo 3)
        const ingredientPaths = Array.from(new Set([...baseIngredientPaths, ...charsReferencePaths])).slice(0, 3);

        if (isIngredients && ingredientPaths.length === 0) {
          if (!silent) alert('Nenhuma imagem de ingrediente ou personagem disponível para gerar.');
          setGeneratingSegments(prev => { const next = new Set(prev); next.delete(segmentId); return next; });
          return false;
        }

        console.log(`🌊 [Veo3] Gerando ${count} vídeo(s) para segmento ${segmentId}${isIngredients ? ` com ${ingredientPaths.length} ingredient(s)` : ''}...`);
        
        if (isIngredients) {
           setVo3Progress(prev => ({ ...prev, [segmentId]: `Gerando com ${ingredientPaths.length} ingrediente(s)...` }));
        } else if (referenceImagePath) {
           setVo3Progress(prev => ({ ...prev, [segmentId]: 'Animando imagem com Veo 3...' }));
        } else {
           setVo3Progress(prev => ({ ...prev, [segmentId]: 'Iniciando geração Veo 3...' }));
        }

        // Timeout de 12 min para Veo3
        const veo3TimeoutMs = 12 * 60 * 1000;
        const veo3Promise = window.electron?.videoProject?.generateVo3({
          prompt: extractPromptString(segment.imagePrompt) || `Cinematic scene: ${segment.text}`,
          aspectRatio: aspectRatio,
          count,
          referenceImagePath: isIngredients ? undefined : referenceImagePath,
          finalImagePath: isIngredients ? undefined : finalImagePath,
          ingredientImagePaths: isIngredients ? ingredientPaths : undefined,
          model: isIngredients ? 'Veo 3.1 - Fast' : undefined,
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout: geração Veo 3 excedeu 12 minutos. Verifique se o navegador do Flow está aberto.')), veo3TimeoutMs)
        );
        const result = await Promise.race([veo3Promise, timeoutPromise]) as any;

        if (result?.success && (result.httpUrl || result.videoPath)) {
          const duration = result.durationMs ? Number((result.durationMs / 1000).toFixed(2)) : undefined;
          onUpdateImage(segmentId, result.httpUrl || result.videoPath, duration);
          if (result.credits !== undefined) setVo3Credits(result.credits);
          success = true;
        } else {
          console.error(`❌ [Veo3] Falha:`, result?.error);
          if (!silent) alert(`Falha na geração Veo 3: ${result?.error}`);
        }

      // ── GROK (Vídeo via Grok) ──
      } else if (service === 'grok') {
        const isFlowRunning = () => Object.values(activeServicesRef.current).some(s => ['veo3', 'veo2-flow', 'flow-image'].includes(s));
        if (isFlowRunning()) {
          console.log(`✖️ [Grok] Aguardando processos do Flow concluirem para segmento ${segmentId}...`);
          setVo3Progress(prev => ({ ...prev, [segmentId]: 'Aguardando Flow...' }));
          while (isFlowRunning()) {
            if (batchCancelledRef.current) {
              return false; // Sai se batch foi cancelado
            }
            await new Promise(r => setTimeout(r, 2000));
          }
        }

        console.log(`✖️ [Grok] Gerando vídeo para segmento ${segmentId}...`);
        
        // Coleta possíveis inputs de imagem permitidos pelo provedor Grok (que aceita arrays de imagens)
        const charsMatch = getCharactersInScene(segment.imagePrompt);
        const charIds = charsMatch ? charsMatch.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [];
        const charsReferencePaths = charIds.map(id => characterImages[id]).filter(Boolean);
        
        const baseIngredientPaths = ingredientImages[segmentId] || [];
        const grokImagePaths = Array.from(new Set([...baseIngredientPaths, ...charsReferencePaths]));

        if (referenceImagePath && !grokImagePaths.includes(referenceImagePath)) {
          grokImagePaths.push(referenceImagePath);
        }

        if (grokImagePaths.length > 0) {
          setVo3Progress(prev => ({ ...prev, [segmentId]: `Gerando com Grok (${grokImagePaths.length} ref(s))...` }));
        } else {
          setVo3Progress(prev => ({ ...prev, [segmentId]: 'Iniciando geração Grok...' }));
        }

        const grokTimeoutMs = 12 * 60 * 1000;
        const grokPromise = window.electron?.videoProject?.generateGrokVideo?.({
          prompt: extractPromptString(segment.imagePrompt) || `Cinematic scene: ${segment.text}`,
          referenceImagePaths: grokImagePaths.length > 0 ? grokImagePaths : undefined,
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout: geração Grok excedeu 12 minutos.')), grokTimeoutMs)
        );
        const result = await Promise.race([grokPromise, timeoutPromise]) as any;

        if (result?.success && (result.httpUrl || result.videoPath)) {
          const duration = result.durationMs ? Number((result.durationMs / 1000).toFixed(2)) : undefined;
          onUpdateImage(segmentId, result.httpUrl || result.videoPath, duration);
          success = true;
        } else {
          console.error(`❌ [Grok] Falha:`, result?.error);
          if (!silent) alert(`Falha na geração Grok: ${result?.error}`);
        }

      // ── FLOW IMAGE (Google Flow modo "Criar imagens") ──
      } else if (service === 'flow-image') {
        console.log(`🖼️ [FlowImg] Gerando imagem para segmento ${segmentId}...`);
        const count = imageCount[segmentId] ?? 1;

        // Verificar modo Ingredients e Personagens
        const isIngredientsExplicit = ingredientMode[segmentId] === 'ingredients';
        const charsMatch = getCharactersInScene(segment.imagePrompt);
        const charIds = charsMatch ? charsMatch.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [];
        const charsReferencePaths = charIds.map(id => characterImages[id]).filter(Boolean);
        
        const isIngredients = isIngredientsExplicit || charsReferencePaths.length > 0;
        const baseIngredientPaths = isIngredientsExplicit ? (ingredientImages[segmentId] || []) : [];
        
        const ingredientPaths = Array.from(new Set([...baseIngredientPaths, ...charsReferencePaths])).slice(0, 3);

        if (isIngredients && ingredientPaths.length === 0) {
          if (!silent) alert('Nenhuma imagem de ingrediente ou personagem disponível para gerar.');
          setGeneratingSegments(prev => { const next = new Set(prev); next.delete(segmentId); return next; });
          return false;
        }

        setVo3Progress(prev => ({ ...prev, [segmentId]: `Gerando ${count} imagem(ns) com Flow${ingredientPaths.length > 0 ? ` e ${ingredientPaths.length} ref(s)` : ''}...` }));

        const result = await window.electron?.videoProject?.generateFlowImage({
          prompt: extractPromptString(segment.imagePrompt) || `Cinematic scene: ${segment.text}`,
          count,
          aspectRatio,
          ingredientImagePaths: ingredientPaths.length > 0 ? ingredientPaths : undefined,
        });

        if (result?.success && result.httpUrls?.length > 0) {
          const duration = result.durationMs ? Number((result.durationMs / 1000).toFixed(2)) : undefined;
          // Usar a primeira imagem imediatamente
          onUpdateImage(segmentId, result.httpUrls[0], duration);
          // Se há múltiplas opções, empilhar na fila para o usuário escolher depois
          if (count > 1 && result.httpUrls.length > 1) {
            setPickerQueue(prev => [...prev, { segmentId, httpUrls: result.httpUrls }]);
          }
          success = true;
        } else {
          console.error(`❌ [FlowImg] Falha:`, result?.error);
          if (!silent) alert(`Falha na geração de imagem via Flow: ${result?.error}`);
        }

      // ── VEO 3.1 E VEO 3.1 FAST (API oficial) ──
      } else if (service === 'veo3-api' || service === 'veo3-fast-api') {
        console.log(`🚀 [Veo3 API] Gerando vídeo para segmento ${segmentId}...`);
        
        const isFast = service === 'veo3-fast-api';
        const modelName = isFast ? 'veo-3.1-fast-generate-preview' : 'veo-3.1-generate-preview';

        // Verificar modo Ingredients e Personagens
        const isIngredientsExplicit = ingredientMode[segmentId] === 'ingredients';
        const charsMatch = getCharactersInScene(segment.imagePrompt);
        const charIds = charsMatch ? charsMatch.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [];
        const charsReferencePaths = charIds.map(id => characterImages[id]).filter(Boolean);
        
        const isIngredients = isIngredientsExplicit || charsReferencePaths.length > 0;
        const baseIngredientPaths = isIngredientsExplicit ? (ingredientImages[segmentId] || []) : [];
        const ingredientPaths = Array.from(new Set([...baseIngredientPaths, ...charsReferencePaths])).slice(0, 3);

        if (isIngredients && ingredientPaths.length > 0) {
          setVo3Progress(prev => ({ ...prev, [segmentId]: `Gerando com ${ingredientPaths.length} referência(s) via Veo 3.1${isFast ? ' Fast' : ''}...` }));
        } else if (referenceImagePath) {
          setVo3Progress(prev => ({ ...prev, [segmentId]: `Animando imagem com Veo 3.1${isFast ? ' Fast' : ''}...` }));
        } else {
          setVo3Progress(prev => ({ ...prev, [segmentId]: `Gerando vídeo com Veo 3.1${isFast ? ' Fast' : ''}...` }));
        }

        const result = await window.electron?.videoProject?.generateVeo3Api({
          prompt: extractPromptString(segment.imagePrompt) || `Cinematic animation of the scene: ${segment.text}`,
          aspectRatio: aspectRatio,
          referenceImagePath: isIngredients ? undefined : referenceImagePath,
          ingredientImagePaths: isIngredients && ingredientPaths.length > 0 ? ingredientPaths : undefined,
          model: modelName
        });
        
        if (result?.success && (result.httpUrl || result.videoPath)) {
          const duration = result.durationMs ? Number((result.durationMs / 1000).toFixed(2)) : undefined;
          onUpdateImage(segmentId, result.httpUrl || result.videoPath, duration);
          success = true;
        } else {
          console.error(`❌ [Veo3 API] Falha:`, result?.error);
          
          if (result?.error?.includes('Limite diário')) {
             alert(`🛑 ALERTA: ${result.error}\nA geração em lote será interrompida.`);
             batchCancelledRef.current = true;
             return false;
          }
          
          if (!silent) alert(`Falha na geração Veo 3.1: ${result?.error}`);
        }

      // ── VEO 2 (API oficial) ──
      } else {
        console.log(`🌊 [Veo2] Gerando vídeo para segmento ${segmentId}...`);

        // Usa a imagem de referência (calculada no início do bloco try)

        if (referenceImagePath) {
          setVo3Progress(prev => ({ ...prev, [segmentId]: 'Animando imagem com Veo 2...' }));
        } else {
          setVo3Progress(prev => ({ ...prev, [segmentId]: 'Gerando vídeo com Veo 2...' }));
        }

        const result = await window.electron?.videoProject?.generateVeo2({
          prompt: extractPromptString(segment.imagePrompt) || `Cinematic animation of the scene: ${segment.text}`,
          aspectRatio: aspectRatio,
          referenceImagePath,
          finalImagePath,
        });
        if (result?.success && (result.httpUrl || result.videoPath)) {
          const duration = result.durationMs ? Number((result.durationMs / 1000).toFixed(2)) : undefined;
          onUpdateImage(segmentId, result.httpUrl || result.videoPath, duration);
          success = true;
        } else {
          console.error(`❌ [Veo2] Falha:`, result?.error);
          if (!silent) alert(`Falha na geração Veo 2: ${result?.error}`);
        }
      }
    } catch (error) {
      console.error('Erro ao gerar mídia:', error);
    } finally {
      delete activeServicesRef.current[segmentId];
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
    return success;
  };

  // Handler para remover imagem
  const handleRemoveImage = (segmentId: number) => {
    onUpdateImage(segmentId, '');
  };

  // ── Funções de seleção de cenas ──
  const handleToggleScene = useCallback((segmentId: number, event?: React.MouseEvent) => {
    if (event?.shiftKey && lastClickedSceneRef.current !== null) {
      // Shift+Click: selecionar range
      const ids = segments.map(s => s.id);
      const startIdx = ids.indexOf(lastClickedSceneRef.current);
      const endIdx = ids.indexOf(segmentId);
      if (startIdx !== -1 && endIdx !== -1) {
        const from = Math.min(startIdx, endIdx);
        const to = Math.max(startIdx, endIdx);
        const rangeIds = ids.slice(from, to + 1);
        setSelectedScenes(prev => {
          const next = new Set(prev);
          rangeIds.forEach(id => next.add(id));
          return next;
        });
      }
    } else {
      // Click normal: toggle
      setSelectedScenes(prev => {
        const next = new Set(prev);
        if (next.has(segmentId)) {
          next.delete(segmentId);
        } else {
          next.add(segmentId);
        }
        return next;
      });
    }
    lastClickedSceneRef.current = segmentId;
  }, [segments]);

  // ── Processamento em lote — pool de workers paralelos (cancelável) ──
  const handleBatchProcess = useCallback(async () => {
    const targetIds = segments
      .filter(s => selectedScenes.has(s.id))
      .map(s => s.id);

    if (targetIds.length === 0) {
      alert('Nenhuma cena selecionada para processar.');
      return;
    }

    batchCancelledRef.current = false;
    setBatchProcessing(true);
    setBatchResults({});
    setBatchProgress({ current: 0, total: targetIds.length, currentSceneId: null });

    // Fila compartilhada entre workers
    // Ordenar a fila para que os processos do Flow sejam executados antes dos processos do Grok
    const queue = [...targetIds].sort((a, b) => {
      const segA = segments.find(s => s.id === a);
      const segB = segments.find(s => s.id === b);
      if (!segA || !segB) return 0;
      const isFlowA = ['veo3', 'veo2-flow', 'flow-image'].includes(getEffectiveService(segA));
      const isFlowB = ['veo3', 'veo2-flow', 'flow-image'].includes(getEffectiveService(segB));
      if (isFlowA && !isFlowB) return -1;
      if (!isFlowA && isFlowB) return 1;
      return 0;
    });
    let completed = 0;

    // Cada worker pega tarefas da fila enquanto houver e não estiver cancelado.
    // Com BATCH_WORKERS = 4 workers em paralelo, há até 4 gerações simultâneas.
    // O cancelamento para de alimentar novos itens — tarefas em andamento terminam.
    const BATCH_WORKERS = 4;
    const workers = Array.from({ length: BATCH_WORKERS }, async () => {
      while (queue.length > 0 && !batchCancelledRef.current) {
        const segId = queue.shift();
        if (!segId) break;

        try {
          const ok = await handleRegenerate(segId, undefined, true);
          setBatchResults(prev => ({ ...prev, [segId]: ok ? 'success' : 'error' }));
        } catch (err) {
          console.error(`❌ Batch: erro na cena ${segId}:`, err);
          setBatchResults(prev => ({ ...prev, [segId]: 'error' }));
        } finally {
          completed++;
          setBatchProgress({ current: completed, total: targetIds.length, currentSceneId: null });
        }
      }
    });

    await Promise.allSettled(workers);

    setBatchProcessing(false);
    setBatchProgress(prev => ({ ...prev, currentSceneId: null }));
  }, [segments, selectedScenes, handleRegenerate]);

  const handleBatchCancel = useCallback(() => {
    batchCancelledRef.current = true;
    // 1. Workers param de puxar novas tarefas imediatamente (frontend)
    generatingSegmentsRef.current = new Set();
    pendingProgressMessageRef.current = null;
    if (progressFlushTimerRef.current !== null) {
      clearTimeout(progressFlushTimerRef.current);
      progressFlushTimerRef.current = null;
    }
    setGeneratingSegments(new Set());
    setVo3Progress({});
    setBatchProcessing(false);
    // 2. Esvaziar filas do backend (mutex + slots) para liberar chamadas em espera
    window.electron?.videoProject?.cancelFlowQueue?.().catch?.(() => {});
  }, []);

  // Helper para label do botão principal
  const getGenerateLabel = (
    segment: TranscriptionSegment,
    isGenerating: boolean,
    serviceOverride?: string
  ): string => {
    if (isGenerating) {
      const progress = vo3Progress[segment.id];
      if (progress) return progress;
      return '...';
    }
    // Se já tem vídeo → "Gerar novamente"
    if (isVideo(segment.imageUrl)) return '↻ Gerar novamente';
    // Se tem imagem (não vídeo) → label depende do serviço
    const svc = serviceOverride || getEffectiveService(segment);
    if (segment.imageUrl && !isVideo(segment.imageUrl)) {
      if (svc === 'flow-image') return '🖼️ Gerar nova Imagem';
      if (finalImages[segment.id]) return '🎬 Gerar Cena';
      return '🖼️ Animar Imagem';
    }
    // Sem mídia → label baseado no serviço
    if (svc === 'grok') return '✖️ Gerar com Grok';
    if (svc === 'veo3-api') return '🚀 Gerar com Veo 3.1';
    if (svc === 'veo3-fast-api') return '⚡ Gerar com Veo 3.1 Fast';
    if (svc === 'veo3') return '🌊 Gerar com Veo 3';
    // if (svc === 'veo2-flow') return '🌊 Gerar com Veo 2 Flow';
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
            onClick={() => setShowCharactersModal(true)}
            className="px-4 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 border border-yellow-500/20 rounded-lg transition-all"
          >
            📸 Personagens
          </button>

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
      <div className="flex flex-wrap items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="text-white/60 text-sm">
            {segmentsWithMediaCount} de {segments.length} prontas
          </span>
        </div>

        {/* Aspect Ratio Selector */}
        {onAspectRatioChange && (
          <div className="flex items-center gap-2 border-l border-white/10 pl-4">
            <span className="text-white/60 text-sm">Formato:</span>
            <select
              value={aspectRatio || '9:16'}
              onChange={(e) => onAspectRatioChange(e.target.value)}
              className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white text-sm focus:border-pink-500 focus:outline-none"
            >
              <option value="9:16">Vertical (9:16)</option>
              <option value="16:9">Horizontal (16:9)</option>
            </select>
          </div>
        )}

        {/* Mostra créditos do Veo 3 se existir algum segmento configurado */}
        {hasVo3Segments && (
          <div className="flex items-center gap-2 px-3 py-1 bg-[#1a73e8]/20 rounded-full border border-[#1a73e8]/30">
            <span className="text-xl">✨</span>
            <span className="text-[#8ab4f8] font-medium text-sm">
              {isCheckingCredits ? 'Verificando créditos...' : vo3Credits !== null ? `${vo3Credits} Créditos Flow` : 'Créditos indisponíveis'}
            </span>
          </div>
        )}

        {/* ── Processamento em Lote ── */}
        <div className="ml-auto flex items-center gap-3 relative">
          
          {/* Botão de Configurações em Lote */}
          <div className="relative flex items-center">
            <button
              onClick={() => setShowBatchSettings(!showBatchSettings)}
              className="w-8 h-8 rounded-xl bg-gray-600/50 hover:bg-gray-500/70 border border-white/10 flex items-center justify-center text-white transition-all shadow-lg"
              title="Configurar cenas selecionadas"
            >
              ⚙️
            </button>
            {showBatchSettings && (
              <div
                className="absolute top-full right-0 mt-2 z-[60] bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[240px] select-none"
                onMouseLeave={() => setShowBatchSettings(false)}
              >
                <div className="px-3 py-2 border-b border-white/10 bg-white/5">
                  <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">Ações em Lote</span>
                </div>
                <div className="p-2 space-y-1">
                  <div className="px-2 py-1 text-[10px] text-white/40 uppercase mb-1">Alterar Serviço (Selecionadas)</div>
                  {GENERATION_SERVICES.map(svc => (
                    <button
                      key={svc.id}
                      onClick={() => {
                        if (selectedScenes.size === 0) {
                          alert('Nenhuma cena selecionada.');
                          return;
                        }
                        setSelectedService(prev => {
                          const next = { ...prev };
                          Array.from(selectedScenes).forEach(id => {
                            next[id] = svc.id;
                          });
                          return next;
                        });
                        setShowBatchSettings(false);
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-white/80 hover:text-white hover:bg-white/10 rounded-md transition-all outline-none"
                    >
                      <span className="text-sm">{svc.icon}</span>
                      <span>{svc.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-l border-white/10 pl-4 relative">
          {batchProcessing ? (
            <>
              <div className="w-4 h-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
              <span className="text-cyan-300 text-sm font-medium">
                {batchProgress.current}/{batchProgress.total}
              </span>
              <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%` }}
                />
              </div>
              <button
                onClick={handleBatchCancel}
                className="px-2.5 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-medium transition-all"
              >
                ✕ Parar
              </button>
            </>
          ) : (
            <div className="flex gap-0 relative">
              {/* Botão principal - Processar */}
              <button
                onClick={handleBatchProcess}
                disabled={selectedScenes.size === 0}
                className="py-1.5 px-4 rounded-l-lg text-xs font-bold transition-all bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40"
              >
                🚀 Processar {selectedScenes.size === segments.length ? 'Todas' : `${selectedScenes.size} Cenas`}
              </button>

              {/* Separador */}
              <div className="self-stretch w-px bg-white/30" />

              {/* Botão dropdown ▼ */}
              <button
                onClick={() => setShowBatchDropdown(!showBatchDropdown)}
                className="px-2 py-1.5 rounded-r-lg text-xs transition-all bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white shadow-lg shadow-indigo-500/20"
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M6 8L1 3h10z"/>
                </svg>
              </button>

              {/* Dropdown de seleção de cenas */}
              {showBatchDropdown && (
                <div
                  className="absolute top-full right-0 mt-1 z-50 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[220px] select-none"
                  onMouseLeave={() => setShowBatchDropdown(false)}
                >
                  {/* Ações rápidas */}
                  <div className="flex border-b border-white/10">
                    <button
                      onClick={() => setSelectedScenes(new Set(segments.map(s => s.id)))}
                      className="flex-1 px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/5 transition-all outline-none"
                    >
                      ✓ Todas
                    </button>
                    <div className="w-px bg-white/10" />
                    <button
                      onClick={() => setSelectedScenes(new Set())}
                      className="flex-1 px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/5 transition-all outline-none"
                    >
                      ✕ Nenhuma
                    </button>
                  </div>
                  {/* Lista de cenas */}
                  <div
                    className="max-h-[240px] overflow-y-auto batch-dropdown-scroll"
                    style={{ overscrollBehavior: 'contain' }}
                    onWheel={(e) => {
                      const el = e.currentTarget;
                      const atTop = el.scrollTop === 0 && e.deltaY < 0;
                      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight && e.deltaY > 0;
                      if (atTop || atBottom) {
                        e.stopPropagation();
                        e.preventDefault();
                      }
                    }}
                  >
                    {segments.map(seg => {
                      const isChecked = selectedScenes.has(seg.id);
                      return (
                        <button
                          key={seg.id}
                          onClick={(e) => handleToggleScene(seg.id, e)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-all hover:bg-white/5 outline-none ${
                            isChecked ? 'text-white' : 'text-white/40'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                            isChecked
                              ? 'bg-indigo-500 border-indigo-500'
                              : 'border-white/30'
                          }`}>
                            {isChecked && (
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="white">
                                <path d="M10.28 2.28a.75.75 0 00-1.06-1.06L4.5 5.94 2.78 4.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l5.25-5.25z"/>
                              </svg>
                            )}
                          </div>
                          <span className="truncate">Cena {seg.id}</span>
                          {seg.imageUrl && (
                            <span className="ml-auto text-green-400/60 text-xs">●</span>
                          )}
                          {batchResults[seg.id] === 'success' && <span className="ml-auto text-xs">✅</span>}
                          {batchResults[seg.id] === 'error' && <span className="ml-auto text-xs">❌</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Resultado do batch */}
          {!batchProcessing && Object.keys(batchResults).length > 0 && (
            <div className="flex items-center gap-1.5">
              {batchStats.success > 0 && (
                <span className="text-green-400 text-xs">✅{batchStats.success}</span>
              )}
              {batchStats.error > 0 && (
                <span className="text-red-400 text-xs">❌{batchStats.error}</span>
              )}
              <button
                onClick={() => setBatchResults({})}
                className="text-white/30 hover:text-white/60 text-xs transition-all"
                title="Limpar resultados"
              >
                ✕
              </button>
            </div>
          )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {segments.map((segment) => {
          const isGenerating = generatingSegments.has(segment.id);
          const isUploading = uploadingSegments.has(segment.id);
          const hasImage = !!segment.imageUrl;
          const isBatchActive = batchProcessing && batchProgress.currentSceneId === segment.id;
          const effectiveService = getEffectiveService(segment);

          return (
            <div
              key={segment.id}
              className={`bg-white/5 border rounded-xl transition-all ${
                isBatchActive
                  ? 'border-cyan-400 ring-2 ring-cyan-400/30 shadow-lg shadow-cyan-500/10'
                  : 'border-white/10'
              }`}
              style={{ contentVisibility: 'auto', containIntrinsicSize: '430px' }}
            >
              {/* Preview de imagem ou área de upload */}
              <div className="aspect-video relative group rounded-t-xl overflow-hidden">

                {/* Select Modo: Frames / Ingredients (canto superior esquerdo, só Veo 3 e Flow Image) */}
                {(effectiveService === 'veo3' || effectiveService === 'flow-image' || effectiveService === 'veo3-api' || effectiveService === 'veo3-fast-api') && !isGenerating && (
                  <div className="absolute top-2 left-2 z-20">
                    <select
                      value={ingredientMode[segment.id] || 'frames'}
                      onChange={e => {
                        const mode = e.target.value as 'frames' | 'ingredients';
                        setIngredientMode(prev => ({ ...prev, [segment.id]: mode }));
                      }}
                      onClick={e => e.stopPropagation()}
                      className="bg-black/80 border border-white/30 text-white text-[11px] rounded-md px-1.5 py-0.5 backdrop-blur-sm cursor-pointer focus:outline-none focus:border-cyan-400 hover:border-white/50 transition-all"
                    >
                      <option value="frames">🎬 Frames</option>
                      <option value="ingredients">🧪 Ingredients</option>
                    </select>
                  </div>
                )}

                {/* Mini-select de quantidade (Flow Image) */}
                {effectiveService === 'flow-image' && !isGenerating && (
                  <div className="absolute top-2 right-2 z-10">
                    <select
                      value={imageCount[segment.id] ?? 1}
                      onChange={e => setImageCount(prev => ({ ...prev, [segment.id]: Number(e.target.value) }))}
                      onClick={e => e.stopPropagation()}
                      title="Quantidade de imagens a gerar"
                      className="bg-black/80 border border-white/30 text-white text-xs rounded-md px-1.5 py-0.5 backdrop-blur-sm cursor-pointer focus:outline-none focus:border-pink-500 hover:border-white/50 transition-all"
                    >
                      <option value={1}>1 imagem</option>
                      <option value={2}>2 imagens</option>
                      <option value={3}>3 imagens</option>
                      <option value={4}>4 imagens</option>
                    </select>
                  </div>
                )}

                {/* Mini-select de quantidade (Vídeo Flow: veo3 / veo2-flow) */}
                {(effectiveService === 'veo3' || effectiveService === 'veo2-flow') && !isGenerating && (
                  <div className="absolute top-2 right-2 z-10">
                    <select
                      value={imageCount[segment.id] ?? 1}
                      onChange={e => setImageCount(prev => ({ ...prev, [segment.id]: Number(e.target.value) }))}
                      onClick={e => e.stopPropagation()}
                      title="Quantidade de vídeos a gerar"
                      className="bg-black/80 border border-white/30 text-white text-xs rounded-md px-1.5 py-0.5 backdrop-blur-sm cursor-pointer focus:outline-none focus:border-cyan-400 hover:border-white/50 transition-all"
                    >
                      <option value={1}>1 vídeo</option>
                      <option value={2}>2 vídeos</option>
                      <option value={3}>3 vídeos</option>
                      <option value={4}>4 vídeos</option>
                    </select>
                  </div>
                )}
                {(() => {
                  if (isGenerating || isUploading) {
                    return (
                      <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-purple-500/10 flex items-center justify-center z-30">
                        <div className="text-center">
                          <div className="w-10 h-10 mx-auto mb-2 border-2 border-pink-500/30 border-t-pink-500 rounded-full animate-spin" />
                          <p className="text-white/60 text-sm">
                            {isUploading ? 'Enviando...' : (vo3Progress[segment.id] || 'Gerando...')}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  const svc = effectiveService;
                  const isVideoService = svc === 'veo3' || svc === 'veo3-api' || svc === 'veo3-fast-api' || svc === 'veo2-flow' || svc === 'veo2' || svc === 'grok';
                  const showCarousel = isVideoService && hasImage && !isVideo(segment.imageUrl) && ingredientMode[segment.id] !== 'ingredients';
                  const currentIndex = carouselIndices[segment.id] || 0;
                  const isIngredientsMode = ingredientMode[segment.id] === 'ingredients';

                  // 0. MODO INGREDIENTS: 3 slots de upload de imagem
                  if (isIngredientsMode) {
                    const imgs = ingredientImages[segment.id] || [];
                    return (
                      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-purple-500/5 flex items-center justify-center p-4">
                        <div className="flex gap-3 items-center justify-center w-full">
                          {[0, 1, 2].map(idx => {
                            const imgUrl = imgs[idx];
                            if (imgUrl) {
                              return (
                                <div key={idx} className="relative w-1/3 aspect-square rounded-xl overflow-hidden border-2 border-cyan-500/30 group/slot">
                                  <img
                                    src={getMediaSrc(imgUrl)}
                                    className="w-full h-full object-cover"
                                    alt={`Ingrediente ${idx + 1}`}
                                    loading="lazy"
                                    decoding="async"
                                  />
                                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/slot:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleRemoveIngredient(segment.id, idx); }}
                                      className="p-1.5 bg-red-500/80 hover:bg-red-500 text-white rounded-lg text-xs transition-all"
                                      title="Remover"
                                    >🗑️</button>
                                    <label className="p-1.5 bg-blue-500/80 hover:bg-blue-500 text-white rounded-lg text-xs cursor-pointer transition-all">
                                      📁
                                      <input type="file" accept="image/*" className="hidden" onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          handleRemoveIngredient(segment.id, idx);
                                          handleIngredientUpload(segment.id, file);
                                        }
                                      }} />
                                    </label>
                                  </div>
                                  <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/70 text-cyan-300 text-[10px] rounded backdrop-blur-sm">{idx + 1}</div>
                                </div>
                              );
                            }
                            return (
                              <label key={idx} className="w-1/3 aspect-square rounded-xl border-2 border-dashed border-cyan-500/25 hover:border-cyan-400/50 flex flex-col items-center justify-center cursor-pointer transition-all bg-black/20 hover:bg-cyan-500/10">
                                <span className="text-cyan-400/60 text-2xl mb-1">+</span>
                                <span className="text-white/30 text-[10px]">Imagem {idx + 1}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) handleIngredientUpload(segment.id, file);
                                  }}
                                />
                              </label>
                            );
                          })}
                        </div>
                        <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 text-white/40 text-[10px] rounded backdrop-blur-sm">
                          3.1 Fast · {imgs.length}/3
                        </div>
                      </div>
                    );
                  }

                  // 1. SEM IMAGEM (UPLOAD INICIAL)
                  if (!hasImage) {
                     return (
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
                     );
                  }

                  // 2. VÍDEO PRONTO
                  if (isVideo(segment.imageUrl)) {
                     const hasReusableSource = !!segment.sourceImageUrl && !isVideo(segment.sourceImageUrl);
                     return (
                       <>
                        <SmartVideoPreview src={getMediaSrc(segment.imageUrl)} />
                        {hasReusableSource && (
                          <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 text-white text-xs rounded backdrop-blur-sm z-20 pointer-events-none">
                            🖼️ Imagem base salva
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10">
                          {hasReusableSource && (
                            <button
                              onClick={() => onUpdateImage(segment.id, segment.sourceImageUrl!)}
                              className="px-3 py-2 bg-cyan-500/80 hover:bg-cyan-500 text-white rounded-lg text-sm transition-all"
                            >
                              🖼️ Reusar imagem
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveImage(segment.id)}
                            className="px-3 py-2 bg-red-500/80 hover:bg-red-500 text-white rounded-lg text-sm transition-all"
                          >
                            🗑️ Remover
                          </button>
                        </div>
                       </>
                     );
                  }

                  // 3. CARROSSEL: QUADRO FINAL
                  if (showCarousel && currentIndex === 1) {
                     const finalImgUrl = finalImages[segment.id];
                     if (finalImgUrl) {
                        return (
                          <>
                            <img
                              src={getMediaSrc(finalImgUrl)}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                            <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 text-white text-xs rounded backdrop-blur-sm z-20 pointer-events-none">🎬 Final</div>
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 z-10 transition-opacity">
                               <button onClick={() => handleRemoveFinalImage(segment.id)} className="px-3 py-2 bg-red-500/80 hover:bg-red-500 text-white rounded-lg text-sm transition-all shadow-md">🗑️ Remover</button>
                               <label className="px-3 py-2 bg-blue-500/80 hover:bg-blue-500 text-white rounded-lg text-sm cursor-pointer transition-all shadow-md">
                                 📁 Trocar
                                 <input type="file" accept="image/*" className="hidden" onChange={e => {
                                   const file = e.target.files?.[0];
                                   if (file) handleFinalMediaUpload(segment.id, file);
                                 }} />
                               </label>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); setCarouselIndices(p => ({...p, [segment.id]: 0})); }} className="absolute left-2 top-1/2 -translate-y-1/2 z-30 rounded-full bg-black/50 text-white w-8 h-8 flex items-center justify-center hover:bg-black transition shadow-lg">◀</button>
                          </>
                        );
                     } else {
                        return (
                          <label className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-purple-500/10 flex items-center justify-center cursor-pointer hover:from-pink-500/20 hover:to-purple-500/20 transition-all">
                            <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 text-white text-xs rounded backdrop-blur-sm z-20 pointer-events-none">🎬 Final</div>
                            <div className="text-center pointer-events-none">
                              <div className="text-4xl mb-2 text-white/50">+</div>
                              <p className="text-white/60 text-sm">Adicionar Quadro Final</p>
                            </div>
                            <input 
                              type="file" 
                              accept="image/*" 
                              className="hidden" 
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFinalMediaUpload(segment.id, file);
                              }} 
                            />
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCarouselIndices(p => ({...p, [segment.id]: 0})); }} className="absolute left-2 top-1/2 -translate-y-1/2 z-30 rounded-full bg-black/50 text-white w-8 h-8 flex items-center justify-center hover:bg-black transition shadow-lg">◀</button>
                          </label>
                        );
                     }
                  }

                  // 4. CARROSSEL: QUADRO INICIAL (com botão Right se for video service)
                  return (
                    <>
                      <img
                        src={getMediaSrc(segment.imageUrl)}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                      {showCarousel && (
                        <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 text-white text-xs rounded backdrop-blur-sm z-20 pointer-events-none">🎬 Inicial</div>
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 z-10 transition-opacity">
                         <button onClick={() => { handleRemoveImage(segment.id); handleRemoveFinalImage(segment.id); }} className="px-3 py-2 bg-red-500/80 hover:bg-red-500 text-white rounded-lg text-sm transition-all shadow-md">🗑️ Remover</button>
                         <label className="px-3 py-2 bg-blue-500/80 hover:bg-blue-500 text-white rounded-lg text-sm cursor-pointer transition-all shadow-md">
                           📁 Trocar
                           <input type="file" accept="image/*,video/*" className="hidden" onChange={e => {
                             const file = e.target.files?.[0];
                             if (file) handleMediaUpload(segment.id, file);
                           }} />
                         </label>
                      </div>
                      {showCarousel && (
                         <button onClick={(e) => { e.stopPropagation(); setCarouselIndices(p => ({...p, [segment.id]: 1})); }} className="absolute right-2 top-1/2 -translate-y-1/2 z-30 rounded-full bg-black/50 text-white w-8 h-8 flex items-center justify-center hover:bg-black transition shadow-lg">▶</button>
                      )}
                    </>
                  );
                })()}
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
                  {(() => {
                    const chars = getCharactersInScene(segment.imagePrompt);
                    if (!chars) return null;
                    return (
                      <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 rounded text-xs">
                        🧑‍🤝‍🧑 {chars}
                      </span>
                    );
                  })()}
                </div>
                <p className="text-white/80 text-sm line-clamp-2 mb-1">{segment.text}</p>
                {segment.imagePrompt && (
                  <p className="text-white/40 text-xs line-clamp-1 mb-2 italic">
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
                        : 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-300'
                    }`}
                  >
                    {getGenerateLabel(segment, isGenerating, effectiveService)}
                    {!isGenerating && (
                      <span className="text-[10px] opacity-60 ml-1 font-normal">
                        ({GENERATION_SERVICES.find(s => s.id === effectiveService)?.label || effectiveService})
                      </span>
                    )}
                  </button>

                  {/* Separador | */}
                  <div className={`self-stretch w-px opacity-40 ${
                    isGenerating ? 'bg-white/20' : 'bg-orange-400'
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
                          isGenerating
                            ? 'bg-white/5 text-white/30 cursor-not-allowed'
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
                          className="absolute bottom-full right-0 mb-1 z-50 bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl min-w-[220px] overflow-y-auto max-h-[350px] batch-dropdown-scroll"
                          onMouseLeave={() => setOpenDropdown(null)}
                          style={{ overscrollBehavior: 'contain' }}
                          onWheel={(e) => {
                            const el = e.currentTarget;
                            const atTop = el.scrollTop === 0 && e.deltaY < 0;
                            const atBottom = Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 1 && e.deltaY > 0;
                            if (atTop || atBottom) {
                              e.stopPropagation();
                            }
                          }}
                        >
                          <div className="px-3 py-2 text-white/40 text-xs border-b border-white/10 uppercase tracking-wider">
                            Serviço de geração
                          </div>
                          {GENERATION_SERVICES.map(svc => {
                            const isActive = effectiveService === svc.id;
                            return (
                              <button
                                key={svc.id}
                                onClick={() => {
                                  setSelectedService(prev => ({ ...prev, [segment.id]: svc.id }));
                                  // Resetar count para 1 ao trocar para serviço de vídeo
                                  if (svc.id === 'veo3' || svc.id === 'veo2-flow' || svc.id === 'grok') {
                                    setImageCount(prev => ({ ...prev, [segment.id]: 1 }));
                                  }
                                  // Resetar modo ingredients se saiu de veo3, flow-image ou veo3-api/fast
                                  if (svc.id !== 'veo3' && svc.id !== 'flow-image' && svc.id !== 'veo3-api' && svc.id !== 'veo3-fast-api' && ingredientMode[segment.id] === 'ingredients') {
                                    setIngredientMode(prev => ({ ...prev, [segment.id]: 'frames' }));
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

      {/* Modal picker de imagens geradas pelo Flow (fila) */}
      {pickerQueue.length > 0 && (() => {
        const current = pickerQueue[0];
        const remaining = pickerQueue.length - 1;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-[560px] max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-white font-bold text-lg">🖼️ Escolha uma imagem</h3>
                {remaining > 0 && (
                  <span className="text-xs text-white/40 bg-white/10 px-2 py-0.5 rounded-full">
                    +{remaining} cena{remaining > 1 ? 's' : ''} na fila
                  </span>
                )}
              </div>
              <p className="text-white/50 text-sm mb-4">
                Cena {current.segmentId} — Clique na imagem desejada para selecioná-la.
              </p>

              <div className={`grid ${current.httpUrls.length === 1 ? 'grid-cols-1 max-w-[280px] mx-auto' : 'grid-cols-2'} gap-3 mb-5`}>
                {current.httpUrls.map((url, idx) => (
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
                      loading="lazy"
                      decoding="async"
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
                    onUpdateImage(current.segmentId, current.httpUrls[pickerSelectedIdx]);
                    setPickerQueue(prev => prev.slice(1));
                    setPickerSelectedIdx(0);
                  }}
                  className="flex-1 py-2.5 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white rounded-xl font-medium transition-all"
                >
                  {remaining > 0 ? `Usar esta imagem → Próxima (${remaining})` : 'Usar esta imagem'}
                </button>
                <button
                  onClick={() => {
                    // Manter a primeira imagem (já foi aplicada) e pular
                    setPickerQueue(prev => prev.slice(1));
                    setPickerSelectedIdx(0);
                  }}
                  className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all"
                >
                  Pular
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal de Personagens */}
      {showCharactersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">📸 Referências de Personagens</h3>
                <p className="text-white/50 text-sm">Faça upload de personagens que poderão ser usados como referência ou ingredientes.</p>
              </div>
              <button
                onClick={() => setShowCharactersModal(false)}
                className="text-white/40 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-all text-xl"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                {/* Mostra personagens existentes ou placeholders (sempre garantimos pelo menos um extra) */}
                {Array.from({ length: Math.max(...Object.keys(characterImages).map(Number), 0) + 1 }).map((_, i) => {
                  const charId = i + 1;
                  const imgUrl = characterImages[charId];
                  return (
                    <div key={charId} className="flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="text-white/80 text-sm font-medium">Personagem {charId}</span>
                        {imgUrl && (
                          <button
                            onClick={() => handleRemoveCharacterImage(charId)}
                            className="text-red-400 hover:text-red-300 text-xs transition-colors"
                          >
                            Remover
                          </button>
                        )}
                      </div>
                      <div className="aspect-square relative group rounded-xl border-2 border-dashed border-white/20 hover:border-yellow-500/50 hover:bg-yellow-500/5 transition-all overflow-hidden flex items-center justify-center bg-white/5 cursor-pointer">
                        {imgUrl ? (
                          <>
                            <img
                              src={getMediaSrc(imgUrl)}
                              alt={`Personagem ${charId}`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <label className="text-white text-sm font-medium px-3 py-1.5 bg-black/50 rounded-lg cursor-pointer hover:bg-black/70 transition-all">
                                📁 Trocar
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) handleCharacterImageUpload(charId, file);
                                  }}
                                />
                              </label>
                            </div>
                          </>
                        ) : (
                          <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer p-4 text-center">
                            <span className="text-white/30 text-3xl mb-2">+</span>
                            <span className="text-white/50 text-xs">Adicionar<br/>Referência</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleCharacterImageUpload(charId, file);
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="p-6 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setShowCharactersModal(false)}
                className="px-6 py-2.5 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white rounded-xl font-medium transition-all"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
