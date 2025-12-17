/**
 * Video Studio Page
 * 
 * Página para criação de vídeos a partir de áudio/transcrição.
 * Fluxo:
 * 1. Upload de áudio → Transcrição (Deepgram)
 * 2. Análise por IA → Sugestão de emoções e keyframes
 * 3. Geração de prompts → Criação de imagens
 * 4. Aprovação do usuário → Renderização (Remotion)
 */
import React, { useState, useCallback } from 'react';
import Head from 'next/head';

// Estados do fluxo de criação
type WorkflowStep = 
  | 'upload'        // Upload de áudio
  | 'transcribing'  // Transcrevendo...
  | 'analyzing'     // IA analisando transcrição
  | 'keyframes'     // Revisão de keyframes/emoções
  | 'prompts'       // Geração/edição de prompts
  | 'images'        // Geração/aprovação de imagens
  | 'preview'       // Preview do vídeo antes de renderizar
  | 'rendering'     // Renderizando vídeo
  | 'complete';     // Vídeo pronto

interface TranscriptionSegment {
  id: number;
  text: string;
  start: number;
  end: number;
  speaker: number;
  emotion?: string;
  imagePrompt?: string;
  imageUrl?: string;
  assetType?: string;
  cameraMovement?: string;
  transition?: string;
}

interface ProjectState {
  title: string;
  description?: string;
  audioFile?: File;
  audioUrl?: string;
  audioPath?: string; // Caminho do arquivo de áudio no disco
  duration: number;
  segments: TranscriptionSegment[];
  authorConclusion: string;
  editingStyle: string;
}

