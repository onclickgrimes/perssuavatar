import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ProjectState } from '../../types/video-studio';

export function RenderingStep({ project, progress }: { project: ProjectState; progress: number }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startedAtRef = useRef<number>(Date.now());
  const maxProgressRef = useRef(0);

  useEffect(() => {
    startedAtRef.current = Date.now();
    maxProgressRef.current = 0;
    setElapsedSeconds(0);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsedSeconds(elapsed);
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const clampedProgress = Math.max(0, Math.min(100, progress));
  if (clampedProgress > maxProgressRef.current) {
    maxProgressRef.current = clampedProgress;
  }

  const estimatedTotalSeconds = useMemo(() => {
    const safeProgress = maxProgressRef.current;
    if (safeProgress <= 0 || elapsedSeconds <= 0) {
      return null;
    }
    if (safeProgress >= 100) {
      return elapsedSeconds;
    }
    return Math.round((elapsedSeconds / safeProgress) * 100);
  }, [elapsedSeconds, clampedProgress]);

  const formatTime = (seconds: number | null) => {
    if (seconds === null || !Number.isFinite(seconds)) {
      return '--:--';
    }

    const safe = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="w-24 h-24 mb-8 relative">
        <div className="absolute inset-0 border-4 border-pink-500/30 border-t-pink-500 rounded-full animate-spin" />
        <div className="absolute inset-2 border-4 border-purple-500/30 border-b-purple-500 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
        {/* Porcentagem no centro */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white font-bold text-lg">{Math.round(clampedProgress)}%</span>
        </div>
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Renderizando Vídeo</h2>
      <p className="text-white/60 mb-6">
        Tempo estimado {formatTime(estimatedTotalSeconds)} / Tempo decorrido {formatTime(elapsedSeconds)}
      </p>
      <div className="w-full max-w-md bg-white/10 rounded-full h-3 overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all duration-300" 
          style={{ width: `${clampedProgress}%` }} 
        />
      </div>
      <p className="text-white/40 text-sm mt-3">Criando vídeo: {project.title}</p>
    </div>
  );
}
