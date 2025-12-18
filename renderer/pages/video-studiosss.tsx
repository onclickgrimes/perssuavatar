/**
 * Video Studio - Editor de Vídeo com Timeline
 * 
 * Interface completa de edição de vídeo após upload de áudio
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Head from 'next/head';
import { VideoPreview } from '../components/VideoPreview';
import type { VideoProject } from '../../remotion/types/project';

// Interfaces
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
  audioPath: string;
  duration: number;
  segments: TranscriptionSegment[];
  editingStyle?: string;
  authorConclusion?: string;
}

export default function VideoStudio() {
  // Estados principais
  const [project, setProject] = useState<ProjectState | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Estados para gerenciamento de projetos
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [savedProjects, setSavedProjects] = useState<any[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

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

  // Handler para carregar projeto
  const handleLoadProject = useCallback(async (filePath: string) => {
    try {
      const result = await window.electron.videoProject.load(filePath);
      
      if (result.success && result.project) {
        const loadedProject = result.project;
        
        const newProject: ProjectState = {
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
            assetType: seg.assetType,
            cameraMovement: seg.cameraMovement || 'static',
            transition: seg.transition || 'fade',
          })),
          authorConclusion: loadedProject.authorConclusion || '',
          editingStyle: loadedProject.editingStyle || '',
        };
        
        setProject(newProject);
        setShowProjectsModal(false);
      }
    } catch (error) {
      console.error('Error loading project:', error);
      setError('Erro ao carregar projeto');
    }
  }, []);

  // Handler para salvar projeto
  const handleSaveProject = useCallback(async () => {
    if (!project || !project.title) return;
    
    try {
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
          assetType: seg.assetType,
          cameraMovement: seg.cameraMovement,
          transition: seg.transition,
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
  }, [project]);

  // Handler para upload de áudio
  const handleAudioUpload = useCallback(async (file: File) => {
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

      // Criar projeto com dados da transcrição
      const newProject: ProjectState = {
        title: file.name.replace(/\.[^/.]+$/, ''),
        audioPath: saveResult.path,
        duration: transcriptionResult.duration,
        segments: transcriptionResult.segments.map((seg: any) => ({
          id: seg.id,
          text: seg.text,
          start: seg.start,
          end: seg.end,
          speaker: seg.speaker,
          emotion: undefined,
          imagePrompt: undefined,
          imageUrl: undefined,
          cameraMovement: 'static',
          transition: 'fade',
        })),
        editingStyle: '',
        authorConclusion: '',
      };

      setProject(newProject);
    } catch (err) {
      console.error('Upload/transcription error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao transcrever áudio');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Se não tem projeto, mostrar upload
  if (!project) {
    return (
      <>
        <AudioUploadScreen 
          onUpload={handleAudioUpload}
          isProcessing={isProcessing}
          error={error}
          onOpenProjects={() => {
            loadProjectsList();
            setShowProjectsModal(true);
          }}
        />
        
        {/* Projects Modal */}
        {showProjectsModal && (
          <ProjectsModal
            projects={savedProjects}
            isLoading={isLoadingProjects}
            onClose={() => setShowProjectsModal(false)}
            onLoadProject={handleLoadProject}
          />
        )}
      </>
    );
  }

  // Editor principal
  return (
    <>
      <Head>
        <title>Video Studio - Editor</title>
      </Head>
      
      <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
        {/* Header */}
        <Header project={project} onSave={handleSaveProject} />
        
        {/* Main Content - Flex container que ocupa o resto da tela */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left Sidebar - Biblioteca de Mídia */}
          <MediaLibrary 
            segments={project.segments}
            onSelectSegment={setSelectedSegmentId}
          />
          
          {/* Center - Preview + Timeline - Flex vertical */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Preview - 50% da altura ou min 300px */}
            <div className="flex-shrink-0 h-1/2 min-h-[300px] max-h-[600px]">
              <PreviewPanel 
                project={project}
              />
            </div>
            
            {/* Timeline - Resto do espaço */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <Timeline 
                project={project}
                currentTime={currentTime}
                selectedSegmentId={selectedSegmentId}
                zoom={zoom}
                onTimeClick={setCurrentTime}
                onSegmentSelect={setSelectedSegmentId}
                onSegmentUpdate={(id, updates) => {
                  setProject(prev => prev ? {
                    ...prev,
                    segments: prev.segments.map(seg => 
                      seg.id === id ? { ...seg, ...updates } : seg
                    )
                  } : null);
                }}
              />
            </div>
          </div>
          
          {/* Right Sidebar - Propriedades */}
          <PropertiesPanel 
            segment={project.segments.find(s => s.id === selectedSegmentId)}
            onUpdate={(updates) => {
              if (selectedSegmentId) {
                setProject(prev => prev ? {
                  ...prev,
                  segments: prev.segments.map(seg => 
                    seg.id === selectedSegmentId ? { ...seg, ...updates } : seg
                  )
                } : null);
              }
            }}
          />
        </div>
      </div>
    </>
  );
}

