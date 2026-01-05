/**
 * Script Generator Tool - Gerador de Roteiros com IA
 * 
 * Ferramenta para gerar roteiros de vídeo usando o Gemini via Puppeteer.
 * Usa a nova função sendMessageWithStream para streaming de respostas.
 */

import React, { useState, useEffect, useRef } from 'react';

interface ScriptGeneratorToolProps {
  onBack: () => void;
}

interface Provider {
  id: string;
  name: string;
  platform: 'gemini' | 'openai' | 'qwen';
  isLoggedIn?: boolean;
}

// Templates de roteiros
const SCRIPT_TEMPLATES = [
  {
    id: 'youtube-short',
    name: 'YouTube Short',
    description: 'Roteiro para vídeos curtos de até 60 segundos',
    icon: '📱',
    prompt: 'Crie um roteiro para um YouTube Short (máximo 60 segundos) sobre: ',
  },
  {
    id: 'youtube-video',
    name: 'Vídeo YouTube',
    description: 'Roteiro completo para vídeos longos',
    icon: '🎬',
    prompt: 'Crie um roteiro detalhado para um vídeo do YouTube (8-15 minutos) sobre: ',
  },
  {
    id: 'reels-tiktok',
    name: 'Reels/TikTok',
    description: 'Roteiro viral para redes sociais',
    icon: '✨',
    prompt: 'Crie um roteiro viral para Reels/TikTok sobre: ',
  },
  {
    id: 'educational',
    name: 'Educacional',
    description: 'Roteiro didático e informativo',
    icon: '📚',
    prompt: 'Crie um roteiro educacional e didático sobre: ',
  },
  {
    id: 'storytelling',
    name: 'Storytelling',
    description: 'Roteiro narrativo envolvente',
    icon: '📖',
    prompt: 'Crie um roteiro com storytelling envolvente sobre: ',
  },
  {
    id: 'custom',
    name: 'Personalizado',
    description: 'Escreva seu próprio prompt',
    icon: '✏️',
    prompt: '',
  },
];

