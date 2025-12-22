# Guia de Integração: Componente Timeline3D

Este documento detalha o fluxo completo de implementação e integração do componente `Timeline3D` na arquitetura "Video Studio". Ele cobre desde a definição dos tipos e schemas, passando pela persistência de dados (Salvar/Carregar JSON), até a renderização no Remotion e Preview.

## 1. Definição de Tipos e Schemas

A base da integração é a definição da estrutura de dados que o componente espera. Isso garante que o TypeScript e a validação Zod funcionem em todo o projeto.

### 1.1. Schemas do Remotion (`remotion/types/project.ts`)

Adicionamos os schemas Zod para validar a configuração da timeline dentro do JSON do projeto.

```typescript
// Definição de um item individual da timeline
export const TimelineItemSchema = z.object({
  id: z.string(),
  year: z.string(),
  label: z.string(),
  image: z.string().optional(),
});

// Configuração geral que agrupa os itens
export const TimelineConfigSchema = z.object({
  items: z.array(TimelineItemSchema),
});

// Adição ao Schema da Cena (SceneSchema)
export const SceneSchema = z.object({
  // ... outros campos
  
  /** Configuração da linha do tempo 3D */
  timeline_config: TimelineConfigSchema.optional(),

  // Adição do tipo de asset 'timeline_3d'
  asset_type: z.enum([..., 'timeline_3d']),
});
```

### 1.2. Tipos do Frontend (`renderer/types/video-studio.ts`)

Para que o editor visual (React) consiga manipular esses dados antes de enviar para o backend, atualizamos as interfaces:

```typescript
export interface TranscriptionSegment {
  // ...
  
  /** Configuração opcional para cenas do tipo timeline_3d */
  timeline_config?: {
    items: Array<{
        id: string;
        year: string;
        label: string;
        image?: string;
    }>;
  };
}
```

---

## 2. Persistência de Dados (Salvar e Carregar)

O fluxo de dados entre o Frontend (Electron/React) e o Backend (Node.js) é crucial. Sem isso, os dados da timeline seriam perdidos ao fechar o app.

### 2.1. Frontend: Salvando o Projeto (`renderer/pages/video-studio.tsx`)

Na função `handleSaveProject`, é necessário extrair explicitamente o `timeline_config` do estado do React e incluí-lo no objeto enviado ao backend.

```typescript
const projectData = {
  // ...
  segments: project.segments.map(seg => ({
    // ...
    // É CRUCIAL passar essa propriedade explicitamente
    timeline_config: seg.timeline_config, 
    assetType: seg.assetType,
    // ...
  })),
  // ...
};
```

### 2.2. Frontend: Carregando o Projeto (`renderer/pages/video-studio.tsx`)

Na função `handleLoadProject`, fazemos o inverso: mapeamos os dados vindos do arquivo JSON de volta para o estado da aplicação.

```typescript
setProject({
  // ...
  segments: loadedProject.segments.map((seg: any) => ({
     // ...
     // Recupera a configuração salva no JSON
     timeline_config: seg.timeline_config,
     // ...
  })),
});
```

### 2.3. Backend: Serviço de Projeto (`main/lib/services/video-project-service.ts`)

O serviço backend atua como "porteiro". Ele precisa permitir a passagem desses dados nas funções `saveProject` e `loadProject`. Certifique-se de que o objeto `orderedProject` (usado para salvar o JSON) inclua a propriedade `timeline_config`.

---

## 3. Renderização e Preview

Para que o usuário veja a Timeline 3D, precisamos converter os dados do projeto para o formato que o Remotion entende. Isso acontece em dois lugares: no backend (para renderização final) e no frontend (para preview rápido).

### 3.1. backend: Renderização Final (`video-project-service.ts`)

Na função `convertToRemotionProject`, convertemos o JSON do projeto para o `RemotionProject`.

```typescript
const scenes = project.segments.map(seg => ({
    // ...
    asset_type: seg.assetType,
    
    // Mapeamento condicional: Só adiciona se existir timeline_config
    ...(seg.timeline_config && {
        timeline_config: seg.timeline_config
    }),
}));
```

### 3.2. Frontend: Preview Instantâneo (`PreviewStep.tsx`)

O componente `PreviewStep` faz uma conversão similar "on-the-fly" para alimentar o player. **Se esquecer de mapear aqui, a timeline não aparece no preview, mesmo estando salva no JSON.**

```typescript
// Dentro do useMemo do remotionProject
scenes: project.segments.map(seg => ({
  // ...
  ...(seg.timeline_config && {
    timeline_config: seg.timeline_config,
  }),
})),
```

---

## 4. O Componente Remotion

Finalmente, o componente React do Remotion que desenha a tela.

### 4.1. Scene Wrapper (`remotion/components/Scene.tsx`)

O componente `Scene` decide o que renderizar com base no `asset_type`.

```tsx
// Switch case no AssetRenderer
case 'timeline_3d':
   if (scene.timeline_config) {
        // Passa os itens do JSON diretamente para o componente visual
        return <Timeline3D items={scene.timeline_config.items} />;
   }
   return <PlaceholderImage description="Timeline 3D (Sem configuração)" />;
```

### 4.2. Timeline3D Implementation (`remotion/components/Timeline3D.tsx`)

O componente visual utiliza:
- `useCurrentFrame` e `interpolate` para animar a câmera.
- CSS 3D Transforms (`perspective`, `rotateY`, `translateZ`) para o efeito visual.
- Uma verificação de robustez para garantir que `items` seja sempre um array, evitando crashes com JSON malformado.

---

## 5. Exemplo de JSON

Para testar manualmente, insira este bloco em um segmento do seu arquivo de projeto JSON:

```json
{
  "id": 2,
  "asset_type": "timeline_3d",
  "start_time": 5,
  "end_time": 15,
  "timeline_config": {
    "items": [
        {
            "id": "1",
            "year": "470 BC",
            "label": "Socrates",
            "image": "http://localhost:9999/images/socrates.png"
        },
        {
            "id": "2",
            "year": "1915",
            "label": "Einstein",
            "image": "http://localhost:9999/images/einstein.png"
        }
    ]
  },
  "camera_movement": "static",
  "transition": "fade"
}
```
