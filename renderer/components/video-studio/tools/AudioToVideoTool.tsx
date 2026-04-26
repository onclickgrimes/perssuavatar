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
import React, { useState, useCallback, useRef } from 'react';
import { WorkflowStep, ProjectState } from '../../../types/video-studio';
import { UploadStep } from '../UploadStep';
import { ChannelNiche } from '../NicheModal';
import { ProcessingStep } from '../ProcessingStep';
import { KeyframesStep } from '../KeyframesStep';
import { ImagesStep } from '../ImagesStep';
import { PreviewStep } from '../PreviewStep';
import { RenderingStep } from '../RenderingStep';
import { CompleteStep } from '../CompleteStep';
import {
  ensureFlowWatermarkTransform,
  toSaveFormat,
  fromSaveFormat,
  type StoryReferencesState,
} from '../../../shared/utils/project-converter';

interface AudioToVideoToolProps {
  onBack: () => void;
}

interface NicheContextItem {
  id: number;
  label?: string;
  prompt_en?: string;
  reference_id?: number | null;
}

interface NichePromptContextPayload {
  characters?: NicheContextItem[];
  locations?: NicheContextItem[];
}

interface PromptEditTargetOptions {
  segmentIds?: number[];
}

const createDefaultStoryReferences = (): StoryReferencesState => ({
  characters: [],
  locations: [],
  characterStyle: 'fotorrealista',
  locationStyle: 'fotorrealista',
});

