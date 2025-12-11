# Estrutura do VoiceAssistant

## 📋 Visão Geral

O arquivo `voice-assistant.ts` foi reorganizado para ter uma **separação clara** entre os modos **Classic** e **Live**. Cada seção está marcada com comentários visuais para facilitar a navegação e manutenção do código.

---

## 🗂️ Estrutura do Arquivo

### 1️⃣ **SHARED SERVICES & STATE**
Serviços e estados compartilhados entre os dois modos:
- `OpenAIService` - Análise de imagens e chat (fallback)
- `GeminiService` - Análise de vídeo e chat
- `DeepSeekService` - Chat completion alternativo
- `systemPrompt` - Prompt do sistema
- `recordingContext` - Contexto das gravações
- `lastRecordingPath` - Caminho da última gravação
- `transcribeOnlyMode` - Modo apenas transcrição
- `mode` - Modo atual ('classic' | 'live')

---

### 2️⃣ **CLASSIC MODE - Services & State**
Exclusivo do modo Classic:
- `DeepgramService` - Speech-to-text
- `TTSService` - Text-to-speech (Polly/ElevenLabs)
- `ttsProvider` - Provedor de TTS
- `aiProvider` - Provedor de IA (OpenAI/Gemini/DeepSeek)
- `isProcessing` - Flag de processamento
- `conversationHistory` - Histórico de conversação

---

### 3️⃣ **LIVE MODE - Services & State**
Exclusivo do modo Live:
- `GeminiLiveService` - Processamento de áudio em tempo real com Gemini

---

### 4️⃣ **CONSTRUCTOR & INITIALIZATION**
Inicialização dos serviços e setup dos event listeners:
```typescript
constructor(ttsProvider)
  ├─ Initialize Shared Services
  ├─ Initialize Classic Mode Services
  ├─ Initialize Live Mode Services
  └─ Setup Event Listeners
```

---

## 🎯 Event Listeners

### **CLASSIC MODE - EVENT LISTENERS**
```typescript
setupClassicModeEvents()
  ├─ TTS Events (audio-chunk, audio-end)
  ├─ Deepgram Events (transcription-final, status)
  └─ Error Events
```

### **LIVE MODE - EVENT LISTENERS**
```typescript
setupLiveModeEvents()
  ├─ Audio Events (audio-chunk, audio-full)
  ├─ Status Events
  ├─ Avatar Actions
  ├─ Text Response
  ├─ Interruption
  ├─ Tool Calls
  └─ Transcriptions (user, model)
```

### **SHARED EVENT LISTENERS**
```typescript
setupSharedEvents()
  └─ Gemini Service Status
```

---

## 🔄 Métodos Principais

### **CLASSIC MODE - Métodos Privados**
| Método | Descrição |
|--------|-----------|
| `handleClassicTranscription()` | Processa transcrições do Deepgram |
| `processUserMessage()` | Processamento de mensagem do usuário via IA |
| `handleAIResponseText()` | Trata resposta da IA e extrai comandos de avatar |
| `generateAndPlayAudio()` | Gera e reproduz áudio TTS |

### **LIVE MODE - Métodos Privados**
| Método | Descrição |
|--------|-----------|
| `handleLiveToolCall()` | Processa chamadas de ferramentas do Gemini Live |

### **SHARED METHODS**
| Categoria | Métodos |
|-----------|---------|
| **Análise de Mídia** | `analyzeVideo()`, `analyzeScreenshot()` |
| **Configuração** | `updateContext()` |

---

## 🎛️ API Pública

### **MODE CONTROL & SWITCHING**
```typescript
setMode(mode: 'classic' | 'live')  // Alterna entre modos
getMode(): 'classic' | 'live'      // Retorna modo atual
```

### **CLASSIC MODE - Public Methods**
```typescript
startDeepgram(audioStream?)        // Inicia transcrição
stopDeepgram()                     // Para transcrição
setAIProvider(provider)            // Define provedor de IA
getAIProvider()                    // Retorna provedor de IA
setTTSProvider(provider)           // Define provedor de TTS
getTTSProvider()                   // Retorna provedor de TTS
```

### **LIVE MODE - Public Methods**
```typescript
sendScreenFrame(base64Image)       // Envia frame de tela para Gemini Live
```

### **SHARED PUBLIC METHODS**
```typescript
// Audio Processing
processAudioStream(chunk)          // Processa áudio (Classic ou Live)

// Transcribe-Only Mode
enableTranscribeOnlyMode()         // Ativa modo só transcrição
disableTranscribeOnlyMode()        // Desativa modo só transcrição
isTranscribeOnlyMode()             // Verifica estado do modo

// Recording Path
setLastRecordingPath(path)         // Define caminho da última gravação
getLastRecordingPath()             // Retorna caminho da última gravação
```

---

## 🔍 Fluxo de Dados

### **CLASSIC MODE**
```
Usuário Fala
    ↓
Deepgram (STT)
    ↓
handleClassicTranscription()
    ↓
processUserMessage()
    ↓
AI Provider (OpenAI/Gemini/DeepSeek)
    ↓
handleAIResponseText()
    ↓
generateAndPlayAudio()
    ↓
TTS Service (Polly/ElevenLabs)
    ↓
Avatar Fala
```

### **LIVE MODE**
```
Usuário Fala
    ↓
processAudioStream() → Gemini Live Service
    ↓
[Real-time Processing]
    ↓
Events: audio-chunk, text, avatar-action, tool-call
    ↓
Avatar Fala (áudio direto do Gemini)
```

---

## 🎨 Features por Modo

| Feature | Classic | Live |
|---------|---------|------|
| **Speech-to-Text** | Deepgram | Gemini Native |
| **Text-to-Speech** | Polly/ElevenLabs | Gemini Native |
| **AI Processing** | OpenAI/Gemini/DeepSeek | Gemini Live |
| **Tool Calling** | ✅ (control_recording, take_screenshot) | ✅ (control_screen_share, save_recording, take_screenshot) |
| **Real-time Audio** | ❌ | ✅ |
| **Screen Sharing** | ❌ | ✅ |
| **Conversation History** | ✅ | ❌ (gerenciado pelo Gemini) |
| **Interruption Support** | ❌ | ✅ |

---

## 📝 Notas Importantes

1. **Transcrições**: Ambos os modos emitem `user-transcription` e `model-transcription` para a janela de transcrição
2. **Transcribe-Only Mode**: Quando ativado, o avatar não responde, apenas transcreve
3. **Análise de Imagem**: Sempre usa OpenAI (DeepSeek e Gemini não têm API de visão robusta)
4. **Análise de Vídeo**: Sempre usa Gemini
5. **Switching de Modo**: Ao mudar de modo, os recursos do modo anterior são desligados automaticamente

---

## 🚀 Como Usar

### Modo Classic
```typescript
voiceAssistant.setMode('classic');
voiceAssistant.setAIProvider('gemini');
voiceAssistant.setTTSProvider('elevenlabs');
voiceAssistant.startDeepgram(audioStream);
```

### Modo Live
```typescript
voiceAssistant.setMode('live');  // Conecta automaticamente ao Gemini Live
// Screen sharing
voiceAssistant.sendScreenFrame(base64Image);
```
