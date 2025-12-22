import React from 'react';
import { ProjectState } from '../../types/video-studio';
import { VideoPreviewPlayer } from './VideoPreviewPlayer';

interface PreviewStepProps {
  project: ProjectState;
  subtitleMode: 'paragraph' | 'word-by-word';
  setSubtitleMode: (mode: 'paragraph' | 'word-by-word') => void;
  onContinue: () => void;
  onBack: () => void;
  onAspectRatiosChange: (ratios: string[]) => void;
}

export function PreviewStep({
  project,
  subtitleMode,
  setSubtitleMode,
  onContinue,
  onBack,
  onAspectRatiosChange,
}: PreviewStepProps) {
  // Estado para proporção selecionada no preview
  const [selectedRatio, setSelectedRatio] = React.useState<string>(() => {
    return project.selectedAspectRatios?.[0] || '9:16';
  });

  const [showRatioMenu, setShowRatioMenu] = React.useState(false);

  const ASPECT_RATIO_DIMENSIONS: Record<string, { width: number; height: number }> = {
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
    '1:1': { width: 1080, height: 1080 },
    '4:3': { width: 1440, height: 1080 },
    '4:5': { width: 1080, height: 1350 },
    '3:4': { width: 1080, height: 1440 },
  };

  const AVAILABLE_RATIOS = Object.keys(ASPECT_RATIO_DIMENSIONS);
  const currentRatios = project.selectedAspectRatios || ['9:16'];

  // Converter ProjectState para formato do Remotion
  const remotionProject = React.useMemo(() => {
    // ... (mesmo código de antes)
    const fps = 30;
    const dims = ASPECT_RATIO_DIMENSIONS[selectedRatio] || { width: 1080, height: 1920 };
    
    return {
      project_title: project.title,
      description: project.description,
      config: {
        width: dims.width,
        height: dims.height,
        fps,
        backgroundColor: '#0a0a0a',
        subtitleMode, // ✅ Modo de legenda
        backgroundMusic: project.audioPath ? {
          src: project.audioPath.startsWith('http') 
            ? project.audioPath 
            : `http://localhost:9999/${project.audioPath.split(/[\\/]/).pop()}`,
          volume: 1.0,
        } : undefined,
      },
      scenes: project.segments.map(seg => ({
        id: seg.id,
        start_time: seg.start,
        end_time: seg.end,
        transcript_segment: seg.text,
        visual_concept: {
          description: seg.text,
          art_style: 'photorealistic',
          emotion: seg.emotion || 'neutro',
        },
        asset_type: seg.assetType || 'image_static',
        asset_url: seg.asset_url || seg.imageUrl || '',
        prompt_suggestion: seg.imagePrompt || '',
        camera_movement: seg.cameraMovement || 'static',
        transition: seg.transition || 'fade',
        transition_duration: 0.5,
        text_overlay: {
          text: seg.text,
          position: 'bottom',
          style: 'subtitle',
          animation: 'fade',
          words: seg.words, 
        },
        // Configuração de Chroma Key (para vídeos com fundo verde/azul)
        ...(seg.chroma_key && {
          chroma_key: seg.chroma_key,
        }),
        ...(seg.highlightWords && seg.highlightWords.length > 0 && {
          highlight_words: seg.highlightWords,
        }),
        // Background
        ...(seg.background && {
          background: seg.background,
        }),
        ...(seg.timeline_config && {
          timeline_config: seg.timeline_config,
        }),
      })),
      schema_version: '1.0',
    };
  }, [project, subtitleMode, selectedRatio]);
  
  // Efeito para garantir que selectedRatio seja válido se as opções mudarem
  React.useEffect(() => {
    if (!currentRatios.includes(selectedRatio)) {
        if (currentRatios.length > 0) {
            setSelectedRatio(currentRatios[0]);
        }
    }
  }, [currentRatios, selectedRatio]);

  // Handler para adicionar/remover ratio
  const toggleAspectRatio = (ratio: string) => {
    let newRatios;
    if (currentRatios.includes(ratio)) {
        // Não permitir remover se for o único
        if (currentRatios.length <= 1) return;
        newRatios = currentRatios.filter(r => r !== ratio);
    } else {
        newRatios = [...currentRatios, ratio];
    }
    onAspectRatiosChange(newRatios);
  };

  // ... (Debug effect e calculo de duração mantidos)

  // Debug: verificar se highlight_words está presente
  React.useEffect(() => {
    console.log('🎬 RemotionProject:', remotionProject);
    remotionProject.scenes.forEach((scene: any, i: number) => {
      if (scene.highlight_words && scene.highlight_words.length > 0) {
        console.log(`✨ Scene ${i + 1} has ${scene.highlight_words.length} highlight words:`, scene.highlight_words);
      }
      if (scene.text_overlay) {
        console.log(`📝 Scene ${i + 1} text_overlay words:`, scene.text_overlay.words?.length || 0, 'words');
      }
    });
  }, [remotionProject]);

  // Calcular duração
  const lastScene = project.segments[project.segments.length - 1];
  const durationInSeconds = lastScene ? lastScene.end : 10;
  const fps = 30;
  const durationInFrames = Math.ceil(durationInSeconds * fps);

  // Helper para converter ratio string (16:9) em CSS value (16/9)
  const getCssAspectRatio = (ratio: string) => ratio.replace(':', '/');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">👁️ Preview do Vídeo</h2>
          <p className="text-white/60">
            Visualize o resultado antes de renderizar
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
          >
            ← Voltar
          </button>
          <button
            onClick={onContinue}
            className="px-6 py-2 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white rounded-lg font-medium transition-all"
          >
            🎬 Renderizar Vídeo
          </button>
        </div>
      </div>

      {/* Player de Preview */}
      <div className="bg-black/50 rounded-xl overflow-hidden shadow-2xl">
        {/* Controles de Preview */}
        <div className="p-4 border-b border-white/10 flex flex-wrap gap-4 items-center justify-between">
          
          {/* Modo de Legenda */}
          <div className="flex items-center gap-3">
            <span className="text-white/60 text-sm">📝 Legenda:</span>
            <div className="flex bg-white/5 rounded-lg p-1 gap-1">
              <button
                onClick={() => setSubtitleMode('paragraph')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  subtitleMode === 'paragraph'
                    ? 'bg-purple-500 text-white shadow-lg'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                Parágrafo
              </button>
              <button
                onClick={() => setSubtitleMode('word-by-word')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  subtitleMode === 'word-by-word'
                    ? 'bg-purple-500 text-white shadow-lg'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                Palavra por Palavra
              </button>
            </div>
          </div>

          {/* Seletor de Aspect Ratio */}
          <div className="flex items-center gap-3">
            <span className="text-white/60 text-sm relative">
                📐 Proporção:
            </span>
            <div className="flex bg-white/5 rounded-lg p-1 gap-1 flex-wrap">
            {currentRatios.map(ratio => (
                <div key={ratio} className="relative group">
                    <button
                        onClick={() => setSelectedRatio(ratio)}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all pr-7 ${
                        selectedRatio === ratio
                            ? 'bg-pink-500 text-white shadow-lg'
                            : 'text-white/60 hover:text-white hover:bg-white/10'
                        }`}
                    >
                        {ratio}
                    </button>
                    {currentRatios.length > 1 && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleAspectRatio(ratio);
                            }}
                            className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 hover:bg-black/20 rounded-full text-white/40 hover:text-white transition-all"
                            title="Remover"
                        >
                            ×
                        </button>
                    )}
                </div>
            ))}
            
            {/* Botão Adicionar */}
            <div className="relative">
                <button
                    onClick={() => setShowRatioMenu(!showRatioMenu)}
                    className="px-3 py-1.5 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 transition-all border border-dashed border-white/20 hover:border-white/40"
                    title="Adicionar Proporção"
                >
                    +
                </button>
                
                {/* Menu Dropdown */}
                {showRatioMenu && (
                    <>
                        <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => setShowRatioMenu(false)} 
                        />
                        <div className="absolute right-0 top-full mt-2 w-32 bg-gray-800 border border-white/10 rounded-lg shadow-xl z-20 overflow-hidden">
                            {AVAILABLE_RATIOS.filter(r => !currentRatios.includes(r)).map(ratio => (
                                <button
                                    key={ratio}
                                    onClick={() => {
                                        toggleAspectRatio(ratio);
                                        setShowRatioMenu(false);
                                        setSelectedRatio(ratio); // Auto-selecionar ao adicionar
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
                                >
                                    {ratio}
                                </button>
                            ))}
                            {AVAILABLE_RATIOS.every(r => currentRatios.includes(r)) && (
                                <div className="px-4 py-2 text-xs text-white/40 italic">
                                    Todas selecionadas
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-center bg-black/80 py-8">
            <div className="relative shadow-2xl" style={{ 
                aspectRatio: getCssAspectRatio(selectedRatio),
                height: '60vh',
                maxHeight: '600px'
            }}>
            {/* Importação dinâmica do Player para evitar SSR issues */}
            <VideoPreviewPlayer
                project={remotionProject}
                durationInFrames={durationInFrames}
                fps={fps}
            />
            </div>
        </div>
      </div>

      {/* Informações do projeto */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-white/5 rounded-lg text-center">
          <p className="text-white/60 text-sm">Duração</p>
          <p className="text-white text-lg font-bold">
            {Math.floor(durationInSeconds / 60)}:{String(Math.floor(durationInSeconds % 60)).padStart(2, '0')}
          </p>
        </div>
        <div className="p-4 bg-white/5 rounded-lg text-center">
          <p className="text-white/60 text-sm">Cenas</p>
          <p className="text-white text-lg font-bold">{project.segments.length}</p>
        </div>
        <div className="p-4 bg-white/5 rounded-lg text-center">
          <p className="text-white/60 text-sm">Resolução Atual</p>
          <p className="text-white text-lg font-bold">
            {ASPECT_RATIO_DIMENSIONS[selectedRatio]?.width}x{ASPECT_RATIO_DIMENSIONS[selectedRatio]?.height}
          </p>
        </div>
      </div>

      {/* Aviso sobre renderização */}
      <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
        <p className="text-purple-300 text-sm">
          💡 <strong>Dica:</strong> O preview usa qualidade reduzida para performance. 
          O vídeo final será renderizado em alta qualidade com aceleração por GPU.
        </p>
      </div>
    </div>
  );
}

