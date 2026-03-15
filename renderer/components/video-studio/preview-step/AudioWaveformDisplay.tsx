import React, { useRef, useState, useEffect } from 'react';

// ========================================
// WAVEFORM COMPONENT
// ========================================
export function AudioWaveformDisplay({ audioUrl, color, duration, widthScale }: {
  audioUrl: string;
  color: string;
  duration: number;
  widthScale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);

  useEffect(() => {
    if (!audioUrl) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new Ctx();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        if (!cancelled) setBuffer(decoded);
        audioCtx.close();
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

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, duration * widthScale);
    const height = 40;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = color;

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const idx = (i * step) + j;
        if (idx < data.length) {
          const datum = data[idx];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
      }
      const y = (1 + min) * amp;
      const h = Math.max(1, (max - min) * amp);
      ctx.fillRect(i, y, 1, h);
    }
  }, [buffer, duration, widthScale, color]);

  return (
    <canvas 
      ref={canvasRef} 
      style={{ width: Math.max(1, duration * widthScale), height: 40 }} 
      className="opacity-70 absolute top-0 left-0 pointer-events-none" 
    />
  );
}