// ========================================
// AUDIO UPLOAD SCREEN
// ========================================

function AudioUploadScreen({ 
  onUpload,
  isProcessing,
  error,
  onOpenProjects
}: { 
  onUpload: (file: File) => void;
  isProcessing: boolean;
  error: string | null;
  onOpenProjects: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        {/* Header com botão Abrir */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-5xl font-bold text-white mb-4">
              Video Studio
            </h1>
            <p className="text-xl text-gray-300">
              Crie vídeos incríveis a partir de áudio
            </p>
          </div>
          
          <button
            onClick={onOpenProjects}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all flex items-center gap-2 font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
            </svg>
            Abrir Projeto
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-300">
            {error}
          </div>
        )}

        {/* Loading State */}
        {isProcessing ? (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-12 border border-white/20">
            <div className="flex flex-col items-center justify-center h-64">
              <div className="w-16 h-16 mb-6 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
              <p className="text-xl text-white/80">Transcrevendo áudio...</p>
              <p className="text-sm text-white/50 mt-2">Isso pode levar alguns momentos</p>
            </div>
          </div>
        ) : (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-12 border border-white/20">
            <label 
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                isDragging 
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-white/30 hover:border-purple-500 hover:bg-white/5'
              }`}
            >
              <div className="flex flex-col items-center">
                <svg className="w-16 h-16 text-purple-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <p className="text-white text-lg mb-2">Arraste seu áudio aqui</p>
                <p className="text-gray-400 text-sm">ou clique para selecionar</p>
                <p className="text-gray-500 text-xs mt-2">MP3, WAV, M4A, OGG</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================
// HEADER
// ========================================

function Header({ 
  project,
  onSave
}: { 
  project: ProjectState;
  onSave: () => void;
}) {
  return (
    <header className="h-16 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold">Video Studio</h1>
        <span className="text-gray-400">|</span>
        <span className="text-white">{project.title}</span>
      </div>
      
      <div className="flex items-center gap-3">
        <button 
          onClick={onSave}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          Salvar
        </button>
        <button className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg font-medium transition-colors">
          Renderizar
        </button>
      </div>
    </header>
  );
}

// ========================================
// MEDIA LIBRARY
// ========================================

function MediaLibrary({ 
  segments, 
  onSelectSegment 
}: { 
  segments: TranscriptionSegment[];
  onSelectSegment: (id: number) => void;
}) {
  return (
    <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold">Cenas</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {segments.map((segment) => (
          <div
            key={segment.id}
            onClick={() => onSelectSegment(segment.id)}
            className="bg-gray-700 hover:bg-gray-600 rounded-lg p-3 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono text-purple-400">
                Cena {segment.id}
              </span>
              <span className="text-xs text-gray-400">
                {segment.start.toFixed(1)}s - {segment.end.toFixed(1)}s
              </span>
            </div>
            <p className="text-sm text-gray-300 line-clamp-2">{segment.text}</p>
            {segment.imageUrl && (
              <div className="mt-2 h-16 bg-gray-600 rounded overflow-hidden">
                <img src={segment.imageUrl} alt="" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ========================================
// PREVIEW PANEL
// ========================================

function PreviewPanel({
  project,
}: {
  project: ProjectState;
}) {
  // Converter ProjectState para VideoProject (formato do Remotion)
  const remotionProject: VideoProject = useMemo(() => {
    const fps = 30;
    
    // Converter path para HTTP URL do servidor local (porta 9999)
    const convertToHttpUrl = (filePath: string | undefined): string | undefined => {
      if (!filePath) return undefined;
      
      // Se já é uma URL HTTP, retornar como está
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        return filePath;
      }
      
      // Extrair apenas o nome do arquivo do path completo
      const fileName = filePath.split(/[\\/]/).pop();
      if (!fileName) return undefined;
      
      // Retornar URL do servidor local na porta 9999
      return `http://localhost:9999/${fileName}`;
    };
    
    const audioUrl = convertToHttpUrl(project.audioPath);
    
    console.log('🔄 Converting audio path to server URL:', {
      original: project.audioPath,
      serverUrl: audioUrl,
    });
    
    return {
      project_title: project.title,
      description: project.description,
      config: {
        width: 1920,
        height: 1080,
        fps,
        backgroundColor: '#000000',
      },
      scenes: project.segments.map((seg, index) => ({
        id: seg.id,
        start_time: seg.start,
        end_time: seg.end,
        transcript_segment: seg.text,
        visual_concept: {
          description: seg.imagePrompt || 'Scene',
          art_style: 'modern',
          emotion: (seg.emotion as any) || 'neutral',
        },
        asset_type: seg.assetType as any || (seg.imageUrl ? 'image_static' : 'solid_color'),
        asset_url: seg.imageUrl,
        camera_movement: (seg.cameraMovement as any) || 'static',
        transition: (seg.transition as any) || 'fade',
        transition_duration: 0.5,
        text_overlay: undefined,
        // Adicionar áudio se disponível (servido via HTTP server local)
        audio: audioUrl ? {
          src: audioUrl,  // ← http://localhost:9999/audio-xxx.wav
          volume: 1,
          useTTS: false,
        } : undefined,
      })),
      schema_version: '1.0',
    };
  }, [project]);

  // Debug log
  useEffect(() => {
    console.log('📹 Preview Project:', remotionProject);
    console.log('🎵 Audio Path:', project.audioPath);
    console.log('📊 Scenes:', remotionProject.scenes.length);
  }, [remotionProject, project.audioPath]);

  return (
    <div className="h-full bg-black flex flex-col">
      {/* Video Preview com Player do Remotion */}
      <div className="flex-1 flex items-center justify-center bg-gray-950 p-4">
        <div className="w-full h-full max-w-6xl max-h-full flex items-center justify-center">
          <VideoPreview 
            project={remotionProject}
            width="100%"
            height="100%"
            autoPlay={false}
            loop={false}
          />
        </div>
      </div>
    </div>
  );
}