export default function VideoStudioPage() {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload');
  const [project, setProject] = useState<ProjectState>({
    title: '',
    duration: 0,
    segments: [],
    authorConclusion: '',
    editingStyle: 'dinâmico e envolvente',
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderProgress, setRenderProgress] = useState(0);

  // Estados para gerenciamento de projetos
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [savedProjects, setSavedProjects] = useState<any[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'gemini' | 'openai' | 'deepseek'>('gemini');

  // Carregar lista de projetos
  const loadProjectsList = useCallback(async () => {
    try {
      setIsLoadingProjects(true);
      const result = await window.electron.videoProject.list();
      if (result.success) {
        setSavedProjects(result.projects);
      }
    } catch (error) {
      console.error('Error loading projects list:', error);
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  // Handler para salvar projeto
  const handleSaveProject = async () => {
    if (!project.title) return;
    
    try {
      // Converter para formato esperado pelo backend (VideoProjectData)
      const projectData = {
        title: project.title,
        description: project.description,
        duration: project.duration,
        audioPath: project.audioPath,
        segments: project.segments.map(seg => ({
          id: seg.id,
          text: seg.text,
          start: seg.start,
          end: seg.end,
          speaker: seg.speaker,
          emotion: seg.emotion,
          imagePrompt: seg.imagePrompt,
          imageUrl: seg.imageUrl,
        })),
        editingStyle: project.editingStyle,
        authorConclusion: project.authorConclusion,
      };

      const result = await window.electron.videoProject.save(projectData);
      
      if (result.success) {
        alert('Projeto salvo com sucesso!');
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error('Error saving project:', error);
      alert('Erro ao salvar projeto: ' + error.message);
    }
  };

  // Handler para carregar projeto
  const handleLoadProject = async (filePath: string) => {
    try {
      const result = await window.electron.videoProject.load(filePath);
      
      if (result.success && result.project) {
        const loadedProject = result.project;
        
        setProject({
          title: loadedProject.title,
          description: loadedProject.description,
          duration: loadedProject.duration,
          audioPath: loadedProject.audioPath,
          segments: loadedProject.segments.map((seg: any) => ({
             id: seg.id,
             text: seg.text,
             start: seg.start,
             end: seg.end,
             speaker: seg.speaker,
             emotion: seg.emotion,
             imagePrompt: seg.imagePrompt,
             imageUrl: seg.imageUrl,
          })),
          authorConclusion: loadedProject.authorConclusion || '',
          editingStyle: loadedProject.editingStyle || 'dinâmico',
        });
        
        // Determinar em qual passo estamos baseado nos dados
        if (loadedProject.segments.some((s: any) => s.imageUrl)) {
          setCurrentStep('images');
        } else if (loadedProject.segments.some((s: any) => s.imagePrompt)) {
          setCurrentStep('prompts');
        } else if (loadedProject.segments.length > 0) {
          setCurrentStep('keyframes');
        } else {
          setCurrentStep('upload');
        }
        
        setShowProjectsModal(false);
      }
    } catch (error) {
      console.error('Error loading project:', error);
      alert('Erro ao carregar projeto');
    }
  };

  // Listener para status do projeto
  React.useEffect(() => {
    const unsubscribe = window.electron?.videoProject?.onStatus?.((data) => {
      console.log('📊 Video Project Status:', data);
    });
    return () => { unsubscribe?.(); };
  }, []);

  // Listener para progresso de renderização
  React.useEffect(() => {
    const unsubscribe = window.electron?.videoProject?.onRenderProgress?.((data) => {
      setRenderProgress(data.percent);
    });
    return () => { unsubscribe?.(); };
  }, []);

  // Handler para upload de áudio
  const handleAudioUpload = useCallback(async (file: File) => {
    setProject(prev => ({
      ...prev,
      audioFile: file,
      title: file.name.replace(/\.[^/.]+$/, ''),
    }));
    setCurrentStep('transcribing');
    setIsProcessing(true);
    setError(null);

    try {
      // Verificar se API está disponível
      if (!window.electron?.videoProject) {
        throw new Error('Video Project API not available');
      }

      // Converter File para ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      
      // Salvar arquivo no backend
      const saveResult = await window.electron.videoProject.saveAudio(arrayBuffer, file.name);
      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Failed to save audio file');
      }
      
      // Transcrever áudio
      const transcriptionResult = await window.electron.videoProject.transcribe(saveResult.path);
      
      if (!transcriptionResult.success) {
        throw new Error(transcriptionResult.error || 'Transcription failed');
      }

      // Atualizar projeto com segmentos E caminho do áudio
      setProject(prev => ({
        ...prev,
        audioPath: saveResult.path, // Salvar caminho do áudio
        duration: transcriptionResult.duration,
        segments: transcriptionResult.segments.map((seg: any) => ({
          id: seg.id,
          text: seg.text,
          start: seg.start,
          end: seg.end,
          speaker: seg.speaker,
          emotion: undefined, // Será preenchido pela IA
          imagePrompt: undefined,
          imageUrl: undefined,
        })),
      }));
      
      setCurrentStep('keyframes');
    } catch (err) {
      console.error('Upload/transcription error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao transcrever áudio');
      setCurrentStep('upload');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Handler para análise por IA
  const handleAnalyzeWithAI = useCallback(async () => {
    setCurrentStep('analyzing');
    setIsProcessing(true);

    try {
      if (!window.electron?.videoProject) {
        // Fallback: apenas continuar sem análise
        setCurrentStep('prompts');
        return;
      }

      const result = await window.electron.videoProject.analyze(
        project.segments,
        {
          editingStyle: project.editingStyle,
          authorConclusion: project.authorConclusion,
          provider: selectedProvider
        }
      );

      if (result.success && result.segments) {
        setProject(prev => ({
          ...prev,
          segments: result.segments,
        }));
      }
      
      setCurrentStep('prompts');
    } catch (err) {
      console.error('Analysis error:', err);
      // Continuar mesmo em caso de erro
      setCurrentStep('prompts');
    } finally {
      setIsProcessing(false);
    }
  }, [project.segments, project.editingStyle, project.authorConclusion]);

  // Handler para atualizar emoção de um segmento
  const handleUpdateEmotion = useCallback((segmentId: number, emotion: string) => {
    setProject(prev => ({
      ...prev,
      segments: prev.segments.map(seg =>
        seg.id === segmentId ? { ...seg, emotion } : seg
      ),
    }));
  }, []);

  // Handler para atualizar prompt de imagem
  const handleUpdatePrompt = useCallback((segmentId: number, prompt: string) => {
    setProject(prev => ({
      ...prev,
      segments: prev.segments.map(seg =>
        seg.id === segmentId ? { ...seg, imagePrompt: prompt } : seg
      ),
    }));
  }, []);

  // Handler para atualizar imagem de um segmento (upload manual ou gerada)
  const handleUpdateImage = useCallback((segmentId: number, imageUrl: string) => {
    setProject(prev => ({
      ...prev,
      segments: prev.segments.map(seg =>
        seg.id === segmentId ? { 
          ...seg, 
          imageUrl,
          // Se estamos definindo uma imagem, garantir que o tipo seja compatível (evita erro de <Video> com PNG)
          assetType: imageUrl ? 'image_static' : seg.assetType
        } : seg
      ),
    }));
  }, []);

  // Estado para armazenar caminho do vídeo gerado
  const [outputPath, setOutputPath] = useState<string | null>(null);

  // Handler para iniciar renderização
  const handleStartRender = useCallback(async () => {
    setCurrentStep('rendering');
    setRenderProgress(0);
    setError(null);

    try {
      if (!window.electron?.videoProject) {
        throw new Error('Video Project API not available');
      }

      const result = await window.electron.videoProject.render({
        title: project.title,
        description: project.description,
        duration: project.duration,
        audioPath: project.audioPath, // Incluir caminho do áudio
        segments: project.segments,
        editingStyle: project.editingStyle,
        authorConclusion: project.authorConclusion,
      });

      if (result.success && result.outputPath) {
        setOutputPath(result.outputPath);
        setCurrentStep('complete');
      } else {
        throw new Error(result.error || 'Render failed');
      }
    } catch (err) {
      console.error('Render error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao renderizar');
      setCurrentStep('images'); // Voltar para step anterior
    }
  }, [project]);

  // Renderizar conteúdo baseado no step atual
  const renderStepContent = () => {
    switch (currentStep) {
      case 'upload':
        return <UploadStep onUpload={handleAudioUpload} />;
      
      case 'transcribing':
        return <ProcessingStep message="Transcrevendo áudio..." />;
      
      case 'analyzing':
        return <ProcessingStep message="Analisando com IA..." />;
      
      case 'keyframes':
        return (
          <KeyframesStep
            segments={project.segments}
            onUpdateEmotion={handleUpdateEmotion}
            onContinue={handleAnalyzeWithAI}
            onBack={() => setCurrentStep('upload')}
            provider={selectedProvider}
            onProviderChange={(p) => setSelectedProvider(p)}
          />
        );
      
      case 'prompts':
        return (
          <PromptsStep
            segments={project.segments}
            onUpdatePrompt={handleUpdatePrompt}
            onContinue={() => setCurrentStep('images')}
            onBack={() => setCurrentStep('keyframes')}
          />
        );
      
      case 'images':
        return (
          <ImagesStep
            segments={project.segments}
            onUpdateImage={handleUpdateImage}
            onContinue={() => setCurrentStep('preview')}
            onBack={() => setCurrentStep('prompts')}
          />
        );
      
      case 'preview':
        return (
          <PreviewStep
            project={project}
            onContinue={handleStartRender}
            onBack={() => setCurrentStep('images')}
          />
        );
      
      case 'rendering':
        return <RenderingStep project={project} progress={renderProgress} />;
      
      case 'complete':
        return (
          <CompleteStep 
            outputPath={outputPath}
            onNewProject={() => {
              setCurrentStep('upload');
              setOutputPath(null);
              setProject({
                title: '',
                duration: 0,
                segments: [],
                authorConclusion: '',
                editingStyle: 'dinâmico e envolvente',
              });
            }} 
          />
        );
      
      default:
        return null;
    }
  };

  return (
    <>
      <Head>
        <title>Video Studio | Avatar AI</title>
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
        {/* Header */}
        <header className="border-b border-white/10 bg-black/30 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="m22 8-6 4 6 4V8Z"></path>
                    <rect width="14" height="12" x="2" y="6" rx="2" ry="2"></rect>
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">Video Studio</h1>
                  <p className="text-sm text-white/60">Crie vídeos a partir de áudio</p>
                </div>
                
                {/* Botões de Ação */}
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => {
                       loadProjectsList();
                       setShowProjectsModal(true);
                    }}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-all flex items-center gap-2"
                  >
                    📂 Abrir
                  </button>
                  {project.segments.length > 0 && (
                    <button
                      onClick={handleSaveProject}
                      className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-all flex items-center gap-2"
                    >
                      💾 Salvar
                    </button>
                  )}
                </div>
              </div>
              
              {/* Progress Steps */}
              <div className="flex items-center gap-2">
                {['upload', 'keyframes', 'prompts', 'images', 'preview', 'rendering'].map((step, index) => (
                  <div
                    key={step}
                    className={`w-3 h-3 rounded-full transition-all ${
                      currentStep === step
                        ? 'bg-pink-500 scale-125'
                        : ['upload', 'keyframes', 'prompts', 'images', 'preview', 'rendering'].indexOf(currentStep) > index
                        ? 'bg-green-500'
                        : 'bg-white/20'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 py-8">
          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-300">
              {error}
              <button 
                onClick={() => setError(null)}
                className="ml-4 text-red-400 hover:text-red-300"
              >
                ✕
              </button>
            </div>
          )}
          
          {renderStepContent()}
        </main>
      </div>

      {/* Projects Modal */}
      {showProjectsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Meus Projetos</h2>
              <button 
                onClick={() => setShowProjectsModal(false)}
                className="text-white/40 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingProjects ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-white/40">Carregando...</p>
                </div>
              ) : savedProjects.length === 0 ? (
                <div className="text-center py-8 text-white/40">
                  <p>Nenhum projeto salvo encontrado.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {savedProjects.map((proj) => (
                    <button
                      key={proj.path}
                      onClick={() => handleLoadProject(proj.path)}
                      className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 hover:border-pink-500/30 transition-all group text-left"
                    >
                      <div>
                        <h3 className="text-white font-medium group-hover:text-pink-400 transition-colors">
                          {proj.name.replace('.json', '')}
                        </h3>
                        <p className="text-white/40 text-xs mt-1">
                          {new Date(proj.createdAt).toLocaleDateString()} às {new Date(proj.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-pink-500 group-hover:text-white transition-all">
                        →
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ========================================
// STEP COMPONENTS
// ========================================

// Upload Step
function UploadStep({ onUpload }: { onUpload: (file: File) => void }) {
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
    </div>
  );
}

// Processing Step
function ProcessingStep({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="w-16 h-16 mb-6 border-4 border-pink-500/30 border-t-pink-500 rounded-full animate-spin" />
      <p className="text-xl text-white/80">{message}</p>
    </div>
  );
}

// Keyframes Step
function KeyframesStep({
  segments,
  onUpdateEmotion,
  onContinue,
  onBack,
  provider = 'gemini',
  onProviderChange,
}: {
  segments: TranscriptionSegment[];
  onUpdateEmotion: (id: number, emotion: string) => void;
  onContinue: () => void;
  onBack: () => void;
  provider?: 'gemini' | 'openai' | 'deepseek';
  onProviderChange?: (p: 'gemini' | 'openai' | 'deepseek') => void;
}) {
  const emotions = ['surpresa', 'empolgação', 'nostalgia', 'seriedade', 'alegria', 'tristeza', 'raiva', 'medo', 'neutro'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Keyframes & Emoções</h2>
          <p className="text-white/60">Revise e ajuste as emoções sugeridas para cada segmento</p>
          
          {onProviderChange && (
            <div className="flex items-center gap-3 mt-4">
               <span className="text-white/60 text-sm">IA de Análise:</span>
               <select
                 value={provider}
                 onChange={(e) => onProviderChange(e.target.value as any)}
                 className="bg-black/30 border border-white/10 rounded-lg px-3 py-1 text-white text-sm focus:border-pink-500 focus:outline-none"
               >
                 <option value="gemini">Google Gemini</option>
                 <option value="openai">OpenAI (GPT-4)</option>
                 <option value="deepseek">DeepSeek V3</option>
               </select>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
          >
            ← Voltar
          </button>
          <button
            onClick={onContinue}
            className="px-6 py-2 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white rounded-lg font-medium transition-all"
          >
            Continuar →
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {segments.map((segment) => (
          <div
            key={segment.id}
            className="p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all"
          >
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-2 py-1 bg-white/10 rounded text-xs text-white/60 font-mono">
                    {segment.start.toFixed(2)}s - {segment.end.toFixed(2)}s
                  </span>
                  <span className="text-xs text-white/40">Speaker {segment.speaker}</span>
                </div>
                <p className="text-white text-lg">{segment.text}</p>
              </div>
              
              <div className="flex flex-wrap gap-2 max-w-xs">
                {emotions.map((emotion) => (
                  <button
                    key={emotion}
                    onClick={() => onUpdateEmotion(segment.id, emotion)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                      segment.emotion === emotion
                        ? 'bg-pink-500 text-white'
                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                    }`}
                  >
                    {emotion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Prompts Step
function PromptsStep({
  segments,
  onUpdatePrompt,
  onContinue,
  onBack,
}: {
  segments: TranscriptionSegment[];
  onUpdatePrompt: (id: number, prompt: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Prompts de Imagem</h2>
          <p className="text-white/60">Edite os prompts para gerar as imagens de cada cena</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
          >
            ← Voltar
          </button>
          <button
            onClick={onContinue}
            className="px-6 py-2 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white rounded-lg font-medium transition-all"
          >
            Gerar Imagens →
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {segments.map((segment) => (
          <div
            key={segment.id}
            className="p-6 bg-white/5 border border-white/10 rounded-xl"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="px-2 py-1 bg-pink-500/20 text-pink-300 rounded text-xs">
                Cena {segment.id}
              </span>
              <span className="px-2 py-1 bg-white/10 rounded text-xs text-white/60">
                {segment.emotion}
              </span>
            </div>
            <p className="text-white/80 text-sm mb-4 italic">"{segment.text}"</p>
            <textarea
              value={segment.imagePrompt || `${segment.emotion} scene depicting: ${segment.text}`}
              onChange={(e) => onUpdatePrompt(segment.id, e.target.value)}
              className="w-full h-24 p-4 bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/30 focus:border-pink-500 focus:outline-none resize-none"
              placeholder="Descreva a imagem que você quer..."
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// Images Step - Com suporte a upload manual
function ImagesStep({
  segments,
  onUpdateImage,
  onContinue,
  onBack,
}: {
  segments: TranscriptionSegment[];
  onUpdateImage: (id: number, imageUrl: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  // Helper para converter caminho de arquivo em URL para preview
  const getImageSrc = (imagePath: string | undefined): string => {
    if (!imagePath) return '';
    // Se já é uma URL (blob: ou http:), usar diretamente
    if (imagePath.startsWith('blob:') || imagePath.startsWith('http')) {
      return imagePath;
    }
    // Caminho de arquivo Windows/Unix - converter para file:// URL
    // Substituir backslashes por forward slashes e encodar
    const normalizedPath = imagePath.replace(/\\/g, '/');
    return `file:///${normalizedPath}`;
  };
  const [approvedSegments, setApprovedSegments] = useState<Set<number>>(new Set());
  const [generatingSegments, setGeneratingSegments] = useState<Set<number>>(new Set());
  const [uploadingSegments, setUploadingSegments] = useState<Set<number>>(new Set());
  


  // Handler para upload de imagem manual - salva no disco
  const handleImageUpload = async (segmentId: number, file: File) => {
    setUploadingSegments(prev => new Set([...prev, segmentId]));
    
    try {
      // Verificar se a API está disponível
      if (!window.electron?.videoProject?.saveImage) {
        console.error('saveImage API not available');
        // Fallback: usar blob URL (não funcionará na renderização)
        const imageUrl = URL.createObjectURL(file);
        onUpdateImage(segmentId, imageUrl);
      } else {
        // Converter File para ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Salvar no backend e obter caminho + URL HTTP
        const result = await window.electron.videoProject.saveImage(arrayBuffer, file.name, segmentId);
        
        if (result.success && result.httpUrl) {
          // Usar a URL HTTP para preview E renderização
          // O servidor HTTP estará rodando durante ambos
          onUpdateImage(segmentId, result.httpUrl);
          console.log(`✅ Image saved for segment ${segmentId}:`, result.httpUrl);
        } else {
          console.error('Failed to save image:', result.error);
          // Fallback: usar blob URL
          const imageUrl = URL.createObjectURL(file);
          onUpdateImage(segmentId, imageUrl);
        }
      }
      
      // Auto-aprovar quando faz upload manual
      setApprovedSegments(prev => new Set([...prev, segmentId]));
    } catch (error) {
      console.error('Error uploading image:', error);
    } finally {
      setUploadingSegments(prev => {
        const next = new Set(prev);
        next.delete(segmentId);
        return next;
      });
    }
  };

  // Handler para aprovar imagem
  const handleApprove = (segmentId: number) => {
    setApprovedSegments(prev => new Set([...prev, segmentId]));
  };

  // Handler para refazer imagem (simula regeneração)
  const handleRegenerate = async (segmentId: number) => {
    setGeneratingSegments(prev => new Set([...prev, segmentId]));
    setApprovedSegments(prev => {
      const newSet = new Set(prev);
      newSet.delete(segmentId);
      return newSet;
    });
    
    // TODO: Chamar API de geração de imagem
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setGeneratingSegments(prev => {
      const newSet = new Set(prev);
      newSet.delete(segmentId);
      return newSet;
    });
  };

  // Handler para remover imagem
  const handleRemoveImage = (segmentId: number) => {
    onUpdateImage(segmentId, '');
    setApprovedSegments(prev => {
      const newSet = new Set(prev);
      newSet.delete(segmentId);
      return newSet;
    });
  };

  const allApproved = segments.every(seg => approvedSegments.has(seg.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Imagens das Cenas</h2>
          <p className="text-white/60">Aprove, refaça ou faça upload das suas próprias imagens</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
          >
            ← Voltar
          </button>
          <button
            onClick={onContinue}
            disabled={!allApproved}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              allApproved
                ? 'bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white'
                : 'bg-white/10 text-white/40 cursor-not-allowed'
            }`}
          >
            Renderizar Vídeo →
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="text-white/60 text-sm">
            {approvedSegments.size} de {segments.length} aprovadas
          </span>
        </div>
        {!allApproved && (
          <span className="text-orange-400 text-sm">
            ⚠️ Aprove todas as imagens para continuar
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {segments.map((segment) => {
          const isApproved = approvedSegments.has(segment.id);
          const isGenerating = generatingSegments.has(segment.id);
          const isUploading = uploadingSegments.has(segment.id);
          const hasImage = !!segment.imageUrl;

          return (
            <div
              key={segment.id}
              className={`bg-white/5 border rounded-xl overflow-hidden transition-all ${
                isApproved ? 'border-green-500/50' : 'border-white/10'
              }`}
            >
              {/* Preview de imagem ou área de upload */}
              <div className="aspect-video relative group">
                {(isGenerating || isUploading) ? (
                  <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-purple-500/10 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-10 h-10 mx-auto mb-2 border-2 border-pink-500/30 border-t-pink-500 rounded-full animate-spin" />
                      <p className="text-white/60 text-sm">{isUploading ? 'Enviando...' : 'Gerando...'}</p>
                    </div>
                  </div>
                ) : hasImage ? (
                  <>
                    <img
                      src={getImageSrc(segment.imageUrl)}
                      alt={`Cena ${segment.id}`}
                      className="w-full h-full object-cover"
                    />
                    {/* Overlay de ações */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleRemoveImage(segment.id)}
                        className="px-3 py-2 bg-red-500/80 hover:bg-red-500 text-white rounded-lg text-sm transition-all"
                      >
                        🗑️ Remover
                      </button>
                      <label className="px-3 py-2 bg-blue-500/80 hover:bg-blue-500 text-white rounded-lg text-sm cursor-pointer transition-all">
                        📁 Trocar
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageUpload(segment.id, file);
                          }}
                        />
                      </label>
                    </div>
                    {/* Badge de aprovado */}
                    {isApproved && (
                      <div className="absolute top-2 right-2 px-2 py-1 bg-green-500 text-white text-xs rounded-full">
                        ✓ Aprovada
                      </div>
                    )}
                  </>
                ) : (
                  <label 
                    className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-purple-500/10 flex items-center justify-center cursor-pointer hover:from-pink-500/20 hover:to-purple-500/20 transition-all"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.add('from-pink-500/30', 'to-purple-500/30');
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.remove('from-pink-500/30', 'to-purple-500/30');
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.remove('from-pink-500/30', 'to-purple-500/30');
                      const file = e.dataTransfer.files?.[0];
                      if (file && file.type.startsWith('image/')) {
                        handleImageUpload(segment.id, file);
                      }
                    }}
                  >
                    <div className="text-center pointer-events-none">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-2 text-white/40">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                      </svg>
                      <p className="text-white/60 text-sm mb-2">Arraste uma imagem aqui</p>
                      <p className="text-white/40 text-xs">ou clique para selecionar</p>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(segment.id, file);
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Info do segmento */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-pink-500/20 text-pink-300 rounded text-xs">
                    Cena {segment.id}
                  </span>
                  <span className="px-2 py-0.5 bg-white/10 text-white/50 rounded text-xs">
                    {segment.emotion}
                  </span>
                </div>
                <p className="text-white/80 text-sm line-clamp-2 mb-3">{segment.text}</p>
                
                {/* Botões de ação */}
                <div className="flex gap-2">
                  {hasImage && !isApproved && (
                    <button
                      onClick={() => handleApprove(segment.id)}
                      className="flex-1 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-lg text-sm transition-all"
                    >
                      ✓ Aprovar
                    </button>
                  )}
                  <button
                    onClick={() => handleRegenerate(segment.id)}
                    disabled={isGenerating}
                    className={`flex-1 py-2 rounded-lg text-sm transition-all ${
                      isGenerating
                        ? 'bg-white/5 text-white/30 cursor-not-allowed'
                        : 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-300'
                    }`}
                  >
                    {isGenerating ? '...' : '↻ Gerar com IA'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Preview Step - Visualizar vídeo antes de renderizar
function PreviewStep({
  project,
  onContinue,
  onBack,
}: {
  project: ProjectState;
  onContinue: () => void;
  onBack: () => void;
}) {
  // Converter ProjectState para formato do Remotion
  const remotionProject = React.useMemo(() => {
    const fps = 30;
    return {
      project_title: project.title,
      description: project.description,
      config: {
        width: 1920,
        height: 1080,
        fps,
        backgroundColor: '#0a0a0a',
        backgroundMusic: project.audioPath ? {
          src: project.audioPath.startsWith('http') 
            ? project.audioPath 
            : `http://localhost:9999/${project.audioPath.split(/[\\/]/).pop()}`,
          volume: 1.0,
        } : undefined,
      },
      scenes: project.segments.map(seg => ({
        id: seg.id,
        start_time: seg.start,
        end_time: seg.end,
        transcript_segment: seg.text,
        visual_concept: {
          description: seg.text,
          art_style: 'photorealistic',
          emotion: seg.emotion || 'neutro',
        },
        asset_type: seg.assetType || 'image_static',
        asset_url: seg.imageUrl || '',
        prompt_suggestion: seg.imagePrompt || '',
        camera_movement: seg.cameraMovement || 'static',
        transition: seg.transition || 'fade',
        transition_duration: 0.5,
        text_overlay: {
          text: seg.text,
          position: 'bottom',
          style: 'subtitle',
          animation: 'fade',
        },
      })),
      schema_version: '1.0',
    };
  }, [project]);

  // Calcular duração
  const lastScene = project.segments[project.segments.length - 1];
  const durationInSeconds = lastScene ? lastScene.end : 10;
  const fps = 30;
  const durationInFrames = Math.ceil(durationInSeconds * fps);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">👁️ Preview do Vídeo</h2>
          <p className="text-white/60">
            Visualize o resultado antes de renderizar
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
          >
            ← Voltar
          </button>
          <button
            onClick={onContinue}
            className="px-6 py-2 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white rounded-lg font-medium transition-all"
          >
            🎬 Renderizar Vídeo
          </button>
        </div>
      </div>

      {/* Player de Preview */}
      <div className="bg-black/50 rounded-xl overflow-hidden shadow-2xl">
        <div className="relative" style={{ aspectRatio: '16/9' }}>
          {/* Importação dinâmica do Player para evitar SSR issues */}
          <VideoPreviewPlayer
            project={remotionProject}
            durationInFrames={durationInFrames}
            fps={fps}
          />
        </div>
      </div>

      {/* Informações do projeto */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-white/5 rounded-lg text-center">
          <p className="text-white/60 text-sm">Duração</p>
          <p className="text-white text-lg font-bold">
            {Math.floor(durationInSeconds / 60)}:{String(Math.floor(durationInSeconds % 60)).padStart(2, '0')}
          </p>
        </div>
        <div className="p-4 bg-white/5 rounded-lg text-center">
          <p className="text-white/60 text-sm">Cenas</p>
          <p className="text-white text-lg font-bold">{project.segments.length}</p>
        </div>
        <div className="p-4 bg-white/5 rounded-lg text-center">
          <p className="text-white/60 text-sm">Resolução</p>
          <p className="text-white text-lg font-bold">1080p</p>
        </div>
      </div>

      {/* Aviso sobre renderização */}
      <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
        <p className="text-purple-300 text-sm">
          💡 <strong>Dica:</strong> O preview usa qualidade reduzida para performance. 
          O vídeo final será renderizado em alta qualidade com aceleração por GPU.
        </p>
      </div>
    </div>
  );
}

// Componente do Player de Preview (lazy loaded)
function VideoPreviewPlayer({ 
  project, 
  durationInFrames, 
  fps 
}: { 
  project: any; 
  durationInFrames: number; 
  fps: number;
}) {
  const [Player, setPlayer] = React.useState<any>(null);
  const [VideoProjectComposition, setVideoProjectComposition] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Carregar componentes dinamicamente (evita SSR)
  React.useEffect(() => {
    const loadComponents = async () => {
      try {
        setIsLoading(true);
        // Importar Player do Remotion
        const playerModule = await import('@remotion/player');
        setPlayer(() => playerModule.Player);
        
        // Importar composição
        const compositionModule = await import('../../remotion/compositions/VideoProject');
        setVideoProjectComposition(() => compositionModule.VideoProjectComposition);
        
        setIsLoading(false);
      } catch (err: any) {
        console.error('Error loading preview components:', err);
        setError(err.message || 'Failed to load preview');
        setIsLoading(false);
      }
    };

    loadComponents();
  }, []);

  if (isLoading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 border-2 border-pink-500/30 border-t-pink-500 rounded-full animate-spin" />
          <p className="text-white/60">Carregando preview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <div className="text-center p-4">
          <p className="text-red-400 mb-2">❌ Erro ao carregar preview</p>
          <p className="text-white/60 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!Player || !VideoProjectComposition) {
    return null;
  }

  return (
    <Player
      component={VideoProjectComposition}
      inputProps={{ project }}
      durationInFrames={durationInFrames}
      fps={fps}
      compositionWidth={1920}
      compositionHeight={1080}
      style={{
        width: '100%',
        height: '100%',
      }}
      controls
      loop
      autoPlay={false}
      allowFullscreen
      clickToPlay
      doubleClickToFullscreen
      spaceKeyToPlayOrPause
    />
  );
}

// Rendering Step
function RenderingStep({ project, progress }: { project: ProjectState; progress: number }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="w-24 h-24 mb-8 relative">
        <div className="absolute inset-0 border-4 border-pink-500/30 border-t-pink-500 rounded-full animate-spin" />
        <div className="absolute inset-2 border-4 border-purple-500/30 border-b-purple-500 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
        {/* Porcentagem no centro */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white font-bold text-lg">{Math.round(progress)}%</span>
        </div>
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Renderizando Vídeo</h2>
      <p className="text-white/60 mb-6">Isso pode levar alguns minutos...</p>
      <div className="w-full max-w-md bg-white/10 rounded-full h-3 overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all duration-300" 
          style={{ width: `${progress}%` }} 
        />
      </div>
      <p className="text-white/40 text-sm mt-3">Criando vídeo: {project.title}</p>
    </div>
  );
}

// Complete Step
function CompleteStep({ outputPath, onNewProject }: { outputPath: string | null; onNewProject: () => void }) {
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
