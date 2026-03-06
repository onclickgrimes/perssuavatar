/**
 * Audio to Video Tool
 * 
 * Ferramenta para criação de vídeos a partir de áudio/transcrição.
 * Fluxo:
 * 1. Upload de áudio → Transcrição (Deepgram)
 * 2. Análise por IA → Sugestão de emoções e keyframes
 * 3. Geração de prompts → Criação de imagens
 * 4. Aprovação do usuário → Renderização (Remotion)
 */
import React, { useState, useCallback } from 'react';
import { WorkflowStep, ProjectState } from '../../../types/video-studio';
import { UploadStep } from '../UploadStep';
import { ChannelNiche } from '../NicheModal';
import { ProcessingStep } from '../ProcessingStep';
import { KeyframesStep } from '../KeyframesStep';
import { PromptsStep } from '../PromptsStep';
import { ImagesStep } from '../ImagesStep';
import { PreviewStep } from '../PreviewStep';
import { RenderingStep } from '../RenderingStep';
import { CompleteStep } from '../CompleteStep';
import { toSaveFormat, fromSaveFormat } from '../../../shared/utils/project-converter';

interface AudioToVideoToolProps {
  onBack: () => void;
}

export function AudioToVideoTool({ onBack }: AudioToVideoToolProps) {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload');
  // Estado do modo de legenda
  const [subtitleMode, setSubtitleMode] = useState<'paragraph' | 'word-by-word'>('paragraph');
  const [project, setProject] = useState<ProjectState>({
    title: '',
    duration: 0,
    segments: [],
    selectedAspectRatios: ['9:16'], // Default
  });
  const [selectedNiche, setSelectedNiche] = useState<ChannelNiche | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderProgress, setRenderProgress] = useState(0);
  const [transcriptionMessage, setTranscriptionMessage] = useState('Transcrevendo áudio...');

  // Estados para gerenciamento de projetos
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [savedProjects, setSavedProjects] = useState<any[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'gemini' | 'openai' | 'deepseek'>('gemini');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3-flash-preview');

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
      // ✅ Usar conversor centralizado - adicionar propriedades em project-converter.ts
      const projectData = toSaveFormat(project as any, selectedNiche || undefined);

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
        // ✅ Usar conversor centralizado - adicionar propriedades em project-converter.ts
        const loadedProject = fromSaveFormat(result.project);
        
        setProject(loadedProject as ProjectState);
        
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
    // Não mudar o step para 'transcribing' para evitar unmount do UploadStep (e resetar a timeline de áudios)
    setIsProcessing(true);
    setError(null);

    const maxAttempts = 3;
    let attempts = 0;
    let success = false;
    let tempAudioPath = '';
    let tempDuration = 0;
    let tempSegments: any[] = [];

    while (attempts < maxAttempts && !success) {
      try {
        attempts++;
        if (attempts > 1) {
            setTranscriptionMessage(`Transcrevendo áudio... (Tentativa ${attempts}/${maxAttempts})`);
        } else {
            setTranscriptionMessage('Transcrevendo áudio...');
        }

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
           const errDetail = transcriptionResult.error?.message || transcriptionResult.error || 'Transcription failed';
           throw new Error(typeof errDetail === 'string' ? errDetail : JSON.stringify(errDetail));
        }

        success = true; // saiu do erro
        tempAudioPath = saveResult.path;
        tempDuration = transcriptionResult.duration;
        tempSegments = transcriptionResult.segments;

      } catch (err: any) {
        console.error(`Tentativa ${attempts} falhou:`, err);
        const errMsg = err.message || 'Desconhecido';
        
        if (attempts >= maxAttempts) {
          setError(`Falha ao transcrever após ${maxAttempts} tentativas. Erro: ${errMsg}`);
          setIsProcessing(false);
          return; // Retorna sem fechar o form de upload
        }
        
        setTranscriptionMessage(`Falha: ${errMsg}. Tentando ${attempts + 1}/${maxAttempts} em 2s...`);
        // Espera 2 segundos antes de tentar de novo
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    if (success) {
      // Atualizar projeto com segmentos E caminho do áudio
      setProject(prev => ({
        ...prev,
        audioPath: tempAudioPath, // Salvar caminho do áudio
        duration: tempDuration,
        segments: tempSegments.map((seg: any) => ({
          id: seg.id,
          text: seg.text,
          start: seg.start,
          end: seg.end,
          speaker: seg.speaker,
          words: seg.words, // ✅ Preservar timing do Deepgram
          emotion: undefined, // Será preenchido pela IA
          imagePrompt: undefined,
          imageUrl: undefined,
        })),
      }));
      
      setCurrentStep('keyframes');
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

      // Gerar prompt do nicho se estiver selecionado
      let nichePrompt: string | undefined;
      if (selectedNiche?.id) {
        try {
          nichePrompt = await window.electron.niche.generatePrompt(selectedNiche.id);
          console.log('🎯 Using niche prompt:', selectedNiche.name);
        } catch (error) {
          console.warn('Failed to generate niche prompt, using default:', error);
        }
      }

      const result = await window.electron.videoProject.analyze(
        project,
        {
          provider: selectedProvider,
          nichePrompt,
          model: selectedModel,
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
  }, [project, selectedProvider, selectedModel, selectedNiche]);

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
      segments: prev.segments.map(seg => {
        if (seg.id !== segmentId) return seg;
        
        // Determinar assetType baseado no conteúdo
        let assetType = seg.assetType;
        if (imageUrl) {
          const isVideoFile = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v']
            .some(ext => imageUrl.toLowerCase().endsWith(ext));
          // Só força image_static se é realmente uma imagem (não vídeo)
          if (!isVideoFile && assetType !== 'video_vo3') {
            assetType = 'image_static';
          }
        }
        
        return { ...seg, imageUrl, assetType };
      }),
    }));
  }, []);

  // Estado para armazenar caminho do vídeo gerado
  const [outputPath, setOutputPath] = useState<string | null>(null);

  const ASPECT_RATIO_DIMENSIONS: Record<string, { width: number; height: number }> = {
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
    '1:1': { width: 1080, height: 1080 },
    '4:3': { width: 1440, height: 1080 },
    '4:5': { width: 1080, height: 1350 },
    '3:4': { width: 1080, height: 1440 },
  };

  // Handler para iniciar renderização
  const handleStartRender = useCallback(async () => {
    setCurrentStep('rendering');
    setRenderProgress(0);
    setError(null);

    try {
      if (!window.electron?.videoProject) {
        throw new Error('Video Project API not available');
      }

      const ratiosToRender = (project.selectedAspectRatios && project.selectedAspectRatios.length > 0) 
        ? project.selectedAspectRatios 
        : ['9:16']; // Default to 9:16 if none selected

      const outputPaths: string[] = [];

      for (let i = 0; i < ratiosToRender.length; i++) {
        const ratio = ratiosToRender[i];
        const dims = ASPECT_RATIO_DIMENSIONS[ratio] || { width: 1080, height: 1920 };
        
        // Update title to include ratio if generating multiple
        const renderTitle = ratiosToRender.length > 1 
          ? `${project.title}-${ratio.replace(':','-')}`
          : project.title;

        console.log(`🎬 Rendering ${ratio} (${dims.width}x${dims.height})...`);

        const result = await window.electron.videoProject.render({
          title: renderTitle,
          description: project.description,
          duration: project.duration,
          audioPath: project.audioPath, // Incluir caminho do áudio
          segments: project.segments,
          subtitleMode: subtitleMode, // ✅ Modo de legenda para renderização
          componentsAllowed: selectedNiche?.components_allowed || project.componentsAllowed, // ✅ Componentes permitidos (nicho ou projeto salvo)
          defaultFont: selectedNiche?.default_font, // ✅ Fonte padrão do nicho
          config: {
            width: dims.width,
            height: dims.height,
            fps: 30, // Default 30fps
          }
        });

        if (result.success && result.outputPath) {
          outputPaths.push(result.outputPath);
        } else {
          throw new Error(result.error || `Render failed for ${ratio}`);
        }
      }

      if (outputPaths.length > 0) {
        // Show the last generated video or handle logic for multiple
        setOutputPath(outputPaths[outputPaths.length - 1]);
        setCurrentStep('complete');
        
        if (outputPaths.length > 1) {
          alert(`Vídeos gerados com sucesso:\n${outputPaths.map(p => p.split(/[/\\]/).pop()).join('\n')}`);
        }
      } else {
        throw new Error('Nenhum vídeo foi gerado');
      }
    } catch (err) {
      console.error('Render error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao renderizar');
      setCurrentStep('images'); // Voltar para step anterior
    }
  }, [project, subtitleMode, selectedNiche]);


  // Renderizar conteúdo baseado no step atual
  const renderStepContent = () => {
    switch (currentStep) {
      case 'upload':
        return (
          <UploadStep 
            onUpload={handleAudioUpload}
            selectedAspectRatios={project.selectedAspectRatios || []}
            onAspectRatiosChange={(value) => setProject(prev => ({ ...prev, selectedAspectRatios: value }))}
            selectedNiche={selectedNiche}
            onNicheChange={setSelectedNiche}
            isTranscribing={isProcessing && currentStep === 'upload'}
            transcriptionMessage={transcriptionMessage}
          />
        );
      
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
            onProviderChange={(p: any) => {
              setSelectedProvider(p);
              if (p === 'gemini') setSelectedModel('gemini-3-flash-preview');
              else if (p === 'openai') setSelectedModel('gpt-5-mini-2025-08-07');
              else if (p === 'deepseek') setSelectedModel('deepseek-chat');
            }}
            providerModel={selectedModel}
            onProviderModelChange={(m: string) => setSelectedModel(m)}
          />
        );
      
      case 'prompts':
        return (
          <PromptsStep
            segments={project.segments}
            onUpdatePrompt={handleUpdatePrompt}
            onUpdateImage={handleUpdateImage}
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
            aspectRatio={project.selectedAspectRatios?.[0] || '9:16'}
            onAspectRatioChange={(value) => setProject(prev => ({ ...prev, selectedAspectRatios: [value] }))}
          />
        );
      
      case 'preview':
        return (
          <PreviewStep
            project={project}
            subtitleMode={subtitleMode}
            setSubtitleMode={setSubtitleMode}
            onContinue={handleStartRender}
            onBack={() => setCurrentStep('images')}
            onAspectRatiosChange={(value) => setProject(prev => ({ ...prev, selectedAspectRatios: value }))}
            selectedNiche={selectedNiche}
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
              });
            }} 
          />
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/30 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Back Button */}
              <button
                onClick={onBack}
                className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-purple-600 rounded-xl flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="m22 8-6 4 6 4V8Z"></path>
                  <rect width="14" height="12" x="2" y="6" rx="2" ry="2"></rect>
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Áudio para Vídeo</h1>
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
      <main className={`mx-auto px-6 py-8 w-full ${currentStep === 'upload' ? 'max-w-[100vw]' : 'max-w-7xl'}`}>
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
    </div>
  );
}