export function AudioToVideoTool({ onBack }: AudioToVideoToolProps) {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload');
  // Estado do modo de legenda
  const [subtitleMode, setSubtitleMode] = useState<'paragraph' | 'word-by-word' | 'none'>('paragraph');
  const [project, setProject] = useState<ProjectState>({
    title: '',
    duration: 0,
    segments: [],
    selectedAspectRatios: ['9:16'], // Default
    storyReferences: createDefaultStoryReferences(),
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
  const [selectedProvider, setSelectedProvider] = useState<'gemini' | 'gemini_scraping' | 'openai' | 'deepseek'>('gemini');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3-flash-preview');
  const promptSummaryDebounceRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const lastSummarizedPromptRef = useRef<Record<number, string>>({});

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

        // ✅ Restaurar nicho selecionado (se salvo no projeto)
        if (loadedProject.nicheId) {
          try {
            const nicheData = await window.electron.niche.get(loadedProject.nicheId);
            if (nicheData) {
              setSelectedNiche(nicheData);
              console.log(`🎯 Nicho restaurado: ${nicheData.name}`);
            }
          } catch (err) {
            console.warn('Não foi possível restaurar o nicho:', err);
          }
        }
        
        // Determinar em qual passo estamos baseado nos dados
        if (loadedProject.segments.some((s: any) => s.imageUrl)) {
          setCurrentStep('images');
        } else if (loadedProject.segments.some((s: any) => s.imagePrompt)) {
          setCurrentStep('images');
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
  const handleAudioUpload = useCallback(async (file: File, originalFile?: File) => {
    const fileToSet = originalFile || file;
    setProject(prev => ({
      ...prev,
      audioFile: fileToSet,
      title: fileToSet.name.replace(/\.[^/.]+$/, ''),
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

        // Converter File para ArrayBuffer (arquivo para transcrição em baixa qualidade)
        const arrayBuffer = await file.arrayBuffer();
        
        // Salvar arquivo de transcrição no backend
        const saveResult = await window.electron.videoProject.saveAudio(arrayBuffer, file.name);
        if (!saveResult.success) {
          throw new Error(saveResult.error || 'Failed to save audio file');
        }

        let originalAudioPath = saveResult.path;

        // Salvar o arquivo original (alta qualidade) se existir, usado pro vídeo
        if (originalFile) {
          const originalBuffer = await originalFile.arrayBuffer();
          const origSaveResult = await window.electron.videoProject.saveAudio(originalBuffer, originalFile.name);
          if (origSaveResult.success) {
            originalAudioPath = origSaveResult.path;
          } else {
            console.warn('Failed to save original audio, using transcription audio as fallback:', origSaveResult.error);
          }
        }
        
        // Transcrever áudio
        const transcriptionResult = await window.electron.videoProject.transcribe(saveResult.path);
        
        if (!transcriptionResult.success) {
           const errDetail = transcriptionResult.error?.message || transcriptionResult.error || 'Transcription failed';
           throw new Error(typeof errDetail === 'string' ? errDetail : JSON.stringify(errDetail));
        }

        success = true; // saiu do erro
        tempAudioPath = originalAudioPath;
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
        storyReferences: createDefaultStoryReferences(),
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

  const loadNichePrompt = useCallback(async (
    referencesContext?: NichePromptContextPayload
  ): Promise<string | undefined> => {
    if (!selectedNiche?.id) return undefined;

    try {
      const parseIds = (raw: unknown): number[] => {
        if (raw == null) return [];
        if (Array.isArray(raw)) {
          return raw
            .map(v => parseInt(String(v).replace(/\D/g, ''), 10))
            .filter(v => !isNaN(v) && v > 0);
        }
        return String(raw)
          .split(',')
          .map(part => parseInt(part.replace(/\D/g, ''), 10))
          .filter(v => !isNaN(v) && v > 0);
      };

      const toNicheItem = (
        item: NicheContextItem,
        fallbackPrefix: 'Personagem' | 'Lugar'
      ): NicheContextItem | null => {
        const id = Number(item?.id);
        if (!Number.isFinite(id) || id <= 0) return null;
        const normalizedId = Math.floor(id);
        return {
          id: normalizedId,
          label: item.label?.trim() || `${fallbackPrefix} ${normalizedId}`,
          prompt_en: item.prompt_en?.trim() || undefined,
          reference_id: item.reference_id ?? null,
        };
      };

      const characterById = new Map<number, NicheContextItem>();
      const locationById = new Map<number, NicheContextItem>();

      (referencesContext?.characters || []).forEach(item => {
        const normalized = toNicheItem(item, 'Personagem');
        if (normalized) {
          characterById.set(normalized.id, normalized);
        }
      });

      (referencesContext?.locations || []).forEach(item => {
        const normalized = toNicheItem(item, 'Lugar');
        if (normalized) {
          locationById.set(normalized.id, normalized);
        }
      });

      if (characterById.size === 0 || locationById.size === 0) {
        project.segments.forEach(segment => {
          if (characterById.size === 0) {
            parseIds((segment as any).IdOfTheCharactersInTheScene).forEach(id => {
              if (!characterById.has(id)) {
                characterById.set(id, { id, label: `Personagem ${id}` });
              }
            });
          }

          if (locationById.size === 0) {
            parseIds((segment as any).IdOfTheLocationInTheScene).forEach(id => {
              if (!locationById.has(id)) {
                locationById.set(id, { id, label: `Lugar ${id}` });
              }
            });
          }
        });
      }

      const characters = Array.from(characterById.values()).sort((a, b) => a.id - b.id);
      const locations = Array.from(locationById.values()).sort((a, b) => a.id - b.id);

      const contextPayload = {
        ...(characters.length > 0 ? { characters } : {}),
        ...(locations.length > 0 ? { locations } : {}),
      };

      const nichePrompt = await window.electron.niche.generatePrompt(selectedNiche.id, contextPayload);
      console.log('🎯 Using niche prompt:', selectedNiche.name);
      return nichePrompt;
    } catch (error) {
      console.warn('Failed to generate niche prompt, using default:', error);
      return undefined;
    }
  }, [selectedNiche, project.segments]);

  const normalizePromptForSummary = useCallback((prompt: unknown): string => {
    if (prompt == null) return '';
    if (typeof prompt === 'string') return prompt.trim();
    try {
      return JSON.stringify(prompt).trim();
    } catch {
      return String(prompt).trim();
    }
  }, []);

  // Função específica para gerar a descrição curta da cena em português
  const summarizeScenePrompts = useCallback(async (
    segmentsToSummarize: Array<{ id: number; imagePrompt?: unknown }>
  ) => {
    if (!window.electron?.videoProject?.summarizeScenePrompts) return;

    const requestedPromptById: Record<number, string> = {};
    const payload = segmentsToSummarize
      .map(segment => {
        const normalizedPrompt = normalizePromptForSummary(segment.imagePrompt);
        if (!normalizedPrompt) return null;
        if (lastSummarizedPromptRef.current[segment.id] === normalizedPrompt) return null;
        requestedPromptById[segment.id] = normalizedPrompt;
        return { id: segment.id, imagePrompt: normalizedPrompt };
      })
      .filter((segment): segment is { id: number; imagePrompt: string } => segment !== null);

    if (payload.length === 0) return;

    // Gerar prompt do firstFrame ANTES de resumir a cena
    if (window.electron?.videoProject?.generateFirstFramePrompts) {
      try {
        const firstFrameResult = await window.electron.videoProject.generateFirstFramePrompts(payload, {
          provider: selectedProvider,
          model: selectedModel,
        });
        
        if (firstFrameResult?.success && Array.isArray(firstFrameResult.segments)) {
          const firstFrameById = new Map<number, string>();
          firstFrameResult.segments.forEach((segment: any) => {
            if (segment?.id == null || typeof segment.firstFrame !== 'string') return;
            const normalizedFirstFrame = segment.firstFrame.trim();
            if (!normalizedFirstFrame) return;
            firstFrameById.set(segment.id, normalizedFirstFrame);
          });

          if (firstFrameById.size > 0) {
            setProject(prev => ({
              ...prev,
              segments: prev.segments.map(seg => {
                const firstFrame = firstFrameById.get(seg.id);
                if (!firstFrame) return seg;
                return { ...seg, firstFrame };
              }),
            }));
          }
        }
      } catch (err) {
        console.error('Error generating first frame prompts:', err);
      }
    }

    try {
      const result = await window.electron.videoProject.summarizeScenePrompts(payload, {
        provider: selectedProvider,
        model: selectedModel,
      });

      if (!result?.success || !Array.isArray(result.segments)) {
        console.warn('Scene summary request failed:', result?.error);
        return;
      }

      const descriptionById = new Map<number, string>();
      result.segments.forEach((segment: any) => {
        if (segment?.id == null || typeof segment.sceneDescription !== 'string') return;
        const normalizedDescription = segment.sceneDescription.trim();
        if (!normalizedDescription) return;
        descriptionById.set(segment.id, normalizedDescription);
      });

      setProject(prev => ({
        ...prev,
        segments: prev.segments.map(seg => {
          const requestedPrompt = requestedPromptById[seg.id];
          if (!requestedPrompt) return seg;

          // Ignorar resposta atrasada quando o usuário já alterou novamente o prompt
          const currentPrompt = normalizePromptForSummary(seg.imagePrompt);
          if (currentPrompt !== requestedPrompt) return seg;

          const sceneDescription = descriptionById.get(seg.id);
          if (!sceneDescription) return seg;

          lastSummarizedPromptRef.current[seg.id] = requestedPrompt;
          return { ...seg, sceneDescription };
        }),
      }));
    } catch (summaryError) {
      console.error('Error summarizing scene prompts:', summaryError);
    }
  }, [normalizePromptForSummary, selectedProvider, selectedModel]);

  const scheduleSingleSceneSummary = useCallback((segmentId: number, prompt: string) => {
    const pendingTimer = promptSummaryDebounceRef.current[segmentId];
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      delete promptSummaryDebounceRef.current[segmentId];
    }

    const normalizedPrompt = normalizePromptForSummary(prompt);
    if (!normalizedPrompt) {
      delete lastSummarizedPromptRef.current[segmentId];
      return;
    }

    promptSummaryDebounceRef.current[segmentId] = setTimeout(() => {
      delete promptSummaryDebounceRef.current[segmentId];
      summarizeScenePrompts([{ id: segmentId, imagePrompt: normalizedPrompt }]).catch(() => {});
    }, 900);
  }, [normalizePromptForSummary, summarizeScenePrompts]);

  React.useEffect(() => {
    return () => {
      Object.values(promptSummaryDebounceRef.current).forEach(timeoutId => clearTimeout(timeoutId));
    };
  }, []);

  const handleStoryReferencesChange = useCallback((next: React.SetStateAction<StoryReferencesState>) => {
    setProject(prev => {
      const previousReferences: StoryReferencesState = {
        characters: Array.isArray(prev.storyReferences?.characters) ? prev.storyReferences.characters : [],
        locations: Array.isArray(prev.storyReferences?.locations) ? prev.storyReferences.locations : [],
        characterStyle: String(prev.storyReferences?.characterStyle || 'fotorrealista').trim() || 'fotorrealista',
        locationStyle: String(prev.storyReferences?.locationStyle || 'fotorrealista').trim() || 'fotorrealista',
      };

      const resolved = typeof next === 'function'
        ? (next as (current: StoryReferencesState) => StoryReferencesState)(previousReferences)
        : next;

      return {
        ...prev,
        storyReferences: {
          characters: Array.isArray(resolved?.characters) ? resolved.characters : [],
          locations: Array.isArray(resolved?.locations) ? resolved.locations : [],
          characterStyle: String(resolved?.characterStyle || 'fotorrealista').trim() || 'fotorrealista',
          locationStyle: String(resolved?.locationStyle || 'fotorrealista').trim() || 'fotorrealista',
        },
      };
    });
  }, []);

  // Handler para análise global por IA (regerar prompts ou editar um subconjunto)
  const handleAnalyzeWithAI = useCallback(async (
    userInstruction?: string,
    referencesContext?: NichePromptContextPayload,
    targetOptions?: PromptEditTargetOptions
  ) => {
    setCurrentStep('analyzing');
    setIsProcessing(true);

    try {
      if (!window.electron?.videoProject) {
        // Fallback: apenas continuar sem análise
        setCurrentStep('images');
        return;
      }

      const normalizedInstruction = userInstruction?.trim();
      const hasExistingPrompts = project.segments.some(seg => !!seg.imagePrompt);
      const debugAction = normalizedInstruction
        ? 'edicao-global'
        : hasExistingPrompts
          ? 'regeracao'
          : 'geracao';

      let result: any;
      let editedSegmentIdSet: Set<number> | null = null;

      if (normalizedInstruction) {
        const targetIdSet = targetOptions?.segmentIds?.length
          ? new Set(targetOptions.segmentIds)
          : null;
        const segmentsForEdition = targetIdSet
          ? project.segments.filter(seg => targetIdSet.has(seg.id))
          : project.segments;

        if (segmentsForEdition.length === 0) {
          setCurrentStep('images');
          return;
        }

        editedSegmentIdSet = new Set(segmentsForEdition.map(seg => seg.id));

        const editRequest = {
          segments: segmentsForEdition.map(seg => {
            if (seg.assetType === 'video_frame_animate') {
              return {
                id: seg.id,
                assetType: seg.assetType,
                firstFrame: seg.firstFrame,
                animateFrame: seg.animateFrame,
              };
            }
            return {
              id: seg.id,
              assetType: seg.assetType,
              imagePrompt: seg.imagePrompt,
            };
          }),
          options: {
            provider: selectedProvider,
            model: selectedModel,
            userInstruction: normalizedInstruction,
          },
        };

        result = await window.electron.videoProject.editPrompts(
          editRequest.segments,
          editRequest.options
        );
      } else {
        const analyzeRequest = {
          project,
          options: {
            provider: selectedProvider,
            nichePrompt: await loadNichePrompt(referencesContext),
            model: selectedModel,
          },
        };

        result = await window.electron.videoProject.analyze(
          analyzeRequest.project,
          analyzeRequest.options
        );
      }

      if (result.success && result.segments) {
        const updatedSegments = normalizedInstruction
          ? project.segments.map(seg => {
              const editedSegment = result.segments.find((edited: any) => edited.id === seg.id);
              if (!editedSegment) return seg;

              if (seg.assetType === 'video_frame_animate') {
                const hasFirstFrame = editedSegment.firstFrame != null;
                const hasAnimateFrame = editedSegment.animateFrame != null;
                if (!hasFirstFrame && !hasAnimateFrame) return seg;

                return {
                  ...seg,
                  ...(hasFirstFrame
                    ? {
                        firstFrame: typeof editedSegment.firstFrame === 'string'
                          ? editedSegment.firstFrame
                          : String(editedSegment.firstFrame),
                      }
                    : {}),
                  ...(hasAnimateFrame
                    ? {
                        animateFrame: typeof editedSegment.animateFrame === 'string'
                          ? editedSegment.animateFrame
                          : String(editedSegment.animateFrame),
                      }
                    : {}),
                };
              }

              const hasPrompt = editedSegment.imagePrompt != null;
              const hasCharacters = editedSegment.IdOfTheCharactersInTheScene !== undefined;
              const hasLocation = editedSegment.IdOfTheLocationInTheScene !== undefined;
              if (!hasPrompt && !hasCharacters && !hasLocation) return seg;

              return {
                ...seg,
                ...(hasPrompt ? { imagePrompt: editedSegment.imagePrompt } : {}),
                ...(hasCharacters ? { IdOfTheCharactersInTheScene: editedSegment.IdOfTheCharactersInTheScene } : {}),
                ...(hasLocation ? { IdOfTheLocationInTheScene: editedSegment.IdOfTheLocationInTheScene } : {}),
              };
            })
          : result.segments;

        setProject(prev => ({
          ...prev,
          segments: updatedSegments,
        }));

        summarizeScenePrompts(
          editedSegmentIdSet
            ? updatedSegments.filter(seg => editedSegmentIdSet.has(seg.id))
            : updatedSegments
        ).catch(() => {});
      }
      
      setCurrentStep('images');
    } catch (err) {
      console.error('Analysis error:', err);
      // Continuar mesmo em caso de erro
      setCurrentStep('images');
    } finally {
      setIsProcessing(false);
    }
  }, [loadNichePrompt, project, project.segments, selectedProvider, selectedModel, summarizeScenePrompts]);

  // Handler para análise por IA de apenas uma cena
  const handleAnalyzeSingleSceneWithAI = useCallback(async (segmentId: number, userInstruction: string) => {
    const normalizedInstruction = userInstruction.trim();
    if (!normalizedInstruction) return;

    const targetSegment = project.segments.find(seg => seg.id === segmentId);
    if (!targetSegment) return;

    setIsProcessing(true);

    try {
      if (!window.electron?.videoProject) return;

      const editSceneRequest = {
        segments: [
          targetSegment.assetType === 'video_frame_animate'
            ? {
                id: targetSegment.id,
                assetType: targetSegment.assetType,
                firstFrame: targetSegment.firstFrame,
                animateFrame: targetSegment.animateFrame,
              }
            : {
                id: targetSegment.id,
                assetType: targetSegment.assetType,
                imagePrompt: targetSegment.imagePrompt,
              },
        ],
        options: {
          provider: selectedProvider,
          model: selectedModel,
          userInstruction: normalizedInstruction,
        },
      };

      const result = await window.electron.videoProject.editPrompts(
        editSceneRequest.segments,
        editSceneRequest.options
      );

      if (result.success && result.segments?.length) {
        const editedSegment = result.segments[0];

        if (targetSegment.assetType === 'video_frame_animate') {
          const hasFirstFrame = editedSegment?.firstFrame != null;
          const hasAnimateFrame = editedSegment?.animateFrame != null;
          if (!hasFirstFrame && !hasAnimateFrame) return;

          const nextFirstFrame = hasFirstFrame
            ? (typeof editedSegment.firstFrame === 'string'
              ? editedSegment.firstFrame
              : String(editedSegment.firstFrame))
            : String(targetSegment.firstFrame || '');
          const nextAnimateFrame = hasAnimateFrame
            ? (typeof editedSegment.animateFrame === 'string'
              ? editedSegment.animateFrame
              : String(editedSegment.animateFrame))
            : String(targetSegment.animateFrame || '');

          let translatedFirstFrame: string | undefined;
          let translatedAnimateFrame: string | undefined;
          if (window.electron?.videoProject?.translateScenePrompt) {
            try {
              const translationResult = await window.electron.videoProject.translateScenePrompt({
                sourceVariant: 'original',
                fields: {
                  firstFrame: nextFirstFrame,
                  animateFrame: nextAnimateFrame,
                },
              });

              if (translationResult?.success && translationResult?.translatedFields) {
                if (typeof translationResult.translatedFields.firstFrame === 'string') {
                  translatedFirstFrame = translationResult.translatedFields.firstFrame;
                }
                if (typeof translationResult.translatedFields.animateFrame === 'string') {
                  translatedAnimateFrame = translationResult.translatedFields.animateFrame;
                }
              }
            } catch (translationError) {
              console.error('Immediate translation error (video_frame_animate):', translationError);
            }
          }

          setProject(prev => ({
            ...prev,
            segments: prev.segments.map(seg =>
              seg.id === segmentId
                ? {
                    ...seg,
                    ...(hasFirstFrame
                      ? {
                          firstFrame: nextFirstFrame,
                        }
                      : {}),
                    ...(hasAnimateFrame
                      ? {
                          animateFrame: nextAnimateFrame,
                        }
                      : {}),
                    ...(translatedFirstFrame !== undefined
                      ? { firstFrameTraduzido: translatedFirstFrame }
                      : {}),
                    ...(translatedAnimateFrame !== undefined
                      ? { animateFrameTraduzido: translatedAnimateFrame }
                      : {}),
                  }
                : seg
            ),
          }));
          return;
        }

        const updatedPrompt = editedSegment?.imagePrompt;
        const hasCharacters = editedSegment?.IdOfTheCharactersInTheScene !== undefined;
        const hasLocation = editedSegment?.IdOfTheLocationInTheScene !== undefined;
        if (updatedPrompt == null && !hasCharacters && !hasLocation) return;

        const normalizedUpdatedPrompt = normalizePromptForSummary(updatedPrompt);
        let translatedImagePrompt: string | undefined;
        if (normalizedUpdatedPrompt && window.electron?.videoProject?.translateScenePrompt) {
          try {
            const translationResult = await window.electron.videoProject.translateScenePrompt({
              text: normalizedUpdatedPrompt,
              sourceVariant: 'original',
              field: 'imagePrompt',
            });

            if (translationResult?.success && typeof translationResult?.translatedText === 'string') {
              translatedImagePrompt = translationResult.translatedText;
            }
          } catch (translationError) {
            console.error('Immediate translation error (imagePrompt):', translationError);
          }
        }

        setProject(prev => ({
          ...prev,
          segments: prev.segments.map(seg =>
            seg.id === segmentId
              ? {
                  ...seg,
                  ...(updatedPrompt != null ? { imagePrompt: updatedPrompt } : {}),
                  ...(translatedImagePrompt !== undefined
                    ? { imagePromptTraduzido: translatedImagePrompt }
                    : {}),
                  ...(hasCharacters ? { IdOfTheCharactersInTheScene: editedSegment.IdOfTheCharactersInTheScene } : {}),
                  ...(hasLocation ? { IdOfTheLocationInTheScene: editedSegment.IdOfTheLocationInTheScene } : {}),
                }
              : seg
          ),
        }));

        if (updatedPrompt != null) {
          summarizeScenePrompts([{ id: segmentId, imagePrompt: updatedPrompt }]).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Single scene analysis error:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [normalizePromptForSummary, project.segments, selectedProvider, selectedModel, summarizeScenePrompts]);

  // Handler explícito para gerar Apenas First Frame na UI
  const handleGenerateFirstFrameOnly = useCallback(async () => {
    setIsProcessing(true);
    try {
      if (!window.electron?.videoProject?.generateFirstFramePrompts) return;

      const payload = project.segments
        .map(segment => {
          const normalizedPrompt = normalizePromptForSummary(segment.imagePrompt);
          if (!normalizedPrompt) return null;
          return { id: segment.id, imagePrompt: normalizedPrompt };
        })
        .filter((segment): segment is { id: number; imagePrompt: string } => segment !== null);

      if (payload.length === 0) return;

      const firstFrameResult = await window.electron.videoProject.generateFirstFramePrompts(payload, {
        provider: selectedProvider,
        model: selectedModel,
      });

      if (firstFrameResult?.success && Array.isArray(firstFrameResult.segments)) {
        const firstFrameById = new Map<number, string>();
        firstFrameResult.segments.forEach((segment: any) => {
          if (segment?.id == null || typeof segment.firstFrame !== 'string') return;
          const normalizedFirstFrame = segment.firstFrame.trim();
          if (!normalizedFirstFrame) return;
          firstFrameById.set(segment.id, normalizedFirstFrame);
        });

        if (firstFrameById.size > 0) {
          setProject(prev => ({
            ...prev,
            segments: prev.segments.map(seg => {
              const firstFrame = firstFrameById.get(seg.id);
              if (!firstFrame) return seg;
              return { ...seg, firstFrame };
            }),
          }));
        }
      }
    } catch (err) {
      console.error('Explicit first frame generation error:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [project.segments, normalizePromptForSummary, selectedProvider, selectedModel]);

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
    const hasPrompt = normalizePromptForSummary(prompt).length > 0;

    setProject(prev => ({
      ...prev,
      segments: prev.segments.map(seg =>
        seg.id === segmentId
          ? {
              ...seg,
              imagePrompt: prompt,
              ...(hasPrompt ? {} : { sceneDescription: undefined }),
            }
          : seg
      ),
    }));

    scheduleSingleSceneSummary(segmentId, prompt);
  }, [normalizePromptForSummary, scheduleSingleSceneSummary]);

  // Handler para mover palavras entre segmentos
  const handleMoveWords = useCallback((fromSegmentId: number, toSegmentId: number, wordIndices: number[]) => {
    setProject(prev => {
      const newSegments = JSON.parse(JSON.stringify(prev.segments)); // deep copy 
      
      const fromSeg = newSegments.find((s: any) => s.id === fromSegmentId);
      const toSeg = newSegments.find((s: any) => s.id === toSegmentId);
      
      if (!fromSeg || !toSeg || !fromSeg.words || !toSeg.words) return prev;

      // Extract words to move
      const wordsToMove = wordIndices.map(i => fromSeg.words[i]);
      
      // Remove from fromSeg
      fromSeg.words = fromSeg.words.filter((_: any, i: number) => !wordIndices.includes(i));
      
      // Add to toSeg
      toSeg.words = [...toSeg.words, ...wordsToMove].sort((a: any, b: any) => a.start - b.start);
      
      // Update text, start, end for fromSeg
      if (fromSeg.words.length > 0) {
        fromSeg.start = fromSeg.words[0].start;
        fromSeg.end = fromSeg.words[fromSeg.words.length - 1].end;
        fromSeg.text = fromSeg.words.map((w: any) => w.punctuatedWord || w.word).join(' ');
      } else {
        fromSeg.start = 0;
        fromSeg.end = 0;
        fromSeg.text = '';
      }
      
      // Update text, start, end for toSeg
      if (toSeg.words.length > 0) {
        toSeg.start = toSeg.words[0].start;
        toSeg.end = toSeg.words[toSeg.words.length - 1].end;
        toSeg.text = toSeg.words.map((w: any) => w.punctuatedWord || w.word).join(' ');
      }

      // Filter out empty segments to keep it clean
      const finalSegments = newSegments.filter((s: any) => s.words && s.words.length > 0);
      
      // Re-sort segments 
      finalSegments.sort((a: any, b: any) => a.start - b.start);

      return {
        ...prev,
        segments: finalSegments
      };
    });
  }, []);

  // Handler para atualizar imagem de um segmento (upload manual ou gerada)
  const handleUpdateImage = useCallback((segmentId: number, imageUrl: string, duration?: number, generationService?: string | null) => {
    setProject(prev => ({
      ...prev,
      segments: prev.segments.map(seg => {
        if (seg.id !== segmentId) return seg;
        
        // O assetType NÃO deve mudar aqui (somente no editor de prompts do ImagesStep).
        const isVideoFile = !!imageUrl && ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v']
          .some(ext => imageUrl.toLowerCase().endsWith(ext));
        
        let newSeg: any = { ...seg, imageUrl };
        if (generationService !== undefined) {
          newSeg.generationService = generationService;
        }

        // Preserva a imagem-base quando o segmento vira vídeo para permitir reutilização
        if (!imageUrl) {
          delete newSeg.sourceImageUrl;
        } else if (isVideoFile) {
          const currentImageIsVideo = !!seg.imageUrl && ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v']
            .some(ext => seg.imageUrl.toLowerCase().endsWith(ext));
          const fallbackSource = !currentImageIsVideo ? seg.imageUrl : undefined;
          newSeg.sourceImageUrl = seg.sourceImageUrl || fallbackSource;
        } else {
          // Sempre que houver imagem estática ativa, ela vira a nova base de referência
          newSeg.sourceImageUrl = imageUrl;
        }

        if (!isVideoFile) {
          // Em imagens/audio, nunca manter asset_duration para nao contaminar ajuste de velocidade.
          delete newSeg.asset_duration;
        } else if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
          newSeg.asset_duration = duration;
        } else if (seg.imageUrl !== imageUrl) {
          // Novo video sem duracao valida: limpa valor antigo para forcar reprobe do metadata.
          delete newSeg.asset_duration;
        }

        newSeg = ensureFlowWatermarkTransform(newSeg, { force: true });
        
        return newSeg;
      }),
    }));
  }, []);

  // Estado para armazenar caminho do vídeo gerado
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [renderTotalSeconds, setRenderTotalSeconds] = useState<number | null>(null);
  const renderStartedAtRef = useRef<number | null>(null);

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
    setRenderTotalSeconds(null);
    renderStartedAtRef.current = Date.now();

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
        const {
          apiKeys,
          mapboxAccessToken,
          mapbox,
          ...safeProjectConfig
        } = (project.config || {}) as Record<string, unknown>;

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
            ...safeProjectConfig,
            width: dims.width,
            height: dims.height,
            fps: 30, // Default 30fps
            fitVideoToScene: project.config?.fitVideoToScene ?? true,
            removeAudioSilences: project.config?.removeAudioSilences ?? false,
            audioSilencePaddingMs: project.config?.audioSilencePaddingMs ?? 250,
            mainAudioVolume: project.config?.mainAudioVolume ?? 1.0,
            ...(Array.isArray(project.config?.audioMutedRanges) && {
              audioMutedRanges: project.config?.audioMutedRanges,
            }),
          }
        });

        if (result.success && result.outputPath) {
          outputPaths.push(result.outputPath);
        } else {
          throw new Error(result.error || `Render failed for ${ratio}`);
        }
      }

      if (outputPaths.length > 0) {
        const totalSeconds = renderStartedAtRef.current
          ? Math.max(0, Math.round((Date.now() - renderStartedAtRef.current) / 1000))
          : null;

        setRenderTotalSeconds(totalSeconds);
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
      renderStartedAtRef.current = null;
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
            onContinue={project.segments.length > 0 ? () => setCurrentStep('keyframes') : undefined}
            currentAudio={{ file: project.audioFile, path: project.audioPath }}
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
            onContinue={() => setCurrentStep('images')}
            onBack={() => setCurrentStep('upload')}
            onMoveWords={handleMoveWords}
            onSegmentsUpdate={(newSegments) => setProject(prev => ({ ...prev, segments: newSegments }))}
            niche={selectedNiche}
          />
        );
      
      case 'images':
        return (
          <ImagesStep
            segments={project.segments}
            projectTitle={project.title}
            storyReferences={project.storyReferences}
            onStoryReferencesChange={handleStoryReferencesChange}
            onUpdatePrompt={handleUpdatePrompt}
            onUpdateImage={handleUpdateImage}
            onContinue={() => setCurrentStep('preview')}
            onBack={() => setCurrentStep('keyframes')}
            provider={selectedProvider}
            onProviderChange={(p: any) => {
              setSelectedProvider(p);
              if (p === 'gemini') setSelectedModel('gemini-3-flash-preview');
              else if (p === 'gemini_scraping') setSelectedModel('gemini-web-auto');
              else if (p === 'openai') setSelectedModel('gpt-5-mini-2025-08-07');
              else if (p === 'deepseek') setSelectedModel('deepseek-chat');
            }}
            providerModel={selectedModel}
            onProviderModelChange={(m: string) => setSelectedModel(m)}
            onOpenProject={() => {
              loadProjectsList();
              setShowProjectsModal(true);
            }}
            onSaveProject={handleSaveProject}
            canSaveProject={project.segments.length > 0}
            onAnalyze={handleAnalyzeWithAI}
            onAnalyzeScene={handleAnalyzeSingleSceneWithAI}
            isProcessing={isProcessing}
            onSegmentsUpdate={(newSegments) => setProject(prev => ({ ...prev, segments: newSegments }))}
            niche={selectedNiche}
            onGenerateFirstFrame={handleGenerateFirstFrameOnly}
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
            onSegmentsUpdate={(newSegments) => setProject(prev => ({ ...prev, segments: newSegments }))}
            onSave={handleSaveProject}
            selectedNiche={selectedNiche}
            fitVideoToScene={project.config?.fitVideoToScene ?? true}
            onFitVideoToSceneChange={(val) => setProject(prev => ({
              ...prev,
              config: { ...prev.config, fitVideoToScene: val }
            }))}
            removeAudioSilences={project.config?.removeAudioSilences ?? false}
            onRemoveAudioSilencesChange={(val) => setProject(prev => ({
              ...prev,
              config: { ...prev.config, removeAudioSilences: val }
            }))}
            mainAudioVolume={project.config?.mainAudioVolume ?? 1.0}
            onMainAudioVolumeChange={(val) => setProject(prev => ({
              ...prev,
              config: { ...prev.config, mainAudioVolume: val }
            }))}
            onProjectConfigChange={(updater) => setProject(prev => ({
              ...prev,
              config: updater(prev.config || {}),
            }))}
          />
        );
      
      case 'rendering':
        return <RenderingStep project={project} progress={renderProgress} />;
      
      case 'complete':
        return (
          <CompleteStep 
            outputPath={outputPath}
            renderTotalSeconds={renderTotalSeconds}
            onNewProject={() => {
              setCurrentStep('upload');
              setOutputPath(null);
              setRenderTotalSeconds(null);
              renderStartedAtRef.current = null;
              setProject({
                title: '',
                duration: 0,
                segments: [],
                selectedAspectRatios: ['9:16'],
                storyReferences: createDefaultStoryReferences(),
              });
            }} 
          />
        );
      
      default:
        return null;
    }
  };

  // Preview: tela cheia, sem header nem background
  if (currentStep === 'preview') {
    return (
      <div className="h-full w-full overflow-hidden">
        <PreviewStep
          project={project}
          subtitleMode={subtitleMode}
          setSubtitleMode={setSubtitleMode}
          onContinue={handleStartRender}
          onBack={() => setCurrentStep('images')}
          onAspectRatiosChange={(value) => setProject(prev => ({ ...prev, selectedAspectRatios: value }))}
          onSegmentsUpdate={(newSegments) => setProject(prev => ({ ...prev, segments: newSegments }))}
          onSave={handleSaveProject}
          selectedNiche={selectedNiche}
          fitVideoToScene={project.config?.fitVideoToScene ?? true}
          onFitVideoToSceneChange={(val) => setProject(prev => ({
            ...prev,
            config: { ...prev.config, fitVideoToScene: val }
          }))}
          removeAudioSilences={project.config?.removeAudioSilences ?? false}
          onRemoveAudioSilencesChange={(val) => setProject(prev => ({
            ...prev,
            config: { ...prev.config, removeAudioSilences: val }
          }))}
          mainAudioVolume={project.config?.mainAudioVolume ?? 1.0}
          onMainAudioVolumeChange={(val) => setProject(prev => ({
            ...prev,
            config: { ...prev.config, mainAudioVolume: val }
          }))}
          onProjectConfigChange={(updater) => setProject(prev => ({
            ...prev,
            config: updater(prev.config || {}),
          }))}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
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
              {currentStep !== 'images' && (
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
              )}
            </div>
            
            {/* Progress Steps */}
            <div className="flex items-center gap-2">
              {['upload', 'keyframes', 'images', 'preview', 'rendering'].map((step, index) => (
                <div
                  key={step}
                  className={`w-3 h-3 rounded-full transition-all ${
                    currentStep === step
                      ? 'bg-pink-500 scale-125'
                      : ['upload', 'keyframes', 'images', 'preview', 'rendering'].indexOf(currentStep) > index
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
      <main className={`w-full ${currentStep === 'upload' ? 'mx-auto px-6 py-8 max-w-[100vw]' : 'mx-auto px-6 py-8 max-w-7xl'}`}>
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

