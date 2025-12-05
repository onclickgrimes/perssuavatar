# Migração para Nextron com Separação Estrita

Este documento detalha as alterações realizadas para migrar a aplicação para uma arquitetura segura com Nextron, separando Main e Renderer.

## 1. Arquitetura Implementada

### Main Process (`main/`)
- **`background.ts`**:
  - Configurado com `nodeIntegration: false` e `contextIsolation: true`.
  - Gerencia eventos IPC: `audio-data` (recebe áudio), `set-ignore-mouse-events` (click-through).
  - Envia eventos para o Renderer: `transcription`, `play-audio` (com buffer), `show-code`.
- **`lib/voice-assistant.ts`**:
  - Lógica de IA (Deepgram, OpenAI, ElevenLabs) isolada no backend.
  - Emite `audio-ready` com o **Buffer** de áudio, evitando leitura de arquivos locais no Renderer.
- **`preload.ts`**:
  - Expõe API segura via `contextBridge` no objeto `window.electron`.
  - Métodos: `sendAudioData`, `onTranscription`, `onPlayAudio`, `onShowCode`, `setIgnoreMouseEvents`.

### Renderer Process (`renderer/`)
- **`components/Avatar.tsx`**:
  - Implementação do PixiJS + Live2D.
  - Carrega modelos de `/models/` (agora em `public/models`).
  - Gerencia Lip Sync usando Web Audio API e o Buffer recebido do Main.
  - Controla `setIgnoreMouseEvents` para permitir cliques apenas no Avatar.
- **`components/CodePopup.tsx`**:
  - Exibe blocos de código detectados pela IA.
  - Habilita interação do mouse quando visível.
- **`hooks/useMicrophone.ts`**:
  - Captura áudio do microfone.
  - Converte Float32 para Int16 (PCM) antes de enviar via IPC.
- **`pages/home.tsx`**:
  - Integra Avatar e CodePopup.
  - Inicializa o microfone.

## 2. Alterações Realizadas

1.  **Movimentação de Arquivos**:
    - `renderer/models` movido para `renderer/public/models` para acesso via URL.

2.  **Código Adaptado**:
    - `renderer.md` (exemplo antigo) foi decomposto em componentes React (`Avatar.tsx`, `CodePopup.tsx`).
    - Lógica de conversão de áudio implementada em `useMicrophone.ts`.
    - `preload.ts` atualizado para expor `electron` e tipagem correta.
    - `background.ts` atualizado para lidar com envio de Buffer de áudio e controle de janela.

## 3. Como Usar

- O Avatar deve carregar automaticamente.
- O microfone inicia automaticamente.
- Ao falar, o áudio é processado no Main e a resposta retorna como áudio (tocado pelo Avatar com Lip Sync) e texto/código.
