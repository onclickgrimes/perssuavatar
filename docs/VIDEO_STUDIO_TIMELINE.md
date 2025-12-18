# 🎬 Nova Interface do Video Studio - Editor com Timeline

## 📋 Mudança de Paradigma

### Antes (Steps/Workflow)
```
Upload Áudio → Keyframes → Prompts → Imagens → Preview → Render
```

### Agora (Editor com Timeline)
```
Upload Áudio → EDITOR COMPLETO → Render
```

## 🎨 Nova Estrutura da Interface

### Layout Principal
```
┌─────────────────────────────────────────────────────────┐
│                      HEADER                             │
│  [Logo] [Project Name]        [Salvar] [Renderizar]    │
├─────────┬────────────────────────────────┬──────────────┤
│         │                                │              │
│  MEDIA  │          PREVIEW               │ PROPERTIES   │
│ LIBRARY │                                │    PANEL     │
│         │   [Video Player Preview]       │              │
│ Cena 1  │                                │  Texto       │
│ Cena 2  ├────────────────────────────────┤  Timing      │
│ Cena 3  │         TIMELINE               │  Camera      │
│ Cena 4  │                                │  Transition  │
│ ...     │  [Ruler] [Tracks] [Playhead]   │  Media       │
│         │                                │              │
└─────────┴────────────────────────────────┴──────────────┘
```

## 🔧 Componentes Principais

### 1. Header
- **Nome do projeto** (editável inline)
- **Botão Salvar**
- **Botão Renderizar**

### 2. Media Library (Esquerda)
- Lista todas as cenas/clipes
- Mostra miniatura da mídia
- Timing de cada cena
- Clique para selecionar

### 3. Preview Panel (Centro Superior)
- Player de vídeo com preview
- Controles de play/pause
- Barra de progresso
- Contador de tempo

### 4. Timeline (Centro Inferior)
- **Ruler**: Marcações de tempo (0s, 1s, 2s...)
- **Audio Track**: Representação visual do áudio
- **Video Track**: Cards para cada cena
- **Playhead**: Indicador vermelho da posição atual
- **Zoom**: Controles +/- para ampliar/reduzir

### 5. Properties Panel (Direita)
Quando uma cena está selecionada:
- **Texto**: Editar transcrição
- **Timing**: Ajustar início/fim
- **Movimento de Câmera**: Dropdown com opções
- **Transição**: Dropdown com efeitos
- **Mídia**: Preview + botão para trocar

## 🎯 Funcionalidades Implementadas

### ✅ Fase 1 - Estrutura Base
- [x] Layout responsivo com 3 colunas
- [x] Header com controles principais
- [x] Media Library com lista de cenas
- [x] Preview Panel básico
- [x] Timeline com ruler e tracks
- [x] Properties Panel com formulários
- [x] Sistema de seleção de cenas
- [x] Estado global do projeto

### 🔄 Próximas Fases

#### Fase 2 - Interatividade
- [ ] Drag & drop nas cenas da timeline
- [ ] Resize de cenas (handles nas bordas)
- [ ] Timeline scrollable e zoomable
- [ ] Preview player funcional com Remotion
- [ ] Sincronização preview ↔ timeline

#### Fase 3 - Edição Avançada
- [ ] Upload de mídia (drag & drop)
- [ ] Cortar/dividir cenas
- [ ] Copiar/colar cenas
- [ ] Undo/Redo
- [ ] Atalhos de teclado (Space=play, etc)

#### Fase 4 - Efeitos e Animações
- [ ] Preview em tempo real dos efeitos
- [ ] Animações de transição
- [ ] Text overlays editáveis
- [ ] Biblioteca de efeitos visuais

## 🎨 Design System

### Cores
- **Background**: `#1F2937` (gray-800)
- **Surface**: `#111827` (gray-900)
- **Primary**: `#9333EA` (purple-600)
- **Accent**: `#EC4899` (pink-600)
- **Text**: `#FFFFFF` (white)
- **Muted**: `#6B7280` (gray-500)

### Componentes
- **Bordas**: Rounded (lg = 0.5rem, xl = 0.75rem)
- **Espaçamento**: 4px increments (p-2, p-4, p-6)
- **Transições**: `transition-colors`, `transition-all`

## 📐 Especificações Técnicas

### Timeline
- **Zoom padrão**: 1x (100 pixels por segundo)
- **Zoom mín/máx**: 0.5x - 5x
- **Altura do ruler**: 32px
- **Altura da track de áudio**: 64px
- **Altura das cenas**: 80px
- **Cor do playhead**: Red (#EF4444)

### Segments (Cenas)
```typescript
interface TranscriptionSegment {
  id: number;
  text: string;
  start: number;      // segundos
  end: number;        // segundos
  speaker: number;
  emotion?: string;
  imagePrompt?: string;
  imageUrl?: string;
  assetType?: string;
  cameraMovement?: string;
  transition?: string;
}
```

## 🔄 Fluxo de Trabalho

### 1. Upload de Áudio
```
Usuário → Arrasta/Seleciona áudio → Upload → Transcrição automática
```

### 2. Edição
```
Timeline carregada com cenas → 
Usuário seleciona cena → 
Properties panel mostra opções → 
Usuário edita → 
Preview atualiza
```

### 3. Renderização
```
Usuário clica "Renderizar" → 
Validação do projeto → 
Remotion render → 
Download do vídeo
```

## 💾 Estado da Aplicação

```typescript
ProjectState {
  title: string;
  audioPath: string;
  duration: number;
  segments: TranscriptionSegment[];
  
  // UI State
  selectedSegmentId: number | null;
  currentTime: number;
  isPlaying: boolean;
  zoom: number;
}
```

## 🎮 Interações Planejadas

### Mouse
- **Click na timeline**: Move playhead
- **Click em cena**: Seleciona cena
- **Drag cena**: Move no tempo
- **Resize handles**: Ajusta duração
- **Scroll horizontal**: Navega timeline

### Teclado
- **Space**: Play/Pause
- **←/→**: Frame anterior/próximo
- **Home**: Ir para início
- **End**: Ir para fim
- **Delete**: Remover cena selecionada
- **Ctrl+Z**: Undo
- **Ctrl+S**: Salvar

## 📱 Responsividade

### Desktop (1920x1080+)
- Layout completo com 3 colunas
- Timeline expandida

### Tablet (768px - 1920px)
- Properties panel colapsável
- Timeline reduzida

### Mobile (<768px)
- Não suportado (usar versão desktop)

## 🚀 Como Testar

1. Acesse `/video-studio`
2. Upload de áudio (qualquer arquivo de áudio)
3. A interface do editor carrega automaticamente
4. Explore a timeline, selecione cenas, edite propriedades

## 📦 Arquivos

- **Principal**: `renderer/pages/video-studio.tsx`
- **Backup do antigo**: `renderer/pages/video-studio-old-backup.tsx`
- **Documentação**: `VIDEO_STUDIO_TIMELINE.md` (este arquivo)

## 🎯 Próximos Passos

1. ✅ **Estrutura base criada**
2. 🔄 **Integrar com backend** (upload real de áudio)
3. 🔄 **Conectar Remotion** para preview
4. 🔄 **Implementar drag & drop**
5. 🔄 **Adicionar atalhos de teclado**
6. 🔄 **Melhorar UX de edição**

---

**Status**: 🟢 Estrutura completa e funcional  
**Versão**: 1.0.0  
**Data**: 2025-12-18
