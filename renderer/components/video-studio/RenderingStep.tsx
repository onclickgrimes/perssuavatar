import React from 'react';
import { ProjectState } from '../../types/video-studio';

export function RenderingStep({ project, progress }: { project: ProjectState; progress: number }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="w-24 h-24 mb-8 relative">
        <div className="absolute inset-0 border-4 border-pink-500/30 border-t-pink-500 rounded-full animate-spin" />
        <div className="absolute inset-2 border-4 border-purple-500/30 border-b-purple-500 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
        {/* Porcentagem no centro */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white font-bold text-lg">{Math.round(progress)}%</span>
        </div>
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Renderizando Vídeo</h2>
      <p className="text-white/60 mb-6">Isso pode levar alguns minutos...</p>
      <div className="w-full max-w-md bg-white/10 rounded-full h-3 overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all duration-300" 
          style={{ width: `${progress}%` }} 
        />
      </div>
      <p className="text-white/40 text-sm mt-3">Criando vídeo: {project.title}</p>
    </div>
  );
}
