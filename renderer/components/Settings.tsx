import React, { useState, useEffect } from 'react';
import { useContinuousRecorder } from '../hooks/useContinuousRecorder';
import { useScreenShare } from '../hooks/useScreenShare';

interface SettingsProps {
  onSizeChange: (size: number) => void;
  onDragToggle: (enabled: boolean) => void;

  models: string[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  onScreenShareChange?: (isSharing: boolean) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

type TabId = 'account' | 'api' | 'audio' | 'avatar' | 'features' | 'shortcuts' | 'embeddings' | 'providers' | 'help';
type GenAIBackend = 'vertex' | 'gemini';

const DEFAULT_GOOGLE_CLOUD_LOCATION = 'global';

// Tipos para Providers
type ProviderPlatform = 'gemini' | 'openai' | 'qwen';

interface ProviderConfig {
  id: string;
  name: string;
  platform: ProviderPlatform;
  createdAt: string;
  lastUsed?: string;
  isLoggedIn?: boolean;
  showBrowser?: boolean;
  isBrowserOpen?: boolean;
}

type ApiCredentialService =
  | 'deepgram'
  | 'elevenlabs'
  | 'openai'
  | 'deepseek'
  | 'gemini'
  | 'vertex'
  | 'aws_polly'
  | 'pexels';

interface ApiCredential {
  id: string;
  service: ApiCredentialService;
  label: string;
  apiKey?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  voiceId?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

interface AppIdentity {
  isAuthenticated: boolean;
  email: string | null;
  userId: string | null;
  accessToken: string | null;
  expiresAt: number | null;
  hasSupabaseConfig: boolean;
}

const API_SERVICE_META: Record<ApiCredentialService, {
  label: string;
  icon: string;
  multi: boolean;
}> = {
  deepgram: { label: 'Deepgram', icon: '🎤', multi: true },
  elevenlabs: { label: 'ElevenLabs', icon: '🎙️', multi: true },
  openai: { label: 'OpenAI', icon: '🤖', multi: true },
  deepseek: { label: 'DeepSeek', icon: '🧠', multi: true },
  gemini: { label: 'Google Gemini', icon: '⚡', multi: true },
  vertex: { label: 'Google Vertex AI', icon: '☁️', multi: true },
  aws_polly: { label: 'AWS Polly', icon: '☁️', multi: false },
  pexels: { label: 'Pexels', icon: '📷', multi: false },
};

const API_SERVICE_ORDER: ApiCredentialService[] = [
  'deepgram',
  'elevenlabs',
  'openai',
  'deepseek',
  'gemini',
  'vertex',
  'aws_polly',
  'pexels',
];

interface ApiCredentialFormState {
  label: string;
  apiKey: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  voiceId: string;
}

function buildServiceRecord<T>(factory: (service: ApiCredentialService) => T): Record<ApiCredentialService, T> {
  return API_SERVICE_ORDER.reduce((acc, service) => {
    acc[service] = factory(service);
    return acc;
  }, {} as Record<ApiCredentialService, T>);
}

function createEmptyCredentialForm(service: ApiCredentialService): ApiCredentialFormState {
  return {
    label: '',
    apiKey: '',
    accessKeyId: '',
    secretAccessKey: '',
    region: service === 'aws_polly' ? 'sa-east-1' : '',
    voiceId: '',
  };
}

export default function Settings({ 
  onSizeChange, 
  onDragToggle, 

  models,
  selectedModel,
  onModelChange,
  onScreenShareChange,
  isOpen: propIsOpen,
  onClose
}: SettingsProps) {
  // Internal state for uncontrolled mode (legacy support)
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = typeof propIsOpen !== 'undefined';
  const showSettings = isControlled ? propIsOpen : internalIsOpen;
  
  const [activeTab, setActiveTab] = useState<TabId>('api');
  
  // Existing states
  const [size, setSize] = useState(1);
  const [dragEnabled, setDragEnabled] = useState(true);

  const [assistantMode, setAssistantMode] = useState<'classic' | 'live'>('live');
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [aiProvider, setAiProvider] = useState<'openai' | 'gemini' | 'deepseek'>('gemini'); // Provedor de IA para modo classic
  const [genaiBackend, setGenaiBackend] = useState<GenAIBackend>('vertex');
  const [vertexProject, setVertexProject] = useState('');
  const [googleCloudLocation, setGoogleCloudLocation] = useState(DEFAULT_GOOGLE_CLOUD_LOCATION);
  const [vertexCredentialsPath, setVertexCredentialsPath] = useState('');
  const [isSavingGenAIConfig, setIsSavingGenAIConfig] = useState(false);
  const [genaiConfigMessage, setGenaiConfigMessage] = useState<string | null>(null);
  const [genaiConfigError, setGenaiConfigError] = useState<string | null>(null);
  const [voiceModel, setVoiceModel] = useState<'polly' | 'elevenlabs'>('polly'); // Modelo de voz para modo classic
  const [continuousRecordingEnabled, setContinuousRecordingEnabled] = useState(true); // Gravação contínua ativada
  const [dbStats, setDbStats] = useState<any>(null);

  // Embedding settings
  const [embeddingProvider, setEmbeddingProvider] = useState<'openai' | 'ollama'>('openai');
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'running' | 'stopped' | 'error'>('checking');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState('nomic-embed-text');
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');

  // Provider settings (AI via Puppeteer)
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderPlatform, setNewProviderPlatform] = useState<ProviderPlatform>('gemini');
  const [isCreatingProvider, setIsCreatingProvider] = useState(false);
  const [isOpeningProvider, setIsOpeningProvider] = useState<string | null>(null);
  const [isUpdatingProviderVisibility, setIsUpdatingProviderVisibility] = useState<string | null>(null);
  const [isClosingProvider, setIsClosingProvider] = useState<string | null>(null);
  const [hoveredOpenProvider, setHoveredOpenProvider] = useState<string | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);

  // Account / identity settings
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [identity, setIdentity] = useState<AppIdentity | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // API credentials (chaves salvas no banco)
  const [apiCredentialsByService, setApiCredentialsByService] = useState<Record<ApiCredentialService, ApiCredential[]>>(
    () => buildServiceRecord(() => [])
  );
  const [apiCredentialForms, setApiCredentialForms] = useState<Record<ApiCredentialService, ApiCredentialFormState>>(
    () => buildServiceRecord((service) => createEmptyCredentialForm(service))
  );
  const [editingApiCredentialByService, setEditingApiCredentialByService] = useState<Record<ApiCredentialService, string | null>>(
    () => buildServiceRecord(() => null)
  );
  const [isApiCredentialLoading, setIsApiCredentialLoading] = useState(false);
  const [apiCredentialBusyAction, setApiCredentialBusyAction] = useState<string | null>(null);
  const [apiCredentialMessage, setApiCredentialMessage] = useState<string | null>(null);
  const [apiCredentialError, setApiCredentialError] = useState<string | null>(null);
  
  // Continuous recorder & Screen Share
  const { isRecording, startRecording, stopRecording, saveLastSeconds, getBufferInfo } = useContinuousRecorder({ maxBufferSeconds: 600 });
  const { isSharing, startSharing, stopSharing } = useScreenShare({ fps: 1 });

  const loadIdentity = async () => {
    try {
      const result = await window.electron.auth.getIdentity();
      setIdentity(result);
    } catch (error) {
      console.error('❌ Erro ao carregar identidade:', error);
      setIdentity(null);
    }
  };

  const scrubLegacyCredentialSettings = async () => {
    await window.electron.db.setUserSettings({
      supabaseUrl: undefined,
      supabasePublishKey: undefined,
    });
  };

  // Effects (Logics)
  useEffect(() => {
    // Gravar quando gravação contínua está ativada (independente do modo)
    if (continuousRecordingEnabled && !isRecording) {
      startRecording();
    } 
    // Parar quando gravação contínua está desativada
    else if (!continuousRecordingEnabled && isRecording) {
      stopRecording();
    }
  }, [continuousRecordingEnabled, isRecording, startRecording, stopRecording]);

  useEffect(() => {
    const unsubscribe = window.electron.onSaveRecording(async (durationSeconds) => {
      const savedPath = await saveLastSeconds(durationSeconds);
      if (savedPath) {
        console.log(`[Settings] Recording saved to: ${savedPath}`);
        
        // Enviar para a galeria de screenshots/gravações
        window.electron.send('recording-saved-from-renderer', {
          path: savedPath,
          duration: durationSeconds
        });
        
        // Registrar gravação no banco de dados
        try {
          const filename = savedPath.split(/[\\/]/).pop() || 'recording.mp4';
          await window.electron.db.addRecording({
            filename,
            path: savedPath,
            duration: durationSeconds
          });
          console.log('💾 Gravação registrada no banco de dados');
        } catch (error) {
          console.error('❌ Erro ao registrar gravação:', error);
        }
      }
    });
    return () => { unsubscribe(); };
  }, [saveLastSeconds]);

  useEffect(() => {
    const unsubscribe = window.electron.onControlScreenShare((action) => {
      if (action === 'start' && !isSharing) startSharing();
      else if (action === 'stop' && isSharing) stopSharing();
    });
    return () => unsubscribe();
  }, [isSharing, startSharing, stopSharing]);

  // Carregar configurações do banco de dados ao iniciar
  useEffect(() => {
    async function loadSettings() {
      try {
        const settings = await window.electron.db.getUserSettings();
        console.log('📖 Configurações carregadas:', settings);
        
        if (settings) {
          // Aplicar configurações carregadas
          if (settings.assistantMode) {
            setAssistantMode(settings.assistantMode);
            window.electron.setAssistantMode(settings.assistantMode);
          }
          
          if (typeof settings.alwaysOnTop !== 'undefined') {
            setAlwaysOnTop(settings.alwaysOnTop);
            window.electron.setAlwaysOnTop(settings.alwaysOnTop);
          }
          
          if (settings.aiProvider) {
            setAiProvider(settings.aiProvider);
            // Notificar o backend sobre o provedor
            window.electron.invoke('set-ai-provider', settings.aiProvider);
          }
          
          if (settings.voiceModel) {
            setVoiceModel(settings.voiceModel);
            // Notificar o backend sobre o modelo de voz
            window.electron.invoke('set-voice-model', settings.voiceModel);
          }
          
          if (typeof settings.continuousRecordingEnabled !== 'undefined') {
            setContinuousRecordingEnabled(settings.continuousRecordingEnabled);
            // Sincronizar com VoiceAssistant
            window.electron.invoke('set-continuous-recording', settings.continuousRecordingEnabled);
          }
          
          if (settings.selectedModel) {
            onModelChange(settings.selectedModel);
          }

          if (settings.authEmail) {
            setAuthEmail(settings.authEmail);
          }

          if (settings.genaiBackend === 'vertex' || settings.genaiBackend === 'gemini') {
            setGenaiBackend(settings.genaiBackend);
          }
          if (typeof settings.vertexProject === 'string' && settings.vertexProject.trim()) {
            setVertexProject(settings.vertexProject.trim());
          }
          if (typeof settings.googleCloudLocation === 'string' && settings.googleCloudLocation.trim()) {
            setGoogleCloudLocation(settings.googleCloudLocation.trim());
          }
          if (typeof settings.vertexCredentialsPath === 'string') {
            setVertexCredentialsPath(settings.vertexCredentialsPath.trim());
          }

          // Carregar configurações de embedding
          if (settings.embeddingProvider) {
            setEmbeddingProvider(settings.embeddingProvider);
          }
          if (settings.ollamaEmbeddingModel) {
            setSelectedOllamaModel(settings.ollamaEmbeddingModel);
          }
        }
      } catch (error) {
        console.error('❌ Erro ao carregar configurações:', error);
        // Se falhar, usa os defaults
        window.electron.setAssistantMode(assistantMode);
      }
    }
    
    loadSettings();
    loadIdentity();
    scrubLegacyCredentialSettings().catch((error) => {
      console.warn('⚠️ Não foi possível limpar credenciais legadas:', error);
    });
  }, []);

  useEffect(() => {
    onScreenShareChange?.(isSharing);
  }, [isSharing, onScreenShareChange]);

  // Salvar modelo selecionado no banco de dados quando mudar
  useEffect(() => {
    async function saveModel() {
      if (selectedModel) {
        try {
          await window.electron.db.setUserSettings({ selectedModel });
          console.log('💾 Modelo salvo:', selectedModel);
        } catch (error) {
          console.error('❌ Erro ao salvar modelo:', error);
        }
      }
    }
    saveModel();
  }, [selectedModel]);

  // Handlers
  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseFloat(e.target.value);
    setSize(newSize);
    
    // Apply scale directly to avatar instead of resizing window
    if (window.avatar && window.avatar.setScale) {
      window.avatar.setScale(newSize);
    }
    
    // Still notify parent for any other side effects (if needed)
    onSizeChange(newSize);
  };

