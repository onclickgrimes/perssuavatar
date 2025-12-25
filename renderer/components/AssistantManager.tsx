import React, { useState, useEffect } from 'react';
import KnowledgeTab from './KnowledgeTab';

interface AssistantManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

type Assistant = {
  id: string;
  name: string;
  subtitle: string;
  systemPrompt: string;
  answerOnlyWhenCertain: boolean;
  followUpPrompt: string;
  emailSummaryPrompt: string;
  avatarBehaviorPrompt: string;  // Instruções de comportamento do avatar (live & classic)
  avatarSpeechStyle: string;     // Estilo de fala do avatar (live & classic)
  enableEmotions: boolean;       // Habilitar emoções na fala
  createdAt: number;
  updatedAt: number;
};

type Tab = 'sistema' | 'acompanhamento' | 'email' | 'avatar' | 'conhecimento';

const DEFAULT_FOLLOW_UP_PROMPT = 'Generate 3 relevant follow-up questions based on the previous response. Each question should be concise (max 8 words) and explore different aspects. IMPORTANT: Generate the questions in the SAME LANGUAGE as the previous response.';

const DEFAULT_EMAIL_SUMMARY_PROMPT = 'Create a TLDR (Too Long; Didn\'t Read) summary that captures the essence of the conversation. Include: 1) Main topics discussed, 2) Key questions asked by the user, 3) Important solutions or insights provided, 4) Any action items or next steps mentioned. Keep it concise but comprehensive.';