// ========================================
// TIMELINE
// ========================================

function Timeline({
  project,
  currentTime,
  selectedSegmentId,
  zoom,
  onTimeClick,
  onSegmentSelect,
  onSegmentUpdate
}: {
  project: ProjectState;
  currentTime: number;
  selectedSegmentId: number | null;
  zoom: number;
  onTimeClick: (time: number) => void;
  onSegmentSelect: (id: number) => void;
  onSegmentUpdate: (id: number, updates: Partial<TranscriptionSegment>) => void;
}) {
  const pixelsPerSecond = 100 * zoom;
  
  return (
    <div className="h-full bg-gray-800 flex flex-col overflow-hidden">
      {/* Timeline Header */}
      <div className="h-12 bg-gray-900 border-b border-gray-700 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold">Timeline</span>
          <div className="flex items-center gap-2">
            <button className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">-</button>
            <span className="text-xs text-gray-400">{Math.round(zoom * 100)}%</span>
            <button className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">+</button>
          </div>
        </div>
      </div>
      
      {/* Timeline Content */}
      <div className="flex-1 overflow-auto relative">
        {/* Ruler */}
        <div className="h-8 bg-gray-900 border-b border-gray-700 sticky top-0 z-10">
          <div className="relative h-full" style={{ width: `${project.duration * pixelsPerSecond}px` }}>
            {Array.from({ length: Math.ceil(project.duration) + 1 }).map((_, i) => (
              <div
                key={i}
                className="absolute top-0 h-full border-l border-gray-600"
                style={{ left: `${i * pixelsPerSecond}px` }}
              >
                <span className="text-xs text-gray-400 ml-1">{i}s</span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Tracks */}
        <div className="relative" style={{ width: `${project.duration * pixelsPerSecond}px` }}>
          {/* Audio Track */}
          <div className="h-16 bg-gray-800 border-b border-gray-700">
            <div className="h-full flex items-center px-2">
              <div className="h-12 w-full bg-blue-900/30 border border-blue-600/50 rounded flex items-center justify-center">
                <span className="text-xs text-blue-400">🎵 Áudio</span>
              </div>
            </div>
          </div>
          
          {/* Video Track */}
          <div className="min-h-24 bg-gray-800">
            {project.segments.map((segment) => {
              const left = segment.start * pixelsPerSecond;
              const width = (segment.end - segment.start) * pixelsPerSecond;
              const isSelected = segment.id === selectedSegmentId;
              
              return (
                <div
                  key={segment.id}
                  onClick={() => onSegmentSelect(segment.id)}
                  className={`absolute h-20 rounded cursor-pointer transition-all ${
                    isSelected 
                      ? 'bg-purple-600 border-2 border-purple-400' 
                      : 'bg-purple-700 border border-purple-500 hover:bg-purple-600'
                  }`}
                  style={{
                    left: `${left}px`,
                    width: `${width}px`,
                    top: '64px'
                  }}
                >
                  <div className="p-2 h-full flex flex-col">
                    <span className="text-xs font-semibold text-white mb-1">
                      Cena {segment.id}
                    </span>
                    <p className="text-xs text-white/80 line-clamp-2 flex-1">
                      {segment.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-20"
          style={{ left: `${currentTime * pixelsPerSecond}px` }}
        >
          <div className="w-3 h-3 bg-red-500 rounded-full -ml-1.5 -mt-1.5" />
        </div>
      </div>
    </div>
  );
}

// ========================================
// PROPERTIES PANEL
// ========================================

function PropertiesPanel({
  segment,
  onUpdate
}: {
  segment?: TranscriptionSegment;
  onUpdate: (updates: Partial<TranscriptionSegment>) => void;
}) {
  if (!segment) {
    return (
      <div className="w-80 bg-gray-800 border-l border-gray-700 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Selecione uma cena</p>
      </div>
    );
  }

  return (
    <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold">Propriedades</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Texto */}
        <div>
          <label className="block text-sm font-medium mb-2">Texto</label>
          <textarea
            value={segment.text}
            onChange={(e) => onUpdate({ text: e.target.value })}
            className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm resize-none"
            rows={3}
          />
        </div>

        {/* Timing */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium mb-2">Início</label>
            <input
              type="number"
              step="0.1"
              value={segment.start}
              onChange={(e) => onUpdate({ start: parseFloat(e.target.value) })}
              className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Fim</label>
            <input
              type="number"
              step="0.1"
              value={segment.end}
              onChange={(e) => onUpdate({ end: parseFloat(e.target.value) })}
              className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm"
            />
          </div>
        </div>

        {/* Camera Movement */}
        <div>
          <label className="block text-sm font-medium mb-2">Movimento de Câmera</label>
          <select
            value={segment.cameraMovement || 'static'}
            onChange={(e) => onUpdate({ cameraMovement: e.target.value })}
            className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm"
          >
            <option value="static">Estático</option>
            <option value="zoom_in_slow">Zoom In Lento</option>
            <option value="zoom_out_slow">Zoom Out Lento</option>
            <option value="pan_left">Pan Esquerda</option>
            <option value="pan_right">Pan Direita</option>
            <option value="ken_burns">Ken Burns</option>
          </select>
        </div>

        {/* Transition */}
        <div>
          <label className="block text-sm font-medium mb-2">Transição</label>
          <select
            value={segment.transition || 'fade'}
            onChange={(e) => onUpdate({ transition: e.target.value })}
            className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm"
          >
            <option value="none">Nenhuma</option>
            <option value="fade">Fade</option>
            <option value="crossfade">Crossfade</option>
            <option value="slide_left">Slide Esquerda</option>
            <option value="slide_right">Slide Direita</option>
          </select>
        </div>

        {/* Media */}
        <div>
          <label className="block text-sm font-medium mb-2">Mídia</label>
          <div className="aspect-video bg-gray-700 rounded-lg overflow-hidden mb-2">
            {segment.imageUrl ? (
              <img src={segment.imageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                Nenhuma mídia
              </div>
            )}
          </div>
          <button className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm transition-colors">
            Alterar Mídia
          </button>
        </div>
      </div>
    </div>
  );
}

// ========================================
// PROJECTS MODAL
// ========================================

function ProjectsModal({
  projects,
  isLoading,
  onClose,
  onLoadProject
}: {
  projects: any[];
  isLoading: boolean;
  onClose: () => void;
  onLoadProject: (path: string) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="p-6 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Meus Projetos</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-gray-400">Carregando...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>Nenhum projeto salvo encontrado.</p>
              <p className="text-sm text-gray-500 mt-2">Crie seu primeiro projeto!</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {projects.map((proj) => (
                <button
                  key={proj.path}
                  onClick={() => onLoadProject(proj.path)}
                  className="flex items-center justify-between p-4 bg-gray-700 hover:bg-gray-600 rounded-xl border border-gray-600 hover:border-purple-500 transition-all group text-left"
                >
                  <div className="flex-1">
                    <h3 className="text-white font-medium group-hover:text-purple-400 transition-colors">
                      {proj.name.replace('.json', '')}
                    </h3>
                    <p className="text-gray-400 text-xs mt-1">
                      {new Date(proj.createdAt).toLocaleDateString('pt-BR')} às{' '}
                      {new Date(proj.createdAt).toLocaleTimeString('pt-BR')}
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gray-600 group-hover:bg-purple-500 flex items-center justify-center transition-all">
                    <svg className="w-4 h-4 text-gray-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
