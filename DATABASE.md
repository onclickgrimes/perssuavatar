# 📦 Sistema de Banco de Dados - Avatar AI

Sistema de persistência de dados usando `electron-store` para gerenciar configurações, histórico de conversas, gravações e screenshots da aplicação.

## 📁 Estrutura de Arquivos

```
main/
├── lib/
│   ├── database.ts           # Módulo principal do banco de dados
│   └── database-handlers.ts  # Handlers IPC para comunicação com frontend
└── background.ts              # Inicializa o banco de dados

renderer/
└── lib/
    └── database-examples.ts   # Exemplos de uso no frontend
```

## 🚀 Instalação

O pacote `electron-store` já foi instalado automaticamente:

```bash
npm install electron-store
```

## 🔧 Arquitetura

### 1. **database.ts** - Módulo Core

Gerencia toda a lógica de persistência de dados utilizando `electron-store`.

**Schemas disponíveis:**

- `userSettings` - Configurações do usuário
- `conversationHistory` - Histórico de conversas
- `windowState` - Estado da janela (posição, tamanho)
- `recordings` - Lista de gravações salvas
- `screenshots` - Lista de screenshots salvos

### 2. **database-handlers.ts** - IPC Handlers

Expõe as funções do banco de dados para o frontend via Electron IPC.

**Namespaces IPC:**
- `db:get-*` - Leitura de dados
- `db:set-*` - Escrita de dados
- `db:add-*` - Adicionar itens
- `db:delete-*` - Remover itens

### 3. **preload.ts** - Interface Frontend

Expõe as funções do banco através de `window.electron.db.*`

## 📖 Como Usar

### No Backend (Main Process)

```typescript
import * as db from './lib/database';

// Inicializar (já é feito automaticamente no background.ts)
db.initializeDatabase();

// Salvar configurações
db.setUserSettings({
  ttsProvider: 'elevenlabs',
  volume: 0.8
});

// Ler configurações
const settings = db.getUserSettings();

// Adicionar conversa ao histórico
db.addConversation({
  userMessage: "Como está o tempo?",
  aiResponse: "O tempo está ensolarado!",
  mode: 'live'
});

// Ver estatísticas
const stats = db.getDatabaseStats();
console.log(stats);
```

### No Frontend (Renderer Process)

```typescript
// Salvar configurações
await window.electron.db.setUserSettings({
  ttsProvider: 'elevenlabs',
  assistantMode: 'live',
  volume: 0.9
});

// Carregar configurações
const settings = await window.electron.db.getUserSettings();

// Adicionar conversa
await window.electron.db.addConversation({
  userMessage: "Olá!",
  aiResponse: "Oi! Como posso ajudar?",
  mode: 'live'
});

// Buscar últimas conversas
const recent = await window.electron.db.getRecentConversations(10);

// Ver estatísticas
const stats = await window.electron.db.getStats();
```

### Exemplo com React Hook

```typescript
import { useState, useEffect } from 'react';

function Settings() {
  const [settings, setSettings] = useState(null);
  
  useEffect(() => {
    loadSettings();
  }, []);
  
  async function loadSettings() {
    const data = await window.electron.db.getUserSettings();
    setSettings(data);
  }
  
  async function updateVolume(volume) {
    await window.electron.db.setUserSettings({ volume });
    loadSettings();
  }
  
  if (!settings) return <div>Carregando...</div>;
  
  return (
    <div>
      <input 
        type="range" 
        min="0" 
        max="1" 
        step="0.1"
        value={settings.volume} 
        onChange={(e) => updateVolume(parseFloat(e.target.value))}
      />
    </div>
  );
}
```

## 🗂️ Schema do Banco de Dados

```typescript
{
  userSettings: {
    ttsProvider: 'elevenlabs' | 'polly' | 'deepgram',
    assistantMode: 'classic' | 'live',
    alwaysOnTop: boolean,
    volume: number (0-1),
    selectedModel: string
  },
  
  conversationHistory: Array<{
    id: string,
    timestamp: number,
    userMessage: string,
    aiResponse: string,
    mode: 'classic' | 'live'
  }>,
  
  windowState: {
    width: number,
    height: number,
    x: number,
    y: number
  },
  
  recordings: Array<{
    id: string,
    filename: string,
    path: string,
    timestamp: number,
    duration: number
  }>,
  
  screenshots: Array<{
    id: string,
    path: string,
    timestamp: number
  }>
}
```

## 📍 Localização do Banco de Dados

O arquivo do banco de dados é salvo automaticamente em:

**Windows:**
```
C:\Users\[Usuário]\AppData\Roaming\[AppName]\avatar-ai-db.json
```

**macOS:**
```
~/Library/Application Support/[AppName]/avatar-ai-db.json
```

**Linux:**
```
~/.config/[AppName]/avatar-ai-db.json
```