  const handleDragToggle = () => {
    const newState = !dragEnabled;
    setDragEnabled(newState);
    onDragToggle(newState);
  };



  const handleModeToggle = async () => {
    const newMode = assistantMode === 'classic' ? 'live' : 'classic';
    setAssistantMode(newMode);
    window.electron.setAssistantMode(newMode);
    
    // Salvar no banco de dados
    try {
      await window.electron.db.setAssistantMode(newMode);
      console.log('💾 Modo salvo:', newMode);
    } catch (error) {
      console.error('❌ Erro ao salvar modo:', error);
    }
  };

  const handleAlwaysOnTopToggle = async () => {
    const newState = !alwaysOnTop;
    setAlwaysOnTop(newState);
    window.electron.setAlwaysOnTop(newState);
    
    // Salvar no banco de dados
    try {
      await window.electron.db.setUserSettings({ alwaysOnTop: newState });
      console.log('💾 Always on top salvo:', newState);
    } catch (error) {
      console.error('❌ Erro ao salvar always on top:', error);
    }
  };

  const handleAiProviderChange = async (newProvider: 'openai' | 'gemini' | 'deepseek') => {
    setAiProvider(newProvider);
    
    // Notificar o backend
    try {
      await window.electron.invoke('set-ai-provider', newProvider);
      console.log('🤖 Provedor de IA alterado:', newProvider);
      
      // Salvar no banco de dados
      await window.electron.db.setUserSettings({ aiProvider: newProvider });
      console.log('💾 Provedor salvo:', newProvider);
    } catch (error) {
      console.error('❌ Erro ao mudar provedor de IA:', error);
    }
  };

  const handleGenAIBackendChange = (backend: GenAIBackend) => {
    setGenaiBackend(backend);
    setGenaiConfigMessage(null);
    setGenaiConfigError(null);
  };

  const handleSaveGenAIConfig = async () => {
    const sanitizedProject = vertexProject.trim();
    const sanitizedLocation = googleCloudLocation.trim();
    const sanitizedCredentialsPath = vertexCredentialsPath.trim().replace(/^"|"$/g, '');

    setGenaiConfigMessage(null);
    setGenaiConfigError(null);

    if (genaiBackend === 'vertex') {
      if (!sanitizedProject) {
        setGenaiConfigError('Informe o Vertex Project para usar Vertex AI.');
        return;
      }
      if (!sanitizedLocation) {
        setGenaiConfigError('Informe o Google Cloud Location para usar Vertex AI.');
        return;
      }
    }

    setIsSavingGenAIConfig(true);
    try {
      await window.electron.db.setUserSettings({
        genaiBackend,
        vertexProject: sanitizedProject || undefined,
        googleCloudLocation: sanitizedLocation || DEFAULT_GOOGLE_CLOUD_LOCATION,
        vertexCredentialsPath: sanitizedCredentialsPath || undefined,
      });
      await window.electron.invoke('reload-assistant');
      setVertexProject(sanitizedProject);
      setGoogleCloudLocation(sanitizedLocation || DEFAULT_GOOGLE_CLOUD_LOCATION);
      setVertexCredentialsPath(sanitizedCredentialsPath);
      setGenaiConfigMessage('Configuração do Google GenAI salva no banco local.');
      console.log('💾 Google GenAI backend salvo:', {
        genaiBackend,
        vertexProject: sanitizedProject || undefined,
        googleCloudLocation: sanitizedLocation || DEFAULT_GOOGLE_CLOUD_LOCATION,
        vertexCredentialsPath: sanitizedCredentialsPath || undefined,
      });
    } catch (error: any) {
      setGenaiConfigError(error?.message || 'Falha ao salvar configuração do Google GenAI.');
      console.error('❌ Erro ao salvar backend Google GenAI:', error);
    } finally {
      setIsSavingGenAIConfig(false);
    }
  };

  const handleVoiceModelChange = async (newVoiceModel: 'polly' | 'elevenlabs') => {
    setVoiceModel(newVoiceModel);
    
    // Notificar o backend
    try {
      await window.electron.invoke('set-voice-model', newVoiceModel);
      console.log('🔊 Modelo de voz alterado:', newVoiceModel);
      
      // Salvar no banco de dados
      await window.electron.db.setUserSettings({ voiceModel: newVoiceModel });
      console.log('💾 Modelo de voz salvo:', newVoiceModel);
    } catch (error) {
      console.error('❌ Erro ao mudar modelo de voz:', error);
    }
  };

  const handleContinuousRecordingToggle = async () => {
    const newState = !continuousRecordingEnabled;
    setContinuousRecordingEnabled(newState);
    
    // O useEffect vai cuidar de iniciar/parar a gravação automaticamente
    console.log(newState ? '📹 Gravação contínua ativada' : '⏹️ Gravação contínua desativada');
    
    // Notificar o VoiceAssistant sobre a mudança
    try {
      await window.electron.invoke('set-continuous-recording', newState);
      console.log('✅ Estado de gravação contínua sincronizado com VoiceAssistant');
    } catch (error) {
      console.error('❌ Erro ao sincronizar estado de gravação contínua:', error);
    }
    
    // Salvar no banco de dados
    try {
      await window.electron.db.setUserSettings({ continuousRecordingEnabled: newState });
      console.log('💾 Gravação contínua salva:', newState);
    } catch (error) {
      console.error('❌ Erro ao salvar gravação contínua:', error);
    }
  };

