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

  // 1. Extraímos APENAS as URLs como uma string. 
  // Se mudar só a opacidade ou o texto, essa string continua igual.
  const mediaUrlsString = React.useMemo(() => {
    if (!project?.scenes) return '';
    
    const videoUrls: string[] = project.scenes
      .map((s: any) => s.asset_url)
      .filter((url: string | undefined): url is string => {
        if (!url) return false;
        const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
        return videoExts.some(ext => url.toLowerCase().endsWith(ext));
      });

    const audioUrl = project.config?.audio?.src || project.scenes?.[0]?.audio_src;
    if (audioUrl) videoUrls.push(audioUrl);

    // Retorna algo como "url1.mp4,url2.mp4,audio.wav"
    return videoUrls.join(','); 
  }, [project]);

  // Ref para guardar as funções que limpam a RAM
  const cleanupPrefetchesRef = React.useRef<(() => void)[]>([]);

  // 2. O useEffect AGORA depende só da string de URLs
  React.useEffect(() => {
    if (!mediaUrlsString) return;

    let isMounted = true;
    const urls = mediaUrlsString.split(',');

    const doPrefetch = async () => {
      try {
        const { prefetch } = await import('remotion');

        // Limpa a RAM das mídias antigas antes de carregar novas
        cleanupPrefetchesRef.current.forEach(free => free());
        cleanupPrefetchesRef.current = [];

        console.log(`🎬 [Preview] Pré-carregando ${urls.length} mídia(s)...`);
        if (isMounted) setIsPrefetching(true);

        urls.forEach(url => {
          try {
            // Nota: Se o seu app usar mídias 100% locais do HD muito pesadas, 
            // você pode até remover esse prefetch e deixar o <video> nativo do Chrome gerenciar o buffer.
            const { free } = prefetch(url, { method: 'blob-url' });
            cleanupPrefetchesRef.current.push(free);
          } catch (_) {}
        });

        if (isMounted) setIsPrefetching(false);
      } catch (err) {
        if (isMounted) setIsPrefetching(false);
      }
    };

    doPrefetch();

    // 3. Limpeza real apenas quando o player for totalmente desmontado
    return () => {
      isMounted = false;
      cleanupPrefetchesRef.current.forEach(free => free());
      cleanupPrefetchesRef.current = [];
    };
  }, [mediaUrlsString]); // <--- A MÁGICA ESTÁ AQUI: só re-executa se adicionar/remover um clipe

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
