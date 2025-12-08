import React, { useState } from 'react';

/**
 * Componente de exemplo para controlar a proteção de conteúdo
 * Adicione este componente no painel de configurações
 */
export default function ContentProtectionToggle() {
  const [isEnabled, setIsEnabled] = useState(true); // Ativado por padrão

  const handleToggle = () => {
    const newValue = !isEnabled;
    
    // Enviar comando para o processo principal
    if (typeof window !== 'undefined' && window.electron) {
      window.electron.setContentProtection(newValue);
      setIsEnabled(newValue);
      
      console.log(`🔒 Proteção de conteúdo: ${newValue ? 'ATIVADA' : 'DESATIVADA'}`);
    }
  };

  return (
    <div className="flex items-center justify-between p-4 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a]">
      {/* Informações */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          {/* Ícone de Escudo */}
          <svg 
            width="18" 
            height="18" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
            className={isEnabled ? 'text-green-500' : 'text-gray-500'}
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            {isEnabled && (
              <path d="M9 12l2 2 4-4" />
            )}
          </svg>
          
          <h3 className="text-white font-semibold text-sm">
            Proteção Contra Captura de Tela
          </h3>
        </div>
        
        <p className="text-gray-400 text-xs ml-6">
          Impede que programas de gravação vejam o conteúdo da aplicação
          {' '}
          <span className="text-yellow-500">(funciona melhor no macOS)</span>
        </p>
      </div>

      {/* Toggle Switch */}
      <button
        onClick={handleToggle}
        className={`
          relative w-12 h-6 rounded-full transition-all duration-300 ease-in-out flex-shrink-0 ml-4
          ${isEnabled ? 'bg-green-600' : 'bg-gray-600'}
        `}
        aria-label={`Proteção de conteúdo ${isEnabled ? 'ativada' : 'desativada'}`}
      >
        {/* Círculo deslizante */}
        <div
          className={`
            absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full 
            transition-transform duration-300 ease-in-out
            ${isEnabled ? 'translate-x-6' : 'translate-x-0'}
          `}
        />
        
        {/* Ícone dentro do círculo */}
        <div
          className={`
            absolute top-1 flex items-center justify-center w-4 h-4
            transition-all duration-300 ease-in-out
            ${isEnabled ? 'left-[26px]' : 'left-1'}
          `}
        >
          {isEnabled ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="3">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
        </div>
      </button>
    </div>
  );
}
