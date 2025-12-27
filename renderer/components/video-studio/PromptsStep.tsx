import React from 'react';
import { TranscriptionSegment } from '../../types/video-studio';
import { 
  ASSET_DEFINITIONS, 
  type AssetType,
  CAMERA_MOVEMENTS,
  TRANSITIONS,
  type CameraMovement,
  type Transition
} from '../../../remotion/types/project';

interface PromptsStepProps {
  segments: TranscriptionSegment[];
  onUpdatePrompt: (id: number, prompt: string) => void;
  onContinue: () => void;
  onBack: () => void;
  onUpdateImage: (id: number, imageUrl: string) => void;
}

// Função helper para obter info do asset type
const getAssetTypeInfo = (assetType: string) => {
  const info = ASSET_DEFINITIONS[assetType as AssetType];
  if (info) {
    return {
      label: info.label,
      color: info.badgeColor,
      icon: info.icon,
    };
  }
  return {
    label: assetType || 'Desconhecido',
    color: 'bg-white/10 text-white/60',
    icon: '❓',
  };
};

export function PromptsStep({
  segments,
  onUpdatePrompt,
  onContinue,
  onBack,
  onUpdateImage,
}: PromptsStepProps) {
  // Verificar se algum segmento usa video_stock e ainda não tem vídeo
  const hasVideoStockWithoutUrl = segments.some(
    seg => seg.assetType === 'video_stock' && !seg.imageUrl
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Revisão de Prompts</h2>
          <p className="text-white/60">
            Revise os prompts e tipos de asset escolhidos pela IA para cada cena
          </p>
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
            className="px-6 py-2 rounded-lg font-medium transition-all bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
          >
            Próximo →
          </button>
        </div>
      </div>

      {hasVideoStockWithoutUrl && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <p className="text-yellow-300 text-sm">
            ⚠️ Alguns segmentos usam <strong>video_stock</strong> mas não encontraram vídeo automaticamente. 
            Você pode buscar manualmente na próxima etapa.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {segments.map((segment) => {
          const assetInfo = getAssetTypeInfo(segment.assetType || 'image_flux');
          
          // Buscar labels human-readable da SSoT
          const cameraLabel = segment.cameraMovement 
            ? CAMERA_MOVEMENTS[segment.cameraMovement as CameraMovement]?.label || segment.cameraMovement
            : '';
            
          const transitionLabel = segment.transition
            ? TRANSITIONS[segment.transition as Transition]?.label || segment.transition
            : '';

          return (
            <div
              key={segment.id}
              className="p-6 bg-white/5 border border-white/10 rounded-xl"
            >
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <span className="px-2 py-1 bg-pink-500/20 text-pink-300 rounded text-xs">
                  Cena {segment.id}
                </span>
                <span className="px-2 py-1 bg-white/10 rounded text-xs text-white/60">
                  {segment.emotion}
                </span>
                <span className={`px-2 py-1 ${assetInfo.color} rounded text-xs flex items-center gap-1`}>
                  {assetInfo.icon} {assetInfo.label}
                </span>
                {segment.assetType === 'video_stock' && segment.imageUrl && (
                  <span className="px-2 py-1 bg-green-500/20 text-green-300 rounded text-xs">
                    ✓ Vídeo encontrado
                  </span>
                )}
                {segment.cameraMovement && segment.cameraMovement !== 'static' && (
                  <span className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded text-xs">
                    🎥 {cameraLabel}
                  </span>
                )}
                {segment.transition && segment.transition !== 'fade' && (
                  <span className="px-2 py-1 bg-violet-500/20 text-violet-300 rounded text-xs">
                    ✨ {transitionLabel}
                  </span>
                )}
              </div>
              <p className="text-white/80 text-sm mb-4 italic">"{segment.text}"</p>
              <textarea
                value={segment.imagePrompt || `${segment.emotion} scene depicting: ${segment.text}`}
                onChange={(e) => onUpdatePrompt(segment.id, e.target.value)}
                className="w-full h-24 p-4 bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/30 focus:border-pink-500 focus:outline-none resize-none"
                placeholder="Descreva a cena visual em detalhes..."
              />
              
              {/* Mostrar highlight words se existirem */}
              {segment.highlightWords && segment.highlightWords.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs text-white/40">Palavras destacadas:</span>
                  {segment.highlightWords.map((hw, idx) => (
                    <span 
                      key={idx} 
                      className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded text-xs"
                      style={{ color: hw.color || '#FFD700' }}
                    >
                      "{hw.text}"
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
