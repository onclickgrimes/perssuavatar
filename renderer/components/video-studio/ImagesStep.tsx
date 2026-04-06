import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { TranscriptionSegment } from '../../types/video-studio';
import { ChannelNiche } from './NicheModal';
import {
  ASSET_DEFINITIONS,
  CAMERA_MOVEMENTS,
  TRANSITIONS,
  type CameraMovement,
  type Transition,
} from '../../../remotion/types/project';
import {
  getAssetTypeInfo,
  normalizeCharactersField,
  normalizeSceneReferenceIds,
  stripCharactersFromPrompt,
} from './prompt-utils';

interface ImagesStepProps {
  segments: TranscriptionSegment[];
  onUpdatePrompt: (id: number, prompt: string) => void;
  onUpdateImage: (id: number, imageUrl: string, durationVideoSec?: number) => void;
  onContinue: () => void;
  onBack: () => void;
  provider?: 'gemini' | 'gemini_scraping' | 'openai' | 'deepseek';
  onProviderChange?: (p: 'gemini' | 'gemini_scraping' | 'openai' | 'deepseek') => void;
  providerModel?: string;
  onProviderModelChange?: (m: string) => void;
  onAnalyze?: (instruction?: string, context?: AnalysisReferenceContext) => void | Promise<void>;
  onAnalyzeScene?: (segmentId: number, instruction: string) => void | Promise<void>;
  isProcessing?: boolean;
  onSegmentsUpdate?: (newSegments: TranscriptionSegment[]) => void;
  niche?: ChannelNiche | null;
  onGenerateFirstFrame?: () => void | Promise<void>;
  aspectRatio?: string;
  onAspectRatioChange?: (value: string) => void;
}

interface SmartVideoPreviewProps {
  src: string;
}

interface StoryCharacterReference {
  id: number;
  character: string;
  prompt_en: string;
  reference_id: number | null;
}

interface StoryLocationReference {
  id: number;
  location: string;
  prompt_en: string;
  reference_id: number | null;
}

interface CharacterReferenceItem {
  id: number;
  character: string;
  prompt_en: string;
  reference_id: number | null;
  imageUrl?: string;
}

interface LocationReferenceItem {
  id: number;
  location: string;
  prompt_en: string;
  reference_id: number | null;
  imageUrl?: string;
}

interface AnalysisReferenceContextItem {
  id: number;
  label?: string;
  prompt_en?: string;
  reference_id?: number | null;
}

interface AnalysisReferenceContext {
  characters?: AnalysisReferenceContextItem[];
  locations?: AnalysisReferenceContextItem[];
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
  onUpdatePrompt,
  onUpdateImage,
  onContinue,
  onBack,
  provider = 'gemini',
  onProviderChange,
  providerModel,
  onProviderModelChange,
  onAnalyze,
  onAnalyzeScene,
  isProcessing,
  onSegmentsUpdate,
  niche,
  onGenerateFirstFrame,
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
  // Quantidade de imagens a gerar por segmento (relevante para serviços de imagem)
  const [imageCount, setImageCount] = useState<Record<number, number>>({});
  // Fila de seleções pendentes quando o Flow gera múltiplas imagens
  const [pickerQueue, setPickerQueue] = useState<{ segmentId: number; httpUrls: string[] }[]>([]);
  const [pickerSelectedIdx, setPickerSelectedIdx] = useState<number>(0);

  const [finalImages, setFinalImages] = useState<Record<number, string>>({});
  const [carouselIndices, setCarouselIndices] = useState<Record<number, number>>({});

  // ── Ingredients (Veo 3.1, exceto modelos Lite) ──
  // 'frames' = usa Inicial/Final (padrão), 'ingredients' = usa até 3 imagens como ingredientes
  const [ingredientMode, setIngredientMode] = useState<Record<number, 'frames' | 'ingredients'>>({});
  const [ingredientImages, setIngredientImages] = useState<Record<number, string[]>>({});

  // ── Character / Location References ──
  const [showCharactersModal, setShowCharactersModal] = useState(false);
  const [characterReferences, setCharacterReferences] = useState<CharacterReferenceItem[]>([]);
  const [locationReferences, setLocationReferences] = useState<LocationReferenceItem[]>([]);
  const [isExtractingReferences, setIsExtractingReferences] = useState(false);
  const [referencesError, setReferencesError] = useState<string | null>(null);
  const [characterStyle, setCharacterStyle] = useState('fotorrealista');
  const [locationStyle, setLocationStyle] = useState('fotorrealista');
  const [globalInstruction, setGlobalInstruction] = useState('');
  const [sceneInstructions, setSceneInstructions] = useState<Record<number, string>>({});
  const [pendingSceneId, setPendingSceneId] = useState<number | null>(null);

  const characterImages = useMemo<Record<number, string>>(() => {
    return characterReferences.reduce((acc, character) => {
      if (character.imageUrl) {
        acc[character.id] = character.imageUrl;
      }
      return acc;
    }, {} as Record<number, string>);
  }, [characterReferences]);

  const hasGlobalInstruction = globalInstruction.trim().length > 0;
  const hasVideoStockWithoutUrl = segments.some(
    seg => seg.assetType === 'video_stock' && !seg.imageUrl
  );
  const hasImagePrompts = segments.some(s => !!s.imagePrompt);
  const hasFrameAnimatePrompts = segments.some(
    s => s.assetType === 'video_frame_animate' && (!!s.firstFrame || !!s.animateFrame)
  );
  const hasPrompts = hasImagePrompts || hasFrameAnimatePrompts;

  const handleCharacterImageUpload = async (charId: number, file: File) => {
    try {
      const fallbackCharacter = {
        id: charId,
        character: `Personagem ${charId}`,
        prompt_en: '',
        reference_id: null as number | null,
      };

      const applyImage = (imageUrl: string) => {
        setCharacterReferences(prev => {
          const hasReference = prev.some(character => character.id === charId);
          if (!hasReference) {
            return [...prev, { ...fallbackCharacter, imageUrl }].sort((a, b) => a.id - b.id);
          }

          return prev.map(character =>
            character.id === charId ? { ...character, imageUrl } : character
          );
        });
      };

      if (!window.electron?.videoProject?.saveImage) {
        applyImage(URL.createObjectURL(file));
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const result = await window.electron.videoProject.saveImage(arrayBuffer, `character_${charId}_${file.name}`, 0);
        if (result.success && result.httpUrl) {
          applyImage(result.httpUrl);
        }
      }
    } catch (error) {
      console.error('Error uploading character image:', error);
    }
  };

