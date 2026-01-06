import React from 'react';

interface QuizPreviewPlayerProps {
  quizProps: any;
  durationInFrames: number;
  fps: number;
  width?: number;
  height?: number;
}

/**
 * Player de Preview para Quiz Videos
 * Carrega dinamicamente o Player do Remotion e a composição QuizVideo
 */
export function QuizPreviewPlayer({ 
  quizProps, 
  durationInFrames, 
  fps,
  width = 1080,
  height = 1920,
}: QuizPreviewPlayerProps) {
  const [Player, setPlayer] = React.useState<any>(null);
  const [QuizVideoComposition, setQuizVideoComposition] = React.useState<any>(null);
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
        
        // Importar composição do Quiz
        const compositionModule = await import('../../../remotion/compositions/QuizVideoComposition');
        setQuizVideoComposition(() => compositionModule.QuizVideoComposition);
        
        setIsLoading(false);
      } catch (err: any) {
        console.error('Error loading quiz preview components:', err);
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
          <div className="w-12 h-12 mx-auto mb-4 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
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

  if (!Player || !QuizVideoComposition) {
    return null;
  }

  return (
    <Player
      key={`quiz-${width}-${height}`}
      component={QuizVideoComposition}
      inputProps={quizProps}
      durationInFrames={durationInFrames}
      fps={fps}
      compositionWidth={width}
      compositionHeight={height}
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
