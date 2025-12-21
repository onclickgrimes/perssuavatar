export type WorkflowStep = 
  | 'upload'        // Upload de áudio
  | 'transcribing'  // Transcrevendo...
  | 'analyzing'     // IA analisando transcrição
  | 'keyframes'     // Revisão de keyframes/emoções
  | 'prompts'       // Geração/edição de prompts
  | 'images'        // Geração/aprovação de imagens
  | 'preview'       // Preview do vídeo antes de renderizar
  | 'rendering'     // Renderizando vídeo
  | 'complete';     // Vídeo pronto

export interface TranscriptionSegment {
  id: number;
  text: string;
  start: number;
  end: number;
  speaker: number;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
    speaker: number;
    punctuatedWord: string;
  }>;
  emotion?: string;
  imagePrompt?: string;
  imageUrl?: string;
  assetType?: string;
  cameraMovement?: string;
  transition?: string;
  highlightWords?: Array<{
    text: string;
    time: number;
    duration?: number;
    entryAnimation?: string;
    exitAnimation?: string;
    size?: string | number;
    position?: string;
    effect?: string;
    color?: string;
    highlightColor?: string;
    fontWeight?: string;
  }>;
}

export interface ProjectState {
  title: string;
  description?: string;
  audioFile?: File;
  audioUrl?: string;
  audioPath?: string; // Caminho do arquivo de áudio no disco
  duration: number;
  segments: TranscriptionSegment[];
  authorConclusion: string;
  editingStyle: string;
  selectedAspectRatios?: string[];
  useStockFootage?: boolean;
}
