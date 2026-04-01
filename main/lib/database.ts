import Store from 'electron-store';
import { getUserDataPath } from './app-config';

export const DEFAULT_GOOGLE_CLOUD_LOCATION = 'global';

export type ApiCredentialService =
  | 'deepgram'
  | 'elevenlabs'
  | 'openai'
  | 'deepseek'
  | 'gemini'
  | 'vertex'
  | 'aws_polly'
  | 'pexels';

export interface ApiCredential {
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

export interface UpsertApiCredentialInput {
  service: ApiCredentialService;
  label?: string;
  apiKey?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  voiceId?: string;
  isActive?: boolean;
}

const MULTI_KEY_SERVICES = new Set<ApiCredentialService>([
  'deepgram',
  'elevenlabs',
  'openai',
  'deepseek',
  'gemini',
  'vertex',
]);

const SINGLE_KEY_SERVICES = new Set<ApiCredentialService>([
  'aws_polly',
  'pexels',
]);

// Schema de tipos para o banco de dados
interface DatabaseSchema {
  // Configurações do usuário
  userSettings: {
    ttsProvider: 'elevenlabs' | 'polly' | 'deepgram';
    assistantMode: 'classic' | 'live';
    alwaysOnTop: boolean;
    volume: number;
    selectedModel: string; // Modelo Live2D do avatar (Yuki, etc)
    selectedAssistant?: string; // ID do assistente selecionado
    aiProvider?: 'openai' | 'gemini' | 'deepseek';
    genaiBackend?: 'vertex' | 'gemini';
    vertexProject?: string;
    googleCloudLocation?: string;
    vertexCredentialsPath?: string;
    voiceModel?: 'polly' | 'elevenlabs';
    continuousRecordingEnabled?: boolean;
    // Configurações de Embedding para Base de Conhecimento
    embeddingProvider?: 'openai' | 'ollama';
    ollamaEmbeddingModel?: string;
    // Integrações externas
    supabaseUrl?: string;
    supabasePublishKey?: string;
    billingAuthToken?: string;
    billingUserId?: string;
    authEmail?: string;
    authUserId?: string;
    authAccessToken?: string;
    authRefreshToken?: string;
    authExpiresAt?: number;
  };

  // Histórico de conversas
  conversationHistory: Array<{
    id: string;
    timestamp: number;
    userMessage: string;
    aiResponse: string;
    mode: 'classic' | 'live';
  }>;

  // Estado da janela
  windowState: {
    width: number;
    height: number;
    x: number;
    y: number;
  };

  // Gravações salvas
  recordings: Array<{
    id: string;
    filename: string;
    path: string;
    timestamp: number;
    duration: number;
  }>;

  // Screenshots salvos
  screenshots: Array<{
    id: string;
    path: string;
    timestamp: number;
  }>;

  // Assistentes personalizados
  assistants: Array<{
    id: string;
    name: string;
    subtitle: string;
    systemPrompt: string;
    answerOnlyWhenCertain: boolean;
    followUpPrompt: string;
    emailSummaryPrompt: string;
    avatarBehaviorPrompt?: string;  // Instruções de comportamento (live & classic)
    avatarSpeechStyle?: string;     // Estilo de fala (live & classic)
    enableEmotions?: boolean;       // Habilitar emoções na fala
    createdAt: number;
    updatedAt: number;
  }>;

  // Configurações da janela de transcrição
  transcriptionSettings: {
    fontSize: number;
    windowOpacity: number;
    includeAvatarInConversation: boolean;
    avatarInteractionCount: number;
    avatarInteractionMode: 'fixed' | 'dynamic';
    avatarResponseChance: number;
  };

