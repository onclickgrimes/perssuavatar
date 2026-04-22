/**
 * Video Studio Page - Hub de Ferramentas
 * 
 * Central de ferramentas para criação e edição de vídeos.
 * Cada ferramenta é acessada através de cards interativos.
 */
import React, { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { AudioToVideoTool } from '../components/video-studio/tools/AudioToVideoTool';
import { ScriptGeneratorTool } from '../components/video-studio/tools/ScriptGeneratorTool';
import { QuizVideoTool } from '../components/video-studio/tools/QuizVideoTool';

interface PreviewWindowToolbar {
  onBack: () => void;
  onSave?: () => void | Promise<void>;
  onExport: () => void;
  canSave: boolean;
  isSaving: boolean;
}

type AnalysisProvider = 'gemini' | 'gemini_scraping' | 'openai' | 'deepseek';

interface ToolbarSelectOption {
  value: string;
  label: string;
}

interface ImagesWindowToolbar {
  provider: AnalysisProvider;
  onProviderChange?: (provider: AnalysisProvider) => void;
  providerModel?: string;
  onProviderModelChange?: (model: string) => void;
  providerModelOptions: ToolbarSelectOption[];
  onOpenProject?: () => void;
  onSaveProject?: () => void | Promise<void>;
  canSaveProject: boolean;
  isSavingProject: boolean;
  onBack: () => void;
  onAnalyze?: () => void | Promise<void>;
  hasPrompts: boolean;
  isAiBusy: boolean;
  analyzeLabel: string;
  onOpenCharactersLocations: () => void;
  onContinue: () => void;
  canContinue: boolean;
}

// Definição das ferramentas disponíveis
interface VideoTool {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  status: 'available' | 'coming_soon' | 'beta';
  category: 'creation' | 'editing' | 'ai';
}

const VIDEO_TOOLS: VideoTool[] = [
  {
    id: 'audio-to-video',
    name: 'Áudio para Vídeo',
    description: 'Crie vídeos a partir de áudio com transcrição automática e geração de imagens por IA.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="22" />
        <path d="m22 8-6 4 6 4V8Z" strokeLinejoin="round" />
        <rect x="2" y="8" width="10" height="8" rx="1" />
      </svg>
    ),
    gradient: 'from-pink-500 via-purple-500 to-indigo-500',
    status: 'available',
    category: 'creation',
  },
  {
    id: 'script-generator',
    name: 'Gerador de Roteiros',
    description: 'Crie roteiros profissionais para seus vídeos usando inteligência artificial.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14,2 14,8 20,8" />
        <line x1="16" x2="8" y1="13" y2="13" />
        <line x1="16" x2="8" y1="17" y2="17" />
        <line x1="10" x2="8" y1="9" y2="9" />
      </svg>
    ),
    gradient: 'from-cyan-500 via-blue-500 to-indigo-500',
    status: 'available',
    category: 'ai',
  },
  {
    id: 'quiz-video',
    name: 'Vídeos Quiz',
    description: 'Crie vídeos de quiz interativos com perguntas geradas por IA.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </svg>
    ),
    gradient: 'from-amber-500 via-orange-500 to-red-500',
    status: 'available',
    category: 'creation',
  },
  {
    id: 'silence-remover',
    name: 'Removedor de Silêncios',
    description: 'Remova automaticamente os momentos de silêncio dos seus vídeos.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 10v3a1 1 0 0 0 1 1h3l4 4V5l-4 4H3a1 1 0 0 0-1 1z" />
        <line x1="22" x2="16" y1="9" y2="15" />
        <line x1="16" x2="22" y1="9" y2="15" />
      </svg>
    ),
    gradient: 'from-orange-500 via-red-500 to-pink-500',
    status: 'coming_soon',
    category: 'editing',
  },
  {
    id: 'auto-cuts',
    name: 'Cortes Automáticos',
    description: 'Detecte e gere cortes automaticamente baseados no conteúdo do vídeo.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="6" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <line x1="20" x2="8.12" y1="4" y2="15.88" />
        <line x1="14.47" x2="20" y1="14.48" y2="20" />
        <line x1="8.12" x2="12" y1="8.12" y2="12" />
      </svg>
    ),
    gradient: 'from-green-500 via-emerald-500 to-teal-500',
    status: 'coming_soon',
    category: 'editing',
  },
  {
    id: 'subtitle-generator',
    name: 'Gerador de Legendas',
    description: 'Gere legendas automáticas com estilização personalizada para seus vídeos.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M7 15h4M4 15h1M15 15h5" />
        <path d="M7 11h2M4 11h1M11 11h9" />
      </svg>
    ),
    gradient: 'from-yellow-500 via-amber-500 to-orange-500',
    status: 'coming_soon',
    category: 'creation',
  },
  {
    id: 'thumbnail-creator',
    name: 'Criador de Thumbnails',
    description: 'Crie thumbnails atraentes para seus vídeos com IA generativa.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    ),
    gradient: 'from-violet-500 via-purple-500 to-fuchsia-500',
    status: 'coming_soon',
    category: 'ai',
  },
  {
    id: 'video-resizer',
    name: 'Redimensionador',
    description: 'Adapte seus vídeos para diferentes plataformas e formatos.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 21H3V3" />
        <rect x="7" y="7" width="10" height="10" rx="1" />
        <path d="M21 12V3h-9" />
        <path d="M3 12v9h9" />
      </svg>
    ),
    gradient: 'from-slate-500 via-zinc-500 to-neutral-500',
    status: 'coming_soon',
    category: 'editing',
  },
  {
    id: 'voice-cloner',
    name: 'Clonador de Voz',
    description: 'Clone sua voz e gere narrações em diferentes idiomas.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="22" />
        <path d="M8 22h8" />
        <path d="M20 7c.5.5 1 1.5 1 3s-.5 2.5-1 3" />
        <path d="M17 8c.3.3.5.8.5 1.5s-.2 1.2-.5 1.5" />
      </svg>
    ),
    gradient: 'from-rose-500 via-pink-500 to-red-500',
    status: 'coming_soon',
    category: 'ai',
  },
];

