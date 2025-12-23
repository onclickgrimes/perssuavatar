# ChromaKeyMedia - Componente de Remoção de Fundo (Chroma Key)

## Descrição

O `ChromaKeyMedia` é um componente do Remotion para aplicar efeito de **chroma key** (remoção de fundo verde/azul) em vídeos ou imagens. Ele é baseado na [documentação oficial do Remotion](https://www.remotion.dev/docs/video-manipulation#greenscreen-example).

## Uso Básico

### 1. Usando no Asset Type `video_chromakey`

Na sua cena do projeto, defina o `asset_type` como `video_chromakey`:

```json
{
  "id": 1,
  "start_time": 0,
  "end_time": 10,
  "transcript_segment": "Olá, bem-vindo!",
  "visual_concept": {
    "description": "Apresentador em estúdio",
    "art_style": "professional"
  },
  "asset_type": "video_chromakey",
  "asset_url": "http://localhost:9999/videos/presenter-greenscreen.mp4",
  "chroma_key": {
    "color": "green",
    "threshold": 100,
    "smoothing": 0.2
  }
}
```

### 2. Usando o Componente Diretamente

```tsx
import { ChromaKeyMedia, greenScreenPreset } from 'remotion/components';

// Uso com preset de tela verde
<ChromaKeyMedia
  src="http://exemplo.com/video-greenscreen.mp4"
  type="video"
  chromaKey={greenScreenPreset}
/>

// Uso com configuração customizada
<ChromaKeyMedia
  src="http://exemplo.com/video.mp4"
  type="video"
  chromaKey={{
    color: 'green',
    threshold: 80,
    smoothing: 0.3,
  }}
/>

// Uso com tela azul
<ChromaKeyMedia
  src="http://exemplo.com/video-bluescreen.mp4"
  type="video"
  chromaKey={{
    color: 'blue',
    threshold: 100,
    smoothing: 0.2,
  }}
/>

// Uso com cor customizada
<ChromaKeyMedia
  src="http://exemplo.com/video.mp4"
  type="video"
  chromaKey={{
    color: 'custom',
    customColor: { r: 0, g: 255, b: 0 },
    threshold: 100,
    smoothing: 0.2,
  }}
/>
```

## Props

### ChromaKeyMediaProps

| Prop | Tipo | Padrão | Descrição |
|------|------|--------|-----------|
| `src` | `string` | *obrigatório* | URL do vídeo ou imagem |
| `type` | `'video' \| 'image'` | *obrigatório* | Tipo de mídia |
| `chromaKey` | `ChromaKeyConfig` | *obrigatório* | Configuração do chroma key |
| `style` | `React.CSSProperties` | `undefined` | Estilos adicionais |
| `volume` | `number` | `0` | Volume do vídeo (0-1) |
| `startFrom` | `number` | `undefined` | Frame inicial |
| `endAt` | `number` | `undefined` | Frame final |

### ChromaKeyConfig

| Prop | Tipo | Padrão | Descrição |
|------|------|--------|-----------|
| `color` | `'green' \| 'blue' \| 'custom'` | `'green'` | Cor base para remoção |
| `customColor` | `{ r: number; g: number; b: number }` | `undefined` | Cor RGB (apenas se color === 'custom') |
| `threshold` | `number` | `100` | Limiar de detecção (0-255) |
| `smoothing` | `number` | `0.2` | Suavização das bordas (0-1) |

## Presets Disponíveis

```tsx
import { 
  greenScreenPreset,   // Tela verde padrão (threshold: 100, smoothing: 0.2)
  blueScreenPreset,    // Tela azul padrão (threshold: 100, smoothing: 0.2)
  studioGreenPreset,   // Verde de estúdio (threshold: 80, smoothing: 0.3)
  studioBluePreset     // Azul de estúdio (threshold: 80, smoothing: 0.3)
} from 'remotion/components';
```

## Ajustando os Parâmetros

### Threshold (Limiar)
- **Valor baixo (50-80)**: Mais sensível, remove mais tonalidades da cor
- **Valor alto (100-150)**: Menos sensível, remove apenas cores mais puras
- Comece com 100 e ajuste conforme necessário

### Smoothing (Suavização)
- **0**: Bordas duras, sem transição
- **0.1-0.3**: Bordas suaves, boa para a maioria dos casos
- **0.5-1.0**: Bordas muito suaves, pode causar transparência em áreas indesejadas

## Exemplo Completo de Cena com Chroma Key

```json
{
  "project_title": "Apresentação com Avatar",
  "config": {
    "width": 1920,
    "height": 1080,
    "fps": 30
  },
  "scenes": [
    {
      "id": 1,
      "start_time": 0,
      "end_time": 5,
      "transcript_segment": "Bem-vindo ao nosso vídeo!",
      "visual_concept": {
        "description": "Fundo gradiente",
        "color_palette": ["#1a1a2e", "#16213e"]
      },
      "asset_type": "solid_color",
      "camera_movement": "static"
    },
    {
      "id": 2,
      "start_time": 0,
      "end_time": 5,
      "transcript_segment": "",
      "visual_concept": {
        "description": "Apresentador em chroma key sobreposto"
      },
      "asset_type": "video_chromakey",
      "asset_url": "http://localhost:9999/videos/presenter.mp4",
      "chroma_key": {
        "color": "green",
        "threshold": 90,
        "smoothing": 0.25
      },
      "camera_movement": "static"
    }
  ]
}
```

## Como Funciona

1. O vídeo é renderizado em um elemento `<OffthreadVideo>` invisível
2. Cada frame é capturado via `onVideoFrame` callback
3. Os pixels são processados em um `<canvas>`:
   - Se o pixel corresponde à cor de chroma key → transparente
   - Caso contrário → mantém o pixel original
4. O resultado processado é exibido no canvas

## Requisitos

- Remotion v4.0.190 ou superior (para suporte ao `onVideoFrame`)
- Vídeos com boa iluminação para melhores resultados
- Fundo verde/azul uniforme recomendado
