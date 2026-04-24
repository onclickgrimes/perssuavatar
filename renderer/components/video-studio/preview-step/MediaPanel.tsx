import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FILMORA } from './constants';
import type { MotionGraphicsReferenceImage } from '../../../types/video-studio';
import type {
  MotionGraphicsClipSummary,
  MediaPanelTab,
  MotionGraphicsChatMessage,
} from './motion-graphics/types';
import { isMotionGraphicsSegment } from './motion-graphics/types';

type PexelsOrientation = 'landscape' | 'portrait' | 'square';
type PexelsMediaType = 'video' | 'photo';
type PexelsSortOption = 'relevance' | 'duration_desc' | 'duration_asc' | 'resolution_desc' | 'resolution_asc';
type PexelsSizeOption = 'any' | 'small' | 'medium' | 'large';
type PexelsOrientationFilter = 'auto' | PexelsOrientation;

interface PexelsMediaAuthor {
  name?: string;
  url?: string;
}

interface PexelsMediaResult {
  id: number | string;
  type: PexelsMediaType;
  width: number;
  height: number;
  duration?: number;
  thumbnail: string;
  url: string;
  directUrl: string;
  author?: PexelsMediaAuthor;
  attribution?: string;
}

interface SearchPexelsMediaResponse {
  success: boolean;
  results?: PexelsMediaResult[];
  page?: number;
  hasNextPage?: boolean;
  error?: string;
}

interface TimelineDragPayload {
  source: 'pexels-media-panel';
  id: number | string;
  type: PexelsMediaType;
  directUrl: string;
  thumbnail: string;
  width: number;
  height: number;
  duration?: number;
  attribution?: string;
  author?: PexelsMediaAuthor;
  url?: string;
}

const MEDIA_DRAG_MIME = 'application/x-video-studio-media';
const MEDIA_DRAG_MIME_FALLBACK = 'text/x-video-studio-media';
const MEDIA_DRAG_TEXT_PREFIX = 'video-studio-media:';
const MAX_REMOTION_REFERENCE_IMAGES = 4;
const MAX_REMOTION_REFERENCE_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const REMOTION_CHAT_THEME = {
  bg: '#111111',
  surface: '#212121',
  surfaceMuted: '#181818',
  surfaceAlt: '#262626',
  border: '#313131',
  borderStrong: '#3a3a3a',
  text: '#f5f5f5',
  textMuted: '#d4d4d8',
  textDim: '#7a7a7a',
  placeholder: '#686868',
  accent: '#3b82f6',
  accentMuted: 'rgba(59,130,246,0.16)',
  icon: '#cfcfcf',
};
const DEFAULT_REMOTION_MODEL_OPTION = 'gemini:gemini-3.1-pro-preview';
const remotionChatTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
});

type MotionGraphicsProviderOption = 'gemini' | 'openai' | 'deepseek';

interface MotionGraphicsModelOption {
  value: string;
  provider: MotionGraphicsProviderOption;
  model: string;
  label: string;
  composerLabel: string;
}

const MOTION_GRAPHICS_MODEL_OPTIONS: MotionGraphicsModelOption[] = [
  {
    value: 'openai:gpt-5.4-mini',
    provider: 'openai',
    model: 'gpt-5.4-mini',
    label: 'GPT 5.4 Mini',
    composerLabel: 'GPT-5.4 Mini',
  },
  {
    value: 'openai:gpt-5.4',
    provider: 'openai',
    model: 'gpt-5.4',
    label: 'GPT 5.4',
    composerLabel: 'GPT-5.4',
  },
  {
    value: 'gemini:gemini-3.1-pro-preview',
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    composerLabel: 'Gemini 3.1 Pro',
  },
  {
    value: 'gemini:gemini-3-flash-preview',
    provider: 'gemini',
    model: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    composerLabel: 'Gemini 3 Flash',
  },
  {
    value: 'gemini:gemini-3.1-flash-lite-preview',
    provider: 'gemini',
    model: 'gemini-3.1-flash-lite-preview',
    label: 'Gemini 3.1 Flash Lite',
    composerLabel: 'Gemini 3.1 Flash Lite',
  },
  {
    value: 'deepseek:deepseek-chat',
    provider: 'deepseek',
    model: 'deepseek-chat',
    label: 'DeepSeek Chat V3',
    composerLabel: 'DeepSeek Chat',
  },
  {
    value: 'deepseek:deepseek-reasoner',
    provider: 'deepseek',
    model: 'deepseek-reasoner',
    label: 'DeepSeek Reasoner R1',
    composerLabel: 'DeepSeek Reasoner',
  },
];

interface MediaPanelProps {
  activeTab: MediaPanelTab;
  onActiveTabChange: (tab: MediaPanelTab) => void;
  selectedRatio: string;
  selectedSeg: any | null;
  onApplyPexelsVideoToSelected: (media: PexelsMediaResult) => void;
  remotionClips: MotionGraphicsClipSummary[];
  selectedRemotionClipId: number | null;
  onSelectRemotionClip: (clipId: number) => void;
  onCreateRemotionClip: () => void;
  remotionMessages: MotionGraphicsChatMessage[];
  onRemotionSubmit: (
    prompt: string,
    options?: {
      attachedImages?: MotionGraphicsReferenceImage[];
      selectedSkills?: string[];
      provider?: MotionGraphicsProviderOption;
      model?: string;
    },
  ) => Promise<boolean> | boolean;
  isRemotionGenerating: boolean;
  remotionGenerationError: string | null;
  remotionCompileError: string | null;
  hasRemotionCode: boolean;
  onResetRemotion: () => void;
  remotionDurationLabel: string;
}

interface MotionGraphicsSkillLibraryItem {
  id: string;
  slug: string;
  title: string;
  description?: string;
  kind: 'skill';
  packageId: string;
  packageName: string;
  source: 'builtin' | 'imported';
  tags: string[];
  hasAssets: boolean;
}

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler imagem.'));
    reader.readAsDataURL(file);
  });
};

