import Store from 'electron-store';

// Schema de tipos para o banco de dados
interface DatabaseSchema {
  // Configurações do usuário
  userSettings: {
    ttsProvider: 'elevenlabs' | 'polly' | 'deepgram';
    assistantMode: 'classic' | 'live';
    alwaysOnTop: boolean;
    volume: number;
    selectedModel: string;
    aiProvider?: 'openai' | 'gemini' | 'deepseek';
    voiceModel?: 'polly' | 'elevenlabs';
    continuousRecordingEnabled?: boolean;
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
}

// Valores padrão
const defaults: DatabaseSchema = {
  userSettings: {
    ttsProvider: 'elevenlabs',
    assistantMode: 'live',
    alwaysOnTop: true,
    volume: 0.8,
    selectedModel: 'Yuki'
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
  ]
};

// Singleton da store
let storeInstance: Store<DatabaseSchema> | null = null;

/**
 * Inicializa a store do electron (singleton)
 */
export function initializeDatabase(): Store<DatabaseSchema> {
  if (!storeInstance) {
    storeInstance = new Store<DatabaseSchema>({
      name: 'avatar-ai-db',
      defaults,
      schema: {
        userSettings: {
          type: 'object',
          properties: {
            ttsProvider: { type: 'string', enum: ['elevenlabs', 'polly', 'deepgram'] },
            assistantMode: { type: 'string', enum: ['classic', 'live'] },
            alwaysOnTop: { type: 'boolean' },
            volume: { type: 'number', minimum: 0, maximum: 1 },
            selectedModel: { type: 'string' }
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
        }
      }
    });

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

// ===============================================
// FUNÇÕES DE CONFIGURAÇÕES DO USUÁRIO
// ===============================================

export function getUserSettings() {
  const db = getDatabase();
  return db.get('userSettings');
}

export function setUserSettings(settings: Partial<DatabaseSchema['userSettings']>) {
  const db = getDatabase();
  const current = db.get('userSettings');
  db.set('userSettings', { ...current, ...settings });
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
// FUNÇÕES UTILITÁRIAS
// ===============================================

/**
 * Limpa todos os dados do banco (CUIDADO!)
 */
export function clearAllData() {
  const db = getDatabase();
  db.clear();
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

  // Utilities
  clearAllData,
  exportDatabase,
  getDatabasePath,
  getDatabaseStats
};

