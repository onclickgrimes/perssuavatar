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
} from './prompt-utils';
import type { StoryReferencesState as PersistedStoryReferencesState } from '../../shared/utils/project-converter';

type AnalysisProvider = 'gemini' | 'gemini_scraping' | 'openai' | 'deepseek';

interface ImagesStepProps {
  segments: TranscriptionSegment[];
  projectTitle?: string;
  storyReferences?: PersistedStoryReferencesState;
  onStoryReferencesChange: React.Dispatch<React.SetStateAction<PersistedStoryReferencesState>>;
  onUpdatePrompt: (id: number, prompt: string) => void;
  onUpdateImage: (id: number, imageUrl: string, durationVideoSec?: number, generationService?: string | null) => void;
  onContinue: () => void;
  onBack: () => void;
  provider?: AnalysisProvider;
  onProviderChange?: (p: AnalysisProvider) => void;
  providerModel?: string;
  onProviderModelChange?: (m: string) => void;
  onOpenProject?: () => void;
  onSaveProject?: () => void | Promise<void>;
  canSaveProject?: boolean;
  isSavingProject?: boolean;
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

interface HoverImagePreviewState {
  src: string;
  label?: string;
  x: number;
  y: number;
}

interface SceneReferencePickerState {
  segmentId: number;
  kind: 'character' | 'location';
  characterIndex?: number;
}

interface ToolbarSelectOption {
  value: string;
  label: string;
}

type StoryReferenceKind = 'character' | 'location';
type StoryReferenceImageProvider = 'flow-image' | 'flow-image-api' | 'flow-image-pro';
type ScenePromptField = 'imagePrompt' | 'firstFrame' | 'animateFrame';
type VideoFramePromptField = 'firstFrame' | 'animateFrame';
type ScenePromptTranslatedField = 'imagePromptTraduzido' | 'firstFrameTraduzido' | 'animateFrameTraduzido';
type PromptLanguageView = 'translated' | 'original';

const FLOW_EXTENSION_JOB_SCHEMA = 'flow-extension-job.v1';
const FLOW_EXTENSION_RESULT_SCHEMA = 'flow-extension-result.v1';
const IMAGE_REFERENCE_LIMIT = 10;
const DEFAULT_INGREDIENT_LIMIT = 3;
const IMAGE_SERVICE_IDS = new Set(['flow-image', 'vertex-image', 'flow-image-api', 'flow-image-pro']);
const GENERATION_COUNT_OPTIONS = [1, 2, 3, 4] as const;
const VEO3_API_ALLOWED_SECONDS = [4, 6, 8] as const;
const VEO2_API_ALLOWED_SECONDS = [5, 6, 8] as const;
const GROK_ALLOWED_SECONDS = [6, 10] as const;
const TRANSLATION_DEBOUNCE_MS = 3000;
const VEO3_API_AUTO_REWRITE_MAX_RETRIES = 3;
const VEO3_API_FAILED_PROMPT_CONTEXT_MAX_CHARS = 1200;
const VEO3_API_SUPPORT_CODE_CATEGORY: Record<string, string> = {
  '58061214': 'Filho',
  '17301594': 'Filho',
  '29310472': 'Celebridade',
  '15236754': 'Celebridade',
  '64151117': 'Violação de segurança de vídeo',
  '42237218': 'Violação de segurança de vídeo',
  '62263041': 'Conteúdo perigoso',
  '57734940': 'Incita o ódio',
  '22137204': 'Incita o ódio',
  '74803281': 'Outro',
  '29578790': 'Outro',
  '42876398': 'Outro',
  '89371032': 'Conteúdo proibido',
  '49114662': 'Conteúdo proibido',
  '63429089': 'Conteúdo proibido',
  '72817394': 'Conteúdo proibido',
  '60599140': 'Conteúdo proibido',
  '35561574': 'Conteúdo de terceiros',
  '35561575': 'Conteúdo de terceiros',
  '90789179': 'Conteúdo sexual',
  '43188360': 'Conteúdo sexual',
  '78610348': 'Tóxico',
  '61493863': 'Violência',
  '56562880': 'Violência',
  '32635315': 'Vulgar',
};

type Veo3ApiSafetyFailure = {
  message: string;
  supportCodes: string[];
  categories: string[];
  isSafetyError: boolean;
};

const parseVeo3ApiSafetyError = (
  rawError: unknown
): Veo3ApiSafetyFailure => {
  const message = String(rawError || '').trim();
  const lowerMessage = message.toLowerCase();
  const numberMatches = message.match(/\b\d{8}\b/g) || [];
  const supportCodes = Array.from(new Set(
    numberMatches.filter(code => Object.prototype.hasOwnProperty.call(VEO3_API_SUPPORT_CODE_CATEGORY, code))
  ));
  const categories = Array.from(new Set(
    supportCodes
      .map(code => VEO3_API_SUPPORT_CODE_CATEGORY[code])
      .filter((category): category is string => Boolean(category))
  ));
  const hasSafetyKeyword = lowerMessage.includes('support code')
    || lowerMessage.includes('responsible ai')
    || lowerMessage.includes('sensitive words')
    || lowerMessage.includes('raimediafiltered')
    || lowerMessage.includes('mediafiltered')
    || lowerMessage.includes('safety');

  return {
    message,
    supportCodes,
    categories,
    isSafetyError: supportCodes.length > 0 || hasSafetyKeyword,
  };
};

const buildVeo3ApiSafetyRewriteInstruction = (
  parsedFailure: Veo3ApiSafetyFailure,
  failedPrompt: string,
  attempt: number
): string => {
  const supportCodes = parsedFailure.supportCodes.length > 0
    ? parsedFailure.supportCodes.join(', ')
    : 'n/a';
  const categories = parsedFailure.categories.length > 0
    ? parsedFailure.categories.join(', ')
    : 'media-filter';
  const normalizedFailedPrompt = failedPrompt.trim();
  const promptContext = normalizedFailedPrompt.length > VEO3_API_FAILED_PROMPT_CONTEXT_MAX_CHARS
    ? `${normalizedFailedPrompt.slice(0, VEO3_API_FAILED_PROMPT_CONTEXT_MAX_CHARS)}...`
    : normalizedFailedPrompt;

  return [
    'Veo 3.1 rejected the previous animation prompt with a Responsible AI/media-filter error.',
    `Support codes: ${supportCodes}. Categories: ${categories}. Retry attempt: ${attempt}.`,
    parsedFailure.message ? `Failure message: ${parsedFailure.message}` : '',
    'Regenerate the animateFrame as a safer retry while preserving the visible first-frame continuity, subject identity, camera intent, and scene mood.',
    'Do not reuse potentially sensitive words from the failed prompt. Replace wording such as carcass, corpse, dead body, blood, blood-stained, gore, wound, kill, attack, weapon, danger, hate, sexual, minor, celebrity, or otherwise policy-sensitive terms with neutral cinematic visual language.',
    'Example of the expected rewrite style: prefer "fallen animal", "massive shape in the snow", "dark marks on the frozen ground", "cold winter wind Foley", and calm camera language instead of explicit gore or harm wording.',
    'Keep the final prompt concise, literal, and generation-ready. It must not mention the error, support codes, safety policy, or this instruction.',
    promptContext ? `Failed prompt to rewrite safely:\n${promptContext}` : '',
  ]
    .filter(Boolean)
    .join('\n');
};

const PROMPT_FIELD_TO_TRANSLATED_KEY: Record<ScenePromptField, ScenePromptTranslatedField> = {
  imagePrompt: 'imagePromptTraduzido',
  firstFrame: 'firstFrameTraduzido',
  animateFrame: 'animateFrameTraduzido',
};
const VIDEO_FRAME_PROMPT_FIELDS: VideoFramePromptField[] = ['firstFrame', 'animateFrame'];

const getIngredientLimitByService = (serviceId: string): number => {
  return IMAGE_SERVICE_IDS.has(serviceId) ? IMAGE_REFERENCE_LIMIT : DEFAULT_INGREDIENT_LIMIT;
};

const normalizeGenerationCount = (value: unknown): number => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 1;
  return Math.max(1, Math.min(4, Math.round(numericValue)));
};

const normalizeVeo3ApiAutoRewriteRetries = (value: unknown): number => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return VEO3_API_AUTO_REWRITE_MAX_RETRIES;
  return Math.max(0, Math.min(VEO3_API_AUTO_REWRITE_MAX_RETRIES, Math.round(numericValue)));
};

const getSceneDurationInfo = (segment: Pick<TranscriptionSegment, 'start' | 'end'>): { rawSeconds: number; roundedSeconds: number } => {
  const start = Number(segment.start);
  const end = Number(segment.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { rawSeconds: 0, roundedSeconds: 1 };
  }
  const rawSeconds = Math.max(0, end - start);
  return {
    rawSeconds,
    roundedSeconds: Math.max(1, Math.round(rawSeconds)),
  };
};

const pickNearestAllowedDuration = (targetSeconds: number, allowedSeconds: readonly number[]): number => {
  const safeTarget = Number.isFinite(targetSeconds) ? targetSeconds : allowedSeconds[0];
  return [...allowedSeconds]
    .sort((a, b) => {
      const diffA = Math.abs(a - safeTarget);
      const diffB = Math.abs(b - safeTarget);
      if (diffA !== diffB) return diffA - diffB;
      return b - a;
    })[0] ?? allowedSeconds[0];
};

const extractPromptString = (imagePrompt: unknown): string => {
  if (!imagePrompt) return '';
  if (typeof imagePrompt === 'string') return imagePrompt;
  if (typeof imagePrompt === 'object' && imagePrompt !== null) {
    return JSON.stringify(imagePrompt);
  }
  return String(imagePrompt);
};

const getGenerationServiceLabel = (serviceId: string): string => {
  if (serviceId === 'veo3') return 'Veo 3.1 (Flow2API)';
  if (serviceId === 'veo3-lite-flow') return 'Veo 3.1 Lite (Flow2API)';
  if (serviceId === 'veo3-api') return 'Veo 3.1 (API)';
  if (serviceId === 'veo3-fast-api') return 'Veo 3.1 Fast (API)';
  if (serviceId === 'veo3-lite-api') return 'Veo 3.1 Lite (API)';
  if (serviceId === 'grok') return 'Grok';
  if (serviceId === 'veo2-flow') return 'Veo 2 (Flow2API)';
  if (serviceId === 'veo2') return 'Veo 2 (API)';
  if (serviceId === 'flow-image') return 'Imagem (Flow2API)';
  if (serviceId === 'vertex-image') return 'Imagem (Vertex)';
  if (serviceId === 'flow-image-api') return 'Nano Banana 2';
  if (serviceId === 'flow-image-pro') return 'Nano Banana Pro';
  return serviceId;
};

type FlowExportService = 'veo3' | 'veo3-lite-flow' | 'veo2-flow' | 'flow-image';
type FlowExportMediaType = 'image' | 'video';

interface FlowExtensionExportTask {
  taskId: string;
  segmentId: number;
  sceneIndex: number;
  mediaType: FlowExportMediaType;
  service: FlowExportService;
  model?: string;
  prompt: string;
  count: number;
  aspectRatio?: string;
  referenceImageUrl?: string;
  finalImageUrl?: string;
  ingredientImageUrls?: string[];
  sceneText?: string;
  sceneDescription?: string;
}

interface FlowExtensionExportPayload {
  schemaVersion: typeof FLOW_EXTENSION_JOB_SCHEMA;
  exportedAt: string;
  source: {
    app: string;
    module: string;
    projectTitle?: string;
  };
  defaults: {
    aspectRatio?: string;
    timeoutMsImage: number;
    timeoutMsVideo: number;
  };
  tasks: FlowExtensionExportTask[];
}

interface FlowExtensionImportMedia {
  url: string;
  kind?: 'image' | 'video';
  durationSec?: number;
}

interface FlowExtensionImportItem {
  taskId?: string;
  segmentId?: number;
  mediaType?: 'image' | 'video';
  service?: string;
  status?: string;
  selectedMediaUrl?: string;
  media: FlowExtensionImportMedia[];
  error?: string;
}