const formatMotionGraphicsSkillLabel = (value: string): string => {
  const normalizedValue = String(value || '').split('/').pop() || String(value || '');
  return normalizedValue
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const formatChatTimestamp = (timestamp?: number): string => {
  const normalizedTimestamp = Number(timestamp || 0);
  if (!Number.isFinite(normalizedTimestamp) || normalizedTimestamp <= 0) {
    return '--:--';
  }

  return remotionChatTimeFormatter.format(new Date(normalizedTimestamp));
};

const resolveMotionGraphicsModelOption = (
  provider?: string,
  model?: string,
): MotionGraphicsModelOption | null => {
  const normalizedProvider = String(provider || '').trim();
  const normalizedModel = String(model || '').trim();
  if (!normalizedProvider && !normalizedModel) {
    return null;
  }

  return MOTION_GRAPHICS_MODEL_OPTIONS.find((option) => (
    option.provider === normalizedProvider
    && option.model === normalizedModel
  )) || MOTION_GRAPHICS_MODEL_OPTIONS.find((option) => option.model === normalizedModel) || null;
};

const getOrientationFromRatio = (ratio: string): PexelsOrientation => {
  if (ratio === '1:1') return 'square';
  if (ratio === '9:16' || ratio === '3:4' || ratio === '4:5') return 'portrait';
  return 'landscape';
};

const formatDuration = (durationSec?: number): string => {
  const normalized = Number(durationSec || 0);
  if (!Number.isFinite(normalized) || normalized <= 0) return '0s';
  const total = Math.round(normalized);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const sortPexelsResults = (results: PexelsMediaResult[], sortBy: PexelsSortOption): PexelsMediaResult[] => {
  const sorted = [...results];
  if (sortBy === 'relevance') {
    return sorted;
  }

  sorted.sort((left, right) => {
    if (sortBy === 'duration_desc') {
      return Number(right.duration || 0) - Number(left.duration || 0);
    }
    if (sortBy === 'duration_asc') {
      return Number(left.duration || 0) - Number(right.duration || 0);
    }

    const leftArea = Number(left.width || 0) * Number(left.height || 0);
    const rightArea = Number(right.width || 0) * Number(right.height || 0);
    if (sortBy === 'resolution_desc') {
      return rightArea - leftArea;
    }
    return leftArea - rightArea;
  });

  return sorted;
};

const dedupeResults = (results: PexelsMediaResult[]): PexelsMediaResult[] => {
  const unique = new Map<string, PexelsMediaResult>();
  results.forEach((item) => {
    unique.set(`${item.type}-${item.id}`, item);
  });
  return Array.from(unique.values());
};

const PanelIcons = {
  pexels: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M8 8h5a3 3 0 0 1 0 6H8z" />
    </svg>
  ),
  library: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3.5 6.5A2.5 2.5 0 0 1 6 4h5l2 2h5a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 18H6a2.5 2.5 0 0 1-2.5-2.5z" />
    </svg>
  ),
  remotion: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
      <path d="m10 9 5 3-5 3z" />
    </svg>
  ),
  search: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  gear: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.5 1.5 0 0 1 0 2.1l-.3.3a1.5 1.5 0 0 1-2.1 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V19a1.5 1.5 0 0 1-1.5 1.5h-.5A1.5 1.5 0 0 1 10 19v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.5 1.5 0 0 1-2.1 0l-.3-.3a1.5 1.5 0 0 1 0-2.1l.1-.1A1 1 0 0 0 6 15a1 1 0 0 0-.9-.6H5a1.5 1.5 0 0 1-1.5-1.5v-.5A1.5 1.5 0 0 1 5 10.9h.2A1 1 0 0 0 6 10a1 1 0 0 0-.2-1.1l-.1-.1a1.5 1.5 0 0 1 0-2.1l.3-.3a1.5 1.5 0 0 1 2.1 0l.1.1A1 1 0 0 0 9.4 6a1 1 0 0 0 .6-.9V5A1.5 1.5 0 0 1 11.5 3.5h.5A1.5 1.5 0 0 1 13.5 5v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.5 1.5 0 0 1 2.1 0l.3.3a1.5 1.5 0 0 1 0 2.1l-.1.1A1 1 0 0 0 18 10a1 1 0 0 0 .9.6h.2a1.5 1.5 0 0 1 1.5 1.5v.5a1.5 1.5 0 0 1-1.5 1.5h-.2a1 1 0 0 0-.9.6Z" />
    </svg>
  ),
  plus: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  bookOpen: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 6.5A2.5 2.5 0 0 1 5 4h5a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H5a2.5 2.5 0 0 0-2.5 2.5z" />
      <path d="M21.5 6.5A2.5 2.5 0 0 0 19 4h-5a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h5a2.5 2.5 0 0 1 2.5 2.5z" />
    </svg>
  ),
  paperclip: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.4 11.1-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 1 1 5.7 5.6l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5" />
    </svg>
  ),
  camera: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h1.8l1.2-1.5h5l1.2 1.5h1.8A2.5 2.5 0 0 1 21 7.5v9A2.5 2.5 0 0 1 18.5 19h-12A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  ),
  arrowUp: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  ),
};

