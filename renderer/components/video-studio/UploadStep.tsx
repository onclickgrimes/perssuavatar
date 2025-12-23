import React, { useState } from 'react';
import { NicheModal, ChannelNiche } from './NicheModal';

interface UploadStepProps {
  onUpload: (file: File) => void;
  editingStyle: string;
  onEditingStyleChange: (value: string) => void;
  authorConclusion: string;
  onAuthorConclusionChange: (value: string) => void;
  selectedAspectRatios: string[];
  onAspectRatiosChange: (value: string[]) => void;
  useStockFootage: boolean;
  onUseStockFootageChange: (value: boolean) => void;
  selectedNiche: ChannelNiche | null;
  onNicheChange: (niche: ChannelNiche | null) => void;
}

const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '4:5', '3:4'];

export function UploadStep({ 
  onUpload,
  editingStyle,
  onEditingStyleChange,
  authorConclusion,
  onAuthorConclusionChange,
  selectedAspectRatios = [],
  onAspectRatiosChange,
  useStockFootage = false,
  onUseStockFootageChange,
  selectedNiche,
  onNicheChange,
}: UploadStepProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isNicheModalOpen, setIsNicheModalOpen] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('audio/')) {
      onUpload(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
  };

  const toggleAspectRatio = (ratio: string) => {
    if (selectedAspectRatios.includes(ratio)) {
      onAspectRatiosChange(selectedAspectRatios.filter(r => r !== ratio));
    } else {
      onAspectRatiosChange([...selectedAspectRatios, ratio]);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`w-full max-w-xl p-12 border-2 border-dashed rounded-2xl text-center transition-all cursor-pointer ${
          isDragging
            ? 'border-pink-500 bg-pink-500/10'
            : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10'
        }`}
      >
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileSelect}
          className="hidden"
          id="audio-upload"
        />
        <label htmlFor="audio-upload" className="cursor-pointer">
          <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-pink-500/20 to-purple-500/20 rounded-full flex items-center justify-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-pink-400">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            Arraste um arquivo de áudio
          </h3>
          <p className="text-white/60 mb-4">
            ou clique para selecionar
          </p>
          <p className="text-sm text-white/40">
            Suporta MP3, WAV, M4A, OGG
          </p>
        </label>
      </div>

      {/* Campos de Configuração */}
      <div className="w-full max-w-xl mt-8 space-y-6">
        {/* Nicho do Canal */}
        <div>
          <label className="block text-white/80 font-medium mb-2">
            Nicho do Canal
          </label>
          <button
            onClick={() => setIsNicheModalOpen(true)}
            className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
              selectedNiche
                ? 'border-pink-500/50 bg-pink-500/10'
                : 'border-white/10 bg-black/30 hover:border-white/30 hover:bg-white/5'
            }`}
          >
            {selectedNiche ? (
              <div className="flex items-center gap-3">
                <span className="text-2xl">{selectedNiche.icon || '📺'}</span>
                <div className="flex-1">
                  <h4 className="text-white font-medium">{selectedNiche.name}</h4>
                  <p className="text-white/50 text-sm">{selectedNiche.description}</p>
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </div>
                <div className="flex-1">
                  <span className="text-white/60">Selecionar nicho do canal</span>
                  <p className="text-white/40 text-sm">Personaliza o estilo de vídeo para seu nicho</p>
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            )}
          </button>
          <p className="text-xs text-white/40 mt-2">
            Define prompts, componentes e estilos específicos para o nicho
          </p>
        </div>

        {/* Proporção do Vídeo */}
        <div>
          <label className="block text-white/80 font-medium mb-2">
            Proporção do Vídeo
          </label>
          <div className="grid grid-cols-3 gap-3">
            {ASPECT_RATIOS.map((ratio) => (
              <button
                key={ratio}
                onClick={() => toggleAspectRatio(ratio)}
                className={`px-4 py-2 rounded-lg border transition-all text-sm font-medium ${
                  selectedAspectRatios.includes(ratio)
                    ? 'bg-pink-500 border-pink-500 text-white'
                    : 'bg-black/30 border-white/10 text-white/60 hover:bg-white/5 hover:border-white/30'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>
          <p className="text-xs text-white/40 mt-2">
            Selecione uma ou mais proporções para gerar o vídeo
          </p>
        </div>

        {/* Mídia Automática (Stock Footage) */}
        <div>
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-white/80 font-medium mb-1">
                Buscar Mídia Automática
              </label>
              <p className="text-xs text-white/40">
                Utilizar banco de dados (Supabase) para encontrar vídeos
              </p>
            </div>
            
            <button
              onClick={() => onUseStockFootageChange(!useStockFootage)}
              className={`w-14 h-7 rounded-full p-1 transition-colors ${
                useStockFootage ? 'bg-pink-500' : 'bg-white/10'
              }`}
            >
              <div 
                className={`w-5 h-5 bg-white rounded-full shadow-lg transition-transform ${
                  useStockFootage ? 'translate-x-7' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Estilo de Edição */}
        <div>
          <label className="block text-white/80 font-medium mb-2">
            Estilo de Edição
          </label>
          <input
            type="text"
            value={editingStyle}
            onChange={(e) => onEditingStyleChange(e.target.value)}
            className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/30 focus:border-pink-500 focus:outline-none transition-all"
            placeholder="Ex: dinâmico e envolvente, calmo e reflexivo..."
          />
          <p className="text-xs text-white/40 mt-2">
            Descreva o estilo de edição desejado para o vídeo
          </p>
        </div>

        {/* Conclusão do Autor */}
        <div>
          <label className="block text-white/80 font-medium mb-2">
            Conclusão do Autor
          </label>
          <textarea
            value={authorConclusion}
            onChange={(e) => onAuthorConclusionChange(e.target.value)}
            className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/30 focus:border-pink-500 focus:outline-none resize-none transition-all"
            placeholder="Adicione uma conclusão ou mensagem final do autor..."
            rows={4}
          />
          <p className="text-xs text-white/40 mt-2">
            Mensagem final que aparecerá ao término do vídeo
          </p>
        </div>
      </div>

      {/* Modal de Nichos */}
      <NicheModal
        isOpen={isNicheModalOpen}
        onClose={() => setIsNicheModalOpen(false)}
        onSelect={onNicheChange}
        selectedNiche={selectedNiche}
      />
    </div>
  );
}

