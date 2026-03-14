import React from 'react';

// Componente do Player de Preview (lazy loaded)
export function VideoPreviewPlayer({ 
  project, 
  durationInFrames, 
  fps,
  onPlayerReady,
}: { 
  project: any; 
  durationInFrames: number; 
  fps: number;
  onPlayerReady?: (player: any) => void;
}) {
  const [Player, setPlayer] = React.useState<any>(null);
  const [VideoProjectComposition, setVideoProjectComposition] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isPrefetching, setIsPrefetching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const playerRef = React.useRef<any>(null);

  // Quando o Player montar, notificar o pai
  const handlePlayerRef = React.useCallback((instance: any) => {
    playerRef.current = instance;
    if (instance && onPlayerReady) {
      onPlayerReady(instance);
    }
  }, [onPlayerReady]);

  // Pré-carregar todos os vídeos e áudio antes de mostrar o player
  // Isso elimina o dessincronismo causado pelo carregamento tardio durante a reprodução
  const prefetchAll = React.useCallback(async () => {
    if (!project?.scenes) return;

    try {
      const { prefetch } = await import('remotion');

      // Coletar todas as URLs de vídeo das cenas
      const videoUrls: string[] = project.scenes
        .map((s: any) => s.asset_url)
        .filter((url: string | undefined): url is string => {
          if (!url) return false;
          const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
          return videoExts.some(ext => url.toLowerCase().endsWith(ext));
        });

      // Adicionar URL do áudio principal se existir
      const audioUrl = project.config?.audio?.src || project.scenes?.[0]?.audio_src;
      if (audioUrl) videoUrls.push(audioUrl);

      if (videoUrls.length === 0) return;

      console.log(`🎬 [Preview] Pré-carregando ${videoUrls.length} mídia(s)...`);
      setIsPrefetching(true);

      // Pré-carregar em paralelo (sem await - deixa carregar em background)
      // prefetch retorna um objeto com `waitUntilDone()` e `free()`
      videoUrls.forEach(url => {
        try {
          prefetch(url, { method: 'blob-url' });
        } catch (_) {
          // Ignorar falhas de prefetch; o vídeo será carregado on-demand
        }
      });

      setIsPrefetching(false);
    } catch (err) {
      setIsPrefetching(false);
    }
  }, [project]);

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

        // Iniciar pré-carregamento logo após o componente estar pronto
        prefetchAll();
      } catch (err: any) {
        console.error('Error loading preview components:', err);
        setError(err.message || 'Failed to load preview');
        setIsLoading(false);
      }
    };

    loadComponents();
  }, []);

  // Quando o projeto mudar (novo vídeo gerado), re-pré-carregar
  React.useEffect(() => {
    prefetchAll();
  }, [prefetchAll]);

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
    <>
      {isPrefetching && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2 py-1 bg-black/60 rounded-full text-xs text-white/60">
          <div className="w-2 h-2 border border-white/40 border-t-white rounded-full animate-spin" />
          Carregando mídias...
        </div>
      )}
      <Player
        ref={handlePlayerRef}
        key={`${project.config?.width}-${project.config?.height}`}
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
        // Pausa a reprodução INTEIRA (incluindo áudio) quando qualquer
        // OffthreadVideo/Video ainda está bufferizando frames
        pauseWhenBuffering
        // Aguarda 300ms de buffering antes de pausar (evita pausas desnecessárias em conexões rápidas)
        bufferStateDelayInMilliseconds={300}
        // Tags de áudio compartilhadas para seek rápido sem re-criar elementos de áudio
        numberOfSharedAudioTags={5}
      />
    </>
  );
}