  const handleSignIn = async () => {
    setAuthError(null);
    setAuthMessage(null);
    setIsAuthLoading(true);

    try {
      const result = await window.electron.auth.signInWithPassword(authEmail.trim(), authPassword);

      if (!result?.success) {
        setAuthError(result?.error || 'Falha ao autenticar.');
        return;
      }

      await scrubLegacyCredentialSettings();
      setIdentity(result.identity || null);
      setAuthPassword('');
      setAuthMessage('Login realizado. Identidade sincronizada com billing.');
      await loadIdentity();
    } catch (error: any) {
      setAuthError(error?.message || 'Erro ao autenticar usuário.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleRefreshSession = async () => {
    setAuthError(null);
    setAuthMessage(null);
    setIsAuthLoading(true);

    try {
      const result = await window.electron.auth.refreshSession();
      if (!result?.success) {
        setAuthError(result?.error || 'Falha ao renovar sessão.');
      } else {
        setIdentity(result.identity || null);
        setAuthMessage('Sessão renovada com sucesso.');
      }
      await loadIdentity();
    } catch (error: any) {
      setAuthError(error?.message || 'Erro ao renovar sessão.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    setAuthError(null);
    setAuthMessage(null);
    setIsAuthLoading(true);

    try {
      const result = await window.electron.auth.signOut();
      if (!result?.success) {
        setAuthError(result?.error || 'Falha ao encerrar sessão.');
      } else {
        setIdentity(result.identity || null);
        setAuthMessage('Sessão encerrada.');
      }
      setAuthPassword('');
      await loadIdentity();
    } catch (error: any) {
      setAuthError(error?.message || 'Erro ao encerrar sessão.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  // ================================================
  // FUNÇÕES DO BANCO DE DADOS
  // ================================================

  // Carregar estatísticas do banco de dados
  const loadDatabaseStats = async () => {
    try {
      const stats = await window.electron.db.getStats();
      setDbStats(stats);
      console.log('📊 Estatísticas carregadas:', stats);
    } catch (error) {
      console.error('❌ Erro ao carregar estatísticas:', error);
    }
  };

  // Exportar dados do banco
  const handleExportData = async () => {
    try {
      const data = await window.electron.db.export();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `avatar-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      console.log('💾 Dados exportados com sucesso!');
    } catch (error) {
      console.error('❌ Erro ao exportar dados:', error);
    }
  };

  // Limpar histórico de conversas
  const handleClearHistory = async () => {
    if (confirm('Tem certeza que deseja limpar todo o histórico de conversas?')) {
      try {
        await window.electron.db.clearConversationHistory();
        await loadDatabaseStats(); // Atualiza estatísticas
        console.log('🗑️ Histórico limpo!');
      } catch (error) {
        console.error('❌ Erro ao limpar histórico:', error);
      }
    }
  };

  // ================================================
  // FUNÇÕES DE CREDENCIAIS DE API
  // ================================================

  const maskSecret = (value?: string): string => {
    if (!value) return 'não configurado';
    if (value.length <= 8) return `${value.slice(0, 2)}••••`;
    return `${value.slice(0, 4)}••••${value.slice(-4)}`;
  };

  const resetApiCredentialForm = (service: ApiCredentialService) => {
    setApiCredentialForms(prev => ({
      ...prev,
      [service]: createEmptyCredentialForm(service),
    }));
    setEditingApiCredentialByService(prev => ({
      ...prev,
      [service]: null,
    }));
  };

  const handleApiCredentialFieldChange = (
    service: ApiCredentialService,
    field: keyof ApiCredentialFormState,
    value: string
  ) => {
    setApiCredentialForms(prev => ({
      ...prev,
      [service]: {
        ...prev[service],
        [field]: value,
      },
    }));
  };

  const loadApiCredentials = async () => {
    setIsApiCredentialLoading(true);
    try {
      const credentials = await window.electron.db.getApiCredentials() as ApiCredential[];
      const grouped = buildServiceRecord<ApiCredential[]>((service) =>
        credentials.filter(credential => credential.service === service)
      );
      setApiCredentialsByService(grouped);
      setApiCredentialError(null);
    } catch (error: any) {
      console.error('❌ Erro ao carregar credenciais:', error);
      setApiCredentialError(error?.message || 'Falha ao carregar credenciais de API.');
    } finally {
      setIsApiCredentialLoading(false);
    }
  };

  const handleEditApiCredential = (service: ApiCredentialService, credential: ApiCredential) => {
    setApiCredentialForms(prev => ({
      ...prev,
      [service]: {
        label: credential.label || '',
        apiKey: credential.apiKey || '',
        accessKeyId: credential.accessKeyId || '',
        secretAccessKey: credential.secretAccessKey || '',
        region: credential.region || (service === 'aws_polly' ? 'sa-east-1' : ''),
        voiceId: credential.voiceId || '',
      },
    }));
    setEditingApiCredentialByService(prev => ({
      ...prev,
      [service]: credential.id,
    }));
    setApiCredentialMessage(null);
    setApiCredentialError(null);
  };

  const handleSaveApiCredential = async (service: ApiCredentialService) => {
    const form = apiCredentialForms[service];
    const editingId = editingApiCredentialByService[service];
    const busyId = `save:${service}`;
    const sanitizedVertexProject = vertexProject.trim();
    const sanitizedCloudLocation = googleCloudLocation.trim() || DEFAULT_GOOGLE_CLOUD_LOCATION;
    const sanitizedCredentialsPath = vertexCredentialsPath.trim().replace(/^"|"$/g, '');

    setApiCredentialMessage(null);
    setApiCredentialError(null);

    if (service === 'vertex') {
      if (!sanitizedVertexProject) {
        setApiCredentialError('Informe o Vertex Project para salvar a configuração do Vertex AI.');
        return;
      }

      setApiCredentialBusyAction(busyId);
      try {
        await window.electron.db.setUserSettings({
          vertexProject: sanitizedVertexProject,
          googleCloudLocation: sanitizedCloudLocation,
          vertexCredentialsPath: sanitizedCredentialsPath || undefined,
        });
        await window.electron.invoke('reload-assistant');
        setVertexProject(sanitizedVertexProject);
        setGoogleCloudLocation(sanitizedCloudLocation);
        setVertexCredentialsPath(sanitizedCredentialsPath);
        setApiCredentialMessage('Configuração do Vertex AI salva (ADC automático ou arquivo JSON opcional).');
      } catch (error: any) {
        console.error('❌ Erro ao salvar configuração do Vertex:', error);
        setApiCredentialError(error?.message || 'Falha ao salvar configuração do Vertex AI.');
      } finally {
        setApiCredentialBusyAction(null);
      }
      return;
    }

    if (service === 'aws_polly') {
      if (!form.accessKeyId.trim() || !form.secretAccessKey.trim()) {
        setApiCredentialError('AWS Polly requer Access Key ID e Secret Access Key.');
        return;
      }
    } else if (!form.apiKey.trim()) {
      setApiCredentialError(`A chave de API de ${API_SERVICE_META[service].label} é obrigatória.`);
      return;
    }

    const payload: any = {
      label: form.label.trim() || undefined,
    };

    if (service === 'aws_polly') {
      payload.accessKeyId = form.accessKeyId.trim();
      payload.secretAccessKey = form.secretAccessKey.trim();
      payload.region = form.region.trim() || 'sa-east-1';
    } else {
      payload.apiKey = form.apiKey.trim();
      if (service === 'elevenlabs') {
        payload.voiceId = form.voiceId.trim() || undefined;
      }
    }

    setApiCredentialBusyAction(busyId);

    try {
      if (editingId) {
        await window.electron.db.updateApiCredential(editingId, payload);
        setApiCredentialMessage(`${API_SERVICE_META[service].label} atualizado com sucesso.`);
      } else {
        await window.electron.db.createApiCredential({
          service,
          ...payload,
        });
        setApiCredentialMessage(`Credencial de ${API_SERVICE_META[service].label} adicionada.`);
      }

      await loadApiCredentials();
      resetApiCredentialForm(service);
    } catch (error: any) {
      console.error('❌ Erro ao salvar credencial:', error);
      setApiCredentialError(error?.message || 'Falha ao salvar credencial de API.');
    } finally {
      setApiCredentialBusyAction(null);
    }
  };

  const handleDeleteApiCredential = async (service: ApiCredentialService, credentialId: string) => {
    const busyId = `delete:${credentialId}`;

    if (!confirm(`Deseja remover esta credencial de ${API_SERVICE_META[service].label}?`)) {
      return;
    }

    setApiCredentialBusyAction(busyId);
    setApiCredentialMessage(null);
    setApiCredentialError(null);

    try {
      await window.electron.db.deleteApiCredential(credentialId);
      if (editingApiCredentialByService[service] === credentialId) {
        resetApiCredentialForm(service);
      }
      await loadApiCredentials();
      setApiCredentialMessage('Credencial removida com sucesso.');
    } catch (error: any) {
      console.error('❌ Erro ao remover credencial:', error);
      setApiCredentialError(error?.message || 'Falha ao remover credencial de API.');
    } finally {
      setApiCredentialBusyAction(null);
    }
  };

  const handleSetActiveApiCredential = async (service: ApiCredentialService, credentialId: string) => {
    const busyId = `active:${credentialId}`;
    setApiCredentialBusyAction(busyId);
    setApiCredentialMessage(null);
    setApiCredentialError(null);

    try {
      await window.electron.db.setActiveApiCredential(service, credentialId);
      await loadApiCredentials();
      setApiCredentialMessage(`Chave ativa de ${API_SERVICE_META[service].label} atualizada.`);
    } catch (error: any) {
      console.error('❌ Erro ao ativar credencial:', error);
      setApiCredentialError(error?.message || 'Falha ao definir chave ativa.');
    } finally {
      setApiCredentialBusyAction(null);
    }
  };

  // ================================================
  // FUNÇÕES DE EMBEDDING
  // ================================================

  // Estado para saber se Ollama está instalado
  const [ollamaInstalled, setOllamaInstalled] = useState<boolean | null>(null);

  // Verificar se Ollama está instalado e seus status
  const checkOllamaStatus = async () => {
    setOllamaStatus('checking');
    
    try {
      // 1. Verificar se Ollama está instalado
      const installResult = await window.electron.knowledge.checkOllamaInstalled();
      if (!installResult.installed) {
        setOllamaInstalled(false);
        setOllamaStatus('stopped');
        console.log('⚠️ Ollama não está instalado');
        return;
      }
      setOllamaInstalled(true);

      // 2. Tentar conectar à API para ver se está rodando
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      
      if (response.ok) {
        const data = await response.json();
        const models = data.models?.map((m: any) => m.name) || [];
        setOllamaModels(models);
        setOllamaStatus('running');
        console.log('✅ Ollama conectado. Modelos:', models);
      } else {
        // Instalado mas não rodando - buscar modelos via CLI
        const listResult = await window.electron.knowledge.listOllamaModels();
        if (listResult.success && listResult.data) {
          setOllamaModels(listResult.data);
        }
        setOllamaStatus('stopped');
      }
    } catch (error) {
      console.log('⚠️ Ollama não está rodando ou não instalado');
      // Tentar buscar modelos via CLI mesmo assim
      try {
        const listResult = await window.electron.knowledge.listOllamaModels();
        if (listResult.success && listResult.data) {
          setOllamaModels(listResult.data);
          setOllamaInstalled(true);
        }
      } catch {}
      setOllamaStatus('stopped');
    }
  };

  // Baixar modelo do Ollama via 'ollama pull'
  const handleDownloadOllamaModel = async (modelName: string) => {
    setIsDownloadingModel(true);
    setDownloadProgress('Iniciando download...');
    
    try {
      // Usar IPC para executar 'ollama pull'
      const result = await window.electron.knowledge.pullModel(modelName);
      
      if (result.success) {
        setDownloadProgress('Download concluído! ✅');
        // Atualizar lista de modelos
        setTimeout(async () => {
          await checkOllamaStatus();
          setDownloadProgress('');
          setIsDownloadingModel(false);
        }, 2000);
      } else {
        setDownloadProgress(`Erro: ${result.error || 'Falha ao baixar'}`);
        setTimeout(() => {
          setDownloadProgress('');
          setIsDownloadingModel(false);
        }, 3000);
      }
    } catch (error: any) {
      console.error('❌ Erro ao baixar modelo:', error);
      setDownloadProgress(`Erro: ${error.message}`);
      setTimeout(() => {
        setDownloadProgress('');
        setIsDownloadingModel(false);
      }, 3000);
    }
  };

  // Listener para progresso de download
  useEffect(() => {
    const unsubscribe = window.electron.knowledge.onOllamaPullProgress((data) => {
      if (data.progress) {
        setDownloadProgress(data.progress);
      }
    });
    return () => unsubscribe();
  }, []);

  // Salvar configuração de embedding
  const handleEmbeddingProviderChange = async (provider: 'openai' | 'ollama') => {
    setEmbeddingProvider(provider);
    try {
      await window.electron.db.setUserSettings({ embeddingProvider: provider });
      console.log('💾 Provider de embedding salvo:', provider);
      
      // Notificar o backend
      await window.electron.knowledge.setEmbeddingProvider(provider);
    } catch (error) {
      console.error('❌ Erro ao salvar provider de embedding:', error);
    }
  };

  const handleOllamaModelChange = async (model: string) => {
    setSelectedOllamaModel(model);
    try {
      await window.electron.db.setUserSettings({ ollamaEmbeddingModel: model });
      console.log('💾 Modelo Ollama salvo:', model);
      
      // Notificar o backend
      await window.electron.knowledge.setOllamaEmbeddingModel(model);
    } catch (error) {
      console.error('❌ Erro ao salvar modelo Ollama:', error);
    }
  };

  // Verificar Ollama ao abrir a aba
  useEffect(() => {
    if (activeTab === 'embeddings') {
      checkOllamaStatus();
    }
  }, [activeTab]);

  // ================================================
  // FUNÇÕES DE PROVIDERS (AI via Puppeteer)
  // ================================================

  // Carregar providers ao abrir a aba
  const loadProviders = async () => {
    try {
      const result = await window.electron.provider.list();
      if (result.success && result.data) {
        const normalizedProviders = result.data.map((provider: ProviderConfig) => {
          const normalizedProvider: ProviderConfig = { ...provider };
          if (provider.platform === 'gemini') {
            normalizedProvider.showBrowser = provider.showBrowser ?? true;
          }
          normalizedProvider.isBrowserOpen = provider.isBrowserOpen === true;
          return normalizedProvider;
        });
        setProviders(normalizedProviders);
      }
    } catch (error) {
      console.error('❌ Erro ao carregar providers:', error);
    }
  };

  // Criar novo provider
  const handleCreateProvider = async () => {
    if (!newProviderName.trim()) {
      setProviderError('Digite um nome para o provider');
      return;
    }

    setIsCreatingProvider(true);
    setProviderError(null);

    try {
      const result = await window.electron.provider.create(newProviderName.trim(), newProviderPlatform);
      if (result.success && result.data) {
        const createdProvider: ProviderConfig = {
          ...result.data,
          showBrowser: result.data.platform === 'gemini' ? (result.data.showBrowser ?? true) : result.data.showBrowser,
          isBrowserOpen: result.data.isBrowserOpen === true,
        };
        setProviders(prev => [...prev, createdProvider]);
        setNewProviderName('');
        console.log('✅ Provider criado:', result.data.name);
      } else {
        setProviderError(result.error || 'Erro ao criar provider');
      }
    } catch (error: any) {
      console.error('❌ Erro ao criar provider:', error);
      setProviderError(error.message || 'Erro ao criar provider');
    } finally {
      setIsCreatingProvider(false);
    }
  };

  // Deletar provider
  const handleDeleteProvider = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este provider? Os dados de login serão perdidos.')) {
      return;
    }

    try {
      const result = await window.electron.provider.delete(id);
      if (result.success) {
        setProviders(prev => prev.filter(p => p.id !== id));
        setHoveredOpenProvider(prev => (prev === id ? null : prev));
        console.log('🗑️ Provider removido:', id);
      }
    } catch (error) {
      console.error('❌ Erro ao deletar provider:', error);
    }
  };

  // Abrir navegador para login
  const handleOpenProvider = async (id: string) => {
    setIsOpeningProvider(id);
    setProviderError(null);

    try {
      const result = await window.electron.provider.openForLogin(id);
      if (result.success) {
        // Atualizar status de login
        setProviders(prev => prev.map(p => 
          p.id === id
            ? { ...p, isLoggedIn: result.isLoggedIn, isBrowserOpen: true, lastUsed: new Date().toISOString() }
            : p
        ));
        console.log('🌐 Provider aberto:', id, 'Logado:', result.isLoggedIn);
      } else {
        setProviderError(result.error || 'Erro ao abrir navegador');
      }
    } catch (error: any) {
      console.error('❌ Erro ao abrir provider:', error);
      setProviderError(error.message || 'Erro ao abrir navegador');
    } finally {
      setIsOpeningProvider(null);
    }
  };

  const handleToggleProviderBrowserVisibility = async (id: string, showBrowser: boolean) => {
    setIsUpdatingProviderVisibility(id);
    setProviderError(null);

    try {
      const result = await window.electron.provider.setBrowserVisibility(id, showBrowser);
      if (result.success && result.data) {
        setProviders(prev => prev.map(p => (
          p.id === id
            ? {
                ...p,
                showBrowser: result.data.showBrowser ?? showBrowser,
                isBrowserOpen: result.data.isBrowserOpen === true,
              }
            : p
        )));
      } else {
        setProviderError(result.error || 'Erro ao atualizar visibilidade do navegador');
      }
    } catch (error: any) {
      console.error('❌ Erro ao atualizar visibilidade do navegador do provider:', error);
      setProviderError(error.message || 'Erro ao atualizar visibilidade do navegador');
    } finally {
      setIsUpdatingProviderVisibility(null);
    }
  };

  // Verificar login de um provider
  const handleCheckLogin = async (id: string) => {
    try {
      const result = await window.electron.provider.checkLogin(id);
      if (result.success) {
        setProviders(prev => prev.map(p => 
          p.id === id ? { ...p, isLoggedIn: result.isLoggedIn } : p
        ));
      }
    } catch (error) {
      console.error('❌ Erro ao verificar login:', error);
    }
  };

  // Fechar navegador de um provider
  const handleCloseProvider = async (id: string) => {
    setIsClosingProvider(id);
    setProviderError(null);

    try {
      const result = await window.electron.provider.close(id);
      if (!result?.success) {
        setProviderError(result?.error || 'Erro ao fechar navegador');
        return;
      }

      setProviders(prev => prev.map(p => (
        p.id === id ? { ...p, isBrowserOpen: false } : p
      )));
      setHoveredOpenProvider(prev => (prev === id ? null : prev));
      console.log('🔌 Provider fechado:', id);
    } catch (error: any) {
      console.error('❌ Erro ao fechar provider:', error);
      setProviderError(error?.message || 'Erro ao fechar navegador');
    } finally {
      setIsClosingProvider(null);
    }
  };

  // Carregar providers ao abrir a aba
  useEffect(() => {
    if (activeTab === 'providers') {
      loadProviders();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'account') {
      loadIdentity();
    }
  }, [activeTab]);

  // Carregar credenciais ao abrir a aba de APIs
  useEffect(() => {
    if (activeTab === 'api') {
      loadApiCredentials();
    }
  }, [activeTab]);

  // Helper para obter configurações de plataforma
  const getPlatformConfig = (platform: ProviderPlatform) => {
    const configs: Record<ProviderPlatform, { label: string; icon: string; color: string; bgColor: string }> = {
      gemini: { label: 'Google Gemini', icon: '⚡', color: 'purple', bgColor: 'bg-purple-900/10' },
      openai: { label: 'OpenAI ChatGPT', icon: '🤖', color: 'green', bgColor: 'bg-green-900/10' },
      qwen: { label: 'Qwen', icon: '🧠', color: 'blue', bgColor: 'bg-blue-900/10' }
    };
    return configs[platform];
  };

  if (!showSettings && isControlled) return null;

  // Render Helpers
  const renderSidebarItem = (id: TabId, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors rounded-lg mb-1 ${
        activeTab === id 
          ? 'bg-[#1f1f1f] text-white border-l-2 border-blue-500' 
          : 'text-gray-400 hover:text-white hover:bg-[#1f1f1f]/50'
      }`}
    >
      <span className="text-lg">{icon}</span>
      {label}
    </button>
  );

  return (
    <div 
      className={isControlled 
        ? "fixed inset-0 z-[600] flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200 no-drag"
        : "absolute top-4 right-4 z-[200] no-drag"
      }
            onMouseEnter={() => window.electron.setIgnoreMouseEvents(false)}
      onMouseLeave={() => {
        if (!showSettings) window.electron.setIgnoreMouseEvents(true, { forward: true });
      }}
      onClick={(e) => {
        if (isControlled && e.target === e.currentTarget && onClose) onClose();
      }}
    >
      {!isControlled && (
        <button 
          onClick={() => setInternalIsOpen(!internalIsOpen)}
          className="p-2 bg-gray-800/80 text-white rounded-full hover:bg-gray-700 transition-colors pointer-events-auto shadow-lg"
        >
          ⚙️
        </button>
      )}

      {(showSettings || isControlled) && (
        <div className={`
            bg-[#0a0a0a] rounded-xl shadow-2xl border border-[#222] overflow-hidden flex flex-col no-drag
            ${isControlled ? 'w-[900px] h-[600px]' : 'absolute right-0 mt-2 w-80'}
        `}>
          {/* Header */}
          <div className="h-14 border-b border-[#222] flex items-center justify-between px-6 bg-[#0f0f0f] window-drag">
            <h2 className="text-lg font-bold text-white tracking-wide">Configurações</h2>
            {(isControlled && onClose) && (
              <button onClick={onClose} className="p-1.5 rounded-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white transition-colors no-drag cursor-pointer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
          </div>

          <div className="flex flex-1 overflow-hidden">
             {/* Sidebar */}
             <div className="w-64 bg-[#0a0a0a] border-r border-[#222] p-4 flex flex-col">
                <nav className="flex-1 space-y-1">
                   {renderSidebarItem('account', 'Conta', '👤')}
                   {renderSidebarItem('api', 'API e Modelos', '❖')}
                   {renderSidebarItem('audio', 'Áudio e Tela', '🎤')}
                   {renderSidebarItem('avatar', 'Avatar', '👤')}
                   {renderSidebarItem('features', 'Recursos', '⚡')}
                   {renderSidebarItem('embeddings', 'Embeddings', '🧠')}
                   {renderSidebarItem('providers', 'Modelos Web', '🌐')}
                   {renderSidebarItem('shortcuts', 'Atalhos', '⌨')}
                   {renderSidebarItem('help', 'Ajuda', '❓')}
                </nav>
                
                {/* <div className="pt-4 border-t border-[#222]">
                   <button className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-400 hover:text-white hover:bg-[#1f1f1f]/50 rounded-lg transition-colors">
                      <span>👤</span> Conta
                   </button>
                   <button className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors mt-1">
                      <span>🌟</span> Premium
                   </button>
                </div> */}
             </div>

             {/* Content Area */}
             <div className="flex-1 bg-black p-8 overflow-y-auto" style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#1a1a1a #0a0a0a'
            }}>
                {/* --- Conta / Identidade --- */}
                {activeTab === 'account' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">

                    <div className="bg-[#111] border border-[#222] rounded-xl p-5 space-y-4">
                      <h4 className="text-sm font-semibold text-white">Login</h4>

                      <div>
                        <label className="block text-xs text-gray-400 mb-1">E-mail</label>
                        <input
                          type="email"
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          placeholder="usuario@dominio.com"
                          className="w-full bg-[#0a0a0a] text-white rounded-lg p-2.5 border border-[#333] text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Senha</label>
                        <input
                          type="password"
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-[#0a0a0a] text-white rounded-lg p-2.5 border border-[#333] text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={handleSignIn}
                          disabled={isAuthLoading}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          {isAuthLoading ? 'Entrando...' : 'Entrar'}
                        </button>
                        <button
                          onClick={handleRefreshSession}
                          disabled={isAuthLoading}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-600/50 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Renovar sessão
                        </button>
                        <button
                          onClick={handleSignOut}
                          disabled={isAuthLoading}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Sair
                        </button>
                      </div>
                    </div>

                    <div className="bg-[#111] border border-[#222] rounded-xl p-5 space-y-3">
                      <h4 className="text-sm font-semibold text-white">Status da Sessão</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="bg-black/30 border border-[#222] rounded-lg p-3">
                          <p className="text-gray-400 mb-1">Autenticado</p>
                          <p className={identity?.isAuthenticated ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                            {identity?.isAuthenticated ? 'Sim' : 'Não'}
                          </p>
                        </div>
                        <div className="bg-black/30 border border-[#222] rounded-lg p-3">
                          <p className="text-gray-400 mb-1">Usuário</p>
                          <p className="text-white break-all">{identity?.email || '-'}</p>
                        </div>
                        <div className="bg-black/30 border border-[#222] rounded-lg p-3">
                          <p className="text-gray-400 mb-1">User ID</p>
                          <p className="text-white break-all">{identity?.userId || '-'}</p>
                        </div>
                        <div className="bg-black/30 border border-[#222] rounded-lg p-3">
                          <p className="text-gray-400 mb-1">Expira em</p>
                          <p className="text-white">
                            {identity?.expiresAt ? new Date(identity.expiresAt * 1000).toLocaleString('pt-BR') : '-'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {authMessage && (
                      <div className="bg-emerald-900/20 border border-emerald-500/20 rounded-xl p-3 text-sm text-emerald-300">
                        {authMessage}
                      </div>
                    )}

                    {authError && (
                      <div className="bg-red-900/20 border border-red-500/20 rounded-xl p-3 text-sm text-red-300">
                        {authError}
                      </div>
                    )}
                  </div>
                )}
                
                {/* --- API e Modelos --- */}
                {activeTab === 'api' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                     <div>
                        <h3 className="text-xl font-medium text-white mb-1">Provedores de IA</h3>
                        <p className="text-sm text-gray-500 mb-6">Selecione o provedor de IA para o modo clássico.</p>
                        
                        <div className="flex gap-4 mb-8">
                           <button 
                             onClick={() => handleAiProviderChange('openai')}
                             className={`flex-1 py-4 border-2 rounded-xl flex flex-col items-center justify-center gap-2 transition-all ${
                               aiProvider === 'openai' 
                                 ? 'border-blue-600 bg-blue-900/10 text-white' 
                                 : 'border-[#333] bg-[#111] hover:bg-[#1a1a1a] text-gray-400 hover:text-white opacity-60'
                             }`}
                           >
                              <span className="text-2xl">🤖</span>
                              <span className="font-semibold">OpenAI</span>
                              {aiProvider === 'openai' && <span className="text-xs bg-blue-600 px-2 py-0.5 rounded-full">Ativo</span>}
                           </button>
                           <button 
                             onClick={() => handleAiProviderChange('gemini')}
                             className={`flex-1 py-4 border-2 rounded-xl flex flex-col items-center justify-center gap-2 transition-all ${
                               aiProvider === 'gemini' 
                                 ? 'border-purple-600 bg-purple-900/10 text-white' 
                                 : 'border-[#333] bg-[#111] hover:bg-[#1a1a1a] text-gray-400 hover:text-white opacity-60'
                             }`}
                           >
                              <span className="text-2xl">⚡</span>
                              <span className="font-semibold">Google Gemini</span>
                              {aiProvider === 'gemini' && <span className="text-xs bg-purple-600 px-2 py-0.5 rounded-full">Ativo</span>}
                           </button>
                           <button 
                             onClick={() => handleAiProviderChange('deepseek')}
                             className={`flex-1 py-4 border-2 rounded-xl flex flex-col items-center justify-center gap-2 transition-all ${
                               aiProvider === 'deepseek' 
                                 ? 'border-cyan-600 bg-cyan-900/10 text-white' 
                                 : 'border-[#333] bg-[#111] hover:bg-[#1a1a1a] text-gray-400 hover:text-white opacity-60'
                             }`}
                           >
                              <span className="text-2xl">🧠</span>
                              <span className="font-semibold">DeepSeek</span>
                              {aiProvider === 'deepseek' && <span className="text-xs bg-cyan-600 px-2 py-0.5 rounded-full">Ativo</span>}
                           </button>
                        </div>

                        <div className="bg-blue-900/10 border border-blue-500/20 rounded-xl p-4 mb-6">
                           <div className="flex items-start gap-3">
                              <span className="text-xl">ℹ️</span>
                              <div>
                                 <h4 className="text-sm font-semibold text-blue-300 mb-1">Modo Clássico</h4>
                                 <p className="text-xs text-blue-200/70">
                                    Esta configuração afeta apenas o <strong>modo clássico</strong>. 
                                    O <strong>modo Live</strong> sempre usa Gemini Live nativo com áudio.
                                 </p>
                              </div>
                           </div>
                        </div>
                     </div>

                     <div>
                        <h3 className="text-xl font-medium text-white mb-1">Google GenAI (Vertex ou Gemini API)</h3>
                        <p className="text-sm text-gray-500 mb-6">
                           Define qual backend será usado pelos serviços com <code>@google/genai</code> (Veo, Gemini Live e Gemini TTS).
                        </p>

                        <div className="flex gap-4 mb-4">
                           <button
                             onClick={() => handleGenAIBackendChange('vertex')}
                             className={`flex-1 py-3 border-2 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                               genaiBackend === 'vertex'
                                 ? 'border-emerald-600 bg-emerald-900/10 text-white'
                                 : 'border-[#333] bg-[#111] hover:bg-[#1a1a1a] text-gray-400 hover:text-white opacity-60'
                             }`}
                           >
                              <span className="text-xl">☁️</span>
                              <span className="font-semibold">Vertex AI</span>
                              {genaiBackend === 'vertex' && <span className="text-xs bg-emerald-600 px-2 py-0.5 rounded-full">Ativo</span>}
                           </button>
                           <button
                             onClick={() => handleGenAIBackendChange('gemini')}
                             className={`flex-1 py-3 border-2 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                               genaiBackend === 'gemini'
                                 ? 'border-purple-600 bg-purple-900/10 text-white'
                                 : 'border-[#333] bg-[#111] hover:bg-[#1a1a1a] text-gray-400 hover:text-white opacity-60'
                             }`}
                           >
                              <span className="text-xl">⚡</span>
                              <span className="font-semibold">Gemini API</span>
                              {genaiBackend === 'gemini' && <span className="text-xs bg-purple-600 px-2 py-0.5 rounded-full">Ativo</span>}
                           </button>
                        </div>

                        {genaiConfigError && (
                          <div className="mb-3 bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                            <p className="text-xs text-red-300">❌ {genaiConfigError}</p>
                          </div>
                        )}
                        {genaiConfigMessage && (
                          <div className="mb-3 bg-green-900/20 border border-green-500/30 rounded-lg p-3">
                            <p className="text-xs text-green-300">✅ {genaiConfigMessage}</p>
                          </div>
                        )}

                        <button
                          onClick={handleSaveGenAIConfig}
                          disabled={isSavingGenAIConfig}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          {isSavingGenAIConfig ? 'Salvando...' : 'Salvar backend Google GenAI'}
                        </button>

                        <p className="text-xs text-gray-500 mt-3">
                          Projeto, Location e caminho opcional do JSON de Service Account ficam no card <strong>Google Vertex AI</strong> abaixo, logo após <strong>Google Gemini</strong>.
                        </p>
                     </div>

                     <div>
                        <h3 className="text-xl font-medium text-white mb-1">Modelo de Voz (TTS)</h3>
                        <p className="text-sm text-gray-500 mb-6">Escolha o serviço de síntese de voz para o modo clássico.</p>
                        
                        <div className="flex gap-4 mb-6">
                           <button 
                             onClick={() => handleVoiceModelChange('polly')}
                             className={`flex-1 py-4 border-2 rounded-xl flex flex-col items-center justify-center gap-2 transition-all ${
                               voiceModel === 'polly' 
                                 ? 'border-orange-600 bg-orange-900/10 text-white' 
                                 : 'border-[#333] bg-[#111] hover:bg-[#1a1a1a] text-gray-400 hover:text-white opacity-60'
                             }`}
                           >
                              <span className="text-2xl">🗣️</span>
                              <span className="font-semibold">Amazon Polly</span>
                              {voiceModel === 'polly' && <span className="text-xs bg-orange-600 px-2 py-0.5 rounded-full">Ativo</span>}
                           </button>
                           <button 
                             onClick={() => handleVoiceModelChange('elevenlabs')}
                             className={`flex-1 py-4 border-2 rounded-xl flex flex-col items-center justify-center gap-2 transition-all ${
                               voiceModel === 'elevenlabs' 
                                 ? 'border-green-600 bg-green-900/10 text-white' 
                                 : 'border-[#333] bg-[#111] hover:bg-[#1a1a1a] text-gray-400 hover:text-white opacity-60'
                             }`}
                           >
                              <span className="text-2xl">🎙️</span>
                              <span className="font-semibold">ElevenLabs</span>
                              {voiceModel === 'elevenlabs' && <span className="text-xs bg-green-600 px-2 py-0.5 rounded-full">Ativo</span>}
                           </button>
                        </div>

                        <div className="bg-orange-900/10 border border-orange-500/20 rounded-xl p-4 mb-6">
                           <div className="flex items-start gap-3">
                              <span className="text-xl">ℹ️</span>
                              <div>
                                 <h4 className="text-sm font-semibold text-orange-300 mb-1">Síntese de Voz</h4>
                                 <p className="text-xs text-orange-200/70">
                                    Esta configuração define qual serviço será usado para converter texto em voz no <strong>modo clássico</strong>. 
                                    O <strong>modo Live</strong> usa voz nativa do Gemini.
                                 </p>
                              </div>
                           </div>
                        </div>
                     </div>

                     <div>
                        <div className="flex items-start justify-between mb-4 gap-4">
                           <div>
                              <h3 className="text-lg font-medium text-white">Credenciais de API</h3>
                              <p className="text-xs text-gray-500 mt-1">
                                 Gerencie as chaves no banco local. Supabase não é editado aqui.
                              </p>
                           </div>
                           <button
                              onClick={loadApiCredentials}
                              disabled={isApiCredentialLoading}
                              className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 disabled:opacity-60 text-blue-400 rounded-lg text-xs font-medium transition-colors"
                           >
                              {isApiCredentialLoading ? 'Carregando...' : 'Atualizar'}
                           </button>
                        </div>

                        {apiCredentialError && (
                           <div className="mb-4 bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                              <p className="text-xs text-red-300">❌ {apiCredentialError}</p>
                           </div>
                        )}

                        {apiCredentialMessage && (
                           <div className="mb-4 bg-green-900/20 border border-green-500/30 rounded-lg p-3">
                              <p className="text-xs text-green-300">✅ {apiCredentialMessage}</p>
                           </div>
                        )}

                        <div className="space-y-4">
                           {API_SERVICE_ORDER.map((service) => {
                              const meta = API_SERVICE_META[service];
                              const serviceCredentials = apiCredentialsByService[service] || [];
                              const form = apiCredentialForms[service];
                              const editingId = editingApiCredentialByService[service];
                              const showForm = service === 'vertex' || meta.multi || serviceCredentials.length === 0 || Boolean(editingId);

                              return (
                                 <div key={service} className="bg-[#111] border border-[#222] rounded-xl p-4">
                                    <div className="flex items-center justify-between mb-3">
                                       <div className="flex items-center gap-2">
                                          <span className="text-lg">{meta.icon}</span>
                                          <h4 className="text-sm font-semibold text-white">{meta.label}</h4>
                                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                                            service === 'vertex'
                                              ? 'bg-emerald-500/20 text-emerald-300'
                                              : meta.multi
                                                ? 'bg-blue-500/20 text-blue-300'
                                                : 'bg-amber-500/20 text-amber-300'
                                          }`}>
                                            {service === 'vertex'
                                              ? 'Sem API key'
                                              : meta.multi
                                                ? 'Múltiplas chaves'
                                                : 'Chave única'}
                                          </span>
                                       </div>
                                        <span className="text-xs text-gray-500">
                                          {service === 'vertex'
                                            ? `Projeto: ${vertexProject || 'não configurado'} • Região: ${googleCloudLocation || DEFAULT_GOOGLE_CLOUD_LOCATION} • Auth: ${vertexCredentialsPath ? 'Arquivo JSON' : 'ADC'}`
                                            : `${serviceCredentials.length} ${serviceCredentials.length === 1 ? 'credencial' : 'credenciais'}`}
                                         </span>
                                      </div>

                                    <div className="space-y-2 mb-3">
                                      {service === 'vertex' ? (
                                        <p className="text-xs text-emerald-300/80">
                                          Vertex AI não usa API key. Configure Project/Location e, opcionalmente, um caminho para JSON de Service Account.
                                        </p>
                                      ) : serviceCredentials.length === 0 ? (
                                        <p className="text-xs text-gray-500">Nenhuma credencial cadastrada.</p>
                                      ) : (
                                        serviceCredentials.map((credential) => (
                                          <div
                                            key={credential.id}
                                            className={`border rounded-lg p-3 flex items-center justify-between gap-3 ${
                                              credential.isActive ? 'border-green-500/30 bg-green-900/10' : 'border-[#333] bg-black/20'
                                            }`}
                                          >
                                            <div className="min-w-0">
                                              <p className="text-sm text-white truncate">
                                                {credential.label || meta.label}
                                              </p>
                                              <p className="text-xs text-gray-500 mt-1 truncate">
                                                {service === 'aws_polly'
                                                  ? `Access Key: ${maskSecret(credential.accessKeyId)} • Região: ${credential.region || 'sa-east-1'}`
                                                  : `API Key: ${maskSecret(credential.apiKey)}`}
                                                {service === 'elevenlabs' && credential.voiceId
                                                  ? ` • Voice ID: ${credential.voiceId}`
                                                  : ''}
                                              </p>
                                            </div>

                                            <div className="flex items-center gap-2">
                                              {meta.multi && !credential.isActive && (
                                                <button
                                                  onClick={() => handleSetActiveApiCredential(service, credential.id)}
                                                  disabled={apiCredentialBusyAction === `active:${credential.id}`}
                                                  className="px-2.5 py-1 text-xs rounded-md bg-green-600/20 hover:bg-green-600/30 text-green-300 disabled:opacity-60"
                                                >
                                                  Ativar
                                                </button>
                                              )}

                                              <button
                                                onClick={() => handleEditApiCredential(service, credential)}
                                                disabled={Boolean(apiCredentialBusyAction)}
                                                className="px-2.5 py-1 text-xs rounded-md bg-white/10 hover:bg-white/20 text-gray-200 disabled:opacity-60"
                                              >
                                                Editar
                                              </button>

                                              <button
                                                onClick={() => handleDeleteApiCredential(service, credential.id)}
                                                disabled={apiCredentialBusyAction === `delete:${credential.id}`}
                                                className="px-2.5 py-1 text-xs rounded-md bg-red-600/20 hover:bg-red-600/30 text-red-300 disabled:opacity-60"
                                              >
                                                Excluir
                                              </button>
                                            </div>
                                          </div>
                                        ))
                                      )}
                                    </div>

                                    {showForm ? (
                                      <div className="border-t border-[#222] pt-3 space-y-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                          {service !== 'vertex' && (
                                            <input
                                              type="text"
                                              value={form.label}
                                              onChange={(e) => handleApiCredentialFieldChange(service, 'label', e.target.value)}
                                              placeholder={`Rótulo (${meta.label})`}
                                              className="bg-[#0a0a0a] text-white rounded-lg p-2.5 border border-[#333] text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                                            />
                                          )}

                                          {service !== 'aws_polly' && service !== 'vertex' && (
                                            <input
                                              type="password"
                                              value={form.apiKey}
                                              onChange={(e) => handleApiCredentialFieldChange(service, 'apiKey', e.target.value)}
                                              placeholder="API Key"
                                              className="bg-[#0a0a0a] text-white rounded-lg p-2.5 border border-[#333] text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                                            />
                                          )}

                                          {service === 'aws_polly' && (
                                            <>
                                              <input
                                                type="text"
                                                value={form.accessKeyId}
                                                onChange={(e) => handleApiCredentialFieldChange(service, 'accessKeyId', e.target.value)}
                                                placeholder="AWS Access Key ID"
                                                className="bg-[#0a0a0a] text-white rounded-lg p-2.5 border border-[#333] text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                                              />
                                              <input
                                                type="password"
                                                value={form.secretAccessKey}
                                                onChange={(e) => handleApiCredentialFieldChange(service, 'secretAccessKey', e.target.value)}
                                                placeholder="AWS Secret Access Key"
                                                className="bg-[#0a0a0a] text-white rounded-lg p-2.5 border border-[#333] text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                                              />
                                              <input
                                                type="text"
                                                value={form.region}
                                                onChange={(e) => handleApiCredentialFieldChange(service, 'region', e.target.value)}
                                                placeholder="Região (ex: sa-east-1)"
                                                className="bg-[#0a0a0a] text-white rounded-lg p-2.5 border border-[#333] text-sm focus:ring-1 focus:ring-blue-500 outline-none md:col-span-2"
                                              />
                                            </>
                                          )}

                                          {service === 'elevenlabs' && (
                                            <input
                                              type="text"
                                              value={form.voiceId}
                                              onChange={(e) => handleApiCredentialFieldChange(service, 'voiceId', e.target.value)}
                                              placeholder="Voice ID (opcional)"
                                              className="bg-[#0a0a0a] text-white rounded-lg p-2.5 border border-[#333] text-sm focus:ring-1 focus:ring-blue-500 outline-none md:col-span-2"
                                            />
                                          )}

                                          {service === 'vertex' && (
                                            <>
                                              <input
                                                type="text"
                                                value={vertexProject}
                                                onChange={(e) => setVertexProject(e.target.value)}
                                                placeholder="Vertex Project (obrigatório)"
                                                className="bg-[#0a0a0a] text-white rounded-lg p-2.5 border border-[#333] text-sm focus:ring-1 focus:ring-emerald-500 outline-none md:col-span-2"
                                              />
                                              <input
                                                type="text"
                                                value={googleCloudLocation}
                                                onChange={(e) => setGoogleCloudLocation(e.target.value)}
                                                placeholder={`Google Cloud Location (padrão: ${DEFAULT_GOOGLE_CLOUD_LOCATION})`}
                                                className="bg-[#0a0a0a] text-white rounded-lg p-2.5 border border-[#333] text-sm focus:ring-1 focus:ring-emerald-500 outline-none md:col-span-2"
                                              />
                                              <input
                                                type="text"
                                                value={vertexCredentialsPath}
                                                onChange={(e) => setVertexCredentialsPath(e.target.value)}
                                                placeholder="Caminho opcional do JSON de Service Account (ex: C:\\chaves\\vertex-sa.json)"
                                                className="bg-[#0a0a0a] text-white rounded-lg p-2.5 border border-[#333] text-sm focus:ring-1 focus:ring-emerald-500 outline-none md:col-span-2"
                                              />
                                              <p className="text-[11px] text-gray-500 md:col-span-2">
                                                Se vazio, o app usa ADC automaticamente (ex: <code>gcloud auth application-default login</code>).
                                              </p>
                                            </>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => handleSaveApiCredential(service)}
                                            disabled={apiCredentialBusyAction === `save:${service}`}
                                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-xs font-medium transition-colors"
                                          >
                                            {apiCredentialBusyAction === `save:${service}`
                                              ? 'Salvando...'
                                              : service === 'vertex'
                                                ? 'Salvar configuração'
                                                : editingId
                                                ? 'Atualizar credencial'
                                                : `Salvar ${meta.multi ? 'nova chave' : 'chave'}`}
                                          </button>

                                          {editingId && service !== 'vertex' && (
                                            <button
                                              onClick={() => resetApiCredentialForm(service)}
                                              className="px-3 py-2 bg-white/10 hover:bg-white/20 text-gray-200 rounded-lg text-xs font-medium transition-colors"
                                            >
                                              Cancelar edição
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="border-t border-[#222] pt-3">
                                        <p className="text-xs text-amber-300/80">
                                          Este serviço aceita apenas 1 credencial. Use "Editar" para atualizar os dados.
                                        </p>
                                      </div>
                                    )}
                                 </div>
                              );
                           })}
                        </div>
                     </div>
                  </div>
                )}

                {/* --- Áudio e Tela --- */}
                {activeTab === 'audio' && (
                   <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      
                      {/* Gravação Contínua */}
                      <div className="space-y-4">
                         <h3 className="text-sm uppercase tracking-wider text-gray-500 font-semibold border-b border-[#222] pb-2">Gravação de Tela</h3>
                         
                         <div className="bg-gradient-to-r from-red-900/20 to-orange-900/20 p-4 rounded-xl border border-red-500/20">
                            <div className="flex items-center justify-between mb-4">
                               <div>
                                  <h4 className="font-semibold text-white">Gravação Contínua (Buffer)</h4>
                                  <p className="text-xs text-gray-400 mt-1">
                                     Mantém os últimos 10 minutos em memória para replay instantâneo
                                  </p>
                               </div>
                               <button 
                                 onClick={handleContinuousRecordingToggle}
                                 className={`w-12 h-6 rounded-full transition-colors relative ${
                                   continuousRecordingEnabled 
                                     ? 'bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]' 
                                     : 'bg-gray-600'
                                 }`}
                               >
                                 <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                   continuousRecordingEnabled ? 'left-7' : 'left-1'
                                 }`} />
                               </button>
                            </div>

                            {continuousRecordingEnabled && (
                               <div className="space-y-3 pt-3 border-t border-white/10">
                                  {/* Status Info */}
                                  <div className="flex items-center justify-between text-sm">
                                     <span className="text-red-200 flex items-center gap-2">
                                        {isRecording ? (
                                          <>
                                            <span className="relative flex h-2 w-2">
                                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                            </span>
                                            Gravando
                                          </>
                                        ) : (
                                          <>⏸️ Pausado</>
                                        )}
                                     </span>
                                     {getBufferInfo && (
                                        <span className="text-xs text-orange-300">
                                           📦 Buffer: {Math.floor(getBufferInfo().duration)}s / 600s
                                        </span>
                                     )}
                                  </div>
                                  
                                  {/* Info */}
                                  <div className="bg-black/30 rounded-lg p-3">
                                     <p className="text-xs text-amber-200">
                                        ℹ️ A gravação contínua salva automaticamente quando você pede para "salvar os últimos X segundos". 
                                        Nenhum arquivo é criado até você solicitar o replay.
                                     </p>
                                  </div>
                               </div>
                            )}

                            {!continuousRecordingEnabled && (
                               <div className="pt-3 border-t border-white/10">
                                  <p className="text-xs text-gray-500">
                                     ⚠️ Com a gravação desativada, você não poderá usar a função de replay dos últimos segundos.
                                  </p>
                               </div>
                            )}
                         </div>
                      </div>

                      {/* Placeholder para futuras configurações */}
                      <div className="opacity-30">
                         <h3 className="text-sm uppercase tracking-wider text-gray-500 font-semibold border-b border-[#222] pb-2 mb-4">Dispositivos de Áudio</h3>
                         <p className="text-xs text-gray-500">Em breve: Seleção de microfone e alto-falantes</p>
                      </div>
                   </div>
                )}

                {/* --- Avatar --- */}
                {activeTab === 'avatar' && (
                   <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      
                      {/* Section: Aparência do Avatar */}
                      <div className="space-y-4">
                         <h3 className="text-sm uppercase tracking-wider text-gray-500 font-semibold border-b border-[#222] pb-2">Aparência do Avatar</h3>
                         
                         <div className="grid grid-cols-2 gap-6">
                            <div>
                               <label className="block text-sm font-medium text-gray-300 mb-2">Modelo Live2D</label>
                               <select 
                                 value={selectedModel}
                                 onChange={(e) => onModelChange(e.target.value)}
                                 className="w-full bg-[#111] text-white rounded-lg p-3 border border-[#333] text-sm focus:ring-1 focus:ring-blue-500 outline-none hover:border-gray-500 transition-colors"
                               >
                                 {models.map(model => (
                                   <option key={model} value={model}>{model}</option>
                                 ))}
                               </select>
                            </div>

                            <div>
                              <div className="flex justify-between mb-2">
                                <label className="text-sm font-medium text-gray-300">Tamanho</label>
                                <span className="text-xs bg-[#222] px-2 py-0.5 rounded text-gray-400">{size}x</span>
                              </div>
                              <input 
                                type="range" 
                                min="0.5" 
                                max="2" 
                                step="0.1" 
                                value={size} 
                                onChange={handleSizeChange}
                                className="w-full accent-blue-600 h-1.5 bg-[#222] rounded-lg appearance-none cursor-pointer"
                              />
                            </div>
                         </div>
                      </div>
                   </div>
                )}

                {/* --- Recursos (REAL SETTINGS) --- */}
                {activeTab === 'features' && (
                   <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">

                      {/* Section: Janela e Comportamento */}
                      <div className="space-y-4">
                        <h3 className="text-sm uppercase tracking-wider text-gray-500 font-semibold border-b border-[#222] pb-2">Janela e Comportamento</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {/* Drag Toggle */}
                           <div className="flex items-center justify-between p-3 bg-[#111] rounded-lg border border-[#222]">
                             <span className="text-sm text-gray-300">Mover com Mouse</span>
                             <button onClick={handleDragToggle} className={`w-10 h-5 rounded-full transition-colors relative ${dragEnabled ? 'bg-green-600' : 'bg-gray-600'}`}>
                               <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${dragEnabled ? 'left-6' : 'left-1'}`} />
                             </button>
                           </div>



                           {/* Always On Top Toggle */}
                           <div className="flex items-center justify-between p-3 bg-[#111] rounded-lg border border-[#222]">
                             <span className="text-sm text-gray-300">Sobrepor Janelas</span>
                             <button onClick={handleAlwaysOnTopToggle} className={`w-10 h-5 rounded-full transition-colors relative ${alwaysOnTop ? 'bg-green-600' : 'bg-gray-600'}`}>
                               <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${alwaysOnTop ? 'left-6' : 'left-1'}`} />
                             </button>
                           </div>
                        </div>
                      </div>

                      {/* Section: Assistente e IA */}
                      <div className="space-y-4">
                         <h3 className="text-sm uppercase tracking-wider text-gray-500 font-semibold border-b border-[#222] pb-2">Modo Assistente</h3>
                         
                         <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 p-4 rounded-xl border border-purple-500/20">
                            <div className="flex items-center justify-between mb-4">
                               <div>
                                  <h4 className="font-semibold text-white">Modo Gemini Live</h4>
                                  <p className="text-xs text-gray-400 mt-1">Interação em tempo real com visão e voz</p>
                               </div>
                               <button 
                                 onClick={handleModeToggle}
                                 className={`w-12 h-6 rounded-full transition-colors relative ${assistantMode === 'live' ? 'bg-purple-600 shadow-[0_0_10px_rgba(147,51,234,0.5)]' : 'bg-gray-600'}`}
                               >
                                 <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${assistantMode === 'live' ? 'left-7' : 'left-1'}`} />
                               </button>
                            </div>

                            {assistantMode === 'live' && (
                               <div className="space-y-3 pt-2 border-t border-white/10">
                                  {/* Screen Share Control */}
                                  <div className="flex items-center justify-between">
                                     <span className="text-sm text-purple-200 flex items-center gap-2">🖥️ Compartilhar Visão da Tela</span>
                                     <button onClick={() => isSharing ? stopSharing() : startSharing()} className={`w-10 h-5 rounded-full transition-colors relative ${isSharing ? 'bg-blue-500' : 'bg-gray-600'}`}>
                                       <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${isSharing ? 'left-6' : 'left-1'}`} />
                                     </button>
                                  </div>
                                  
                                  {/* Manual Save Button */}
                                  {/* <button 
                                    onClick={async () => {
                                       const path = await saveLastSeconds(30);
                                       if (path) alert(`Gravação salva em: ${path}`);
                                    }}
                                    className="w-full mt-2 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs text-white font-medium transition-colors flex items-center justify-center gap-2"
                                  >
                                     <span>💾</span> Salvar Replay (Últimos 30s)
                                  </button> */}
                               </div>
                            )}
                         </div>
                      </div>

                   </div>
                )}

                {/* --- Atalhos (MOCKED) --- */}
                {activeTab === 'shortcuts' && (
                   <div className="space-y-4 opacity-90 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <h3 className="text-xl font-medium text-white mb-6">Atalhos de Teclado</h3>
                      <div className="grid grid-cols-1 gap-3">
                         <div className="flex justify-between items-center bg-[#111] p-3 rounded-lg border border-[#222]">
                            <span className="text-gray-300">Abrir Barra de Ação</span>
                            <div className="flex gap-1"><kbd className="bg-[#333] px-2 py-1 rounded text-xs text-white border border-[#444]">Ctrl</kbd> <kbd className="bg-[#333] px-2 py-1 rounded text-xs text-white border border-[#444]">M</kbd></div>
                         </div>
                         <div className="flex justify-between items-center bg-[#111] p-3 rounded-lg border border-[#222]">
                            <span className="text-gray-300">Começar a Ouvir</span>
                            <div className="flex gap-1"><kbd className="bg-[#333] px-2 py-1 rounded text-xs text-white border border-[#444]">Ctrl</kbd> <kbd className="bg-[#333] px-2 py-1 rounded text-xs text-white border border-[#444]">D</kbd></div>
                         </div>
                         <div className="flex justify-between items-center bg-[#111] p-3 rounded-lg border border-[#222]">
                            <span className="text-gray-300">Alternar Microfone</span>
                            <div className="flex gap-1"><kbd className="bg-[#333] px-2 py-1 rounded text-xs text-white border border-[#444]">Ctrl</kbd> <kbd className="bg-[#333] px-2 py-1 rounded text-xs text-white border border-[#444]">Shift</kbd> <kbd className="bg-[#333] px-2 py-1 rounded text-xs text-white border border-[#444]">M</kbd></div>
                         </div>
                      </div>
                   </div>
                )}

                {/* --- Embeddings --- */}
                {activeTab === 'embeddings' && (
                   <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div>
                         <h3 className="text-xl font-medium text-white mb-1">Provider de Embeddings</h3>
                         <p className="text-sm text-gray-500 mb-6">Escolha como gerar embeddings para a base de conhecimento.</p>
                         
                         <div className="flex gap-4 mb-8">
                            <button 
                              onClick={() => handleEmbeddingProviderChange('openai')}
                              className={`flex-1 py-4 border-2 rounded-xl flex flex-col items-center justify-center gap-2 transition-all ${
                                embeddingProvider === 'openai' 
                                  ? 'border-green-600 bg-green-900/10 text-white' 
                                  : 'border-[#333] bg-[#111] hover:bg-[#1a1a1a] text-gray-400 hover:text-white opacity-60'
                              }`}
                            >
                               <span className="text-2xl">☁️</span>
                               <span className="font-semibold">OpenAI</span>
                               <span className="text-xs text-gray-500">Via API (requer chave)</span>
                               {embeddingProvider === 'openai' && <span className="text-xs bg-green-600 px-2 py-0.5 rounded-full">Ativo</span>}
                            </button>
                            <button 
                              onClick={() => handleEmbeddingProviderChange('ollama')}
                              className={`flex-1 py-4 border-2 rounded-xl flex flex-col items-center justify-center gap-2 transition-all ${
                                embeddingProvider === 'ollama' 
                                  ? 'border-purple-600 bg-purple-900/10 text-white' 
                                  : 'border-[#333] bg-[#111] hover:bg-[#1a1a1a] text-gray-400 hover:text-white opacity-60'
                              }`}
                            >
                               <span className="text-2xl">🦙</span>
                               <span className="font-semibold">Ollama (Local)</span>
                               <span className="text-xs text-gray-500">Gratuito, usa GPU</span>
                               {embeddingProvider === 'ollama' && <span className="text-xs bg-purple-600 px-2 py-0.5 rounded-full">Ativo</span>}
                            </button>
                         </div>
                      </div>

                      {/* Configurações do Ollama */}
                      {embeddingProvider === 'ollama' && (
                         <div className="space-y-4">
                            <h3 className="text-sm uppercase tracking-wider text-gray-500 font-semibold border-b border-[#222] pb-2">Configuração do Ollama</h3>
                            
                            {/* Status do Ollama */}
                            <div className="bg-gradient-to-r from-purple-900/20 to-pink-900/20 p-4 rounded-xl border border-purple-500/20">
                               <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-3">
                                     <span className="text-2xl">🦙</span>
                                     <div>
                                        <h4 className="font-semibold text-white">Status do Ollama</h4>
                                        <p className="text-xs text-gray-400">Servidor local para modelos de IA</p>
                                     </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                     {ollamaStatus === 'checking' && (
                                        <span className="flex items-center gap-2 text-gray-400 text-sm">
                                           <span className="animate-spin">⟳</span> Verificando...
                                        </span>
                                     )}
                                     {ollamaStatus === 'running' && (
                                        <span className="flex items-center gap-2 text-green-400 text-sm">
                                           <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> Conectado
                                        </span>
                                     )}
                                     {ollamaStatus === 'stopped' && (
                                        <span className="flex items-center gap-2 text-red-400 text-sm">
                                           <span className="w-2 h-2 bg-red-500 rounded-full"></span> Não conectado
                                        </span>
                                     )}
                                     <button 
                                        onClick={checkOllamaStatus}
                                        className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                                        title="Atualizar status"
                                     >
                                        🔄
                                     </button>
                                  </div>
                               </div>

                               {ollamaStatus === 'stopped' && (
                                  <div className="mt-3">
                                    {ollamaInstalled === false ? (
                                      /* Ollama NÃO está instalado */
                                      <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                                        <p className="text-xs text-red-300 mb-2">
                                          ⚠️ Ollama não está instalado. Para usar embeddings locais:
                                        </p>
                                        <ol className="text-xs text-red-200/70 list-decimal list-inside space-y-1">
                                          <li>Baixe e instale o Ollama em <a href="https://ollama.ai" target="_blank" className="text-blue-400 underline">ollama.ai</a></li>
                                          <li>Após instalar, clique em 🔄 para verificar novamente</li>
                                        </ol>
                                      </div>
                                    ) : (
                                      /* Ollama ESTÁ instalado mas parado */
                                      <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 space-y-3">
                                        <p className="text-xs text-amber-300">
                                          🦙 Ollama está instalado mas o servidor não está rodando.
                                        </p>
                                        
                                        {/* Baixar modelo mesmo com servidor parado */}
                                        <div className="bg-[#111] rounded-lg p-3 border border-[#333]">
                                          <label className="block text-xs font-medium text-gray-300 mb-2">Baixar modelo de embedding:</label>
                                          <div className="flex gap-2">
                                            <select 
                                              value={selectedOllamaModel}
                                              onChange={(e) => setSelectedOllamaModel(e.target.value)}
                                              className="flex-1 bg-[#0a0a0a] text-white rounded-lg p-2 border border-[#444] text-sm focus:ring-1 focus:ring-purple-500 outline-none"
                                            >
                                              <option value="nomic-embed-text">nomic-embed-text (Recomendado)</option>
                                              <option value="all-minilm">all-minilm (Mais leve)</option>
                                              <option value="mxbai-embed-large">mxbai-embed-large (Maior qualidade)</option>
                                            </select>
                                            <button
                                              onClick={() => handleDownloadOllamaModel(selectedOllamaModel)}
                                              disabled={isDownloadingModel}
                                              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                                            >
                                              {isDownloadingModel ? (
                                                <>
                                                  <span className="animate-spin">⟳</span>
                                                  Baixando...
                                                </>
                                              ) : (
                                                <>⬇️ Baixar</>
                                              )}
                                            </button>
                                          </div>
                                          
                                          {downloadProgress && (
                                            <div className="mt-2 pt-2 border-t border-[#333]">
                                              <p className="text-xs text-purple-300">{downloadProgress}</p>
                                            </div>
                                          )}
                                          
                                          {/* Modelos já baixados */}
                                          {ollamaModels.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-[#333]">
                                              <p className="text-xs text-gray-400 mb-1">Modelos instalados:</p>
                                              <div className="flex flex-wrap gap-1">
                                                {ollamaModels.map(m => (
                                                  <span key={m} className="px-2 py-0.5 bg-green-900/30 text-green-400 rounded text-xs">
                                                    ✅ {m}
                                                  </span>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                        
                                        <p className="text-xs text-gray-500">
                                          💡 Os modelos serão baixados automaticamente. Depois de baixar, execute <code className="bg-black/30 px-1 rounded">ollama serve</code> no terminal para ativar o servidor.
                                        </p>
                                      </div>
                                    )}
                                  </div>
                               )}
                            </div>

                            {/* Modelos de Embedding */}
                            {ollamaStatus === 'running' && (
                               <div className="space-y-4">
                                  {/* Seleção de modelo */}
                                  <div>
                                     <label className="block text-sm font-medium text-gray-300 mb-2">Modelo de Embedding</label>
                                     <select 
                                       value={selectedOllamaModel}
                                       onChange={(e) => handleOllamaModelChange(e.target.value)}
                                       className="w-full bg-[#111] text-white rounded-lg p-3 border border-[#333] text-sm focus:ring-1 focus:ring-purple-500 outline-none hover:border-gray-500 transition-colors"
                                     >
                                       <option value="nomic-embed-text">nomic-embed-text (Recomendado)</option>
                                       <option value="all-minilm">all-minilm (Mais leve)</option>
                                       <option value="mxbai-embed-large">mxbai-embed-large (Maior qualidade)</option>
                                       {ollamaModels.filter(m => !['nomic-embed-text', 'all-minilm', 'mxbai-embed-large'].includes(m.split(':')[0])).map(model => (
                                         <option key={model} value={model}>{model}</option>
                                       ))}
                                     </select>
                                  </div>

                                  {/* Status do modelo selecionado */}
                                  <div className="bg-[#111] border border-[#222] rounded-xl p-4">
                                     <div className="flex items-center justify-between">
                                        <div>
                                           <h4 className="font-medium text-white">{selectedOllamaModel}</h4>
                                           <p className="text-xs text-gray-500 mt-1">
                                              {ollamaModels.some(m => m.startsWith(selectedOllamaModel.split(':')[0])) 
                                                 ? '✅ Modelo instalado' 
                                                 : '⬇️ Modelo não instalado'}
                                           </p>
                                        </div>
                                        
                                        {!ollamaModels.some(m => m.startsWith(selectedOllamaModel.split(':')[0])) && (
                                           <button
                                              onClick={() => handleDownloadOllamaModel(selectedOllamaModel)}
                                              disabled={isDownloadingModel}
                                              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                                           >
                                              {isDownloadingModel ? (
                                                 <>
                                                    <span className="animate-spin">⟳</span>
                                                    Baixando...
                                                 </>
                                              ) : (
                                                 <>
                                                    <span>⬇️</span>
                                                    Baixar Modelo
                                                 </>
                                              )}
                                           </button>
                                        )}
                                     </div>

                                     {downloadProgress && (
                                        <div className="mt-3 pt-3 border-t border-[#222]">
                                           <p className="text-xs text-purple-300">{downloadProgress}</p>
                                        </div>
                                     )}
                                  </div>

                                  {/* Modelos instalados */}
                                  {ollamaModels.length > 0 && (
                                     <div>
                                        <h4 className="text-sm font-medium text-gray-300 mb-2">Modelos Instalados</h4>
                                        <div className="flex flex-wrap gap-2">
                                           {ollamaModels.map(model => (
                                              <span 
                                                 key={model} 
                                                 className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                                                    selectedOllamaModel === model || selectedOllamaModel.split(':')[0] === model.split(':')[0]
                                                       ? 'bg-purple-600 text-white'
                                                       : 'bg-[#222] text-gray-400 hover:bg-[#333]'
                                                 }`}
                                                 onClick={() => handleOllamaModelChange(model)}
                                              >
                                                 🦙 {model}
                                              </span>
                                           ))}
                                        </div>
                                     </div>
                                  )}
                               </div>
                            )}
                         </div>
                      )}

                      {/* Info sobre OpenAI */}
                      {embeddingProvider === 'openai' && (
                         <div className="bg-green-900/10 border border-green-500/20 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                               <span className="text-xl">ℹ️</span>
                               <div>
                                 <h4 className="text-sm font-semibold text-green-300 mb-1">OpenAI Embeddings</h4>
                                 <p className="text-xs text-green-200/70">
                                    Usando o modelo <strong>text-embedding-3-small</strong>. 
                                    Certifique-se de ter uma credencial ativa de OpenAI na aba <strong>API e Modelos</strong>.
                                 </p>
                               </div>
                            </div>
                         </div>
                      )}
                   </div>
                )}

                {/* --- Providers (Modelos Web via Puppeteer) --- */}
                {activeTab === 'providers' && (
                   <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div>
                         <h3 className="text-xl font-medium text-white mb-1">Modelos de IA via Navegador</h3>
                         <p className="text-sm text-gray-500 mb-6">
                            Configure contas para usar modelos de IA diretamente pelo navegador, sem necessidade de API.
                         </p>
                         
                         {/* Info Box */}
                         <div className="bg-blue-900/10 border border-blue-500/20 rounded-xl p-4 mb-6">
                            <div className="flex items-start gap-3">
                               <span className="text-xl">🌐</span>
                               <div>
                                  <h4 className="text-sm font-semibold text-blue-300 mb-1">Como funciona?</h4>
                                  <p className="text-xs text-blue-200/70">
                                     Diferente das APIs, esses providers usam o navegador Chrome para acessar 
                                     as versões web dos modelos de IA. Você faz login uma vez e os cookies 
                                     são salvos para uso posterior.
                                  </p>
                               </div>
                            </div>
                         </div>

                         {/* Criar novo provider */}
                         <div className="bg-[#111] border border-[#222] rounded-xl p-4 mb-6">
                            <h4 className="text-sm font-semibold text-white mb-3">➕ Adicionar Nova Conta</h4>
                            
                            <div className="flex gap-3 mb-3">
                               <input
                                  type="text"
                                  value={newProviderName}
                                  onChange={(e) => setNewProviderName(e.target.value)}
                                  placeholder="Nome da conta (ex: Minha conta pessoal)"
                                  className="flex-1 bg-[#0a0a0a] text-white rounded-lg p-2.5 border border-[#333] text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                               />
                               
                               <select
                                  value={newProviderPlatform}
                                  onChange={(e) => setNewProviderPlatform(e.target.value as ProviderPlatform)}
                                  className="w-48 bg-[#0a0a0a] text-white rounded-lg p-2.5 border border-[#333] text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                               >
                                  <option value="gemini">⚡ Google Gemini</option>
                                  <option value="openai">🤖 OpenAI ChatGPT</option>
                                  <option value="qwen">🧠 Qwen</option>
                               </select>
                               
                               <button
                                  onClick={handleCreateProvider}
                                  disabled={isCreatingProvider}
                                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                               >
                                  {isCreatingProvider ? (
                                     <>
                                        <span className="animate-spin">⟳</span>
                                        Criando...
                                     </>
                                  ) : (
                                     <>➕ Adicionar</>
                                  )}
                               </button>
                            </div>

                            {providerError && (
                               <p className="text-xs text-red-400 mt-2">❌ {providerError}</p>
                            )}
                         </div>

                         {/* Lista de providers */}
                         <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-gray-400 mb-2">Contas Configuradas</h4>
                            
                            {providers.length === 0 ? (
                               <div className="text-center py-8 bg-[#111] border border-[#222] rounded-xl">
                                  <span className="text-4xl mb-3 block">🌐</span>
                                  <p className="text-gray-400 text-sm">Nenhuma conta configurada</p>
                                  <p className="text-gray-500 text-xs mt-1">Adicione uma conta acima para começar</p>
                               </div>
                            ) : (
                               providers.map((provider) => {
                                  const config = getPlatformConfig(provider.platform);
                                  const isGemini = provider.platform === 'gemini';
                                  const showBrowser = provider.showBrowser !== false;
                                  const isBrowserOpen = provider.isBrowserOpen === true;
                                  const isVisibilityUpdating = isUpdatingProviderVisibility === provider.id;
                                  const isClosingBrowser = isClosingProvider === provider.id;
                                  const isCloseHover = hoveredOpenProvider === provider.id && isBrowserOpen;
                                  const isProviderBusy = isOpeningProvider === provider.id || isVisibilityUpdating || isClosingBrowser;

                                  return (
                                     <div
                                        key={provider.id}
                                        className={`${config.bgColor} border border-[#333] rounded-xl p-4`}
                                     >
                                        <div className="flex items-center justify-between">
                                           <div className="flex items-center gap-3">
                                              <span className="text-2xl">{config.icon}</span>
                                              <div>
                                                 <h5 className="font-semibold text-white">{provider.name}</h5>
                                                 <p className="text-xs text-gray-400">
                                                    {config.label}
                                                    {provider.lastUsed && (
                                                       <span className="ml-2">
                                                          • Último uso: {new Date(provider.lastUsed).toLocaleDateString('pt-BR')}
                                                       </span>
                                                    )}
                                                 </p>
                                              </div>
                                           </div>
                                          
                                           <div className="flex items-center gap-2">
                                              {isGemini && (
                                                 <div className="flex items-center gap-2 mr-1">
                                                    <span className="text-[11px] text-gray-400">Navegador</span>
                                                    <button
                                                       type="button"
                                                       onClick={() => handleToggleProviderBrowserVisibility(provider.id, !showBrowser)}
                                                       disabled={isVisibilityUpdating}
                                                       className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
                                                          showBrowser ? 'bg-emerald-500/80' : 'bg-white/20'
                                                       } ${isVisibilityUpdating ? 'opacity-60 cursor-not-allowed' : ''}`}
                                                       title={showBrowser ? 'Navegador do Gemini visível' : 'Navegador do Gemini oculto (headless)'}
                                                       aria-pressed={showBrowser}
                                                    >
                                                       <span
                                                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                                             showBrowser ? 'translate-x-5' : 'translate-x-1'
                                                          }`}
                                                       />
                                                    </button>
                                                    <span className={`text-[11px] ${showBrowser ? 'text-emerald-300' : 'text-gray-400'}`}>
                                                       {showBrowser ? 'Aparecer' : 'Oculto'}
                                                    </span>
                                                 </div>
                                              )}

                                              {/* Status do navegador (aberto/fechado) + ação de fechar */}
                                              <button
                                                 type="button"
                                                 onClick={() => {
                                                    if (isBrowserOpen && !isProviderBusy) {
                                                       handleCloseProvider(provider.id);
                                                    }
                                                 }}
                                                 onMouseEnter={() => {
                                                    if (isBrowserOpen) {
                                                       setHoveredOpenProvider(provider.id);
                                                    }
                                                 }}
                                                 onMouseLeave={() => {
                                                    setHoveredOpenProvider(prev => (prev === provider.id ? null : prev));
                                                 }}
                                                 disabled={!isBrowserOpen || isProviderBusy}
                                                 className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                                    isBrowserOpen
                                                       ? isCloseHover
                                                          ? 'bg-red-600 hover:bg-red-700 text-white'
                                                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                                       : 'bg-red-700/80 text-white/90 cursor-default'
                                                 } ${isProviderBusy && isBrowserOpen ? 'opacity-70 cursor-wait' : ''}`}
                                                 title={isBrowserOpen ? 'Clique para fechar o navegador deste provider' : 'Navegador fechado'}
                                              >
                                                 {isClosingBrowser ? (
                                                    <span className="animate-spin">⟳</span>
                                                 ) : isBrowserOpen ? (
                                                    isCloseHover ? 'Fechar' : 'Aberto'
                                                 ) : (
                                                    'Fechado'
                                                 )}
                                              </button>

                                              {/* Status de login */}
                                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                 provider.isLoggedIn 
                                                    ? 'bg-green-500/20 text-green-400' 
                                                    : 'bg-gray-500/20 text-gray-400'
                                              }`}>
                                                 {provider.isLoggedIn ? '✓ Logado' : '○ Não logado'}
                                              </span>
                                              
                                              {/* Botão de abrir/login */}
                                              <button
                                                 onClick={() => handleOpenProvider(provider.id)}
                                                 disabled={isProviderBusy}
                                                 className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                                    provider.isLoggedIn
                                                       ? 'bg-white/10 hover:bg-white/20 text-white'
                                                       : 'bg-blue-600 hover:bg-blue-700 text-white'
                                                 }`}
                                              >
                                                 {isOpeningProvider === provider.id ? (
                                                    <span className="animate-spin">⟳</span>
                                                 ) : provider.isLoggedIn ? (
                                                    '🌐 Abrir'
                                                 ) : (
                                                    '🔑 Fazer Login'
                                                 )}
                                              </button>
                                              
                                              {/* Botão de deletar */}
                                              <button
                                                 onClick={() => handleDeleteProvider(provider.id)}
                                                 disabled={isProviderBusy}
                                                 className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                 title="Remover conta"
                                              >
                                                 🗑️
                                              </button>
                                           </div>
                                        </div>
                                     </div>
                                  );
                               })
                            )}
                         </div>
                      </div>
                   </div>
                )}

                {/* --- Ajuda & Dados --- */}
                {activeTab === 'help' && (
                   <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div>
                         <h3 className="text-xl font-medium text-white mb-2">💾 Banco de Dados</h3>
                         <p className="text-sm text-gray-400 mb-6">Gerencie seus dados e configurações salvas</p>
                         
                         {/* Estatísticas */}
                         <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 border border-blue-500/20 rounded-xl p-6 mb-6">
                            <div className="flex items-center justify-between mb-4">
                               <h4 className="text-lg font-semibold text-white">📊 Estatísticas</h4>
                               <button 
                                  onClick={loadDatabaseStats}
                                  className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-xs font-medium transition-colors"
                               >
                                  🔄 Atualizar
                               </button>
                            </div>
                            
                            {dbStats ? (
                               <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <div className="bg-black/30 rounded-lg p-4 text-center">
                                     <div className="text-2xl font-bold text-blue-400">{dbStats.conversationCount || 0}</div>
                                     <div className="text-xs text-gray-400 mt-1">💬 Conversas</div>
                                  </div>
                                  <div className="bg-black/30 rounded-lg p-4 text-center">
                                     <div className="text-2xl font-bold text-purple-400">{dbStats.recordingCount || 0}</div>
                                     <div className="text-xs text-gray-400 mt-1">🎥 Gravações</div>
                                  </div>
                                  <div className="bg-black/30 rounded-lg p-4 text-center">
                                     <div className="text-2xl font-bold text-green-400">{dbStats.screenshotCount || 0}</div>
                                     <div className="text-xs text-gray-400 mt-1">📸 Screenshots</div>
                                  </div>
                                  <div className="bg-black/30 rounded-lg p-4 text-center">
                                     <div className="text-2xl font-bold text-amber-400">✓</div>
                                     <div className="text-xs text-gray-400 mt-1">⚙️ Configurado</div>
                                  </div>
                               </div>
                            ) : (
                               <div className="text-center py-8 text-gray-500">
                                  <p className="mb-4">Clique em "Atualizar" para carregar as estatísticas</p>
                               </div>
                            )}
                            
                            {dbStats && (
                               <div className="mt-4 pt-4 border-t border-white/10">
                                  <p className="text-xs text-gray-500">
                                     📁 Localização: <code className="text-blue-400">{dbStats.path}</code>
                                  </p>
                               </div>
                            )}
                         </div>
                         
                         {/* Ações */}
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button 
                               onClick={handleExportData}
                               className="p-4 bg-[#111] hover:bg-[#1a1a1a] border border-[#222] rounded-xl text-left transition-colors group"
                            >
                               <div className="flex items-center gap-3 mb-2">
                                  <span className="text-2xl">📦</span>
                                  <h4 className="font-bold text-white group-hover:text-blue-400 transition-colors">Exportar Dados</h4>
                               </div>
                               <p className="text-xs text-gray-500">Salve um backup completo em JSON</p>
                            </button>
                            
                            <button 
                               onClick={handleClearHistory}
                               className="p-4 bg-[#111] hover:bg-red-900/20 border border-[#222] hover:border-red-500/30 rounded-xl text-left transition-colors group"
                            >
                               <div className="flex items-center gap-3 mb-2">
                                  <span className="text-2xl">🗑️</span>
                                  <h4 className="font-bold text-white group-hover:text-red-400 transition-colors">Limpar Histórico</h4>
                               </div>
                               <p className="text-xs text-gray-500">Remove todas as conversas salvas</p>
                            </button>
                         </div>
                      </div>
                      
                      {/* Seção de Ajuda */}
                      <div className="pt-6 border-t border-[#222]">
                         <h3 className="text-xl font-medium text-white mb-4">❓ Precisa de Ajuda?</h3>
                         <div className="grid grid-cols-2 gap-4">
                            <button className="p-4 bg-[#111] hover:bg-[#1a1a1a] border border-[#222] rounded-xl text-left transition-colors">
                               <h4 className="font-bold text-white mb-1">📚 Documentação</h4>
                               <p className="text-xs text-gray-500">Guias completos e tutoriais</p>
                            </button>
                            <button className="p-4 bg-[#111] hover:bg-[#1a1a1a] border border-[#222] rounded-xl text-left transition-colors">
                               <h4 className="font-bold text-white mb-1">💬 Suporte</h4>
                               <p className="text-xs text-gray-500">Fale com nossa equipe</p>
                            </button>
                         </div>
                      </div>
                   </div>
                )}
             </div>
          </div>
          
          {/* Footer */}
          <div className="h-16 bg-[#0a0a0a] border-t border-[#222] flex items-center justify-between px-6">
             <button 
               onClick={() => window.electron.quitApp()} 
               className="text-gray-500 hover:text-red-500 transition-colors" 
               title="Fechar Aplicação"
             >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                   <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                   <polyline points="16 17 21 12 16 7"></polyline>
                   <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
             </button>
             <button onClick={onClose} className="bg-white text-black hover:bg-gray-200 px-6 py-2 rounded-lg font-medium text-sm transition-colors shadow-lg">
                Salvar
             </button>
          </div>
        </div>
      )}
    </div>
  );
}
