# Efeito Wave - HighlightWord

## Descrição
O efeito **wave** (onda) cria uma animação onde o texto aparece inicialmente vazado (outline) e enche de baixo para cima, como se fosse uma onda preenchendo o texto.

## Como usar

### Entrada (Entry Animation)
```json
{
  "text": "BOOM!",
  "time": 2.5,
  "duration": 2.0,
  "entryAnimation": "wave",
  "exitAnimation": "fade",
  "size": "huge",
  "color": "#FF6B35",
  "position": "center",
  "effect": "glow"
}
```

### Saída (Exit Animation)
```json
{
  "text": "INCRÍVEL",
  "time": 5.0,
  "duration": 2.0,
  "entryAnimation": "pop",
  "exitAnimation": "wave",
  "size": "large",
  "color": "#00D9FF",
  "position": "top",
  "effect": "neon"
}
```

## Características do Efeito

### Durante a Entrada (Entry)
1. O texto aparece com outline vazado (contorno visível, interior transparente)
2. O preenchimento sobe de baixo para cima gradualmente
3. Dura 30% do tempo total da duração da palavra

### Durante a Saída (Exit)
1. O texto preenchido começa a esvaziar
2. O esvaziamento acontece de cima para baixo
3. O outline permanece visível até o final
4. Dura 30% do tempo total da duração da palavra

## Parâmetros Importantes

- **color**: Define a cor tanto do outline quanto do preenchimento
- **size**: Tamanho do texto (recomendado: 'large' ou 'huge' para melhor visualização)
- **position**: Posição na tela
- **duration**: Quanto maior a duração, mais suave será o efeito de preenchimento

## Combinações Recomendadas

### Impacto Dramático
```json
{
  "entryAnimation": "wave",
  "exitAnimation": "evaporate",
  "effect": "glow",
  "color": "#FF3366"
}
```

### Estilo Neon Urbano
```json
{
  "entryAnimation": "wave",
  "exitAnimation": "dissolve",
  "effect": "neon",
  "color": "#00FFFF"
}
```

### Elegante e Suave
```json
{
  "entryAnimation": "wave",
  "exitAnimation": "fade",
  "effect": "outline",
  "color": "#FFFFFF"
}
```

## Notas Técnicas

- O efeito utiliza `clip-path` CSS para criar o preenchimento progressivo
- O outline usa `-webkit-text-stroke` para criar o contorno vazado
- Funciona melhor com fontes bold ou black
- A espessura do outline é fixada em 3px para melhor visibilidade

## Exemplo Completo em Cena

```json
{
  "id": 1,
  "start_time": 0,
  "end_time": 10,
  "transcript_segment": "Este é um exemplo incrível!",
  "visual_concept": {
    "description": "Fundo escuro com partículas flutuantes"
  },
  "asset_type": "solid_color",
  "camera_movement": "static",
  "highlight_words": [
    {
      "text": "INCRÍVEL",
      "time": 3.0,
      "duration": 2.5,
      "entryAnimation": "wave",
      "exitAnimation": "evaporate",
      "size": "huge",
      "color": "#FFD700",
      "position": "center",
      "effect": "glow",
      "fontWeight": "black"
    }
  ]
}
```