export function ScriptGeneratorTool({ onBack }: ScriptGeneratorToolProps) {
  // Estados
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  
  const [generatedScript, setGeneratedScript] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const scriptOutputRef = useRef<HTMLDivElement>(null);

  // Carrega os providers ao montar o componente
  useEffect(() => {
    loadProviders();
  }, []);

  // Auto-scroll durante a geração
  useEffect(() => {
    if (isGenerating && scriptOutputRef.current) {
      scriptOutputRef.current.scrollTop = scriptOutputRef.current.scrollHeight;
    }
  }, [generatedScript, isGenerating]);

  const loadProviders = async () => {
    setIsLoadingProviders(true);
    try {
      // Carrega apenas providers Gemini para esta ferramenta
      const result = await window.electron.provider.listByPlatform('gemini');
      if (result.success && result.data) {
        setProviders(result.data);
        // Seleciona o primeiro provider logado automaticamente
        const loggedInProvider = result.data.find((p: Provider) => p.isLoggedIn);
        if (loggedInProvider) {
          setSelectedProviderId(loggedInProvider.id);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar providers:', err);
    } finally {
      setIsLoadingProviders(false);
    }
  };

  const handleOpenProvider = async (id: string) => {
    setError(null);
    try {
      const result = await window.electron.provider.openForLogin(id);
      if (result.success) {
        // Atualiza a lista de providers
        await loadProviders();
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao abrir navegador');
    }
  };

  const generateScript = async () => {
    if (!selectedProviderId) {
      setError('Selecione uma conta do Gemini primeiro');
      return;
    }

    if (!selectedTemplate) {
      setError('Selecione um template de roteiro');
      return;
    }

    if (selectedTemplate !== 'custom' && !topic.trim()) {
      setError('Digite o tema do vídeo');
      return;
    }

    if (selectedTemplate === 'custom' && !customPrompt.trim()) {
      setError('Digite seu prompt personalizado');
      return;
    }

    setIsGenerating(true);
    setGeneratedScript('');
    setError(null);

    try {
      // Monta o prompt completo
      const template = SCRIPT_TEMPLATES.find(t => t.id === selectedTemplate);
      const fullPrompt = selectedTemplate === 'custom' 
        ? customPrompt 
        : `${template?.prompt}${topic}`;

      console.log('🎬 [ScriptGenerator] Gerando roteiro...');
      console.log('📝 Prompt:', fullPrompt);

      // Usa o novo método de streaming do Gemini
      const result = await window.electron.provider.sendMessageWithStream(
        selectedProviderId,
        fullPrompt,
        (chunk: string) => {
          // Callback para cada chunk recebido - atualiza a UI em tempo real
          setGeneratedScript(prev => prev + chunk);
        }
      ) as { success: boolean; response?: string; error?: string };

      if (!result.success) {
        throw new Error(result.error || 'Erro ao gerar roteiro');
      }

      console.log('✅ [ScriptGenerator] Roteiro gerado com sucesso!');
    } catch (err: any) {
      console.error('❌ [ScriptGenerator] Erro:', err);
      setError(err.message || 'Erro ao gerar roteiro');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    if (generatedScript) {
      await navigator.clipboard.writeText(generatedScript);
      // Feedback visual poderia ser adicionado aqui
    }
  };

  const clearScript = () => {
    setGeneratedScript('');
    setTopic('');
    setCustomPrompt('');
    setSelectedTemplate(null);
  };

  // Renderiza a seção de seleção de provider
  const renderProviderSection = () => (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-sm">
          ⚡
        </span>
        Conta Gemini
      </h3>

      {isLoadingProviders ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full" />
        </div>
      ) : providers.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
            <span className="text-3xl">🔐</span>
          </div>
          <p className="text-white/60 mb-4">Nenhuma conta Gemini configurada</p>
          <button
            onClick={() => window.electron.openSettings()}
            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Configurar nas Configurações
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${
                selectedProviderId === provider.id
                  ? 'bg-purple-500/10 border-purple-500/30'
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
              onClick={() => setSelectedProviderId(provider.id)}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">⚡</span>
                <div>
                  <p className="font-medium text-white">{provider.name}</p>
                  <p className="text-xs text-white/40">Google Gemini</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  provider.isLoggedIn 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {provider.isLoggedIn ? '✓ Logado' : '○ Não logado'}
                </span>

                {!provider.isLoggedIn && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenProvider(provider.id);
                    }}
                    className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    Login
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Renderiza a seção de templates
  const renderTemplateSection = () => (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-sm">
          📋
        </span>
        Tipo de Roteiro
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {SCRIPT_TEMPLATES.map((template) => (
          <button
            key={template.id}
            onClick={() => setSelectedTemplate(template.id)}
            className={`p-4 rounded-xl border text-left transition-all ${
              selectedTemplate === template.id
                ? 'bg-cyan-500/10 border-cyan-500/30'
                : 'bg-white/5 border-white/10 hover:border-white/20'
            }`}
          >
            <span className="text-2xl mb-2 block">{template.icon}</span>
            <p className="font-medium text-white text-sm">{template.name}</p>
            <p className="text-xs text-white/40 mt-1">{template.description}</p>
          </button>
        ))}
      </div>
    </div>
  );

  // Renderiza a seção de input
  const renderInputSection = () => (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-sm">
          ✏️
        </span>
        {selectedTemplate === 'custom' ? 'Seu Prompt' : 'Tema do Vídeo'}
      </h3>

      {selectedTemplate === 'custom' ? (
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="Digite seu prompt personalizado aqui... Seja específico sobre o que você quer no roteiro."
          className="w-full h-40 bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 resize-none"
        />
      ) : (
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Ex: 5 dicas para ser mais produtivo"
          className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
        />
      )}

      {error && (
        <p className="mt-3 text-red-400 text-sm flex items-center gap-2">
          <span>❌</span> {error}
        </p>
      )}

      <button
        onClick={generateScript}
        disabled={isGenerating || !selectedProviderId || !selectedTemplate}
        className={`mt-4 w-full py-4 rounded-xl font-medium text-white flex items-center justify-center gap-3 transition-all ${
          isGenerating || !selectedProviderId || !selectedTemplate
            ? 'bg-purple-500/30 cursor-not-allowed'
            : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg shadow-purple-500/25'
        }`}
      >
        {isGenerating ? (
          <>
            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
            Gerando roteiro...
          </>
        ) : (
          <>
            <span>✨</span>
            Gerar Roteiro
          </>
        )}
      </button>
    </div>
  );

  // Renderiza a seção de output
  const renderOutputSection = () => (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-sm">
            📄
          </span>
          Roteiro Gerado
        </h3>

        {generatedScript && (
          <div className="flex items-center gap-2">
            <button
              onClick={copyToClipboard}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-2"
            >
              <span>📋</span> Copiar
            </button>
            <button
              onClick={clearScript}
              className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium transition-colors flex items-center gap-2"
            >
              <span>🗑️</span> Limpar
            </button>
          </div>
        )}
      </div>

      <div
        ref={scriptOutputRef}
        className="flex-1 bg-black/20 rounded-xl p-4 overflow-y-auto min-h-[400px] font-mono text-sm"
      >
        {generatedScript ? (
          <div className="text-white/90 whitespace-pre-wrap">
            {generatedScript}
            {isGenerating && (
              <span className="inline-block w-2 h-4 bg-purple-500 animate-pulse ml-1" />
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-white/30">
            <div className="text-center">
              <span className="text-5xl block mb-4">📝</span>
              <p>O roteiro aparecerá aqui</p>
              <p className="text-xs mt-1">Selecione um template e gere seu roteiro</p>
            </div>
          </div>
        )}
      </div>

      {generatedScript && (
        <div className="mt-4 flex items-center justify-between text-xs text-white/40">
          <span>{generatedScript.length} caracteres</span>
          <span>~{Math.ceil(generatedScript.split(' ').length / 150)} min de leitura</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-cyan-500/10 via-transparent to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-indigo-500/10 via-transparent to-transparent rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-500 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14,2 14,8 20,8" />
                  <line x1="16" x2="8" y1="13" y2="13" />
                  <line x1="16" x2="8" y1="17" y2="17" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Gerador de Roteiros</h1>
                <p className="text-sm text-white/40">Crie roteiros profissionais com IA</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Configuration */}
          <div className="space-y-6">
            {renderProviderSection()}
            {renderTemplateSection()}
            {renderInputSection()}
          </div>

          {/* Right Column - Output */}
          <div>
            {renderOutputSection()}
          </div>
        </div>
      </main>
    </div>
  );
}