export default function AssistantManager({ isOpen, onClose }: AssistantManagerProps) {
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('sistema');
  
  // Estados para o formulário
  const [assistantName, setAssistantName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [answerOnlyWhenCertain, setAnswerOnlyWhenCertain] = useState(false);
  const [followUpPrompt, setFollowUpPrompt] = useState(DEFAULT_FOLLOW_UP_PROMPT);
  const [emailSummaryPrompt, setEmailSummaryPrompt] = useState(DEFAULT_EMAIL_SUMMARY_PROMPT);
  const [avatarBehaviorPrompt, setAvatarBehaviorPrompt] = useState('');
  const [avatarSpeechStyle, setAvatarSpeechStyle] = useState('');
  const [enableEmotions, setEnableEmotions] = useState(false);
  
  // Rastrear se há mudanças não salvas
  const [isDirty, setIsDirty] = useState(false);
  
  // Modal de confirmação
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalTitle, setConfirmModalTitle] = useState('');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Carregar assistentes do database
  useEffect(() => {
    if (isOpen) {
      loadAssistants();
      setIsDirty(false); // Reset ao abrir
      // Garantir que captura eventos ao abrir
      window.electron.setIgnoreMouseEvents(false);
    }
  }, [isOpen]);

  // Atualizar formulário quando mudar o assistente selecionado
  useEffect(() => {
    if (selectedAssistant) {
      setAssistantName(selectedAssistant.name);
      setSystemPrompt(selectedAssistant.systemPrompt);
      setAnswerOnlyWhenCertain(selectedAssistant.answerOnlyWhenCertain);
      setFollowUpPrompt(selectedAssistant.followUpPrompt);
      setEmailSummaryPrompt(selectedAssistant.emailSummaryPrompt);
      setAvatarBehaviorPrompt(selectedAssistant.avatarBehaviorPrompt || '');
      setAvatarSpeechStyle(selectedAssistant.avatarSpeechStyle || '');
      setEnableEmotions(selectedAssistant.enableEmotions || false);
      setIsDirty(false); // Reset ao trocar de assistente
    }
  }, [selectedAssistant]);

  // Detectar mudanças no formulário
  useEffect(() => {
    if (selectedAssistant) {
      const hasChanges = 
        assistantName !== selectedAssistant.name ||
        systemPrompt !== selectedAssistant.systemPrompt ||
        answerOnlyWhenCertain !== selectedAssistant.answerOnlyWhenCertain ||
        followUpPrompt !== selectedAssistant.followUpPrompt ||
        emailSummaryPrompt !== selectedAssistant.emailSummaryPrompt ||
        avatarBehaviorPrompt !== (selectedAssistant.avatarBehaviorPrompt || '') ||
        avatarSpeechStyle !== (selectedAssistant.avatarSpeechStyle || '') ||
        enableEmotions !== (selectedAssistant.enableEmotions || false);
      
      setIsDirty(hasChanges);
    }
  }, [assistantName, systemPrompt, answerOnlyWhenCertain, followUpPrompt, emailSummaryPrompt, avatarBehaviorPrompt, avatarSpeechStyle, enableEmotions, selectedAssistant]);

  const loadAssistants = async () => {
    try {
      const assistantsList = await window.electron.db.getAssistants();
      setAssistants(assistantsList);
      if (assistantsList.length > 0 && !selectedAssistant) {
        setSelectedAssistant(assistantsList[0]); // Primeiro por padrão
      }
    } catch (error) {
      console.error('Erro ao carregar assistentes:', error);
    }
  };

  const handleSave = async () => {
    if (!selectedAssistant) return;

    try {
      await window.electron.db.updateAssistant(selectedAssistant.id, {
        name: assistantName,
        systemPrompt,
        answerOnlyWhenCertain,
        followUpPrompt,
        emailSummaryPrompt,
        avatarBehaviorPrompt,
        avatarSpeechStyle,
        enableEmotions
      });
      
      console.log('✅ Assistente atualizado com sucesso!');
      await loadAssistants(); // Recarregar lista
      setIsDirty(false);
    } catch (error) {
      console.error('❌ Erro ao salvar assistente:', error);
    }
  };

  const requestConfirmation = (title: string, action: () => void) => {
    setConfirmModalTitle(title);
    setPendingAction(() => action);
    setShowConfirmModal(true);
  };

  const handleConfirmYes = () => {
    if (pendingAction) {
      pendingAction();
    }
    setShowConfirmModal(false);
    setPendingAction(null);
  };

  const handleConfirmNo = () => {
    setShowConfirmModal(false);
    setPendingAction(null);
  };

  const handleSelectAssistant = (assistant: Assistant) => {
    if (isDirty) {
      requestConfirmation(
        `Sair sem salvar "${selectedAssistant?.name}"?`,
        () => {
          setIsDirty(false); // Limpar estado dirty antes de trocar
          setSelectedAssistant(assistant);
        }
      );
    } else {
      setSelectedAssistant(assistant);
    }
  };

  const handleClose = () => {
    if (isDirty) {
      requestConfirmation(
        `Sair sem salvar "${selectedAssistant?.name}"?`,
        () => {
          setIsDirty(false); // Limpar estado dirty antes de fechar
          onClose();
        }
      );
    } else {
      onClose();
    }
  };

  const handleCancel = () => {
    if (!selectedAssistant) return;
    
    // Reverter para os valores originais
    setAssistantName(selectedAssistant.name);
    setSystemPrompt(selectedAssistant.systemPrompt);
    setAnswerOnlyWhenCertain(selectedAssistant.answerOnlyWhenCertain);
    setFollowUpPrompt(selectedAssistant.followUpPrompt);
    setEmailSummaryPrompt(selectedAssistant.emailSummaryPrompt);
    setAvatarBehaviorPrompt(selectedAssistant.avatarBehaviorPrompt || '');
    setAvatarSpeechStyle(selectedAssistant.avatarSpeechStyle || '');
    setEnableEmotions(selectedAssistant.enableEmotions || false);
    setIsDirty(false);
  };

  const handleDuplicate = async (assistant: Assistant, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevenir seleção do assistente ao clicar em duplicar
    
    try {
      const newAssistant = await window.electron.db.createAssistant({
        name: `${assistant.name} - cópia`,
        subtitle: 'Personalizado',
        systemPrompt: assistant.systemPrompt,
        answerOnlyWhenCertain: assistant.answerOnlyWhenCertain,
        followUpPrompt: assistant.followUpPrompt,
        emailSummaryPrompt: assistant.emailSummaryPrompt,
        avatarBehaviorPrompt: assistant.avatarBehaviorPrompt,
        avatarSpeechStyle: assistant.avatarSpeechStyle,
        enableEmotions: assistant.enableEmotions
      });
      
      console.log('✅ Assistente duplicado com sucesso!');
      await loadAssistants(); // Recarregar lista
      setSelectedAssistant(newAssistant); // Selecionar o novo assistente
    } catch (error) {
      console.error('❌ Erro ao duplicar assistente:', error);
    }
  };

  const handleCreateNew = async () => {
    try {
      const newAssistant = await window.electron.db.createAssistant({
        name: 'Novo Assistente',
        subtitle: 'Personalizado',
        systemPrompt: `<instruções>
  <função>
    Você é um assistente personalizado.
    Descreva aqui qual é o seu objetivo e função principal.
  </função>

  <estilo>
    Descreva o estilo de comunicação deste assistente.
  </estilo>

  <conhecimento>
    - Liste os principais tópicos de conhecimento
    - Áreas de especialização
    - Competências específicas
  </conhecimento>
</instruções>`,
        answerOnlyWhenCertain: false,
        followUpPrompt: DEFAULT_FOLLOW_UP_PROMPT,
        emailSummaryPrompt: DEFAULT_EMAIL_SUMMARY_PROMPT
      });
      
      console.log('✅ Novo assistente criado com sucesso!');
      await loadAssistants(); // Recarregar lista
      setSelectedAssistant(newAssistant); // Selecionar o novo assistente
    } catch (error) {
      console.error('❌ Erro ao criar assistente:', error);
    }
  };

  const handleDelete = async (assistant: Assistant, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevenir seleção do assistente ao clicar em deletar
    
    // Usar modal customizado de confirmação
    requestConfirmation(
      `Excluir "${assistant.name}"?`,
      async () => {
        try {
          await window.electron.db.deleteAssistant(assistant.id);
          
          console.log('✅ Assistente deletado com sucesso!');
          await loadAssistants(); // Recarregar lista
          
          // Se o assistente deletado estava selecionado, selecionar outro
          if (selectedAssistant?.id === assistant.id) {
            const remainingAssistants = assistants.filter(a => a.id !== assistant.id);
            if (remainingAssistants.length > 0) {
              setSelectedAssistant(remainingAssistants[0]);
            } else {
              setSelectedAssistant(null);
            }
          }
        } catch (error) {
          console.error('❌ Erro ao deletar assistente:', error);
        }
      }
    );
  };

  if (!isOpen) return null;

  const renderSidebarItem = (assistant: Assistant) => {
    const isActive = assistant.id === selectedAssistant?.id;
    const isPersonalizado = assistant.subtitle === 'Personalizado';
    
    return (
      <div
        key={assistant.id}
        className="relative group mb-1"
      >
        {/* Botões no canto direito - apenas para personalizados */}
        {isPersonalizado && (
          <div className="absolute top-1 right-1 z-10 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Botão Deletar */}
            <button
              onClick={(e) => handleDelete(assistant, e)}
              className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-500"
              title="Excluir assistente"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
            
            {/* Botão Duplicar */}
            <button
              onClick={(e) => handleDuplicate(assistant, e)}
              className="p-1 rounded hover:bg-blue-500/20 text-gray-500 hover:text-blue-400"
              title="Duplicar assistente"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
        )}
        
        <button
          onClick={() => handleSelectAssistant(assistant)}
          className={`w-full flex items-start gap-2 px-4 py-3 text-sm font-medium transition-colors rounded-lg ${
            isActive 
              ? 'bg-[#1f1f1f] text-white border-l-2 border-blue-500' 
              : 'text-gray-400 hover:text-white hover:bg-[#1f1f1f]/50'
          }`}
        >
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <span className="text-white text-sm font-medium truncate w-full text-left">{assistant.name}</span>
            <span className="text-gray-500 text-xs text-left">{assistant.subtitle}</span>
          </div>
          
          {/* Botão Duplicar inline - apenas para integrados */}
          {!isPersonalizado && (
            <button
              onClick={(e) => handleDuplicate(assistant, e)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-blue-500/20 text-gray-400 hover:text-blue-400 flex-shrink-0"
              title="Duplicar assistente"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          )}
        </button>
      </div>
    );
  };

  return (
    <>
    <div 
      className="fixed inset-0 z-[600] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200 no-drag"
      onMouseEnter={() => window.electron.setIgnoreMouseEvents(false)}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bg-[#0a0a0a] rounded-xl shadow-2xl border border-[#222] overflow-hidden flex flex-col no-drag w-[900px] h-[600px]">
        
        {/* Header */}
        <div className="h-14 border-b border-[#222] flex items-center justify-between px-6 bg-[#0f0f0f] window-drag">
          {selectedAssistant ? (
            <div className="flex items-center gap-2 flex-1 min-w-0 mr-4">
              <div className="relative flex items-center max-w-full">
                <input
                  type="text"
                  value={assistantName}
                  onChange={(e) => setAssistantName(e.target.value)}
                  readOnly={selectedAssistant?.subtitle === 'Integrado'}
                  className={`text-lg font-bold text-white tracking-wide bg-transparent border-none outline-none bg-[#0f0f0f] hover:bg-[#1a1a1a] px-2 py-1 pl-8 rounded transition-colors no-drag ${
                    selectedAssistant?.subtitle === 'Integrado' ? 'cursor-not-allowed opacity-60' : ''
                  }`}
                  placeholder="Nome do Assistente"
                  style={{
                    width: `${Math.min(Math.max(assistantName.length * 10 + 50, 150), 500)}px`
                  }}
                />
                <svg 
                  className="absolute left-2 w-4 h-4 text-gray-400 pointer-events-none" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"></path>
                </svg>
              </div>
            </div>
          ) : (
            <h2 className="text-lg font-bold text-white tracking-wide">Assistentes</h2>
          )}
          <button 
            onClick={handleClose} 
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
              {assistants.map(assistant => renderSidebarItem(assistant))}
            </div>

            {/* Botão Criar Novo */}
            <button 
              onClick={handleCreateNew}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 rounded-lg transition-colors font-medium text-sm border border-blue-600/20"
            >
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
              <div className="flex gap-0 h-12">
                {[
                  { id: 'sistema' as Tab, label: 'Sistema', icon: '⚙️' },
                  { id: 'acompanhamento' as Tab, label: 'Acompanhamento', icon: '📊' },
                  { id: 'email' as Tab, label: 'Email', icon: '📧' },
                  { id: 'avatar' as Tab, label: 'Avatar', icon: '🎭' },
                  { id: 'conhecimento' as Tab, label: 'Conhecimento', icon: '📚' },
                ].map((tab, index, array) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 flex items-center gap-2 text-sm font-medium transition-all border-b-2 ${
                      index === 0 ? 'pl-6' : ''
                    } ${
                      index === array.length - 1 ? 'pr-6' : ''
                    } ${
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
              
              {/* ABA SISTEMA */}
              {activeTab === 'sistema' && (
                <div className="flex flex-col h-full gap-4">
                  {/* Aviso para Integrados */}
                  {selectedAssistant?.subtitle === 'Integrado' && (
                    <div className="flex gap-2 p-3 bg-yellow-600/10 border border-yellow-600/30 rounded-lg">
                      <svg className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                      </svg>
                      <p className="text-xs text-yellow-300 leading-relaxed">
                        Assistentes integrados não podem ser editados. Duplique este assistente para criar uma versão personalizada.
                      </p>
                    </div>
                  )}

                  {/* Textarea Editor */}
                  <div className="flex-1 flex flex-col min-h-0">
                    <label className="block text-sm font-semibold text-white mb-2">Prompt do Sistema</label>
                    <textarea
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      readOnly={selectedAssistant?.subtitle === 'Integrado'}
                      className={`flex-1 w-full bg-[#1f1f1f] rounded-lg p-4 font-mono text-sm text-gray-300 border border-[#1a1a1a] focus:border-blue-500 focus:outline-none resize-none transition-colors ${
                        selectedAssistant?.subtitle === 'Integrado' ? 'cursor-not-allowed opacity-60' : ''
                      }`}
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
                    
                    <div className="flex gap-3">
                      {/* Checkbox */}
                      <label className={`flex items-start gap-3 group p-2 rounded-lg hover:bg-[#111] transition-colors flex-shrink-0 ${
                        selectedAssistant?.subtitle === 'Integrado' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                      }`}>
                        <div className="relative flex items-center justify-center mt-0.5">
                          <input
                            type="checkbox"
                            checked={answerOnlyWhenCertain}
                            onChange={(e) => setAnswerOnlyWhenCertain(e.target.checked)}
                            disabled={selectedAssistant?.subtitle === 'Integrado'}
                            className={`w-5 h-5 rounded border-2 border-gray-600 bg-[#1a1a1a] checked:bg-blue-600 checked:border-blue-600 transition-colors ${
                              selectedAssistant?.subtitle === 'Integrado' ? 'cursor-not-allowed' : 'cursor-pointer'
                            }`}
                          />
                          {answerOnlyWhenCertain && (
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
                      <div className="flex gap-2 p-3 bg-blue-600/5 border border-blue-600/20 rounded-lg flex-1">
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
                  </div>

                  {/* Footer Buttons */}
                  {isDirty && (
                    <div className="flex justify-end gap-3 pt-3 border-t border-[#222]">
                      <button 
                        onClick={handleCancel}
                        className="px-4 py-1.5 bg-[#1a1a1a] hover:bg-[#252525] text-gray-300 hover:text-white rounded-lg font-medium transition-colors text-sm"
                      >
                        Desfazer
                      </button>
                      <button 
                        onClick={handleSave}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm shadow-lg shadow-blue-600/20"
                      >
                        Salvar Alterações
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ABA ACOMPANHAMENTO */}
              {activeTab === 'acompanhamento' && (
                <div className="flex flex-col h-full gap-4">
                  {/* Aviso para Integrados */}
                  {selectedAssistant?.subtitle === 'Integrado' && (
                    <div className="flex gap-2 p-3 bg-yellow-600/10 border border-yellow-600/30 rounded-lg">
                      <svg className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                      </svg>
                      <p className="text-xs text-yellow-300 leading-relaxed">
                        Assistentes integrados não podem ser editados. Duplique este assistente para criar uma versão personalizada.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <h3 className="text-base font-semibold text-white">Substituição de Perguntas de Acompanhamento</h3>
                    <p className="text-sm text-gray-400">
                      Substitua o prompt padrão de perguntas de acompanhamento para este assistente específico.
                    </p>
                  </div>

                  <div className="flex-1 flex flex-col min-h-0">
                    <label className="block text-sm font-semibold text-white mb-2">Prompt de Acompanhamento</label>
                    <textarea
                      value={followUpPrompt}
                      onChange={(e) => setFollowUpPrompt(e.target.value)}
                      readOnly={selectedAssistant?.subtitle === 'Integrado'}
                      className={`flex-1 w-full bg-[#1f1f1f] rounded-lg p-4 font-mono text-sm text-gray-300 border border-[#1a1a1a] focus:border-blue-500 focus:outline-none resize-none transition-colors ${
                        selectedAssistant?.subtitle === 'Integrado' ? 'cursor-not-allowed opacity-60' : ''
                      }`}
                      style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#2a2a2a #000'
                      }}
                      placeholder={DEFAULT_FOLLOW_UP_PROMPT}
                    />
                  </div>

                  {/* Footer Buttons */}
                  {isDirty && (
                    <div className="flex justify-end gap-3 pt-3 border-t border-[#222]">
                      <button 
                        onClick={handleCancel}
                        className="px-4 py-1.5 bg-[#1a1a1a] hover:bg-[#252525] text-gray-300 hover:text-white rounded-lg font-medium transition-colors text-sm"
                      >
                        Desfazer
                      </button>
                      <button 
                        onClick={handleSave}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm shadow-lg shadow-blue-600/20"
                      >
                        Salvar Alterações
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ABA EMAIL */}
              {activeTab === 'email' && (
                <div className="flex flex-col h-full gap-4">
                  {/* Aviso para Integrados */}
                  {selectedAssistant?.subtitle === 'Integrado' && (
                    <div className="flex gap-2 p-3 bg-yellow-600/10 border border-yellow-600/30 rounded-lg">
                      <svg className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                      </svg>
                      <p className="text-xs text-yellow-300 leading-relaxed">
                        Assistentes integrados não podem ser editados. Duplique este assistente para criar uma versão personalizada.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <h3 className="text-base font-semibold text-white">Substituição de Resumo por E-mail</h3>
                    <p className="text-sm text-gray-400">
                      Substitua o prompt padrão de resumo por e-mail para este assistente específico.
                    </p>
                  </div>

                  <div className="flex-1 flex flex-col min-h-0">
                    <label className="block text-sm font-semibold text-white mb-2">Prompt de Resumo por E-mail</label>
                    <textarea
                      value={emailSummaryPrompt}
                      onChange={(e) => setEmailSummaryPrompt(e.target.value)}
                      readOnly={selectedAssistant?.subtitle === 'Integrado'}
                      className={`flex-1 w-full bg-[#1f1f1f] rounded-lg p-4 font-mono text-sm text-gray-300 border border-[#1a1a1a] focus:border-blue-500 focus:outline-none resize-none transition-colors ${
                        selectedAssistant?.subtitle === 'Integrado' ? 'cursor-not-allowed opacity-60' : ''
                      }`}
                      style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#2a2a2a #000'
                      }}
                      placeholder={DEFAULT_EMAIL_SUMMARY_PROMPT}
                    />
                  </div>

                  {/* Footer Buttons */}
                  {isDirty && (
                    <div className="flex justify-end gap-3 pt-3 border-t border-[#222]">
                      <button 
                        onClick={handleCancel}
                        className="px-4 py-1.5 bg-[#1a1a1a] hover:bg-[#252525] text-gray-300 hover:text-white rounded-lg font-medium transition-colors text-sm"
                      >
                        Desfazer
                      </button>
                      <button 
                        onClick={handleSave}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm shadow-lg shadow-blue-600/20"
                      >
                        Salvar Alterações
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ABA AVATAR */}
              {activeTab === 'avatar' && (
                <div className="flex flex-col h-full gap-4">
                  {/* Aviso para Integrados */}
                  {selectedAssistant?.subtitle === 'Integrado' && (
                    <div className="flex gap-2 p-3 bg-yellow-600/10 border border-yellow-600/30 rounded-lg">
                      <svg className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                      </svg>
                      <p className="text-xs text-yellow-300 leading-relaxed">
                        Assistentes integrados não podem ser editados. Duplique este assistente para criar uma versão personalizada.
                      </p>
                    </div>
                  )}

                  {/* Comportamento do Avatar */}
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold text-white">Comportamento do Avatar</h3>
                    <p className="text-sm text-gray-400">
                      Instruções e comportamento do avatar.
                    </p>
                  </div>

                  <div className="flex-1 flex flex-col min-h-0">
                    <textarea
                      value={avatarBehaviorPrompt}
                      onChange={(e) => setAvatarBehaviorPrompt(e.target.value)}
                      readOnly={selectedAssistant?.subtitle === 'Integrado'}
                      className={`flex-1 w-full bg-[#1f1f1f] rounded-lg p-4 font-mono text-sm text-gray-300 border border-[#1a1a1a] focus:border-blue-500 focus:outline-none resize-none transition-colors ${
                        selectedAssistant?.subtitle === 'Integrado' ? 'cursor-not-allowed opacity-60' : ''
                      }`}
                      style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#2a2a2a #000'
                      }}
                      placeholder={'Ex: Você deve atuar como minha assistente para gravação de vídeos para o YouTube.\n</instruções>\n...'}
                    />
                  </div>

                  {/* Estilo de Fala */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold text-white">Estilo de Fala</h3>
                      <p className="text-sm text-gray-400">
                        Como o avatar deve falar (ritmo, sotaque, expressões).
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400">Emoções na fala?</span>
                      <button
                        onClick={() => setEnableEmotions(!enableEmotions)}
                        disabled={selectedAssistant?.subtitle === 'Integrado'}
                        className={`relative w-11 h-6 rounded-full transition-colors ${
                          enableEmotions ? 'bg-blue-600' : 'bg-gray-600'
                        } ${
                          selectedAssistant?.subtitle === 'Integrado' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                        }`}
                      >
                        <div
                          className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                            enableEmotions ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col min-h-0">
                    <textarea
                      value={avatarSpeechStyle}
                      onChange={(e) => setAvatarSpeechStyle(e.target.value)}
                      readOnly={selectedAssistant?.subtitle === 'Integrado'}
                      className={`flex-1 w-full bg-[#1f1f1f] rounded-lg p-4 font-mono text-sm text-gray-300 border border-[#1a1a1a] focus:border-blue-500 focus:outline-none resize-none transition-colors ${
                        selectedAssistant?.subtitle === 'Integrado' ? 'cursor-not-allowed opacity-60' : ''
                      }`}
                      style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#2a2a2a #000'
                      }}
                      placeholder={"Voice: High-pitched, bright, and sweet, reminiscent of an anime character or a J-Pop idol.\nTone: Extremely enthusiastic and polite, overflowing with positivity and eagerness to please..."}
                    />
                  </div>

                  {/* Footer Buttons */}
                  {isDirty && selectedAssistant?.subtitle !== 'Integrado' && (
                    <div className="flex justify-end gap-3 pt-3 border-t border-[#222]">
                      <button 
                        onClick={handleCancel}
                        className="px-4 py-1.5 bg-[#1a1a1a] hover:bg-[#252525] text-gray-300 hover:text-white rounded-lg font-medium transition-colors text-sm"
                      >
                        Desfazer
                      </button>
                      <button 
                        onClick={handleSave}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm shadow-lg shadow-blue-600/20"
                      >
                        Salvar Alterações
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ABA CONHECIMENTO */}
              {activeTab === 'conhecimento' && (
                <KnowledgeTab assistantId={selectedAssistant?.id || ''} />
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

    {/* Modal de Confirmação */}
    {showConfirmModal && (
      <div className="fixed inset-0 z-[700] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200 no-drag">
        <div className="bg-[#0a0a0a] rounded-xl shadow-2xl border border-[#222] overflow-hidden w-[400px] no-drag">
          {/* Header */}
          <div className="px-6 py-4 border-b border-[#222] bg-[#0f0f0f]">
            <h3 className="text-lg font-semibold text-white">{confirmModalTitle}</h3>
          </div>

          {/* Body */}
          <div className="px-6 py-4">
            <p className="text-gray-300 text-sm">
              {confirmModalTitle.startsWith('Excluir') 
                ? 'Esta ação não pode ser desfeita. O assistente será permanentemente removido.'
                : 'Todas as alterações não salvas serão perdidas.'}
            </p>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-[#222] bg-[#0f0f0f] flex justify-end gap-3">
            <button
              onClick={handleConfirmNo}
              className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#252525] text-white rounded-lg font-medium transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmYes}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors text-sm shadow-lg shadow-red-600/20"
            >
              {confirmModalTitle.startsWith('Excluir') ? 'Excluir' : 'Sair'}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  )
}