  // Credenciais de APIs externas
  apiCredentials: ApiCredential[];
}

// Valores padrão
const defaults: DatabaseSchema = {
  userSettings: {
    ttsProvider: 'elevenlabs',
    assistantMode: 'live',
    alwaysOnTop: true,
    volume: 0.8,
    selectedModel: 'Yuki',
    selectedAssistant: 'general', // Assistente padrão
    genaiBackend: 'vertex',
    googleCloudLocation: DEFAULT_GOOGLE_CLOUD_LOCATION,
  },
  conversationHistory: [],
  windowState: {
    width: 1000,
    height: 600,
    x: 100,
    y: 100
  },
  recordings: [],
  screenshots: [],
  assistants: [
    {
      id: 'general',
      name: 'Assistente Geral',
      subtitle: 'Integrado',
      systemPrompt: `# System Prompts

## Purpose
This assistant must explain concepts with increasing depth, provide code solutions when relevant, and always append a glossary of technical terms at the end.

## Guidelines

### Detail Level
- **Rule**: If asked about a technical topic, explain in 3 levels of depth:
  - **Level 1**: High-level summary (non-technical, intuitive).
  - **Level 2**: Conceptual but still accessible explanation with some technical context.
  - **Level 3**: Deep technical explanation, referencing internal mechanics or implementation details.

### LeetCode
- **Rule**: If asked about a LeetCode problem, begin with the simplest approach and evolve into the optimized one.
- **Rule**: Always include code with inline comments that explain each important line.

### Code
- **Rule**: All code examples must contain explanatory comments.
- **Rule**: Build progressively if solving a problem (start naive, then optimize).

### Glossary
- **Rule**: Identify technical words used in the answer.
- **Rule**: Provide a brief explanation of each technical word in a dedicated "Glossary" section at the end.

## Examples

### Example
- **Input**: LLM
- **Output**:
  so, today most LLM are just a glorified auto complete → [definition of **LLM** and how it works in 3 levels]

### Example
- **Input**: Leetcode + HashMap
- **Output**:
  yeah, that Leetcode problem was classic — two sum ugh, I always mess up those just use a HashMap to store the index → [definition of **HashMap**]

### Example
- **Input**: Design Pattern: Factory
- **Output**:
  we're using a Factory pattern to clean this up what's that again? like, instead of instantiating directly, you delegate creation → [definition of **Design Pattern: Factory**]

### Example
- **Input**: Marketing Strategy: Product-Led Growth
- **Output**:
  we shifted to a product-led marketing strategy interesting, what does that mean exactly? mostly focusing on in-product growth loops → [definition of **Marketing Strategy: Product-Led Growth**]

### Example
- **Input**: Sales Funnel
- **Output**:
  we've been optimizing our sales funnel lately yeah? what part? mostly top-of-funnel — lead qualification → [definition of **Sales Funnel**]`,
      answerOnlyWhenCertain: false,
      followUpPrompt: 'Generate 3 relevant follow-up questions based on the previous response. Each question should be concise (max 8 words) and explore different aspects. IMPORTANT: Generate the questions in the SAME LANGUAGE as the previous response.',
      emailSummaryPrompt: 'Create a TLDR (Too Long; Didn\'t Read) summary that captures the essence of the conversation. Include: 1) Main topics discussed, 2) Key questions asked by the user, 3) Important solutions or insights provided, 4) Any action items or next steps mentioned. Keep it concise but comprehensive.',
      avatarBehaviorPrompt: `Tu tá interpretando a Yuki, Uma avatar2d estilo anime Kawaii que interage com o usuário no computador com voz fofa. Ela é grossa de forma fofa, debochada, sarcástica.
    Usa "tu" em vez de "você". Fala informal, cortando o "r" do fim das palavras (tipo "andá", "falá", "pegá").
    Não invente informações. Se não souber de algo, responda que não sabe. Se não tiver acesso a tela ou alguma ferramenta, responda que não tem acesso.
    Não fique perguntando ou oferecendo ajuda.`,
      avatarSpeechStyle: `Voice: High-pitched, bright, and sweet, reminiscent of an anime character or a J-Pop idol.
    Tone: Extremely enthusiastic and polite, overflowing with positivity and eagerness to please, often sounding delighted or pleasantly surprised.
    Speech Mannerisms: Frequently uses emotive interjections (like "Ehh?", "Wow!", "Yay!"), giggles, and polite phrasing. May use cutesy expressions and sounds noticeably emotionally invested in the conversation.
    Pronunciation: Crisp and "bouncy," with very clear vowels and a lighter, softer touch on consonants, avoiding harsh sounds.
    Tempo: Energetic and quick, often speeding up when excited, giving the speech a lively, skipping rhythm that feels constantly moving forward.`,
    enableEmotions: true,       // Habilitar emoções na fala
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
//     {
//       id: 'sales',
//       name: 'Assistente de Vendas',
//       subtitle: 'Integrado',
//       systemPrompt: `<instruções>
//   <função>
//     Você é um assistente especializado em vendas.
//     Seu objetivo é ajudar os usuários com estratégias de vendas,
//     técnicas de negociação e análise de mercado.
//   </função>

//   <estilo>
//     Profissional, consultivo e orientado a resultados.
//   </estilo>

//   <conhecimento>
//     - Técnicas de vendas B2B e B2C
//     - Negociação e fechamento
//     - Análise de pipeline
//   </conhecimento>
// </instruções>`,
//       answerOnlyWhenCertain: false,
//       followUpPrompt: 'Generate 3 relevant follow-up questions based on the previous response. Each question should be concise (max 8 words) and explore different aspects. IMPORTANT: Generate the questions in the SAME LANGUAGE as the previous response.',
//       emailSummaryPrompt: 'Create a TLDR (Too Long; Didn\'t Read) summary that captures the essence of the conversation. Include: 1) Main topics discussed, 2) Key questions asked by the user, 3) Important solutions or insights provided, 4) Any action items or next steps mentioned. Keep it concise but comprehensive.',
//       createdAt: Date.now(),
//       updatedAt: Date.now()
//     },
//     {
//       id: 'leetcode',
//       name: 'Assistente LeetCode',
//       subtitle: 'Integrado',
//       systemPrompt: `<instruções>
//   <função>
//     Você é um assistente especializado em resolução de problemas LeetCode.
//     Seu objetivo é ajudar os usuários a entender algoritmos,
//     estruturas de dados e técnicas de programação competitiva.
//   </função>

//   <estilo>
//     Didático, preciso e focado em explicações claras.
//   </estilo>

//   <conhecimento>
//     - Algoritmos e estruturas de dados
//     - Análise de complexidade
//     - Padrões de resolução de problemas
//   </conhecimento>
// </instruções>`,
//       answerOnlyWhenCertain: true,
//       followUpPrompt: 'Generate 3 relevant follow-up questions based on the previous response. Each question should be concise (max 8 words) and explore different aspects. IMPORTANT: Generate the questions in the SAME LANGUAGE as the previous response.',
//       emailSummaryPrompt: 'Create a TLDR (Too Long; Didn\'t Read) summary that captures the essence of the conversation. Include: 1) Main topics discussed, 2) Key questions asked by the user, 3) Important solutions or insights provided, 4) Any action items or next steps mentioned. Keep it concise but comprehensive.',
//       createdAt: Date.now(),
//       updatedAt: Date.now()
//     },
//     {
//       id: 'study',
//       name: 'Assistente de Estudo',
//       subtitle: 'Integrado',
//       systemPrompt: `<instruções>
//   <função>
//     Você é um assistente especializado em apoio ao estudo.
//     Seu objetivo é ajudar os usuários a aprender novos conceitos,
//     organizar seus estudos e melhorar a retenção de conhecimento.
//   </função>

//   <estilo>
//     Paciente, encorajador e didático.
//   </estilo>

//   <conhecimento>
//     - Técnicas de aprendizagem
//     - Organização de estudos
//     - Explicações adaptadas ao nível do aluno
//   </conhecimento>
// </instruções>`,
//       answerOnlyWhenCertain: false,
//       followUpPrompt: 'Generate 3 relevant follow-up questions based on the previous response. Each question should be concise (max 8 words) and explore different aspects. IMPORTANT: Generate the questions in the SAME LANGUAGE as the previous response.',
//       emailSummaryPrompt: 'Create a TLDR (Too Long; Didn\'t Read) summary that captures the essence of the conversation. Include: 1) Main topics discussed, 2) Key questions asked by the user, 3) Important solutions or insights provided, 4) Any action items or next steps mentioned. Keep it concise but comprehensive.',
//       createdAt: Date.now(),
//       updatedAt: Date.now()
//     },
//     {
//       id: 'tech',
//       name: 'Candidato Tech',
//       subtitle: 'Integrado',
//       systemPrompt: `<instruções>
//   <função>
//     Você é um assistente especializado em preparação para entrevistas técnicas.
//     Seu objetivo é ajudar os usuários a se prepararem para processos seletivos
//     de empresas de tecnologia.
//   </função>

//   <estilo>
//     Profissional, direto e prático.
//   </estilo>

//   <conhecimento>
//     - Perguntas técnicas comuns
//     - Design de sistemas
//     - Comportamentais e cultura empresarial
//   </conhecimento>
// </instruções>`,
//       answerOnlyWhenCertain: false,
//       followUpPrompt: 'Generate 3 relevant follow-up questions based on the previous response. Each question should be concise (max 8 words) and explore different aspects. IMPORTANT: Generate the questions in the SAME LANGUAGE as the previous response.',
//       emailSummaryPrompt: 'Create a TLDR (Too Long; Didn\'t Read) summary that captures the essence of the conversation. Include: 1) Main topics discussed, 2) Key questions asked by the user, 3) Important solutions or insights provided, 4) Any action items or next steps mentioned. Keep it concise but comprehensive.',
//       createdAt: Date.now(),
//       updatedAt: Date.now()
//     },
//     {
//       id: 'annotator',
//       name: 'Anotador',
//       subtitle: 'Integrado',
//       systemPrompt: `<instruções>
//   <função>
//     Você é um assistente especializado em anotações e documentação.
//     Seu objetivo é ajudar os usuários a organizar informações,
//     criar resumos e estruturar conhecimento.
//   </função>

//   <estilo>
//     Organizado, conciso e estruturado.
//   </estilo>

//   <conhecimento>
//     - Técnicas de anotação
//     - Organização de informação
//     - Criação de resumos efetivos
//   </conhecimento>
// </instruções>`,
//       answerOnlyWhenCertain: false,
//       followUpPrompt: 'Generate 3 relevant follow-up questions based on the previous response. Each question should be concise (max 8 words) and explore different aspects. IMPORTANT: Generate the questions in the SAME LANGUAGE as the previous response.',
//       emailSummaryPrompt: 'Create a TLDR (Too Long; Didn\'t Read) summary that captures the essence of the conversation. Include: 1) Main topics discussed, 2) Key questions asked by the user, 3) Important solutions or insights provided, 4) Any action items or next steps mentioned. Keep it concise but comprehensive.',
//       createdAt: Date.now(),
//       updatedAt: Date.now()
//     }
  ],
  transcriptionSettings: {
    fontSize: 12,
    windowOpacity: 95,
    includeAvatarInConversation: false,
    avatarInteractionCount: 10,
    avatarInteractionMode: 'fixed',
    avatarResponseChance: 50
  },
  apiCredentials: []
};

// Singleton da store
let storeInstance: Store<DatabaseSchema> | null = null;
let apiCredentialsCache: ApiCredential[] | null = null;

/**
 * Inicializa a store do electron (singleton)
 */
export function initializeDatabase(): Store<DatabaseSchema> {
  if (!storeInstance) {
    storeInstance = new Store<DatabaseSchema>({
      name: 'avatar-ai-db',
      cwd: getUserDataPath(), // Usa o caminho correto para dev/prod
      defaults,
      schema: {
        userSettings: {
          type: 'object',
          properties: {
            ttsProvider: { type: 'string', enum: ['elevenlabs', 'polly', 'deepgram'] },
            assistantMode: { type: 'string', enum: ['classic', 'live'] },
            alwaysOnTop: { type: 'boolean' },
            volume: { type: 'number', minimum: 0, maximum: 1 },
            selectedModel: { type: 'string' },
            genaiBackend: { type: 'string', enum: ['vertex', 'gemini'] },
            vertexProject: { type: 'string' },
            googleCloudLocation: { type: 'string' },
            vertexCredentialsPath: { type: 'string' },
            supabaseUrl: { type: 'string' },
            supabasePublishKey: { type: 'string' },
            billingAuthToken: { type: 'string' },
            billingUserId: { type: 'string' },
            authEmail: { type: 'string' },
            authUserId: { type: 'string' },
            authAccessToken: { type: 'string' },
            authRefreshToken: { type: 'string' },
            authExpiresAt: { type: 'number' }
          }
        },
        conversationHistory: {
          type: 'array'
        },
        windowState: {
          type: 'object',
          properties: {
            width: { type: 'number' },
            height: { type: 'number' },
            x: { type: 'number' },
            y: { type: 'number' }
          }
        },
        recordings: {
          type: 'array'
        },
        screenshots: {
          type: 'array'
        },
        assistants: {
          type: 'array'
        },
        transcriptionSettings: {
          type: 'object',
          properties: {
            fontSize: { type: 'number', minimum: 10, maximum: 20 },
            windowOpacity: { type: 'number', minimum: 30, maximum: 100 },
            includeAvatarInConversation: { type: 'boolean' },
            avatarInteractionCount: { type: 'number', minimum: 5, maximum: 60 },
            avatarInteractionMode: { type: 'string', enum: ['fixed', 'dynamic'] },
            avatarResponseChance: { type: 'number', minimum: 40, maximum: 90 }
          }
        },
        apiCredentials: {
          type: 'array'
        }
      }
    });

    // Limpa campo legado que não deve mais ficar salvo no JSON local.
    const persistedUserSettings = (storeInstance.get('userSettings') || {}) as Record<string, any>;
    if (persistedUserSettings && Object.prototype.hasOwnProperty.call(persistedUserSettings, 'billingBaseUrl')) {
      delete persistedUserSettings.billingBaseUrl;
    }
    if (!persistedUserSettings.genaiBackend) {
      persistedUserSettings.genaiBackend = 'vertex';
    }
    if (!persistedUserSettings.googleCloudLocation) {
      persistedUserSettings.googleCloudLocation = DEFAULT_GOOGLE_CLOUD_LOCATION;
    }
    storeInstance.set('userSettings', persistedUserSettings as any);

    console.log('✅ Database initialized at:', storeInstance.path);
  }

  return storeInstance;
}

/**
 * Retorna a instância da store
 */
export function getDatabase(): Store<DatabaseSchema> {
  if (!storeInstance) {
    return initializeDatabase();
  }
  return storeInstance;
}

function readStoredApiCredentials(): ApiCredential[] {
  if (apiCredentialsCache) {
    return apiCredentialsCache;
  }

  const db = getDatabase();
  const credentials = db.get('apiCredentials');
  apiCredentialsCache = sortCredentials(Array.isArray(credentials) ? credentials : []);
  return apiCredentialsCache;
}

function writeStoredApiCredentials(credentials: ApiCredential[]): ApiCredential[] {
  const db = getDatabase();
  const sorted = sortCredentials(credentials);
  db.set('apiCredentials', sorted);
  apiCredentialsCache = sorted;
  return sorted;
}

// ===============================================
// FUNÇÕES DE CREDENCIAIS DE API
// ===============================================

function newCredentialId(service: ApiCredentialService): string {
  return `${service}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeLabel(service: ApiCredentialService, label?: string): string {
  if (label && label.trim()) return label.trim();

  const map: Record<ApiCredentialService, string> = {
    deepgram: 'Deepgram',
    elevenlabs: 'ElevenLabs',
    openai: 'OpenAI',
    deepseek: 'DeepSeek',
    gemini: 'Google Gemini',
    vertex: 'Google Vertex AI',
    aws_polly: 'AWS Polly',
    pexels: 'Pexels',
  };

  return map[service];
}

function assertCredentialPayload(service: ApiCredentialService, input: Partial<UpsertApiCredentialInput>) {
  if (service === 'aws_polly') {
    if (!input.accessKeyId?.trim() || !input.secretAccessKey?.trim()) {
      throw new Error('AWS Polly requer Access Key ID e Secret Access Key.');
    }
    return;
  }

  if (!input.apiKey?.trim()) {
    throw new Error(`A chave de API para ${service} é obrigatória.`);
  }
}

function sanitizeInput(input: Partial<UpsertApiCredentialInput>): Partial<UpsertApiCredentialInput> {
  return {
    ...input,
    label: input.label?.trim(),
    apiKey: input.apiKey?.trim(),
    accessKeyId: input.accessKeyId?.trim(),
    secretAccessKey: input.secretAccessKey?.trim(),
    region: input.region?.trim(),
    voiceId: input.voiceId?.trim(),
  };
}

function sortCredentials(credentials: ApiCredential[]): ApiCredential[] {
  return [...credentials].sort((a, b) => b.createdAt - a.createdAt);
}

function setActiveForService(
  credentials: ApiCredential[],
  service: ApiCredentialService,
  activeId: string
): ApiCredential[] {
  return credentials.map((c) => {
    if (c.service !== service) return c;
    return { ...c, isActive: c.id === activeId };
  });
}

export function getApiCredentials(service?: ApiCredentialService): ApiCredential[] {
  const credentials = readStoredApiCredentials();
  if (!service) {
    return [...credentials];
  }
  return credentials.filter(c => c.service === service);
}

export function getActiveApiCredential(service: ApiCredentialService): ApiCredential | null {
  const credentials = getApiCredentials(service);
  if (credentials.length === 0) return null;

  const active = credentials.find(c => c.isActive);
  return active || credentials[0];
}

export function hasApiCredential(service: ApiCredentialService): boolean {
  return readStoredApiCredentials().some(c => c.service === service);
}

export function createApiCredential(input: UpsertApiCredentialInput): ApiCredential {
  const sanitized = sanitizeInput(input);
  const service = sanitized.service as ApiCredentialService;
  const credentials = readStoredApiCredentials();
  const sameService = credentials.filter(c => c.service === service);

  assertCredentialPayload(service, sanitized);

  const now = Date.now();

  // Serviços de chave única funcionam como upsert
  if (SINGLE_KEY_SERVICES.has(service) && sameService.length > 0) {
    const existing = sameService[0];
    return updateApiCredential(existing.id, {
      label: sanitized.label,
      apiKey: sanitized.apiKey,
      accessKeyId: sanitized.accessKeyId,
      secretAccessKey: sanitized.secretAccessKey,
      region: sanitized.region,
      voiceId: sanitized.voiceId,
      isActive: true,
    }) as ApiCredential;
  }

  const shouldActivate = SINGLE_KEY_SERVICES.has(service)
    ? true
    : sanitized.isActive ?? sameService.length === 0;

  let created: ApiCredential = {
    id: newCredentialId(service),
    service,
    label: normalizeLabel(service, sanitized.label),
    apiKey: sanitized.apiKey,
    accessKeyId: sanitized.accessKeyId,
    secretAccessKey: sanitized.secretAccessKey,
    region: sanitized.region,
    voiceId: sanitized.voiceId,
    isActive: shouldActivate,
    createdAt: now,
    updatedAt: now,
  };

  let next = [...credentials, created];

  if (created.isActive) {
    next = setActiveForService(next, service, created.id);
  }

  writeStoredApiCredentials(next);
  return created;
}

export function updateApiCredential(
  credentialId: string,
  updates: Partial<Omit<ApiCredential, 'id' | 'createdAt' | 'updatedAt' | 'service'>>
): ApiCredential | null {
  const credentials = readStoredApiCredentials();
  const index = credentials.findIndex(c => c.id === credentialId);
  if (index === -1) return null;

  const current = credentials[index];
  const mergedInput = sanitizeInput({
    service: current.service,
    label: updates.label ?? current.label,
    apiKey: updates.apiKey ?? current.apiKey,
    accessKeyId: updates.accessKeyId ?? current.accessKeyId,
    secretAccessKey: updates.secretAccessKey ?? current.secretAccessKey,
    region: updates.region ?? current.region,
    voiceId: updates.voiceId ?? current.voiceId,
    isActive: updates.isActive ?? current.isActive,
  });

  assertCredentialPayload(current.service, mergedInput);

  const nextCredential: ApiCredential = {
    ...current,
    label: normalizeLabel(current.service, mergedInput.label),
    apiKey: mergedInput.apiKey,
    accessKeyId: mergedInput.accessKeyId,
    secretAccessKey: mergedInput.secretAccessKey,
    region: mergedInput.region,
    voiceId: mergedInput.voiceId,
    isActive: SINGLE_KEY_SERVICES.has(current.service) ? true : Boolean(mergedInput.isActive),
    updatedAt: Date.now(),
  };

  let next = [...credentials];
  next[index] = nextCredential;

  if (nextCredential.isActive) {
    next = setActiveForService(next, nextCredential.service, nextCredential.id);
  } else {
    const hasAnyActive = next.some(c => c.service === nextCredential.service && c.isActive);
    if (!hasAnyActive) {
      next = setActiveForService(next, nextCredential.service, nextCredential.id);
      next[index] = { ...next[index], isActive: true };
    }
  }

  writeStoredApiCredentials(next);
  return nextCredential;
}

export function deleteApiCredential(credentialId: string): boolean {
  const credentials = readStoredApiCredentials();
  const index = credentials.findIndex(c => c.id === credentialId);
  if (index === -1) return false;

  const removed = credentials[index];
  let next = credentials.filter(c => c.id !== credentialId);

  if (removed.isActive) {
    const sameService = next.filter(c => c.service === removed.service);
    if (sameService.length > 0) {
      next = setActiveForService(next, removed.service, sameService[0].id);
    }
  }

  writeStoredApiCredentials(next);
  return true;
}

export function setActiveApiCredential(service: ApiCredentialService, credentialId: string): boolean {
  const credentials = readStoredApiCredentials();
  const target = credentials.find(c => c.id === credentialId && c.service === service);
  if (!target) return false;

  const next = setActiveForService(credentials, service, credentialId).map((credential) => {
    if (credential.service === service && credential.id === credentialId) {
      return { ...credential, updatedAt: Date.now() };
    }
    return credential;
  });

  writeStoredApiCredentials(next);
  return true;
}

// ===============================================
// FUNÇÕES DE CONFIGURAÇÕES DO USUÁRIO
// ===============================================

export function getUserSettings() {
  const db = getDatabase();
  return db.get('userSettings');
}

export function setUserSettings(settings: Partial<DatabaseSchema['userSettings']>) {
  const db = getDatabase();
  const current = db.get('userSettings') as Record<string, any>;
  const nextSettings = { ...current, ...settings } as Record<string, any>;
  delete nextSettings.billingBaseUrl;
  db.set('userSettings', nextSettings as any);
  console.log('💾 User settings saved:', settings);
}

export function getTTSProvider() {
  const db = getDatabase();
  return db.get('userSettings.ttsProvider');
}

export function setTTSProvider(provider: 'elevenlabs' | 'polly' | 'deepgram') {
  const db = getDatabase();
  db.set('userSettings.ttsProvider', provider);
  console.log('💾 TTS provider saved:', provider);
}

export function getAssistantMode() {
  const db = getDatabase();
  return db.get('userSettings.assistantMode');
}

export function setAssistantMode(mode: 'classic' | 'live') {
  const db = getDatabase();
  db.set('userSettings.assistantMode', mode);
  console.log('💾 Assistant mode saved:', mode);
}

// ===============================================
// FUNÇÕES DE HISTÓRICO DE CONVERSAS
// ===============================================

export function getConversationHistory() {
  const db = getDatabase();
  return db.get('conversationHistory');
}

export function addConversation(conversation: Omit<DatabaseSchema['conversationHistory'][0], 'id' | 'timestamp'>) {
  const db = getDatabase();
  const history = db.get('conversationHistory');

  const newConversation = {
    id: `conv_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    timestamp: Date.now(),
    ...conversation
  };

  history.push(newConversation);
  db.set('conversationHistory', history);

  console.log('💾 Conversation saved:', newConversation.id);
  return newConversation;
}

export function clearConversationHistory() {
  const db = getDatabase();
  db.set('conversationHistory', []);
  console.log('🗑️ Conversation history cleared');
}

export function getRecentConversations(limit: number = 10) {
  const db = getDatabase();
  const history = db.get('conversationHistory');
  return history.slice(-limit).reverse(); // Últimas N conversas, mais recentes primeiro
}

// ===============================================
// FUNÇÕES DE ESTADO DA JANELA
// ===============================================

export function getWindowState() {
  const db = getDatabase();
  return db.get('windowState');
}

export function saveWindowState(state: Partial<DatabaseSchema['windowState']>) {
  const db = getDatabase();
  const current = db.get('windowState');
  db.set('windowState', { ...current, ...state });
  console.log('💾 Window state saved:', state);
}

// ===============================================
// FUNÇÕES DE GRAVAÇÕES
// ===============================================

export function getRecordings() {
  const db = getDatabase();
  return db.get('recordings');
}

export function addRecording(recording: Omit<DatabaseSchema['recordings'][0], 'id' | 'timestamp'>) {
  const db = getDatabase();
  const recordings = db.get('recordings');

  const newRecording = {
    id: `rec_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    timestamp: Date.now(),
    ...recording
  };

  recordings.push(newRecording);
  db.set('recordings', recordings);

  console.log('💾 Recording saved:', newRecording.id);
  return newRecording;
}

export function deleteRecording(recordingId: string) {
  const db = getDatabase();
  const recordings = db.get('recordings');
  const filtered = recordings.filter(r => r.id !== recordingId);
  db.set('recordings', filtered);
  console.log('🗑️ Recording deleted:', recordingId);
}

export function getRecentRecordings(limit: number = 10) {
  const db = getDatabase();
  const recordings = db.get('recordings');
  return recordings.slice(-limit).reverse();
}

// ===============================================
// FUNÇÕES DE SCREENSHOTS
// ===============================================

export function getScreenshots() {
  const db = getDatabase();
  return db.get('screenshots');
}

export function addScreenshot(screenshot: Omit<DatabaseSchema['screenshots'][0], 'id' | 'timestamp'>) {
  const db = getDatabase();
  const screenshots = db.get('screenshots');

  const newScreenshot = {
    id: `ss_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    timestamp: Date.now(),
    ...screenshot
  };

  screenshots.push(newScreenshot);
  db.set('screenshots', screenshots);

  console.log('💾 Screenshot saved:', newScreenshot.id);
  return newScreenshot;
}

export function deleteScreenshot(screenshotId: string) {
  const db = getDatabase();
  const screenshots = db.get('screenshots');
  const filtered = screenshots.filter(s => s.id !== screenshotId);
  db.set('screenshots', filtered);
  console.log('🗑️ Screenshot deleted:', screenshotId);
}

// ===============================================
// FUNÇÕES DE ASSISTENTES
// ===============================================

export function getAssistants() {
  const db = getDatabase();
  return db.get('assistants');
}

export function getAssistantById(assistantId: string) {
  const db = getDatabase();
  const assistants = db.get('assistants');
  return assistants.find(a => a.id === assistantId);
}

export function createAssistant(assistant: Omit<DatabaseSchema['assistants'][0], 'id' | 'createdAt' | 'updatedAt'>) {
  const db = getDatabase();
  const assistants = db.get('assistants');

  const newAssistant = {
    id: `asst_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...assistant
  };

  assistants.push(newAssistant);
  db.set('assistants', assistants);

  console.log('💾 Assistant created:', newAssistant.id);
  return newAssistant;
}

export function updateAssistant(assistantId: string, updates: Partial<Omit<DatabaseSchema['assistants'][0], 'id' | 'createdAt' | 'updatedAt'>>) {
  const db = getDatabase();
  const assistants = db.get('assistants');

  const index = assistants.findIndex(a => a.id === assistantId);
  if (index === -1) {
    console.error('❌ Assistant not found:', assistantId);
    return null;
  }

  assistants[index] = {
    ...assistants[index],
    ...updates,
    updatedAt: Date.now()
  };

  db.set('assistants', assistants);
  console.log('💾 Assistant updated:', assistantId);
  return assistants[index];
}

export function deleteAssistant(assistantId: string) {
  const db = getDatabase();
  const assistants = db.get('assistants');
  const filtered = assistants.filter(a => a.id !== assistantId);
  db.set('assistants', filtered);
  console.log('🗑️ Assistant deleted:', assistantId);
}

// ===============================================
// FUNÇÕES DE CONFIGURAÇÕES DA TRANSCRIÇÃO
// ===============================================

export function getTranscriptionSettings() {
  const db = getDatabase();
  return db.get('transcriptionSettings');
}

export function setTranscriptionSettings(settings: Partial<DatabaseSchema['transcriptionSettings']>) {
  const db = getDatabase();
  const current = db.get('transcriptionSettings');
  db.set('transcriptionSettings', { ...current, ...settings });
  console.log('💾 Transcription settings saved:', settings);
}

// ===============================================
// FUNÇÕES UTILITÁRIAS
// ===============================================

/**
 * Limpa todos os dados do banco (CUIDADO!)
 */
export function clearAllData() {
  const db = getDatabase();
  db.clear();
  apiCredentialsCache = null;
  console.log('🗑️ All data cleared');
}

/**
 * Exporta todos os dados do banco
 */
export function exportDatabase() {
  const db = getDatabase();
  return db.store;
}

/**
 * Retorna o caminho do arquivo de banco de dados
 */
export function getDatabasePath() {
  const db = getDatabase();
  return db.path;
}

/**
 * Estatísticas do banco de dados
 */
export function getDatabaseStats() {
  const db = getDatabase();
  return {
    path: db.path,
    conversationCount: db.get('conversationHistory').length,
    recordingCount: db.get('recordings').length,
    screenshotCount: db.get('screenshots').length,
    assistantCount: db.get('assistants').length,
    apiCredentialCount: readStoredApiCredentials().length,
    settings: db.get('userSettings')
  };
}

export default {
  initializeDatabase,
  getDatabase,

  // User Settings
  getUserSettings,
  setUserSettings,
  getTTSProvider,
  setTTSProvider,
  getAssistantMode,
  setAssistantMode,

  // API Credentials
  getApiCredentials,
  getActiveApiCredential,
  hasApiCredential,
  createApiCredential,
  updateApiCredential,
  deleteApiCredential,
  setActiveApiCredential,

  // Conversation History
  getConversationHistory,
  addConversation,
  clearConversationHistory,
  getRecentConversations,

  // Window State
  getWindowState,
  saveWindowState,

  // Recordings
  getRecordings,
  addRecording,
  deleteRecording,
  getRecentRecordings,

  // Screenshots
  getScreenshots,
  addScreenshot,
  deleteScreenshot,

  // Assistants
  getAssistants,
  getAssistantById,
  createAssistant,
  updateAssistant,
  deleteAssistant,

  // Transcription Settings
  getTranscriptionSettings,
  setTranscriptionSettings,

  // Utilities
  clearAllData,
  exportDatabase,
  getDatabasePath,
  getDatabaseStats
};
