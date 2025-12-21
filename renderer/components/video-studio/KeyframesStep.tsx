import React from 'react';
import { TranscriptionSegment } from '../../types/video-studio';

interface KeyframesStepProps {
  segments: TranscriptionSegment[];
  onUpdateEmotion: (id: number, emotion: string) => void;
  onContinue: () => void;
  onBack: () => void;
  provider?: 'gemini' | 'openai' | 'deepseek';
  onProviderChange?: (p: 'gemini' | 'openai' | 'deepseek') => void;
}

export function KeyframesStep({
  segments,
  onUpdateEmotion,
  onContinue,
  onBack,
  provider = 'gemini',
  onProviderChange,
}: KeyframesStepProps) {
  const emotions = ['surpresa', 'empolgação', 'nostalgia', 'seriedade', 'alegria', 'tristeza', 'raiva', 'medo', 'neutro'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Keyframes & Emoções</h2>
          <p className="text-white/60">Revise e ajuste as emoções sugeridas para cada segmento</p>
          
          {onProviderChange && (
            <div className="flex items-center gap-3 mt-4">
               <span className="text-white/60 text-sm">IA de Análise:</span>
               <select
                 value={provider}
                 onChange={(e) => onProviderChange(e.target.value as any)}
                 className="bg-black/30 border border-white/10 rounded-lg px-3 py-1 text-white text-sm focus:border-pink-500 focus:outline-none"
               >
                 <option value="gemini">Google Gemini</option>
                 <option value="openai">OpenAI (GPT-4)</option>
                 <option value="deepseek">DeepSeek V3</option>
               </select>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
          >
            ← Voltar
          </button>
          <button
            onClick={onContinue}
            className="px-6 py-2 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white rounded-lg font-medium transition-all"
          >
            Continuar →
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {segments.map((segment) => (
          <div
            key={segment.id}
            className="p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all"
          >
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-2 py-1 bg-white/10 rounded text-xs text-white/60 font-mono">
                    {segment.start.toFixed(2)}s - {segment.end.toFixed(2)}s
                  </span>
                  <span className="text-xs text-white/40">Speaker {segment.speaker}</span>
                </div>
                <p className="text-white text-lg">{segment.text}</p>
              </div>
              
              <div className="flex flex-wrap gap-2 max-w-xs">
                {emotions.map((emotion) => (
                  <button
                    key={emotion}
                    onClick={() => onUpdateEmotion(segment.id, emotion)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                      segment.emotion === emotion
                        ? 'bg-pink-500 text-white'
                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                    }`}
                  >
                    {emotion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