export function MediaPanel({
  activeTab,
  onActiveTabChange,
  selectedRatio,
  selectedSeg,
  onApplyPexelsVideoToSelected,
  remotionClips,
  selectedRemotionClipId,
  onSelectRemotionClip,
  onCreateRemotionClip,
  remotionMessages,
  onRemotionSubmit,
  isRemotionGenerating,
  remotionGenerationError,
  remotionCompileError,
  hasRemotionCode,
  onResetRemotion,
  remotionDurationLabel,
}: MediaPanelProps) {
  const [activePexelsType, setActivePexelsType] = useState<PexelsMediaType>('video');
  const [queryInput, setQueryInput] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [sortBy, setSortBy] = useState<PexelsSortOption>('relevance');
  const [sizeFilter, setSizeFilter] = useState<PexelsSizeOption>('any');
  const [orientationFilter, setOrientationFilter] = useState<PexelsOrientationFilter>('auto');
  const [results, setResults] = useState<PexelsMediaResult[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remotionDraft, setRemotionDraft] = useState('');
  const [remotionAttachedImages, setRemotionAttachedImages] = useState<MotionGraphicsReferenceImage[]>([]);
  const [remotionAttachmentError, setRemotionAttachmentError] = useState<string | null>(null);
  const [isRemotionDragging, setIsRemotionDragging] = useState(false);
  const [motionGraphicsSkills, setMotionGraphicsSkills] = useState<MotionGraphicsSkillLibraryItem[]>([]);
  const [motionGraphicsSkillError, setMotionGraphicsSkillError] = useState<string | null>(null);
  const [motionGraphicsSkillNotice, setMotionGraphicsSkillNotice] = useState<string | null>(null);
  const [selectedRemotionSkills, setSelectedRemotionSkills] = useState<string[]>([]);
  const [isLoadingMotionGraphicsSkills, setIsLoadingMotionGraphicsSkills] = useState(false);
  const [isImportingMotionGraphicsSkills, setIsImportingMotionGraphicsSkills] = useState(false);
  const [showAllMotionGraphicsSkills, setShowAllMotionGraphicsSkills] = useState(false);
  const [isRemotionSkillPanelOpen, setIsRemotionSkillPanelOpen] = useState(false);
  const [selectedRemotionModelValue, setSelectedRemotionModelValue] = useState(DEFAULT_REMOTION_MODEL_OPTION);

  const requestIdRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const remotionFileInputRef = useRef<HTMLInputElement | null>(null);
  const remotionChatEndRef = useRef<HTMLDivElement | null>(null);
  const remotionSkillPanelRef = useRef<HTMLDivElement | null>(null);
  const remotionSkillButtonRef = useRef<HTMLButtonElement | null>(null);

  const autoOrientation = useMemo(() => getOrientationFromRatio(selectedRatio), [selectedRatio]);
  const canApplyToSelectedSegment = Boolean(selectedSeg && !isMotionGraphicsSegment(selectedSeg));
  const motionGraphicsSkillLabels = useMemo(() => {
    return new Map(motionGraphicsSkills.map((skill) => [skill.id, skill.title]));
  }, [motionGraphicsSkills]);
  const visibleMotionGraphicsSkills = useMemo(() => {
    return showAllMotionGraphicsSkills
      ? motionGraphicsSkills
      : motionGraphicsSkills.slice(0, 8);
  }, [motionGraphicsSkills, showAllMotionGraphicsSkills]);
  const selectedRemotionModelOption = useMemo(() => {
    return MOTION_GRAPHICS_MODEL_OPTIONS.find((option) => option.value === selectedRemotionModelValue)
      || MOTION_GRAPHICS_MODEL_OPTIONS.find((option) => option.value === DEFAULT_REMOTION_MODEL_OPTION)
      || MOTION_GRAPHICS_MODEL_OPTIONS[0];
  }, [selectedRemotionModelValue]);
  const selectedSceneReferenceUrl = useMemo(() => {
    const candidates = [selectedSeg?.sourceImageUrl, selectedSeg?.imageUrl];
    const firstCandidate = candidates.find((value) => typeof value === 'string' && value.trim());
    return firstCandidate ? String(firstCandidate) : '';
  }, [selectedSeg]);
  const canUseSelectedSceneReference = Boolean(
    selectedSeg
    && !isMotionGraphicsSegment(selectedSeg)
    && selectedSceneReferenceUrl,
  );
  const selectedSceneReferenceName = useMemo(() => {
    if (!selectedSeg) {
      return 'Cena selecionada';
    }

    return String(selectedSeg.fileName || '').trim()
      || (selectedSeg?.id != null ? `Cena ${selectedSeg.id}` : 'Cena selecionada');
  }, [selectedSeg]);
  const effectiveOrientation = orientationFilter === 'auto' ? autoOrientation : orientationFilter;
  const orientationLabel = effectiveOrientation === 'portrait'
    ? 'Vertical'
    : effectiveOrientation === 'square'
      ? 'Quadrado'
      : 'Horizontal';

  const fetchPage = useCallback(async (pageToFetch: number, replace: boolean) => {
    const searchFn = window.electron?.videoProject?.searchPexelsMedia;
    if (!searchFn) {
      setError('Busca Pexels não disponível neste build.');
      setResults([]);
      setHasNextPage(false);
      return;
    }

    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;

    if (replace) {
      setIsLoadingInitial(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      const response = await searchFn({
        query: submittedQuery || undefined,
        mediaType: activePexelsType,
        page: pageToFetch,
        perPage: 18,
        orientation: effectiveOrientation,
        size: sizeFilter === 'any' ? undefined : sizeFilter,
      }) as SearchPexelsMediaResponse;

      if (requestIdRef.current !== currentRequestId) return;

      if (!response?.success) {
        setError(response?.error || 'Falha ao buscar mídia no Pexels.');
        if (replace) {
          setResults([]);
          setPage(1);
          setHasNextPage(false);
        }
        return;
      }

      const fetchedResults = Array.isArray(response.results) ? response.results : [];
      setResults((previous) => {
        const merged = replace ? fetchedResults : [...previous, ...fetchedResults];
        const deduped = dedupeResults(merged);
        return sortPexelsResults(deduped, sortBy);
      });

      setPage(Number(response.page || pageToFetch));
      setHasNextPage(Boolean(response.hasNextPage));
    } catch (searchError: any) {
      if (requestIdRef.current !== currentRequestId) return;
      setError(searchError?.message || 'Falha ao buscar mídia no Pexels.');
      if (replace) {
        setResults([]);
        setPage(1);
        setHasNextPage(false);
      }
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setIsLoadingInitial(false);
        setIsLoadingMore(false);
      }
    }
  }, [activePexelsType, effectiveOrientation, sizeFilter, sortBy, submittedQuery]);

  useEffect(() => {
    if (activeTab !== 'pexels') return;
    fetchPage(1, true);
  }, [activePexelsType, activeTab, effectiveOrientation, fetchPage, sizeFilter, submittedQuery]);

  useEffect(() => {
    setResults((previous) => sortPexelsResults(previous, sortBy));
  }, [sortBy]);

  useEffect(() => {
    setRemotionAttachedImages([]);
    setRemotionAttachmentError(null);
    setIsRemotionDragging(false);
    setSelectedRemotionSkills([]);
    setMotionGraphicsSkillNotice(null);
    setIsRemotionSkillPanelOpen(false);
  }, [selectedRemotionClipId]);

  useEffect(() => {
    const lastAssistantMessage = [...remotionMessages]
      .reverse()
      .find((message) => message.role === 'assistant' && (message.provider || message.model));
    const matchedOption = resolveMotionGraphicsModelOption(
      lastAssistantMessage?.provider,
      lastAssistantMessage?.model,
    );
    const nextValue = matchedOption?.value || DEFAULT_REMOTION_MODEL_OPTION;

    setSelectedRemotionModelValue((previous) => (previous === nextValue ? previous : nextValue));
  }, [remotionMessages, selectedRemotionClipId]);

  const loadMotionGraphicsSkillCatalog = useCallback(async () => {
    const listSkills = window.electron?.videoProject?.listMotionGraphicsSkills;
    if (!listSkills) {
      setMotionGraphicsSkillError('Catálogo de skills não disponível neste build.');
      setMotionGraphicsSkills([]);
      return;
    }

    setIsLoadingMotionGraphicsSkills(true);
    try {
      const result = await listSkills() as {
        success: boolean;
        skills?: MotionGraphicsSkillLibraryItem[];
        error?: string;
      };

      if (!result?.success) {
        throw new Error(result?.error || 'Falha ao carregar skills.');
      }

      const nextSkills = Array.isArray(result.skills) ? result.skills : [];
      setMotionGraphicsSkills(nextSkills);
      setMotionGraphicsSkillError(null);
      setSelectedRemotionSkills((previous) => previous.filter((skillId) => nextSkills.some((skill) => skill.id === skillId)));
    } catch (skillError: any) {
      setMotionGraphicsSkillError(skillError?.message || 'Falha ao carregar skills.');
    } finally {
      setIsLoadingMotionGraphicsSkills(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'remotion') {
      return;
    }

    void loadMotionGraphicsSkillCatalog();
  }, [activeTab, loadMotionGraphicsSkillCatalog]);

  useEffect(() => {
    if (!isRemotionSkillPanelOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (remotionSkillPanelRef.current?.contains(target) || remotionSkillButtonRef.current?.contains(target)) {
        return;
      }

      setIsRemotionSkillPanelOpen(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [isRemotionSkillPanelOpen]);

  useEffect(() => {
    if (activeTab !== 'remotion') {
      return;
    }

    remotionChatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeTab, remotionMessages.length, selectedRemotionClipId]);

  const handleToggleRemotionSkill = useCallback((skillId: string) => {
    const normalizedSkillId = String(skillId || '').trim();
    if (!normalizedSkillId) {
      return;
    }

    setSelectedRemotionSkills((previous) => (
      previous.includes(normalizedSkillId)
        ? previous.filter((item) => item !== normalizedSkillId)
        : [...previous, normalizedSkillId]
    ));
  }, []);

  const handleImportMotionGraphicsSkillPackage = useCallback(async () => {
    const importSkillPackage = window.electron?.videoProject?.importMotionGraphicsSkillPackage;
    if (!importSkillPackage) {
      setMotionGraphicsSkillError('Importação de skills não disponível neste build.');
      setIsRemotionSkillPanelOpen(true);
      return;
    }

    setIsImportingMotionGraphicsSkills(true);
    setIsRemotionSkillPanelOpen(true);
    try {
      const result = await importSkillPackage() as {
        success: boolean;
        canceled?: boolean;
        packageName?: string;
        importedSkillCount?: number;
        skills?: MotionGraphicsSkillLibraryItem[];
        error?: string;
      };

      if (result?.canceled) {
        return;
      }

      if (!result?.success) {
        throw new Error(result?.error || 'Falha ao importar pacote de skills.');
      }

      const importedSkills = Array.isArray(result.skills) ? result.skills : [];
      if (importedSkills.length > 0) {
        setSelectedRemotionSkills((previous) => {
          const merged = [...previous, ...importedSkills.map((skill) => skill.id)];
          return Array.from(new Set(merged));
        });
      }
      setMotionGraphicsSkillNotice(
        `${result.packageName || 'Pacote'} importado com ${Number(result.importedSkillCount || importedSkills.length)} skill(s).`,
      );
      setMotionGraphicsSkillError(null);
      await loadMotionGraphicsSkillCatalog();
    } catch (importError: any) {
      setMotionGraphicsSkillError(importError?.message || 'Falha ao importar pacote de skills.');
      setIsRemotionSkillPanelOpen(true);
    } finally {
      setIsImportingMotionGraphicsSkills(false);
    }
  }, [loadMotionGraphicsSkillCatalog]);

  useEffect(() => {
    if (activeTab !== 'pexels') return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const root = listContainerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (!firstEntry?.isIntersecting) return;
        if (!hasNextPage || isLoadingInitial || isLoadingMore) return;
        fetchPage(page + 1, false);
      },
      { root, rootMargin: '220px 0px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeTab, fetchPage, hasNextPage, isLoadingInitial, isLoadingMore, page]);

  const handleSearchSubmit = useCallback(() => {
    const normalized = queryInput.trim();
    setSubmittedQuery(normalized);
  }, [queryInput]);

  const handleAddRemotionReferenceFiles = useCallback(async (incomingFiles: File[]) => {
    const imageFiles = incomingFiles.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setRemotionAttachmentError('Selecione apenas imagens de referência.');
      return;
    }

    const availableSlots = Math.max(0, MAX_REMOTION_REFERENCE_IMAGES - remotionAttachedImages.length);
    if (availableSlots <= 0) {
      setRemotionAttachmentError(`Máximo de ${MAX_REMOTION_REFERENCE_IMAGES} imagens por mensagem.`);
      return;
    }

    const limitedFiles = imageFiles.slice(0, availableSlots);
    const oversizedFiles = limitedFiles.filter((file) => file.size > MAX_REMOTION_REFERENCE_FILE_SIZE_BYTES);
    if (oversizedFiles.length > 0) {
      setRemotionAttachmentError(`Cada imagem deve ter no máximo ${Math.round(MAX_REMOTION_REFERENCE_FILE_SIZE_BYTES / (1024 * 1024))}MB.`);
      return;
    }

    try {
      const saveImage = window.electron?.videoProject?.saveImage;
      const nextImages = await Promise.all(limitedFiles.map(async (file, index) => {
        const dataUrl = await fileToDataUrl(file);
        const imageId = `ref-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
        let localPath: string | undefined;
        let httpUrl: string | undefined;

        if (saveImage) {
          try {
            const result = await saveImage(
              await file.arrayBuffer(),
              `motion-ref-${Date.now()}-${file.name}`,
              selectedRemotionClipId || 0,
            );
            if (result?.success) {
              localPath = result.path ? String(result.path) : undefined;
              httpUrl = result.httpUrl ? String(result.httpUrl) : undefined;
            }
          } catch (saveError) {
            console.warn('[MediaPanel] Falha ao persistir imagem de referência:', saveError);
          }
        }

        return {
          id: imageId,
          name: file.name,
          path: localPath,
          url: httpUrl,
          dataUrl,
          mimeType: file.type || undefined,
          source: 'upload' as const,
        };
      }));

      setRemotionAttachedImages((previous) => [...previous, ...nextImages].slice(0, MAX_REMOTION_REFERENCE_IMAGES));
      setRemotionAttachmentError(null);
    } catch (attachmentError: any) {
      setRemotionAttachmentError(attachmentError?.message || 'Falha ao carregar imagens de referência.');
    }
  }, [remotionAttachedImages.length, selectedRemotionClipId]);

  const handleRemotionFileSelect = useCallback(async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      await handleAddRemotionReferenceFiles(files);
    }
    event.target.value = '';
  }, [handleAddRemotionReferenceFiles]);

  const handleRemoveRemotionAttachment = useCallback((imageId: string) => {
    setRemotionAttachedImages((previous) => previous.filter((image) => image.id !== imageId));
  }, []);

  const handleUseSelectedSceneReference = useCallback(() => {
    if (!canUseSelectedSceneReference || !selectedSceneReferenceUrl) {
      setRemotionAttachmentError('Selecione uma cena com frame disponível para usar como referência.');
      return;
    }

    if (remotionAttachedImages.length >= MAX_REMOTION_REFERENCE_IMAGES) {
      setRemotionAttachmentError(`Máximo de ${MAX_REMOTION_REFERENCE_IMAGES} imagens por mensagem.`);
      return;
    }

    if (remotionAttachedImages.some((image) => image.url === selectedSceneReferenceUrl)) {
      setRemotionAttachmentError(null);
      return;
    }

    setRemotionAttachedImages((previous) => [
      ...previous,
      {
        id: `scene-ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: selectedSceneReferenceName,
        url: selectedSceneReferenceUrl,
        source: 'scene',
      },
    ]);
    setRemotionAttachmentError(null);
  }, [
    canUseSelectedSceneReference,
    remotionAttachedImages,
    selectedSceneReferenceName,
    selectedSceneReferenceUrl,
  ]);

  const handleRemotionPaste = useCallback(async (
    event: React.ClipboardEvent<HTMLTextAreaElement>,
  ) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    await handleAddRemotionReferenceFiles(files);
  }, [handleAddRemotionReferenceFiles]);

  const handleRemotionDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsRemotionDragging(true);
  }, []);

  const handleRemotionDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsRemotionDragging(false);
  }, []);

  const handleRemotionDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsRemotionDragging(false);
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length > 0) {
      await handleAddRemotionReferenceFiles(files);
    }
  }, [handleAddRemotionReferenceFiles]);

  const handleToggleRemotionSkillPanel = useCallback(() => {
    setIsRemotionSkillPanelOpen((previous) => !previous);
  }, []);

  const handleRemotionSubmit = useCallback(async () => {
    const normalizedPrompt = remotionDraft.trim();
    if (!normalizedPrompt || isRemotionGenerating) {
      return;
    }

    const success = await onRemotionSubmit(normalizedPrompt, {
      attachedImages: remotionAttachedImages,
      selectedSkills: selectedRemotionSkills,
      provider: selectedRemotionModelOption.provider,
      model: selectedRemotionModelOption.model,
    });
    if (success) {
      setRemotionDraft((current) => (
        current.trim() === normalizedPrompt ? '' : current
      ));
      setRemotionAttachedImages([]);
      setRemotionAttachmentError(null);
    }
  }, [
    isRemotionGenerating,
    onRemotionSubmit,
    remotionAttachedImages,
    remotionDraft,
    selectedRemotionModelOption.model,
    selectedRemotionModelOption.provider,
    selectedRemotionSkills,
  ]);

  const handleResetRemotion = useCallback(() => {
    setRemotionDraft('');
    setRemotionAttachedImages([]);
    setRemotionAttachmentError(null);
    setIsRemotionSkillPanelOpen(false);
    onResetRemotion();
  }, [onResetRemotion]);

  const handleVideoHoverStart = useCallback((media: PexelsMediaResult) => {
    if (media.type !== 'video') return;
    const refKey = `${media.type}-${media.id}`;
    const videoElement = videoRefs.current[refKey];
    if (!videoElement) return;
    videoElement.currentTime = 0;
    videoElement.play().catch(() => {});
  }, []);

  const handleVideoHoverEnd = useCallback((media: PexelsMediaResult) => {
    if (media.type !== 'video') return;
    const refKey = `${media.type}-${media.id}`;
    const videoElement = videoRefs.current[refKey];
    if (!videoElement) return;
    videoElement.pause();
    videoElement.currentTime = 0;
  }, []);

  const handleMediaDragStart = useCallback((event: React.DragEvent, media: PexelsMediaResult) => {
    const dragPayload: TimelineDragPayload = {
      source: 'pexels-media-panel',
      id: media.id,
      type: media.type,
      directUrl: media.directUrl,
      thumbnail: media.thumbnail,
      width: media.width,
      height: media.height,
      duration: media.duration,
      attribution: media.attribution,
      author: media.author,
      url: media.url,
    };

    event.dataTransfer.effectAllowed = 'copy';
    const serializedPayload = JSON.stringify(dragPayload);
    event.dataTransfer.setData(MEDIA_DRAG_MIME, serializedPayload);
    event.dataTransfer.setData(MEDIA_DRAG_MIME_FALLBACK, serializedPayload);
    event.dataTransfer.setData('text/plain', `${MEDIA_DRAG_TEXT_PREFIX}${encodeURIComponent(serializedPayload)}`);
    (window as any).__VIDEO_STUDIO_LIBRARY_DRAG_PAYLOAD__ = dragPayload;
  }, []);

  const handleMediaDragEnd = useCallback(() => {
    delete (window as any).__VIDEO_STUDIO_LIBRARY_DRAG_PAYLOAD__;
  }, []);

  const currentSortOptions = activePexelsType === 'video'
    ? [
      { value: 'relevance', label: 'Relevância' },
      { value: 'duration_desc', label: 'Duração ↓' },
      { value: 'duration_asc', label: 'Duração ↑' },
      { value: 'resolution_desc', label: 'Resolução ↓' },
      { value: 'resolution_asc', label: 'Resolução ↑' },
    ]
    : [
      { value: 'relevance', label: 'Relevância' },
      { value: 'resolution_desc', label: 'Resolução ↓' },
      { value: 'resolution_asc', label: 'Resolução ↑' },
    ];
  const remotionQuickPrompts = [
    'Crie uma abertura elegante com o título do projeto e um reveal cinematográfico.',
    'Monte um painel de estatísticas animado com barras, números e destaques de texto.',
    'Gere um background abstrato premium com tipografia forte para a duração do vídeo.',
  ];
  const selectedRemotionClip = useMemo(() => {
    return remotionClips.find((clip) => clip.id === selectedRemotionClipId) || null;
  }, [remotionClips, selectedRemotionClipId]);
  const sourceTabs = [
    { key: 'pexels', label: 'Pexels', icon: PanelIcons.pexels, disabled: false },
    { key: 'remotion', label: 'Remotion', icon: PanelIcons.remotion, disabled: false },
    { key: 'library', label: 'Biblioteca', icon: PanelIcons.library, disabled: true },
  ] as const;

  return (
    <div className="w-full h-full flex flex-col overflow-hidden" style={{ background: FILMORA.bgDark }}>
      <div className="px-2 py-2 border-b" style={{ borderColor: FILMORA.border }}>
        <div className="flex items-start gap-1.5">
          {sourceTabs.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                disabled={tab.disabled}
                onClick={() => !tab.disabled && onActiveTabChange(tab.key)}
                title={tab.disabled ? 'Em breve' : undefined}
                className="w-[58px] h-[56px] rounded-md px-1 py-1 flex flex-col items-center justify-center gap-0.5 text-[7.5px] font-semibold uppercase tracking-wide transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                style={{
                  background: isActive ? `${FILMORA.accent}20` : `${FILMORA.surface}85`,
                  color: isActive ? FILMORA.accent : FILMORA.textMuted,
                  border: `1px solid ${isActive ? FILMORA.accent : FILMORA.border}`,
                }}
              >
                {tab.icon}
                <span className="leading-tight text-center">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'remotion' ? (
        <div className="flex-1 min-h-0 flex flex-col" style={{ background: REMOTION_CHAT_THEME.bg }}>
          <div className="px-3 pt-3 pb-1">
            <div className="relative flex justify-end">
              <div className="relative flex items-center gap-1.5">
                <button
                  ref={remotionSkillButtonRef}
                  type="button"
                  onClick={handleToggleRemotionSkillPanel}
                  className="h-8 w-8 rounded-full border flex items-center justify-center transition-colors"
                  style={{
                    borderColor: isRemotionSkillPanelOpen ? REMOTION_CHAT_THEME.accent : REMOTION_CHAT_THEME.borderStrong,
                    background: isRemotionSkillPanelOpen ? REMOTION_CHAT_THEME.accentMuted : REMOTION_CHAT_THEME.surfaceMuted,
                    color: isRemotionSkillPanelOpen ? REMOTION_CHAT_THEME.accent : REMOTION_CHAT_THEME.icon,
                  }}
                  title="Gerenciar skills e trecho ativo"
                >
                  {PanelIcons.gear}
                </button>
                <button
                  type="button"
                  onClick={onCreateRemotionClip}
                  className="h-8 w-8 rounded-full border flex items-center justify-center transition-colors"
                  style={{
                    borderColor: REMOTION_CHAT_THEME.borderStrong,
                    background: REMOTION_CHAT_THEME.surfaceMuted,
                    color: REMOTION_CHAT_THEME.icon,
                  }}
                  title="Nova cena"
                >
                  {PanelIcons.plus}
                </button>

                {isRemotionSkillPanelOpen && (
                  <div
                    ref={remotionSkillPanelRef}
                    className="absolute right-0 top-full mt-3 z-20 w-[320px] max-w-[calc(100vw-3rem)] rounded-[24px] border p-3 shadow-2xl space-y-3"
                    style={{
                      borderColor: REMOTION_CHAT_THEME.borderStrong,
                      background: '#171717',
                      boxShadow: '0 22px 60px rgba(0,0,0,0.45)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: REMOTION_CHAT_THEME.textDim }}>
                          Trecho ativo
                        </div>
                        <div className="mt-1 truncate text-[12px] font-semibold" style={{ color: REMOTION_CHAT_THEME.text }}>
                          {selectedRemotionClip ? selectedRemotionClip.label : 'Nenhuma cena selecionada'}
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed" style={{ color: REMOTION_CHAT_THEME.textDim }}>
                          {selectedRemotionClip
                            ? `V${selectedRemotionClip.track} • ${formatDuration(selectedRemotionClip.end - selectedRemotionClip.start)} • ${selectedRemotionClip.messageCount} mensagens`
                            : 'Use o botão + para criar uma nova cena e abrir o chat.'}
                        </p>
                      </div>
                      {selectedRemotionClip && (
                        <button
                          type="button"
                          onClick={handleResetRemotion}
                          disabled={isRemotionGenerating}
                          className="rounded-full border px-3 py-1.5 text-[10px] font-medium transition-opacity disabled:opacity-50"
                          style={{ borderColor: REMOTION_CHAT_THEME.borderStrong, color: REMOTION_CHAT_THEME.textMuted }}
                        >
                          Limpar
                        </button>
                      )}
                    </div>

                    {selectedSeg && !isMotionGraphicsSegment(selectedSeg) && (
                      <div
                        className="rounded-[18px] border px-3 py-2 text-[10px] leading-relaxed"
                        style={{
                          borderColor: REMOTION_CHAT_THEME.border,
                          background: REMOTION_CHAT_THEME.surfaceMuted,
                          color: REMOTION_CHAT_THEME.textDim,
                        }}
                      >
                        Cena #{selectedSeg.id} selecionada na timeline. O atalho da camera usa esse frame como referência quando disponível.
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold" style={{ color: REMOTION_CHAT_THEME.text }}>
                          Biblioteca de skills
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed" style={{ color: REMOTION_CHAT_THEME.textDim }}>
                          Fixe skills para o próximo prompt e importe novas bibliotecas a partir de uma pasta local.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {selectedRemotionSkills.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedRemotionSkills([])}
                            className="rounded-full border px-2.5 py-1 text-[9px] font-medium"
                            style={{ borderColor: REMOTION_CHAT_THEME.borderStrong, color: REMOTION_CHAT_THEME.textMuted }}
                          >
                            Limpar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { void loadMotionGraphicsSkillCatalog(); }}
                          className="rounded-full border px-2.5 py-1 text-[9px] font-medium"
                          style={{ borderColor: REMOTION_CHAT_THEME.borderStrong, color: REMOTION_CHAT_THEME.textMuted }}
                        >
                          Atualizar
                        </button>
                        <button
                          type="button"
                          onClick={() => { void handleImportMotionGraphicsSkillPackage(); }}
                          disabled={isImportingMotionGraphicsSkills}
                          className="rounded-full border px-2.5 py-1 text-[9px] font-medium transition-opacity disabled:opacity-50"
                          style={{ borderColor: REMOTION_CHAT_THEME.borderStrong, color: REMOTION_CHAT_THEME.text }}
                        >
                          {isImportingMotionGraphicsSkills ? 'Importando...' : 'Importar'}
                        </button>
                      </div>
                    </div>

                    {motionGraphicsSkillNotice && (
                      <div
                        className="rounded-[16px] border px-3 py-2 text-[10px]"
                        style={{
                          borderColor: 'rgba(59,130,246,0.45)',
                          background: 'rgba(59,130,246,0.12)',
                          color: REMOTION_CHAT_THEME.text,
                        }}
                      >
                        {motionGraphicsSkillNotice}
                      </div>
                    )}

                    {motionGraphicsSkillError && (
                      <div
                        className="rounded-[16px] border px-3 py-2 text-[10px]"
                        style={{
                          borderColor: '#7f1d1d',
                          background: 'rgba(127,29,29,0.22)',
                          color: '#fecaca',
                        }}
                      >
                        {motionGraphicsSkillError}
                      </div>
                    )}

                    {selectedRemotionSkills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedRemotionSkills.map((skillId) => (
                          <button
                            key={skillId}
                            type="button"
                            onClick={() => handleToggleRemotionSkill(skillId)}
                            className="rounded-full px-2.5 py-1 text-[9px] font-medium"
                            style={{
                              background: REMOTION_CHAT_THEME.accentMuted,
                              border: `1px solid ${REMOTION_CHAT_THEME.accent}`,
                              color: REMOTION_CHAT_THEME.accent,
                            }}
                          >
                            {motionGraphicsSkillLabels.get(skillId) || formatMotionGraphicsSkillLabel(skillId)}
                          </button>
                        ))}
                      </div>
                    )}

                    <div
                      className="rounded-[18px] border p-1.5 max-h-[210px] overflow-y-auto filmora-scrollbar"
                      style={{ borderColor: REMOTION_CHAT_THEME.border, background: REMOTION_CHAT_THEME.surfaceMuted }}
                    >
                      {isLoadingMotionGraphicsSkills ? (
                        <div className="px-2 py-2 text-[10px]" style={{ color: REMOTION_CHAT_THEME.textDim }}>
                          Carregando skills...
                        </div>
                      ) : motionGraphicsSkills.length === 0 ? (
                        <div className="px-2 py-2 text-[10px]" style={{ color: REMOTION_CHAT_THEME.textDim }}>
                          Nenhuma skill carregada.
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {visibleMotionGraphicsSkills.map((skill) => {
                            const isSelected = selectedRemotionSkills.includes(skill.id);

                            return (
                              <button
                                key={skill.id}
                                type="button"
                                onClick={() => handleToggleRemotionSkill(skill.id)}
                                className="w-full rounded-[16px] px-3 py-2 text-left transition-colors"
                                style={{
                                  border: `1px solid ${isSelected ? REMOTION_CHAT_THEME.accent : REMOTION_CHAT_THEME.border}`,
                                  background: isSelected ? REMOTION_CHAT_THEME.accentMuted : REMOTION_CHAT_THEME.surface,
                                }}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate text-[10px] font-semibold" style={{ color: isSelected ? REMOTION_CHAT_THEME.accent : REMOTION_CHAT_THEME.text }}>
                                    {skill.title}
                                  </span>
                                  <span className="text-[8px] uppercase tracking-[0.18em]" style={{ color: REMOTION_CHAT_THEME.textDim }}>
                                    Skill
                                  </span>
                                </div>
                                <div className="mt-1 flex items-center justify-between gap-2 text-[9px]" style={{ color: REMOTION_CHAT_THEME.textDim }}>
                                  <span className="truncate">{skill.source === 'builtin' ? 'Default' : skill.packageName}</span>
                                  <span>{skill.hasAssets ? 'Com assets' : 'Sem assets'}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {motionGraphicsSkills.length > 8 && (
                      <button
                        type="button"
                        onClick={() => setShowAllMotionGraphicsSkills((previous) => !previous)}
                        className="text-[10px] font-medium"
                        style={{ color: REMOTION_CHAT_THEME.textMuted }}
                      >
                        {showAllMotionGraphicsSkills ? 'Mostrar menos' : `Mostrar todas (${motionGraphicsSkills.length})`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {(remotionGenerationError || remotionCompileError) && (
            <div className="px-4 pt-3 space-y-2">
              {remotionGenerationError && (
                <div
                  className="rounded-[18px] border px-3 py-2 text-[11px]"
                  style={{ borderColor: '#7f1d1d', background: 'rgba(127,29,29,0.22)', color: '#fecaca' }}
                >
                  {remotionGenerationError}
                </div>
              )}
              {remotionCompileError && (
                <div
                  className="rounded-[18px] border px-3 py-2 text-[11px]"
                  style={{ borderColor: '#7c2d12', background: 'rgba(124,45,18,0.24)', color: '#fed7aa' }}
                >
                  Erro de compilação da composição: {remotionCompileError}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto filmora-scrollbar px-4 py-4 space-y-4">
            {!selectedRemotionClip ? (
              <div
                className="rounded-[22px] border px-4 py-4 space-y-3"
                style={{ borderColor: REMOTION_CHAT_THEME.border, background: REMOTION_CHAT_THEME.surfaceMuted }}
              >
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: REMOTION_CHAT_THEME.text }}>
                    Nenhuma cena ativa
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed" style={{ color: REMOTION_CHAT_THEME.textDim }}>
                    Cada cena Remotion mantém um chat independente. Crie uma nova cena no botão + ou envie um prompt para gerar o primeiro trecho.
                  </p>
                </div>
                <div className="space-y-2">
                  {remotionQuickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setRemotionDraft(prompt)}
                      className="w-full rounded-[18px] border px-3 py-3 text-left text-[12px] leading-relaxed transition-colors"
                      style={{
                        borderColor: REMOTION_CHAT_THEME.border,
                        background: REMOTION_CHAT_THEME.surface,
                        color: REMOTION_CHAT_THEME.textMuted,
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : remotionMessages.length === 0 ? (
              <div
                className="rounded-[22px] border px-4 py-4 space-y-3"
                style={{ borderColor: REMOTION_CHAT_THEME.border, background: REMOTION_CHAT_THEME.surfaceMuted }}
              >
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: REMOTION_CHAT_THEME.text }}>
                    Chat do clip {selectedRemotionClip.label}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed" style={{ color: REMOTION_CHAT_THEME.textDim }}>
                    Esse trecho cobre {formatDuration(selectedRemotionClip.end - selectedRemotionClip.start)} na timeline. Use o chat para criar ou ajustar a composição desse clip.
                  </p>
                </div>
                <div className="space-y-2">
                  {remotionQuickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setRemotionDraft(prompt)}
                      className="w-full rounded-[18px] border px-3 py-3 text-left text-[12px] leading-relaxed transition-colors"
                      style={{
                        borderColor: REMOTION_CHAT_THEME.border,
                        background: REMOTION_CHAT_THEME.surface,
                        color: REMOTION_CHAT_THEME.textMuted,
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              remotionMessages.map((message) => {
                const isUser = message.role === 'user';
                const skillLabels = Array.isArray(message.skillsUsed)
                  ? message.skillsUsed.map((skill) => motionGraphicsSkillLabels.get(skill) || formatMotionGraphicsSkillLabel(skill))
                  : [];

                return (
                  <div key={message.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}>
                    <div className={`flex items-center gap-2 text-[10px] px-1 ${isUser ? 'flex-row-reverse' : ''}`}>
                      <span
                        className="font-semibold"
                        style={{ color: isUser ? REMOTION_CHAT_THEME.textMuted : REMOTION_CHAT_THEME.accent }}
                      >
                        {isUser ? 'Você' : 'Assistente'}
                      </span>
                      <span style={{ color: REMOTION_CHAT_THEME.textDim }}>
                        {formatChatTimestamp(message.timestamp)}
                      </span>
                    </div>

                    <div
                      className={`max-w-[90%] md:max-w-[85%] rounded-[18px] px-4 py-3 shadow-sm ${
                        isUser ? 'rounded-tr-[4px]' : 'rounded-tl-[4px]'
                      }`}
                      style={{
                        background: isUser ? 'rgba(59,130,246,0.12)' : REMOTION_CHAT_THEME.surface,
                        border: `1px solid ${isUser ? 'rgba(59,130,246,0.2)' : REMOTION_CHAT_THEME.border}`,
                      }}
                    >
                      {Array.isArray(message.attachedImages) && message.attachedImages.length > 0 && (
                        <div className={`mb-3 flex gap-2 overflow-x-auto filmora-scrollbar ${isUser ? 'justify-end' : 'justify-start'}`}>
                          {message.attachedImages
                            .filter((image) => image?.url || image?.dataUrl)
                            .map((image) => (
                              <img
                                key={image.id || image.url || image.dataUrl}
                                src={image.url || image.dataUrl}
                                alt={image.name || 'Referência'}
                                className="h-16 w-16 rounded-[12px] object-cover border"
                                style={{ borderColor: isUser ? 'rgba(59,130,246,0.2)' : REMOTION_CHAT_THEME.border }}
                              />
                            ))}
                        </div>
                      )}
                      
                      <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                        <p className="min-w-0 whitespace-pre-wrap break-words text-[13px] leading-6" style={{ color: REMOTION_CHAT_THEME.text }}>
                          {message.content}
                        </p>
                        {!isUser && skillLabels.length > 0 && (
                          <div className="group/skills relative shrink-0" style={{ color: REMOTION_CHAT_THEME.icon }}>
                            <span className="block cursor-help">{PanelIcons.bookOpen}</span>
                            <div
                              className="pointer-events-none absolute bottom-full left-0 mb-2 w-56 rounded-[12px] border px-3 py-2 opacity-0 transition-opacity group-hover/skills:opacity-100 z-10"
                              style={{
                                borderColor: REMOTION_CHAT_THEME.borderStrong,
                                background: '#1c1c1c',
                                boxShadow: '0 14px 30px rgba(0,0,0,0.35)',
                              }}
                            >
                              <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: REMOTION_CHAT_THEME.textDim }}>
                                Skills usadas
                              </div>
                              <div className="mt-2 space-y-1">
                                {skillLabels.map((skillLabel) => (
                                  <div key={`${message.id}-${skillLabel}`} className="text-[11px] leading-relaxed" style={{ color: REMOTION_CHAT_THEME.textMuted }}>
                                    {skillLabel}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={remotionChatEndRef} />
          </div>

          <div className="px-3 pb-3 pt-1 shrink-0">
            <div
              className="rounded-[20px] border p-2.5 transition-colors overflow-hidden"
              onDragOver={handleRemotionDragOver}
              onDragLeave={handleRemotionDragLeave}
              onDrop={handleRemotionDrop}
              style={{
                borderColor: isRemotionDragging ? REMOTION_CHAT_THEME.accent : REMOTION_CHAT_THEME.borderStrong,
                background: isRemotionDragging ? 'rgba(59,130,246,0.08)' : REMOTION_CHAT_THEME.surface,
                boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
              }}
            >
              <input
                ref={remotionFileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleRemotionFileSelect}
                className="hidden"
              />

              {remotionAttachmentError && (
                <div
                  className="mb-2 rounded-[12px] border px-3 py-1.5 text-[11px]"
                  style={{ borderColor: '#7f1d1d', background: 'rgba(127,29,29,0.22)', color: '#fecaca' }}
                >
                  {remotionAttachmentError}
                </div>
              )}

              {remotionAttachedImages.length > 0 && (
                <div className="mb-2">
                  <div className="flex flex-wrap gap-2">
                    {remotionAttachedImages.map((image) => (
                      <div key={image.id || image.url || image.dataUrl} className="relative h-[60px] w-[60px] shrink-0">
                        <img
                          src={image.url || image.dataUrl}
                          alt={image.name || 'Referência'}
                          className="h-full w-full rounded-[12px] object-cover border"
                          style={{ borderColor: REMOTION_CHAT_THEME.borderStrong }}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveRemotionAttachment(String(image.id))}
                          className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md"
                          style={{
                            background: '#262626',
                            color: '#fff',
                            border: `1px solid ${REMOTION_CHAT_THEME.borderStrong}`,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <div 
                  className="rounded-[16px] border px-1 py-1"
                  style={{
                    borderColor: REMOTION_CHAT_THEME.borderStrong,
                    background: REMOTION_CHAT_THEME.surfaceMuted,
                  }}
                >
                  <textarea
                    value={remotionDraft}
                    onChange={(event) => setRemotionDraft(event.target.value)}
                    onPaste={(event) => { void handleRemotionPaste(event); }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault();
                        void handleRemotionSubmit();
                      }
                    }}
                    placeholder={selectedRemotionClip
                      ? 'Descreva a cena...'
                      : 'Descreva a primeira cena...'}
                    className="w-full min-h-[44px] max-h-[120px] resize-none bg-transparent px-3 py-2.5 text-[13px] leading-relaxed outline-none filmora-scrollbar"
                    style={{
                      color: REMOTION_CHAT_THEME.text,
                      caretColor: REMOTION_CHAT_THEME.text,
                      backgroundColor: 'transparent',
                      border: 'none',
                      boxShadow: 'none',
                    }}
                  />
                  
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
                    <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => remotionFileInputRef.current?.click()}
                        disabled={isRemotionGenerating || remotionAttachedImages.length >= MAX_REMOTION_REFERENCE_IMAGES}
                        className="h-8 w-8 rounded-full flex items-center justify-center transition-all disabled:opacity-40 shrink-0 hover:bg-white/10"
                        style={{
                          background: 'transparent',
                          color: REMOTION_CHAT_THEME.icon,
                        }}
                        title="Anexar imagem"
                      >
                        {PanelIcons.paperclip}
                      </button>
                      <button
                        type="button"
                        onClick={handleUseSelectedSceneReference}
                        disabled={isRemotionGenerating || !canUseSelectedSceneReference || remotionAttachedImages.length >= MAX_REMOTION_REFERENCE_IMAGES}
                        className="h-8 w-8 rounded-full flex items-center justify-center transition-all disabled:opacity-40 shrink-0 hover:bg-white/10"
                        style={{
                          background: 'transparent',
                          color: REMOTION_CHAT_THEME.icon,
                        }}
                        title="Usar frame da cena selecionada"
                      >
                        {PanelIcons.camera}
                      </button>
                      <select
                        value={selectedRemotionModelValue}
                        onChange={(event) => setSelectedRemotionModelValue(event.target.value)}
                        className="max-w-[120px] sm:max-w-[160px] rounded-[10px] px-2 py-1 text-[11px] outline-none truncate"
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: 'none',
                          color: REMOTION_CHAT_THEME.textMuted,
                        }}
                        title="Modelo da IA"
                      >
                        {MOTION_GRAPHICS_MODEL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value} className="bg-[#111111]">
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => { void handleRemotionSubmit(); }}
                      disabled={!remotionDraft.trim() || isRemotionGenerating}
                      className="h-8 rounded-full px-4 flex items-center justify-center transition-opacity disabled:opacity-40 shrink-0 gap-1.5"
                      style={{
                        background: !remotionDraft.trim() || isRemotionGenerating
                          ? 'rgba(255,255,255,0.05)'
                          : REMOTION_CHAT_THEME.accent,
                        color: !remotionDraft.trim() || isRemotionGenerating ? REMOTION_CHAT_THEME.textDim : '#ffffff',
                      }}
                      title={isRemotionGenerating ? 'Gerando...' : 'Enviar'}
                    >
                      <span className="text-[12px] font-semibold">{isRemotionGenerating ? 'Aguarde' : 'Enviar'}</span>
                      <span className="scale-75">{PanelIcons.arrowUp}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-1.5 px-1 flex flex-wrap items-center justify-between gap-1 text-[9px] opacity-70" style={{ color: REMOTION_CHAT_THEME.textDim }}>
              <span className="truncate max-w-[60%]">
                {hasRemotionCode
                  ? 'Ação atualiza código atual.'
                  : 'Ação gera primeira cena.'}
              </span>
              <span className="truncate max-w-[40%] text-right">
                {selectedRemotionSkills.length > 0
                  ? `${selectedRemotionSkills.length} skill(s)`
                  : canUseSelectedSceneReference
                    ? 'Frame disponível'
                    : selectedRemotionModelOption.composerLabel}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="px-2 py-2 border-b space-y-2" style={{ borderColor: FILMORA.border }}>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <span
                  className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: FILMORA.textDim }}
                >
                  {PanelIcons.search}
                </span>
                <input
                  type="text"
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleSearchSubmit();
                    }
                  }}
                  placeholder={`Buscar ${activePexelsType === 'video' ? 'vídeos' : 'imagens'} no Pexels...`}
                  className="w-full rounded pl-7 pr-2 py-1.5 text-[11px] outline-none border bg-black/30"
                  style={{
                    borderColor: FILMORA.border,
                    color: FILMORA.text,
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleSearchSubmit}
                disabled={isLoadingInitial || isLoadingMore}
                className="rounded px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-opacity disabled:opacity-60"
                style={{ background: FILMORA.accent, color: '#000' }}
              >
                Buscar
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <select
                value={activePexelsType}
                onChange={(event) => setActivePexelsType(event.target.value as PexelsMediaType)}
                className="rounded px-1.5 py-1 text-[10px] bg-black/30 border outline-none"
                style={{ borderColor: FILMORA.border, color: FILMORA.text }}
                title="Tipo de mídia"
              >
                <option value="video" className="bg-[#111]">Vídeos</option>
                <option value="photo" className="bg-[#111]">Imagens</option>
              </select>

              <select
                value={orientationFilter}
                onChange={(event) => setOrientationFilter(event.target.value as PexelsOrientationFilter)}
                className="rounded px-1.5 py-1 text-[10px] bg-black/30 border outline-none"
                style={{ borderColor: FILMORA.border, color: FILMORA.text }}
                title="Orientação"
              >
                <option value="auto" className="bg-[#111]">Auto ({orientationLabel})</option>
                <option value="landscape" className="bg-[#111]">Horizontal</option>
                <option value="portrait" className="bg-[#111]">Vertical</option>
                <option value="square" className="bg-[#111]">Quadrado</option>
              </select>

              <select
                value={sizeFilter}
                onChange={(event) => setSizeFilter(event.target.value as PexelsSizeOption)}
                className="rounded px-1.5 py-1 text-[10px] bg-black/30 border outline-none"
                style={{ borderColor: FILMORA.border, color: FILMORA.text }}
                title="Tamanho"
              >
                <option value="any" className="bg-[#111]">Tamanho: Todos</option>
                <option value="small" className="bg-[#111]">Small</option>
                <option value="medium" className="bg-[#111]">Medium</option>
                <option value="large" className="bg-[#111]">Large</option>
              </select>

              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as PexelsSortOption)}
                className="rounded px-1.5 py-1 text-[10px] bg-black/30 border outline-none"
                style={{ borderColor: FILMORA.border, color: FILMORA.text }}
                title="Ordenação"
              >
                {currentSortOptions.map((option) => (
                  <option key={option.value} value={option.value} className="bg-[#111]">{option.label}</option>
                ))}
              </select>
            </div>

            <div className="text-[10px]" style={{ color: canApplyToSelectedSegment ? FILMORA.accent : FILMORA.textDim }}>
              {canApplyToSelectedSegment
                ? `Cena selecionada: #${selectedSeg.id} • Arraste para a timeline ou clique em "Usar na cena"`
                : selectedSeg
                  ? 'Clip Remotion selecionado. Arraste mídia para a timeline ou selecione uma cena comum para aplicar direto.'
                : 'Selecione uma cena para aplicar mídia direto no clip'}
            </div>
          </div>

          <div ref={listContainerRef} className="flex-1 overflow-y-auto filmora-scrollbar p-2">
            {isLoadingInitial && (
              <div className="text-[11px]" style={{ color: FILMORA.textMuted }}>
                Buscando no Pexels...
              </div>
            )}

            {!isLoadingInitial && error && (
              <div
                className="rounded border px-2 py-2 text-[11px]"
                style={{ borderColor: '#7f1d1d', background: 'rgba(127,29,29,0.2)', color: '#fecaca' }}
              >
                {error}
              </div>
            )}

            {!isLoadingInitial && !error && results.length === 0 && (
              <div className="rounded border px-2 py-2 text-[11px]" style={{ borderColor: FILMORA.border, color: FILMORA.textMuted }}>
                {submittedQuery
                  ? `Nenhum resultado para "${submittedQuery}".`
                  : activePexelsType === 'video'
                    ? 'Mostrando vídeos populares do Pexels.'
                    : 'Mostrando imagens curadas do Pexels.'}
              </div>
            )}

            {!isLoadingInitial && !error && results.length > 0 && (
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}
              >
                {results.map((media) => {
                  const mediaKey = `${media.type}-${media.id}`;
                  return (
                    <div
                      key={mediaKey}
                      draggable
                      onDragStart={(event) => handleMediaDragStart(event, media)}
                      onDragEnd={handleMediaDragEnd}
                      onMouseEnter={() => handleVideoHoverStart(media)}
                      onMouseLeave={() => handleVideoHoverEnd(media)}
                      className="rounded border overflow-hidden cursor-grab active:cursor-grabbing"
                      style={{ borderColor: FILMORA.border, background: FILMORA.surface }}
                      title="Arraste para a timeline"
                    >
                      <div className="relative aspect-video bg-black/40">
                        {media.type === 'video' ? (
                          <video
                            ref={(node) => {
                              videoRefs.current[mediaKey] = node;
                            }}
                            src={media.directUrl}
                            poster={media.thumbnail}
                            className="w-full h-full object-cover"
                            muted
                            loop
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <img
                            src={media.thumbnail || media.directUrl}
                            alt={`Pexels media ${media.id}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        )}

                        {media.type === 'video' && (
                          <span
                            className="absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-[9px] font-semibold"
                            style={{ background: 'rgba(0,0,0,0.65)', color: '#fff' }}
                          >
                            {formatDuration(media.duration)}
                          </span>
                        )}
                      </div>

                      <div className="p-2 space-y-1">
                        <div className="text-[10px] leading-none" style={{ color: FILMORA.textMuted }}>
                          {media.width}x{media.height}
                        </div>
                        <div className="text-[10px] truncate leading-none" style={{ color: FILMORA.text }}>
                          {media.author?.name || 'Autor desconhecido'}
                        </div>
                        <div className="flex items-center gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => onApplyPexelsVideoToSelected(media)}
                            disabled={!canApplyToSelectedSegment}
                            className="flex-1 rounded px-2 py-1 text-[10px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ background: FILMORA.accent, color: '#000' }}
                          >
                            Usar na cena
                          </button>
                          <a
                            href={media.url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded px-2 py-1 text-[10px] font-semibold border"
                            style={{ borderColor: FILMORA.borderLight, color: FILMORA.text }}
                          >
                            Crédito
                          </a>
                        </div>
                        <div className="text-[9px] truncate" style={{ color: FILMORA.textDim }}>
                          {media.attribution || `${media.type === 'video' ? 'Video' : 'Photo'} by ${media.author?.name || 'Unknown'} on Pexels`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!isLoadingInitial && !error && (
              <div ref={sentinelRef} className="h-4" />
            )}

            {isLoadingMore && (
              <div className="pt-2 text-[10px]" style={{ color: FILMORA.textDim }}>
                Carregando mais resultados...
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
