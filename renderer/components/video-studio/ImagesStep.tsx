import React, { useState } from 'react';
import { TranscriptionSegment } from '../../types/video-studio';

interface ImagesStepProps {
  segments: TranscriptionSegment[];
  onUpdateImage: (id: number, imageUrl: string) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function ImagesStep({
  segments,
  onUpdateImage,
  onContinue,
  onBack,
}: ImagesStepProps) {
  // Helper para converter caminho de arquivo em URL para preview
  const getMediaSrc = (mediaPath: string | undefined): string => {
    if (!mediaPath) return '';
    // Se já é uma URL (blob: ou http:), usar diretamente
    if (mediaPath.startsWith('blob:') || mediaPath.startsWith('http')) {
      return mediaPath;
    }
    // Caminho de arquivo Windows/Unix - converter para file:// URL
    // Substituir backslashes por forward slashes e encodar
    const normalizedPath = mediaPath.replace(/\\/g, '/');
    return `file:///${normalizedPath}`;
  };
  
  // Helper para detectar se é vídeo
  const isVideo = (url: string | undefined): boolean => {
    if (!url) return false;
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
    return videoExtensions.some(ext => url.toLowerCase().endsWith(ext));
  };
  
  const [approvedSegments, setApprovedSegments] = useState<Set<number>>(new Set());
  const [generatingSegments, setGeneratingSegments] = useState<Set<number>>(new Set());
  const [uploadingSegments, setUploadingSegments] = useState<Set<number>>(new Set());
  
  // Handler para upload de mídia (imagem ou vídeo) - salva no disco
  const handleMediaUpload = async (segmentId: number, file: File) => {
    setUploadingSegments(prev => new Set([...prev, segmentId]));
    
    try {
      // Verificar se a API está disponível
      if (!window.electron?.videoProject?.saveImage) {
        console.error('saveImage API not available');
        // Fallback: usar blob URL (não funcionará na renderização)
        const mediaUrl = URL.createObjectURL(file);
        onUpdateImage(segmentId, mediaUrl);
      } else {
        // Converter File para ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Salvar no backend e obter caminho + URL HTTP
        const result = await window.electron.videoProject.saveImage(arrayBuffer, file.name, segmentId);
        
        if (result.success && result.httpUrl) {
          // Usar a URL HTTP para preview E renderização
          // O servidor HTTP estará rodando durante ambos
          onUpdateImage(segmentId, result.httpUrl);
          console.log(`✅ Media saved for segment ${segmentId}:`, result.httpUrl);
        } else {
          console.error('Failed to save media:', result.error);
          // Fallback: usar blob URL
          const mediaUrl = URL.createObjectURL(file);
          onUpdateImage(segmentId, mediaUrl);
        }
      }
      
      // Auto-aprovar quando faz upload manual
      setApprovedSegments(prev => new Set([...prev, segmentId]));
    } catch (error) {
      console.error('Error uploading media:', error);
    } finally {
      setUploadingSegments(prev => {
        const next = new Set(prev);
        next.delete(segmentId);
        return next;
      });
    }
  };

  // Handler para aprovar imagem
  const handleApprove = (segmentId: number) => {
    setApprovedSegments(prev => new Set([...prev, segmentId]));
  };

  // Handler para refazer imagem (simula regeneração)
  const handleRegenerate = async (segmentId: number) => {
    setGeneratingSegments(prev => new Set([...prev, segmentId]));
    setApprovedSegments(prev => {
      const newSet = new Set(prev);
      newSet.delete(segmentId);
      return newSet;
    });
    
    // TODO: Chamar API de geração de imagem
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setGeneratingSegments(prev => {
      const newSet = new Set(prev);
      newSet.delete(segmentId);
      return newSet;
    });
  };

  // Handler para remover imagem
  const handleRemoveImage = (segmentId: number) => {
    onUpdateImage(segmentId, '');
    setApprovedSegments(prev => {
      const newSet = new Set(prev);
      newSet.delete(segmentId);
      return newSet;
    });
  };

  const allApproved = segments.every(seg => approvedSegments.has(seg.id));
  const segmentsWithMedia = segments.filter(seg => !!seg.imageUrl);
  
  // Handler para aprovar todas as mídias de uma vez
  const handleApproveAll = () => {
    const allSegmentIds = segments.map(seg => seg.id);
    setApprovedSegments(new Set(allSegmentIds));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Imagens e Vídeos das Cenas</h2>
          <p className="text-white/60">Aprove, refaça ou faça upload das suas próprias imagens ou vídeos (opcional)</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
          >
            ← Voltar
          </button>
          {/* Botão de aprovar todas */}
          {segmentsWithMedia.length > 0 && !allApproved && (
            <button
              onClick={handleApproveAll}
              className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg transition-all font-medium flex items-center gap-2"
            >
              ✓ Aprovar Todas
            </button>
          )}
          <button
            onClick={onContinue}
            className="px-6 py-2 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white rounded-lg font-medium transition-all"
          >
            Renderizar Vídeo →
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="text-white/60 text-sm">
            {approvedSegments.size} de {segments.length} aprovadas
          </span>
        </div>
        {segmentsWithMedia.length === 0 && (
          <span className="text-blue-400 text-sm">
            ℹ️ Você pode renderizar sem mídias (apenas texto/legendas)
          </span>
        )}
        {segmentsWithMedia.length > 0 && !allApproved && (
          <span className="text-orange-400 text-sm">
            ⚠️ Algumas mídias ainda não foram aprovadas
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {segments.map((segment) => {
          const isApproved = approvedSegments.has(segment.id);
          const isGenerating = generatingSegments.has(segment.id);
          const isUploading = uploadingSegments.has(segment.id);
          const hasImage = !!segment.imageUrl;

          return (
            <div
              key={segment.id}
              className={`bg-white/5 border rounded-xl overflow-hidden transition-all ${
                isApproved ? 'border-green-500/50' : 'border-white/10'
              }`}
            >
              {/* Preview de imagem ou área de upload */}
              <div className="aspect-video relative group">
                {(isGenerating || isUploading) ? (
                  <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-purple-500/10 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-10 h-10 mx-auto mb-2 border-2 border-pink-500/30 border-t-pink-500 rounded-full animate-spin" />
                      <p className="text-white/60 text-sm">{isUploading ? 'Enviando...' : 'Gerando...'}</p>
                    </div>
                  </div>
                ) : hasImage ? (
                  <>
                    {isVideo(segment.imageUrl) ? (
                      <video
                        src={getMediaSrc(segment.imageUrl)}
                        className="w-full h-full object-cover"
                        autoPlay
                        loop
                        muted
                        playsInline
                      />
                    ) : (
                      <img
                        src={getMediaSrc(segment.imageUrl)}
                        alt={`Cena ${segment.id}`}
                        className="w-full h-full object-cover"
                      />
                    )}
                    {/* Overlay de ações */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleRemoveImage(segment.id)}
                        className="px-3 py-2 bg-red-500/80 hover:bg-red-500 text-white rounded-lg text-sm transition-all"
                      >
                        🗑️ Remover
                      </button>
                      <label className="px-3 py-2 bg-blue-500/80 hover:bg-blue-500 text-white rounded-lg text-sm cursor-pointer transition-all">
                        📁 Trocar
                        <input
                          type="file"
                          accept="image/*,video/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleMediaUpload(segment.id, file);
                          }}
                        />
                      </label>
                    </div>
                    {/* Badge de aprovado */}
                    {isApproved && (
                      <div className="absolute top-2 right-2 px-2 py-1 bg-green-500 text-white text-xs rounded-full">
                        ✓ Aprovada
                      </div>
                    )}
                  </>
                ) : (
                  <label 
                    className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-purple-500/10 flex items-center justify-center cursor-pointer hover:from-pink-500/20 hover:to-purple-500/20 transition-all"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.add('from-pink-500/30', 'to-purple-500/30');
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.remove('from-pink-500/30', 'to-purple-500/30');
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.remove('from-pink-500/30', 'to-purple-500/30');
                      const file = e.dataTransfer.files?.[0];
                      if (file && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
                        handleMediaUpload(segment.id, file);
                      }
                    }}
                  >
                    <div className="text-center pointer-events-none">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-2 text-white/40">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                      </svg>
                      <p className="text-white/60 text-sm mb-2">Arraste uma imagem ou vídeo aqui</p>
                      <p className="text-white/40 text-xs">ou clique para selecionar</p>
                    </div>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleMediaUpload(segment.id, file);
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Info do segmento */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-pink-500/20 text-pink-300 rounded text-xs">
                    Cena {segment.id}
                  </span>
                  <span className="px-2 py-0.5 bg-white/10 text-white/50 rounded text-xs">
                    {segment.emotion}
                  </span>
                </div>
                <p className="text-white/80 text-sm line-clamp-2 mb-3">{segment.text}</p>
                
                {/* Botões de ação */}
                <div className="flex gap-2">
                  {hasImage && !isApproved && (
                    <button
                      onClick={() => handleApprove(segment.id)}
                      className="flex-1 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-lg text-sm transition-all"
                    >
                      ✓ Aprovar
                    </button>
                  )}
                  <button
                    onClick={() => handleRegenerate(segment.id)}
                    disabled={isGenerating}
                    className={`flex-1 py-2 rounded-lg text-sm transition-all ${
                      isGenerating
                        ? 'bg-white/5 text-white/30 cursor-not-allowed'
                        : 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-300'
                    }`}
                  >
                    {isGenerating ? '...' : '↻ Gerar com IA'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
