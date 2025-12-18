# Trail Printing / Accordion Blur Effect

## Descrição

O efeito de **Trail Printing** (também conhecido como **Accordion Blur**) é um tipo de motion blur que deixa um rastro visual das frames anteriores antes de alcançar a cena atual. Este efeito é reminiscente da técnica prática de step-printing, criando uma múltipla exposição que transmite movimento e dinamismo.

## Características Visuais

- **Múltiplas Camadas**: Renderiza 6 camadas sobrepostas da mesma cena
- **Opacidade Decrescente**: Cada rastro mais antigo fica mais transparente
- **Movimento Ondulante**: Movimento horizontal dinâmico baseado em função seno
- **Movimento Vertical**: Oscilação vertical sutil para cada camada
- **Blur Progressivo**: Cada rastro tem um blur ligeiramente maior
- **Escala Variável**: Rastros mais antigos são ligeiramente menores
- **Rotação Sutil**: Cada camada tem uma rotação mínima para maior dinamismo

## Como Usar

### 1. Em um Projeto de Vídeo

Adicione o movimento de câmera `trail_printing` em qualquer cena:

```typescript
const scene: Scene = {
  id: 1,
  start_time: 0,
  end_time: 5,
  visual_concept: {
    description: 'Monges em movimento',
    art_style: 'cinematográfico',
    emotion: 'místico',
  },
  asset_type: 'image_static',
  asset_url: '/path/to/image.jpg',
  camera_movement: 'trail_printing', // 👈 Ativa o efeito
  transition: 'fade',
};
```

### 2. Visualizar a Demo

Execute o projeto Remotion e selecione a composição `TrailPrintingDemo`:

```bash
npm run dev
```

## Parâmetros do Efeito

Você pode ajustar o efeito editando as constantes no componente `TrailPrintingEffect` em `Scene.tsx`:

```typescript
const trailCount = 6;      // Número de rastros (padrão: 6)
const baseOpacity = 0.2;   // Opacidade base dos rastros (padrão: 0.2)
```

### Parâmetros Avançados

No código do efeito, você pode ajustar:

- **waveFactor**: Intensidade do movimento horizontal ondulante
- **horizontalOffset**: Distância horizontal entre rastros
- **verticalOffset**: Movimento vertical de cada rastro
- **scale**: Variação de escala entre rastros
- **rotation**: Grau de rotação entre camadas
- **blur**: Intensidade do blur progressivo

## Quando Usar

O efeito de trail printing é ideal para:

- ✅ Cenas de ação ou movimento
- ✅ Momentos de transição entre estados
- ✅ Criar sensação de velocidade ou urgência
- ✅ Efeitos dramáticos em cenas musicais
- ✅ Animações estilizadas
- ✅ Vídeos com estética retrô ou experimental

## Exemplos de Uso

### Exemplo 1: Cena de Meditação em Movimento

```json
{
  "visual_concept": {
    "description": "Monges budistas em movimento meditativo",
    "art_style": "cinematográfico, low-key lighting",
    "emotion": "contemplativo, místico"
  },
  "camera_movement": "trail_printing"
}
```

### Exemplo 2: Dança Dinâmica

```json
{
  "visual_concept": {
    "description": "Dançarino em movimento fluido",
    "art_style": "vibrante, high contrast",
    "emotion": "energético, expressivo"
  },
  "camera_movement": "trail_printing"
}
```

### Exemplo 3: Esportes em Ação

```json
{
  "visual_concept": {
    "description": "Atleta executando movimento rápido",
    "art_style": "dramático, slow-motion",
    "emotion": "poder, velocidade"
  },
  "camera_movement": "trail_printing"
}
```

## Performance

- **Renderização**: O efeito renderiza 7 camadas (6 rastros + frame atual)
- **Impacto**: Médio - usa filtros CSS e múltiplas transformações
- **Otimização**: Considere reduzir `trailCount` para projetos grandes

## Compatibilidade

- ✅ Funciona com todos os tipos de assets (imagens, vídeos, cores sólidas)
- ✅ Pode ser combinado com text overlays
- ✅ Suporta todos os tipos de transições

## Referências Técnicas

O efeito é implementado usando:
- **React Components**: Renderização condicional baseada no campo `camera_movement`
- **CSS Transforms**: `translate`, `scale`, `rotate`
- **CSS Filters**: `blur` progressivo
- **Animação**: Baseada em funções matemáticas (seno/cosseno)

## Arquivo de Origem

- **Componente**: `remotion/components/Scene.tsx` - `TrailPrintingEffect`
- **Demo**: `remotion/compositions/TrailPrintingDemo.tsx`
- **Tipos**: `remotion/types/project.ts` - `CameraMovement`
