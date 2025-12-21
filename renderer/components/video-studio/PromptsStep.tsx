import React from 'react';
import { TranscriptionSegment } from '../../types/video-studio';

interface PromptsStepProps {
  segments: TranscriptionSegment[];
  onUpdatePrompt: (id: number, prompt: string) => void;
  onContinue: () => void;
  onBack: () => void;
  onUpdateImage: (id: number, imageUrl: string) => void;
  useStockFootage: boolean;
}

export function PromptsStep({
  segments,
  onUpdatePrompt,
  onContinue,
  onBack,
  onUpdateImage,
  useStockFootage,
}: PromptsStepProps) {
  const [searching, setSearching] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<Record<number, any[]>>({});

  const handleSearchVideos = async () => {
    // Se não estiver usando stock footage, apenas avançar
    if (!useStockFootage) {
        onContinue();
        return;
    }

    setSearching(true);
    const results: Record<number, any[]> = {};
    const usedVideos = new Set<string>(); // Rastrear vídeos já usados

    try {
      // Para cada seguimento, buscar vídeos relevantes
      for (const segment of segments) {
        const query = segment.imagePrompt || `${segment.emotion} scene depicting: ${segment.text}`;
        console.log(`🔍 Buscando vídeos para segmento ${segment.id} com query: "${query}"`);

        const response = await window.electron.videoProject.searchVideos(query, 10);

        if (response.success && response.videos.length > 0) {
          // Filtrar vídeos já usados
          const availableVideos = response.videos.filter(
            (video: any) => !usedVideos.has(video.filename)
          );

          if (availableVideos.length > 0) {
            results[segment.id] = availableVideos;
            console.log(`✅ Encontrados ${availableVideos.length} vídeos únicos para segmento ${segment.id}`);
            
            // Auto-selecionar o primeiro vídeo disponível (não usado)
            const selectedVideo = availableVideos[0];
            usedVideos.add(selectedVideo.filename); // Marcar como usado
            onUpdateImage(segment.id, selectedVideo.filePath);
            console.log(`📹 Selecionado: ${selectedVideo.filename}`);
          } else {
            // Fallback: usar vídeo repetido se necessário
            console.warn(`⚠️ Todos os vídeos já usados, permitindo repetição`);
            results[segment.id] = response.videos;
            const topVideo = response.videos[0];
            onUpdateImage(segment.id, topVideo.filePath);
          }
        } else {
          console.warn(`⚠️ Nenhum vídeo encontrado para segmento ${segment.id}`);
          results[segment.id] = [];
        }
      }

      setSearchResults(results);
    } catch (error) {
      console.error('❌ Erro ao buscar vídeos:', error);
    } finally {
      setSearching(false);
      onContinue(); // Avançar para próxima etapa após busca
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Prompts {useStockFootage ? 'de Busca' : 'de Imagem'}</h2>
          <p className="text-white/60">
            {useStockFootage 
                ? 'Edite os prompts para buscar vídeos relevantes no banco de dados'
                : 'Edite os prompts para geração de imagens (Flux)'}
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
            onClick={handleSearchVideos}
            disabled={searching}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              searching
                ? 'bg-white/10 text-white/40 cursor-not-allowed'
                : 'bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white'
            }`}
          >
            {searching ? '🔍 Buscando...' : useStockFootage ? '🔍 Buscar Vídeos →' : 'Próximo →'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {segments.map((segment) => (
          <div
            key={segment.id}
            className="p-6 bg-white/5 border border-white/10 rounded-xl"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="px-2 py-1 bg-pink-500/20 text-pink-300 rounded text-xs">
                Cena {segment.id}
              </span>
              <span className="px-2 py-1 bg-white/10 rounded text-xs text-white/60">
                {segment.emotion}
              </span>
              {searchResults[segment.id] && (
                <span className="px-2 py-1 bg-green-500/20 text-green-300 rounded text-xs">
                  ✓ {searchResults[segment.id].length} vídeos encontrados
                </span>
              )}
            </div>
            <p className="text-white/80 text-sm mb-4 italic">"{segment.text}"</p>
            <textarea
              value={segment.imagePrompt || `${segment.emotion} scene depicting: ${segment.text}`}
              onChange={(e) => onUpdatePrompt(segment.id, e.target.value)}
              className="w-full h-24 p-4 bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/30 focus:border-pink-500 focus:outline-none resize-none"
              placeholder="Descreva o tipo de vídeo que você quer buscar..."
            />
          </div>
        ))}</div>
    </div>
  );
}
