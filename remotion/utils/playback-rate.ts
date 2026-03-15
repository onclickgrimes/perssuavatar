/**
 * Playback Rate Calculator
 * 
 * Calcula a velocidade de reprodução (playbackRate) ideal para que um vídeo
 * caiba inteiro dentro da duração de uma cena.
 * 
 * Exemplo:
 * - Cena de 4 segundos, vídeo de 8 segundos → playbackRate = 2.0 (2x mais rápido)
 * - Cena de 6 segundos, vídeo de 3 segundos → playbackRate = 0.5 (2x mais lento)
 * - Cena de 5 segundos, vídeo de 5 segundos → playbackRate = 1.0 (velocidade normal)
 */

/**
 * Calcula o playbackRate para que o vídeo inteiro caiba na duração da cena.
 * 
 * @param videoDuration - Duração real do vídeo em segundos
 * @param sceneDuration - Duração da cena em segundos
 * @param options - Opções adicionais
 * @returns playbackRate calculado (clamped entre min e max seguros)
 */
export function calculatePlaybackRate(
  videoDuration: number,
  sceneDuration: number,
  options?: {
    /** Taxa mínima permitida (padrão: 0.25 = 4x mais lento) */
    minRate?: number;
    /** Taxa máxima permitida (padrão: 4.0 = 4x mais rápido) */
    maxRate?: number;
    /** Se true, retorna 1.0 quando as durações são iguais ou muito próximas (padrão: true) */
    snapToNormal?: boolean;
    /** Tolerância em segundos para considerar durações "iguais" (padrão: 0.1s) */
    tolerance?: number;
  }
): number {
  const {
    minRate = 0.25,
    maxRate = 4.0,
    snapToNormal = true,
    tolerance = 0.1,
  } = options || {};

  // Validações
  if (!videoDuration || videoDuration <= 0 || !sceneDuration || sceneDuration <= 0) {
    return 1.0;
  }

  // Se as durações são muito próximas, retorna velocidade normal
  if (snapToNormal && Math.abs(videoDuration - sceneDuration) <= tolerance) {
    return 1.0;
  }

  // playbackRate = duração do vídeo / duração da cena
  // Se vídeo = 8s e cena = 4s → rate = 2.0 (toca 2x mais rápido)
  // Se vídeo = 3s e cena = 6s → rate = 0.5 (toca 2x mais lento)
  const rate = videoDuration / sceneDuration;

  // Clamp entre os limites seguros do navegador
  return Math.min(Math.max(rate, minRate), maxRate);
}

/**
 * Calcula o playbackRate usando frames ao invés de segundos.
 * 
 * @param videoDurationFrames - Duração do vídeo em frames
 * @param sceneDurationFrames - Duração da cena em frames
 * @param fps - Frames por segundo
 * @param options - Opções adicionais (mesmo que calculatePlaybackRate)
 * @returns playbackRate calculado
 */
export function calculatePlaybackRateFromFrames(
  videoDurationFrames: number,
  sceneDurationFrames: number,
  fps: number,
  options?: Parameters<typeof calculatePlaybackRate>[2]
): number {
  const videoDuration = videoDurationFrames / fps;
  const sceneDuration = sceneDurationFrames / fps;
  return calculatePlaybackRate(videoDuration, sceneDuration, options);
}

/**
 * Retorna informações de debug sobre o ajuste de playbackRate.
 * Útil para exibir no console durante desenvolvimento.
 */
export function getPlaybackRateInfo(
  videoDuration: number,
  sceneDuration: number,
): {
  videoDuration: number;
  sceneDuration: number;
  playbackRate: number;
  speedLabel: string;
  willFit: boolean;
} {
  const playbackRate = calculatePlaybackRate(videoDuration, sceneDuration);
  
  let speedLabel: string;
  if (playbackRate === 1.0) {
    speedLabel = 'Normal';
  } else if (playbackRate > 1.0) {
    speedLabel = `${playbackRate.toFixed(2)}x mais rápido`;
  } else {
    speedLabel = `${(1 / playbackRate).toFixed(2)}x mais lento`;
  }

  // O vídeo vai caber se o rate calculado está dentro dos limites
  const rawRate = videoDuration / sceneDuration;
  const willFit = rawRate >= 0.25 && rawRate <= 4.0;

  return {
    videoDuration,
    sceneDuration,
    playbackRate,
    speedLabel,
    willFit,
  };
}
