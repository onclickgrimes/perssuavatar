import React from 'react';
import { TranscriptionSegment } from '../../types/video-studio';
import { ChannelNiche } from './NicheModal';
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
  onUpdateImage: (id: number, imageUrl: string, duration?: number) => void;
  provider?: 'gemini' | 'gemini_scraping' | 'openai' | 'deepseek';
  onProviderChange?: (p: 'gemini' | 'gemini_scraping' | 'openai' | 'deepseek') => void;
  providerModel?: string;
  onProviderModelChange?: (m: string) => void;
  onAnalyze?: (instruction?: string) => void | Promise<void>;
  onAnalyzeScene?: (segmentId: number, instruction: string) => void | Promise<void>;
  isProcessing?: boolean;
  onSegmentsUpdate?: (newSegments: TranscriptionSegment[]) => void;
  niche?: ChannelNiche | null;
  onGenerateFirstFrame?: () => void | Promise<void>;
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
    color: 'bg-zinc-800 text-zinc-100',
    icon: '❓',
  };
};

export function PromptsStep({
  segments,
  onUpdatePrompt,
  onContinue,
  onBack,
  onUpdateImage,
  provider = 'gemini',
  onProviderChange,
  providerModel,
  onProviderModelChange,
  onAnalyze,
  onAnalyzeScene,
  isProcessing,
  onSegmentsUpdate,
  niche,
  onGenerateFirstFrame,
}: PromptsStepProps) {
  // Verificar se algum segmento usa video_stock e ainda não tem vídeo
  const hasVideoStockWithoutUrl = segments.some(
    seg => seg.assetType === 'video_stock' && !seg.imageUrl
  );
  
  const hasImagePrompts = segments.some(s => !!s.imagePrompt);
  const hasFrameAnimatePrompts = segments.some(
    s => s.assetType === 'video_frame_animate' && (!!s.firstFrame || !!s.animateFrame)
  );
  const hasPrompts = hasImagePrompts || hasFrameAnimatePrompts;
  const [globalInstruction, setGlobalInstruction] = React.useState('');
  const [sceneInstructions, setSceneInstructions] = React.useState<Record<number, string>>({});
  const [pendingSceneId, setPendingSceneId] = React.useState<number | null>(null);
  const hasGlobalInstruction = globalInstruction.trim().length > 0;

  const isAiBusy = Boolean(isProcessing) || pendingSceneId !== null;

  const handleAnalyzeWithOptionalInstruction = async () => {
    if (!onAnalyze || isAiBusy) return;
    const instruction = hasPrompts && hasGlobalInstruction
      ? globalInstruction.trim()
      : undefined;
    await onAnalyze(instruction);
  };

  const handleApplySceneInstruction = async (segmentId: number) => {
    if (!onAnalyzeScene || isAiBusy) return;

    const instruction = (sceneInstructions[segmentId] || '').trim();
    if (!instruction) return;

    setPendingSceneId(segmentId);
    try {
      await onAnalyzeScene(segmentId, instruction);
      setSceneInstructions(prev => ({ ...prev, [segmentId]: '' }));
    } finally {
      setPendingSceneId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Revisão de Prompts</h2>
          <p className="text-white/60">
            Revise os prompts e tipos de asset escolhidos pela IA para cada cena
          </p>
          
          {onProviderChange && (
            <div className="flex items-center gap-3 mt-6">
               <span className="text-white/60 text-sm">IA de Análise:</span>
               <select
                 value={provider}
                 onChange={(e) => onProviderChange(e.target.value as any)}
                 className="bg-black/30 border border-white/10 rounded-lg px-3 py-1 text-white text-sm focus:border-pink-500 focus:outline-none"
               >
                 <option value="gemini">Google Gemini</option>
                 <option value="gemini_scraping">Gemini (Scraping Navegador)</option>
                 <option value="openai">OpenAI</option>
                 <option value="deepseek">DeepSeek V3</option>
               </select>

               {onProviderModelChange && (
                 <>
                   <span className="text-white/60 text-sm ml-2">Modelo:</span>
                   <select
                     value={providerModel || ''}
                     onChange={(e) => onProviderModelChange(e.target.value)}
                     className="bg-black/30 border border-white/10 rounded-lg px-3 py-1 text-white text-sm focus:border-pink-500 focus:outline-none"
                   >
                     {provider === 'gemini' && (
                       <>
                         <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite ($0.25 inputs / $1.50 outputs)</option>
                         <option value="gemini-3-flash-preview">Gemini 3 Flash ($0.50 inputs / $3 outputs)</option>
                         <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro ($2 inputs / $12 outputs)</option>
                       </>
                     )}
                     {provider === 'gemini_scraping' && (
                       <>
                         <option value="gemini-web-auto">Gemini Web (usa modelo ativo da conta)</option>
                       </>
                     )}
                     {provider === 'openai' && (
                       <>
                         <option value="gpt-5.4-mini">GPT 5.4 Mini ($0.75 inputs / $4.50 outputs)</option>
                         <option value="gpt-5.4">GPT 5.4 ($2.50 inputs / $15.00 outputs)</option>
                       </>
                     )}
                     {provider === 'deepseek' && (
                       <>
                         <option value="deepseek-chat">DeepSeek Chat V3</option>
                         <option value="deepseek-reasoner">DeepSeek Reasoner R1</option>
                       </>
                     )}
                   </select>
                 </>
               )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex gap-3 items-center">
            <button
              onClick={onBack}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
            >
              ← Voltar
            </button>
            
            {onAnalyze && (
              <button
                onClick={handleAnalyzeWithOptionalInstruction}
                disabled={isAiBusy}
                className={`px-4 py-2 border rounded-lg transition-all flex items-center gap-2 ${
                   hasPrompts 
                      ? 'bg-white/5 hover:bg-white/10 text-white border-white/20' 
                      : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500 animate-pulse'
                } ${isAiBusy ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {isAiBusy ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Gerando...
                    </>
                ) : hasPrompts
                  ? hasGlobalInstruction ? '✏️ Editar com IA' : '🔄 Regerar com IA'
                  : '✨ Gerar Prompts com IA'}
              </button>
            )}

            {onGenerateFirstFrame && hasImagePrompts && (
              <button
                onClick={onGenerateFirstFrame}
                disabled={isAiBusy}
                className={`px-4 py-2 border border-white/20 rounded-lg transition-all flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white ${isAiBusy ? 'opacity-70 cursor-not-allowed' : ''}`}
                title="Gera apenas os prompts de primeiro frame mantendo os prompts atuais"
              >
                🖼️ Gerar First Frames
              </button>
            )}

            <button
              onClick={onContinue}
              disabled={!hasPrompts}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                  !hasPrompts
                  ? 'bg-white/5 text-white/30 cursor-not-allowed'
                  : 'bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white'
              }`}
            >
              Próximo →
            </button>
          </div>

          {onAnalyze && (
            <div className="w-full max-w-[560px]">
              <input
                type="text"
                value={globalInstruction}
                onChange={(e) => setGlobalInstruction(e.target.value)}
                placeholder="Instrução global para edição dos prompts"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:border-pink-500 focus:outline-none"
                disabled={isAiBusy}
              />
            </div>
          )}
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

      <div className="space-y-4 prompts-scenes-scrollbar">
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
                
                <div className="relative group">
                  <select
                    value={segment.assetType || (niche?.asset_types?.[0] || 'image_flux')}
                    onChange={(e) => {
                       if (onSegmentsUpdate) {
                          const newSegments = segments.map(s => 
                            s.id === segment.id ? { ...s, assetType: e.target.value } : s
                          );
                          onSegmentsUpdate(newSegments);
                       }
                    }}
                    disabled={!onSegmentsUpdate}
                    className={`appearance-none px-2 py-1 pr-8 ${assetInfo.color} bg-black/40 border border-white/10 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-pink-500/50 transition-all hover:bg-black/60 host:border-white/20`}
                  >
                    {(niche?.asset_types && niche.asset_types.length > 0 
                        ? niche.asset_types 
                        : Object.keys(ASSET_DEFINITIONS)
                    ).map(type => {
                      const def = ASSET_DEFINITIONS[type as keyof typeof ASSET_DEFINITIONS];
                      return (
                        <option key={type} value={type} className="bg-gray-900 text-white">
                           {def?.label || type}
                        </option>
                      );
                    })}
                  </select>
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-white/50">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>

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

              {onAnalyzeScene && (
                <div className="mb-4 flex items-center gap-2">
                  <input
                    type="text"
                    value={sceneInstructions[segment.id] || ''}
                    onChange={(e) => setSceneInstructions(prev => ({ ...prev, [segment.id]: e.target.value }))}
                    placeholder="Comando para ajustar apenas esta cena"
                    className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:border-pink-500 focus:outline-none"
                    disabled={isAiBusy}
                  />
                  <button
                    onClick={() => handleApplySceneInstruction(segment.id)}
                    disabled={isAiBusy || !(sceneInstructions[segment.id] || '').trim()}
                    className={`w-10 h-10 rounded-lg border transition-all flex items-center justify-center ${
                      isAiBusy || !(sceneInstructions[segment.id] || '').trim()
                        ? 'bg-white/10 border-white/10 text-white/50 cursor-not-allowed'
                        : 'bg-pink-500/20 border-pink-500/40 text-pink-200 hover:bg-pink-500/30'
                    }`}
                    title="Aplicar comando nesta cena com IA"
                  >
                    {pendingSceneId === segment.id ? (
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      '↻'
                    )}
                  </button>
                </div>
              )}

              {segment.assetType === 'video_frame_animate' ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-white/60 mb-1">firstFrame</p>
                    <textarea
                      value={segment.firstFrame || ''}
                      onChange={(e) => {
                        if (!onSegmentsUpdate) return;
                        const newSegments = segments.map(s =>
                          s.id === segment.id ? { ...s, firstFrame: e.target.value } : s
                        );
                        onSegmentsUpdate(newSegments);
                      }}
                      rows={4}
                      className="w-full min-h-[7rem] bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/30 focus:border-pink-500 focus:outline-none resize-y p-4"
                      placeholder="Prompt detalhado em inglês para o primeiro frame..."
                      disabled={!onSegmentsUpdate}
                    />
                  </div>

                  <div>
                    <p className="text-xs text-white/60 mb-1">animateFrame</p>
                    <textarea
                      value={segment.animateFrame || ''}
                      onChange={(e) => {
                        if (!onSegmentsUpdate) return;
                        const newSegments = segments.map(s =>
                          s.id === segment.id ? { ...s, animateFrame: e.target.value } : s
                        );
                        onSegmentsUpdate(newSegments);
                      }}
                      rows={4}
                      className="w-full min-h-[7rem] bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/30 focus:border-pink-500 focus:outline-none resize-y p-4"
                      placeholder="Prompt em inglês para animar o vídeo a partir do firstFrame..."
                      disabled={!onSegmentsUpdate}
                    />
                  </div>
                </div>
              ) : (
                <textarea
                  value={(() => {
                    const prompt = segment.imagePrompt;
                    if (!prompt) return `${segment.emotion} scene depicting: ${segment.text}`;
                    if (typeof prompt === 'string') return prompt;
                    return JSON.stringify(prompt, null, 2);
                  })()}
                  onChange={(e) => onUpdatePrompt(segment.id, e.target.value)}
                  rows={6}
                  className="w-full min-h-[9.5rem] bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/30 focus:border-pink-500 focus:outline-none resize-y p-4"
                  placeholder="Descreva a cena visual em detalhes..."
                />
              )}

              <p className="mt-2 text-xs text-white/70">
                <span className="text-white/40">Descrição da cena: </span>
                {segment.sceneDescription || 'Aguardando resumo deste prompt...'}
              </p>
              
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
