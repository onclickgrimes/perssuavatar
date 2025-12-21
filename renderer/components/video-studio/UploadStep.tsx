import React, { useState } from 'react';

interface UploadStepProps {
  onUpload: (file: File) => void;
  editingStyle: string;
  onEditingStyleChange: (value: string) => void;
  authorConclusion: string;
  onAuthorConclusionChange: (value: string) => void;
}

export function UploadStep({ 
  onUpload,
  editingStyle,
  onEditingStyleChange,
  authorConclusion,
  onAuthorConclusionChange,
}: UploadStepProps) {
  const [isDragging, setIsDragging] = useState(false);

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
    </div>
  );
}
