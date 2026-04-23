export interface TimelineKeepRange {
  sourceStart: number;
  sourceEnd: number;
  outputStart: number;
  outputEnd: number;
}

type TimedWord = {
  start: number;
  end: number;
};

type TimelineLikeSegment = {
  start?: number;
  end?: number;
  text?: string;
  words?: TimedWord[];
  track?: number;
  assetType?: string;
  asset_type?: string;
};

const EPSILON = 0.0001;
export const MIN_SILENCE_PADDING_MS = 0;
export const MAX_SILENCE_PADDING_MS = 1000;
export const DEFAULT_SILENCE_PADDING_MS = 50;

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

export const normalizeSilencePaddingMs = (value: unknown): number => {
  const normalizedValue = Math.round(toFiniteNumber(value, DEFAULT_SILENCE_PADDING_MS));
  return Math.min(MAX_SILENCE_PADDING_MS, Math.max(MIN_SILENCE_PADDING_MS, normalizedValue));
};

const isAudioSegment = (segment: TimelineLikeSegment): boolean => {
  const assetType = String(segment.assetType || segment.asset_type || '').toLowerCase();
  return assetType.startsWith('audio');
};

const hasNarrationTiming = (segment: TimelineLikeSegment): boolean => {
  if (Array.isArray(segment.words) && segment.words.length > 0) {
    return true;
  }

  return typeof segment.text === 'string' && segment.text.trim().length > 0;
};

const sortByTime = <T extends TimelineLikeSegment>(segments: T[]): T[] => {
  return [...segments].sort((a, b) => {
    const startDiff = toFiniteNumber(a.start) - toFiniteNumber(b.start);
    if (Math.abs(startDiff) > EPSILON) {
      return startDiff;
    }

    return toFiniteNumber(a.end) - toFiniteNumber(b.end);
  });
};

const getNormalizedTrack = (segment: TimelineLikeSegment): number => {
  return Math.max(1, Math.round(toFiniteNumber(segment.track, 1)));
};

export function getTimelineReferenceSegments<T extends TimelineLikeSegment>(segments: T[]): T[] {
  const validSegments = sortByTime(
    segments.filter((segment) => {
      const start = toFiniteNumber(segment.start);
      const end = toFiniteNumber(segment.end);
      return end - start > EPSILON;
    }),
  );

  if (validSegments.length === 0) {
    return [];
  }

  const narrationSegments = validSegments.filter(hasNarrationTiming);
  if (narrationSegments.length > 0) {
    return narrationSegments;
  }

  const nonAudioSegments = validSegments.filter((segment) => !isAudioSegment(segment));
  if (nonAudioSegments.length === 0) {
    return validSegments;
  }

  const lowestTrack = nonAudioSegments.reduce((minTrack, segment) => {
    return Math.min(minTrack, getNormalizedTrack(segment));
  }, Number.POSITIVE_INFINITY);

  const primaryTrackSegments = nonAudioSegments.filter(
    (segment) => getNormalizedTrack(segment) === lowestTrack,
  );

  return primaryTrackSegments.length > 0 ? primaryTrackSegments : nonAudioSegments;
}

export function buildSilenceCompactionRanges<T extends TimelineLikeSegment>(
  segments: T[],
  options?: {
    /**
     * Quando true, intervalos adjacentes (end == start) são unidos em um único range.
     * Mantemos true por padrão para preservar o comportamento legado.
     */
    mergeAdjacentRanges?: boolean;
    /**
     * Margem em milissegundos preservada antes/depois de cada trecho narrado.
     * Ajuda a evitar cortes bruscos de fonemas no início/fim da fala.
     */
    preservePaddingMs?: number;
  },
): TimelineKeepRange[] {
  const mergeAdjacentRanges = options?.mergeAdjacentRanges ?? true;
  const preservePaddingSec = normalizeSilencePaddingMs(options?.preservePaddingMs) / 1000;
  const referenceSegments = getTimelineReferenceSegments(segments);
  if (referenceSegments.length === 0) {
    return [];
  }

  const mergedRanges: Array<{ sourceStart: number; sourceEnd: number }> = [];

  referenceSegments.forEach((segment) => {
    const originalStart = Math.max(0, toFiniteNumber(segment.start));
    const originalEnd = Math.max(originalStart, toFiniteNumber(segment.end));
    if (originalEnd - originalStart <= EPSILON) {
      return;
    }

    const sourceStart = Math.max(0, originalStart - preservePaddingSec);
    const sourceEnd = Math.max(sourceStart, originalEnd + preservePaddingSec);

    if (sourceEnd - sourceStart <= EPSILON) {
      return;
    }

    const lastRange = mergedRanges[mergedRanges.length - 1];
    const shouldStartNewRange = !lastRange
      || sourceStart > lastRange.sourceEnd + EPSILON
      || (!mergeAdjacentRanges && sourceStart >= lastRange.sourceEnd - EPSILON);

    if (shouldStartNewRange) {
      mergedRanges.push({ sourceStart, sourceEnd });
      return;
    }

    lastRange.sourceEnd = Math.max(lastRange.sourceEnd, sourceEnd);
  });

  let outputCursor = 0;

  return mergedRanges.map((range) => {
    const duration = Math.max(0, range.sourceEnd - range.sourceStart);
    const compactedRange: TimelineKeepRange = {
      sourceStart: range.sourceStart,
      sourceEnd: range.sourceEnd,
      outputStart: outputCursor,
      outputEnd: outputCursor + duration,
    };

    outputCursor = compactedRange.outputEnd;
    return compactedRange;
  });
}

