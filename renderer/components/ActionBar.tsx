import React, { useState, useEffect } from 'react';
import AssistantManager from './AssistantManager';

interface ActionBarProps {
  isVisible: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}

type Assistant = {
  id: string;
  name: string;
  subtitle: string;
  systemPrompt: string;
  answerOnlyWhenCertain: boolean;
  followUpPrompt: string;
  emailSummaryPrompt: string;
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = 'selectedAssistantId';

export default function ActionBar({ isVisible, onClose, onOpenSettings }: ActionBarProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
  const [isManagerOpen, setIsManagerOpen] = useState(false);

  // Carregar assistentes do banco de dados
  useEffect(() => {
    loadAssistants();
  }, []);

  // Sincronizar com localStorage quando o modal de gerenciamento fecha
  useEffect(() => {
    if (!isManagerOpen) {
      loadAssistants();
    }
  }, [isManagerOpen]);

  // Fechar dropdown quando assistente mudar
  useEffect(() => {
    if (selectedAssistant) {
      setIsDropdownOpen(false);
    }
  }, [selectedAssistant]);

  // Fechar dropdown ao pressionar Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDropdownOpen) {
        setIsDropdownOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isDropdownOpen]);

  const loadAssistants = async () => {
    try {
      const loadedAssistants = await window.electron.db.getAssistants();
      setAssistants(loadedAssistants);

      // Carregar o assistente selecionado do localStorage
      const savedId = localStorage.getItem(STORAGE_KEY);
      
      if (savedId) {
        const savedAssistant = loadedAssistants.find(a => a.id === savedId);
        if (savedAssistant) {
          setSelectedAssistant(savedAssistant);
          return;
        }
      }

      // Se não há seleção salva ou não foi encontrado, selecionar o primeiro
      if (loadedAssistants.length > 0) {
        setSelectedAssistant(loadedAssistants[0]);
        localStorage.setItem(STORAGE_KEY, loadedAssistants[0].id);
      }
    } catch (error) {
      console.error('Erro ao carregar assistentes:', error);
    }
  };

  if (!isVisible) return null;

  const handleSelectAssistant = (assistant: Assistant) => {
    setSelectedAssistant(assistant);
    localStorage.setItem(STORAGE_KEY, assistant.id);
    setIsDropdownOpen(false);
  };

  return (
    <>
    {/* Backdrop invisível para fechar dropdown ao clicar fora */}
    {isDropdownOpen && (
      <div 
        className="fixed inset-0 z-[499]"
        onClick={() => setIsDropdownOpen(false)}
      />
    )}
    
    <div 
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[500] flex flex-col items-center gap-2 no-drag font-sans pointer-events-auto"
    >
      {/* Dropdown Menu */}
      {isDropdownOpen && (
        <div className="mb-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl shadow-2xl min-w-max overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#2a2a2a] flex items-center gap-2 whitespace-nowrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-gray-400">
              <path d="M12 2C7.58 2 4 5.58 4 10C4 12.91 5.6 15.46 8 16.82V19C8 19.55 8.45 20 9 20H15C15.55 20 16 19.55 16 19V16.82C18.4 15.46 20 12.91 20 10C20 5.58 16.42 2 12 2ZM12 11C11.45 11 11 10.55 11 10C11 9.45 11.45 9 12 9C12.55 9 13 9.45 13 10C13 10.55 12.55 11 12 11Z" opacity="0.8"/>
            </svg>
            <h3 className="text-white font-semibold text-sm">Selecionar Assistente</h3>
          </div>

          {/* Lista de Assistentes (com scroll) */}
          <div className="max-h-64 overflow-y-auto overflow-x-hidden" style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#1a1a1a #0a0a0a'
          }}>
            <style jsx>{`
              div::-webkit-scrollbar {
                width: 6px;
              }
              div::-webkit-scrollbar-track {
                background: #0a0a0a;
              }
              div::-webkit-scrollbar-thumb {
                background: #1a1a1a;
                border-radius: 3px;
              }
              div::-webkit-scrollbar-thumb:hover {
                background: #252525;
              }
            `}</style>
            {assistants.map((assistant, index) => {
              const isSelected = selectedAssistant && assistant.id === selectedAssistant.id;
              
              return (
                <div key={assistant.id}>
                  <button
                    onClick={() => handleSelectAssistant(assistant)}
                    className={`w-full px-4 py-3 flex items-center gap-3 transition-colors relative ${
                      isSelected 
                        ? 'bg-[#1a1a1a]' 
                        : 'hover:bg-[#151515]'
                    }`}
                  >
                    {/* Barra lateral branca para item selecionado */}
                    {isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-white rounded-r" />
                    )}

                    {/* Conteúdo do item */}
                    <div className="flex-1 text-left ml-2">
                      <div className="text-white text-sm font-medium">{assistant.name}</div>
                      <div className="text-gray-500 text-xs">{assistant.subtitle}</div>
                    </div>

                    {/* Checkmark para item selecionado */}
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    )}
                  </button>
                  
                  {/* Separador */}
                  {index < assistants.length - 1 && (
                    <div className="mx-4 border-b border-[#1a1a1a]" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer - Gerenciar Assistentes */}
          <div className="px-1 py-2 border-t border-[#2a2a2a]">
            <button 
              onClick={() => {
                setIsManagerOpen(true);
                setIsDropdownOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 bg-[#1a1a1a] hover:bg-[#252525] transition-colors rounded-lg px-4 py-2.5"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span className="text-white text-sm font-medium">Gerenciar Assistentes</span>
            </button>
          </div>
        </div>
      )}

      {/* 1. Context Selector Button (Pílula Superior) */}
      <button 
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className={`flex items-center gap-2 bg-[#141414] hover:bg-[#1f1f1f] transition-all rounded-full px-4 py-1.5 shadow-lg border ${
          isDropdownOpen ? 'border-white' : 'border-[#2a2a2a]'
        }`}
      >
        {/* Intelligence Icon */}
        <div className="text-gray-400">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C7.58 2 4 5.58 4 10C4 12.91 5.6 15.46 8 16.82V19C8 19.55 8.45 20 9 20H15C15.55 20 16 19.55 16 19V16.82C18.4 15.46 20 12.91 20 10C20 5.58 16.42 2 12 2ZM12 11C11.45 11 11 10.55 11 10C11 9.45 11.45 9 12 9C12.55 9 13 9.45 13 10C13 10.55 12.55 11 12 11Z" opacity="0.8"/>
              <path d="M10 21H14V22H10V21Z" opacity="0.5"/>
           </svg>
        </div>
        
        {/* Text */}
        <span className="text-white text-sm font-medium">{selectedAssistant?.name || 'Nenhum assistente'}</span>
        
        {/* Chevron (muda direção quando aberto) */}
        <svg 
          width="12" 
          height="12" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2.5" 
          className={`text-gray-400 ml-1 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
        >
          <path d="M6 9L12 15L18 9" />
        </svg>
      </button>


      {/* 2. Main Action Bar */}
      <div className="flex items-center bg-[#141414] rounded-2xl p-1 shadow-2xl border border-[#2a2a2a] h-12">
        
        {/* A. Left Section (Tools & Navigation) */}
        <div className="flex items-center gap-1 px-2">
          {/* Close Button */}
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#252525] hover:bg-red-600/20 text-gray-400 hover:text-red-400 transition-all shadow-sm group mr-1"
            title="Fechar (ESC)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          {/* Settings Button */}
          <button 
            onClick={onOpenSettings}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#252525] hover:bg-[#333] text-gray-400 hover:text-white transition-all shadow-sm group"
            title="Configurações"
          >
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:rotate-90 transition-transform">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>

          {/* History Button */}
          <button 
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#252525] hover:bg-[#333] text-gray-400 hover:text-white transition-all shadow-sm"
            title="Histórico"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v4l3 3"></path>
              <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"></path>
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div className="w-[1px] h-6 bg-[#333] mx-1"></div>

        {/* B. Center Section (Input Placeholder - Now a Button) */}
        <button className="flex-1 flex items-center bg-[#1f1f1f] hover:bg-[#252525] rounded-lg px-2 py-1.5 mx-2 h-9 border border-[#2a2a2a] min-w-[120px] cursor-pointer group transition-colors text-left">
          
          {/* Visual Keys */}
          <div className="flex items-center gap-1.5 mr-2 opacity-60 group-hover:opacity-80 transition-opacity">
            <div className="flex items-center justify-center px-1.5 h-5 bg-[#333] rounded text-[10px] font-bold text-gray-300 border-b border-[#111] shadow-[0_1px_0_rgba(0,0,0,0.5)]">
              Ctrl
            </div>
            <div className="flex items-center justify-center w-5 h-5 bg-[#333] rounded text-[10px] font-bold text-gray-300 border-b border-[#111] shadow-[0_1px_0_rgba(0,0,0,0.5)]">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 14l-4-4 4-4"/>
                  <path d="M5 10h11a4 4 0 1 1 0 8h-1"/>
              </svg>
            </div>
          </div>

          <span className="text-gray-400 text-sm font-medium truncate">Perguntar</span>
        </button>

        {/* C. Right Section (Primary Action) */}
        <button className="h-10 ml-1 pl-3 pr-4 rounded-xl bg-[#0066FF] hover:bg-[#005ce6] text-white flex items-center gap-3 shadow-[0_0_15px_rgba(0,102,255,0.3)] transition-all transform hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap flex-shrink-0">
          <div className="flex items-center gap-1">
             <div className="flex items-center justify-center px-1.5 h-5 bg-[#3b87ff] rounded text-[10px] font-bold text-white border-b-2 border-[#004ec2] shadow-sm">
              Ctrl
            </div>
            <div className="flex items-center justify-center w-5 h-5 bg-[#3b87ff] rounded text-[10px] font-bold text-white border-b-2 border-[#004ec2] shadow-sm">
              D
            </div>
          </div>
          <span className="font-semibold text-sm tracking-wide">Começar a Ouvir</span>
        </button>

      </div>
    </div>

    {/* Assistant Manager Modal */}
    <AssistantManager isOpen={isManagerOpen} onClose={() => setIsManagerOpen(false)} />
    </>
  );
}
