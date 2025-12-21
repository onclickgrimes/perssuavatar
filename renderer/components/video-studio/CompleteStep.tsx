import React from 'react';

export function CompleteStep({ outputPath, onNewProject }: { outputPath: string | null; onNewProject: () => void }) {
  const handleOpenFolder = async () => {
    if (outputPath) {
      // Abrir pasta contendo o arquivo
      const folderPath = outputPath.substring(0, outputPath.lastIndexOf('\\'));
      await window.electron?.invoke?.('shell-open-path', folderPath);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="w-24 h-24 mb-8 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Vídeo Pronto!</h2>
      <p className="text-white/60 mb-4">Seu vídeo foi renderizado com sucesso</p>
      
      {outputPath && (
        <p className="text-white/40 text-sm mb-6 max-w-md text-center break-all bg-white/5 px-4 py-2 rounded-lg">
          📁 {outputPath}
        </p>
      )}
      
      <div className="flex gap-4">
        <button 
          onClick={handleOpenFolder}
          className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
        >
          📁 Abrir Pasta
        </button>
        <button
          onClick={onNewProject}
          className="px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white rounded-lg font-medium transition-all"
        >
          + Novo Projeto
        </button>
      </div>
    </div>
  );
}