export function getCompactedDuration(
  ranges: TimelineKeepRange[],
  fallbackDuration = 0,
): number {
  if (ranges.length === 0) {
    return Math.max(0, fallbackDuration);
  }

  return ranges[ranges.length - 1].outputEnd;
}

export function mapSourceTimeToOutputTime(
  sourceTime: number,
  ranges: TimelineKeepRange[],
): number {
  const safeSourceTime = Math.max(0, toFiniteNumber(sourceTime));

  if (ranges.length === 0) {
    return safeSourceTime;
  }

  let outputTime = 0;

  for (const range of ranges) {
    if (safeSourceTime >= range.sourceEnd - EPSILON) {
      outputTime = range.outputEnd;
      continue;
    }

    if (safeSourceTime <= range.sourceStart + EPSILON) {
      return outputTime;
    }

    return range.outputStart + (safeSourceTime - range.sourceStart);
  }

  return ranges[ranges.length - 1].outputEnd;
}

export function mapOutputTimeToSourceTime(
  outputTime: number,
  ranges: TimelineKeepRange[],
): number {
  const safeOutputTime = Math.max(0, toFiniteNumber(outputTime));

  if (ranges.length === 0) {
    return safeOutputTime;
  }

  if (safeOutputTime <= ranges[0].outputStart + EPSILON) {
    return ranges[0].sourceStart;
  }

  for (const range of ranges) {
    if (safeOutputTime >= range.outputEnd - EPSILON) {
      continue;
    }

    if (safeOutputTime <= range.outputStart + EPSILON) {
      return range.sourceStart;
    }

    return range.sourceStart + (safeOutputTime - range.outputStart);
  }

  return ranges[ranges.length - 1].sourceEnd;
}

export function hasVisibleDurationInRanges(
  start: number,
  end: number,
  ranges: TimelineKeepRange[],
): boolean {
  const safeStart = toFiniteNumber(start);
  const safeEnd = toFiniteNumber(end);

  if (safeEnd - safeStart <= EPSILON) {
    return false;
  }

  if (ranges.length === 0) {
    return true;
  }

  return ranges.some((range) => safeEnd > range.sourceStart + EPSILON && safeStart < range.sourceEnd - EPSILON);
}

export function compactWordTimings<TWord extends TimedWord>(
  words: TWord[] | undefined,
  ranges: TimelineKeepRange[],
): TWord[] | undefined {
  if (!Array.isArray(words) || words.length === 0) {
    return words;
  }

  const compactedWords = words
    .map((word) => {
      const start = mapSourceTimeToOutputTime(word.start, ranges);
      const end = mapSourceTimeToOutputTime(word.end, ranges);

      return {
        ...word,
        start,
        end: Math.max(start, end),
      };
    })
    .filter((word) => word.end - word.start > EPSILON);

  return compactedWords.length > 0 ? compactedWords : undefined;
}

export function compactTimelineSegments<T extends TimelineLikeSegment>(
  segments: T[],
  ranges: TimelineKeepRange[],
  options?: {
    compactWords?: boolean;
  },
): T[] {
  return segments
    .filter((segment) => hasVisibleDurationInRanges(toFiniteNumber(segment.start), toFiniteNumber(segment.end), ranges))
    .map((segment) => {
      const compactedSegment: T = {
        ...segment,
        start: mapSourceTimeToOutputTime(toFiniteNumber(segment.start), ranges),
        end: mapSourceTimeToOutputTime(toFiniteNumber(segment.end), ranges),
      };

      if (options?.compactWords && Array.isArray(segment.words)) {
        compactedSegment.words = compactWordTimings(segment.words, ranges);
      }

      return compactedSegment;
    })
    .filter((segment) => toFiniteNumber(segment.end) - toFiniteNumber(segment.start) > EPSILON);
}
