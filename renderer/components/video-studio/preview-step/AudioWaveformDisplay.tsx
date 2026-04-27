import React, { useRef, useState, useEffect } from 'react';
import {
  mapOutputTimeToSourceTime,
  type TimelineKeepRange,
} from '../../../../remotion/utils/silence-compaction';

const audioBufferPromiseCache = new Map<string, Promise<AudioBuffer>>();
const MAX_WAVEFORM_CANVAS_WIDTH = 4096;
const MAX_SAMPLES_PER_COLUMN = 512;

const loadAudioBuffer = async (audioUrl: string): Promise<AudioBuffer> => {
  const cachedPromise = audioBufferPromiseCache.get(audioUrl);
  if (cachedPromise) {
    return cachedPromise;
  }

  const decodePromise = (async () => {
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new Ctx();
    try {
      return await audioCtx.decodeAudioData(arrayBuffer);
    } finally {
      await audioCtx.close().catch(() => {});
    }
  })();

  audioBufferPromiseCache.set(audioUrl, decodePromise);

  try {
    return await decodePromise;
  } catch (error) {
    audioBufferPromiseCache.delete(audioUrl);
    throw error;
  }
};

// ========================================
// WAVEFORM COMPONENT
// ========================================
export function AudioWaveformDisplay({
  audioUrl,
  color,
  duration,
  audioKeepRanges,
  widthScale,
}: {
  audioUrl: string;
  color: string;
  duration: number;
  audioKeepRanges?: TimelineKeepRange[];
  widthScale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);

  useEffect(() => {
    if (!audioUrl) return;
    let cancelled = false;
    const load = async () => {
      try {
        const decoded = await loadAudioBuffer(audioUrl);
        if (!cancelled) setBuffer(decoded);
      } catch (e) {
        console.error('Erro ao carregar waveform:', e);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [audioUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;

    const frame = requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const visualWidth = Math.max(1, duration * widthScale);
      const drawWidth = Math.max(1, Math.min(MAX_WAVEFORM_CANVAS_WIDTH, Math.ceil(visualWidth)));
      const height = 40;

      canvas.width = drawWidth * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const data = buffer.getChannelData(0);
      const amp = height / 2;
      const sampleRate = buffer.sampleRate;

      ctx.clearRect(0, 0, drawWidth, height);
      ctx.fillStyle = color;

      for (let i = 0; i < drawWidth; i++) {
        let min = 1.0;
        let max = -1.0;

        const outputStartSec = (i / drawWidth) * duration;
        const outputEndSec = Math.min(duration, ((i + 1) / drawWidth) * duration);

        const sourceStartSec = audioKeepRanges?.length
          ? mapOutputTimeToSourceTime(outputStartSec, audioKeepRanges)
          : outputStartSec;
        const sourceEndSec = audioKeepRanges?.length
          ? mapOutputTimeToSourceTime(outputEndSec, audioKeepRanges)
          : outputEndSec;

        const startIndex = Math.max(0, Math.floor(sourceStartSec * sampleRate));
        const endIndex = Math.min(data.length, Math.max(startIndex + 1, Math.ceil(sourceEndSec * sampleRate)));
        const sampleStep = Math.max(1, Math.floor((endIndex - startIndex) / MAX_SAMPLES_PER_COLUMN));

        for (let idx = startIndex; idx < endIndex; idx += sampleStep) {
          const datum = data[idx];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
        const y = (1 + min) * amp;
        const h = Math.max(1, (max - min) * amp);
        ctx.fillRect(i, y, 1, h);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [audioKeepRanges, buffer, color, duration, widthScale]);

  return (
    <canvas 
      ref={canvasRef} 
      style={{ width: Math.max(1, duration * widthScale), height: 40 }} 
      className="opacity-70 absolute top-0 left-0 pointer-events-none" 
    />
  );
}
