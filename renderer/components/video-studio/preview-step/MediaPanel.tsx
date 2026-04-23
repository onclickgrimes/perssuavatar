import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FILMORA } from './constants';

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

interface MediaPanelProps {
  selectedRatio: string;
  selectedSeg: any | null;
  onApplyPexelsVideoToSelected: (media: PexelsMediaResult) => void;
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

export function MediaPanel({
  selectedRatio,
  selectedSeg,
  onApplyPexelsVideoToSelected,
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

  const requestIdRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  const autoOrientation = useMemo(() => getOrientationFromRatio(selectedRatio), [selectedRatio]);
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
    fetchPage(1, true);
  }, [activePexelsType, effectiveOrientation, fetchPage, sizeFilter, submittedQuery]);

  useEffect(() => {
    setResults((previous) => sortPexelsResults(previous, sortBy));
  }, [sortBy]);

  useEffect(() => {
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
  }, [fetchPage, hasNextPage, isLoadingInitial, isLoadingMore, page]);

  const handleSearchSubmit = useCallback(() => {
    const normalized = queryInput.trim();
    setSubmittedQuery(normalized);
  }, [queryInput]);

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
    event.dataTransfer.setData('application/x-video-studio-media', JSON.stringify(dragPayload));
    event.dataTransfer.setData('text/plain', media.directUrl);
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

  return (
    <div className="w-full h-full flex flex-col overflow-hidden" style={{ background: FILMORA.bgDark }}>
      <div className="flex border-b px-1 pt-1 gap-1" style={{ borderColor: FILMORA.border }}>
        <button
          type="button"
          className="rounded-t px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
          style={{
            color: FILMORA.accent,
            background: `${FILMORA.accent}22`,
            border: `1px solid ${FILMORA.border}`,
            borderBottomColor: 'transparent',
          }}
        >
          Pexels
        </button>
        <button
          type="button"
          className="rounded-t px-2 py-1 text-[10px] font-semibold uppercase tracking-wide opacity-50 cursor-not-allowed"
          style={{
            color: FILMORA.textDim,
            background: `${FILMORA.surface}80`,
            border: `1px solid ${FILMORA.border}`,
            borderBottomColor: 'transparent',
          }}
          title="Em breve"
          disabled
        >
          Biblioteca
        </button>
      </div>

      <div className="px-2 py-2 border-b space-y-2" style={{ borderColor: FILMORA.border }}>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActivePexelsType('video')}
            className="rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
            style={{
              background: activePexelsType === 'video' ? `${FILMORA.accent}25` : FILMORA.surface,
              color: activePexelsType === 'video' ? FILMORA.accent : FILMORA.textMuted,
              border: `1px solid ${activePexelsType === 'video' ? FILMORA.accent : FILMORA.border}`,
            }}
          >
            Vídeos
          </button>
          <button
            type="button"
            onClick={() => setActivePexelsType('photo')}
            className="rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
            style={{
              background: activePexelsType === 'photo' ? `${FILMORA.accent}25` : FILMORA.surface,
              color: activePexelsType === 'photo' ? FILMORA.accent : FILMORA.textMuted,
              border: `1px solid ${activePexelsType === 'photo' ? FILMORA.accent : FILMORA.border}`,
            }}
          >
            Imagens
          </button>
        </div>

        <div className="flex items-center gap-1.5">
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
            className="flex-1 rounded px-2 py-1.5 text-[11px] outline-none border bg-black/30"
            style={{
              borderColor: FILMORA.border,
              color: FILMORA.text,
            }}
          />
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

        <div className="grid grid-cols-3 gap-1.5">
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

        <div className="text-[10px]" style={{ color: selectedSeg ? FILMORA.accent : FILMORA.textDim }}>
          {selectedSeg
            ? `Cena selecionada: #${selectedSeg.id} • Arraste para a timeline ou clique em "Usar na cena"`
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
          <div className="grid grid-cols-1 gap-2">
            {results.map((media) => {
              const mediaKey = `${media.type}-${media.id}`;
              return (
                <div
                  key={mediaKey}
                  draggable
                  onDragStart={(event) => handleMediaDragStart(event, media)}
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
                        disabled={!selectedSeg}
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
    </div>
  );
}
