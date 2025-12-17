# 🎬 Módulo Remotion - Geração de Vídeos

Este módulo permite gerar vídeos programaticamente usando React através do [Remotion](https://remotion.dev).

## 📁 Estrutura

```
remotion/
├── index.ts                    # Entry point (registra composições)
├── Root.tsx                    # Registro de composições
├── tsconfig.json               # Config TypeScript
│
├── compositions/               # Composições de vídeo
│   ├── ExampleComposition.tsx  # Exemplo simples
│   └── VideoProject.tsx        # ⭐ Composição principal (processa JSON)
│
├── components/                 # Componentes reutilizáveis
│   ├── Scene.tsx               # Renderiza uma cena
│   └── TextOverlay.tsx         # Overlay de texto animado
│
├── types/                      # Definições TypeScript
│   └── project.ts              # Schema do projeto JSON
│
├── utils/                      # Utilitários
│   ├── camera-effects.ts       # Efeitos de câmera
│   └── transitions.ts          # Transições entre cenas
│
└── examples/                   # Exemplos de projetos
    └── raspadinhas-project.json
```

## 🚀 Comandos

### Iniciar o Remotion Studio (Preview/Editor visual)
```bash
npm run remotion:studio
```
Abre em `http://localhost:3000` - você pode visualizar e editar composições em tempo real.

### Renderizar um vídeo
```bash
npm run remotion:render -- VideoProject output.mp4
```

### Renderizar com projeto JSON customizado
```bash
npx remotion render remotion/index.ts VideoProject out.mp4 --props='$(cat meu-projeto.json | jq -c "{project: .}")'
```

## 📝 Estrutura do Projeto JSON

A IA deve gerar um JSON seguindo este schema:

```json
{
  "project_title": "Título do Projeto",
  "description": "Descrição opcional",
  "config": {
    "width": 1920,
    "height": 1080,
    "fps": 30,
    "backgroundColor": "#000000",
    "backgroundMusic": {
      "src": "url-da-musica.mp3",
      "volume": 0.3
    }
  },
  "scenes": [
    {
      "id": 1,
      "start_time": 0.0,
      "end_time": 5.0,
      "transcript_segment": "Texto da narração...",
      "visual_concept": {
        "description": "Descrição visual da cena",
        "art_style": "photorealistic, 8k",
        "emotion": "surpresa",
        "color_palette": ["#FFD700", "#1a1a2e"]
      },
      "asset_type": "image_flux",
      "asset_url": "",
      "prompt_suggestion": "prompt para gerar imagem/video",
      "camera_movement": "zoom_in_slow",
      "transition": "fade",
      "transition_duration": 0.5,
      "text_overlay": {
        "text": "Texto na tela",
        "position": "bottom",
        "style": "subtitle",
        "animation": "slide_up"
      }
    }
  ],
  "schema_version": "1.0"
}
```

## 🎥 Tipos de Asset

| Tipo | Descrição | Quando Usar |
|------|-----------|-------------|
| `image_flux` | Imagem gerada pelo Flux | Cenários, objetos, ilustrações |
| `image_dalle` | Imagem gerada pelo DALL-E | Arte conceitual |
| `image_static` | Imagem já existente | Assets pré-prontos |
| `video_kling` | Vídeo gerado pelo Kling | Ações humanas complexas |
| `video_runway` | Vídeo gerado pelo Runway | Transições, efeitos |
| `video_static` | Vídeo já existente | Clips pré-gravados |
| `avatar` | Avatar animado | Apresentador virtual |
| `text_only` | Apenas texto | Slides de informação |
| `solid_color` | Cor sólida | Fundos, transições |

## 📷 Movimentos de Câmera

| Movimento | Descrição |
|-----------|-----------|
| `static` | Sem movimento |
| `zoom_in_slow` | Zoom in lento (1→1.15x) |
| `zoom_in_fast` | Zoom in rápido (1→1.3x) |
| `zoom_out_slow` | Zoom out lento |
| `zoom_out_fast` | Zoom out rápido |
| `pan_left` | Pan para esquerda |
| `pan_right` | Pan para direita |
| `pan_up` | Pan para cima |
| `pan_down` | Pan para baixo |
| `ken_burns` | Zoom + pan suave (documentário) |
| `shake` | Tremor sutil |
| `rotate_cw` | Rotação horária |
| `rotate_ccw` | Rotação anti-horária |

## 🔄 Transições

| Transição | Descrição |
|-----------|-----------|
| `none` | Corte seco |
| `fade` | Fade in/out |
| `crossfade` | Crossfade com próxima cena |
| `slide_left/right/up/down` | Deslizar |
| `zoom_in/out` | Zoom como transição |
| `blur` | Blur transition |
| `glitch` | Efeito glitch |

## 💬 Estilos de Texto

| Estilo | Uso |
|--------|-----|
| `title` | Títulos grandes, uppercase |
| `subtitle` | Legendas com fundo |
| `caption` | Texto pequeno de apoio |
| `highlight` | Destaque com fundo colorido |
| `quote` | Citações com borda lateral |

## 🎭 Animações de Texto

| Animação | Descrição |
|----------|-----------|
| `none` | Sem animação |
| `fade` | Fade in/out |
| `typewriter` | Efeito máquina de escrever |
| `slide_up` | Desliza de baixo |
| `pop` | Efeito pop com spring |
| `bounce` | Bounce com spring |

## 💻 Uso no Electron (Main Process)

```typescript
import { VideoService } from './lib/services/video-service';

const videoService = new VideoService();

// Escutar progresso
videoService.on('progress', (data) => {
  console.log(`[${data.stage}] ${Math.round(data.progress * 100)}%`);
});

// Renderizar projeto JSON
const project = {
  project_title: "Meu Vídeo",
  scenes: [/* ... */]
};

const result = await videoService.renderProject(project);

if (result.success) {
  console.log('Vídeo salvo em:', result.outputPath);
} else {
  console.error('Erro:', result.error);
}

// Ou renderizar de arquivo JSON
const result = await videoService.renderProjectFromFile('./projeto.json');
```

## 🔧 Workflow com IA

1. **Entrada**: Usuário fornece texto/roteiro/ideia
2. **IA Processa**: Gera JSON estruturado com cenas
3. **Geração de Assets**: Para cada cena, gera imagem/vídeo via API
4. **Preenche URLs**: Atualiza `asset_url` com URLs geradas
5. **Renderiza**: `VideoService.renderProject(json)`
6. **Saída**: Arquivo MP4 pronto

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Roteiro    │────▶│   IA gera    │────▶│   Gerar      │
│   do User    │     │    JSON      │     │   Assets     │
└──────────────┘     └──────────────┘     └──────────────┘
                                                  │
┌──────────────┐     ┌──────────────┐             │
│   MP4 Final  │◀────│   Remotion   │◀────────────┘
│              │     │   Render     │
└──────────────┘     └──────────────┘
```

## 📚 Documentação Oficial

- [Remotion Docs](https://www.remotion.dev/docs/)
- [API Reference](https://www.remotion.dev/api)
- [Exemplos](https://www.remotion.dev/examples)

## ⚖️ Licença

O Remotion é gratuito para uso pessoal e projetos open-source.
Para uso comercial com receita > $50k/ano, é necessária uma licença.
Veja: https://remotion.dev/license
