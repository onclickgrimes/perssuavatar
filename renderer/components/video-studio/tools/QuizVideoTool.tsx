/**
 * Quiz Video Tool - Gerador de Vídeos Quiz
 * 
 * Ferramenta para criar vídeos de quiz interativos usando APIs de IA.
 * O usuário define o tema, número de questões, opções e tempo de resposta.
 * Suporta: Gemini, OpenAI e DeepSeek.
 */

import React, { useState, useEffect } from 'react';
import { QuizPreviewPlayer } from '../QuizPreviewPlayer';

type QuizStep = 'config' | 'preview' | 'rendering' | 'complete';

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
  const [audioProgress, setAudioProgress] = useState({ current: 0, total: 0, stage: '' });
  const [audioOutputDir, setAudioOutputDir] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState('');
  const [outputPath, setOutputPath] = useState<string | null>(null);

  // Estados do Workflow (config -> preview -> rendering -> complete)
  const [currentStep, setCurrentStep] = useState<QuizStep>('config');
  const [renderProgress, setRenderProgress] = useState(0);
  const [outputVideoPath, setOutputVideoPath] = useState<string | null>(null);

  // Estados de Áudio Sincronizado
  const [audioSegments, setAudioSegments] = useState<any[]>([]);
  const [audioDuration, setAudioDuration] = useState(0);
  const [questionTimestamps, setQuestionTimestamps] = useState<any[]>([]); // Timestamps precisos

  // Configurações de Áudio
  const [audioIncludeOptions, setAudioIncludeOptions] = useState(true);
  const [audioIncludeCorrectAnswer, setAudioIncludeCorrectAnswer] = useState(false);
  const [audioIncludeExplanations, setAudioIncludeExplanations] = useState(false);

  // Configuração de Vídeo
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');

  // Helper de dimensões
  const getDimensions = () => {
    return aspectRatio === '9:16' 
      ? { width: 1080, height: 1920 } 
      : { width: 1920, height: 1080 };
  };

  // Listener para progresso do áudio
  useEffect(() => {
    const unsubscribe = window.electron.quiz.onAudioProgress((data) => {
      setAudioProgress({ current: data.current, total: data.total, stage: data.stage });
    });
    return () => { unsubscribe(); };
  }, []);

  // Listener para progresso de renderização
  useEffect(() => {
    const unsubscribe = window.electron.quiz.onRenderProgress((data) => {
      setRenderProgress(data.percent);
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
    setAudioProgress({ current: 0, total: 3, stage: 'starting' });
    setAudioOutputDir(null);
    setAudioSegments([]);
    setAudioDuration(0);
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
        duration?: number;
        segments?: any[];
        questionsCount?: number;
        questionTimestamps?: Array<{ questionIndex: number; startTime: number; optionsTime: number; answerTime: number; endTime: number }>;
        error?: string 
      };

      if (!result.success) {
        throw new Error(result.error || 'Erro ao gerar áudio');
      }

      setAudioOutputDir(result.audioPath || null);
      setAudioDuration(result.duration || 0);
      setAudioSegments(result.segments || []);
      setQuestionTimestamps(result.questionTimestamps || []); // Timestamps precisos!
      
      console.log('✅ [QuizGenerator] Áudio completo gerado:', result.audioPath);
      console.log(`✅ [QuizGenerator] ${result.segments?.length || 0} segments sincronizados, duração: ${result.duration?.toFixed(2)}s`);
      console.log(`✅ [QuizGenerator] ${result.questionTimestamps?.length || 0} questionTimestamps precisos`);

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
      // Prepara as props do vídeo (com dados de áudio sincronizado se disponível)
      const videoProps = {
        theme: config.theme,
        questions,
        thinkingTimeSeconds: config.thinkingTimeSeconds,
        showAnswerTimeSeconds: config.showAnswerTimeSeconds,
        primaryColor: config.primaryColor,
        secondaryColor: config.secondaryColor,
        backgroundColor: '#0a0a0f',
        // Dados de áudio sincronizado
        ...(audioOutputDir && {
          audioPath: audioOutputDir,
          audioDuration: audioDuration,
          audioSegments: audioSegments,
        }),
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
      // Dados de áudio sincronizado
      ...(audioOutputDir && {
        audioPath: audioOutputDir,
        audioDuration: audioDuration,
        audioSegments: audioSegments,
      }),
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

  // Calcula duração total do quiz em segundos
  const calculateQuizDuration = (): number => {
    const INTRO_SECONDS = 3;
    
    // Se temos duração do áudio, usar ela + intro
    if (audioDuration > 0) {
      return INTRO_SECONDS + audioDuration;
    }
    
    // Fallback: cálculo com tempos fixos
    const QUESTION_INTRO_SECONDS = 1;
    return INTRO_SECONDS + 
      (questions.length * (QUESTION_INTRO_SECONDS + config.thinkingTimeSeconds + config.showAnswerTimeSeconds));
  };

  // Calcula duração em frames
  const getQuizDurationInFrames = (): number => {
    const FPS = 30;
    return Math.ceil((calculateQuizDuration() + 1) * FPS); // +1 segundo de buffer
  };

  // Verifica se deve usar composição sincronizada
  const shouldUseSyncedComposition = (): boolean => {
    return audioDuration > 0 && audioSegments.length > 0;
  };

  // Props do Quiz para preview
  const getQuizProps = () => {
    // Converter caminho do áudio para URL HTTP (servidor local)
    let audioUrl: string | undefined;
    if (audioOutputDir) {
      const normalizedPath = audioOutputDir.replace(/\\/g, '/');
      audioUrl = `http://localhost:9999/absolute/${encodeURIComponent(normalizedPath)}`;
    }
    
    const baseProps = {
      theme: config.theme,
      questions,
      primaryColor: config.primaryColor,
      secondaryColor: config.secondaryColor,
      backgroundColor: '#0a0a0f',
      audioUrl,
    };
    
    // Se temos dados de sincronização, adiciona os campos extras
    if (shouldUseSyncedComposition()) {
      return {
        ...baseProps,
        audioDuration,
        audioSegments,
        questionTimestamps, // Timestamps precisos!
        thinkingSilenceSeconds: 3,
      };
    }
    
    // Senão, usa props de timing fixo
    return {
      ...baseProps,
      thinkingTimeSeconds: config.thinkingTimeSeconds,
      showAnswerTimeSeconds: config.showAnswerTimeSeconds,
    };
  };

  // Iniciar renderização do vídeo
  const handleStartRender = async () => {
    setCurrentStep('rendering');
    setRenderProgress(0);
    setError(null);

    try {
      // Renderizar usando API real
      console.log('🎬 [QuizGenerator] Iniciando renderização...');
      console.log('🎬 [QuizGenerator] audioDuration:', audioDuration);
      console.log('🎬 [QuizGenerator] audioSegments.length:', audioSegments.length);
      console.log('🎬 [QuizGenerator] questionTimestamps.length:', questionTimestamps.length);
      console.log('🎬 [QuizGenerator] audioOutputDir:', audioOutputDir);
      
      const result = await window.electron.quiz.render({
        theme: config.theme,
        questions: questions.map(q => ({
          question: q.question,
          options: q.options,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
        })),
        thinkingTimeSeconds: config.thinkingTimeSeconds,
        showAnswerTimeSeconds: config.showAnswerTimeSeconds,
        primaryColor: config.primaryColor,
        secondaryColor: config.secondaryColor,
        backgroundColor: '#0a0a0f',
        width: getDimensions().width,
        height: getDimensions().height,
        audioPath: audioOutputDir || undefined,
        // Dados de sincronização de áudio
        audioDuration: audioDuration || undefined,
        audioSegments: audioSegments.length > 0 ? audioSegments : undefined,
        questionTimestamps: questionTimestamps.length > 0 ? questionTimestamps : undefined, // Precisos!
      }) as { success: boolean; outputPath?: string; error?: string };

      if (!result.success) {
        throw new Error(result.error || 'Erro ao renderizar vídeo');
      }

      console.log('✅ [QuizGenerator] Vídeo renderizado:', result.outputPath);
      setOutputVideoPath(result.outputPath || null);
      setCurrentStep('complete');

    } catch (err: any) {
      console.error('❌ [QuizGenerator] Erro ao renderizar:', err);
      setError(err.message || 'Erro ao renderizar vídeo');
      setCurrentStep('preview'); // Voltar para preview em caso de erro
    }
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

      {/* Proporção do Vídeo */}
      <div>
        <label className="block text-sm font-medium text-white/70 mb-2">
          Proporção do Vídeo
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => setAspectRatio('9:16')}
            className={`flex-1 p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${
              aspectRatio === '9:16'
                ? 'bg-purple-500/20 border-purple-500/50 text-white'
                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
            }`}
          >
            <span className="text-xl">📱</span>
            <div className="text-left">
              <p className="text-sm font-bold">9:16</p>
              <p className="text-xs opacity-70">Shorts/Reels (1080x1920)</p>
            </div>
          </button>

          <button
            onClick={() => setAspectRatio('16:9')}
            className={`flex-1 p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${
              aspectRatio === '16:9'
                ? 'bg-purple-500/20 border-purple-500/50 text-white'
                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
            }`}
          >
            <span className="text-xl">📺</span>
            <div className="text-left">
              <p className="text-sm font-bold">16:9</p>
              <p className="text-xs opacity-70">YouTube (1920x1080)</p>
            </div>
          </button>
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
                <span>
                  {audioProgress.stage === 'generating' && 'Gerando áudio...'}
                  {audioProgress.stage === 'transcribing' && 'Sincronizando legendas...'}
                  {audioProgress.stage === 'mapping' && 'Mapeando questões...'}
                  {!audioProgress.stage && 'Iniciando...'}
                </span>
                <span className="text-white/60 text-sm">({audioProgress.current}/{audioProgress.total})</span>
              </>
            ) : (
              <>
                <span>🎤</span>
                Gerar Áudio Sincronizado
              </>
            )}
          </button>

          {audioOutputDir && (
            <div className="mt-3 p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎵</span>
                <div className="flex-1 min-w-0">
                  <p className="text-orange-400 font-medium">Áudio sincronizado gerado!</p>
                  <p className="text-white/40 text-xs truncate">{audioOutputDir}</p>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(audioOutputDir)}
                  className="px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 rounded-lg text-xs font-medium transition-colors"
                >
                  Copiar Caminho
                </button>
              </div>

              {/* Informações de Sincronização */}
              {audioSegments.length > 0 && (
                <div className="pt-3 border-t border-orange-500/20">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-2 bg-white/5 rounded-lg">
                      <p className="text-lg font-bold text-orange-400">{audioSegments.length}</p>
                      <p className="text-xs text-white/40">Legendas</p>
                    </div>
                    <div className="p-2 bg-white/5 rounded-lg">
                      <p className="text-lg font-bold text-orange-400">{audioDuration.toFixed(1)}s</p>
                      <p className="text-xs text-white/40">Duração</p>
                    </div>
                    <div className="p-2 bg-white/5 rounded-lg">
                      <p className="text-lg font-bold text-green-400">✓</p>
                      <p className="text-xs text-white/40">Sincronizado</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-white/40 text-center">
                    Legendas sincronizadas com timestamps via Deepgram
                  </p>
                </div>
              )}
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

      {/* Botão de Preview */}
      {questions.length > 0 && audioOutputDir && (
        <div className="mt-4">
          <button
            onClick={() => setCurrentStep('preview')}
            className="w-full py-4 rounded-xl font-medium text-white flex items-center justify-center gap-3 transition-all bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 shadow-lg shadow-pink-500/25"
          >
            <span>👁️</span>
            Ver Preview do Vídeo
          </button>
        </div>
      )}
    </div>
  );

  // === RENDER: Preview Step ===
  const renderPreviewStep = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">👁️ Preview do Quiz</h2>
          <p className="text-white/60">
            Visualize o resultado antes de renderizar
          </p>
        </div>
        <div className="flex gap-3 items-center">
          {/* Seletor de Aspect Ratio */}
          <div className="flex bg-white/5 rounded-lg border border-white/10 p-1 mr-4">
            <button
              onClick={() => setAspectRatio('9:16')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                aspectRatio === '9:16'
                  ? 'bg-purple-500 text-white shadow-lg'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              📱 9:16
            </button>
            <button
              onClick={() => setAspectRatio('16:9')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                aspectRatio === '16:9'
                  ? 'bg-purple-500 text-white shadow-lg'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              📺 16:9
            </button>
          </div>

          <button
            onClick={() => setCurrentStep('config')}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
          >
            ← Voltar
          </button>
          <button
            onClick={handleStartRender}
            className="px-6 py-2 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white rounded-lg font-medium transition-all"
          >
            🎬 Renderizar Vídeo
          </button>
        </div>
      </div>

      {/* Player de Preview */}
      <div className="bg-black/50 rounded-xl overflow-hidden shadow-2xl">
        <div className="flex justify-center bg-black/80 py-8">
          <div 
            className="relative shadow-2xl transition-all duration-300" // Adicionado transition
            style={{ 
              aspectRatio: aspectRatio === '9:16' ? '9/16' : '16/9',
              height: aspectRatio === '9:16' ? '60vh' : 'auto',
              width: aspectRatio === '16:9' ? '80vw' : 'auto',
              maxHeight: '600px',
              maxWidth: '1000px'
            }}
          >
            <QuizPreviewPlayer
              quizProps={getQuizProps()}
              durationInFrames={getQuizDurationInFrames()}
              fps={30}
              width={getDimensions().width}
              height={getDimensions().height}
              useSyncedComposition={shouldUseSyncedComposition()}
            />
          </div>
        </div>
      </div>

      {/* Informações do projeto */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 bg-white/5 rounded-lg text-center">
          <p className="text-white/60 text-sm">Duração</p>
          <p className="text-white text-lg font-bold">
            {Math.floor(calculateQuizDuration() / 60)}:{String(Math.floor(calculateQuizDuration() % 60)).padStart(2, '0')}
          </p>
        </div>
        <div className="p-4 bg-white/5 rounded-lg text-center">
          <p className="text-white/60 text-sm">Questões</p>
          <p className="text-white text-lg font-bold">{questions.length}</p>
        </div>
        <div className="p-4 bg-white/5 rounded-lg text-center">
          <p className="text-white/60 text-sm">Resolução</p>
          <p className="text-white text-lg font-bold">{getDimensions().width}x{getDimensions().height}</p>
        </div>
        <div className="p-4 bg-white/5 rounded-lg text-center">
          <p className="text-white/60 text-sm">Áudio</p>
          <p className="text-white text-lg font-bold">{audioOutputDir ? '✓' : '—'}</p>
        </div>
      </div>
    </div>
  );

  // === RENDER: Rendering Step ===
  const renderRenderingStep = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white mb-4">🎬 Renderizando Vídeo</h2>
        <p className="text-white/60">Aguarde enquanto seu quiz é renderizado...</p>
      </div>

      {/* Barra de Progresso */}
      <div className="w-full max-w-md">
        <div className="h-4 bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-300"
            style={{ width: `${renderProgress}%` }}
          />
        </div>
        <p className="mt-2 text-center text-white/60">
          {renderProgress}% concluído
        </p>
      </div>

      {/* Spinner animado */}
      <div className="w-16 h-16 border-4 border-pink-500/30 border-t-pink-500 rounded-full animate-spin" />
    </div>
  );

  // === RENDER: Complete Step ===
  const renderCompleteStep = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
      <div className="text-center">
        <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
          <span className="text-5xl">✓</span>
        </div>
        <h2 className="text-3xl font-bold text-white mb-4">Vídeo Renderizado!</h2>
        <p className="text-white/60 mb-4">Seu quiz foi criado com sucesso.</p>
        
        {outputVideoPath && (
          <div className="max-w-xl mx-auto p-4 bg-white/5 border border-white/10 rounded-xl">
            <p className="text-xs text-white/40 mb-2">📂 Caminho do vídeo:</p>
            <div className="flex items-center gap-2">
              <p className="flex-1 text-sm text-white/80 truncate font-mono">{outputVideoPath}</p>
              <button
                onClick={() => navigator.clipboard.writeText(outputVideoPath)}
                className="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-lg text-xs font-medium transition-colors"
              >
                Copiar
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-4">
        <button
          onClick={() => {
            setCurrentStep('config');
            setOutputVideoPath(null);
            setQuestions([]);
            setAudioOutputDir(null);
            setAudioSegments([]);
          }}
          className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all"
        >
          🔄 Criar Novo Quiz
        </button>
        <button
          onClick={() => setCurrentStep('preview')}
          className="px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white rounded-xl font-medium transition-all"
        >
          👁️ Ver Novamente
        </button>
      </div>
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={currentStep === 'config' ? onBack : () => setCurrentStep('config')}
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

            {/* Step Indicators */}
            <div className="flex items-center gap-2">
              {['config', 'preview', 'rendering', 'complete'].map((step, index) => (
                <div
                  key={step}
                  className={`w-3 h-3 rounded-full transition-all ${
                    currentStep === step
                      ? 'bg-pink-500 scale-125'
                      : ['config', 'preview', 'rendering', 'complete'].indexOf(currentStep) > index
                      ? 'bg-green-500'
                      : 'bg-white/20'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Switch by Step */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {currentStep === 'config' && (
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
        )}

        {currentStep === 'preview' && renderPreviewStep()}
        {currentStep === 'rendering' && renderRenderingStep()}
        {currentStep === 'complete' && renderCompleteStep()}
      </main>
    </div>
  );
}