  const handleRemoveCharacterImage = (charId: number) => {
    setCharacterReferences(prev => prev.map(character =>
      character.id === charId ? { ...character, imageUrl: undefined } : character
    ));
  };

  const handleLocationImageUpload = async (locationId: number, file: File) => {
    try {
      const fallbackLocation = {
        id: locationId,
        location: `Lugar ${locationId}`,
        prompt_en: '',
        reference_id: null as number | null,
      };

      const applyImage = (imageUrl: string) => {
        setLocationReferences(prev => {
          const hasReference = prev.some(location => location.id === locationId);
          if (!hasReference) {
            return [...prev, { ...fallbackLocation, imageUrl }].sort((a, b) => a.id - b.id);
          }

          return prev.map(location =>
            location.id === locationId ? { ...location, imageUrl } : location
          );
        });
      };

      if (!window.electron?.videoProject?.saveImage) {
        applyImage(URL.createObjectURL(file));
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const result = await window.electron.videoProject.saveImage(arrayBuffer, `location_${locationId}_${file.name}`, 0);
        if (result.success && result.httpUrl) {
          applyImage(result.httpUrl);
        }
      }
    } catch (error) {
      console.error('Error uploading location image:', error);
    }
  };

  const handleRemoveLocationImage = (locationId: number) => {
    setLocationReferences(prev => prev.map(location =>
      location.id === locationId ? { ...location, imageUrl: undefined } : location
    ));
  };

  const addManualCharacterReference = () => {
    const maxId = characterReferences.reduce((max, item) => Math.max(max, item.id), 0);
    const nextId = maxId + 1;
    setCharacterReferences(prev => ([
      ...prev,
      {
        id: nextId,
        character: `Personagem ${nextId}`,
        prompt_en: '',
        reference_id: null,
      },
    ]));
  };

  const addManualLocationReference = () => {
    const maxId = locationReferences.reduce((max, item) => Math.max(max, item.id), 0);
    const nextId = maxId + 1;
    setLocationReferences(prev => ([
      ...prev,
      {
        id: nextId,
        location: `Lugar ${nextId}`,
        prompt_en: '',
        reference_id: null,
      },
    ]));
  };