const CHARACTER_REFERENCE_MODEL_PROMPT = `A high-definition, clean, minimalist character design board / character turnaround reference sheet, set against a pure white background. The overall presentation should resemble a professional character design sheet, modeling reference board, or turnaround presentation page. The layout should be neat, well-organized, and clearly divided into sections, with consistent lighting and strict character consistency throughout.

On the left side of the composition, show the character's full-body three-view turnaround, occupying the main visual area, including:
1. Front full-body standing pose
2. Left-side full-body standing pose
3. Back full-body standing pose

All three figures must be the exact same character, with identical facial features, hairstyle, clothing, body shape, and height proportions. The pose should be natural, with both arms resting at the sides. The camera angle should be eye level, with neutral studio lighting, no distortion, no exaggerated perspective, and no complex background. The full character must be visible with no cropping.

On the right side of the composition, divide the layout into two sections:

Upper-right section:
Place six headshot / head-angle reference images of the same character, arranged neatly to show different head perspectives, including:
- Front-facing portrait
- Slight downward angle (top of the head visible)
- Back of the head
- Left-side profile
- Near side-angle comparison
- 3/4 portrait view

All head references must maintain identical facial structure, proportions, and hairstyle.

Lower-right section:
Place six close-up detail images of the same character, arranged in a clean grid, showing key design details, such as:
- Upper garment detail
- Lower-body clothing detail (front)
- Hip / seam / structural detail
- Leg or surface detail
- Eye or facial feature detail
- Shoes or footwear detail

All detail images must match the main character exactly in design and appearance.

Overall layout requirements:
Minimalist, clean, professional, consistent, and easy to read. Clear separation between sections. Generous white space. High visual clarity. No clutter.

Output requirements:
Landscape composition, pure white background, full character visible, no cropping, no extra props, no text, no labels, no logo, no watermark, no UI elements, no social media interface.

Character setup:
AQUI VAI O PROMPT DO PERSONAGEM.`;

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
  projectTitle,
  storyReferences,
  onStoryReferencesChange,
  onUpdatePrompt,
  onUpdateImage,
  onContinue,
  onBack,
  provider = 'gemini',
  onProviderChange,
  providerModel,
  onProviderModelChange,
  onOpenProject,
  onSaveProject,
  canSaveProject,
  isSavingProject,
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
  const isVideo = useCallback((url: string | undefined): boolean => {
    if (!url) return false;
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
    return videoExtensions.some(ext => url.toLowerCase().endsWith(ext));
  }, []);
  
  const [generatingSegments, setGeneratingSegments] = useState<Set<number>>(new Set());
  const [uploadingSegments, setUploadingSegments] = useState<Set<number>>(new Set());
  const [regeneratingAnimateFrameSegments, setRegeneratingAnimateFrameSegments] = useState<Set<number>>(new Set());
  const [batchRegeneratingAnimateFrame, setBatchRegeneratingAnimateFrame] = useState(false);
  const [vo3Progress, setVo3Progress] = useState<Record<number, string>>({});
  const [vo3Credits, setVo3Credits] = useState<number | null>(null);
  const [isCheckingCredits, setIsCheckingCredits] = useState<boolean>(false);
  // Mantido por compatibilidade com a assinatura IPC antiga; Flow2API ignora headless.
  const [showFlowBrowser, setShowFlowBrowser] = useState<boolean>(true);
  // Estado de disponibilidade do Flow2API local (online/offline).
  const [isFlowBrowserOpen, setIsFlowBrowserOpen] = useState<boolean>(false);
  const [isFlowBrowserStatusLoading, setIsFlowBrowserStatusLoading] = useState<boolean>(false);
  const [isFlowBrowserClosing, setIsFlowBrowserClosing] = useState<boolean>(false);
  const [isFlowBrowserCloseHover, setIsFlowBrowserCloseHover] = useState<boolean>(false);
  // Serviço de geração selecionado por segmento (padrão: usa assetType do segmento)
  const [selectedService, setSelectedService] = useState<Record<number, string>>({});
  // Dropdown aberto para qual segmento
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  // Quantidade de imagens a gerar por segmento (relevante para serviços de imagem)
  const [imageCount, setImageCount] = useState<Record<number, number>>({});
  // Fila de seleções pendentes quando o Flow gera múltiplas imagens
  const [pickerQueue, setPickerQueue] = useState<{ segmentId: number; httpUrls: string[]; generationService: string }[]>([]);
  const [pickerSelectedIdx, setPickerSelectedIdx] = useState<number>(0);

  const [finalImages, setFinalImages] = useState<Record<number, string>>({});
  const [carouselIndices, setCarouselIndices] = useState<Record<number, number>>({});

  // ── Ingredients (Veo 3.1, exceto modelos Lite) ──
  // 'frames' = usa Inicial/Final (padrão), 'ingredients' = usa imagens de referência (limite depende do serviço)
  const [ingredientMode, setIngredientMode] = useState<Record<number, 'frames' | 'ingredients'>>({});
  const [ingredientImages, setIngredientImages] = useState<Record<number, string[]>>({});

  // ── Character / Location References ──
  const [showCharactersModal, setShowCharactersModal] = useState(false);
  const [isExtractingReferences, setIsExtractingReferences] = useState(false);
  const [referencesError, setReferencesError] = useState<string | null>(null);
  const characterReferences = Array.isArray(storyReferences?.characters) ? storyReferences.characters : [];
  const locationReferences = Array.isArray(storyReferences?.locations) ? storyReferences.locations : [];
  const sortedCharacterReferences = useMemo(() => {
    return [...characterReferences]
      .filter(item => Number.isFinite(item.id) && item.id > 0)
      .sort((a, b) => a.id - b.id);
  }, [characterReferences]);
  const sortedLocationReferences = useMemo(() => {
    return [...locationReferences]
      .filter(item => Number.isFinite(item.id) && item.id > 0)
      .sort((a, b) => a.id - b.id);
  }, [locationReferences]);
  const characterStyle = String(storyReferences?.characterStyle || 'fotorrealista').trim() || 'fotorrealista';
  const locationStyle = String(storyReferences?.locationStyle || 'fotorrealista').trim() || 'fotorrealista';
  const [globalInstruction, setGlobalInstruction] = useState('');
  const [showGlobalInstructionInput, setShowGlobalInstructionInput] = useState(false);
  const [sceneInstructions, setSceneInstructions] = useState<Record<number, string>>({});
  const [pendingSceneId, setPendingSceneId] = useState<number | null>(null);
  const [hoverImagePreview, setHoverImagePreview] = useState<HoverImagePreviewState | null>(null);
  const [sceneReferencePicker, setSceneReferencePicker] = useState<SceneReferencePickerState | null>(null);
  const [isImportingFlowResult, setIsImportingFlowResult] = useState(false);
  const flowResultInputRef = useRef<HTMLInputElement | null>(null);
  const hoverPreviewTimerRef = useRef<number | null>(null);
  const hoverPreviewRequestKeyRef = useRef<string | null>(null);
  const segmentsRef = useRef<TranscriptionSegment[]>(segments);
  const [promptViewModes, setPromptViewModes] = useState<Record<string, PromptLanguageView>>({});
  const [translatingPromptFields, setTranslatingPromptFields] = useState<Record<string, boolean>>({});
  const promptTranslationTimeoutRef = useRef<Record<string, number>>({});
  const promptTranslationRequestVersionRef = useRef<Record<string, number>>({});
  const promptTranslationSourceSnapshotRef = useRef<Record<string, string>>({});
  const promptPairTranslationTimeoutRef = useRef<Record<string, number>>({});
  const promptPairTranslationRequestVersionRef = useRef<Record<string, number>>({});
  const promptPairTranslationSourceSnapshotRef = useRef<Record<string, Record<VideoFramePromptField, string>>>({});

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  const showHoverImagePreview = (
    event: React.MouseEvent<HTMLElement>,
    imageUrl?: string,
    label?: string
  ) => {
    if (!imageUrl) {
      hideHoverImagePreview();
      return;
    }
    const previewSrc = getMediaSrc(imageUrl);
    if (!previewSrc) {
      hideHoverImagePreview();
      return;
    }

    const previewWidth = Math.min(window.innerWidth * 0.56, 520);
    const previewHeight = Math.min(window.innerHeight * 0.72, 560);
    const offset = 8;
    const margin = 12;
    const targetRect = event.currentTarget.getBoundingClientRect();

    let left = targetRect.right + offset;
    if (left + previewWidth + margin > window.innerWidth) {
      left = targetRect.left - previewWidth - offset;
    }
    left = Math.max(margin, Math.min(left, window.innerWidth - previewWidth - margin));

    let top = targetRect.top;
    top = Math.max(margin, Math.min(top, window.innerHeight - previewHeight - margin));

    const requestKey = `${previewSrc}|${label || ''}|${Math.round(left)}|${Math.round(top)}`;
    hoverPreviewRequestKeyRef.current = requestKey;

    if (hoverPreviewTimerRef.current !== null) {
      window.clearTimeout(hoverPreviewTimerRef.current);
      hoverPreviewTimerRef.current = null;
    }

    hoverPreviewTimerRef.current = window.setTimeout(() => {
      if (hoverPreviewRequestKeyRef.current !== requestKey) return;
      setHoverImagePreview({
        src: previewSrc,
        label,
        x: left,
        y: top,
      });
      hoverPreviewTimerRef.current = null;
    }, 1000);
  };

  const hideHoverImagePreview = () => {
    hoverPreviewRequestKeyRef.current = null;
    if (hoverPreviewTimerRef.current !== null) {
      window.clearTimeout(hoverPreviewTimerRef.current);
      hoverPreviewTimerRef.current = null;
    }
    setHoverImagePreview(null);
  };

  useEffect(() => {
    return () => {
      if (hoverPreviewTimerRef.current !== null) {
        window.clearTimeout(hoverPreviewTimerRef.current);
        hoverPreviewTimerRef.current = null;
      }
    };
  }, []);

  const getPromptFieldKey = useCallback((segmentId: number, field: ScenePromptField): string => {
    return `${segmentId}:${field}`;
  }, []);

  const getPromptViewMode = useCallback((segmentId: number, field: ScenePromptField): PromptLanguageView => {
    const key = getPromptFieldKey(segmentId, field);
    return promptViewModes[key] || 'original';
  }, [getPromptFieldKey, promptViewModes]);

  const getStoredPromptFieldValue = useCallback((
    segment: TranscriptionSegment,
    field: ScenePromptField,
    viewMode: PromptLanguageView
  ): string => {
    if (viewMode === 'original') {
      if (field === 'imagePrompt') {
        return extractPromptString(segment.imagePrompt);
      }
      return String(segment[field] || '');
    }

    const translatedKey = PROMPT_FIELD_TO_TRANSLATED_KEY[field];
    const translatedValue = (segment as any)[translatedKey];
    if (translatedValue != null) return String(translatedValue);

    // Compatibilidade com projetos antigos que salvaram tradução em ...Original
    if (field === 'imagePrompt' && (segment as any).imagePromptOriginal != null) {
      return String((segment as any).imagePromptOriginal);
    }
    if (field === 'firstFrame' && (segment as any).firstFrameOriginal != null) {
      return String((segment as any).firstFrameOriginal);
    }
    if (field === 'animateFrame' && (segment as any).animateFrameOriginal != null) {
      return String((segment as any).animateFrameOriginal);
    }

    return '';
  }, []);

  const patchSegment = useCallback((segmentId: number, patch: Partial<TranscriptionSegment>) => {
    if (!onSegmentsUpdate) return;

    const nextSegments = segmentsRef.current.map(item =>
      item.id === segmentId
        ? { ...item, ...patch }
        : item
    );
    onSegmentsUpdate(nextSegments);
  }, [onSegmentsUpdate]);

  const clearScheduledPromptTranslation = useCallback((promptFieldKey: string) => {
    const timeoutId = promptTranslationTimeoutRef.current[promptFieldKey];
    if (typeof timeoutId === 'number') {
      window.clearTimeout(timeoutId);
      delete promptTranslationTimeoutRef.current[promptFieldKey];
    }
  }, []);

  const isVideoFramePromptField = useCallback((field: ScenePromptField): field is VideoFramePromptField => {
    return field === 'firstFrame' || field === 'animateFrame';
  }, []);

  const getVideoFramePairTranslationKey = useCallback((segmentId: number, sourceVariant: PromptLanguageView): string => {
    return `video-frame-pair:${segmentId}:${sourceVariant}`;
  }, []);

  const clearScheduledPromptPairTranslation = useCallback((pairKey: string) => {
    const timeoutId = promptPairTranslationTimeoutRef.current[pairKey];
    if (typeof timeoutId === 'number') {
      window.clearTimeout(timeoutId);
      delete promptPairTranslationTimeoutRef.current[pairKey];
    }
  }, []);

  const setPromptTranslating = useCallback((promptFieldKey: string, isTranslating: boolean) => {
    setTranslatingPromptFields(prev => {
      if (isTranslating) {
        if (prev[promptFieldKey]) return prev;
        return {
          ...prev,
          [promptFieldKey]: true,
        };
      }

      if (!prev[promptFieldKey]) return prev;
      const next = { ...prev };
      delete next[promptFieldKey];
      return next;
    });
  }, []);

  const setTranslatedPromptValue = useCallback((segmentId: number, field: ScenePromptField, value: string) => {
    const translatedKey = PROMPT_FIELD_TO_TRANSLATED_KEY[field];
    patchSegment(segmentId, { [translatedKey]: value } as Partial<TranscriptionSegment>);
  }, [patchSegment]);

  const setOriginalPromptValue = useCallback((segmentId: number, field: ScenePromptField, value: string) => {
    if (field === 'imagePrompt') {
      onUpdatePrompt(segmentId, value);
      return;
    }

    patchSegment(segmentId, { [field]: value } as Partial<TranscriptionSegment>);
  }, [onUpdatePrompt, patchSegment]);

  const getVideoFramePairSourceValues = useCallback((
    segmentId: number,
    sourceVariant: PromptLanguageView,
    overrides?: Partial<Record<VideoFramePromptField, string>>
  ): Record<VideoFramePromptField, string> | null => {
    const currentSegment = segmentsRef.current.find(item => item.id === segmentId);
    if (!currentSegment) return null;

    const nextFirstFrame = overrides?.firstFrame ?? getStoredPromptFieldValue(currentSegment, 'firstFrame', sourceVariant);
    const nextAnimateFrame = overrides?.animateFrame ?? getStoredPromptFieldValue(currentSegment, 'animateFrame', sourceVariant);

    return {
      firstFrame: nextFirstFrame,
      animateFrame: nextAnimateFrame,
    };
  }, [getStoredPromptFieldValue]);

  const setVideoFramePairTranslating = useCallback((segmentId: number, isTranslating: boolean) => {
    VIDEO_FRAME_PROMPT_FIELDS.forEach((videoField) => {
      const promptFieldKey = getPromptFieldKey(segmentId, videoField);
      setPromptTranslating(promptFieldKey, isTranslating);
    });
  }, [getPromptFieldKey, setPromptTranslating]);

  const setVideoFramePairPromptValue = useCallback((
    segmentId: number,
    targetVariant: PromptLanguageView,
    values: Partial<Record<VideoFramePromptField, string>>
  ) => {
    if (targetVariant === 'original') {
      const originalPatch: Partial<TranscriptionSegment> = {};
      if (typeof values.firstFrame === 'string') originalPatch.firstFrame = values.firstFrame;
      if (typeof values.animateFrame === 'string') originalPatch.animateFrame = values.animateFrame;
      if (Object.keys(originalPatch).length > 0) {
        patchSegment(segmentId, originalPatch);
      }
      return;
    }

    const translatedPatch: Partial<TranscriptionSegment> = {};
    if (typeof values.firstFrame === 'string') translatedPatch.firstFrameTraduzido = values.firstFrame;
    if (typeof values.animateFrame === 'string') translatedPatch.animateFrameTraduzido = values.animateFrame;
    if (Object.keys(translatedPatch).length > 0) {
      patchSegment(segmentId, translatedPatch);
    }
  }, [patchSegment]);

  const runVideoFramePairTranslation = useCallback(async (
    segmentId: number,
    sourceVariant: PromptLanguageView,
    sourceValues: Record<VideoFramePromptField, string>
  ) => {
    const pairKey = getVideoFramePairTranslationKey(segmentId, sourceVariant);
    const requestVersion = (promptPairTranslationRequestVersionRef.current[pairKey] || 0) + 1;
    promptPairTranslationRequestVersionRef.current[pairKey] = requestVersion;
    promptPairTranslationSourceSnapshotRef.current[pairKey] = { ...sourceValues };

    const targetVariant: PromptLanguageView = sourceVariant === 'translated' ? 'original' : 'translated';
    const hasAnySource = VIDEO_FRAME_PROMPT_FIELDS.some((videoField) => sourceValues[videoField].trim().length > 0);
    if (!hasAnySource) {
      setVideoFramePairPromptValue(segmentId, targetVariant, {
        firstFrame: '',
        animateFrame: '',
      });
      return;
    }

    setVideoFramePairTranslating(segmentId, true);
    try {
      const translate = window.electron?.videoProject?.translateScenePrompt;
      if (!translate) {
        throw new Error('translateScenePrompt API not available');
      }

      const result = await translate({
        sourceVariant,
        fields: {
          firstFrame: sourceValues.firstFrame,
          animateFrame: sourceValues.animateFrame,
        },
      });

      if (!result?.success || !result.translatedFields) {
        throw new Error(result?.error || 'Falha ao traduzir prompts de video_frame_animate');
      }

      if (promptPairTranslationRequestVersionRef.current[pairKey] !== requestVersion) {
        return;
      }

      const currentSegment = segmentsRef.current.find(item => item.id === segmentId);
      if (!currentSegment) return;

      const expectedSourceValues = promptPairTranslationSourceSnapshotRef.current[pairKey];
      if (!expectedSourceValues) return;

      const currentFirstSource = getStoredPromptFieldValue(currentSegment, 'firstFrame', sourceVariant);
      const currentAnimateSource = getStoredPromptFieldValue(currentSegment, 'animateFrame', sourceVariant);
      if (
        currentFirstSource !== expectedSourceValues.firstFrame
        || currentAnimateSource !== expectedSourceValues.animateFrame
      ) {
        return;
      }

      const translatedFirstFrame = typeof result.translatedFields.firstFrame === 'string'
        ? result.translatedFields.firstFrame
        : '';
      const translatedAnimateFrame = typeof result.translatedFields.animateFrame === 'string'
        ? result.translatedFields.animateFrame
        : '';

      const currentFirstTarget = getStoredPromptFieldValue(currentSegment, 'firstFrame', targetVariant);
      const currentAnimateTarget = getStoredPromptFieldValue(currentSegment, 'animateFrame', targetVariant);
      if (
        translatedFirstFrame === currentFirstTarget
        && translatedAnimateFrame === currentAnimateTarget
      ) {
        return;
      }

      setVideoFramePairPromptValue(segmentId, targetVariant, {
        firstFrame: translatedFirstFrame,
        animateFrame: translatedAnimateFrame,
      });
    } catch (error) {
      console.error('Erro ao traduzir prompts de video_frame_animate:', error);
    } finally {
      if (promptPairTranslationRequestVersionRef.current[pairKey] === requestVersion) {
        setVideoFramePairTranslating(segmentId, false);
      }
    }
  }, [
    getStoredPromptFieldValue,
    getVideoFramePairTranslationKey,
    setVideoFramePairPromptValue,
    setVideoFramePairTranslating,
  ]);

  const runPromptTranslation = useCallback(async (
    segmentId: number,
    field: ScenePromptField,
    sourceVariant: PromptLanguageView,
    sourceText: string
  ) => {
    const promptFieldKey = getPromptFieldKey(segmentId, field);
    const requestVersion = (promptTranslationRequestVersionRef.current[promptFieldKey] || 0) + 1;
    promptTranslationRequestVersionRef.current[promptFieldKey] = requestVersion;
    promptTranslationSourceSnapshotRef.current[promptFieldKey] = sourceText;

    const targetVariant: PromptLanguageView = sourceVariant === 'translated' ? 'original' : 'translated';
    const normalizedSource = sourceText.trim();
    if (!normalizedSource) {
      if (targetVariant === 'translated') {
        setTranslatedPromptValue(segmentId, field, '');
      } else {
        setOriginalPromptValue(segmentId, field, '');
      }
      return;
    }

    setPromptTranslating(promptFieldKey, true);
    try {
      const translate = window.electron?.videoProject?.translateScenePrompt;
      if (!translate) {
        throw new Error('translateScenePrompt API not available');
      }

      const result = await translate({
        text: sourceText,
        sourceVariant,
        field,
      });

      if (!result?.success || typeof result.translatedText !== 'string') {
        throw new Error(result?.error || 'Falha ao traduzir prompt');
      }

      if (promptTranslationRequestVersionRef.current[promptFieldKey] !== requestVersion) {
        return;
      }

      const currentSegment = segmentsRef.current.find(item => item.id === segmentId);
      if (!currentSegment) return;

      const currentSourceText = getStoredPromptFieldValue(currentSegment, field, sourceVariant);
      const expectedSourceText = promptTranslationSourceSnapshotRef.current[promptFieldKey];
      if (currentSourceText !== expectedSourceText) {
        return;
      }

      const translatedText = result.translatedText;
      const currentTargetText = getStoredPromptFieldValue(currentSegment, field, targetVariant);
      if (translatedText === currentTargetText) {
        return;
      }

      if (targetVariant === 'translated') {
        setTranslatedPromptValue(segmentId, field, translatedText);
      } else {
        setOriginalPromptValue(segmentId, field, translatedText);
      }
    } catch (error) {
      console.error('Erro ao traduzir campo da cena:', error);
    } finally {
      if (promptTranslationRequestVersionRef.current[promptFieldKey] === requestVersion) {
        setPromptTranslating(promptFieldKey, false);
      }
    }
  }, [
    getPromptFieldKey,
    getStoredPromptFieldValue,
    setOriginalPromptValue,
    setPromptTranslating,
    setTranslatedPromptValue,
  ]);

  const schedulePromptTranslation = useCallback((
    segmentId: number,
    field: ScenePromptField,
    sourceVariant: PromptLanguageView,
    sourceText: string
  ) => {
    const promptFieldKey = getPromptFieldKey(segmentId, field);
    clearScheduledPromptTranslation(promptFieldKey);
    setPromptTranslating(promptFieldKey, false);

    promptTranslationSourceSnapshotRef.current[promptFieldKey] = sourceText;

    if (!sourceText.trim()) {
      const targetVariant: PromptLanguageView = sourceVariant === 'translated' ? 'original' : 'translated';
      if (targetVariant === 'translated') {
        setTranslatedPromptValue(segmentId, field, '');
      } else {
        setOriginalPromptValue(segmentId, field, '');
      }
      return;
    }

    promptTranslationTimeoutRef.current[promptFieldKey] = window.setTimeout(() => {
      delete promptTranslationTimeoutRef.current[promptFieldKey];
      runPromptTranslation(segmentId, field, sourceVariant, sourceText).catch(() => {});
    }, TRANSLATION_DEBOUNCE_MS);
  }, [
    clearScheduledPromptTranslation,
    getPromptFieldKey,
    runPromptTranslation,
    setOriginalPromptValue,
    setPromptTranslating,
    setTranslatedPromptValue,
  ]);

  const scheduleVideoFramePairTranslation = useCallback((
    segmentId: number,
    sourceVariant: PromptLanguageView,
    sourceValues: Record<VideoFramePromptField, string>
  ) => {
    const pairKey = getVideoFramePairTranslationKey(segmentId, sourceVariant);
    clearScheduledPromptPairTranslation(pairKey);
    clearScheduledPromptTranslation(getPromptFieldKey(segmentId, 'firstFrame'));
    clearScheduledPromptTranslation(getPromptFieldKey(segmentId, 'animateFrame'));
    setVideoFramePairTranslating(segmentId, false);
    promptPairTranslationSourceSnapshotRef.current[pairKey] = { ...sourceValues };

    const targetVariant: PromptLanguageView = sourceVariant === 'translated' ? 'original' : 'translated';
    const hasAnySource = VIDEO_FRAME_PROMPT_FIELDS.some((videoField) => sourceValues[videoField].trim().length > 0);
    if (!hasAnySource) {
      setVideoFramePairPromptValue(segmentId, targetVariant, {
        firstFrame: '',
        animateFrame: '',
      });
      return;
    }

    promptPairTranslationTimeoutRef.current[pairKey] = window.setTimeout(() => {
      delete promptPairTranslationTimeoutRef.current[pairKey];
      runVideoFramePairTranslation(segmentId, sourceVariant, sourceValues).catch(() => {});
    }, TRANSLATION_DEBOUNCE_MS);
  }, [
    clearScheduledPromptPairTranslation,
    clearScheduledPromptTranslation,
    getPromptFieldKey,
    getVideoFramePairTranslationKey,
    runVideoFramePairTranslation,
    setVideoFramePairPromptValue,
    setVideoFramePairTranslating,
  ]);

  const handleScenePromptFieldChange = useCallback((
    segmentId: number,
    field: ScenePromptField,
    value: string
  ) => {
    const viewMode = getPromptViewMode(segmentId, field);
    if (isVideoFramePromptField(field)) {
      const sourceVariant: PromptLanguageView = viewMode === 'translated' ? 'translated' : 'original';
      if (sourceVariant === 'translated') {
        setTranslatedPromptValue(segmentId, field, value);
      } else {
        setOriginalPromptValue(segmentId, field, value);
      }

      const sourceValues = getVideoFramePairSourceValues(segmentId, sourceVariant, { [field]: value });
      if (!sourceValues) return;
      scheduleVideoFramePairTranslation(segmentId, sourceVariant, sourceValues);
      return;
    }

    if (viewMode === 'translated') {
      setTranslatedPromptValue(segmentId, field, value);
      schedulePromptTranslation(segmentId, field, 'translated', value);
      return;
    }

    setOriginalPromptValue(segmentId, field, value);
    schedulePromptTranslation(segmentId, field, 'original', value);
  }, [
    getVideoFramePairSourceValues,
    getPromptViewMode,
    isVideoFramePromptField,
    scheduleVideoFramePairTranslation,
    schedulePromptTranslation,
    setOriginalPromptValue,
    setTranslatedPromptValue,
  ]);

  const toggleScenePromptView = useCallback((segment: TranscriptionSegment, field: ScenePromptField) => {
    const promptFieldKey = getPromptFieldKey(segment.id, field);
    const firstFrameKey = getPromptFieldKey(segment.id, 'firstFrame');
    const animateFrameKey = getPromptFieldKey(segment.id, 'animateFrame');
    const currentMode = isVideoFramePromptField(field)
      ? (promptViewModes[firstFrameKey] || promptViewModes[animateFrameKey] || 'original')
      : (promptViewModes[promptFieldKey] || 'original');
    const nextMode: PromptLanguageView = currentMode === 'translated' ? 'original' : 'translated';

    if (isVideoFramePromptField(field)) {
      setPromptViewModes(prev => ({
        ...prev,
        [firstFrameKey]: nextMode,
        [animateFrameKey]: nextMode,
      }));

      const pairKey = getVideoFramePairTranslationKey(segment.id, currentMode);
      const sourceValues: Record<VideoFramePromptField, string> = {
        firstFrame: getStoredPromptFieldValue(segment, 'firstFrame', currentMode),
        animateFrame: getStoredPromptFieldValue(segment, 'animateFrame', currentMode),
      };
      const hasAnySource = VIDEO_FRAME_PROMPT_FIELDS.some((videoField) => sourceValues[videoField].trim().length > 0);
      if (!hasAnySource) return;

      const hasAllTargets = VIDEO_FRAME_PROMPT_FIELDS.every((videoField) => {
        const targetValue = getStoredPromptFieldValue(segment, videoField, nextMode);
        return targetValue.trim().length > 0;
      });
      if (hasAllTargets) return;

      clearScheduledPromptPairTranslation(pairKey);
      clearScheduledPromptTranslation(getPromptFieldKey(segment.id, 'firstFrame'));
      clearScheduledPromptTranslation(getPromptFieldKey(segment.id, 'animateFrame'));
      runVideoFramePairTranslation(segment.id, currentMode, sourceValues).catch(() => {});
      return;
    }

    setPromptViewModes(prev => ({
      ...prev,
      [promptFieldKey]: nextMode,
    }));

    const currentModeText = getStoredPromptFieldValue(segment, field, currentMode).trim();
    const nextModeText = getStoredPromptFieldValue(segment, field, nextMode).trim();
    if (!currentModeText || nextModeText) {
      return;
    }

    clearScheduledPromptTranslation(promptFieldKey);
    runPromptTranslation(segment.id, field, currentMode, currentModeText).catch(() => {});
  }, [
    clearScheduledPromptPairTranslation,
    clearScheduledPromptTranslation,
    getPromptFieldKey,
    getStoredPromptFieldValue,
    getVideoFramePairTranslationKey,
    isVideoFramePromptField,
    promptViewModes,
    runPromptTranslation,
    runVideoFramePairTranslation,
  ]);

  const toggleVideoFramePairPromptView = useCallback((segment: TranscriptionSegment) => {
    toggleScenePromptView(segment, 'firstFrame');
  }, [toggleScenePromptView]);

  useEffect(() => {
    return () => {
      Object.values(promptTranslationTimeoutRef.current).forEach(timeoutId => {
        window.clearTimeout(timeoutId);
      });
      promptTranslationTimeoutRef.current = {};
      Object.values(promptPairTranslationTimeoutRef.current).forEach(timeoutId => {
        window.clearTimeout(timeoutId);
      });
      promptPairTranslationTimeoutRef.current = {};
    };
  }, []);

  const setCharacterReferences = useCallback((next: React.SetStateAction<CharacterReferenceItem[]>) => {
    onStoryReferencesChange(prev => {
      const currentCharacters = Array.isArray(prev?.characters) ? prev.characters : [];
      const updatedCharacters = typeof next === 'function'
        ? (next as (value: CharacterReferenceItem[]) => CharacterReferenceItem[])(currentCharacters)
        : next;
      return {
        ...prev,
        characters: updatedCharacters,
      };
    });
  }, [onStoryReferencesChange]);

  const setLocationReferences = useCallback((next: React.SetStateAction<LocationReferenceItem[]>) => {
    onStoryReferencesChange(prev => {
      const currentLocations = Array.isArray(prev?.locations) ? prev.locations : [];
      const updatedLocations = typeof next === 'function'
        ? (next as (value: LocationReferenceItem[]) => LocationReferenceItem[])(currentLocations)
        : next;
      return {
        ...prev,
        locations: updatedLocations,
      };
    });
  }, [onStoryReferencesChange]);

  const setCharacterStyle = useCallback((next: string) => {
    onStoryReferencesChange(prev => ({
      ...prev,
      characterStyle: (next || 'fotorrealista').trim() || 'fotorrealista',
    }));
  }, [onStoryReferencesChange]);

  const setLocationStyle = useCallback((next: string) => {
    onStoryReferencesChange(prev => ({
      ...prev,
      locationStyle: (next || 'fotorrealista').trim() || 'fotorrealista',
    }));
  }, [onStoryReferencesChange]);

  const characterImages = useMemo<Record<number, string>>(() => {
    return characterReferences.reduce((acc, character) => {
      if (character.imageUrl) {
        acc[character.id] = character.imageUrl;
      }
      return acc;
    }, {} as Record<number, string>);
  }, [characterReferences]);

  const locationImages = useMemo<Record<number, string>>(() => {
    return locationReferences.reduce((acc, location) => {
      if (location.imageUrl) {
        acc[location.id] = location.imageUrl;
      }
      return acc;
    }, {} as Record<number, string>);
  }, [locationReferences]);

  const [storyReferenceImageProvider, setStoryReferenceImageProvider] = useState<StoryReferenceImageProvider>('flow-image-api');
  const [referenceUploading, setReferenceUploading] = useState<Set<string>>(new Set());
  const [referenceGenerating, setReferenceGenerating] = useState<Set<string>>(new Set());
  const [editingCharacterNameId, setEditingCharacterNameId] = useState<number | null>(null);
  const [characterNameDraft, setCharacterNameDraft] = useState('');
  const [editingLocationNameId, setEditingLocationNameId] = useState<number | null>(null);
  const [locationNameDraft, setLocationNameDraft] = useState('');

  const getStoryReferenceKey = useCallback((kind: StoryReferenceKind, id: number) => {
    return `${kind}:${id}`;
  }, []);

  const updateReferenceBusyState = useCallback((
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    key: string,
    isBusy: boolean
  ) => {
    setter(prev => {
      const next = new Set(prev);
      if (isBusy) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const isImageFile = useCallback((file: File | null | undefined): file is File => {
    if (!file) return false;
    return file.type.startsWith('image/');
  }, []);

  const alertInvalidImageFile = useCallback(() => {
    alert('Apenas arquivos de imagem são permitidos neste campo.');
  }, []);

  const hasGlobalInstruction = globalInstruction.trim().length > 0;
  const hasVideoStockWithoutUrl = segments.some(
    seg => seg.assetType === 'video_stock' && !seg.imageUrl
  );
  const hasImagePrompts = segments.some(s => !!s.imagePrompt);
  const hasFrameAnimatePrompts = segments.some(
    s => s.assetType === 'video_frame_animate' && (!!s.firstFrame || !!s.animateFrame)
  );
  const hasPrompts = hasImagePrompts || hasFrameAnimatePrompts;
  const providerModelOptions = useMemo<ToolbarSelectOption[]>(() => {
    if (provider === 'gemini') {
      return [
        { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite ($0.25 inputs / $1.50 outputs)' },
        { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash ($0.50 inputs / $3 outputs)' },
        { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro ($2 inputs / $12 outputs)' },
      ];
    }
    if (provider === 'gemini_scraping') {
      return [
        { value: 'gemini-web-auto', label: 'Gemini Web (usa modelo ativo da conta)' },
      ];
    }
    if (provider === 'openai') {
      return [
        { value: 'gpt-5.4-mini', label: 'GPT 5.4 Mini ($0.75 inputs / $4.50 outputs)' },
        { value: 'gpt-5.4', label: 'GPT 5.4 ($2.50 inputs / $15.00 outputs)' },
      ];
    }
    return [
      { value: 'deepseek-chat', label: 'DeepSeek Chat V3' },
      { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner R1' },
    ];
  }, [provider]);

  const handleCharacterImageUpload = async (charId: number, file: File) => {
    if (!isImageFile(file)) {
      alertInvalidImageFile();
      return;
    }

    const busyKey = getStoryReferenceKey('character', charId);
    updateReferenceBusyState(setReferenceUploading, busyKey, true);

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
    } finally {
      updateReferenceBusyState(setReferenceUploading, busyKey, false);
    }
  };

  const handleRemoveCharacterImage = (charId: number) => {
    setCharacterReferences(prev => prev.map(character =>
      character.id === charId ? { ...character, imageUrl: undefined } : character
    ));
  };

  const handleLocationImageUpload = async (locationId: number, file: File) => {
    if (!isImageFile(file)) {
      alertInvalidImageFile();
      return;
    }

    const busyKey = getStoryReferenceKey('location', locationId);
    updateReferenceBusyState(setReferenceUploading, busyKey, true);

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
    } finally {
      updateReferenceBusyState(setReferenceUploading, busyKey, false);
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

  const removeCharacterReference = (charId: number) => {
    const shouldRemove = window.confirm(`Excluir personagem #${charId}?`);
    if (!shouldRemove) return;

    const busyKey = getStoryReferenceKey('character', charId);
    updateReferenceBusyState(setReferenceUploading, busyKey, false);
    updateReferenceBusyState(setReferenceGenerating, busyKey, false);

    setCharacterReferences(prev =>
      prev
        .filter(item => item.id !== charId)
        .map(item => (item.reference_id === charId ? { ...item, reference_id: null } : item))
    );
  };

  const removeLocationReference = (locationId: number) => {
    const shouldRemove = window.confirm(`Excluir lugar #${locationId}?`);
    if (!shouldRemove) return;

    const busyKey = getStoryReferenceKey('location', locationId);
    updateReferenceBusyState(setReferenceUploading, busyKey, false);
    updateReferenceBusyState(setReferenceGenerating, busyKey, false);

    setLocationReferences(prev =>
      prev
        .filter(item => item.id !== locationId)
        .map(item => (item.reference_id === locationId ? { ...item, reference_id: null } : item))
    );
  };

  const startEditingCharacterName = (character: CharacterReferenceItem) => {
    const fallbackName = `Personagem ${character.id}`;
    setEditingCharacterNameId(character.id);
    setCharacterNameDraft(String(character.character || fallbackName));
  };

  const commitCharacterNameEdition = (characterId: number) => {
    const nextName = String(characterNameDraft || '').trim() || `Personagem ${characterId}`;
    setCharacterReferences(prev => prev.map(item =>
      item.id === characterId ? { ...item, character: nextName } : item
    ));
    setEditingCharacterNameId(current => (current === characterId ? null : current));
    setCharacterNameDraft('');
  };

  const cancelCharacterNameEdition = (characterId: number) => {
    setEditingCharacterNameId(current => (current === characterId ? null : current));
    setCharacterNameDraft('');
  };

  const startEditingLocationName = (location: LocationReferenceItem) => {
    const fallbackName = `Lugar ${location.id}`;
    setEditingLocationNameId(location.id);
    setLocationNameDraft(String(location.location || fallbackName));
  };

  const commitLocationNameEdition = (locationId: number) => {
    const nextName = String(locationNameDraft || '').trim() || `Lugar ${locationId}`;
    setLocationReferences(prev => prev.map(item =>
      item.id === locationId ? { ...item, location: nextName } : item
    ));
    setEditingLocationNameId(current => (current === locationId ? null : current));
    setLocationNameDraft('');
  };

  const cancelLocationNameEdition = (locationId: number) => {
    setEditingLocationNameId(current => (current === locationId ? null : current));
    setLocationNameDraft('');
  };

  useEffect(() => {
    if (editingCharacterNameId == null) return;
    const stillExists = characterReferences.some(item => item.id === editingCharacterNameId);
    if (!stillExists) {
      setEditingCharacterNameId(null);
      setCharacterNameDraft('');
    }
  }, [editingCharacterNameId, characterReferences]);

  useEffect(() => {
    if (editingLocationNameId == null) return;
    const stillExists = locationReferences.some(item => item.id === editingLocationNameId);
    if (!stillExists) {
      setEditingLocationNameId(null);
      setLocationNameDraft('');
    }
  }, [editingLocationNameId, locationReferences]);

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

  const handleGenerateStoryReferenceImage = async (
    kind: StoryReferenceKind,
    itemId: number,
    prompt: string,
    referenceId: number | null
  ) => {
    const normalizedPrompt = String(prompt || '').trim();
    if (!normalizedPrompt) {
      alert('Preencha o prompt em inglês antes de gerar.');
      return;
    }
    if (!window.electron?.videoProject?.generateFlowImage) {
      alert('A API de geração de imagem não está disponível.');
      return;
    }

    const busyKey = getStoryReferenceKey(kind, itemId);
    updateReferenceBusyState(setReferenceGenerating, busyKey, true);
    setReferencesError(null);

    try {
      const normalizedReferenceId = toPositiveInt(referenceId);
      const referenceImagePath = normalizedReferenceId
        ? (kind === 'character' ? characterImages[normalizedReferenceId] : locationImages[normalizedReferenceId])
        : undefined;

      if (normalizedReferenceId && !referenceImagePath) {
        throw new Error(`A referência #${normalizedReferenceId} ainda não possui imagem para ser usada no provider.`);
      }
      if (referenceImagePath?.startsWith('blob:')) {
        throw new Error('A imagem de referência precisa estar salva no projeto. Faça upload novamente da referência.');
      }

      const selectedImageModel = storyReferenceImageProvider === 'flow-image-pro'
        ? 'gemini-3-pro-image-preview'
        : storyReferenceImageProvider === 'flow-image-api'
          ? 'gemini-3.1-flash-image-preview'
          : undefined;
      const finalPrompt = kind === 'character'
        ? CHARACTER_REFERENCE_MODEL_PROMPT.replace('AQUI VAI O PROMPT DO PERSONAGEM.', normalizedPrompt)
        : normalizedPrompt;

      const result = await window.electron.videoProject.generateFlowImage({
        prompt: finalPrompt,
        count: 1,
        model: selectedImageModel,
        headless: !showFlowBrowser,
        ingredientImagePaths: referenceImagePath ? [referenceImagePath] : undefined,
      });

      if (!result?.success || !Array.isArray(result.httpUrls) || result.httpUrls.length === 0) {
        throw new Error(result?.error || 'Falha ao gerar imagem de referência.');
      }

      const generatedUrl = result.httpUrls[0];
      if (kind === 'character') {
        setCharacterReferences(prev => prev.map(item =>
          item.id === itemId ? { ...item, imageUrl: generatedUrl } : item
        ));
      } else {
        setLocationReferences(prev => prev.map(item =>
          item.id === itemId ? { ...item, imageUrl: generatedUrl } : item
        ));
      }
    } catch (error: any) {
      const message = error?.message || 'Falha ao gerar imagem.';
      console.error(`Error generating ${kind} image:`, error);
      setReferencesError(message);
      alert(message);
    } finally {
      updateReferenceBusyState(setReferenceGenerating, busyKey, false);
    }
  };

  const handleGenerateCharacterImage = async (character: CharacterReferenceItem) => {
    await handleGenerateStoryReferenceImage('character', character.id, character.prompt_en, character.reference_id);
  };

  const handleGenerateLocationImage = async (location: LocationReferenceItem) => {
    await handleGenerateStoryReferenceImage('location', location.id, location.prompt_en, location.reference_id);
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

  const isAiBusy = Boolean(isProcessing)
    || pendingSceneId !== null
    || generatingSegments.size > 0
    || uploadingSegments.size > 0
    || isExtractingReferences
    || referenceUploading.size > 0
    || referenceGenerating.size > 0;

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

  const getSegmentFirstFrameImagePath = (segment: TranscriptionSegment): string | undefined => {
    const isCurrentImageVideo = isVideo(segment.imageUrl);
    const preservedSourceImage = (segment.sourceImageUrl && !isVideo(segment.sourceImageUrl))
      ? segment.sourceImageUrl
      : undefined;
    return (segment.imageUrl && !isCurrentImageVideo)
      ? segment.imageUrl
      : preservedSourceImage;
  };

  const handleRegenerateAnimateFramePrompt = async (
    segment: TranscriptionSegment,
    options?: { silent?: boolean; userInstruction?: string }
  ): Promise<boolean> => {
    const silent = Boolean(options?.silent);
    const normalizedUserInstruction = String(options?.userInstruction || '').trim();
    if (!onSegmentsUpdate) return false;

    const regenerateAnimateFrame = window.electron?.videoProject?.regenerateAnimateFrame;
    if (!regenerateAnimateFrame) {
      if (!silent) {
        alert('API de regeneração do animateFrame não está disponível.');
      }
      return false;
    }

    const firstFrameImagePath = getSegmentFirstFrameImagePath(segment);

    if (!firstFrameImagePath) {
      if (!silent) {
        alert('Gere ou envie a imagem do firstFrame da cena antes de regenerar o animateFrame.');
      }
      return false;
    }

    const animateFrameFieldKey = getPromptFieldKey(segment.id, 'animateFrame');
    const pairKeyOriginal = getVideoFramePairTranslationKey(segment.id, 'original');
    const pairKeyTranslated = getVideoFramePairTranslationKey(segment.id, 'translated');
    clearScheduledPromptTranslation(animateFrameFieldKey);
    clearScheduledPromptPairTranslation(pairKeyOriginal);
    clearScheduledPromptPairTranslation(pairKeyTranslated);

    setRegeneratingAnimateFrameSegments(prev => {
      const next = new Set(prev);
      next.add(segment.id);
      return next;
    });

    try {
      const result = await regenerateAnimateFrame(
        {
          segment: {
            id: segment.id,
            assetType: segment.assetType,
            text: segment.text,
            sceneDescription: segment.sceneDescription,
            imagePrompt: segment.imagePrompt,
            firstFrame: segment.firstFrame,
            animateFrame: segment.animateFrame,
          },
          firstFrameImagePath,
          ...(normalizedUserInstruction ? { userInstruction: normalizedUserInstruction } : {}),
        },
        {
          provider,
          model: providerModel,
        }
      );

      const regeneratedAnimateFrame = typeof result?.animateFrame === 'string'
        ? result.animateFrame.trim()
        : '';

      if (!result?.success || !regeneratedAnimateFrame) {
        throw new Error(result?.error || 'A IA não retornou um animateFrame válido.');
      }

      patchSegment(segment.id, { animateFrame: regeneratedAnimateFrame });

      const translate = window.electron?.videoProject?.translateScenePrompt;
      if (translate) {
        try {
          const translationResult = await translate({
            sourceVariant: 'original',
            fields: {
              firstFrame: String(segment.firstFrame || ''),
              animateFrame: regeneratedAnimateFrame,
            },
          });

          if (translationResult?.success && translationResult.translatedFields) {
            const translatedPatch: Partial<TranscriptionSegment> = {};
            if (typeof translationResult.translatedFields.animateFrame === 'string') {
              translatedPatch.animateFrameTraduzido = translationResult.translatedFields.animateFrame;
            }
            if (Object.keys(translatedPatch).length > 0) {
              patchSegment(segment.id, translatedPatch);
            }
          }
        } catch (translationError) {
          console.error('Erro ao traduzir animateFrame regenerado:', translationError);
        }
      }
      return true;
    } catch (error: any) {
      console.error('Erro ao regenerar animateFrame:', error);
      if (!silent) {
        alert(`Falha ao regenerar animateFrame: ${error?.message || 'erro desconhecido'}`);
      }
      return false;
    } finally {
      setPromptTranslating(animateFrameFieldKey, false);
      setRegeneratingAnimateFrameSegments(prev => {
        const next = new Set(prev);
        next.delete(segment.id);
        return next;
      });
    }
  };

  const parseSceneReferenceIds = (raw: unknown): number[] => {
    const normalized = normalizeCharactersField(raw);
    if (!normalized) return [];

    return Array.from(new Set(
      normalized
        .split(',')
        .map(part => toPositiveInt(part))
        .filter((id): id is number => id !== null)
    ));
  };

  const serializeSceneReferenceIds = (ids: number[]): string | undefined => {
    const normalizedIds = Array.from(new Set(
      ids
        .map(id => toPositiveInt(id))
        .filter((id): id is number => id !== null)
    ));
    if (normalizedIds.length === 0) return undefined;
    return normalizedIds.join(', ');
  };

  const getSceneCharacterIds = (segment: TranscriptionSegment): number[] => {
    return parseSceneReferenceIds(segment.IdOfTheCharactersInTheScene);
  };

  const getSceneLocationIds = (segment: TranscriptionSegment): number[] => {
    return parseSceneReferenceIds(segment.IdOfTheLocationInTheScene);
  };

  useEffect(() => {
    if (!sceneReferencePicker) return;

    const segment = segments.find(item => item.id === sceneReferencePicker.segmentId);
    if (!segment) {
      setSceneReferencePicker(null);
      return;
    }

    if (sceneReferencePicker.kind === 'character') {
      const index = sceneReferencePicker.characterIndex;
      const ids = getSceneCharacterIds(segment);
      if (typeof index !== 'number' || index < 0 || index >= ids.length) {
        setSceneReferencePicker(null);
      }
    }
  }, [sceneReferencePicker, segments]);

  useEffect(() => {
    if (!sceneReferencePicker) return;

    const handlePointerDownOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-scene-reference-root="true"]')) return;
      setSceneReferencePicker(null);
    };

    window.addEventListener('mousedown', handlePointerDownOutside);
    return () => window.removeEventListener('mousedown', handlePointerDownOutside);
  }, [sceneReferencePicker]);

  const updateSceneCharacterIds = useCallback((segmentId: number, ids: number[]) => {
    if (!onSegmentsUpdate) return;

    const nextValue = serializeSceneReferenceIds(ids);
    const newSegments = segments.map(segment =>
      segment.id === segmentId
        ? { ...segment, IdOfTheCharactersInTheScene: nextValue }
        : segment
    );
    onSegmentsUpdate(newSegments);
  }, [onSegmentsUpdate, segments]);

  const updateSceneLocationId = useCallback((segmentId: number, nextLocationId: number | null) => {
    if (!onSegmentsUpdate) return;

    const nextValue = nextLocationId ? String(nextLocationId) : undefined;
    const newSegments = segments.map(segment =>
      segment.id === segmentId
        ? { ...segment, IdOfTheLocationInTheScene: nextValue }
        : segment
    );
    onSegmentsUpdate(newSegments);
  }, [onSegmentsUpdate, segments]);

  const addCharacterToScene = useCallback((segment: TranscriptionSegment, preferredId?: number) => {
    const currentIds = getSceneCharacterIds(segment);
    const availableIds = characterReferences
      .map(reference => reference.id)
      .filter(id => id > 0 && !currentIds.includes(id));

    const nextCharacterId = preferredId && availableIds.includes(preferredId)
      ? preferredId
      : availableIds[0];
    if (!nextCharacterId) return;

    updateSceneCharacterIds(segment.id, [...currentIds, nextCharacterId]);
  }, [characterReferences, updateSceneCharacterIds]);

  const replaceSceneCharacterAtIndex = useCallback((segment: TranscriptionSegment, index: number, nextCharacterId: number) => {
    const currentIds = getSceneCharacterIds(segment);
    if (index < 0 || index >= currentIds.length) return;
    const updatedIds = [...currentIds];
    updatedIds[index] = nextCharacterId;
    updateSceneCharacterIds(segment.id, updatedIds);
  }, [updateSceneCharacterIds]);

  const removeSceneCharacterAtIndex = useCallback((segment: TranscriptionSegment, index: number) => {
    const currentIds = getSceneCharacterIds(segment);
    if (index < 0 || index >= currentIds.length) return;
    const updatedIds = currentIds.filter((_, currentIndex) => currentIndex !== index);
    updateSceneCharacterIds(segment.id, updatedIds);
  }, [updateSceneCharacterIds]);

  const getSceneReferencePaths = (segment: TranscriptionSegment): string[] => {
    const characterIds = parseSceneReferenceIds(segment.IdOfTheCharactersInTheScene);
    const locationIds = parseSceneReferenceIds(segment.IdOfTheLocationInTheScene);

    const toNonEmptyPath = (value: string | undefined): value is string =>
      typeof value === 'string' && value.trim().length > 0;
    const characterReferencePaths = characterIds.map(id => characterImages[id]).filter(toNonEmptyPath);
    const locationReferencePaths = locationIds.map(id => locationImages[id]).filter(toNonEmptyPath);

    return Array.from(new Set([...characterReferencePaths, ...locationReferencePaths]));
  };

  const mergeReferencePathsWithPriority = (
    primaryPath: string | undefined,
    otherPaths: string[],
    limit?: number
  ): string[] => {
    const merged: string[] = [];
    const appendPath = (rawPath?: string) => {
      if (typeof rawPath !== 'string') return;
      const normalizedPath = rawPath.trim();
      if (!normalizedPath) return;
      if (merged.includes(normalizedPath)) return;
      merged.push(normalizedPath);
    };

    appendPath(primaryPath);
    otherPaths.forEach(path => appendPath(path));

    return typeof limit === 'number' ? merged.slice(0, limit) : merged;
  };

  const toSafeFileStem = (value: string): string => {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 80) || 'flow-job';
  };

  const downloadJsonFile = (payload: unknown, fileName: string): void => {
    const jsonContent = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  };

  const pickFlowModelByService = (
    service: FlowExportService,
    hasIngredients: boolean
  ): string => {
    if (service === 'flow-image') return 'Nano Banana 2';
    if (service === 'veo3-lite-flow') return 'Veo 3.1 - Lite';
    if (service === 'veo2-flow') return 'Veo 2 - Fast';
    if (service === 'veo3') return hasIngredients ? 'Veo 3.1 - Fast' : 'Veo 3.1 - Fast';
    return '';
  };

  const buildFlowPrompt = (segment: TranscriptionSegment, service: FlowExportService): string => {
    const normalizedFirstFrame = typeof segment.firstFrame === 'string'
      ? segment.firstFrame.trim()
      : '';
    const normalizedAnimateFrame = typeof segment.animateFrame === 'string'
      ? segment.animateFrame.trim()
      : '';
    const basePrompt = extractPromptString(segment.imagePrompt) || `Cinematic scene: ${segment.text}`;

    if (service === 'flow-image') {
      return normalizedFirstFrame || normalizedAnimateFrame || basePrompt;
    }

    return normalizedAnimateFrame || basePrompt;
  };

  const handleExportFlowExtensionJson = () => {
    const selectedSegments = segments.filter(segment => selectedScenes.has(segment.id));

    if (selectedSegments.length === 0) {
      alert('Selecione ao menos uma cena para exportar.');
      return;
    }

    const tasks: FlowExtensionExportTask[] = [];

    selectedSegments.forEach((segment, index) => {
      const effectiveService = getEffectiveService(segment);
      if (!FLOW_SERVICES.has(effectiveService)) return;

      const service = effectiveService as FlowExportService;
      const prompt = buildFlowPrompt(segment, service).trim();
      if (!prompt) return;

      const count = normalizeGenerationCount(imageCount[segment.id]);
      const mediaType: FlowExportMediaType = service === 'flow-image' ? 'image' : 'video';
      const hasCurrentVideo = isVideo(segment.imageUrl);
      const referenceImageUrl = segment.imageUrl && !hasCurrentVideo
        ? segment.imageUrl
        : segment.sourceImageUrl;
      const finalImageUrl = finalImages[segment.id];
      const explicitIngredientPaths = ingredientMode[segment.id] === 'ingredients'
        ? (ingredientImages[segment.id] || [])
        : [];
      const sceneReferencePaths = getSceneReferencePaths(segment);
      const ingredientImageUrls = Array.from(
        new Set([...explicitIngredientPaths, ...sceneReferencePaths])
      ).slice(0, getIngredientLimitByService(service));

      tasks.push({
        taskId: `seg-${segment.id}`,
        segmentId: segment.id,
        sceneIndex: index + 1,
        mediaType,
        service,
        model: pickFlowModelByService(service, ingredientImageUrls.length > 0),
        prompt,
        count,
        aspectRatio: aspectRatio || '9:16',
        referenceImageUrl: referenceImageUrl || undefined,
        finalImageUrl: finalImageUrl || undefined,
        ingredientImageUrls: ingredientImageUrls.length > 0 ? ingredientImageUrls : undefined,
        sceneText: segment.text,
        sceneDescription: segment.sceneDescription,
      });
    });

    if (tasks.length === 0) {
      alert('Nenhuma cena selecionada usa serviços Flow exportáveis (Veo/Flow Image).');
      return;
    }

    const payload: FlowExtensionExportPayload = {
      schemaVersion: FLOW_EXTENSION_JOB_SCHEMA,
      exportedAt: new Date().toISOString(),
      source: {
        app: 'my-nextron-app',
        module: 'video-studio.images-step',
        projectTitle: projectTitle?.trim() || undefined,
      },
      defaults: {
        aspectRatio: aspectRatio || '9:16',
        timeoutMsImage: 8 * 60 * 1000,
        timeoutMsVideo: 12 * 60 * 1000,
      },
      tasks,
    };

    const dateSuffix = new Date().toISOString().replace(/[:.]/g, '-');
    const safeProjectTitle = toSafeFileStem(projectTitle || 'video-project');
    const fileName = `${safeProjectTitle}-flow-job-${dateSuffix}.json`;
    downloadJsonFile(payload, fileName);
  };

  const normalizeMediaKind = (rawKind: unknown): 'image' | 'video' | undefined => {
    if (typeof rawKind !== 'string') return undefined;
    const normalized = rawKind.toLowerCase().trim();
    if (normalized === 'image') return 'image';
    if (normalized === 'video') return 'video';
    return undefined;
  };

  const normalizeGenerationService = (rawService: unknown): string | undefined => {
    if (typeof rawService !== 'string') return undefined;
    const normalized = rawService.trim();
    return normalized.length > 0 ? normalized : undefined;
  };

  const extractSegmentIdFromTaskId = (taskId: unknown): number | undefined => {
    if (typeof taskId !== 'string') return undefined;
    const match = taskId.match(/(\d+)/);
    if (!match) return undefined;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };

  const parseFlowImportItems = (payload: any): FlowExtensionImportItem[] => {
    const rawItems = Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.results)
        ? payload.results
        : [];

    return rawItems.map((item: any) => {
      const parsedSegmentId = Number(item?.segmentId);
      const segmentId = Number.isFinite(parsedSegmentId) && parsedSegmentId > 0
        ? parsedSegmentId
        : extractSegmentIdFromTaskId(item?.taskId);

      const mediaArray = Array.isArray(item?.media) ? item.media : [];
      const media: FlowExtensionImportMedia[] = mediaArray
        .map((mediaItem: any) => {
          const url = String(mediaItem?.url || mediaItem?.mediaUrl || '').trim();
          if (!url) return null;
          const durationRaw = Number(mediaItem?.durationSec);
          return {
            url,
            kind: normalizeMediaKind(mediaItem?.kind),
            durationSec: Number.isFinite(durationRaw) ? durationRaw : undefined,
          } as FlowExtensionImportMedia;
        })
        .filter((entry: FlowExtensionImportMedia | null): entry is FlowExtensionImportMedia => entry !== null);

      if (media.length === 0 && typeof item?.url === 'string' && item.url.trim()) {
        media.push({
          url: item.url.trim(),
          kind: normalizeMediaKind(item?.kind),
          durationSec: Number.isFinite(Number(item?.durationSec)) ? Number(item.durationSec) : undefined,
        });
      }

      return {
        taskId: typeof item?.taskId === 'string' ? item.taskId : undefined,
        segmentId,
        mediaType: normalizeMediaKind(item?.mediaType),
        service: normalizeGenerationService(item?.service ?? item?.generationService),
        status: typeof item?.status === 'string' ? item.status.toLowerCase() : undefined,
        selectedMediaUrl: typeof item?.selectedMediaUrl === 'string' ? item.selectedMediaUrl : undefined,
        media,
        error: typeof item?.error === 'string' ? item.error : undefined,
      } as FlowExtensionImportItem;
    });
  };

  const pickBestMediaCandidate = (item: FlowExtensionImportItem): FlowExtensionImportMedia | null => {
    if (!Array.isArray(item.media) || item.media.length === 0) return null;

    if (item.selectedMediaUrl) {
      const directMatch = item.media.find(media => media.url === item.selectedMediaUrl);
      if (directMatch) return directMatch;
    }

    if (item.mediaType === 'video') {
      const videoCandidate = item.media.find(media => media.kind === 'video');
      if (videoCandidate) return videoCandidate;
    }

    if (item.mediaType === 'image') {
      const imageCandidate = item.media.find(media => media.kind === 'image');
      if (imageCandidate) return imageCandidate;
    }

    return item.media[0] || null;
  };

  const guessExtensionFromMedia = (
    mediaUrl: string,
    contentType: string,
    mediaKind?: 'image' | 'video'
  ): string => {
    const normalizedType = contentType.toLowerCase();
    if (normalizedType.includes('video/mp4')) return '.mp4';
    if (normalizedType.includes('video/webm')) return '.webm';
    if (normalizedType.includes('video/quicktime')) return '.mov';
    if (normalizedType.includes('image/png')) return '.png';
    if (normalizedType.includes('image/webp')) return '.webp';
    if (normalizedType.includes('image/gif')) return '.gif';
    if (normalizedType.includes('image/jpeg')) return '.jpg';

    try {
      const parsed = new URL(mediaUrl);
      const pathname = parsed.pathname || '';
      const match = pathname.match(/\.(mp4|webm|mov|mkv|m4v|png|jpg|jpeg|webp|gif)$/i);
      if (match) {
        const ext = match[1].toLowerCase();
        return ext === 'jpeg' ? '.jpg' : `.${ext}`;
      }
    } catch {
      // ignore
    }

    if (mediaKind === 'video') return '.mp4';
    return '.jpg';
  };

  const tryPersistImportedMedia = async (
    segmentId: number,
    media: FlowExtensionImportMedia
  ): Promise<{ url: string; durationSec?: number } | null> => {
    if (!window.electron?.videoProject?.saveImage) return null;
    if (!/^https?:\/\//i.test(media.url)) return null;

    const response = await fetch(media.url);
    if (!response.ok) {
      throw new Error(`Falha no download (${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength < 200) {
      throw new Error('Arquivo retornado inválido ou vazio.');
    }

    const contentType = response.headers.get('content-type') || '';
    const extension = guessExtensionFromMedia(media.url, contentType, media.kind);
    const fileName = `flow-import-${segmentId}-${Date.now()}${extension}`;
    const saveResult = await window.electron.videoProject.saveImage(arrayBuffer, fileName, segmentId);

    if (saveResult?.success && typeof saveResult.httpUrl === 'string' && saveResult.httpUrl.trim()) {
      const durationSec = typeof saveResult.durationMs === 'number'
        ? Number((saveResult.durationMs / 1000).toFixed(2))
        : media.durationSec;
      return { url: saveResult.httpUrl, durationSec };
    }

    return null;
  };

  const handleImportFlowExtensionJson = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsImportingFlowResult(true);
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (parsed?.schemaVersion !== FLOW_EXTENSION_RESULT_SCHEMA) {
        throw new Error(`Schema inválido: esperado "${FLOW_EXTENSION_RESULT_SCHEMA}".`);
      }

      const items = parseFlowImportItems(parsed);
      if (items.length === 0) {
        throw new Error('Nenhum item válido encontrado no JSON de resultado.');
      }

      let importedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      const warnings: string[] = [];

      for (const item of items) {
        const segmentId = Number(item.segmentId);
        const hasSegment = Number.isFinite(segmentId) && segments.some(segment => segment.id === segmentId);

        if (!hasSegment) {
          skippedCount++;
          warnings.push(`Segmento não encontrado para task ${item.taskId || 'sem-id'}.`);
          continue;
        }

        if (item.status && item.status !== 'success') {
          skippedCount++;
          if (item.error) {
            warnings.push(`Cena ${segmentId}: ${item.error}`);
          }
          continue;
        }

        const candidate = pickBestMediaCandidate(item);
        if (!candidate?.url) {
          failedCount++;
          warnings.push(`Cena ${segmentId}: nenhuma mídia importável encontrada.`);
          continue;
        }

        let finalUrl = candidate.url;
        let durationSec = candidate.durationSec;

        try {
          const persisted = await tryPersistImportedMedia(segmentId, candidate);
          if (persisted?.url) {
            finalUrl = persisted.url;
            durationSec = persisted.durationSec;
          }
        } catch (persistError: any) {
          const reason = persistError?.message || 'erro ao salvar localmente';
          warnings.push(`Cena ${segmentId}: usando URL remota (${reason}).`);
        }

        onUpdateImage(segmentId, finalUrl, durationSec, item.service);
        importedCount++;
      }

      const summaryLines = [
        `Importação concluída.`,
        `Cenas atualizadas: ${importedCount}`,
        `Cenas ignoradas: ${skippedCount}`,
        `Falhas: ${failedCount}`,
      ];

      if (warnings.length > 0) {
        summaryLines.push('', `Avisos (${warnings.length}):`, ...warnings.slice(0, 8));
        if (warnings.length > 8) {
          summaryLines.push(`... e mais ${warnings.length - 8} aviso(s).`);
        }
      }

      alert(summaryLines.join('\n'));
    } catch (error: any) {
      console.error('Erro ao importar resultado do Flow:', error);
      alert(`Falha ao importar JSON do Flow: ${error?.message || 'erro desconhecido'}`);
    } finally {
      setIsImportingFlowResult(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  // ── Batch Processing (Processamento em lote) ──
  // Por padrão, todas as cenas estão selecionadas
  const [selectedScenes, setSelectedScenes] = useState<Set<number>>(() => new Set(segments.map(s => s.id)));
  const [sceneMediaChecks, setSceneMediaChecks] = useState<{ noMedia: boolean; image: boolean; video: boolean }>({
    noMedia: true,
    image: true,
    video: true,
  });
  const [includeManualGenerationService, setIncludeManualGenerationService] = useState<boolean>(true);
  const [sceneGenerationServiceChecks, setSceneGenerationServiceChecks] = useState<Record<string, boolean>>({});
  const [sceneDurationMinFilter, setSceneDurationMinFilter] = useState<number>(0);
  const [showBatchDropdown, setShowBatchDropdown] = useState(false);
  const [showBatchSettings, setShowBatchSettings] = useState(false);
  const [showSceneFilterDropdown, setShowSceneFilterDropdown] = useState(false);
  const lastClickedSceneRef = useRef<number | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; currentSceneId: number | null }>({
    current: 0, total: 0, currentSceneId: null,
  });
  const [batchResults, setBatchResults] = useState<Record<number, 'success' | 'error' | 'skipped'>>({});
  const [veo3ApiAutoRewriteRetries, setVeo3ApiAutoRewriteRetries] = useState<number>(VEO3_API_AUTO_REWRITE_MAX_RETRIES);
  const [currentErrorHighlightIndex, setCurrentErrorHighlightIndex] = useState(0);
  const batchCancelledRef = useRef(false);
  const batchAnimateFrameCancelledRef = useRef(false);
  const activeServicesRef = useRef<Record<number, string>>({});
  const generatingSegmentsRef = useRef<Set<number>>(new Set());
  const pendingProgressMessageRef = useRef<string | null>(null);
  const progressFlushTimerRef = useRef<any>(null);
  // const hasVo3Segments = useMemo(
  //   () => segments.some(s => s.assetType === 'video_vo3' || s.assetType === 'video_veo2' || s.assetType === 'image_static'),
  //   [segments]
  // );
  const maxSceneDurationSeconds = useMemo(() => {
    const maxDuration = segments.reduce((currentMax, segment) => {
      const segmentDuration = getSceneDurationInfo(segment).rawSeconds;
      return Math.max(currentMax, segmentDuration);
    }, 0);
    return Math.max(1, Math.ceil(maxDuration));
  }, [segments]);
  const [sceneDurationMaxFilter, setSceneDurationMaxFilter] = useState<number>(() => maxSceneDurationSeconds);
  const previousMaxSceneDurationRef = useRef<number>(maxSceneDurationSeconds);
  const generationServiceFilterOptions = useMemo(() => {
    const services = Array.from(
      new Set(
        segments
          .map(segment => (typeof segment.generationService === 'string' ? segment.generationService.trim() : ''))
          .filter((serviceId): serviceId is string => serviceId.length > 0)
      )
    ).sort((left, right) => left.localeCompare(right));

    return services.map(serviceId => ({
      value: serviceId,
      label: getGenerationServiceLabel(serviceId),
    }));
  }, [segments]);
  const segmentIdsSignature = useMemo(
    () => Array.from(new Set(segments.map(segment => segment.id))).sort((left, right) => left - right).join(','),
    [segments]
  );
  const [sceneFilterRevision, setSceneFilterRevision] = useState(0);
  const [filteredSceneIds, setFilteredSceneIds] = useState<number[]>(() =>
    segments.map(segment => segment.id)
  );
  const sceneFilterStateRef = useRef<{
    mediaChecks: { noMedia: boolean; image: boolean; video: boolean };
    includeManualService: boolean;
    generationServiceChecks: Record<string, boolean>;
    durationMin: number;
    durationMax: number;
  }>({
    mediaChecks: sceneMediaChecks,
    includeManualService: includeManualGenerationService,
    generationServiceChecks: sceneGenerationServiceChecks,
    durationMin: sceneDurationMinFilter,
    durationMax: sceneDurationMaxFilter,
  });

  useEffect(() => {
    sceneFilterStateRef.current = {
      mediaChecks: sceneMediaChecks,
      includeManualService: includeManualGenerationService,
      generationServiceChecks: sceneGenerationServiceChecks,
      durationMin: sceneDurationMinFilter,
      durationMax: sceneDurationMaxFilter,
    };
  }, [
    sceneMediaChecks,
    includeManualGenerationService,
    sceneGenerationServiceChecks,
    sceneDurationMinFilter,
    sceneDurationMaxFilter,
  ]);

  useEffect(() => {
    const {
      mediaChecks,
      includeManualService,
      generationServiceChecks,
      durationMin,
      durationMax,
    } = sceneFilterStateRef.current;

    const nextFilteredSceneIds = segmentsRef.current
      .filter(segment => {
        const hasMedia = Boolean(segment.imageUrl);
        const isVideoMedia = isVideo(segment.imageUrl);
        const sceneDurationSeconds = getSceneDurationInfo(segment).rawSeconds;
        const generationService = typeof segment.generationService === 'string'
          ? segment.generationService.trim()
          : '';

        if (sceneDurationSeconds < durationMin || sceneDurationSeconds > durationMax) {
          return false;
        }

        if (!hasMedia && !mediaChecks.noMedia) return false;
        if (hasMedia && !isVideoMedia && !mediaChecks.image) return false;
        if (hasMedia && isVideoMedia && !mediaChecks.video) return false;

        if (generationService.length === 0) {
          return includeManualService;
        }

        if (generationServiceChecks[generationService] === false) {
          return false;
        }

        return true;
      })
      .map(segment => segment.id);

    setFilteredSceneIds(previousIds => {
      if (
        previousIds.length === nextFilteredSceneIds.length
        && previousIds.every((sceneId, index) => sceneId === nextFilteredSceneIds[index])
      ) {
        return previousIds;
      }
      return nextFilteredSceneIds;
    });
  }, [
    sceneFilterRevision,
    segmentIdsSignature,
    isVideo,
  ]);
  const filteredSceneIdSet = useMemo(() => new Set(filteredSceneIds), [filteredSceneIds]);
  const filteredSegments = useMemo(() => {
    return segments.filter(segment => filteredSceneIdSet.has(segment.id));
  }, [
    segments,
    filteredSceneIdSet,
  ]);
  const selectedFilteredScenesCount = useMemo(
    () => filteredSceneIds.reduce((count, sceneId) => count + (selectedScenes.has(sceneId) ? 1 : 0), 0),
    [filteredSceneIds, selectedScenes]
  );
  const selectedBatchGenerationCount = useMemo<number | 'mixed'>(() => {
    const selectedSceneIds = Array.from(selectedScenes);
    if (selectedSceneIds.length === 0) return 1;

    const firstCount = normalizeGenerationCount(imageCount[selectedSceneIds[0]]);
    const hasMixedCounts = selectedSceneIds.some(sceneId =>
      normalizeGenerationCount(imageCount[sceneId]) !== firstCount
    );

    return hasMixedCounts ? 'mixed' : firstCount;
  }, [imageCount, selectedScenes]);
  const selectedBatchGenerationRangeValue = useMemo(() => {
    const firstSelectedSceneId = Array.from(selectedScenes)[0];
    return firstSelectedSceneId == null ? 1 : normalizeGenerationCount(imageCount[firstSelectedSceneId]);
  }, [imageCount, selectedScenes]);
  const applySelectedBatchGenerationCount = useCallback((value: unknown) => {
    const nextCount = normalizeGenerationCount(value);
    setImageCount(prev => {
      const next = { ...prev };
      Array.from(selectedScenes).forEach(id => {
        next[id] = nextCount;
      });
      return next;
    });
  }, [selectedScenes]);
  const hasFilteredScenes = filteredSceneIds.length > 0;
  const segmentsWithMediaCount = useMemo(
    () => segments.reduce((count, seg) => count + (seg.imageUrl ? 1 : 0), 0),
    [segments]
  );
  const filteredSegmentsWithMediaCount = useMemo(
    () => filteredSegments.reduce((count, seg) => count + (seg.imageUrl ? 1 : 0), 0),
    [filteredSegments]
  );
  const selectedFilteredVideoFrameAnimateCount = useMemo(
    () => filteredSegments.filter(seg => selectedScenes.has(seg.id) && seg.assetType === 'video_frame_animate').length,
    [filteredSegments, selectedScenes]
  );
  const hasActiveSceneFilters = useMemo(() => {
    const hasMediaFilter = !sceneMediaChecks.noMedia || !sceneMediaChecks.image || !sceneMediaChecks.video;
    const hasGenerationServiceFilter = !includeManualGenerationService
      || generationServiceFilterOptions.some(option => sceneGenerationServiceChecks[option.value] === false);

    return hasMediaFilter
      || hasGenerationServiceFilter
      || sceneDurationMinFilter > 0
      || sceneDurationMaxFilter < maxSceneDurationSeconds;
  }, [
    sceneMediaChecks,
    includeManualGenerationService,
    sceneGenerationServiceChecks,
    generationServiceFilterOptions,
    sceneDurationMinFilter,
    sceneDurationMaxFilter,
    maxSceneDurationSeconds,
  ]);
  const canContinue = hasPrompts || segmentsWithMediaCount > 0;
  const titlebarAnalyzeLabel = isAiBusy
    ? 'Gerando...'
    : hasPrompts
      ? (hasGlobalInstruction ? '✏️ Editar com IA' : '🔄 Regerar com IA')
      : '✨ Gerar Prompts com IA';
  const batchStats = useMemo(() => {
    const values = Object.values(batchResults);
    const success = values.filter(v => v === 'success').length;
    const error = values.filter(v => v === 'error').length;
    return { success, error };
  }, [batchResults]);
  const erroredBatchSegmentIds = useMemo(() => {
    return filteredSegments
      .filter(segment => batchResults[segment.id] === 'error')
      .map(segment => segment.id);
  }, [filteredSegments, batchResults]);
  const canSaveFromToolbar = Boolean(canSaveProject && onSaveProject);
  const hasAnalyzeAction = Boolean(onAnalyze);
  const hasOpenProjectAction = Boolean(onOpenProject);
  const hasProviderChangeAction = Boolean(onProviderChange);
  const hasProviderModelChangeAction = Boolean(onProviderModelChange);
  const toolbarBackRef = useRef<() => void>(() => {});
  const toolbarContinueRef = useRef<() => void>(() => {});
  const toolbarAnalyzeRef = useRef<(() => void | Promise<void>) | undefined>(undefined);
  const toolbarOpenProjectRef = useRef<(() => void) | undefined>(undefined);
  const toolbarSaveProjectRef = useRef<(() => void | Promise<void>) | undefined>(undefined);
  const toolbarProviderChangeRef = useRef<((nextProvider: AnalysisProvider) => void) | undefined>(undefined);
  const toolbarProviderModelChangeRef = useRef<((nextModel: string) => void) | undefined>(undefined);

  useEffect(() => {
    const previousMaxDuration = previousMaxSceneDurationRef.current;
    previousMaxSceneDurationRef.current = maxSceneDurationSeconds;

    setSceneDurationMinFilter(previousMin => Math.min(previousMin, maxSceneDurationSeconds));
    setSceneDurationMaxFilter(previousMax => {
      const wasAtPreviousMax = Math.abs(previousMax - previousMaxDuration) < 0.001;
      if (wasAtPreviousMax) return maxSceneDurationSeconds;
      return Math.min(previousMax, maxSceneDurationSeconds);
    });
  }, [maxSceneDurationSeconds]);

  useEffect(() => {
    setSceneGenerationServiceChecks(previousChecks => {
      const nextChecks: Record<string, boolean> = {};
      generationServiceFilterOptions.forEach(option => {
        nextChecks[option.value] = previousChecks[option.value] ?? true;
      });
      const previousKeys = Object.keys(previousChecks);
      const nextKeys = Object.keys(nextChecks);
      const unchanged = previousKeys.length === nextKeys.length
        && nextKeys.every(key => previousChecks[key] === nextChecks[key]);
      if (unchanged) return previousChecks;
      return nextChecks;
    });
  }, [generationServiceFilterOptions]);

  useEffect(() => {
    toolbarBackRef.current = onBack;
    toolbarContinueRef.current = onContinue;
    toolbarAnalyzeRef.current = onAnalyze ? handleAnalyzeWithOptionalInstruction : undefined;
    toolbarOpenProjectRef.current = onOpenProject;
    toolbarSaveProjectRef.current = onSaveProject;
    toolbarProviderChangeRef.current = onProviderChange;
    toolbarProviderModelChangeRef.current = onProviderModelChange;
  }, [
    handleAnalyzeWithOptionalInstruction,
    onAnalyze,
    onBack,
    onContinue,
    onOpenProject,
    onProviderChange,
    onProviderModelChange,
    onSaveProject,
  ]);

  const stableToolbarBack = useCallback(() => {
    toolbarBackRef.current();
  }, []);

  const stableToolbarContinue = useCallback(() => {
    toolbarContinueRef.current();
  }, []);

  const stableToolbarAnalyze = useCallback(() => {
    return toolbarAnalyzeRef.current?.();
  }, []);

  const stableToolbarOpenProject = useCallback(() => {
    toolbarOpenProjectRef.current?.();
  }, []);

  const stableToolbarSaveProject = useCallback(() => {
    return toolbarSaveProjectRef.current?.();
  }, []);

  const stableToolbarProviderChange = useCallback((nextProvider: AnalysisProvider) => {
    toolbarProviderChangeRef.current?.(nextProvider);
  }, []);

  const stableToolbarProviderModelChange = useCallback((nextModel: string) => {
    toolbarProviderModelChangeRef.current?.(nextModel);
  }, []);

  const stableToolbarOpenCharactersLocations = useCallback(() => {
    setShowCharactersModal(true);
  }, []);

  useEffect(() => {
    if (erroredBatchSegmentIds.length > 0 && currentErrorHighlightIndex >= erroredBatchSegmentIds.length) {
      setCurrentErrorHighlightIndex(0);
    }
  }, [erroredBatchSegmentIds.length, currentErrorHighlightIndex]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('video-studio:images-toolbar', {
        detail: {
          provider,
          onProviderChange: hasProviderChangeAction ? stableToolbarProviderChange : undefined,
          providerModel: providerModel || '',
          onProviderModelChange: hasProviderModelChangeAction ? stableToolbarProviderModelChange : undefined,
          providerModelOptions,
          onOpenProject: hasOpenProjectAction ? stableToolbarOpenProject : undefined,
          onSaveProject: canSaveFromToolbar ? stableToolbarSaveProject : undefined,
          canSaveProject: canSaveFromToolbar,
          isSavingProject: Boolean(isSavingProject),
          onBack: stableToolbarBack,
          onAnalyze: hasAnalyzeAction ? stableToolbarAnalyze : undefined,
          hasPrompts,
          isAiBusy,
          analyzeLabel: titlebarAnalyzeLabel,
          onOpenCharactersLocations: stableToolbarOpenCharactersLocations,
          onContinue: stableToolbarContinue,
          canContinue,
        },
      })
    );
  }, [
    canContinue,
    canSaveFromToolbar,
    hasAnalyzeAction,
    hasOpenProjectAction,
    hasProviderChangeAction,
    hasProviderModelChangeAction,
    hasPrompts,
    isAiBusy,
    isSavingProject,
    provider,
    providerModel,
    providerModelOptions,
    stableToolbarAnalyze,
    stableToolbarBack,
    stableToolbarContinue,
    stableToolbarOpenCharactersLocations,
    stableToolbarOpenProject,
    stableToolbarProviderChange,
    stableToolbarProviderModelChange,
    stableToolbarSaveProject,
    titlebarAnalyzeLabel,
  ]);

  useEffect(() => {
    return () => {
      window.dispatchEvent(
        new CustomEvent('video-studio:images-toolbar', {
          detail: null,
        })
      );
    };
  }, []);

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

  const refreshFlowBrowserStatus = useCallback(async (showLoading: boolean = false) => {
    if (!window.electron?.videoProject?.getFlowBrowserStatus) return;
    if (showLoading) setIsFlowBrowserStatusLoading(true);
    try {
      const result = await window.electron.videoProject.getFlowBrowserStatus();
      if (result?.success) {
        setIsFlowBrowserOpen(result.isOpen === true);
      }
    } catch (error) {
      console.error('Erro ao consultar status do Flow2API:', error);
    } finally {
      if (showLoading) setIsFlowBrowserStatusLoading(false);
    }
  }, []);

  const handleCloseFlowBrowser = useCallback(async () => {
    if (!isFlowBrowserOpen || isFlowBrowserClosing) return;
    if (!window.electron?.videoProject?.closeFlowBrowser) return;

    setIsFlowBrowserClosing(true);
    try {
      const result = await window.electron.videoProject.closeFlowBrowser();
      if (result?.success) {
        setIsFlowBrowserOpen(result.isOpen === true);
      } else {
        console.error('Falha ao processar fechamento do Flow2API:', result?.error || 'erro desconhecido');
      }
    } catch (error) {
      console.error('Erro ao processar fechamento do Flow2API:', error);
    } finally {
      setIsFlowBrowserClosing(false);
      setIsFlowBrowserCloseHover(false);
      refreshFlowBrowserStatus(false);
    }
  }, [isFlowBrowserClosing, isFlowBrowserOpen, refreshFlowBrowserStatus]);

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

  // Listener de progresso Veo2 Flow (via Flow2API)
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

  // Listener de progresso de imagem (Flow2API / Gemini Image API)
  useEffect(() => {
    const cleanup = window.electron?.videoProject?.onFlowImageProgress?.((data) => {
      queueProgressUpdate(data?.message || 'Gerando imagem...');
    });
    return () => { cleanup?.(); };
  }, [queueProgressUpdate]);

  // Listener de progresso de imagem via Vertex Studio
  useEffect(() => {
    const cleanup = window.electron?.videoProject?.onVertexImageProgress?.((data) => {
      const worker = typeof data?.workerId === 'number' ? ` (Worker ${data.workerId})` : '';
      queueProgressUpdate((data?.message || 'Gerando imagem com Vertex...') + worker);
    });
    return () => { cleanup?.(); };
  }, [queueProgressUpdate]);

  // Atualiza status do Flow2API local (online/offline)
  useEffect(() => {
    refreshFlowBrowserStatus(true);
    const intervalId = window.setInterval(() => {
      refreshFlowBrowserStatus(false);
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshFlowBrowserStatus]);

  // Handler para upload de mídia (imagem ou vídeo) - salva no disco
  const handleMediaUpload = async (segmentId: number, file: File) => {
    setUploadingSegments(prev => new Set([...prev, segmentId]));
    
    try {
      // Verificar se a API está disponível
      if (!window.electron?.videoProject?.saveImage) {
        console.error('saveImage API not available');
        // Fallback: usar blob URL (não funcionará na renderização)
        const mediaUrl = URL.createObjectURL(file);
        onUpdateImage(segmentId, mediaUrl, undefined, null);
      } else {
        // Converter File para ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Salvar no backend e obter caminho + URL HTTP
        const result = await window.electron.videoProject.saveImage(arrayBuffer, file.name, segmentId);
        
        if (result.success && result.httpUrl) {
          // Usar a URL HTTP para preview E renderização
          // O servidor HTTP estará rodando durante ambos
          const duration = result.durationMs ? Number((result.durationMs / 1000).toFixed(2)) : undefined;
          onUpdateImage(segmentId, result.httpUrl, duration, null);
          console.log(`✅ Media saved for segment ${segmentId}:`, result.httpUrl);
        } else {
          console.error('Failed to save media:', result.error);
          // Fallback: usar blob URL
          const mediaUrl = URL.createObjectURL(file);
          onUpdateImage(segmentId, mediaUrl, undefined, null);
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

  // Upload de imagem de ingrediente (limite depende do serviço)
  const handleIngredientUpload = async (segmentId: number, file: File) => {
    const segment = segments.find(item => item.id === segmentId);
    const serviceId = segment ? getEffectiveService(segment) : 'veo3';
    const referenceLimit = getIngredientLimitByService(serviceId);
    const current = ingredientImages[segmentId] || [];
    const sceneReferencePaths = segment ? getSceneReferencePaths(segment) : [];
    const currentReferenceCount = Array.from(new Set([...current, ...sceneReferencePaths])).length;
    if (currentReferenceCount >= referenceLimit) {
      alert(`Limite de ${referenceLimit} referências atingido para este serviço.`);
      return;
    }

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

  // Serviços disponíveis para geração
  const GENERATION_SERVICES = [
    { id: 'veo3',           label: 'Veo 3.1 (Flow2API)',     icon: '🌊', description: 'Google Veo 3.1 via Flow2API local' },
    { id: 'veo3-lite-flow', label: 'Veo 3.1 - Lite (Flow2API)', icon: '🌊', description: 'Google Veo 3.1 - Lite via Flow2API local' },
    { id: 'veo3-api',       label: 'Veo 3.1 (API)',    icon: '🚀', description: 'Google Veo 3.1 via API Oficial' },
    { id: 'veo3-fast-api',  label: 'Veo 3.1 Fast',     icon: '⚡', description: 'Google Veo 3.1 Fast via API Oficial' },
    { id: 'veo3-lite-api',  label: 'Veo 3.1 Lite (API)', icon: '💭', description: 'Google Veo 3.1 Lite via API Oficial' },
    { id: 'grok',           label: 'Grok',             icon: '✖️', description: 'Geração de vídeo com Grok' },
    // { id: 'veo2-flow',      label: 'Veo 2 (Flow2API)',     icon: '🌊', description: 'Video via Flow2API local' },
    { id: 'flow-image',     label: 'Imagem (Flow2API)',      icon: '🖼️', description: 'Imagem via Flow2API local' },
    { id: 'vertex-image',   label: 'Imagem (Vertex)',    icon: '🧩', description: 'Vertex Studio com pool de abas' },
    { id: 'flow-image-api', label: '🍌 Nano Banana 2',   icon: '🖼️', description: 'gemini-3.1-flash-image-preview' },
    { id: 'flow-image-pro', label: '🍌 Nano Banana Pro', icon: '🖼️', description: 'gemini-3-pro-image-preview' },
    { id: 'veo2',           label: 'Veo 2 (API)',      icon: '🌊', description: 'Google Veo 2 via API oficial' },
  ];

  const IMAGE_SERVICES = IMAGE_SERVICE_IDS;
  const IMAGE_API_SERVICES = new Set(['flow-image-api', 'flow-image-pro']);
  const FLOW_SERVICES = new Set(['veo3', 'veo3-lite-flow', 'veo2-flow', 'flow-image']);
  const getImageModelByService = (serviceId: string): string =>
    serviceId === 'flow-image-pro'
      ? 'gemini-3-pro-image-preview'
      : 'gemini-3.1-flash-image-preview';
  const supportsIngredientsForService = (serviceId: string): boolean =>
    serviceId === 'veo3'
    || IMAGE_SERVICE_IDS.has(serviceId)
    || serviceId === 'veo3-api'
    || serviceId === 'veo3-fast-api';

  // Obtém o serviço efetivo a usar para um segmento
  const getEffectiveService = (segment: TranscriptionSegment): string => {
    // Se o usuário escolheu explicitamente um serviço, respeitar
    if (selectedService[segment.id]) return selectedService[segment.id];
    if (typeof segment.generationService === 'string' && segment.generationService.trim().length > 0) {
      return segment.generationService.trim();
    }
    // Se modo Ingredients está ativo (e não trocou serviço), forçar veo3
    if (ingredientMode[segment.id] === 'ingredients') return 'veo3';
    if (segment.assetType === 'video_vo3') return 'veo3';
    // return 'veo2-flow'; // Veo 2 não está mais disponível no submenu do Flow
    return 'veo3'; // padrão
  };

  const flowExportableCount = useMemo(() => {
    return segments
      .filter(segment => selectedScenes.has(segment.id))
      .filter(segment => FLOW_SERVICES.has(getEffectiveService(segment)))
      .length;
  }, [segments, selectedScenes, selectedService, ingredientMode]);

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
      const sceneDurationInfo = getSceneDurationInfo(segment);

      const targetGenerationPrompt = IMAGE_SERVICES.has(service)
        ? (normalizedFirstFrame || normalizedAnimateFrame || basePrompt)
        : (normalizedAnimateFrame || basePrompt);

      // ── VEO 2 FLOW (Flow2API local) ──
      if (service === 'veo2-flow') {
        const count = normalizeGenerationCount(imageCount[segmentId]);
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
          headless: !showFlowBrowser,
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
          onUpdateImage(segmentId, result.httpUrl || result.videoPath, duration, service);
          success = true;
        } else {
          console.error(`❌ [Veo2Flow] Falha:`, result?.error);
          if (!silent) alert(`Falha na geração Veo 2 Flow: ${result?.error}`);
        }

      // ── VEO 3 (Flow2API local) ──
      } else if (service === 'veo3' || service === 'veo3-lite-flow') {
        const count = normalizeGenerationCount(imageCount[segmentId]);
        if (vo3Credits !== null && vo3Credits < 20) {
          if (!silent) alert(`Créditos insuficientes! Você tem ${vo3Credits} créditos e precisa de pelo menos 20 para gerar um vídeo no Flow.`);
          setGeneratingSegments(prev => { const next = new Set(prev); next.delete(segmentId); return next; });
          return false;
        }

        const isLiteFlow = service === 'veo3-lite-flow';
        const flowModelName = isLiteFlow ? 'Veo 3.1 - Lite' : undefined;
        const flowServiceLabel = isLiteFlow ? 'Veo 3.1 - Lite' : 'Veo 3';

        // Para vídeo, Ingredients é usado no modo explícito ou automaticamente quando não há frame inicial.
        const isIngredientsExplicit = ingredientMode[segmentId] === 'ingredients';
        const shouldAutoUseIngredients = !isLiteFlow && !referenceImagePath;
        const shouldCollectIngredients = isIngredientsExplicit || shouldAutoUseIngredients;
        const sceneReferencePaths = shouldCollectIngredients ? getSceneReferencePaths(segment) : [];
        const baseIngredientPaths = shouldCollectIngredients ? (ingredientImages[segmentId] || []) : [];
        const ingredientPaths = !isLiteFlow && shouldCollectIngredients
          ? mergeReferencePathsWithPriority(
            referenceImagePath,
            [...baseIngredientPaths, ...sceneReferencePaths],
            getIngredientLimitByService(service)
          )
          : [];
        const isIngredients = !isLiteFlow && (
          isIngredientsExplicit
          || (shouldAutoUseIngredients && ingredientPaths.length > 0)
        );

        if (isLiteFlow && isIngredientsExplicit) {
          setVo3Progress(prev => ({ ...prev, [segmentId]: 'Veo 3.1 - Lite não suporta Ingredients. Usando Frames...' }));
        }

        if (isIngredients && ingredientPaths.length === 0) {
          if (!silent) alert('Nenhuma imagem de ingrediente, personagem ou lugar disponível para gerar.');
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
          headless: !showFlowBrowser,
          count,
          referenceImagePath: isIngredients ? undefined : referenceImagePath,
          finalImagePath: isIngredients ? undefined : finalImagePath,
          ingredientImagePaths: isIngredients ? ingredientPaths : undefined,
          model: isIngredients ? 'Veo 3.1 - Fast' : flowModelName,
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout: geração Veo 3 excedeu 12 minutos. Verifique se o Flow2API está rodando em http://localhost:8000/.')), veo3TimeoutMs)
        );
        const result = await Promise.race([veo3Promise, timeoutPromise]) as any;

        if (result?.success && (result.httpUrl || result.videoPath)) {
          const duration = result.durationMs ? Number((result.durationMs / 1000).toFixed(2)) : undefined;
          onUpdateImage(segmentId, result.httpUrl || result.videoPath, duration, service);
          if (result.credits !== undefined) setVo3Credits(result.credits);
          success = true;
        } else {
          console.error(`❌ [Veo3] Falha:`, result?.error);
          if (!silent) alert(`Falha na geração ${flowServiceLabel}: ${result?.error}`);
        }

      // ── GROK (Vídeo via Grok) ──
      } else if (service === 'grok') {
        const grokDurationSeconds = pickNearestAllowedDuration(
          sceneDurationInfo.roundedSeconds,
          GROK_ALLOWED_SECONDS
        );
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
        const sceneReferencePaths = getSceneReferencePaths(segment);
        const baseIngredientPaths = ingredientImages[segmentId] || [];
        const grokImagePaths = mergeReferencePathsWithPriority(
          referenceImagePath,
          [...baseIngredientPaths, ...sceneReferencePaths]
        );

        if (grokImagePaths.length > 0) {
          setVo3Progress(prev => ({ ...prev, [segmentId]: `Gerando com Grok (${grokImagePaths.length} ref(s), ${grokDurationSeconds}s)...` }));
        } else {
          setVo3Progress(prev => ({ ...prev, [segmentId]: `Iniciando geração Grok (${grokDurationSeconds}s)...` }));
        }

        const grokTimeoutMs = 12 * 60 * 1000;
        const grokPromise = window.electron?.videoProject?.generateGrokVideo?.({
          prompt: targetGenerationPrompt,
          referenceImagePaths: grokImagePaths.length > 0 ? grokImagePaths : undefined,
          durationSeconds: grokDurationSeconds,
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout: geração Grok excedeu 12 minutos.')), grokTimeoutMs)
        );
        const result = await Promise.race([grokPromise, timeoutPromise]) as any;

        if (result?.success && (result.httpUrl || result.videoPath)) {
          const duration = result.durationMs ? Number((result.durationMs / 1000).toFixed(2)) : undefined;
          onUpdateImage(segmentId, result.httpUrl || result.videoPath, duration, service);
          success = true;
        } else {
          console.error(`❌ [Grok] Falha:`, result?.error);
          if (!silent) alert(`Falha na geração Grok: ${result?.error}`);
        }

      // ── IMAGE (Flow2API) ──
      } else if (service === 'flow-image') {
        console.log(`🖼️ [FlowImg] Gerando imagem para segmento ${segmentId}...`);
        const count = normalizeGenerationCount(imageCount[segmentId]);

        // Verificar modo Ingredients e referências de personagem/lugar
        const isIngredientsExplicit = ingredientMode[segmentId] === 'ingredients';
        const sceneReferencePaths = getSceneReferencePaths(segment);
        
        const isIngredients = isIngredientsExplicit || sceneReferencePaths.length > 0;
        const baseIngredientPaths = isIngredientsExplicit ? (ingredientImages[segmentId] || []) : [];
        
        const ingredientPaths = Array.from(new Set([...baseIngredientPaths, ...sceneReferencePaths])).slice(0, getIngredientLimitByService(service));

        if (isIngredients && ingredientPaths.length === 0) {
          if (!silent) alert('Nenhuma imagem de ingrediente, personagem ou lugar disponível para gerar.');
          setGeneratingSegments(prev => { const next = new Set(prev); next.delete(segmentId); return next; });
          return false;
        }

        setVo3Progress(prev => ({ ...prev, [segmentId]: `Gerando ${count} imagem(ns) com Flow2API${ingredientPaths.length > 0 ? ` e ${ingredientPaths.length} ref(s)` : ''}...` }));

        const result = await window.electron?.videoProject?.generateFlowImage({
          prompt: targetGenerationPrompt,
          count,
          aspectRatio,
          headless: !showFlowBrowser,
          ingredientImagePaths: ingredientPaths.length > 0 ? ingredientPaths : undefined,
        });

        if (result?.success && result.httpUrls?.length > 0) {
          const duration = result.durationMs ? Number((result.durationMs / 1000).toFixed(2)) : undefined;
          // Usar a primeira imagem imediatamente
          onUpdateImage(segmentId, result.httpUrls[0], duration, service);
          // Se há múltiplas opções, empilhar na fila para o usuário escolher depois
          if (count > 1 && result.httpUrls.length > 1) {
            setPickerQueue(prev => [...prev, { segmentId, httpUrls: result.httpUrls, generationService: service }]);
          }
          success = true;
        } else {
          console.error(`❌ [FlowImg] Falha:`, result?.error);
          if (!silent) alert(`Falha na geração de imagem via Flow2API: ${result?.error}`);
        }

      // ── IMAGE (Vertex Studio) ──
      } else if (service === 'vertex-image') {
        console.log(`🧩 [VertexImg] Gerando imagem para segmento ${segmentId}...`);
        const count = normalizeGenerationCount(imageCount[segmentId]);

        const isIngredientsExplicit = ingredientMode[segmentId] === 'ingredients';
        const sceneReferencePaths = getSceneReferencePaths(segment);
        const isIngredients = isIngredientsExplicit || sceneReferencePaths.length > 0;
        const baseIngredientPaths = isIngredientsExplicit ? (ingredientImages[segmentId] || []) : [];
        const ingredientPaths = Array.from(new Set([...baseIngredientPaths, ...sceneReferencePaths])).slice(0, getIngredientLimitByService(service));

        if (isIngredients && ingredientPaths.length === 0) {
          if (!silent) alert('Nenhuma imagem de ingrediente, personagem ou lugar disponível para gerar.');
          setGeneratingSegments(prev => { const next = new Set(prev); next.delete(segmentId); return next; });
          return false;
        }

        setVo3Progress(prev => ({
          ...prev,
          [segmentId]: `Gerando ${count} imagem(ns) com Vertex${ingredientPaths.length > 0 ? ` e ${ingredientPaths.length} ref(s)` : ''}...`
        }));

        const result = await window.electron?.videoProject?.generateVertexImage?.({
          prompt: targetGenerationPrompt,
          count,
          model: 'gemini-3.1-flash-image-preview',
          aspectRatio,
          poolSize: 4,
          ingredientImagePaths: ingredientPaths.length > 0 ? ingredientPaths : undefined,
        });

        if (result?.success && result.httpUrls?.length > 0) {
          const duration = result.durationMs ? Number((result.durationMs / 1000).toFixed(2)) : undefined;
          onUpdateImage(segmentId, result.httpUrls[0], duration, service);
          if (count > 1 && result.httpUrls.length > 1) {
            setPickerQueue(prev => [...prev, { segmentId, httpUrls: result.httpUrls, generationService: service }]);
          }
          success = true;
        } else {
          console.error(`❌ [VertexImg] Falha:`, result?.error);
          if (!silent) alert(`Falha na geração de imagem via Vertex: ${result?.error}`);
        }

      // ── IMAGE API (Nano Banana 2 / Pro) ──
      } else if (IMAGE_API_SERVICES.has(service)) {
        const imageModel = getImageModelByService(service);
        const imageModelLabel = service === 'flow-image-pro' ? 'Nano Banana Pro' : 'Nano Banana 2';
        console.log(`🖼️ [ImageAPI] Gerando imagem para segmento ${segmentId} com ${imageModelLabel}...`);
        const count = normalizeGenerationCount(imageCount[segmentId]);

        // Verificar modo Ingredients e referências de personagem/lugar
        const isIngredientsExplicit = ingredientMode[segmentId] === 'ingredients';
        const sceneReferencePaths = getSceneReferencePaths(segment);
        
        const isIngredients = isIngredientsExplicit || sceneReferencePaths.length > 0;
        const baseIngredientPaths = isIngredientsExplicit ? (ingredientImages[segmentId] || []) : [];
        
        const ingredientPaths = Array.from(new Set([...baseIngredientPaths, ...sceneReferencePaths])).slice(0, getIngredientLimitByService(service));

        if (isIngredients && ingredientPaths.length === 0) {
          if (!silent) alert('Nenhuma imagem de ingrediente, personagem ou lugar disponível para gerar.');
          setGeneratingSegments(prev => { const next = new Set(prev); next.delete(segmentId); return next; });
          return false;
        }

        setVo3Progress(prev => ({ ...prev, [segmentId]: `Gerando ${count} imagem(ns) com ${imageModelLabel}${ingredientPaths.length > 0 ? ` e ${ingredientPaths.length} ref(s)` : ''}...` }));

        const result = await window.electron?.videoProject?.generateFlowImage({
          prompt: targetGenerationPrompt,
          count,
          model: imageModel,
          aspectRatio,
          headless: !showFlowBrowser,
          ingredientImagePaths: ingredientPaths.length > 0 ? ingredientPaths : undefined,
        });

        if (result?.success && result.httpUrls?.length > 0) {
          const duration = result.durationMs ? Number((result.durationMs / 1000).toFixed(2)) : undefined;
          // Usar a primeira imagem imediatamente
          onUpdateImage(segmentId, result.httpUrls[0], duration, service);
          // Se há múltiplas opções, empilhar na fila para o usuário escolher depois
          if (count > 1 && result.httpUrls.length > 1) {
            setPickerQueue(prev => [...prev, { segmentId, httpUrls: result.httpUrls, generationService: service }]);
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

        // Para vídeo, Ingredients é usado no modo explícito ou automaticamente quando não há frame inicial.
        const isIngredientsExplicit = ingredientMode[segmentId] === 'ingredients';
        const shouldAutoUseIngredients = !isLiteApi && !referenceImagePath;
        const shouldCollectIngredients = isIngredientsExplicit || shouldAutoUseIngredients;
        const sceneReferencePaths = shouldCollectIngredients ? getSceneReferencePaths(segment) : [];
        const baseIngredientPaths = shouldCollectIngredients ? (ingredientImages[segmentId] || []) : [];
        const ingredientPaths = !isLiteApi && shouldCollectIngredients
          ? mergeReferencePathsWithPriority(
            referenceImagePath,
            [...baseIngredientPaths, ...sceneReferencePaths],
            getIngredientLimitByService(service)
          )
          : [];
        const isIngredients = !isLiteApi && (
          isIngredientsExplicit
          || (shouldAutoUseIngredients && ingredientPaths.length > 0)
        );
        const hasIngredientsPayload = isIngredients && ingredientPaths.length > 0;
        const veo3ApiDurationSeconds = hasIngredientsPayload
          ? 8
          : pickNearestAllowedDuration(sceneDurationInfo.roundedSeconds, VEO3_API_ALLOWED_SECONDS);

        if (isLiteApi && isIngredientsExplicit) {
          setVo3Progress(prev => ({ ...prev, [segmentId]: 'Veo 3.1 Lite (API) não suporta Ingredients. Usando Frames...' }));
        }

        if (hasIngredientsPayload) {
          setVo3Progress(prev => ({ ...prev, [segmentId]: `Gerando com ${ingredientPaths.length} referência(s) via Veo 3.1${serviceLabel} (${veo3ApiDurationSeconds}s)...` }));
        } else if (referenceImagePath) {
          setVo3Progress(prev => ({ ...prev, [segmentId]: `Animando imagem com Veo 3.1${serviceLabel} (${veo3ApiDurationSeconds}s)...` }));
        } else {
          setVo3Progress(prev => ({ ...prev, [segmentId]: `Gerando vídeo com Veo 3.1${serviceLabel} (${veo3ApiDurationSeconds}s)...` }));
        }

        let generationPrompt = targetGenerationPrompt;
        let rewriteAttempt = 0;
        let lastError = '';
        const maxRewriteAttempts = normalizeVeo3ApiAutoRewriteRetries(veo3ApiAutoRewriteRetries);

        while (rewriteAttempt <= maxRewriteAttempts) {
          const result = await window.electron?.videoProject?.generateVeo3Api({
            prompt: generationPrompt,
            aspectRatio: aspectRatio,
            durationSeconds: veo3ApiDurationSeconds,
            referenceImagePath: hasIngredientsPayload ? undefined : referenceImagePath,
            ingredientImagePaths: hasIngredientsPayload ? ingredientPaths : undefined,
            model: modelName
          });

          if (result?.success && (result.httpUrl || result.videoPath)) {
            const duration = result.durationMs ? Number((result.durationMs / 1000).toFixed(2)) : undefined;
            onUpdateImage(segmentId, result.httpUrl || result.videoPath, duration, service);
            success = true;
            break;
          }

          const parsedFailure = parseVeo3ApiSafetyError(result?.error);
          lastError = parsedFailure.message || String(result?.error || 'erro desconhecido');
          const failureLabel = parsedFailure.supportCodes.length > 0
            ? `codes=${parsedFailure.supportCodes.join(',')} | categorias=${parsedFailure.categories.join(',') || 'n/a'}`
            : 'sem support code mapeado';
          console.error(`❌ [Veo3 API] Falha: ${failureLabel} | ${lastError}`);

          if (lastError.includes('Limite diário')) {
            alert(`🛑 ALERTA: ${lastError}\nA geração em lote será interrompida.`);
            batchCancelledRef.current = true;
            return false;
          }

          const canRewriteAndRetry = parsedFailure.isSafetyError
            && rewriteAttempt < maxRewriteAttempts;
          if (!canRewriteAndRetry) {
            if (!silent) alert(`Falha na geração Veo 3.1: ${lastError}`);
            break;
          }

          const latestSegment = segmentsRef.current.find(s => s.id === segmentId) || segment;
          const firstFrameImagePathForRewrite = getSegmentFirstFrameImagePath(latestSegment);
          if (!firstFrameImagePathForRewrite) {
            console.warn(`⚠️ [Veo3 API] Cena ${segmentId}: falha de segurança detectada, mas não há firstFrame para regenerar animateFrame.`);
            if (!silent) alert(`Falha na geração Veo 3.1: ${lastError}`);
            break;
          }

          rewriteAttempt++;
          const safetyRewriteInstruction = buildVeo3ApiSafetyRewriteInstruction(
            parsedFailure,
            generationPrompt,
            rewriteAttempt
          );
          setVo3Progress(prev => ({
            ...prev,
            [segmentId]: `Falha de segurança (${failureLabel}). Reescrevendo prompt (${rewriteAttempt}/${maxRewriteAttempts})...`,
          }));

          const regenerated = await handleRegenerateAnimateFramePrompt(latestSegment, {
            silent: true,
            userInstruction: safetyRewriteInstruction,
          });
          if (!regenerated) {
            console.warn(`⚠️ [Veo3 API] Cena ${segmentId}: não foi possível regenerar animateFrame para retry automático.`);
            if (!silent) alert(`Falha na geração Veo 3.1: ${lastError}`);
            break;
          }

          const refreshedSegment = segmentsRef.current.find(s => s.id === segmentId) || latestSegment;
          const refreshedAnimateFrame = typeof refreshedSegment.animateFrame === 'string'
            ? refreshedSegment.animateFrame.trim()
            : '';
          const refreshedFallbackPrompt = extractPromptString(refreshedSegment.imagePrompt) || `Cinematic scene: ${refreshedSegment.text}`;
          generationPrompt = refreshedAnimateFrame || refreshedFallbackPrompt;

          console.warn(
            `⚠️ [Veo3 API] Cena ${segmentId}: prompt reescrito e reenfileirado (${rewriteAttempt}/${maxRewriteAttempts}).`
          );
          setVo3Progress(prev => ({
            ...prev,
            [segmentId]: `Prompt reescrito. Reenfileirando geração (${rewriteAttempt}/${maxRewriteAttempts})...`,
          }));
        }

      // ── VEO 2 (API oficial) ──
      } else {
        console.log(`🌊 [Veo2] Gerando vídeo para segmento ${segmentId}...`);
        const veo2ApiDurationSeconds = pickNearestAllowedDuration(
          sceneDurationInfo.roundedSeconds,
          VEO2_API_ALLOWED_SECONDS
        );

        // Usa a imagem de referência (calculada no início do bloco try)

        if (referenceImagePath) {
          setVo3Progress(prev => ({ ...prev, [segmentId]: `Animando imagem com Veo 2 (${veo2ApiDurationSeconds}s)...` }));
        } else {
          setVo3Progress(prev => ({ ...prev, [segmentId]: `Gerando vídeo com Veo 2 (${veo2ApiDurationSeconds}s)...` }));
        }

        const result = await window.electron?.videoProject?.generateVeo2({
          prompt: targetGenerationPrompt,
          aspectRatio: aspectRatio,
          durationSeconds: veo2ApiDurationSeconds,
          referenceImagePath,
          finalImagePath,
        });
        if (result?.success && (result.httpUrl || result.videoPath)) {
          const duration = result.durationMs ? Number((result.durationMs / 1000).toFixed(2)) : undefined;
          onUpdateImage(segmentId, result.httpUrl || result.videoPath, duration, service);
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
    onUpdateImage(segmentId, '', undefined, null);
  };

  // ── Funções de seleção de cenas ──
  const handleToggleScene = useCallback((segmentId: number, event?: React.MouseEvent) => {
    if (event?.shiftKey && lastClickedSceneRef.current !== null) {
      // Shift+Click: selecionar range
      const ids = filteredSceneIds;
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
        lastClickedSceneRef.current = segmentId;
        return;
      }
    }

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
    lastClickedSceneRef.current = segmentId;
  }, [filteredSceneIds]);

  // ── Processamento em lote — pool de workers paralelos (cancelável) ──
  const handleBatchProcess = useCallback(async () => {
    const targetIds = filteredSegments
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
  }, [filteredSegments, segments, selectedScenes, handleRegenerate]);

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
    window.electron?.videoProject?.cancelVertexQueue?.().catch?.(() => {});
  }, []);

  const handleBatchRegenerateAnimateFramesStop = useCallback(() => {
    if (!batchRegeneratingAnimateFrame) return;
    batchAnimateFrameCancelledRef.current = true;
  }, [batchRegeneratingAnimateFrame]);

  const handleBatchRegenerateAnimateFrames = async () => {
    if (batchProcessing || batchRegeneratingAnimateFrame) return;

    if (selectedFilteredScenesCount === 0) {
      alert('Nenhuma cena selecionada.');
      return;
    }

    const targetSegments = filteredSegments.filter(
      segment => selectedScenes.has(segment.id) && segment.assetType === 'video_frame_animate'
    );

    if (targetSegments.length === 0) {
      alert('As cenas selecionadas não possuem assetType "video_frame_animate".');
      return;
    }

    setBatchRegeneratingAnimateFrame(true);
    batchAnimateFrameCancelledRef.current = false;
    setBatchResults({});
    setCurrentErrorHighlightIndex(0);

    const maxAttempts = 3;
    let successCount = 0;
    let failedCount = 0;
    let skippedNoImageCount = 0;
    let wasCancelled = false;

    try {
      for (const segment of targetSegments) {
        if (batchAnimateFrameCancelledRef.current) {
          wasCancelled = true;
          break;
        }

        const firstFrameImagePath = getSegmentFirstFrameImagePath(segment);
        if (!firstFrameImagePath) {
          skippedNoImageCount++;
          setBatchResults(prev => ({ ...prev, [segment.id]: 'skipped' }));
          continue;
        }

        let ok = false;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          if (batchAnimateFrameCancelledRef.current) {
            wasCancelled = true;
            break;
          }
          ok = await handleRegenerateAnimateFramePrompt(segment, { silent: true });
          if (ok) break;
        }

        if (batchAnimateFrameCancelledRef.current) {
          wasCancelled = true;
          break;
        }

        if (ok) {
          successCount++;
          setBatchResults(prev => ({ ...prev, [segment.id]: 'success' }));
        } else {
          failedCount++;
          setBatchResults(prev => ({ ...prev, [segment.id]: 'error' }));
        }
      }
    } finally {
      setBatchRegeneratingAnimateFrame(false);
      batchAnimateFrameCancelledRef.current = false;
    }

    const processedCount = successCount + failedCount + skippedNoImageCount;
    const notProcessedCount = Math.max(0, targetSegments.length - processedCount);
    alert([
      wasCancelled ? 'Regeneração de animateFrame interrompida.' : 'Regeneração de animateFrame concluída.',
      `Cenas alvo: ${targetSegments.length}`,
      `Tentativas por cena: ${maxAttempts}`,
      `Sucesso: ${successCount}`,
      `Falhas: ${failedCount}`,
      `Sem imagem do firstFrame: ${skippedNoImageCount}`,
      ...(wasCancelled ? [`Não processadas após parar: ${notProcessedCount}`] : []),
    ].join('\n'));
  };

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
      if (svc === 'flow-image') return '🖼️ Gerar nova Imagem (Flow2API)';
      if (svc === 'vertex-image') return '🧩 Gerar nova Imagem (Vertex)';
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
    if (svc === 'flow-image') return '🖼️ Imagem com Flow2API';
    if (svc === 'vertex-image') return '🧩 Imagem com Vertex';
    if (svc === 'flow-image-api') return '🍌 Imagem com Nano Banana 2';
    if (svc === 'flow-image-pro') return '🍌 Imagem com Nano Banana Pro';
    return '🌊 Gerar com Veo 2';
  };

  return (
    <div className="space-y-6">
      <input
        ref={flowResultInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportFlowExtensionJson}
      />
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Prompts, Imagens e Vídeos das Cenas</h2>
          <p className="text-white/60">Revise prompts e assets, depois gere ou faça upload da mídia de cada cena</p>

          {false && onProviderChange && (
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
        <div className="hidden">
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

            {/* <button
              onClick={handleExportFlowExtensionJson}
              disabled={flowExportableCount === 0}
              className={`px-4 py-2 border rounded-lg transition-all ${
                flowExportableCount === 0
                  ? 'bg-white/5 text-white/30 border-white/10 cursor-not-allowed'
                  : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 border-cyan-500/30'
              }`}
              title="Exporta JSON para automação na extensão do Chrome"
            >
              📤 Exportar Flow JSON ({flowExportableCount})
            </button>

            <button
              onClick={() => flowResultInputRef.current?.click()}
              disabled={isImportingFlowResult}
              className={`px-4 py-2 border rounded-lg transition-all ${
                isImportingFlowResult
                  ? 'bg-white/5 text-white/30 border-white/10 cursor-not-allowed'
                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 border-emerald-500/30'
              }`}
              title="Importa o JSON com mídias geradas pela extensão"
            >
              {isImportingFlowResult ? '⏳ Importando...' : '📥 Importar Resultado Flow'}
            </button> */}

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

          {/* Input global movido para o dropdown da barra de status */}
        </div>
      </div>

      <div className="space-y-3">
        {/* Input global movido para o dropdown da barra de status */}

        <div className="flex gap-3 items-center flex-wrap">
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

          {/* <button
            onClick={handleExportFlowExtensionJson}
            disabled={flowExportableCount === 0}
            className={`px-4 py-2 border rounded-lg transition-all ${
              flowExportableCount === 0
                ? 'bg-white/5 text-white/30 border-white/10 cursor-not-allowed'
                : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 border-cyan-500/30'
            }`}
            title="Exporta JSON para automação na extensão do Chrome"
          >
            📤 Exportar Flow JSON ({flowExportableCount})
          </button>

          <button
            onClick={() => flowResultInputRef.current?.click()}
            disabled={isImportingFlowResult}
            className={`px-4 py-2 border rounded-lg transition-all ${
              isImportingFlowResult
                ? 'bg-white/5 text-white/30 border-white/10 cursor-not-allowed'
                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 border-emerald-500/30'
            }`}
            title="Importa o JSON com mídias geradas pela extensão"
          >
            {isImportingFlowResult ? '⏳ Importando...' : '📥 Importar Resultado Flow'}
          </button> */}
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
      <div className="sticky top-0 z-40">
        <div
          className={`flex flex-wrap items-center gap-4 p-4 bg-black/60 backdrop-blur-xl border border-white/10 shadow-lg transition-all duration-300 ${
            onAnalyze && showGlobalInstructionInput
              ? 'rounded-t-xl rounded-b-none border-b-0'
              : 'rounded-xl'
          }`}
        >
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="text-white/60 text-sm">
            {segmentsWithMediaCount}/{segments.length}
          </span>
        </div>

        {/* <div className="flex items-center gap-2 border-l border-white/10 pl-4">
          <span className="text-white/60 text-sm">
            Exibindo {filteredSegmentsWithMediaCount} prontas em {filteredSegments.length}/{segments.length}
          </span>
        </div> */}

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

        <div className="flex items-center gap-2 border-l border-white/10 pl-4">
          <span className="text-white/60 text-sm">Flow2API:</span>
          <span
            className={`px-3 py-1 rounded-lg text-xs font-semibold ${
              isFlowBrowserStatusLoading
                ? 'bg-white/10 text-white/60'
                : isFlowBrowserOpen
                  ? 'bg-emerald-600 text-white'
                  : 'bg-red-700/80 text-white/90'
            }`}
            title="Status de http://localhost:8000/"
          >
            {isFlowBrowserStatusLoading ? '...' : isFlowBrowserOpen ? 'Online' : 'Offline'}
          </span>
          <span className="text-xs text-white/40">localhost:8000</span>
        </div>

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
          {onAnalyze && (
            <button
              type="button"
              onClick={() => setShowGlobalInstructionInput(prev => !prev)}
              disabled={isAiBusy}
              className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all shadow-lg ${
                isAiBusy
                  ? 'bg-white/10 border-white/10 text-white/30 cursor-not-allowed'
                  : showGlobalInstructionInput
                    ? 'bg-fuchsia-500/25 hover:bg-fuchsia-500/35 border-fuchsia-500/40 text-fuchsia-100'
                    : 'bg-white/10 hover:bg-white/20 border-white/20 text-white'
              }`}
              title={showGlobalInstructionInput ? 'Ocultar instrução global' : 'Mostrar instrução global'}
              aria-expanded={showGlobalInstructionInput}
            >
              📝
            </button>
          )}

          <button
            onClick={batchRegeneratingAnimateFrame ? handleBatchRegenerateAnimateFramesStop : handleBatchRegenerateAnimateFrames}
            disabled={
              batchRegeneratingAnimateFrame
                ? false
                : (
                  batchProcessing
                  || selectedFilteredScenesCount === 0
                  || selectedFilteredVideoFrameAnimateCount === 0
                )
            }
            className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all shadow-lg ${
              batchRegeneratingAnimateFrame
                ? 'bg-red-500/30 hover:bg-red-500/40 border-red-500/50 text-red-100'
                : (
                  batchProcessing
                  || selectedFilteredScenesCount === 0
                  || selectedFilteredVideoFrameAnimateCount === 0
                )
                  ? 'bg-white/10 border-white/10 text-white/30 cursor-not-allowed'
                  : 'bg-emerald-500/25 hover:bg-emerald-500/35 border-emerald-500/40 text-emerald-100'
            }`}
            title={
              batchRegeneratingAnimateFrame
                ? 'Parar regeneração de animateFrame em lote'
                : selectedFilteredVideoFrameAnimateCount === 0
                  ? 'Selecione ao menos uma cena com assetType video_frame_animate'
                  : `Regenerar animateFrame de ${selectedFilteredVideoFrameAnimateCount} cena(s) selecionada(s)`
            }
          >
            {batchRegeneratingAnimateFrame ? '⏹' : '🔁'}
          </button>
          
          {/* Botão de Configurações em Lote */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => {
                  setShowBatchSettings(!showBatchSettings);
                  if (!showBatchSettings) setShowSceneFilterDropdown(false);
                }}
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
                    <div className="space-y-2 pb-2 mb-1 border-b border-white/10">
                      <div className="flex items-center justify-between gap-3 px-2">
                        <label
                          htmlFor="batch-generation-count"
                          className="text-[10px] text-white/40 uppercase"
                        >
                          Número de gerações
                        </label>
                        <span className="shrink-0 rounded-md bg-cyan-500/15 border border-cyan-500/25 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
                          {selectedBatchGenerationCount === 'mixed'
                            ? 'Misto'
                            : `${selectedBatchGenerationCount}x`}
                        </span>
                      </div>
                      <input
                        id="batch-generation-count"
                        type="range"
                        min={GENERATION_COUNT_OPTIONS[0]}
                        max={GENERATION_COUNT_OPTIONS[GENERATION_COUNT_OPTIONS.length - 1]}
                        step={1}
                        value={selectedBatchGenerationRangeValue}
                        disabled={selectedScenes.size === 0}
                        onPointerDown={() => {
                          if (selectedBatchGenerationCount === 'mixed') {
                            applySelectedBatchGenerationCount(selectedBatchGenerationRangeValue);
                          }
                        }}
                        onChange={(e) => applySelectedBatchGenerationCount(e.target.value)}
                        className="w-full accent-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Quantidade de gerações para as cenas selecionadas"
                      />
                      <div className="grid grid-cols-4 px-2 text-[10px] text-white/35">
                        {GENERATION_COUNT_OPTIONS.map(count => (
                          <span
                            key={count}
                            className={count === 1 ? 'text-left' : count === 4 ? 'text-right' : 'text-center'}
                          >
                            {count}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 pb-2 mb-1 border-b border-white/10">
                      <div className="flex items-center justify-between gap-3 px-2">
                        <label
                          htmlFor="veo3-api-auto-rewrite-retries"
                          className="text-[10px] text-white/40 uppercase"
                        >
                          Retry prompt Veo
                        </label>
                        <span className="shrink-0 rounded-md bg-cyan-500/15 border border-cyan-500/25 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
                          {veo3ApiAutoRewriteRetries === 0
                            ? 'OFF'
                            : `${veo3ApiAutoRewriteRetries}x`}
                        </span>
                      </div>
                      <input
                        id="veo3-api-auto-rewrite-retries"
                        type="range"
                        min={0}
                        max={VEO3_API_AUTO_REWRITE_MAX_RETRIES}
                        step={1}
                        value={veo3ApiAutoRewriteRetries}
                        onChange={(e) => setVeo3ApiAutoRewriteRetries(normalizeVeo3ApiAutoRewriteRetries(e.target.value))}
                        className="w-full accent-cyan-400"
                        title="0 desativa; 3 permite três reescritas do prompt"
                      />
                      <div className="grid grid-cols-4 px-2 text-[10px] text-white/35">
                        {[0, 1, 2, 3].map(value => (
                          <span
                            key={value}
                            className={value === 0 ? 'text-left' : value === 3 ? 'text-right' : 'text-center'}
                          >
                            {value}
                          </span>
                        ))}
                      </div>
                    </div>
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
                          if (IMAGE_SERVICES.has(svc.id)) {
                            setIngredientMode(prev => {
                              const next = { ...prev };
                              Array.from(selectedScenes).forEach(id => {
                                next[id] = 'ingredients';
                              });
                              return next;
                            });
                          } else if (!supportsIngredientsForService(svc.id)) {
                            setIngredientMode(prev => {
                              const next = { ...prev };
                              Array.from(selectedScenes).forEach(id => {
                                if (next[id] === 'ingredients') {
                                  next[id] = 'frames';
                                }
                              });
                              return next;
                            });
                          }
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

            <div className="relative">
              <button
                onClick={() => {
                  setShowSceneFilterDropdown(!showSceneFilterDropdown);
                  if (!showSceneFilterDropdown) setShowBatchSettings(false);
                }}
                className={`w-8 h-8 rounded-xl border flex items-center justify-center text-white transition-all shadow-lg ${
                  hasActiveSceneFilters
                    ? 'bg-cyan-600/50 hover:bg-cyan-500/60 border-cyan-400/60'
                    : 'bg-gray-600/50 hover:bg-gray-500/70 border-white/10'
                }`}
                title="Filtrar cenas"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
              </button>
              {showSceneFilterDropdown && (
                <div
                  className="absolute top-full right-0 mt-2 z-[60] bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[320px] select-none"
                  onMouseLeave={() => setShowSceneFilterDropdown(false)}
                >
                  <div className="px-3 py-2 border-b border-white/10 bg-white/5 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                      Filtros de Cena
                    </span>
                    <span className="text-[10px] text-white/50">
                      {filteredSegments.length}/{segments.length}
                    </span>
                  </div>
                  <div className="p-3 space-y-3">
                    <div className="space-y-1">
                      <label className="text-[11px] text-white/50 uppercase tracking-wider">Tipo de mídia</label>
                      <div className="bg-black/30 border border-white/10 rounded-lg p-2 space-y-1.5">
                        <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sceneMediaChecks.noMedia}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setSceneMediaChecks(prev => ({ ...prev, noMedia: checked }));
                              setSceneFilterRevision(prev => prev + 1);
                            }}
                            className="accent-cyan-500"
                          />
                          <span>Sem mídia</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sceneMediaChecks.image}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setSceneMediaChecks(prev => ({ ...prev, image: checked }));
                              setSceneFilterRevision(prev => prev + 1);
                            }}
                            className="accent-cyan-500"
                          />
                          <span>Com imagem</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sceneMediaChecks.video}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setSceneMediaChecks(prev => ({ ...prev, video: checked }));
                              setSceneFilterRevision(prev => prev + 1);
                            }}
                            className="accent-cyan-500"
                          />
                          <span>Com vídeo</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-white/50 uppercase tracking-wider">Serviço de geração</label>
                      <div className="bg-black/30 border border-white/10 rounded-lg p-2 space-y-1.5 max-h-[160px] overflow-y-auto batch-dropdown-scroll">
                        <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={includeManualGenerationService}
                            onChange={(e) => {
                              setIncludeManualGenerationService(e.target.checked);
                              setSceneFilterRevision(prev => prev + 1);
                            }}
                            className="accent-cyan-500"
                          />
                          <span>Upload manual (null)</span>
                        </label>
                        {generationServiceFilterOptions.map(option => (
                          <label key={option.value} className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={sceneGenerationServiceChecks[option.value] ?? true}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setSceneGenerationServiceChecks(prev => ({
                                  ...prev,
                                  [option.value]: checked,
                                }));
                                setSceneFilterRevision(prev => prev + 1);
                              }}
                              className="accent-cyan-500"
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 bg-white/5 border border-white/10 rounded-lg p-2">
                      <div className="flex items-center justify-between text-[11px] text-white/60">
                        <span>Duração da cena</span>
                        <span className="font-mono text-cyan-300">
                          {sceneDurationMinFilter}s - {sceneDurationMaxFilter}s
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-white/50 w-6">Min</span>
                        <input
                          type="range"
                          min={0}
                          max={maxSceneDurationSeconds}
                          step={1}
                          value={sceneDurationMinFilter}
                          onChange={(e) => {
                            const nextMin = Number(e.target.value);
                            setSceneDurationMinFilter(nextMin);
                            setSceneDurationMaxFilter(prevMax => Math.max(prevMax, nextMin));
                            setSceneFilterRevision(prev => prev + 1);
                          }}
                          className="flex-1 accent-cyan-500"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-white/50 w-6">Max</span>
                        <input
                          type="range"
                          min={0}
                          max={maxSceneDurationSeconds}
                          step={1}
                          value={sceneDurationMaxFilter}
                          onChange={(e) => {
                            const nextMax = Number(e.target.value);
                            setSceneDurationMaxFilter(nextMax);
                            setSceneDurationMinFilter(prevMin => Math.min(prevMin, nextMax));
                            setSceneFilterRevision(prev => prev + 1);
                          }}
                          className="flex-1 accent-cyan-500"
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setSceneMediaChecks({ noMedia: true, image: true, video: true });
                        setIncludeManualGenerationService(true);
                        setSceneGenerationServiceChecks(() =>
                          generationServiceFilterOptions.reduce((acc, option) => {
                            acc[option.value] = true;
                            return acc;
                          }, {} as Record<string, boolean>)
                        );
                        setSceneDurationMinFilter(0);
                        setSceneDurationMaxFilter(maxSceneDurationSeconds);
                        setSceneFilterRevision(prev => prev + 1);
                      }}
                      disabled={!hasActiveSceneFilters}
                      className={`w-full px-2 py-1.5 rounded-lg text-xs transition-all ${
                        hasActiveSceneFilters
                          ? 'bg-white/10 hover:bg-white/20 text-white'
                          : 'bg-white/5 text-white/30 cursor-not-allowed'
                      }`}
                      title="Limpar filtros"
                    >
                      Limpar filtros
                    </button>
                  </div>
                </div>
              )}
            </div>
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
                disabled={selectedFilteredScenesCount === 0}
                className="py-1.5 px-4 rounded-l-lg text-xs font-bold transition-all bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40"
              >
                🚀 Processar {selectedFilteredScenesCount} Cenas
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
                      onClick={() => {
                        setSelectedScenes(prev => {
                          const next = new Set(prev);
                          filteredSceneIds.forEach(id => next.add(id));
                          return next;
                        });
                      }}
                      disabled={!hasFilteredScenes}
                      className="flex-1 px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/5 transition-all outline-none"
                    >
                      ✓ Todas
                    </button>
                    <div className="w-px bg-white/10" />
                    <button
                      onClick={() => {
                        setSelectedScenes(prev => {
                          const next = new Set(prev);
                          filteredSceneIds.forEach(id => next.delete(id));
                          return next;
                        });
                      }}
                      disabled={!hasFilteredScenes}
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
                    {filteredSegments.map(seg => {
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
                    {filteredSegments.length === 0 && (
                      <div className="px-3 py-2 text-xs text-white/40">
                        Nenhuma cena visível com os filtros atuais.
                      </div>
                    )}
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
                onClick={() => {
                  setBatchResults({});
                  setCurrentErrorHighlightIndex(0);
                }}
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

        {onAnalyze && (
          <div
            className={`origin-top overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${
              showGlobalInstructionInput
                ? 'max-h-24 opacity-100'
                : 'max-h-0 opacity-0 pointer-events-none'
            }`}
          >
            <div
              className={`p-3 bg-black/60 backdrop-blur-xl border border-white/10 border-t-0 rounded-b-xl transition-transform duration-300 ease-out ${
                showGlobalInstructionInput ? 'translate-y-0' : '-translate-y-2'
              }`}
            >
              <input
                type="text"
                value={globalInstruction}
                onChange={(e) => setGlobalInstruction(e.target.value)}
                placeholder="Instrução global para edição dos prompts"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:border-pink-500 focus:outline-none"
                disabled={isAiBusy}
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {erroredBatchSegmentIds.length > 0 && (
          <div className="fixed right-2 top-1/2 -translate-y-1/2 flex flex-col items-center bg-black/80 border border-red-500/30 p-1.5 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.3)] z-50">
            <span className="text-[9px] text-red-400 font-bold mb-1 mt-1 leading-none drop-shadow-sm">
              {currentErrorHighlightIndex + 1}/{erroredBatchSegmentIds.length}
            </span>
            <button
              onClick={() => {
                const prevIdx = (currentErrorHighlightIndex - 1 + erroredBatchSegmentIds.length) % erroredBatchSegmentIds.length;
                setCurrentErrorHighlightIndex(prevIdx);
                document.getElementById(`segment-${erroredBatchSegmentIds[prevIdx]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              className="p-1 text-white hover:text-red-400 hover:bg-white/10 rounded-full transition-colors"
              title="Erro anterior"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
            </button>
            <div className="w-5 h-[1px] bg-red-500/20 my-0.5" />
            <button
              onClick={() => {
                const nextIdx = (currentErrorHighlightIndex + 1) % erroredBatchSegmentIds.length;
                setCurrentErrorHighlightIndex(nextIdx);
                document.getElementById(`segment-${erroredBatchSegmentIds[nextIdx]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              className="p-1 text-white hover:text-red-400 hover:bg-white/10 rounded-full transition-colors"
              title="Próximo erro"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </button>
          </div>
        )}
        {filteredSegments.map((segment) => {
          const isGenerating = generatingSegments.has(segment.id);
          const isUploading = uploadingSegments.has(segment.id);
          const hasImage = !!segment.imageUrl;
          const isBatchActive = batchProcessing && batchProgress.currentSceneId === segment.id;
          const isBatchError = batchResults[segment.id] === 'error';
          const isCurrentBatchError = erroredBatchSegmentIds.length > 0
            && erroredBatchSegmentIds[currentErrorHighlightIndex] === segment.id;
          const effectiveService = getEffectiveService(segment);
          const sceneDurationInfo = getSceneDurationInfo(segment);
          const veo3ApiDurationPreview = ingredientMode[segment.id] === 'ingredients'
            ? 8
            : pickNearestAllowedDuration(sceneDurationInfo.roundedSeconds, VEO3_API_ALLOWED_SECONDS);
          const veo2ApiDurationPreview = pickNearestAllowedDuration(
            sceneDurationInfo.roundedSeconds,
            VEO2_API_ALLOWED_SECONDS
          );
          const grokDurationPreview = pickNearestAllowedDuration(
            sceneDurationInfo.roundedSeconds,
            GROK_ALLOWED_SECONDS
          );
          const apiDurationPreviewLabel = (() => {
            if (effectiveService === 'veo3-api' || effectiveService === 'veo3-fast-api' || effectiveService === 'veo3-lite-api') {
              return `Veo 3 API: ${veo3ApiDurationPreview}s`;
            }
            if (effectiveService === 'veo2') {
              return `Veo 2 API: ${veo2ApiDurationPreview}s`;
            }
            if (effectiveService === 'grok') {
              return `Grok: ${grokDurationPreview}s`;
            }
            return null;
          })();
          const assetInfo = getAssetTypeInfo(segment.assetType || 'image_flux');
          const cameraLabel = segment.cameraMovement
            ? CAMERA_MOVEMENTS[segment.cameraMovement as CameraMovement]?.label || segment.cameraMovement
            : '';
          const transitionLabel = segment.transition
            ? TRANSITIONS[segment.transition as Transition]?.label || segment.transition
            : '';
          const sceneCharacterIds = getSceneCharacterIds(segment);
          const sceneLocationIds = getSceneLocationIds(segment);
          const sceneLocationId = sceneLocationIds[0] ?? null;
          const sceneCharacterSlots = sceneCharacterIds.map((id, index) => ({
            id,
            index,
            reference: sortedCharacterReferences.find(reference => reference.id === id) || null,
          }));
          const sceneLocationReference = sceneLocationId
            ? (sortedLocationReferences.find(reference => reference.id === sceneLocationId) || null)
            : null;
          const availableCharacterIds = sortedCharacterReferences
            .map(reference => reference.id)
            .filter(id => !sceneCharacterIds.includes(id));
          const segmentManualIngredients = ingredientImages[segment.id] || [];
          const segmentSceneReferencePaths = getSceneReferencePaths(segment);
          const segmentReferenceLimit = getIngredientLimitByService(effectiveService);
          const segmentTotalReferenceCount = Array.from(new Set([
            ...segmentManualIngredients,
            ...segmentSceneReferencePaths,
          ])).length;
          const canAddCharacterToScene = Boolean(onSegmentsUpdate)
            && availableCharacterIds.length > 0
            && segmentTotalReferenceCount < segmentReferenceLimit;
          const canAddLocationToScene = Boolean(onSegmentsUpdate)
            && !sceneLocationId
            && sortedLocationReferences.length > 0
            && segmentTotalReferenceCount < segmentReferenceLimit;
          const isReferencesDisabled = !onSegmentsUpdate || isGenerating || isUploading;
          const isLocationPickerOpen = sceneReferencePicker?.segmentId === segment.id
            && sceneReferencePicker.kind === 'location';
          const imagePromptViewMode = getPromptViewMode(segment.id, 'imagePrompt');
          const firstFrameViewMode = getPromptViewMode(segment.id, 'firstFrame');
          const animateFrameViewMode = getPromptViewMode(segment.id, 'animateFrame');
          const videoFramePairViewMode: PromptLanguageView =
            firstFrameViewMode === animateFrameViewMode
              ? firstFrameViewMode
              : firstFrameViewMode;
          const imagePromptFieldKey = getPromptFieldKey(segment.id, 'imagePrompt');
          const firstFrameFieldKey = getPromptFieldKey(segment.id, 'firstFrame');
          const animateFrameFieldKey = getPromptFieldKey(segment.id, 'animateFrame');
          const isImagePromptTranslating = Boolean(translatingPromptFields[imagePromptFieldKey]);
          const isFirstFrameTranslating = Boolean(translatingPromptFields[firstFrameFieldKey]);
          const isAnimateFrameTranslating = Boolean(translatingPromptFields[animateFrameFieldKey]);
          const isVideoFramePairTranslating = isFirstFrameTranslating || isAnimateFrameTranslating;
          const imagePromptValue = (() => {
            const rawPrompt = getStoredPromptFieldValue(segment, 'imagePrompt', imagePromptViewMode);
            if (imagePromptViewMode === 'original' && !rawPrompt) {
              return `${segment.emotion} scene depicting: ${segment.text}`;
            }
            return rawPrompt;
          })();
          const firstFrameValue = getStoredPromptFieldValue(segment, 'firstFrame', firstFrameViewMode);
          const animateFrameValue = getStoredPromptFieldValue(segment, 'animateFrame', animateFrameViewMode);
          const imagePromptPlaceholder = imagePromptViewMode === 'original'
            ? 'Prompt original em inglês da cena...'
            : 'Prompt traduzido para PT-BR da cena...';
          const firstFramePlaceholder = firstFrameViewMode === 'original'
            ? 'Prompt original em inglês para o firstFrame...'
            : 'Prompt traduzido para PT-BR do firstFrame...';
          const animateFramePlaceholder = animateFrameViewMode === 'original'
            ? 'Prompt original em inglês para o animateFrame...'
            : 'Prompt traduzido para PT-BR do animateFrame...';
          const isRegeneratingAnimateFrame = regeneratingAnimateFrameSegments.has(segment.id);
          const segmentFirstFrameImagePath = getSegmentFirstFrameImagePath(segment);
          const canRegenerateAnimateFramePrompt = Boolean(onSegmentsUpdate)
            && Boolean(segmentFirstFrameImagePath)
            && !isRegeneratingAnimateFrame
            && !isAiBusy;

          return (
            <div
              key={segment.id}
              id={`segment-${segment.id}`}
              className={`bg-white/5 border rounded-xl transition-all ${
                isCurrentBatchError
                  ? 'border-red-500 ring-2 ring-red-500/30 shadow-lg shadow-red-500/15 bg-red-500/5'
                  : isBatchError
                    ? 'border-red-500/50 bg-red-500/5'
                    : isBatchActive
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

                {/* Mini-select de quantidade (Flow2API video: veo3 / veo2-flow) */}
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
                  const shouldShowIngredientsPanel = isIngredientsMode && !(
                    IMAGE_SERVICES.has(svc)
                    && hasImage
                    && !isVideo(segment.imageUrl)
                  );
                  const showCarousel = isVideoService && hasImage && !isVideo(segment.imageUrl) && !isIngredientsMode;

                  // 0. MODO INGREDIENTS
                  if (shouldShowIngredientsPanel) {
                    const imgs = ingredientImages[segment.id] || [];
                    const ingredientLimit = getIngredientLimitByService(svc);
                    const maxManualSlots = Math.max(0, ingredientLimit - segmentSceneReferencePaths.length);
                    const slotCount = Math.max(1, Math.max(imgs.length, maxManualSlots));
                    const slotColumnsClass = ingredientLimit > DEFAULT_INGREDIENT_LIMIT
                      ? 'grid-cols-5'
                      : 'grid-cols-3';
                    const canAddIngredient = segmentTotalReferenceCount < ingredientLimit;

                    return (
                      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-purple-500/5 flex items-center justify-center p-4">
                        <div className={`grid ${slotColumnsClass} gap-2 w-full max-w-[520px]`}>
                          {Array.from({ length: slotCount }, (_, idx) => {
                            const imgUrl = imgs[idx];
                            if (imgUrl) {
                              return (
                                <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border-2 border-cyan-500/30 group/slot">
                                  <img
                                    src={getMediaSrc(imgUrl)}
                                    className="w-full h-full object-cover"
                                    alt={`Ingrediente ${idx + 1}`}
                                    loading="lazy"
                                    decoding="async"
                                    onMouseEnter={(e) => showHoverImagePreview(e, imgUrl, `Ingrediente ${idx + 1}`)}
                                    onMouseLeave={hideHoverImagePreview}
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
                              <label
                                key={idx}
                                className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all bg-black/20 ${
                                  canAddIngredient
                                    ? 'border-cyan-500/25 hover:border-cyan-400/50 cursor-pointer hover:bg-cyan-500/10'
                                    : 'border-white/10 cursor-not-allowed opacity-60'
                                }`}
                              >
                                <span className="text-cyan-400/60 text-2xl mb-1">+</span>
                                <span className="text-white/30 text-[10px]">Imagem {idx + 1}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={!canAddIngredient}
                                  onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) handleIngredientUpload(segment.id, file);
                                  }}
                                />
                              </label>
                            );
                          })}
                        </div>
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white/40 text-[10px] rounded backdrop-blur-sm">
                          Ingredients - {segmentTotalReferenceCount}/{ingredientLimit}
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
                              onClick={() => onUpdateImage(segment.id, segment.sourceImageUrl!, undefined, null)}
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
                  <span
                    className="px-2 py-0.5 bg-white/10 text-white/60 rounded text-xs"
                    title={`Tempo exato: ${sceneDurationInfo.rawSeconds.toFixed(2)}s`}
                  >
                    {sceneDurationInfo.roundedSeconds}s
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
                </div>

                <p className="text-white/80 text-sm italic">"{segment.text}"</p>

                <div className="space-y-2">
                  <div className="text-[11px] text-white/45">
                    Referencias usadas: {segmentTotalReferenceCount}/{segmentReferenceLimit} imagens
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {sceneCharacterSlots.map(({ id: characterId, index, reference }) => {
                      const isPickerOpen = sceneReferencePicker?.segmentId === segment.id
                        && sceneReferencePicker.kind === 'character'
                        && sceneReferencePicker.characterIndex === index;
                      const replacementOptions = sortedCharacterReferences.filter(item => item.id !== characterId);

                      return (
                        <div key={`scene-char-preview-${segment.id}-${characterId}-${index}`} className="relative" data-scene-reference-root="true">
                          <button
                            type="button"
                            onClick={() => {
                              if (isReferencesDisabled) return;
                              setSceneReferencePicker(current =>
                                current?.segmentId === segment.id
                                && current.kind === 'character'
                                && current.characterIndex === index
                              ? null
                              : { segmentId: segment.id, kind: 'character', characterIndex: index }
                              );
                            }}
                            onMouseEnter={(e) => showHoverImagePreview(e, reference?.imageUrl, reference?.character || `Personagem ${characterId}`)}
                            onMouseLeave={hideHoverImagePreview}
                            disabled={isReferencesDisabled}
                            className={`group/ref-thumb relative w-16 h-16 rounded-md border bg-black/30 overflow-hidden transition-all ${
                              isPickerOpen
                                ? 'border-yellow-300 ring-2 ring-yellow-300/30'
                                : 'border-yellow-500/30 hover:border-yellow-300/60'
                            } ${isReferencesDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            {reference?.imageUrl ? (
                              <img
                                src={getMediaSrc(reference.imageUrl)}
                                alt={reference.character || `Personagem ${characterId}`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-white/30 text-center px-1">
                                Sem imagem
                              </div>
                            )}
                            <span className="absolute inset-0 pointer-events-none flex items-center justify-center bg-black/35 opacity-0 group-hover/ref-thumb:opacity-100 transition-opacity">
                              <span className="w-9 h-9 rounded-full border-2 border-white bg-black/35 flex items-center justify-center">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M12 20h9"/>
                                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>
                                </svg>
                              </span>
                            </span>
                          </button>
                          <p className="mt-1 text-[10px] text-yellow-200 truncate w-16" title={reference?.character || `Personagem ${characterId}`}>
                            {reference?.character || `Personagem ${characterId}`}
                          </p>

                          {isPickerOpen && (
                            <div
                              className="absolute top-full left-0 mt-2 z-40 w-[230px] rounded-lg border border-yellow-500/30 bg-[#1a1a2e] p-2 shadow-xl"
                              onMouseLeave={() => setSceneReferencePicker(null)}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] text-yellow-200 font-medium">Personagem</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!canAddCharacterToScene) return;
                                      addCharacterToScene(segment, availableCharacterIds[0]);
                                    }}
                                    disabled={!canAddCharacterToScene || isReferencesDisabled}
                                    className={`w-6 h-6 rounded border text-xs transition-all ${
                                      !canAddCharacterToScene || isReferencesDisabled
                                        ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                                        : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/30'
                                    }`}
                                    title="Adicionar outro personagem"
                                  >
                                    +
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      removeSceneCharacterAtIndex(segment, index);
                                      setSceneReferencePicker(null);
                                    }}
                                    disabled={isReferencesDisabled}
                                    className={`w-6 h-6 rounded border text-xs transition-all ${
                                      isReferencesDisabled
                                        ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                                        : 'bg-red-500/20 border-red-500/40 text-red-200 hover:bg-red-500/30'
                                    }`}
                                    title="Remover este personagem"
                                  >
                                    x
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-4 gap-1">
                                {replacementOptions.length === 0 ? (
                                  <div className="col-span-4 text-[11px] text-white/40 text-center py-2">
                                    Nenhum outro personagem disponivel
                                  </div>
                                ) : (
                                  replacementOptions.map(option => (
                                    <button
                                      key={`scene-char-replace-${segment.id}-${index}-${option.id}`}
                                      type="button"
                                      onClick={() => {
                                        replaceSceneCharacterAtIndex(segment, index, option.id);
                                        setSceneReferencePicker(null);
                                      }}
                                      onMouseEnter={(e) => showHoverImagePreview(e, option.imageUrl, option.character || `Personagem ${option.id}`)}
                                      onMouseLeave={hideHoverImagePreview}
                                      disabled={isReferencesDisabled}
                                      className={`w-full aspect-square rounded border overflow-hidden transition-all ${
                                        isReferencesDisabled
                                          ? 'opacity-60 cursor-not-allowed border-white/10'
                                          : 'border-white/20 hover:border-yellow-300/60'
                                      }`}
                                      title={option.character || `Personagem ${option.id}`}
                                    >
                                      {option.imageUrl ? (
                                        <img
                                          src={getMediaSrc(option.imageUrl)}
                                          alt={option.character || `Personagem ${option.id}`}
                                          className="w-full h-full object-cover"
                                          loading="lazy"
                                          decoding="async"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[9px] text-white/35 px-1 text-center">
                                          #{option.id}
                                        </div>
                                      )}
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {sceneCharacterSlots.length === 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!canAddCharacterToScene) return;
                          addCharacterToScene(segment, availableCharacterIds[0]);
                        }}
                        disabled={!canAddCharacterToScene || isReferencesDisabled}
                        className={`w-16 h-16 rounded-md border-2 border-dashed text-xs transition-all ${
                          !canAddCharacterToScene || isReferencesDisabled
                            ? 'border-white/10 text-white/25 cursor-not-allowed'
                            : 'border-yellow-500/40 text-yellow-200 hover:border-yellow-300/70 hover:bg-yellow-500/10'
                        }`}
                        title="Adicionar personagem"
                      >
                        + P
                      </button>
                    )}

                    <div className="relative" data-scene-reference-root="true">
                      <button
                        type="button"
                        onClick={() => {
                          if (isReferencesDisabled) return;
                          setSceneReferencePicker(current =>
                            current?.segmentId === segment.id && current.kind === 'location'
                              ? null
                              : { segmentId: segment.id, kind: 'location' }
                          );
                        }}
                        onMouseEnter={(e) => showHoverImagePreview(e, sceneLocationReference?.imageUrl, sceneLocationReference?.location || 'Local')}
                        onMouseLeave={hideHoverImagePreview}
                        disabled={isReferencesDisabled || sortedLocationReferences.length === 0}
                        className={`group/ref-thumb relative w-16 h-16 rounded-md border bg-black/30 overflow-hidden transition-all ${
                          isLocationPickerOpen
                            ? 'border-cyan-300 ring-2 ring-cyan-300/30'
                            : 'border-cyan-500/30 hover:border-cyan-300/60'
                        } ${(isReferencesDisabled || sortedLocationReferences.length === 0) ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        {sceneLocationReference?.imageUrl ? (
                          <img
                            src={getMediaSrc(sceneLocationReference.imageUrl)}
                            alt={sceneLocationReference.location || `Lugar ${sceneLocationReference?.id || ''}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-white/30 text-center px-1">
                            Sem local
                          </div>
                        )}
                        <span className="absolute inset-0 pointer-events-none flex items-center justify-center bg-black/35 opacity-0 group-hover/ref-thumb:opacity-100 transition-opacity">
                          <span className="w-9 h-9 rounded-full border-2 border-white bg-black/35 flex items-center justify-center">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9"/>
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>
                            </svg>
                          </span>
                        </span>
                      </button>
                      <p className="mt-1 text-[10px] text-cyan-200 truncate w-16" title={sceneLocationReference?.location || 'Local'}>
                        {sceneLocationReference?.location || 'Local'}
                      </p>

                      {isLocationPickerOpen && (
                        <div
                          className="absolute top-full left-0 mt-2 z-40 w-[230px] rounded-lg border border-cyan-500/30 bg-[#1a1a2e] p-2 shadow-xl"
                          onMouseLeave={() => setSceneReferencePicker(null)}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] text-cyan-200 font-medium">Local</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  if (!canAddLocationToScene || isReferencesDisabled) return;
                                  const firstLocationId = sortedLocationReferences[0]?.id;
                                  if (!firstLocationId) return;
                                  updateSceneLocationId(segment.id, firstLocationId);
                                }}
                                disabled={!canAddLocationToScene || isReferencesDisabled}
                                className={`w-6 h-6 rounded border text-xs transition-all ${
                                  !canAddLocationToScene || isReferencesDisabled
                                    ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                                    : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/30'
                                }`}
                                title="Adicionar local"
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  updateSceneLocationId(segment.id, null);
                                  setSceneReferencePicker(null);
                                }}
                                disabled={isReferencesDisabled || !sceneLocationId}
                                className={`w-6 h-6 rounded border text-xs transition-all ${
                                  isReferencesDisabled || !sceneLocationId
                                    ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                                    : 'bg-red-500/20 border-red-500/40 text-red-200 hover:bg-red-500/30'
                                }`}
                                title="Remover local"
                              >
                                x
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-4 gap-1">
                            {sortedLocationReferences.filter(item => item.id !== sceneLocationId).length === 0 ? (
                              <div className="col-span-4 text-[11px] text-white/40 text-center py-2">
                                Nenhum outro local disponivel
                              </div>
                            ) : (
                              sortedLocationReferences
                                .filter(item => item.id !== sceneLocationId)
                                .map(option => (
                                  <button
                                    key={`scene-location-replace-${segment.id}-${option.id}`}
                                    type="button"
                                    onClick={() => {
                                      updateSceneLocationId(segment.id, option.id);
                                      setSceneReferencePicker(null);
                                    }}
                                    onMouseEnter={(e) => showHoverImagePreview(e, option.imageUrl, option.location || `Lugar ${option.id}`)}
                                    onMouseLeave={hideHoverImagePreview}
                                    disabled={isReferencesDisabled || (!sceneLocationId && !canAddLocationToScene)}
                                    className={`w-full aspect-square rounded border overflow-hidden transition-all ${
                                      isReferencesDisabled || (!sceneLocationId && !canAddLocationToScene)
                                        ? 'opacity-60 cursor-not-allowed border-white/10'
                                        : 'border-white/20 hover:border-cyan-300/60'
                                    }`}
                                    title={option.location || `Lugar ${option.id}`}
                                  >
                                    {option.imageUrl ? (
                                      <img
                                        src={getMediaSrc(option.imageUrl)}
                                        alt={option.location || `Lugar ${option.id}`}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                        decoding="async"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-[9px] text-white/35 px-1 text-center">
                                        #{option.id}
                                      </div>
                                    )}
                                  </button>
                                ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

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
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-xs text-white/60">firstFrame</p>
                        <div className="flex items-center gap-2">
                          {isVideoFramePairTranslating && (
                            <div className="px-2 py-0.5 rounded-md bg-cyan-500/20 border border-cyan-400/40 text-cyan-100 text-[10px]">
                              Traduzindo...
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleVideoFramePairPromptView(segment)}
                            disabled={!onSegmentsUpdate}
                            className={`px-2 py-0.5 rounded-md text-[10px] border transition-all ${
                              !onSegmentsUpdate
                                ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                                : 'bg-black/70 border-white/20 text-white/70 hover:border-pink-400/70 hover:text-white'
                            }`}
                            title="Alternar tradução/original para firstFrame e animateFrame"
                          >
                            {videoFramePairViewMode === 'translated' ? 'Tradução' : 'Original'}
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={firstFrameValue}
                        onChange={(e) => handleScenePromptFieldChange(segment.id, 'firstFrame', e.target.value)}
                        rows={4}
                        className="w-full min-h-[7rem] bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/30 focus:border-pink-500 focus:outline-none resize-y p-4 custom-scrollbar"
                        placeholder={firstFramePlaceholder}
                        disabled={!onSegmentsUpdate}
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-xs text-white/60">animateFrame</p>
                        <button
                          type="button"
                          onClick={() => handleRegenerateAnimateFramePrompt(segment)}
                          disabled={!canRegenerateAnimateFramePrompt}
                          className={`px-2 py-0.5 rounded-md text-[10px] border transition-all ${
                            !canRegenerateAnimateFramePrompt
                              ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                              : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-100 hover:bg-emerald-500/25'
                          }`}
                          title={segmentFirstFrameImagePath
                            ? 'Regenerar animateFrame usando a imagem do firstFrame'
                            : 'Gere ou envie a imagem do firstFrame para habilitar'}
                        >
                          {isRegeneratingAnimateFrame ? 'Regenerando...' : '↻ Regerar com firstFrame'}
                        </button>
                      </div>
                      <textarea
                        value={animateFrameValue}
                        onChange={(e) => handleScenePromptFieldChange(segment.id, 'animateFrame', e.target.value)}
                        rows={4}
                        className="w-full min-h-[7rem] bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/30 focus:border-pink-500 focus:outline-none resize-y p-4 custom-scrollbar"
                        placeholder={animateFramePlaceholder}
                        disabled={!onSegmentsUpdate}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-end gap-2">
                      {isImagePromptTranslating && (
                        <div className="px-2 py-0.5 rounded-md bg-cyan-500/20 border border-cyan-400/40 text-cyan-100 text-[10px]">
                          Traduzindo...
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleScenePromptView(segment, 'imagePrompt')}
                        disabled={!onSegmentsUpdate}
                        className={`px-2 py-0.5 rounded-md text-[10px] border transition-all ${
                          !onSegmentsUpdate
                            ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                            : 'bg-black/70 border-white/20 text-white/70 hover:border-pink-400/70 hover:text-white'
                        }`}
                        title="Alternar entre tradução e original"
                      >
                        {imagePromptViewMode === 'translated' ? 'Tradução' : 'Original'}
                      </button>
                    </div>
                    <textarea
                      value={imagePromptValue}
                      onChange={(e) => handleScenePromptFieldChange(segment.id, 'imagePrompt', e.target.value)}
                      rows={6}
                      className="w-full min-h-[9.5rem] bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/30 focus:border-pink-500 focus:outline-none resize-y p-4 custom-scrollbar"
                      placeholder={imagePromptPlaceholder}
                    />
                  </div>
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
                                  if (svc.id === 'veo3' || svc.id === 'veo3-lite-flow' || svc.id === 'veo2-flow' || svc.id === 'grok') {
                                    setImageCount(prev => ({ ...prev, [segment.id]: 1 }));
                                  }
                                  if (IMAGE_SERVICES.has(svc.id)) {
                                    setIngredientMode(prev => ({ ...prev, [segment.id]: 'ingredients' }));
                                  }
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
        {filteredSegments.length === 0 && (
          <div className="col-span-full p-6 bg-white/5 border border-white/10 rounded-xl text-center">
            <p className="text-white/70 text-sm">
              Nenhuma cena corresponde aos filtros atuais.
            </p>
          </div>
        )}
      </div>

      {hoverImagePreview && (
        <div
          className="fixed z-[120] pointer-events-none"
          style={{
            left: hoverImagePreview.x,
            top: hoverImagePreview.y,
          }}
        >
          <div
            className="rounded-xl border border-white/20 bg-black/85 p-1.5 shadow-2xl backdrop-blur-sm overflow-hidden"
            style={{
              maxWidth: 'min(56vw, 520px)',
              maxHeight: 'min(72vh, 560px)',
            }}
          >
            <div className="rounded-lg overflow-hidden bg-black/40">
              <img
                src={hoverImagePreview.src}
                alt={hoverImagePreview.label || 'Preview'}
                className="block w-auto h-auto object-contain max-w-full"
                style={{
                  maxWidth: 'min(56vw, 520px)',
                  maxHeight: 'min(72vh, 520px)',
                }}
              />
            </div>
            {hoverImagePreview.label && (
              <p className="text-[11px] text-white/75 px-1 pt-1.5 leading-tight max-w-[520px] truncate">
                {hoverImagePreview.label}
              </p>
            )}
          </div>
        </div>
      )}

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
                    onUpdateImage(current.segmentId, current.httpUrls[pickerSelectedIdx], undefined, current.generationService);
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
                <p className="text-white/50 text-sm">Extraia itens da transcrição com IA, gere imagens e use drag and drop para enviar/trocar referências visuais.</p>
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
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
                <div>
                  <label className="block text-xs text-white/60 mb-1">Provider de geração de imagem</label>
                  <select
                    value={storyReferenceImageProvider}
                    onChange={(e) => setStoryReferenceImageProvider(e.target.value as StoryReferenceImageProvider)}
                    disabled={referenceGenerating.size > 0 || referenceUploading.size > 0}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-pink-500 focus:outline-none disabled:opacity-60"
                  >
                    <option value="flow-image">Flow (UI)</option>
                    <option value="flow-image-api">Nano Banana 2</option>
                    <option value="flow-image-pro">Nano Banana Pro</option>
                  </select>
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
                      const characterKey = getStoryReferenceKey('character', character.id);
                      const isUploadingRef = referenceUploading.has(characterKey);
                      const isGeneratingRef = referenceGenerating.has(characterKey);
                      const isBusyRef = isUploadingRef || isGeneratingRef;
                      const normalizedReferenceId = toPositiveInt(character.reference_id);
                      const characterReferenceOptions = characterReferences
                        .map(item => item.id)
                        .filter(id => id !== character.id)
                        .sort((a, b) => a - b);
                      const hasPrompt = String(character.prompt_en || '').trim().length > 0;
                      const hasValidReferenceImage = normalizedReferenceId
                        ? Boolean(characterImages[normalizedReferenceId])
                        : true;
                      return (
                        <div key={`character-${character.id}`} className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3 relative group/story-ref">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeCharacterReference(character.id);
                            }}
                            disabled={isBusyRef}
                            className={`absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg flex items-center justify-center transition-opacity z-20 transform hover:scale-110 ${
                              isBusyRef
                                ? 'opacity-40 cursor-not-allowed'
                                : 'opacity-0 group-hover/story-ref:opacity-100'
                            }`}
                            title="Excluir personagem"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 6 6 18M6 6l12 12"/>
                            </svg>
                          </button>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              {editingCharacterNameId === character.id ? (
                                <input
                                  autoFocus
                                  value={characterNameDraft}
                                  onChange={(e) => setCharacterNameDraft(e.target.value)}
                                  onBlur={() => commitCharacterNameEdition(character.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      commitCharacterNameEdition(character.id);
                                    }
                                    if (e.key === 'Escape') {
                                      e.preventDefault();
                                      cancelCharacterNameEdition(character.id);
                                    }
                                  }}
                                  className="w-full max-w-[260px] bg-black/40 border border-white/15 rounded-md px-2 py-1 text-white text-sm focus:border-yellow-500 focus:outline-none"
                                />
                              ) : (
                                <>
                                  <div className="text-white text-sm font-medium truncate">
                                    #{character.id} {character.character || `Personagem ${character.id}`}
                                  </div>
                                  <button
                                    onClick={() => startEditingCharacterName(character)}
                                    disabled={isBusyRef}
                                    className={`p-1 rounded-md transition-all ${
                                      isBusyRef
                                        ? 'text-white/20 cursor-not-allowed'
                                        : 'text-white/40 hover:text-white hover:bg-white/10'
                                    }`}
                                    title="Editar nome"
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M12 20h9"/>
                                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>
                                    </svg>
                                  </button>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="flex items-center gap-1 text-xs text-white/60">
                                <span>Ref #</span>
                                <select
                                  value={normalizedReferenceId ?? ''}
                                  onChange={(e) => {
                                    const rawValue = e.target.value;
                                    const nextReferenceId = rawValue === '' ? null : toPositiveInt(rawValue);
                                    setCharacterReferences(prev => prev.map(item =>
                                      item.id === character.id
                                        ? { ...item, reference_id: nextReferenceId }
                                        : item
                                    ));
                                  }}
                                  disabled={isBusyRef}
                                  className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[11px] text-white focus:border-yellow-500 focus:outline-none disabled:opacity-60"
                                >
                                  <option value="">base</option>
                                  {characterReferenceOptions.map(id => (
                                    <option key={`char-ref-${character.id}-${id}`} value={id}>
                                      {id}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          </div>

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

                          <div
                            className="aspect-video relative group rounded-xl border-2 border-dashed border-white/20 hover:border-yellow-500/50 hover:bg-yellow-500/5 transition-all overflow-hidden flex items-center justify-center bg-white/5 cursor-pointer"
                            onDragOver={(e) => {
                              if (isBusyRef) return;
                              e.preventDefault();
                              e.stopPropagation();
                              e.currentTarget.classList.add('border-yellow-400/70', 'bg-yellow-500/10');
                            }}
                            onDragLeave={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              e.currentTarget.classList.remove('border-yellow-400/70', 'bg-yellow-500/10');
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              e.currentTarget.classList.remove('border-yellow-400/70', 'bg-yellow-500/10');
                              if (isBusyRef) return;
                              const file = e.dataTransfer.files?.[0];
                              if (!file) return;
                              if (!isImageFile(file)) {
                                alertInvalidImageFile();
                                return;
                              }
                              handleCharacterImageUpload(character.id, file);
                            }}
                          >
                            {isBusyRef && (
                              <div className="absolute inset-0 bg-black/70 z-30 flex items-center justify-center">
                                <div className="text-center">
                                  <div className="w-8 h-8 mx-auto mb-2 border-2 border-yellow-500/30 border-t-yellow-400 rounded-full animate-spin" />
                                  <p className="text-white/70 text-xs">
                                    {isUploadingRef ? 'Enviando imagem...' : 'Gerando imagem...'}
                                  </p>
                                </div>
                              </div>
                            )}
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
                                      disabled={isBusyRef}
                                      onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) handleCharacterImageUpload(character.id, file);
                                      }}
                                    />
                                  </label>
                                  <button
                                    onClick={() => handleRemoveCharacterImage(character.id)}
                                    disabled={isBusyRef}
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
                                  disabled={isBusyRef}
                                  onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) handleCharacterImageUpload(character.id, file);
                                  }}
                                />
                              </label>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <button
                              onClick={() => handleGenerateCharacterImage(character)}
                              disabled={isBusyRef || !hasPrompt || !hasValidReferenceImage}
                              className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                                isBusyRef || !hasPrompt || !hasValidReferenceImage
                                  ? 'bg-white/5 border-white/10 text-white/40 cursor-not-allowed'
                                  : 'bg-yellow-500/15 hover:bg-yellow-500/25 border-yellow-500/40 text-yellow-200'
                              }`}
                              title={normalizedReferenceId && !hasValidReferenceImage
                                ? `Adicione uma imagem para ref #${normalizedReferenceId} antes de gerar.`
                                : 'Gerar imagem com IA'}
                            >
                              {imgUrl ? '↻ Regerar' : '✨ Gerar'}
                            </button>
                            {normalizedReferenceId && (
                              <span className={`text-[11px] ${hasValidReferenceImage ? 'text-white/50' : 'text-red-300'}`}>
                                {hasValidReferenceImage
                                  ? `Usará ref #${normalizedReferenceId}`
                                  : `Ref #${normalizedReferenceId} sem imagem`}
                              </span>
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
                      const locationKey = getStoryReferenceKey('location', location.id);
                      const isUploadingRef = referenceUploading.has(locationKey);
                      const isGeneratingRef = referenceGenerating.has(locationKey);
                      const isBusyRef = isUploadingRef || isGeneratingRef;
                      const normalizedReferenceId = toPositiveInt(location.reference_id);
                      const locationReferenceOptions = locationReferences
                        .map(item => item.id)
                        .filter(id => id !== location.id)
                        .sort((a, b) => a - b);
                      const hasPrompt = String(location.prompt_en || '').trim().length > 0;
                      const hasValidReferenceImage = normalizedReferenceId
                        ? Boolean(locationImages[normalizedReferenceId])
                        : true;
                      return (
                        <div key={`location-${location.id}`} className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3 relative group/story-ref">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeLocationReference(location.id);
                            }}
                            disabled={isBusyRef}
                            className={`absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg flex items-center justify-center transition-opacity z-20 transform hover:scale-110 ${
                              isBusyRef
                                ? 'opacity-40 cursor-not-allowed'
                                : 'opacity-0 group-hover/story-ref:opacity-100'
                            }`}
                            title="Excluir lugar"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 6 6 18M6 6l12 12"/>
                            </svg>
                          </button>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              {editingLocationNameId === location.id ? (
                                <input
                                  autoFocus
                                  value={locationNameDraft}
                                  onChange={(e) => setLocationNameDraft(e.target.value)}
                                  onBlur={() => commitLocationNameEdition(location.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      commitLocationNameEdition(location.id);
                                    }
                                    if (e.key === 'Escape') {
                                      e.preventDefault();
                                      cancelLocationNameEdition(location.id);
                                    }
                                  }}
                                  className="w-full max-w-[260px] bg-black/40 border border-white/15 rounded-md px-2 py-1 text-white text-sm focus:border-cyan-500 focus:outline-none"
                                />
                              ) : (
                                <>
                                  <div className="text-white text-sm font-medium truncate">
                                    #{location.id} {location.location || `Lugar ${location.id}`}
                                  </div>
                                  <button
                                    onClick={() => startEditingLocationName(location)}
                                    disabled={isBusyRef}
                                    className={`p-1 rounded-md transition-all ${
                                      isBusyRef
                                        ? 'text-white/20 cursor-not-allowed'
                                        : 'text-white/40 hover:text-white hover:bg-white/10'
                                    }`}
                                    title="Editar nome"
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M12 20h9"/>
                                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>
                                    </svg>
                                  </button>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="flex items-center gap-1 text-xs text-white/60">
                                <span>Ref #</span>
                                <select
                                  value={normalizedReferenceId ?? ''}
                                  onChange={(e) => {
                                    const rawValue = e.target.value;
                                    const nextReferenceId = rawValue === '' ? null : toPositiveInt(rawValue);
                                    setLocationReferences(prev => prev.map(item =>
                                      item.id === location.id
                                        ? { ...item, reference_id: nextReferenceId }
                                        : item
                                    ));
                                  }}
                                  disabled={isBusyRef}
                                  className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[11px] text-white focus:border-cyan-500 focus:outline-none disabled:opacity-60"
                                >
                                  <option value="">base</option>
                                  {locationReferenceOptions.map(id => (
                                    <option key={`location-ref-${location.id}-${id}`} value={id}>
                                      {id}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          </div>

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

                          <div
                            className="aspect-video relative group rounded-xl border-2 border-dashed border-white/20 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all overflow-hidden flex items-center justify-center bg-white/5 cursor-pointer"
                            onDragOver={(e) => {
                              if (isBusyRef) return;
                              e.preventDefault();
                              e.stopPropagation();
                              e.currentTarget.classList.add('border-cyan-400/70', 'bg-cyan-500/10');
                            }}
                            onDragLeave={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              e.currentTarget.classList.remove('border-cyan-400/70', 'bg-cyan-500/10');
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              e.currentTarget.classList.remove('border-cyan-400/70', 'bg-cyan-500/10');
                              if (isBusyRef) return;
                              const file = e.dataTransfer.files?.[0];
                              if (!file) return;
                              if (!isImageFile(file)) {
                                alertInvalidImageFile();
                                return;
                              }
                              handleLocationImageUpload(location.id, file);
                            }}
                          >
                            {isBusyRef && (
                              <div className="absolute inset-0 bg-black/70 z-30 flex items-center justify-center">
                                <div className="text-center">
                                  <div className="w-8 h-8 mx-auto mb-2 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
                                  <p className="text-white/70 text-xs">
                                    {isUploadingRef ? 'Enviando imagem...' : 'Gerando imagem...'}
                                  </p>
                                </div>
                              </div>
                            )}
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
                                      disabled={isBusyRef}
                                      onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) handleLocationImageUpload(location.id, file);
                                      }}
                                    />
                                  </label>
                                  <button
                                    onClick={() => handleRemoveLocationImage(location.id)}
                                    disabled={isBusyRef}
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
                                  disabled={isBusyRef}
                                  onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) handleLocationImageUpload(location.id, file);
                                  }}
                                />
                              </label>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <button
                              onClick={() => handleGenerateLocationImage(location)}
                              disabled={isBusyRef || !hasPrompt || !hasValidReferenceImage}
                              className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                                isBusyRef || !hasPrompt || !hasValidReferenceImage
                                  ? 'bg-white/5 border-white/10 text-white/40 cursor-not-allowed'
                                  : 'bg-cyan-500/15 hover:bg-cyan-500/25 border-cyan-500/40 text-cyan-100'
                              }`}
                              title={normalizedReferenceId && !hasValidReferenceImage
                                ? `Adicione uma imagem para ref #${normalizedReferenceId} antes de gerar.`
                                : 'Gerar imagem com IA'}
                            >
                              {imgUrl ? '↻ Regerar' : '✨ Gerar'}
                            </button>
                            {normalizedReferenceId && (
                              <span className={`text-[11px] ${hasValidReferenceImage ? 'text-white/50' : 'text-red-300'}`}>
                                {hasValidReferenceImage
                                  ? `Usará ref #${normalizedReferenceId}`
                                  : `Ref #${normalizedReferenceId} sem imagem`}
                              </span>
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
