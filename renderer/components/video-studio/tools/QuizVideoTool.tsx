/**
 * Quiz Video Tool - Gerador de Vídeos Quiz
 * 
 * Ferramenta para criar vídeos de quiz interativos usando APIs de IA.
 * O usuário define o tema, número de questões, opções e tempo de resposta.
 * Suporta: Gemini, OpenAI e DeepSeek.
 */

import React, { useState, useEffect } from 'react';

interface QuizVideoToolProps {
  onBack: () => void;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

interface QuizConfig {
  theme: string;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  optionsCount: number;
  thinkingTimeSeconds: number;
  showAnswerTimeSeconds: number;
  primaryColor: string;
  secondaryColor: string;
  provider: 'gemini' | 'openai' | 'deepseek';
}

const DIFFICULTY_OPTIONS = [
  { id: 'easy', name: 'Fácil', icon: '🟢', description: 'Perguntas básicas', color: 'green' },
  { id: 'medium', name: 'Médio', icon: '🟡', description: 'Perguntas moderadas', color: 'yellow' },
  { id: 'hard', name: 'Difícil', icon: '🔴', description: 'Perguntas desafiadoras', color: 'red' },
];

const COLOR_PRESETS = [
  { primary: '#8B5CF6', secondary: '#EC4899', name: 'Roxo/Rosa' },
  { primary: '#3B82F6', secondary: '#06B6D4', name: 'Azul/Cyan' },
  { primary: '#10B981', secondary: '#84CC16', name: 'Verde/Lima' },
  { primary: '#F59E0B', secondary: '#EF4444', name: 'Laranja/Vermelho' },
  { primary: '#6366F1', secondary: '#A855F7', name: 'Índigo/Púrpura' },
];

const AI_PROVIDERS = [
  { id: 'gemini', name: 'Gemini', icon: '⚡', description: 'Google AI', color: 'from-blue-500 to-cyan-500' },
  { id: 'openai', name: 'OpenAI', icon: '🤖', description: 'GPT-5', color: 'from-green-500 to-emerald-500' },
  { id: 'deepseek', name: 'DeepSeek', icon: '🔮', description: 'DeepSeek Chat', color: 'from-purple-500 to-pink-500' },
];

export function QuizVideoTool({ onBack }: QuizVideoToolProps) {
  // Estados de Configuração
  const [config, setConfig] = useState<QuizConfig>({
    theme: '',
    easyCount: 5,
    mediumCount: 5,
    hardCount: 5,
    optionsCount: 4,
    thinkingTimeSeconds: 5,
    showAnswerTimeSeconds: 3,
    primaryColor: '#8B5CF6',
    secondaryColor: '#EC4899',
    provider: 'gemini',
  });

  // Total de questões calculado
  const totalQuestions = config.easyCount + config.mediumCount + config.hardCount;

  // Estados de Geração
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState({ current: 0, total: 0 });
  const [audioOutputDir, setAudioOutputDir] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState('');
  const [outputPath, setOutputPath] = useState<string | null>(null);

  // Configurações de Áudio
  const [audioIncludeOptions, setAudioIncludeOptions] = useState(true);
  const [audioIncludeCorrectAnswer, setAudioIncludeCorrectAnswer] = useState(false);
  const [audioIncludeExplanations, setAudioIncludeExplanations] = useState(false);

  // Listener para progresso do áudio
  useEffect(() => {
    const unsubscribe = window.electron.quiz.onAudioProgress((data) => {
      setAudioProgress({ current: data.current, total: data.total });
    });
    return () => { unsubscribe(); };
  }, []);

  const generateQuiz = async () => {
    if (!config.theme.trim()) {
      setError('Digite o tema do quiz');
      return;
    }

    if (totalQuestions === 0) {
      setError('Adicione pelo menos uma questão');
      return;
    }

    setIsGenerating(true);
    setQuestions([]);
    setError(null);
    setGenerationProgress(`Gerando ${totalQuestions} perguntas com ${AI_PROVIDERS.find(p => p.id === config.provider)?.name}...`);

    try {
      console.log('🎯 [QuizGenerator] Gerando quiz...');
      
      const result = await window.electron.quiz.generate({
        theme: config.theme,
        easyCount: config.easyCount,
        mediumCount: config.mediumCount,
        hardCount: config.hardCount,
        optionsCount: config.optionsCount,
        provider: config.provider,
      }) as { success: boolean; questions?: QuizQuestion[]; error?: string };

      if (!result.success) {
        throw new Error(result.error || 'Erro ao gerar quiz');
      }

      if (!result.questions || result.questions.length === 0) {
        throw new Error('Nenhuma questão foi gerada');
      }

      setQuestions(result.questions);
      setGenerationProgress('Quiz gerado com sucesso!');
      console.log('✅ [QuizGenerator] Quiz gerado:', result.questions);

    } catch (err: any) {
      console.error('❌ [QuizGenerator] Erro:', err);
      setError(err.message || 'Erro ao gerar quiz');
    } finally {
      setIsGenerating(false);
    }
  };

  const generateAudio = async () => {
    if (questions.length === 0) {
      setError('Gere as perguntas primeiro');
      return;
    }

    setIsGeneratingAudio(true);
    setAudioProgress({ current: 0, total: 1 });
    setAudioOutputDir(null);
    setError(null);

    try {
      console.log('🎤 [QuizGenerator] Gerando áudio completo...');
      
      const result = await window.electron.quiz.generateAudio({
        questions: questions.map(q => ({
          question: q.question,
          options: q.options,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
        })),
        voiceName: 'Kore',
        includeOptions: audioIncludeOptions,
        includeCorrectAnswer: audioIncludeCorrectAnswer,
        includeExplanations: audioIncludeExplanations,
      }) as { 
        success: boolean; 
        audioPath?: string; 
        outputDir?: string;
        questionsCount?: number;
        error?: string 
      };

      if (!result.success) {
        throw new Error(result.error || 'Erro ao gerar áudio');
      }

      setAudioOutputDir(result.audioPath || null);
      console.log('✅ [QuizGenerator] Áudio completo gerado:', result.audioPath);

    } catch (err: any) {
      console.error('❌ [QuizGenerator] Erro ao gerar áudios:', err);
      setError(err.message || 'Erro ao gerar áudios');
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const exportProject = async () => {
    if (questions.length === 0) {
      setError('Gere as perguntas primeiro');
      return;
    }

    setIsRendering(true);
    setError(null);
    setOutputPath(null);

    try {
      // Prepara as props do vídeo
      const videoProps = {
        theme: config.theme,
        questions,
        thinkingTimeSeconds: config.thinkingTimeSeconds,
        showAnswerTimeSeconds: config.showAnswerTimeSeconds,
        primaryColor: config.primaryColor,
        secondaryColor: config.secondaryColor,
        backgroundColor: '#0a0a0f',
      };

      console.log('📦 [QuizGenerator] Exportando projeto...', videoProps);

      // Converte para JSON e copia para clipboard
      const projectJson = JSON.stringify(videoProps, null, 2);
      await navigator.clipboard.writeText(projectJson);
      
      setOutputPath('clipboard');
      console.log('✅ [QuizGenerator] Projeto exportado para clipboard!');

    } catch (err: any) {
      console.error('❌ [QuizGenerator] Erro na exportação:', err);
      setError(err.message || 'Erro ao exportar projeto');
    } finally {
      setIsRendering(false);
    }
  };

  const downloadProjectJson = () => {
    if (questions.length === 0) {
      setError('Gere as perguntas primeiro');
      return;
    }

    const videoProps = {
      theme: config.theme,
      questions,
      thinkingTimeSeconds: config.thinkingTimeSeconds,
      showAnswerTimeSeconds: config.showAnswerTimeSeconds,
      primaryColor: config.primaryColor,
      secondaryColor: config.secondaryColor,
      backgroundColor: '#0a0a0f',
    };

    const projectJson = JSON.stringify(videoProps, null, 2);
    const blob = new Blob([projectJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `quiz-${config.theme.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // === RENDER SECTIONS ===

  const renderProviderSection = () => (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-sm">
          🤖
        </span>
        Provedor de IA
      </h3>

      <div className="grid grid-cols-3 gap-3">
        {AI_PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            onClick={() => setConfig({ ...config, provider: provider.id as any })}
            className={`p-4 rounded-xl border text-center transition-all ${
              config.provider === provider.id
                ? 'bg-gradient-to-br ' + provider.color + '/20 border-white/30'
                : 'bg-white/5 border-white/10 hover:border-white/20'
            }`}
          >
            <span className="text-3xl block mb-2">{provider.icon}</span>
            <p className="font-medium text-white text-sm">{provider.name}</p>
            <p className="text-xs text-white/40">{provider.description}</p>
          </button>
        ))}
      </div>

      <p className="mt-4 text-xs text-white/40 text-center">
        💡 Certifique-se de que a API key do provedor está configurada no arquivo .env
      </p>
    </div>
  );

  const renderConfigSection = () => (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6">
      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-sm">
          ⚙️
        </span>
        Configuração do Quiz
      </h3>

      {/* Tema */}
      <div>
        <label className="block text-sm font-medium text-white/70 mb-2">
          Tema do Quiz
        </label>
        <input
          type="text"
          value={config.theme}
          onChange={(e) => setConfig({ ...config, theme: e.target.value })}
          placeholder="Ex: História do Brasil, Matemática Básica, Cultura Pop..."
          className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
        />
      </div>

      {/* Questões por Dificuldade */}
      <div>
        <label className="block text-sm font-medium text-white/70 mb-3">
          Questões por Dificuldade
          <span className="ml-2 text-white/40 text-xs">(Total: {totalQuestions})</span>
        </label>
        <div className="grid grid-cols-3 gap-3">
          {/* Fácil */}
          <div className="p-4 rounded-xl border border-green-500/30 bg-green-500/5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🟢</span>
              <span className="text-sm font-medium text-green-400">Fácil</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setConfig({ ...config, easyCount: Math.max(0, config.easyCount - 1) })}
                className="w-8 h-8 bg-white/10 border border-white/10 rounded-lg text-white hover:bg-white/20 transition-colors text-sm"
              >
                -
              </button>
              <div className="flex-1 bg-white/10 border border-white/10 rounded-lg p-2 text-center text-white font-bold">
                {config.easyCount}
              </div>
              <button
                onClick={() => setConfig({ ...config, easyCount: Math.min(30, config.easyCount + 1) })}
                className="w-8 h-8 bg-white/10 border border-white/10 rounded-lg text-white hover:bg-white/20 transition-colors text-sm"
              >
                +
              </button>
            </div>
          </div>

          {/* Médio */}
          <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🟡</span>
              <span className="text-sm font-medium text-yellow-400">Médio</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setConfig({ ...config, mediumCount: Math.max(0, config.mediumCount - 1) })}
                className="w-8 h-8 bg-white/10 border border-white/10 rounded-lg text-white hover:bg-white/20 transition-colors text-sm"
              >
                -
              </button>
              <div className="flex-1 bg-white/10 border border-white/10 rounded-lg p-2 text-center text-white font-bold">
                {config.mediumCount}
              </div>
              <button
                onClick={() => setConfig({ ...config, mediumCount: Math.min(30, config.mediumCount + 1) })}
                className="w-8 h-8 bg-white/10 border border-white/10 rounded-lg text-white hover:bg-white/20 transition-colors text-sm"
              >
                +
              </button>
            </div>
          </div>

          {/* Difícil */}
          <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🔴</span>
              <span className="text-sm font-medium text-red-400">Difícil</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setConfig({ ...config, hardCount: Math.max(0, config.hardCount - 1) })}
                className="w-8 h-8 bg-white/10 border border-white/10 rounded-lg text-white hover:bg-white/20 transition-colors text-sm"
              >
                -
              </button>
              <div className="flex-1 bg-white/10 border border-white/10 rounded-lg p-2 text-center text-white font-bold">
                {config.hardCount}
              </div>
              <button
                onClick={() => setConfig({ ...config, hardCount: Math.min(30, config.hardCount + 1) })}
                className="w-8 h-8 bg-white/10 border border-white/10 rounded-lg text-white hover:bg-white/20 transition-colors text-sm"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Opções por Questão */}
      <div>
        <label className="block text-sm font-medium text-white/70 mb-2">
          Opções por Questão
        </label>
        <div className="flex items-center gap-2 max-w-xs">
          <button
            onClick={() => setConfig({ ...config, optionsCount: Math.max(2, config.optionsCount - 1) })}
            className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg text-white hover:bg-white/10 transition-colors"
          >
            -
          </button>
          <div className="flex-1 bg-white/5 border border-white/10 rounded-lg p-3 text-center text-white font-bold">
            {config.optionsCount}
          </div>
          <button
            onClick={() => setConfig({ ...config, optionsCount: Math.min(6, config.optionsCount + 1) })}
            className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg text-white hover:bg-white/10 transition-colors"
          >
            +
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-white/70 mb-2">
            Opções por Questão
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfig({ ...config, optionsCount: Math.max(2, config.optionsCount - 1) })}
              className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg text-white hover:bg-white/10 transition-colors"
            >
              -
            </button>
            <div className="flex-1 bg-white/5 border border-white/10 rounded-lg p-3 text-center text-white font-bold">
              {config.optionsCount}
            </div>
            <button
              onClick={() => setConfig({ ...config, optionsCount: Math.min(6, config.optionsCount + 1) })}
              className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg text-white hover:bg-white/10 transition-colors"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Tempos */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-white/70 mb-2 flex items-center gap-2">
            <span>⏱️</span> Tempo para Pensar
            <span className="text-white/40 text-xs">(segundos)</span>
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfig({ ...config, thinkingTimeSeconds: Math.max(3, config.thinkingTimeSeconds - 1) })}
              className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg text-white hover:bg-white/10 transition-colors"
            >
              -
            </button>
            <div className="flex-1 bg-white/5 border border-white/10 rounded-lg p-3 text-center text-white font-bold">
              {config.thinkingTimeSeconds}s
            </div>
            <button
              onClick={() => setConfig({ ...config, thinkingTimeSeconds: Math.min(30, config.thinkingTimeSeconds + 1) })}
              className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg text-white hover:bg-white/10 transition-colors"
            >
              +
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-white/70 mb-2 flex items-center gap-2">
            <span>✅</span> Tempo da Resposta
            <span className="text-white/40 text-xs">(segundos)</span>
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfig({ ...config, showAnswerTimeSeconds: Math.max(2, config.showAnswerTimeSeconds - 1) })}
              className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg text-white hover:bg-white/10 transition-colors"
            >
              -
            </button>
            <div className="flex-1 bg-white/5 border border-white/10 rounded-lg p-3 text-center text-white font-bold">
              {config.showAnswerTimeSeconds}s
            </div>
            <button
              onClick={() => setConfig({ ...config, showAnswerTimeSeconds: Math.min(10, config.showAnswerTimeSeconds + 1) })}
              className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg text-white hover:bg-white/10 transition-colors"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Cores */}
      <div>
        <label className="block text-sm font-medium text-white/70 mb-2">
          Esquema de Cores
        </label>
        <div className="flex gap-2 flex-wrap">
          {COLOR_PRESETS.map((preset, i) => (
            <button
              key={i}
              onClick={() => setConfig({ 
                ...config, 
                primaryColor: preset.primary, 
                secondaryColor: preset.secondary 
              })}
              className={`p-2 rounded-xl border transition-all ${
                config.primaryColor === preset.primary
                  ? 'border-white/30 scale-105'
                  : 'border-white/10 hover:border-white/20'
              }`}
              title={preset.name}
            >
              <div 
                className="w-12 h-8 rounded-lg"
                style={{
                  background: `linear-gradient(135deg, ${preset.primary}, ${preset.secondary})`
                }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Info de duração estimada */}
      <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📹</span>
          <div>
            <p className="text-sm text-white/70">Duração estimada do vídeo</p>
            <p className="text-xl font-bold text-white">
              ~{3 + totalQuestions * (config.thinkingTimeSeconds + config.showAnswerTimeSeconds)} segundos
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPreviewSection = () => (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-sm">
          👁️
        </span>
        Preview das Questões
      </h3>

      {questions.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
            <span className="text-4xl">❓</span>
          </div>
          <p className="text-white/60 mb-2">Nenhuma questão gerada ainda</p>
          <p className="text-white/40 text-sm">Gere as questões com IA para visualizar aqui</p>
        </div>
      ) : (
        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
          {questions.map((q, index) => (
            <div key={index} className="p-4 bg-white/5 border border-white/10 rounded-xl">
              <div className="flex items-start gap-3 mb-3">
                <span 
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor})` }}
                >
                  {index + 1}
                </span>
                <p className="text-white font-medium">{q.question}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-2 ml-11">
                {q.options.map((opt, optIndex) => (
                  <div 
                    key={optIndex}
                    className={`px-3 py-2 rounded-lg text-sm ${
                      optIndex === q.correctIndex
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-white/5 text-white/70 border border-white/10'
                    }`}
                  >
                    <span className="font-medium mr-2">{String.fromCharCode(65 + optIndex)}.</span>
                    {opt}
                    {optIndex === q.correctIndex && <span className="ml-2">✓</span>}
                  </div>
                ))}
              </div>

              {q.explanation && (
                <div className="mt-3 ml-11 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                  <p className="text-xs text-purple-400 mb-1">💡 Explicação</p>
                  <p className="text-sm text-white/70">{q.explanation}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderActionsSection = () => (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
          <span className="text-red-400">❌</span>
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {outputPath && (
        <div className="mb-4 p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center gap-3">
          <span className="text-green-400 text-2xl">✅</span>
          <div>
            <p className="text-green-400 font-medium">Projeto copiado para a área de transferência!</p>
            <p className="text-white/40 text-sm">Cole no Remotion Studio para renderizar o vídeo</p>
          </div>
        </div>
      )}

      <div className="flex gap-4">
        {/* Gerar Questões */}
        <button
          onClick={generateQuiz}
          disabled={isGenerating || !config.theme.trim()}
          className={`flex-1 py-4 rounded-xl font-medium text-white flex items-center justify-center gap-3 transition-all ${
            isGenerating || !config.theme.trim()
              ? 'bg-cyan-500/30 cursor-not-allowed'
              : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 shadow-lg shadow-cyan-500/25'
          }`}
        >
          {isGenerating ? (
            <>
              <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              {generationProgress}
            </>
          ) : (
            <>
              <span>🤖</span>
              Gerar Questões com IA
            </>
          )}
        </button>
      </div>

      {/* Botões de Exportação */}
      {questions.length > 0 && (
        <div className="mt-4 flex gap-4">
          <button
            onClick={exportProject}
            disabled={isRendering}
            className={`flex-1 py-4 rounded-xl font-medium text-white flex items-center justify-center gap-3 transition-all ${
              isRendering
                ? 'bg-purple-500/30 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg shadow-purple-500/25'
            }`}
          >
            {isRendering ? (
              <>
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                Copiando...
              </>
            ) : (
              <>
                <span>📋</span>
                Copiar Projeto
              </>
            )}
          </button>

          <button
            onClick={downloadProjectJson}
            className="flex-1 py-4 rounded-xl font-medium text-white flex items-center justify-center gap-3 transition-all bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-lg shadow-green-500/25"
          >
            <span>💾</span>
            Baixar JSON
          </button>
        </div>
      )}

      {/* Geração de Áudio */}
      {questions.length > 0 && (
        <div className="mt-4 p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl">
          <h4 className="text-sm font-medium text-orange-400 mb-3 flex items-center gap-2">
            <span>🎤</span> Configurações do Áudio
          </h4>
          
          {/* Toggles de Configuração */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <button
              onClick={() => setAudioIncludeOptions(!audioIncludeOptions)}
              className={`p-3 rounded-lg border text-left transition-all ${
                audioIncludeOptions
                  ? 'bg-orange-500/20 border-orange-500/50'
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-4 h-4 rounded flex items-center justify-center text-xs ${
                  audioIncludeOptions ? 'bg-orange-500 text-white' : 'bg-white/10'
                }`}>
                  {audioIncludeOptions ? '✓' : ''}
                </span>
                <span className="text-xs font-medium text-white">Opções</span>
              </div>
              <p className="text-xs text-white/40">A, B, C, D...</p>
            </button>

            <button
              onClick={() => setAudioIncludeCorrectAnswer(!audioIncludeCorrectAnswer)}
              className={`p-3 rounded-lg border text-left transition-all ${
                audioIncludeCorrectAnswer
                  ? 'bg-orange-500/20 border-orange-500/50'
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-4 h-4 rounded flex items-center justify-center text-xs ${
                  audioIncludeCorrectAnswer ? 'bg-orange-500 text-white' : 'bg-white/10'
                }`}>
                  {audioIncludeCorrectAnswer ? '✓' : ''}
                </span>
                <span className="text-xs font-medium text-white">Resposta</span>
              </div>
              <p className="text-xs text-white/40">Letra correta</p>
            </button>

            <button
              onClick={() => setAudioIncludeExplanations(!audioIncludeExplanations)}
              className={`p-3 rounded-lg border text-left transition-all ${
                audioIncludeExplanations
                  ? 'bg-orange-500/20 border-orange-500/50'
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-4 h-4 rounded flex items-center justify-center text-xs ${
                  audioIncludeExplanations ? 'bg-orange-500 text-white' : 'bg-white/10'
                }`}>
                  {audioIncludeExplanations ? '✓' : ''}
                </span>
                <span className="text-xs font-medium text-white">Explicação</span>
              </div>
              <p className="text-xs text-white/40">Detalhes da resposta</p>
            </button>
          </div>

          <button
            onClick={generateAudio}
            disabled={isGeneratingAudio}
            className={`w-full py-4 rounded-xl font-medium text-white flex items-center justify-center gap-3 transition-all ${
              isGeneratingAudio
                ? 'bg-orange-500/30 cursor-not-allowed'
                : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-lg shadow-orange-500/25'
            }`}
          >
            {isGeneratingAudio ? (
              <>
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                Gerando áudio...
              </>
            ) : (
              <>
                <span>🎤</span>
                Gerar Áudio Completo
              </>
            )}
          </button>

          {audioOutputDir && (
            <div className="mt-3 p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎵</span>
                <div className="flex-1 min-w-0">
                  <p className="text-orange-400 font-medium">Áudio do quiz gerado!</p>
                  <p className="text-white/40 text-xs truncate">{audioOutputDir}</p>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(audioOutputDir)}
                  className="px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 rounded-lg text-xs font-medium transition-colors"
                >
                  Copiar Caminho
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Instruções de uso */}
      {questions.length > 0 && (
        <div className="mt-4 p-4 bg-white/5 border border-white/10 rounded-xl">
          <p className="text-sm text-white/60 mb-2">📌 <strong>Como renderizar o vídeo:</strong></p>
          <ol className="text-xs text-white/40 space-y-1 list-decimal list-inside">
            <li>Copie ou baixe o projeto JSON</li>
            <li>Abra o Remotion Studio: <code className="bg-white/10 px-1 rounded">npx remotion studio remotion/index.ts</code></li>
            <li>Selecione a composição "QuizVideo"</li>
            <li>Cole o JSON nas props e renderize</li>
          </ol>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-purple-500/10 via-transparent to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-pink-500/10 via-transparent to-transparent rounded-full blur-3xl" />
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
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor})` }}
              >
                <span className="text-2xl">❓</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Gerador de Vídeos Quiz</h1>
                <p className="text-sm text-white/40">Crie vídeos de quiz interativos com IA</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {renderProviderSection()}
            {renderConfigSection()}
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {renderPreviewSection()}
            {renderActionsSection()}
          </div>
        </div>
      </main>
    </div>
  );
}