  const toPositiveInt = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }

    if (typeof value === 'string') {
      const parsed = parseInt(value.trim(), 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return null;
  };

  const handleExtractStoryReferences = async () => {
    if (isAiBusy || isExtractingReferences) return;
    if (!window.electron?.videoProject?.extractStoryAssets) return;

    const segmentsPayload = segments
      .filter(seg => (seg.text || '').trim().length > 0)
      .map(seg => ({
        id: seg.id,
        text: seg.text,
        start: seg.start,
        end: seg.end,
        speaker: seg.speaker,
      }));

    if (segmentsPayload.length === 0) {
      setReferencesError('Não há transcrição suficiente para extrair personagens e lugares.');
      return;
    }

    setIsExtractingReferences(true);
    setReferencesError(null);

    try {
      const requestPayload = { segments: segmentsPayload };
      const requestOptions = {
        provider,
        model: providerModel,
        characterStyle: characterStyle.trim() || 'fotorrealista',
        locationStyle: locationStyle.trim() || 'fotorrealista',
      };
      console.log('🧪 [StoryAssets][Renderer] Request:', {
        payload: requestPayload,
        options: requestOptions,
      });

      const result = await window.electron.videoProject.extractStoryAssets(
        requestPayload,
        requestOptions
      );
      console.log('🧪 [StoryAssets][Renderer] Response:', result);

      if (!result?.success) {
        setReferencesError(result?.error || 'Falha ao extrair referências.');
        return;
      }

      const previousCharacterImages = new Map<number, string>();
      characterReferences.forEach(character => {
        if (character.imageUrl) previousCharacterImages.set(character.id, character.imageUrl);
      });

      const previousLocationImages = new Map<number, string>();
      locationReferences.forEach(location => {
        if (location.imageUrl) previousLocationImages.set(location.id, location.imageUrl);
      });

      const nextCharacters = (Array.isArray(result.characters) ? result.characters : []) as StoryCharacterReference[];
      const nextLocations = (Array.isArray(result.locations) ? result.locations : []) as StoryLocationReference[];

      const normalizedCharacters = nextCharacters.map((character, index) => {
        const id = toPositiveInt(character?.id) ?? index + 1;
        return {
          id,
          character: String(character?.character ?? `Personagem ${id}`),
          prompt_en: String(character?.prompt_en ?? '').trim(),
          reference_id: toPositiveInt(character?.reference_id),
          imageUrl: previousCharacterImages.get(id),
        } as CharacterReferenceItem;
      });

      const normalizedLocations = nextLocations.map((location, index) => {
        const id = toPositiveInt(location?.id) ?? index + 1;
        return {
          id,
          location: String(location?.location ?? `Lugar ${id}`),
          prompt_en: String(location?.prompt_en ?? '').trim(),
          reference_id: toPositiveInt(location?.reference_id),
          imageUrl: previousLocationImages.get(id),
        } as LocationReferenceItem;
      });

      setCharacterReferences(normalizedCharacters);
      setLocationReferences(normalizedLocations);

      if (normalizedCharacters.length === 0 && normalizedLocations.length === 0) {
        setReferencesError('A IA não retornou personagens ou lugares para esta transcrição.');
      }
    } catch (error: any) {
      setReferencesError(error?.message || 'Falha ao extrair referências.');
    } finally {
      setIsExtractingReferences(false);
    }
  };

  useEffect(() => {
    if (!onSegmentsUpdate) return;

    let hasChanges = false;
    const nextSegments = segments.map(segment => {
      const parsedCurrentCharacters = normalizeCharactersField(segment.IdOfTheCharactersInTheScene);
      const parsedCurrentLocation = normalizeSceneReferenceIds(segment.IdOfTheLocationInTheScene);
      const {
        cleanedPrompt,
        extractedCharacters,
        extractedLocation,
        didStrip,
      } = stripCharactersFromPrompt(segment.imagePrompt);
      const nextCharacters = parsedCurrentCharacters ?? extractedCharacters;
      const nextLocation = parsedCurrentLocation ?? extractedLocation;
      const charsChanged = nextCharacters !== parsedCurrentCharacters;
      const locationChanged = nextLocation !== parsedCurrentLocation;

      if (!didStrip && !charsChanged && !locationChanged) return segment;

      hasChanges = true;
      return {
        ...segment,
        imagePrompt: cleanedPrompt as any,
        IdOfTheCharactersInTheScene: nextCharacters,
        IdOfTheLocationInTheScene: nextLocation,
      };
    });

    if (hasChanges) {
      onSegmentsUpdate(nextSegments);
    }
  }, [segments, onSegmentsUpdate]);

  const isAiBusy = Boolean(isProcessing)
    || pendingSceneId !== null
    || generatingSegments.size > 0
    || uploadingSegments.size > 0
    || isExtractingReferences;

  const buildAnalysisReferencesContext = useCallback((): AnalysisReferenceContext | undefined => {
    const characters = characterReferences
      .filter(item => Number.isFinite(item.id) && item.id > 0)
      .map(item => ({
        id: item.id,
        label: item.character?.trim() || `Personagem ${item.id}`,
        prompt_en: item.prompt_en?.trim() || undefined,
        reference_id: item.reference_id,
      }));

    const locations = locationReferences
      .filter(item => Number.isFinite(item.id) && item.id > 0)
      .map(item => ({
        id: item.id,
        label: item.location?.trim() || `Lugar ${item.id}`,
        prompt_en: item.prompt_en?.trim() || undefined,
        reference_id: item.reference_id,
      }));

    if (characters.length === 0 && locations.length === 0) {
      return undefined;
    }

    return {
      ...(characters.length > 0 ? { characters } : {}),
      ...(locations.length > 0 ? { locations } : {}),
    };
  }, [characterReferences, locationReferences]);

  const handleAnalyzeWithOptionalInstruction = async () => {
    if (!onAnalyze || isAiBusy) return;
    const instruction = hasPrompts && hasGlobalInstruction
      ? globalInstruction.trim()
      : undefined;
    await onAnalyze(instruction, buildAnalysisReferencesContext());
  };

  const handleApplySceneInstruction = async (segmentId: number) => {
    if (!onAnalyzeScene || isAiBusy) return;

    const instruction = (sceneInstructions[segmentId] || '').trim();
    if (!instruction) return;

    setPendingSceneId(segmentId);
    try {
      await onAnalyzeScene(segmentId, instruction);
      setSceneInstructions(prev => ({ ...prev, [segmentId]: '' }));
    } finally {
      setPendingSceneId(null);
    }
  };

  const parseCharactersInScene = (charsRaw: unknown): string | null => {
    return normalizeCharactersField(charsRaw) || null;
  };

  const getCharactersInScene = (segment: TranscriptionSegment): string | null => {
    const directValue = parseCharactersInScene(segment.IdOfTheCharactersInTheScene);
    if (directValue) return directValue;

    // Compatibilidade com projetos antigos onde esse campo vinha dentro do imagePrompt.
    const imagePrompt = segment.imagePrompt;
    if (!imagePrompt) return null;

    let charsRaw: unknown = null;

    if (typeof imagePrompt === 'object' && imagePrompt !== null) {
      const imagePromptObj = imagePrompt as Record<string, any>;
      if ('IdOfTheCharactersInTheScene' in imagePromptObj) {
        charsRaw = imagePromptObj.IdOfTheCharactersInTheScene;
      } else if (
        typeof imagePromptObj.video_generation_prompt === 'object' &&
        imagePromptObj.video_generation_prompt !== null &&
        'IdOfTheCharactersInTheScene' in imagePromptObj.video_generation_prompt
      ) {
        charsRaw = imagePromptObj.video_generation_prompt.IdOfTheCharactersInTheScene;
      }
    } else if (typeof imagePrompt === 'string') {
      try {
        const parsed = JSON.parse(imagePrompt);
        if (parsed.IdOfTheCharactersInTheScene) {
          charsRaw = parsed.IdOfTheCharactersInTheScene;
        } else if (parsed.video_generation_prompt?.IdOfTheCharactersInTheScene) {
          charsRaw = parsed.video_generation_prompt.IdOfTheCharactersInTheScene;
        }
      } catch {
        // Fallback: extrair usando regex em string crua
        charsRaw = imagePrompt;
      }
    }

    return parseCharactersInScene(charsRaw);
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
  // const hasVo3Segments = useMemo(
  //   () => segments.some(s => s.assetType === 'video_vo3' || s.assetType === 'video_veo2' || s.assetType === 'image_static'),
  //   [segments]
  // );
  const segmentsWithMediaCount = useMemo(
    () => segments.reduce((count, seg) => count + (seg.imageUrl ? 1 : 0), 0),
    [segments]
  );
  const canContinue = hasPrompts || segmentsWithMediaCount > 0;
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
  // useEffect(() => {
  //   const fetchCredits = async () => {
  //     if (hasVo3Segments) {
  //       setIsCheckingCredits(true);
  //       try {
  //         const result = await window.electron?.videoProject?.getVo3Credits?.();
  //         if (result?.success && result.credits !== null) {
  //           setVo3Credits(result.credits);
  //         }
  //       } catch (error) {
  //         console.error('Erro ao buscar créditos Flow:', error);
  //       } finally {
  //         setIsCheckingCredits(false);
  //       }
  //     }
  //   };
  //   fetchCredits();
  // }, [hasVo3Segments]);

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
    { id: 'veo3',           label: 'Veo 3.1 (Flow)',     icon: '🌊', description: 'Google Veo 3.1 via Google Flow' },
    { id: 'veo3-lite-flow', label: 'Veo 3.1 - Lite (Flow)', icon: '🌊', description: 'Google Veo 3.1 - Lite via Google Flow' },
    { id: 'veo3-api',       label: 'Veo 3.1 (API)',    icon: '🚀', description: 'Google Veo 3.1 via API Oficial' },
    { id: 'veo3-fast-api',  label: 'Veo 3.1 Fast',     icon: '⚡', description: 'Google Veo 3.1 Fast via API Oficial' },
    { id: 'veo3-lite-api',  label: 'Veo 3.1 Lite (API)', icon: '💭', description: 'Google Veo 3.1 Lite via API Oficial' },
    { id: 'grok',           label: 'Grok',             icon: '✖️', description: 'Geração de vídeo com Grok' },
    // { id: 'veo2-flow',      label: 'Veo 2 (Flow)',     icon: '🌊', description: 'Google Veo 2 Fast via Google Flow' },
    { id: 'flow-image',     label: 'Imagem (Flow)',      icon: '🖼️', description: 'Google Flow (modo Criar imagens)' },
    { id: 'flow-image-api', label: '🍌 Nano Banana 2',   icon: '🖼️', description: 'gemini-3.1-flash-image-preview' },
    { id: 'flow-image-pro', label: '🍌 Nano Banana Pro', icon: '🖼️', description: 'gemini-3-pro-image-preview' },
    { id: 'veo2',           label: 'Veo 2 (API)',      icon: '🌊', description: 'Google Veo 2 via API oficial' },
  ];

  const IMAGE_SERVICES = new Set(['flow-image', 'flow-image-api', 'flow-image-pro']);
  const IMAGE_API_SERVICES = new Set(['flow-image-api', 'flow-image-pro']);
  const FLOW_SERVICES = new Set(['veo3', 'veo3-lite-flow', 'veo2-flow', 'flow-image']);
  const getImageModelByService = (serviceId: string): string =>
    serviceId === 'flow-image-pro'
      ? 'gemini-3-pro-image-preview'
      : 'gemini-3.1-flash-image-preview';
  const supportsIngredientsForService = (serviceId: string): boolean =>
    serviceId === 'veo3'
    || serviceId === 'flow-image'
    || serviceId === 'flow-image-api'
    || serviceId === 'flow-image-pro'
    || serviceId === 'veo3-api'
    || serviceId === 'veo3-fast-api';

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

    if (!supportsIngredientsForService(service) && ingredientMode[segmentId] === 'ingredients') {
      setIngredientMode(prev => ({ ...prev, [segmentId]: 'frames' }));
    }

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

      const normalizedFirstFrame = typeof segment.firstFrame === 'string'
        ? segment.firstFrame.trim()
        : '';
      const normalizedAnimateFrame = typeof segment.animateFrame === 'string'
        ? segment.animateFrame.trim()
        : '';
      const basePrompt = extractPromptString(segment.imagePrompt) || `Cinematic scene: ${segment.text}`;

      const targetGenerationPrompt = IMAGE_SERVICES.has(service)
        ? (normalizedFirstFrame || normalizedAnimateFrame || basePrompt)
        : (normalizedAnimateFrame || basePrompt);

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
          prompt: targetGenerationPrompt,
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
      } else if (service === 'veo3' || service === 'veo3-lite-flow') {
        const count = imageCount[segmentId] ?? 1;
        if (vo3Credits !== null && vo3Credits < 20) {
          if (!silent) alert(`Créditos insuficientes! Você tem ${vo3Credits} créditos e precisa de pelo menos 20 para gerar um vídeo no Flow.`);
          setGeneratingSegments(prev => { const next = new Set(prev); next.delete(segmentId); return next; });
          return false;
        }

        const isLiteFlow = service === 'veo3-lite-flow';
        const flowModelName = isLiteFlow ? 'Veo 3.1 - Lite' : undefined;
        const flowServiceLabel = isLiteFlow ? 'Veo 3.1 - Lite' : 'Veo 3';

        // Verificar modo Ingredients e Personagens
        const isIngredientsExplicit = ingredientMode[segmentId] === 'ingredients';
        
        const charsMatch = getCharactersInScene(segment);
        const charIds = charsMatch ? charsMatch.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [];
        const charsReferencePaths = charIds.map(id => characterImages[id]).filter(Boolean);
        
        const ingredientsRequested = isIngredientsExplicit || charsReferencePaths.length > 0;
        const isIngredients = !isLiteFlow && ingredientsRequested;
        const baseIngredientPaths = (isIngredientsExplicit && !isLiteFlow) ? (ingredientImages[segmentId] || []) : [];
        
        // Combina ingredientes explícitos com imagens de personagens (máximo 3)
        const ingredientPaths = Array.from(new Set([...baseIngredientPaths, ...charsReferencePaths])).slice(0, 3);

        if (isLiteFlow && ingredientsRequested) {
          setVo3Progress(prev => ({ ...prev, [segmentId]: 'Veo 3.1 - Lite não suporta Ingredients. Usando Frames...' }));
        }

        if (isIngredients && ingredientPaths.length === 0) {
          if (!silent) alert('Nenhuma imagem de ingrediente ou personagem disponível para gerar.');
          setGeneratingSegments(prev => { const next = new Set(prev); next.delete(segmentId); return next; });
          return false;
        }

        console.log(`🌊 [Veo3] Gerando ${count} vídeo(s) para segmento ${segmentId}${isIngredients ? ` com ${ingredientPaths.length} ingredient(s)` : ''}...`);
        
        if (isIngredients) {
           setVo3Progress(prev => ({ ...prev, [segmentId]: `Gerando com ${ingredientPaths.length} ingrediente(s)...` }));
        } else if (referenceImagePath) {
           setVo3Progress(prev => ({ ...prev, [segmentId]: `Animando imagem com ${flowServiceLabel}...` }));
        } else {
           setVo3Progress(prev => ({ ...prev, [segmentId]: `Iniciando geração ${flowServiceLabel}...` }));
        }

        // Timeout de 12 min para Veo3
        const veo3TimeoutMs = 12 * 60 * 1000;
        const veo3Promise = window.electron?.videoProject?.generateVo3({
          prompt: targetGenerationPrompt,
          aspectRatio: aspectRatio,
          count,
          referenceImagePath: isIngredients ? undefined : referenceImagePath,
          finalImagePath: isIngredients ? undefined : finalImagePath,
          ingredientImagePaths: isIngredients ? ingredientPaths : undefined,
          model: isIngredients ? 'Veo 3.1 - Fast' : flowModelName,
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
          if (!silent) alert(`Falha na geração ${flowServiceLabel}: ${result?.error}`);
        }

      // ── GROK (Vídeo via Grok) ──
      } else if (service === 'grok') {
        const isFlowRunning = () => Object.values(activeServicesRef.current).some(s => FLOW_SERVICES.has(s));
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
        const charsMatch = getCharactersInScene(segment);
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
          prompt: targetGenerationPrompt,
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

      // ── IMAGE (Flow) ──
      } else if (service === 'flow-image') {
        console.log(`🖼️ [FlowImg] Gerando imagem para segmento ${segmentId}...`);
        const count = imageCount[segmentId] ?? 1;

        // Verificar modo Ingredients e Personagens
        const isIngredientsExplicit = ingredientMode[segmentId] === 'ingredients';
        const charsMatch = getCharactersInScene(segment);
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
          prompt: targetGenerationPrompt,
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

      // ── IMAGE API (Nano Banana 2 / Pro) ──
      } else if (IMAGE_API_SERVICES.has(service)) {
        const imageModel = getImageModelByService(service);
        const imageModelLabel = service === 'flow-image-pro' ? 'Nano Banana Pro' : 'Nano Banana 2';
        console.log(`🖼️ [ImageAPI] Gerando imagem para segmento ${segmentId} com ${imageModelLabel}...`);
        const count = imageCount[segmentId] ?? 1;

        // Verificar modo Ingredients e Personagens
        const isIngredientsExplicit = ingredientMode[segmentId] === 'ingredients';
        const charsMatch = getCharactersInScene(segment);
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

        setVo3Progress(prev => ({ ...prev, [segmentId]: `Gerando ${count} imagem(ns) com ${imageModelLabel}${ingredientPaths.length > 0 ? ` e ${ingredientPaths.length} ref(s)` : ''}...` }));

        const result = await window.electron?.videoProject?.generateFlowImage({
          prompt: targetGenerationPrompt,
          count,
          model: imageModel,
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
          console.error(`❌ [ImageAPI] Falha:`, result?.error);
          if (!silent) alert(`Falha na geração de imagem (${imageModelLabel}): ${result?.error}`);
        }

      // ── VEO 3.1 / FAST / LITE (API oficial) ──
      } else if (service === 'veo3-api' || service === 'veo3-fast-api' || service === 'veo3-lite-api') {
        console.log(`🚀 [Veo3 API] Gerando vídeo para segmento ${segmentId}...`);
        
        const isLiteApi = service === 'veo3-lite-api';
        const modelName =
          service === 'veo3-fast-api'
            ? 'veo-3.1-fast-generate-001'
            : isLiteApi
              ? 'veo-3.1-lite-generate-001'
              : 'veo-3.1-generate-001';
        const serviceLabel =
          service === 'veo3-fast-api'
            ? ' Fast'
            : isLiteApi
              ? ' Lite'
              : '';

        // Verificar modo Ingredients e Personagens
        const isIngredientsExplicit = ingredientMode[segmentId] === 'ingredients';
        const charsMatch = getCharactersInScene(segment);
        const charIds = charsMatch ? charsMatch.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [];
        const charsReferencePaths = charIds.map(id => characterImages[id]).filter(Boolean);
        
        const ingredientsRequested = isIngredientsExplicit || charsReferencePaths.length > 0;
        const isIngredients = !isLiteApi && ingredientsRequested;
        const baseIngredientPaths = (isIngredientsExplicit && !isLiteApi) ? (ingredientImages[segmentId] || []) : [];
        const ingredientPaths = Array.from(new Set([...baseIngredientPaths, ...charsReferencePaths])).slice(0, 3);

        if (isLiteApi && ingredientsRequested) {
          setVo3Progress(prev => ({ ...prev, [segmentId]: 'Veo 3.1 Lite (API) não suporta Ingredients. Usando Frames...' }));
        }

        if (isIngredients && ingredientPaths.length > 0) {
          setVo3Progress(prev => ({ ...prev, [segmentId]: `Gerando com ${ingredientPaths.length} referência(s) via Veo 3.1${serviceLabel}...` }));
        } else if (referenceImagePath) {
          setVo3Progress(prev => ({ ...prev, [segmentId]: `Animando imagem com Veo 3.1${serviceLabel}...` }));
        } else {
          setVo3Progress(prev => ({ ...prev, [segmentId]: `Gerando vídeo com Veo 3.1${serviceLabel}...` }));
        }

        const result = await window.electron?.videoProject?.generateVeo3Api({
          prompt: targetGenerationPrompt,
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
          prompt: targetGenerationPrompt,
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
      const isFlowA = FLOW_SERVICES.has(getEffectiveService(segA));
      const isFlowB = FLOW_SERVICES.has(getEffectiveService(segB));
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
      if (svc === 'flow-image') return '🖼️ Gerar nova Imagem (Flow)';
      if (svc === 'flow-image-api') return '🍌 Gerar nova Imagem';
      if (svc === 'flow-image-pro') return '🍌 Gerar nova Imagem (Pro)';
      if (finalImages[segment.id]) return '🎬 Gerar Cena';
      return '🖼️ Animar Imagem';
    }
    // Sem mídia → label baseado no serviço
    if (svc === 'grok') return '✖️ Gerar com Grok';
    if (svc === 'veo3-lite-flow') return '🌊 Gerar com Veo 3.1 - Lite';
    if (svc === 'veo3-api') return '🚀 Gerar com Veo 3.1';
    if (svc === 'veo3-fast-api') return '⚡ Gerar com Veo 3.1 Fast';
    if (svc === 'veo3-lite-api') return '🪶 Gerar com Veo 3.1 Lite';
    if (svc === 'veo3') return '🌊 Gerar com Veo 3';
    // if (svc === 'veo2-flow') return '🌊 Gerar com Veo 2 Flow';
    if (svc === 'flow-image') return '🖼️ Imagem com Flow';
    if (svc === 'flow-image-api') return '🍌 Imagem com Nano Banana 2';
    if (svc === 'flow-image-pro') return '🍌 Imagem com Nano Banana Pro';
    return '🌊 Gerar com Veo 2';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Prompts, Imagens e Vídeos das Cenas</h2>
          <p className="text-white/60">Revise prompts e assets, depois gere ou faça upload da mídia de cada cena</p>

          {onProviderChange && (
            <div className="flex items-center gap-3 mt-6 flex-wrap">
              <span className="text-white/60 text-sm">IA de Análise:</span>
              <select
                value={provider}
                onChange={(e) => onProviderChange(e.target.value as any)}
                className="bg-black/30 border border-white/10 rounded-lg px-3 py-1 text-white text-sm focus:border-pink-500 focus:outline-none"
              >
                <option value="gemini">Google Gemini</option>
                <option value="gemini_scraping">Gemini (Scraping Navegador)</option>
                <option value="openai">OpenAI</option>
                <option value="deepseek">DeepSeek V3</option>
              </select>

              {onProviderModelChange && (
                <>
                  <span className="text-white/60 text-sm">Modelo:</span>
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
                    {provider === 'gemini_scraping' && (
                      <>
                        <option value="gemini-web-auto">Gemini Web (usa modelo ativo da conta)</option>
                      </>
                    )}
                    {provider === 'openai' && (
                      <>
                        <option value="gpt-5.4-mini">GPT 5.4 Mini ($0.75 inputs / $4.50 outputs)</option>
                        <option value="gpt-5.4">GPT 5.4 ($2.50 inputs / $15.00 outputs)</option>
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
        <div className="flex flex-col items-end gap-3">
          <div className="flex gap-3 items-center flex-wrap justify-end">
            <button
              onClick={onBack}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
            >
              ← Voltar
            </button>

            {onAnalyze && (
              <button
                onClick={handleAnalyzeWithOptionalInstruction}
                disabled={isAiBusy}
                className={`px-4 py-2 border rounded-lg transition-all flex items-center gap-2 ${
                  hasPrompts
                    ? 'bg-white/5 hover:bg-white/10 text-white border-white/20'
                    : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500 animate-pulse'
                } ${isAiBusy ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {isAiBusy ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Gerando...
                  </>
                ) : hasPrompts ? (
                  hasGlobalInstruction ? '✏️ Editar com IA' : '🔄 Regerar com IA'
                ) : (
                  '✨ Gerar Prompts com IA'
                )}
              </button>
            )}

            {onGenerateFirstFrame && hasImagePrompts && (
              <button
                onClick={onGenerateFirstFrame}
                disabled={isAiBusy}
                className={`px-4 py-2 border border-white/20 rounded-lg transition-all flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white ${isAiBusy ? 'opacity-70 cursor-not-allowed' : ''}`}
                title="Gera apenas os prompts de primeiro frame mantendo os prompts atuais"
              >
                🖼️ Gerar First Frames
              </button>
            )}

            <button
              onClick={() => setShowCharactersModal(true)}
              className="px-4 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 border border-yellow-500/20 rounded-lg transition-all"
            >
              📸 Personagens e Lugares
            </button>

            <button
              onClick={onContinue}
              disabled={!canContinue}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                !canContinue
                  ? 'bg-white/5 text-white/30 cursor-not-allowed'
                  : 'bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white'
              }`}
            >
              Renderizar Vídeo →
            </button>
          </div>

          {onAnalyze && (
            <div className="w-full max-w-[560px]">
              <input
                type="text"
                value={globalInstruction}
                onChange={(e) => setGlobalInstruction(e.target.value)}
                placeholder="Instrução global para edição dos prompts"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:border-pink-500 focus:outline-none"
                disabled={isAiBusy}
              />
            </div>
          )}
        </div>
      </div>

      {hasVideoStockWithoutUrl && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <p className="text-yellow-300 text-sm">
            ⚠️ Alguns segmentos usam <strong>video_stock</strong> mas não encontraram vídeo automaticamente.
            Você pode buscar manualmente nesta etapa.
          </p>
        </div>
      )}

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
        {/* {hasVo3Segments && (
          <div className="flex items-center gap-2 px-3 py-1 bg-[#1a73e8]/20 rounded-full border border-[#1a73e8]/30">
            <span className="text-xl">✨</span>
            <span className="text-[#8ab4f8] font-medium text-sm">
              {isCheckingCredits ? 'Verificando créditos...' : vo3Credits !== null ? `${vo3Credits} Créditos Flow` : 'Créditos indisponíveis'}
            </span>
          </div>
        )} */}

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
          const assetInfo = getAssetTypeInfo(segment.assetType || 'image_flux');
          const cameraLabel = segment.cameraMovement
            ? CAMERA_MOVEMENTS[segment.cameraMovement as CameraMovement]?.label || segment.cameraMovement
            : '';
          const transitionLabel = segment.transition
            ? TRANSITIONS[segment.transition as Transition]?.label || segment.transition
            : '';

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
                {supportsIngredientsForService(effectiveService) && !isGenerating && (
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

                {/* Mini-select de quantidade (serviços de imagem) */}
                {IMAGE_SERVICES.has(effectiveService) && !isGenerating && (
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
                {(effectiveService === 'veo3' || effectiveService === 'veo3-lite-flow' || effectiveService === 'veo2-flow') && !isGenerating && (
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
                  const isVideoService = svc === 'veo3' || svc === 'veo3-lite-flow' || svc === 'veo3-api' || svc === 'veo3-fast-api' || svc === 'veo3-lite-api' || svc === 'veo2-flow' || svc === 'veo2' || svc === 'grok';
                  const currentIndex = carouselIndices[segment.id] || 0;
                  const isIngredientsMode = supportsIngredientsForService(svc) && ingredientMode[segment.id] === 'ingredients';
                  const showCarousel = isVideoService && hasImage && !isVideo(segment.imageUrl) && !isIngredientsMode;

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
                          Ingredients · {imgs.length}/3
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
              <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 bg-pink-500/20 text-pink-300 rounded text-xs">
                    Cena {segment.id}
                  </span>
                  <span className="px-2 py-0.5 bg-white/10 text-white/60 rounded text-xs">
                    {segment.emotion}
                  </span>

                  <div className="relative group">
                    <select
                      value={segment.assetType || (niche?.asset_types?.[0] || 'image_flux')}
                      onChange={(e) => {
                        if (!onSegmentsUpdate) return;
                        const newSegments = segments.map(s =>
                          s.id === segment.id ? { ...s, assetType: e.target.value } : s
                        );
                        onSegmentsUpdate(newSegments);
                      }}
                      disabled={!onSegmentsUpdate}
                      className={`appearance-none px-2 py-1 pr-8 ${assetInfo.color} bg-black/40 border border-white/10 rounded-lg text-xs font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-pink-500/50 transition-all hover:bg-black/60`}
                    >
                      {(niche?.asset_types && niche.asset_types.length > 0
                        ? niche.asset_types
                        : Object.keys(ASSET_DEFINITIONS)
                      ).map(type => {
                        const def = ASSET_DEFINITIONS[type as keyof typeof ASSET_DEFINITIONS];
                        return (
                          <option key={type} value={type} className="bg-gray-900 text-white">
                            {def?.label || type}
                          </option>
                        );
                      })}
                    </select>
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-white/50">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                    </div>
                  </div>

                  {segment.assetType === 'video_stock' && segment.imageUrl && (
                    <span className="px-2 py-0.5 bg-green-500/20 text-green-300 rounded text-xs">
                      ✓ Vídeo encontrado
                    </span>
                  )}
                  {segment.cameraMovement && segment.cameraMovement !== 'static' && (
                    <span className="px-2 py-0.5 bg-orange-500/20 text-orange-300 rounded text-xs">
                      🎥 {cameraLabel}
                    </span>
                  )}
                  {segment.transition && segment.transition !== 'fade' && (
                    <span className="px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded text-xs">
                      ✨ {transitionLabel}
                    </span>
                  )}
                  {(() => {
                    const chars = getCharactersInScene(segment);
                    if (!chars) return null;
                    return (
                      <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 rounded text-xs">
                        🧑‍🤝‍🧑 {chars}
                      </span>
                    );
                  })()}
                </div>

                <p className="text-white/80 text-sm italic">"{segment.text}"</p>

                {onAnalyzeScene && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={sceneInstructions[segment.id] || ''}
                      onChange={(e) => setSceneInstructions(prev => ({ ...prev, [segment.id]: e.target.value }))}
                      placeholder="Comando para ajustar apenas esta cena"
                      className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:border-pink-500 focus:outline-none"
                      disabled={isAiBusy}
                    />
                    <button
                      onClick={() => handleApplySceneInstruction(segment.id)}
                      disabled={isAiBusy || !(sceneInstructions[segment.id] || '').trim()}
                      className={`w-10 h-10 rounded-lg border transition-all flex items-center justify-center ${
                        isAiBusy || !(sceneInstructions[segment.id] || '').trim()
                          ? 'bg-white/10 border-white/10 text-white/50 cursor-not-allowed'
                          : 'bg-pink-500/20 border-pink-500/40 text-pink-200 hover:bg-pink-500/30'
                      }`}
                      title="Aplicar comando nesta cena com IA"
                    >
                      {pendingSceneId === segment.id ? (
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        '↻'
                      )}
                    </button>
                  </div>
                )}

                {segment.assetType === 'video_frame_animate' ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-white/60 mb-1">firstFrame</p>
                      <textarea
                        value={segment.firstFrame || ''}
                        onChange={(e) => {
                          if (!onSegmentsUpdate) return;
                          const newSegments = segments.map(s =>
                            s.id === segment.id ? { ...s, firstFrame: e.target.value } : s
                          );
                          onSegmentsUpdate(newSegments);
                        }}
                        rows={4}
                        className="w-full min-h-[7rem] bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/30 focus:border-pink-500 focus:outline-none resize-y p-4 custom-scrollbar"
                        placeholder="Prompt detalhado em inglês para o primeiro frame..."
                        disabled={!onSegmentsUpdate}
                      />
                    </div>

                    <div>
                      <p className="text-xs text-white/60 mb-1">animateFrame</p>
                      <textarea
                        value={segment.animateFrame || ''}
                        onChange={(e) => {
                          if (!onSegmentsUpdate) return;
                          const newSegments = segments.map(s =>
                            s.id === segment.id ? { ...s, animateFrame: e.target.value } : s
                          );
                          onSegmentsUpdate(newSegments);
                        }}
                        rows={4}
                        className="w-full min-h-[7rem] bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/30 focus:border-pink-500 focus:outline-none resize-y p-4 custom-scrollbar"
                        placeholder="Prompt em inglês para animar o vídeo a partir do firstFrame..."
                        disabled={!onSegmentsUpdate}
                      />
                    </div>
                  </div>
                ) : (
                  <textarea
                    value={(() => {
                      const prompt = stripCharactersFromPrompt(segment.imagePrompt).cleanedPrompt;
                      if (!prompt) return `${segment.emotion} scene depicting: ${segment.text}`;
                      if (typeof prompt === 'string') return prompt;
                      return JSON.stringify(prompt, null, 2);
                    })()}
                    onChange={(e) => onUpdatePrompt(segment.id, e.target.value)}
                    rows={6}
                    className="w-full min-h-[9.5rem] bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/30 focus:border-pink-500 focus:outline-none resize-y p-4 custom-scrollbar"
                    placeholder="Descreva a cena visual em detalhes..."
                  />
                )}

                <p className="text-xs text-white/70">
                  <span className="text-white/40">Descrição da cena: </span>
                  {segment.sceneDescription || 'Aguardando resumo deste prompt...'}
                </p>

                {segment.highlightWords && segment.highlightWords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs text-white/40">Palavras destacadas:</span>
                    {segment.highlightWords.map((hw, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded text-xs"
                        style={{ color: hw.color || '#FFD700' }}
                      >
                        "{hw.text}"
                      </span>
                    ))}
                  </div>
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
                                  if (svc.id === 'veo3' || svc.id === 'veo3-lite-flow' || svc.id === 'veo2-flow' || svc.id === 'grok') {
                                    setImageCount(prev => ({ ...prev, [segment.id]: 1 }));
                                  }
                                  // Resetar modo ingredients quando o serviço não suportar ingredients (ex.: modelos Lite)
                                  if (!supportsIngredientsForService(svc.id) && ingredientMode[segment.id] === 'ingredients') {
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

      {/* Modal de Personagens e Lugares */}
      {showCharactersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">📸 Referências de Personagens e Lugares</h3>
                <p className="text-white/50 text-sm">Extraia itens da transcrição com IA e faça upload de uma imagem por personagem/lugar.</p>
              </div>
              <button
                onClick={() => setShowCharactersModal(false)}
                className="text-white/40 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-all text-xl"
              >
                ✕
              </button>
            </div>

            <div className="px-6 pt-6 pb-4 border-b border-white/10">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleExtractStoryReferences}
                  disabled={isExtractingReferences || isAiBusy || !window.electron?.videoProject?.extractStoryAssets}
                  className={`px-4 py-2 rounded-lg border transition-all text-sm ${
                    isExtractingReferences || isAiBusy
                      ? 'bg-white/5 border-white/10 text-white/40 cursor-not-allowed'
                      : 'bg-yellow-500/10 hover:bg-yellow-500/20 border-yellow-500/30 text-yellow-300'
                  }`}
                >
                  {isExtractingReferences ? 'Extraindo referências...' : '✨ Extrair da transcrição'}
                </button>
                <span className="text-white/50 text-sm">
                  {characterReferences.length} personagem(ns) • {locationReferences.length} lugar(es)
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                <div>
                  <label className="block text-xs text-white/60 mb-1">Estilo dos personagens</label>
                  <input
                    type="text"
                    value={characterStyle}
                    onChange={(e) => setCharacterStyle(e.target.value)}
                    placeholder="Ex: fotorrealista, anime, aquarela"
                    disabled={isExtractingReferences}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:border-yellow-500 focus:outline-none disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">Estilo dos lugares</label>
                  <input
                    type="text"
                    value={locationStyle}
                    onChange={(e) => setLocationStyle(e.target.value)}
                    placeholder="Ex: fotorrealista, pintura a óleo, low poly"
                    disabled={isExtractingReferences}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:border-cyan-500 focus:outline-none disabled:opacity-60"
                  />
                </div>
              </div>
              {referencesError && (
                <p className="mt-3 text-sm text-red-300">{referencesError}</p>
              )}
            </div>

            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-8">
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-white font-semibold">Personagens</h4>
                  <button
                    onClick={addManualCharacterReference}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition-all"
                  >
                    + Adicionar manualmente
                  </button>
                </div>

                {characterReferences.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/50">
                    Nenhum personagem listado ainda.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {characterReferences.map(character => {
                      const imgUrl = character.imageUrl;
                      return (
                        <div key={`character-${character.id}`} className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-white text-sm font-medium">
                              #{character.id} {character.character || `Personagem ${character.id}`}
                            </div>
                            <div className="text-xs text-white/40">
                              {character.reference_id ? `ref #${character.reference_id}` : 'base'}
                            </div>
                          </div>

                          <input
                            type="text"
                            value={character.character}
                            onChange={(e) => {
                              const nextValue = e.target.value;
                              setCharacterReferences(prev => prev.map(item =>
                                item.id === character.id ? { ...item, character: nextValue } : item
                              ));
                            }}
                            placeholder="Nome do personagem"
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:border-yellow-500 focus:outline-none"
                          />

                          <textarea
                            value={character.prompt_en}
                            onChange={(e) => {
                              const nextValue = e.target.value;
                              setCharacterReferences(prev => prev.map(item =>
                                item.id === character.id ? { ...item, prompt_en: nextValue } : item
                              ));
                            }}
                            placeholder="Prompt em inglês para gerar a referência visual do personagem"
                            className="w-full min-h-[90px] bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:border-yellow-500 focus:outline-none resize-y"
                          />

                          <div className="aspect-video relative group rounded-xl border-2 border-dashed border-white/20 hover:border-yellow-500/50 hover:bg-yellow-500/5 transition-all overflow-hidden flex items-center justify-center bg-white/5 cursor-pointer">
                            {imgUrl ? (
                              <>
                                <img
                                  src={getMediaSrc(imgUrl)}
                                  alt={`Personagem ${character.id}`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                />
                                <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                  <label className="text-white text-xs font-medium px-3 py-1.5 bg-black/50 rounded-lg cursor-pointer hover:bg-black/70 transition-all">
                                    📁 Trocar
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) handleCharacterImageUpload(character.id, file);
                                      }}
                                    />
                                  </label>
                                  <button
                                    onClick={() => handleRemoveCharacterImage(character.id)}
                                    className="text-red-200 text-xs font-medium px-3 py-1.5 bg-red-500/40 rounded-lg hover:bg-red-500/60 transition-all"
                                  >
                                    Remover
                                  </button>
                                </div>
                              </>
                            ) : (
                              <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer p-4 text-center">
                                <span className="text-white/30 text-3xl mb-2">+</span>
                                <span className="text-white/50 text-xs">Adicionar imagem</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) handleCharacterImageUpload(character.id, file);
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-white font-semibold">Lugares</h4>
                  <button
                    onClick={addManualLocationReference}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition-all"
                  >
                    + Adicionar manualmente
                  </button>
                </div>

                {locationReferences.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/50">
                    Nenhum lugar listado ainda.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {locationReferences.map(location => {
                      const imgUrl = location.imageUrl;
                      return (
                        <div key={`location-${location.id}`} className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-white text-sm font-medium">
                              #{location.id} {location.location || `Lugar ${location.id}`}
                            </div>
                            <div className="text-xs text-white/40">
                              {location.reference_id ? `ref #${location.reference_id}` : 'base'}
                            </div>
                          </div>

                          <input
                            type="text"
                            value={location.location}
                            onChange={(e) => {
                              const nextValue = e.target.value;
                              setLocationReferences(prev => prev.map(item =>
                                item.id === location.id ? { ...item, location: nextValue } : item
                              ));
                            }}
                            placeholder="Nome do lugar"
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:border-cyan-500 focus:outline-none"
                          />

                          <textarea
                            value={location.prompt_en}
                            onChange={(e) => {
                              const nextValue = e.target.value;
                              setLocationReferences(prev => prev.map(item =>
                                item.id === location.id ? { ...item, prompt_en: nextValue } : item
                              ));
                            }}
                            placeholder="Prompt em inglês para gerar a referência visual do lugar"
                            className="w-full min-h-[90px] bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:border-cyan-500 focus:outline-none resize-y"
                          />

                          <div className="aspect-video relative group rounded-xl border-2 border-dashed border-white/20 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all overflow-hidden flex items-center justify-center bg-white/5 cursor-pointer">
                            {imgUrl ? (
                              <>
                                <img
                                  src={getMediaSrc(imgUrl)}
                                  alt={`Lugar ${location.id}`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                />
                                <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                  <label className="text-white text-xs font-medium px-3 py-1.5 bg-black/50 rounded-lg cursor-pointer hover:bg-black/70 transition-all">
                                    📁 Trocar
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) handleLocationImageUpload(location.id, file);
                                      }}
                                    />
                                  </label>
                                  <button
                                    onClick={() => handleRemoveLocationImage(location.id)}
                                    className="text-red-200 text-xs font-medium px-3 py-1.5 bg-red-500/40 rounded-lg hover:bg-red-500/60 transition-all"
                                  >
                                    Remover
                                  </button>
                                </div>
                              </>
                            ) : (
                              <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer p-4 text-center">
                                <span className="text-white/30 text-3xl mb-2">+</span>
                                <span className="text-white/50 text-xs">Adicionar imagem</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) handleLocationImageUpload(location.id, file);
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
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
