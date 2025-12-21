import React from 'react';

// Componente do Player de Preview (lazy loaded)
export function VideoPreviewPlayer({ 
  project, 
  durationInFrames, 
  fps 
}: { 
  project: any; 
  durationInFrames: number; 
  fps: number;
}) {
  const [Player, setPlayer] = React.useState<any>(null);
  const [VideoProjectComposition, setVideoProjectComposition] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Carregar componentes dinamicamente (evita SSR)
  React.useEffect(() => {
    const loadComponents = async () => {
      try {
        setIsLoading(true);
        // Importar Player do Remotion
        const playerModule = await import('@remotion/player');
        setPlayer(() => playerModule.Player);
        
        // Importar composição
        const compositionModule = await import('../../../remotion/compositions/VideoProject');
        setVideoProjectComposition(() => compositionModule.VideoProjectComposition);
        
        setIsLoading(false);
      } catch (err: any) {
        console.error('Error loading preview components:', err);
        setError(err.message || 'Failed to load preview');
        setIsLoading(false);
      }
    };

    loadComponents();
  }, []);

  if (isLoading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 border-2 border-pink-500/30 border-t-pink-500 rounded-full animate-spin" />
          <p className="text-white/60">Carregando preview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <div className="text-center p-4">
          <p className="text-red-400 mb-2">❌ Erro ao carregar preview</p>
          <p className="text-white/60 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!Player || !VideoProjectComposition) {
    return null;
  }

  return (
    <Player
      component={VideoProjectComposition}
      inputProps={{ project }}
      durationInFrames={durationInFrames}
      fps={fps}
      compositionWidth={project.config?.width || 1080}
      compositionHeight={project.config?.height || 1920}
      style={{
        width: '100%',
        height: '100%',
      }}
      controls
      loop
      autoPlay={false}
      allowFullscreen
      clickToPlay
      doubleClickToFullscreen
      spaceKeyToPlayOrPause
    />
  );
}
