import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FILMORA } from './constants';
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
  onRemotionSubmit: (prompt: string) => Promise<boolean> | boolean;
  isRemotionGenerating: boolean;
  remotionGenerationError: string | null;
  remotionCompileError: string | null;
  hasRemotionCode: boolean;
  onResetRemotion: () => void;
  remotionDurationLabel: string;
}

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

  const requestIdRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  const autoOrientation = useMemo(() => getOrientationFromRatio(selectedRatio), [selectedRatio]);
  const canApplyToSelectedSegment = Boolean(selectedSeg && !isMotionGraphicsSegment(selectedSeg));
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

  const handleRemotionSubmit = useCallback(async () => {
    const normalizedPrompt = remotionDraft.trim();
    if (!normalizedPrompt || isRemotionGenerating) {
      return;
    }

    const success = await onRemotionSubmit(normalizedPrompt);
    if (success) {
      setRemotionDraft((current) => (
        current.trim() === normalizedPrompt ? '' : current
      ));
    }
  }, [isRemotionGenerating, onRemotionSubmit, remotionDraft]);

  const handleResetRemotion = useCallback(() => {
    setRemotionDraft('');
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
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-3 py-3 border-b space-y-2" style={{ borderColor: FILMORA.border }}>
            <div className="flex items-start justify-between gap-2">
              <div
                className="flex-1 rounded border px-2.5 py-2 space-y-1"
                style={{ borderColor: FILMORA.border, background: `${FILMORA.surface}CC` }}
              >
                <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide">
                  <span style={{ color: FILMORA.textDim }}>Trecho ativo</span>
                  <span style={{ color: FILMORA.accent }}>{selectedRatio} • {remotionDurationLabel}</span>
                </div>
                <div className="text-[10px] leading-relaxed" style={{ color: FILMORA.textMuted }}>
                  {selectedRemotionClip
                    ? `Clip #${selectedRemotionClip.id} na V${selectedRemotionClip.track}. Mova e redimensione esse trecho diretamente na timeline.`
                    : 'Crie um trecho Remotion para abrir um chat por clip e posicioná-lo onde quiser nas tracks de vídeo.'}
                </div>
                {selectedSeg && !isMotionGraphicsSegment(selectedSeg) && (
                  <div className="text-[10px] leading-relaxed" style={{ color: FILMORA.textDim }}>
                    Cena #{selectedSeg.id} selecionada na timeline. O prompt pode usar esse trecho como contexto visual.
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onCreateRemotionClip}
                className="shrink-0 rounded px-3 py-2 text-[10px] font-semibold uppercase tracking-wide"
                style={{ background: FILMORA.accent, color: '#000' }}
              >
                Novo trecho
              </button>
            </div>

            <div
              className="rounded border p-1.5 space-y-1 max-h-[140px] overflow-y-auto filmora-scrollbar"
              style={{ borderColor: FILMORA.border, background: 'rgba(0,0,0,0.18)' }}
            >
              {remotionClips.length === 0 ? (
                <div className="px-2 py-2 text-[10px]" style={{ color: FILMORA.textDim }}>
                  Nenhum trecho Remotion no projeto ainda.
                </div>
              ) : (
                remotionClips.map((clip) => {
                  const isSelected = clip.id === selectedRemotionClipId;

                  return (
                    <button
                      key={clip.id}
                      type="button"
                      onClick={() => onSelectRemotionClip(clip.id)}
                      className="w-full rounded px-2.5 py-2 text-left transition-colors"
                      style={{
                        border: `1px solid ${isSelected ? FILMORA.accent : FILMORA.border}`,
                        background: isSelected ? `${FILMORA.accent}12` : `${FILMORA.surface}B3`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold truncate" style={{ color: isSelected ? FILMORA.accent : FILMORA.text }}>
                          {clip.label}
                        </span>
                        <span className="text-[9px] uppercase tracking-wide" style={{ color: FILMORA.textDim }}>
                          V{clip.track}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[9px]" style={{ color: FILMORA.textDim }}>
                        <span>{formatDuration(clip.end - clip.start)} • {clip.messageCount} msgs</span>
                        <span>{clip.hasCode ? 'Com código' : 'Sem código'}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {remotionGenerationError && (
              <div
                className="rounded border px-2.5 py-2 text-[10px]"
                style={{ borderColor: '#7f1d1d', background: 'rgba(127,29,29,0.22)', color: '#fecaca' }}
              >
                {remotionGenerationError}
              </div>
            )}

            {remotionCompileError && (
              <div
                className="rounded border px-2.5 py-2 text-[10px]"
                style={{ borderColor: '#7c2d12', background: 'rgba(124,45,18,0.24)', color: '#fed7aa' }}
              >
                Erro de compilação da composição: {remotionCompileError}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto filmora-scrollbar p-2 space-y-2">
            {!selectedRemotionClip ? (
              <div className="rounded border p-3 space-y-3" style={{ borderColor: FILMORA.border, background: `${FILMORA.surface}A6` }}>
                <div>
                  <p className="text-[11px] font-semibold" style={{ color: FILMORA.text }}>
                    Clips Remotion por faixa
                  </p>
                  <p className="text-[10px] mt-1 leading-relaxed" style={{ color: FILMORA.textMuted }}>
                    Cada trecho Remotion vira um chat independente. Crie um clip, depois arraste, corte e sobreponha na timeline.
                  </p>
                </div>
                <div className="space-y-1.5">
                  {remotionQuickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setRemotionDraft(prompt)}
                      className="w-full rounded px-2.5 py-2 text-left text-[10px] transition-colors"
                      style={{
                        border: `1px solid ${FILMORA.border}`,
                        background: 'rgba(0,0,0,0.16)',
                        color: FILMORA.textMuted,
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : remotionMessages.length === 0 ? (
              <div className="rounded border p-3 space-y-3" style={{ borderColor: FILMORA.border, background: `${FILMORA.surface}A6` }}>
                <div>
                  <p className="text-[11px] font-semibold" style={{ color: FILMORA.text }}>
                    Chat do clip {selectedRemotionClip.label}
                  </p>
                  <p className="text-[10px] mt-1 leading-relaxed" style={{ color: FILMORA.textMuted }}>
                    Esse trecho cobre {formatDuration(selectedRemotionClip.end - selectedRemotionClip.start)} na timeline. O preview toca no player principal respeitando a transparência do clip.
                  </p>
                </div>
                <div className="space-y-1.5">
                  {remotionQuickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setRemotionDraft(prompt)}
                      className="w-full rounded px-2.5 py-2 text-left text-[10px] transition-colors"
                      style={{
                        border: `1px solid ${FILMORA.border}`,
                        background: 'rgba(0,0,0,0.16)',
                        color: FILMORA.textMuted,
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

                return (
                  <div
                    key={message.id}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className="max-w-[92%] rounded-lg px-3 py-2"
                      style={{
                        background: isUser
                          ? `${FILMORA.accent}22`
                          : `${FILMORA.surface}E6`,
                        border: `1px solid ${isUser ? `${FILMORA.accent}55` : FILMORA.border}`,
                        color: isUser ? FILMORA.text : FILMORA.textMuted,
                      }}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className="text-[9px] uppercase tracking-wide" style={{ color: isUser ? FILMORA.accent : FILMORA.textDim }}>
                          {isUser ? 'Você' : 'IA'}
                        </span>
                        {(message.provider || message.model) && !isUser && (
                          <span className="text-[9px]" style={{ color: FILMORA.textDim }}>
                            {[message.provider, message.model].filter(Boolean).join(' • ')}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] leading-relaxed whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t p-2 space-y-2" style={{ borderColor: FILMORA.border }}>
            <textarea
              value={remotionDraft}
              onChange={(event) => setRemotionDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  void handleRemotionSubmit();
                }
              }}
              placeholder={selectedRemotionClip
                ? 'Descreva como esse clip Remotion deve ficar ou o que quer ajustar...'
                : 'Descreva o primeiro trecho Remotion. Se não houver clip selecionado, o painel cria um novo.'}
              className="w-full min-h-[92px] rounded px-3 py-2 text-[11px] outline-none border resize-none bg-black/30"
              style={{
                borderColor: FILMORA.border,
                color: FILMORA.text,
              }}
            />

            <div className="flex items-center justify-between gap-2">
              <div className="text-[9px] leading-relaxed" style={{ color: FILMORA.textDim }}>
                {hasRemotionCode
                  ? 'Esse envio atualiza o código do clip ativo. Use Ctrl+Enter para enviar.'
                  : 'Se o clip ainda estiver vazio, o próximo envio gera a primeira versão dele. Use Ctrl+Enter para enviar.'}
              </div>
              <div className="flex items-center gap-1.5">
                {selectedRemotionClip && (
                  <button
                    type="button"
                    onClick={handleResetRemotion}
                    disabled={isRemotionGenerating}
                    className="rounded px-2.5 py-1.5 text-[10px] font-semibold transition-opacity disabled:opacity-50"
                    style={{
                      border: `1px solid ${FILMORA.border}`,
                      color: FILMORA.textMuted,
                    }}
                  >
                    Limpar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { void handleRemotionSubmit(); }}
                  disabled={!remotionDraft.trim() || isRemotionGenerating}
                  className="rounded px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-opacity disabled:opacity-50"
                  style={{ background: FILMORA.accent, color: '#000' }}
                >
                  {isRemotionGenerating
                    ? 'Gerando...'
                    : hasRemotionCode
                      ? 'Atualizar'
                      : selectedRemotionClip
                        ? 'Gerar'
                        : 'Criar + gerar'}
                </button>
              </div>
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