// Categorias
const CATEGORIES = [
  { id: 'all', name: 'Todas', icon: '🎯' },
  { id: 'creation', name: 'Criação', icon: '✨' },
  { id: 'editing', name: 'Edição', icon: '✂️' },
  { id: 'ai', name: 'IA', icon: '🤖' },
];

export default function VideoStudioPage() {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMaximized, setIsMaximized] = useState(false);
  const [previewToolbar, setPreviewToolbar] = useState<PreviewWindowToolbar | null>(null);
  const [imagesToolbar, setImagesToolbar] = useState<ImagesWindowToolbar | null>(null);

  const syncWindowState = useCallback(async () => {
    if (typeof window === 'undefined') return;
    try {
      const maximized = await window.electron?.windowControls?.isMaximized?.();
      if (typeof maximized === 'boolean') {
        setIsMaximized(maximized);
      }
    } catch (error) {
      console.error('Erro ao sincronizar estado da janela:', error);
    }
  }, []);

  useEffect(() => {
    syncWindowState();
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      syncWindowState();
    };
    const handleFocus = () => {
      syncWindowState();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('focus', handleFocus);
    };
  }, [syncWindowState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePreviewToolbar = (event: Event) => {
      const customEvent = event as CustomEvent<PreviewWindowToolbar | null>;
      const next = customEvent.detail ?? null;
      setPreviewToolbar(prev => {
        if (prev === next) return prev;
        if (!prev || !next) return next;

        const isSame =
          prev.onBack === next.onBack &&
          prev.onSave === next.onSave &&
          prev.onExport === next.onExport &&
          prev.canSave === next.canSave &&
          prev.isSaving === next.isSaving;

        return isSame ? prev : next;
      });
    };

    window.addEventListener('video-studio:preview-toolbar', handlePreviewToolbar as EventListener);
    return () => {
      window.removeEventListener('video-studio:preview-toolbar', handlePreviewToolbar as EventListener);
      setPreviewToolbar(null);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleImagesToolbar = (event: Event) => {
      const customEvent = event as CustomEvent<ImagesWindowToolbar | null>;
      const next = customEvent.detail ?? null;
      setImagesToolbar(prev => {
        if (prev === next) return prev;
        if (!prev || !next) return next;

        const isSameModelOptions =
          prev.providerModelOptions.length === next.providerModelOptions.length
          && prev.providerModelOptions.every((option, index) => {
            const nextOption = next.providerModelOptions[index];
            return Boolean(nextOption)
              && option.value === nextOption.value
              && option.label === nextOption.label;
          });

        const isSame =
          prev.provider === next.provider &&
          prev.onProviderChange === next.onProviderChange &&
          prev.providerModel === next.providerModel &&
          prev.onProviderModelChange === next.onProviderModelChange &&
          isSameModelOptions &&
          prev.onOpenProject === next.onOpenProject &&
          prev.onSaveProject === next.onSaveProject &&
          prev.canSaveProject === next.canSaveProject &&
          prev.isSavingProject === next.isSavingProject &&
          prev.onBack === next.onBack &&
          prev.onAnalyze === next.onAnalyze &&
          prev.hasPrompts === next.hasPrompts &&
          prev.isAiBusy === next.isAiBusy &&
          prev.analyzeLabel === next.analyzeLabel &&
          prev.onOpenCharactersLocations === next.onOpenCharactersLocations &&
          prev.onContinue === next.onContinue &&
          prev.canContinue === next.canContinue;

        return isSame ? prev : next;
      });
    };

    window.addEventListener('video-studio:images-toolbar', handleImagesToolbar as EventListener);
    return () => {
      window.removeEventListener('video-studio:images-toolbar', handleImagesToolbar as EventListener);
      setImagesToolbar(null);
    };
  }, []);

  useEffect(() => {
    if (activeTool !== 'audio-to-video') {
      setPreviewToolbar(prev => (prev ? null : prev));
      setImagesToolbar(prev => (prev ? null : prev));
    }
  }, [activeTool]);

  const handleMinimizeWindow = useCallback(async () => {
    try {
      await window.electron?.windowControls?.minimize?.();
    } catch (error) {
      console.error('Erro ao minimizar janela:', error);
    }
  }, []);

  const handleToggleMaximize = useCallback(async () => {
    try {
      const maximized = await window.electron?.windowControls?.toggleMaximize?.();
      if (typeof maximized === 'boolean') {
        setIsMaximized(maximized);
      } else {
        syncWindowState();
      }
    } catch (error) {
      console.error('Erro ao alternar maximização da janela:', error);
    }
  }, [syncWindowState]);

  const handleCloseWindow = useCallback(async () => {
    try {
      await window.electron?.windowControls?.close?.();
    } catch (error) {
      console.error('Erro ao fechar janela:', error);
    }
  }, []);

  // Filtrar ferramentas
  const filteredTools = VIDEO_TOOLS.filter(tool => {
    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
    const matchesSearch = tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const activeToolContent = (() => {
    switch (activeTool) {
      case 'audio-to-video':
        return <AudioToVideoTool onBack={() => setActiveTool(null)} />;
      case 'script-generator':
        return <ScriptGeneratorTool onBack={() => setActiveTool(null)} />;
      case 'quiz-video':
        return <QuizVideoTool onBack={() => setActiveTool(null)} />;
      default:
        return null;
    }
  })();
  const showPreviewToolbar = Boolean(previewToolbar);
  const showImagesToolbar = Boolean(imagesToolbar) && !showPreviewToolbar;

  return (
    <>
      <Head>
        <title>Video Studio | Avatar AI</title>
      </Head>
      <div className="h-screen bg-[#0a0a0f] text-white flex flex-col overflow-hidden">
        {/* Custom Window Titlebar */}
        <div
          className="window-drag h-11 flex-shrink-0 border-b border-white/10 bg-black/50 backdrop-blur-xl relative z-[100] select-none"
          onDoubleClick={handleToggleMaximize}
        >
          <div className="h-full px-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center gap-2 text-white/70 text-sm">
                <div className="w-5 h-5 rounded-md bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="m22 8-6 4 6 4V8Z" />
                    <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
                  </svg>
                </div>
                <span className="font-medium tracking-wide">Video Studio</span>
              </div>

              {showImagesToolbar && imagesToolbar && (
                <div
                  className="no-drag flex items-center gap-2 ml-2 pl-3 border-l border-white/10 min-w-0"
                  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                  <select
                    value={imagesToolbar.provider}
                    onChange={(e) => imagesToolbar.onProviderChange?.(e.target.value as AnalysisProvider)}
                    className="h-8 bg-black/40 border border-white/15 rounded-md px-2 text-[12px] text-white focus:border-pink-500 focus:outline-none"
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="gemini_scraping">Gemini (Scraping)</option>
                    <option value="openai">OpenAI</option>
                    <option value="deepseek">DeepSeek V3</option>
                  </select>

                  {imagesToolbar.onProviderModelChange && imagesToolbar.providerModelOptions.length > 0 && (
                    <>
                      <select
                        value={imagesToolbar.providerModel || ''}
                        onChange={(e) => imagesToolbar.onProviderModelChange?.(e.target.value)}
                        className="h-8 max-w-[230px] bg-black/40 border border-white/15 rounded-md px-2 text-[12px] text-white focus:border-pink-500 focus:outline-none"
                      >
                        {imagesToolbar.providerModelOptions.map(option => (
                          <option key={`${imagesToolbar.provider}-${option.value}`} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </>
                  )}

                  {imagesToolbar.onOpenProject && (
                    <button
                      onClick={imagesToolbar.onOpenProject}
                      className="h-8 px-3 rounded-md text-[12px] font-medium bg-white/10 hover:bg-white/20 text-white transition-colors whitespace-nowrap"
                      title="Abrir projeto"
                    >
                      📂 Abrir
                    </button>
                  )}

                  {imagesToolbar.canSaveProject && imagesToolbar.onSaveProject && (
                    <button
                      onClick={imagesToolbar.onSaveProject}
                      disabled={imagesToolbar.isSavingProject}
                      className="h-8 px-3 rounded-md text-[12px] font-medium bg-white/10 hover:bg-white/20 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors whitespace-nowrap"
                      title="Salvar projeto"
                    >
                      {imagesToolbar.isSavingProject ? 'Salvando...' : '💾 Salvar'}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="no-drag flex items-center gap-2 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              {showImagesToolbar && imagesToolbar && (
                <div className="flex items-center gap-2 pr-2 border-r border-white/10">
                  <button
                    onClick={imagesToolbar.onBack}
                    className="h-8 px-3 rounded-md text-[12px] font-medium bg-white/10 hover:bg-white/20 text-white transition-colors whitespace-nowrap"
                  >
                    Voltar
                  </button>
                  {imagesToolbar.onAnalyze && (
                    <button
                      onClick={imagesToolbar.onAnalyze}
                      disabled={imagesToolbar.isAiBusy}
                      className={`h-8 px-3 rounded-md text-[12px] font-medium border transition-colors whitespace-nowrap ${
                        imagesToolbar.hasPrompts
                          ? 'bg-white/5 hover:bg-white/10 text-white border-white/20'
                          : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500'
                      } ${imagesToolbar.isAiBusy ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                      {imagesToolbar.analyzeLabel}
                    </button>
                  )}
                  <button
                    onClick={imagesToolbar.onOpenCharactersLocations}
                    className="h-8 px-3 rounded-md text-[12px] font-medium bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 transition-colors whitespace-nowrap"
                  >
                    📸 Personagens e Lugares
                  </button>
                  <button
                    onClick={imagesToolbar.onContinue}
                    disabled={!imagesToolbar.canContinue}
                    className={`h-8 px-3 rounded-md text-[12px] font-semibold transition-colors whitespace-nowrap ${
                      !imagesToolbar.canContinue
                        ? 'bg-white/5 text-white/30 cursor-not-allowed'
                        : 'bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white'
                    }`}
                  >
                    Preview →
                  </button>
                </div>
              )}

              {showPreviewToolbar && previewToolbar && (
                <div className="flex items-center gap-2 pr-2 border-r border-white/10">
                  <button
                    onClick={previewToolbar.onBack}
                    className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-white/10 hover:bg-white/20 text-white transition-colors"
                    title="Voltar para as imagens"
                  >
                    Voltar
                  </button>
                  {previewToolbar.canSave && previewToolbar.onSave && (
                    <button
                      onClick={previewToolbar.onSave}
                      disabled={previewToolbar.isSaving}
                      className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-white/10 hover:bg-white/20 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors"
                      title="Salvar projeto"
                    >
                      {previewToolbar.isSaving ? 'Salvando...' : 'Salvar'}
                    </button>
                  )}
                  <button
                    onClick={previewToolbar.onExport}
                    className="px-3.5 py-1.5 rounded-md text-[12px] font-semibold bg-cyan-400 hover:bg-cyan-300 bg-green-400/80 text-black transition-colors"
                    title="Exportar vídeo"
                  >
                    Exportar
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1">
              <button
                onClick={handleMinimizeWindow}
                className="w-8 h-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center"
                title="Minimizar"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>

              <button
                onClick={handleToggleMaximize}
                className="w-8 h-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center"
                title={isMaximized ? 'Restaurar' : 'Maximizar'}
              >
                {isMaximized ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="7" y="7" width="10" height="10" />
                    <path d="M7 11H5V5h6v2" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="5" y="5" width="14" height="14" />
                  </svg>
                )}
              </button>

              <button
                onClick={handleCloseWindow}
                className="w-8 h-8 rounded-lg text-red-300 hover:text-white hover:bg-red-500 transition-colors flex items-center justify-center"
                title="Fechar"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              </div>
            </div>
          </div>
        </div>

        <div className={showPreviewToolbar ? 'flex-1 overflow-hidden' : 'video-studio-scrollbar flex-1 overflow-y-auto'}>
          {activeToolContent ? (
            <div className={showPreviewToolbar ? 'h-full' : 'min-h-full'}>
              {activeToolContent}
            </div>
          ) : (
            <div className="min-h-full bg-[#0a0a0f] text-white">
              {/* Background Effects */}
              <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-purple-500/10 via-transparent to-transparent rounded-full blur-3xl" />
          <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-pink-500/10 via-transparent to-transparent rounded-full blur-3xl" />
          <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 rounded-full blur-3xl" />
              </div>

        {/* Header */}
        <header className="relative z-10 border-b border-white/5">
          <div className="max-w-7xl mx-auto px-6 py-6">
            <div className="flex items-center justify-between">
              {/* Logo & Title */}
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-br from-pink-500 to-purple-600 rounded-2xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
                  <div className="relative w-14 h-14 bg-gradient-to-br from-pink-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-xl">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <path d="m22 8-6 4 6 4V8Z" />
                      <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
                    </svg>
                  </div>
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">
                    Video Studio
                  </h1>
                  <p className="text-sm text-white/40 mt-0.5">
                    Central de ferramentas para criação de vídeos
                  </p>
                </div>
              </div>

              {/* Search */}
              <div className="flex-1 max-w-md mx-8">
                <div className="relative">
                  <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" x2="16.65" y1="21" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Buscar ferramentas..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all"
                  />
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-2xl font-bold text-white">{VIDEO_TOOLS.filter(t => t.status === 'available').length}</p>
                  <p className="text-xs text-white/40">Disponíveis</p>
                </div>
                <div className="w-px h-10 bg-white/10" />
                <div className="text-right">
                  <p className="text-2xl font-bold text-purple-400">{VIDEO_TOOLS.filter(t => t.status === 'coming_soon').length}</p>
                  <p className="text-xs text-white/40">Em breve</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Category Filter */}
        <div className="relative z-10 border-b border-white/5">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                    selectedCategory === cat.id
                      ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-white border border-purple-500/30'
                      : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-transparent'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="relative z-10 max-w-7xl mx-auto px-6 py-8">
          {/* Tools Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredTools.map((tool) => (
              <button
                key={tool.id}
                onClick={() => tool.status === 'available' && setActiveTool(tool.id)}
                disabled={tool.status !== 'available'}
                className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 text-left ${
                  tool.status === 'available'
                    ? 'bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.06] cursor-pointer hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/10'
                    : 'bg-white/[0.02] border-white/5 cursor-not-allowed opacity-60'
                }`}
              >
                {/* Gradient Background (on hover) */}
                {tool.status === 'available' && (
                  <div className={`absolute inset-0 bg-gradient-to-br ${tool.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-500`} />
                )}

                {/* Content */}
                <div className="relative p-6">
                  {/* Icon */}
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${tool.gradient} p-0.5 mb-4`}>
                    <div className="w-full h-full bg-[#0a0a0f] rounded-[10px] flex items-center justify-center text-white">
                      {tool.icon}
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-white/80 group-hover:bg-clip-text transition-all">
                    {tool.name}
                  </h3>
                  <p className="text-sm text-white/40 leading-relaxed line-clamp-2">
                    {tool.description}
                  </p>

                  {/* Status Badge */}
                  <div className="mt-4 flex items-center justify-between">
                    {tool.status === 'available' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 text-green-400 text-xs font-medium rounded-full border border-green-500/20">
                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                        Disponível
                      </span>
                    ) : tool.status === 'beta' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-yellow-500/10 text-yellow-400 text-xs font-medium rounded-full border border-yellow-500/20">
                        <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full" />
                        Beta
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/5 text-white/40 text-xs font-medium rounded-full border border-white/10">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12,6 12,12 16,14" />
                        </svg>
                        Em breve
                      </span>
                    )}

                    {/* Arrow */}
                    {tool.status === 'available' && (
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 group-hover:bg-white/10 group-hover:text-white transition-all">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Empty State */}
          {filteredTools.length === 0 && (
            <div className="text-center py-20">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-white/5 flex items-center justify-center">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/20">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" x2="16.65" y1="21" y2="16.65" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white/60 mb-2">Nenhuma ferramenta encontrada</h3>
              <p className="text-white/40">Tente ajustar os filtros ou buscar por outro termo.</p>
            </div>
          )}

          {/* Coming Soon Section */}
          <div className="mt-16 p-8 rounded-3xl bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-transparent border border-white/5">
            <div className="flex items-start gap-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white mb-2">Mais ferramentas chegando em breve</h2>
                <p className="text-white/50 mb-4 max-w-2xl">
                  Estamos trabalhando em novas ferramentas poderosas para ajudar você a criar conteúdo incrível. 
                  Fique ligado para atualizações!
                </p>
                <div className="flex items-center gap-4">
                  <div className="flex -space-x-2">
                    {['🎬', '✂️', '🎨', '🎤'].map((emoji, i) => (
                      <div key={i} className="w-8 h-8 rounded-full bg-white/10 border-2 border-[#0a0a0f] flex items-center justify-center text-sm">
                        {emoji}
                      </div>
                    ))}
                  </div>
                  <span className="text-sm text-white/40">+{VIDEO_TOOLS.filter(t => t.status !== 'available').length} ferramentas em desenvolvimento</span>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="relative z-10 border-t border-white/5 mt-auto">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between text-sm text-white/30">
              <p>Video Studio v2.0</p>
              <p>Avatar AI © 2026</p>
            </div>
          </div>
        </footer>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
