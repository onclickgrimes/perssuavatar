import React from 'react';
import { ProjectState } from '../../types/video-studio';
import { VideoPreviewPlayer } from './VideoPreviewPlayer';

interface PreviewStepProps {
  project: ProjectState;
  subtitleMode: 'paragraph' | 'word-by-word';
  setSubtitleMode: (mode: 'paragraph' | 'word-by-word') => void;
  onContinue: () => void;
  onBack: () => void;
}

export function PreviewStep({
  project,
  subtitleMode,
  setSubtitleMode,
  onContinue,
  onBack,
}: PreviewStepProps) {
  // Converter ProjectState para formato do Remotion
  const remotionProject = React.useMemo(() => {
    const fps = 30;
    return {
      project_title: project.title,
      description: project.description,
      config: {
        width: 1920,
        height: 1080,
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
        asset_url: seg.imageUrl || '',
        prompt_suggestion: seg.imagePrompt || '',
        camera_movement: seg.cameraMovement || 'static',
        transition: seg.transition || 'fade',
        transition_duration: 0.5,
        text_overlay: {
          text: seg.text,
          position: 'bottom',
          style: 'subtitle',
          animation: 'fade',
          words: seg.words, // ✅ Palavras do Deepgram
        },
        // Incluir palavras destacadas
        ...(seg.highlightWords && seg.highlightWords.length > 0 && {
          highlight_words: seg.highlightWords,
        }),
      })),
      schema_version: '1.0',
    };
  }, [project, subtitleMode]);
  
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
        {/* Controle de Modo de Legenda */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-white/60 text-sm">📝 Modo de Legenda:</span>
            <div className="flex bg-white/5 rounded-lg p-1 gap-1">
              <button
                onClick={() => setSubtitleMode('paragraph')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  subtitleMode === 'paragraph'
                    ? 'bg-purple-500 text-white shadow-lg'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                📄 Parágrafo
              </button>
              <button
                onClick={() => setSubtitleMode('word-by-word')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  subtitleMode === 'word-by-word'
                    ? 'bg-purple-500 text-white shadow-lg'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                🎤 Palavra por Palavra
              </button>
            </div>
          </div>
          <span className="text-white/40 text-xs">
            {subtitleMode === 'paragraph' ? 'Texto completo' : 'Sincronizado com áudio'}
          </span>
        </div>
        
        <div className="relative" style={{ aspectRatio: '16/9' }}>
          {/* Importação dinâmica do Player para evitar SSR issues */}
          <VideoPreviewPlayer
            project={remotionProject}
            durationInFrames={durationInFrames}
            fps={fps}
          />
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
          <p className="text-white/60 text-sm">Resolução</p>
          <p className="text-white text-lg font-bold">1080p</p>
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
