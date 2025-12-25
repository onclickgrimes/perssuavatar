# Assets Services

Este módulo contém serviços para busca de mídias (fotos e vídeos) de diferentes provedores, usados pelo sistema de geração de vídeos baseado em IA.

## Provedores Disponíveis

### Pexels
- **Fotos e vídeos gratuitos** e de alta qualidade
- **API:** https://www.pexels.com/api/documentation/
- **Rate Limit:** 200 req/hora, 20.000 req/mês (pode ser aumentado sob solicitação)

## Configuração

Adicione a seguinte variável de ambiente no arquivo `.env`:

```env
PEXELS_API_KEY=sua_chave_aqui
```

Para obter uma chave de API:
1. Crie uma conta em https://www.pexels.com
2. Acesse https://www.pexels.com/api/
3. Copie sua chave de API

## Uso

### Importação

```typescript
import { getPexelsService, PexelsService, MediaResult } from '../lib/assets';
```

### Busca Simples de Vídeos

```typescript
const pexels = getPexelsService();

// Busca vídeos por termo
const response = await pexels.searchVideos({
  query: 'natureza floresta tropical',
  orientation: 'landscape',
  perPage: 10,
});

console.log(response.results); // Array de MediaResult
```

### Busca de Fotos

```typescript
const response = await pexels.searchPhotos({
  query: 'pôr do sol no mar',
  orientation: 'landscape',
  size: 'large',
  perPage: 5,
});
```

### Busca Otimizada para Cenas (IA)

Este método é especialmente útil quando a IA gera prompts visuais baseados na análise do áudio:

```typescript
const pexels = getPexelsService();

// Busca mídia para uma cena (prioriza vídeos)
const medias = await pexels.searchForScene(
  'pessoas celebrando em festa ao ar livre',
  {
    preferVideo: true,
    orientation: 'landscape',
    minDuration: 5,
    maxDuration: 30,
    limit: 3,
  }
);

// Usa a primeira mídia encontrada
const bestMatch = medias[0];
console.log(bestMatch.directUrl); // URL do vídeo/foto
console.log(bestMatch.type); // 'video' ou 'photo'
```

### Obtendo Mídia por ID

```typescript
// Foto específica
const photo = await pexels.getPhotoById(2014422);

// Vídeo específico
const video = await pexels.getVideoById(2499611);
```

### Vídeos Populares e Fotos Curadas

```typescript
// Fotos curadas (trending)
const curated = await pexels.getCuratedPhotos(1, 10);

// Vídeos populares
const popular = await pexels.getPopularVideos(1, 10);
```

## Estrutura MediaResult

Todos os métodos retornam um formato padronizado `MediaResult`:

```typescript
interface MediaResult {
  id: number | string;         // ID no provedor
  type: 'photo' | 'video';     // Tipo da mídia
  provider: 'pexels';          // Provedor de origem
  width: number;               // Largura em pixels
  height: number;              // Altura em pixels
  url: string;                 // URL da página no provedor
  duration?: number;           // Duração (apenas vídeos)
  thumbnail: string;           // URL da thumbnail
  description?: string;        // Alt text
  author: MediaAuthor;         // Informações do autor
  imageSizes?: MediaImageSizes; // Diferentes tamanhos (fotos)
  videoFiles?: MediaVideoFile[]; // Diferentes qualidades (vídeos)
  avgColor?: string;           // Cor média (hex)
  suggestedAssetType: AssetType; // Tipo de asset sugerido
  directUrl: string;           // URL direta para uso
  searchQuery?: string;        // Query usada na busca
}
```

## Atribuição

**IMPORTANTE:** Conforme guidelines do Pexels, você DEVE creditar os autores:

```typescript
const media = await pexels.getVideoById(2499611);

// Texto simples
const text = pexels.getAttribution(media);
// "Video by Joey Farina on Pexels"

// HTML
const html = pexels.getAttributionHtml(media);
// <a href="...">Video</a> by <a href="...">Joey Farina</a> on <a href="...">Pexels</a>
```

## Rate Limit

O Pexels tem rate limit de 200 requests/hora. O serviço rastreia isso automaticamente:

```typescript
const pexels = getPexelsService();

// Verifica rate limit
const { remaining, resetAt } = pexels.getRateLimitInfo();
console.log(`Requisições restantes: ${remaining}`);
console.log(`Reset em: ${resetAt.toLocaleString()}`);
```

## Extensão

Para adicionar novos provedores (Unsplash, Pixabay, etc.), implemente a interface `MediaSearchService`:

```typescript
import type { MediaSearchService, MediaSearchParams, MediaSearchResponse, MediaResult } from './types';

export class UnsplashService implements MediaSearchService {
  readonly providerName = 'unsplash';
  
  async searchPhotos(params: MediaSearchParams): Promise<MediaSearchResponse> {
    // Implementação...
  }
  
  // ... outros métodos
}
```