Para ver o caminho exato:
```typescript
const path = await window.electron.db.getPath();
console.log(path);
```

## 🛠️ API Completa

### User Settings

```typescript
// Ler todas as configurações
await window.electron.db.getUserSettings()

// Atualizar configurações
await window.electron.db.setUserSettings({ volume: 0.9 })

// TTS Provider
await window.electron.db.getTTSProvider()
await window.electron.db.setTTSProvider('elevenlabs')

// Assistant Mode
await window.electron.db.getAssistantMode()
await window.electron.db.setAssistantMode('live')
```

### Conversation History

```typescript
// Listar todo o histórico
await window.electron.db.getConversationHistory()

// Adicionar conversa
await window.electron.db.addConversation({
  userMessage: "...",
  aiResponse: "...",
  mode: 'live'
})

// Últimas N conversas
await window.electron.db.getRecentConversations(10)

// Limpar histórico
await window.electron.db.clearConversationHistory()
```

### Window State

```typescript
// Carregar estado
await window.electron.db.getWindowState()

// Salvar estado
await window.electron.db.saveWindowState({
  x: 100,
  y: 100,
  width: 800,
  height: 600
})
```

### Recordings

```typescript
// Listar gravações
await window.electron.db.getRecordings()

// Adicionar gravação
await window.electron.db.addRecording({
  filename: 'recording.mp4',
  path: '/path/to/file',
  duration: 120
})

// Últimas N gravações
await window.electron.db.getRecentRecordings(5)

// Deletar gravação
await window.electron.db.deleteRecording('rec_id')
```

### Screenshots

```typescript
// Listar screenshots
await window.electron.db.getScreenshots()

// Adicionar screenshot
await window.electron.db.addScreenshot({
  path: '/path/to/screenshot.png'
})

// Deletar screenshot
await window.electron.db.deleteScreenshot('ss_id')
```

### Utilities

```typescript
// Estatísticas
await window.electron.db.getStats()

// Exportar todos os dados
await window.electron.db.export()

// Caminho do arquivo
await window.electron.db.getPath()

// Limpar tudo (CUIDADO!)
await window.electron.db.clearAll()
```

## 💡 Dicas e Boas Práticas

### 1. **Type Safety**

Sempre use TypeScript para garantir os tipos corretos:

```typescript
interface UserSettings {
  ttsProvider: 'elevenlabs' | 'polly' | 'deepgram';
  volume: number;
}

const settings: UserSettings = await window.electron.db.getUserSettings();
```

### 2. **Carregar Configurações na Inicialização**

```typescript
// Em HomePage.tsx ou App.tsx
useEffect(() => {
  async function init() {
    const settings = await window.electron.db.getUserSettings();
    // Aplicar configurações na UI
    setTTSProvider(settings.ttsProvider);
    setVolume(settings.volume);
  }
  init();
}, []);
```

### 3. **Salvar Automaticamente**

```typescript
// Debounce para evitar salvar a cada keystroke
const debouncedSave = debounce(async (volume) => {
  await window.electron.db.setUserSettings({ volume });
}, 500);

// No onChange
onChange={(e) => {
  const newVolume = parseFloat(e.target.value);
  setVolume(newVolume);
  debouncedSave(newVolume);
}}
```

### 4. **Verificar Dados Antes de Usar**

```typescript
const settings = await window.electron.db.getUserSettings();

// Se não existir, usa defaults
const volume = settings?.volume ?? 0.8;
const provider = settings?.ttsProvider ?? 'elevenlabs';
```

### 5. **Backup dos Dados**

```typescript
// Exportar dados
const backup = await window.electron.db.export();

// Salvar em arquivo
const json = JSON.stringify(backup, null, 2);
const blob = new Blob([json], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `backup-${Date.now()}.json`;
a.click();
```

## 🔒 Segurança

- ✅ Dados salvos localmente no dispositivo do usuário
- ✅ Não há comunicação com servidores externos
- ✅ `electron-store` usa JSON Schema para validação
- ✅ Context isolation ativado no Electron
- ✅ `contextBridge` usado para expor APIs de forma segura

## 🐛 Debug

### Ver estatísticas do banco:

```typescript
const stats = await window.electron.db.getStats();
console.log(stats);
```

### Ver caminho do arquivo:

```typescript
const path = await window.electron.db.getPath();
console.log(path);
```

### Exportar dados completos:

```typescript
const data = await window.electron.db.export();
console.log(JSON.stringify(data, null, 2));
```

## 📚 Referências

- [electron-store Documentation](https://github.com/sindresorhus/electron-store)
- [Electron IPC Documentation](https://www.electronjs.org/docs/latest/api/ipc-main)
- [Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)

---

**Criado por:** Sistema de Database do Avatar AI  
**Data:** Dezembro 2025  
**Versão:** 1.0.0
