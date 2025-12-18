# Correção de Transições Entre Cenas

## Problema Identificado

As transições entre cenas estavam causando um espaço preto de aproximadamente 1 segundo entre uma cena e outra. Isso ocorria porque:

### Antes da Correção

```
Cena 1: frames 0-120 (0s a 4s)
  ├─ Transição de saída: frames 105-120 (opacity: 1 → 0)
  └─ Background visível até frame 105, depois fade out

[ESPAÇO PRETO nos frames 105-120]
  └─ Cena 1 está transparent (opacity = 0)
  └─ Cena 2 ainda não começou

Cena 2: frames 120-270 (4s a 9s)
  ├─ Transição de entrada: frames 120-135 (opacity: 0 → 1)
  └─ Fade in começa, mas há gap visual

[ESPAÇO PRETO nos frames 120-135]
  └─ Cena 2 ainda em fade in (opacity < 1)
```

**Resultado**: ~1 segundo de tela preta entre cenas!

### Depois da Correção

```
Cena 1: frames 0-135 (estendida)
  ├─ Conteúdo principal: frames 0-120
  ├─ Transição de saída: frames 105-120
  └─ Continua renderizando até frame 135 para overlap

Cena 2: frames 105-270 (começa mais cedo)
  ├─ Transição de entrada: frames 105-120
  ├─ Conteúdo principal: frames 120-270
  └─ Começa ANTES do tempo original (overlap)

OVERLAP/CROSSFADE: frames 105-135
  ├─ Cena 1 está em fade out (opacity: 1 → 0)
  └─ Cena 2 está em fade in (opacity: 0 → 1)
  └─ Soma das opacidades = 1 (sem espaço preto!)
```

**Resultado**: Transição suave sem espaços pretos!

## Alterações Implementadas

### 1. Cálculo de Início das Sequences

**Antes:**
```typescript
const startFrame = Math.round(scene.start_time * fps);
```

**Depois:**
```typescript
// Primeira cena: começa no frame original
// Demais cenas: começam ANTES para sobrepor com saída da anterior
const sequenceStart = isFirstScene ? startFrame : startFrame - transitionFrames;
```

### 2. Cálculo de Duração das Sequences

**Antes:**
```typescript
const durationFrames = endFrame - startFrame;
```

**Depois:**
```typescript
// Última cena: duração base + transição de entrada
// Outras cenas: duração base + entrada + saída (para sobrepor)
const sequenceDuration = isLastScene
  ? baseDuration + (isFirstScene ? 0 : transitionFrames)
  : baseDuration + (isFirstScene ? transitionFrames : transitionFrames * 2);
```

### 3. Lógica de Transição com Offset

**Antes:**
```typescript
const isInEnterTransition = frame < transitionFrames;
const isInExitTransition = frame > durationFrames - transitionFrames;
```

**Depois:**
```typescript
// Considera o offset inicial para cenas não-primeiras
const entryOffset = isFirstScene ? 0 : transitionFrames;

const isInEnterTransition = frame < entryOffset + transitionFrames;
const isInExitTransition = !isLastScene && frame > entryOffset + baseDuration;

// Ajusta o frame para a transição de entrada
const enterFrame = frame - entryOffset;
```

## Exemplo Prático

Dado um projeto com 3 cenas e `transition_duration: 0.5s` (15 frames a 30fps):

### Cena 1 (0s - 4s)
- **Sequence Start**: frame 0
- **Sequence Duration**: 120 + 15 = 135 frames
- **Transição de entrada**: frames 0-15 (fade in)
- **Conteúdo principal**: frames 15-120
- **Transição de saída**: frames 105-120 (fade out)
- **Overlap**: frames 120-135 (continua renderizando para sobrepor com Cena 2)

### Cena 2 (4s - 9s)
- **Sequence Start**: frame 105 (120 - 15)
- **Sequence Duration**: 150 + 30 = 180 frames
- **Transição de entrada**: frames 0-15 da sequence (frames globais 105-120)
- **Conteúdo principal**: frames 15-165 da sequence
- **Transição de saída**: frames 150-165 da sequence
- **Overlap início**: frames 105-120 (crossfade com Cena 1)
- **Overlap fim**: frames 255-270 (crossfade com Cena 3)

### Cena 3 (9s - 13s)
- **Sequence Start**: frame 255 (270 - 15)
- **Sequence Duration**: 120 + 15 = 135 frames
- **Transição de entrada**: frames 0-15 da sequence (frames globais 255-270)
- **Conteúdo principal**: frames 15-135 da sequence
- **Sem transição de saída** (última cena)
- **Overlap**: frames 255-270 (crossfade com Cena 2)

## Benefícios

1. ✅ **Sem espaços pretos**: As transições agora se sobrepõem perfeitamente
2. ✅ **Crossfade suave**: A soma das opacidades sempre resulta em tela cheia
3. ✅ **Consistência**: Funciona com qualquer tipo de transição (fade, slide, zoom, etc)
4. ✅ **Flexível**: A duração da transição pode ser ajustada por cena sem quebrar a lógica
5. ✅ **Otimizado**: Apenas renderiza os frames necessários para cada cena

## Tipos de Transição Afetados

Todas as transições foram corrigidas:
- `fade` / `crossfade`
- `slide_left` / `slide_right` / `slide_up` / `slide_down`
- `zoom_in` / `zoom_out`
- `wipe_left` / `wipe_right`
- `blur`
- `glitch`

## Notas Técnicas

- A primeira cena não precisa de offset, pois não há cena anterior
- A última cena não precisa estender sua duração, pois não há próxima cena
- O `relativeFrame` passado para `<Scene>` continua sendo calculado normalmente
- Os efeitos de câmera continuam funcionando independentemente das transições
