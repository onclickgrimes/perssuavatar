import React, { useState } from 'react';

interface AssistantManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

type Assistant = {
  id: string;
  name: string;
  subtitle: string;
};

type Tab = 'sistema' | 'acompanhamento' | 'email' | 'conhecimento';

const ASSISTANTS: Assistant[] = [
  { id: 'general', name: 'Assistente Geral', subtitle: 'Integrado' },
  { id: 'sales', name: 'Assistente de Vendas', subtitle: 'Integrado' },
  { id: 'leetcode', name: 'Assistente LeetCode', subtitle: 'Integrado' },
  { id: 'study', name: 'Assistente de Estudo', subtitle: 'Integrado' },
  { id: 'tech', name: 'Candidato Tech', subtitle: 'Integrado' },
  { id: 'annotator', name: 'Anotador', subtitle: 'Integrado' },
];

export default function AssistantManager({ isOpen, onClose }: AssistantManagerProps) {
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant>(ASSISTANTS[1]); // Sales por padrão
  const [activeTab, setActiveTab] = useState<Tab>('sistema');
  const [certaintyCheck, setCertaintyCheck] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(`<instruções>
  <função>
    Você é um assistente especializado em vendas.
    Seu objetivo é ajudar os usuários com estratégias de vendas,
    técnicas de negociação e análise de mercado.
  </função>

  <estilo>
    Profissional, consultivo e orientado a resultados.
  </estilo>

  <conhecimento>
    - Técnicas de vendas B2B e B2C
    - Negociação e fechamento
    - Análise de pipeline
  </conhecimento>
</instruções>`);

  if (!isOpen) return null;

  const renderSidebarItem = (assistant: Assistant) => {
    const isActive = assistant.id === selectedAssistant.id;
    return (
      <button
        key={assistant.id}
        onClick={() => setSelectedAssistant(assistant)}
        className={`w-full flex flex-col items-start gap-1 px-4 py-3 text-sm font-medium transition-colors rounded-lg mb-1 ${
          isActive 
            ? 'bg-[#1f1f1f] text-white border-l-2 border-blue-500' 
            : 'text-gray-400 hover:text-white hover:bg-[#1f1f1f]/50'
        }`}
      >
        <span className="text-white text-sm font-medium">{assistant.name}</span>
        <span className="text-gray-500 text-xs">{assistant.subtitle}</span>
      </button>
    );
  };

  return (
    <div 
      className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 no-drag"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#0a0a0a] rounded-xl shadow-2xl border border-[#222] overflow-hidden flex flex-col no-drag w-[900px] h-[600px]">
        
        {/* Header */}
        <div className="h-14 border-b border-[#222] flex items-center justify-between px-6 bg-[#0f0f0f] drag">
          <h2 className="text-lg font-bold text-white tracking-wide">{selectedAssistant.name}</h2>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white transition-colors no-drag"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Sidebar */}
          <div className="w-64 border-r border-[#222] bg-[#0f0f0f] p-4 flex flex-col">
            <div className="flex-1 overflow-y-auto mb-4" style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#1a1a1a #0f0f0f'
            }}>
              {ASSISTANTS.map(assistant => renderSidebarItem(assistant))}
            </div>

            {/* Botão Criar Novo */}
            <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 rounded-lg transition-colors font-medium text-sm border border-blue-600/20">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Criar Novo Assistente
            </button>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0a0a]">
            
            {/* Tabs */}
            <div className="border-b border-[#222] bg-[#0f0f0f]">
              <div className="flex gap-0 px-6 h-12">
                {[
                  { id: 'sistema' as Tab, label: 'Sistema', icon: '⚙️' },
                  { id: 'acompanhamento' as Tab, label: 'Acompanhamento', icon: '📊' },
                  { id: 'email' as Tab, label: 'E-mail', icon: '📧' },
                  { id: 'conhecimento' as Tab, label: 'Conhecimento', icon: '📚' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 flex items-center gap-2 text-sm font-medium transition-all border-b-2 ${
                      activeTab === tab.id
                        ? 'text-white border-blue-500'
                        : 'text-gray-400 hover:text-gray-300 border-transparent'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col p-6 overflow-hidden">
              
              {activeTab === 'sistema' && (
                <div className="flex flex-col h-full gap-4">
                  {/* Textarea Editor */}
                  <div className="flex-1 flex flex-col min-h-0">
                    <label className="block text-sm font-semibold text-white mb-2">Prompt do Sistema</label>
                    <textarea
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      className="flex-1 w-full bg-[#1f1f1f] rounded-lg p-4 font-mono text-sm text-gray-300 border border-[#1a1a1a] focus:border-blue-500 focus:outline-none resize-none transition-colors"
                      style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#2a2a2a #000'
                      }}
                      placeholder="Digite o prompt do sistema aqui..."
                    />
                  </div>

                  {/* Configuração */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-white">Comportamento</h3>
                    
                    <label className="flex items-start gap-3 cursor-pointer group p-2 rounded-lg hover:bg-[#111] transition-colors">
                      <div className="relative flex items-center justify-center mt-0.5">
                        <input
                          type="checkbox"
                          checked={certaintyCheck}
                          onChange={(e) => setCertaintyCheck(e.target.checked)}
                          className="w-5 h-5 rounded border-2 border-gray-600 bg-[#1a1a1a] checked:bg-blue-600 checked:border-blue-600 transition-colors cursor-pointer"
                        />
                        {certaintyCheck && (
                          <svg className="absolute w-3 h-3 text-white pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white group-hover:text-gray-100">
                          Responder apenas quando tiver certeza
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          O assistente evitará respostas especulativas
                        </div>
                      </div>
                    </label>

                    {/* Info Alert */}
                    <div className="flex gap-2 p-3 bg-blue-600/5 border border-blue-600/20 rounded-lg">
                      <svg className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                      <p className="text-xs text-blue-300 leading-relaxed">
                        Ao ativar esta opção, o assistente será mais conservador em suas respostas, admitindo incerteza quando necessário.
                      </p>
                    </div>
                  </div>

                  {/* Footer Buttons */}
                  <div className="flex justify-end gap-3 pt-3 border-t border-[#222]">
                    <button 
                      onClick={onClose}
                      className="px-4 py-1.5 bg-[#1a1a1a] hover:bg-[#252525] text-gray-300 hover:text-white rounded-lg font-medium transition-colors text-sm"
                    >
                      Cancelar
                    </button>
                    <button className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm shadow-lg shadow-blue-600/20">
                      Salvar Alterações
                    </button>
                  </div>
                </div>
              )}

              {activeTab !== 'sistema' && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="text-6xl mb-4">🚧</div>
                  <h3 className="text-xl font-semibold text-white mb-2">Em Desenvolvimento</h3>
                  <p className="text-gray-400 text-sm">Esta seção estará disponível em breve.</p>
                </div>
              )}

            </div>
          </div>

        </div>

        {/* Help Footer */}
        <div className="border-t border-[#222] bg-[#0f0f0f] px-6 py-3 flex items-center justify-center gap-2 text-gray-400 text-xs">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-500">
            <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z" opacity="0.8" />
          </svg>
          <span>Precisa de ajuda para criar assistentes personalizados?</span>
          <button className="text-blue-400 hover:text-blue-300 underline font-medium">
            Experimente o Gerador de Prompt do Lucas Montano
          </button>
        </div>
      </div>
    </div>
  );
}
