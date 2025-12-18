# 🎬 Sistema de Palavras Destacadas no Vídeo

## 📋 Visão Geral

O sistema de **highlight words** permite que a IA identifique automaticamente palavras ou frases importantes durante a análise da transcrição e as destaque visualmente no vídeo com animações espetaculares.

## ✨ Funcionalidades

### 🎨 Animações de Entrada
- **pop**: Palavra "estoura" na tela com escala crescente
- **bounce**: Efeito de ricochete com múltiplas oscilações
- **explode**: Explosão rotativa com escala dinâmica
- **slide_up**: Desliza de baixo para cima
- **zoom_in**: Zoom gradual de pequeno para normal
- **fade**: Fade in simples

### 💨 Animações de Saída
- **evaporate** ⭐: Palavra sobe, diminui e desaparece (como evaporação)
- **dissolve**: Dissolução com blur crescente
- **implode**: Implosão rotativa
- **scatter**: Dispersão com partículas
- **slide_down**: Desliza para baixo
- **fade**: Fade out simples

### 🎯 Efeitos Visuais
- **glow**: Brilho radiante ao redor do texto
- **shadow**: Sombra sólida
- **outline**: Contorno preto
- **neon**: Efeito neon pulsante
- **none**: Sem efeito adicional

### 📐 Tamanhos
- **small**: 48px
- **medium**: 72px
- **large**: 108px (padrão)
- **huge**: 144px
- Ou valor numérico customizado

### 📍 Posições
- **center**: Centro da tela
- **top**: Topo centralizado
- **bottom**: Base centralizada
- **top-left**, **top-right**, **bottom-left**, **bottom-right**

---

## 🤖 Como a IA Identifica Palavras Destacadas

Durante a análise da transcrição (método `analyzeWithAI`), a IA recebe instruções para identificar:

1. **Conceitos-chave** ou termos técnicos importantes
2. **Números ou estatísticas** relevantes
3. **Palavras com emoção forte**
4. **Calls to action** ou mensagens principais

A IA retorna entre **1 e 3 palavras** por segmento, configuradas com:
- Texto exato
- Tempo de aparição (relativo ao início da cena)
- Duração da exibição
- Animações de entrada e saída
- Estilo visual

---

## 📝 Exemplo de JSON Retornado pela IA

```json
{
  "id": 1,
  "emotion": "empolgação",
  "imagePrompt": "futuristic technology, neon lights...",
  "assetType": "image_flux",
  "cameraMovement": "zoom_in_slow",
  "transition": "fade",
  "highlightWords": [
    {
      "text": "revolucionário",
      "time": 0.5,
      "duration": 1.5,
      "entryAnimation": "pop",
      "exitAnimation": "evaporate",
      "size": "large",
      "position": "center",
      "effect": "glow",
      "color": "#FFD700",
      "fontWeight": "bold"
    },
    {
      "text": "2024",
      "time": 3.0,
      "duration": 1.2,
      "entryAnimation": "explode",
      "exitAnimation": "scatter",
      "size": "huge",
      "position": "top",
      "effect": "neon",
      "highlightColor": "#FF00FF"
    }
  ]
}
```

---

## 🔧 Estrutura Técnica

### 1. **Types** (`remotion/types/project.ts`)
Define o schema `HighlightWordSchema` com todas as propriedades e validações.

### 2. **Componente** (`remotion/components/HighlightWord.tsx`)
Componente React que renderiza a palavra com animações usando Remotion:
- Calcula timing baseado em frames
- Aplica interpolações para animações suaves
- Renderiza efeitos de partículas para animações dramáticas

### 3. **Integração** (`remotion/components/Scene.tsx`)
As palavras destacadas são renderizadas sobre a cena, com z-index alto para ficarem sempre visíveis.

### 4. **IA** (`main/lib/services/video-project-service.ts`)
O prompt da IA foi atualizado para incluir instruções detalhadas sobre como identificar e configurar palavras destacadas.

---

## 🎥 Fluxo Completo

```
1. Usuário faz upload de áudio
   ↓
2. Áudio é transcrito em segmentos
   ↓
3. IA analisa e identifica palavras importantes
   ↓
4. IA retorna JSON com highlight_words configuradas
   ↓
5. Preview exibe as palavras com animações
   ↓
6. Renderização final inclui todos os efeitos
```

---

## 💡 Dicas de Uso

### Para Máximo Impacto:
1. **Use 'pop' + 'evaporate'** para palavras que simbolizam algo efêmero ou mágico
2. **Use 'explode' + 'scatter'** para conceitos surpreendentes ou revelações
3. **Use 'bounce' + 'implode'** para energia seguida de conclusão
4. **Use 'glow'** para palavras positivas ou importantes
5. **Use 'neon'** para tecnologia ou modernidade
6. **Use cores contrastantes** com a paleta da cena

### Timing Ideal:
- Palavras devem aparecer **entre 0.5s e 2s** após o início da cena
- Duração recomendada: **1.0s a 2.0s**
- Evite sobrepor múltiplas palavras ao mesmo tempo

### Cores Recomendadas:
- **#FFD700** (Dourado): Sucesso, valor, destaque
- **#FF00FF** (Magenta): Modernidade, tecnologia
- **#00FF00** (Verde neon): Crescimento, novidade
- **#FF1744** (Vermelho): Urgência, alerta
- **#00E5FF** (Ciano): Frio, tecnológico

---

## 🚀 Como Testar

1. Abra o **Remotion Studio**:
   ```bash
   npx remotion studio remotion/index.ts --port 3333
   ```

2. Navegue até a composição **VideoProject**

3. Veja a segunda cena (4s-9s) onde a palavra **"Ken Burns"** aparece com:
   - Entrada: `pop` (estouro)
   - Saída: `evaporate` (evaporação)
   - Tamanho: `huge` (enorme)
   - Efeito: `glow` (brilho dourado)

4. Experimente modificar o JSON no código ou criar novos projetos via Video Studio

---

## 🎨 Customização Avançada

Para criar seus próprios efeitos, edite:
- **Animações**: `remotion/components/HighlightWord.tsx` (linhas 40-160)
- **Efeitos visuais**: `remotion/components/HighlightWord.tsx` (linhas 230-270)
- **Partículas**: `remotion/components/HighlightWord. tsx` (linhas 310-350)

---

## ✅ Próximos Passos

1. ✅ Schema e tipos criados
2. ✅ Componente de animação implementado
3. ✅ Integração na Scene
4. ✅ Prompt da IA atualizado
5. ✅ Exemplo funcional no defaultVideoProject
6. ⏳ Testar com IA real em um projeto completo
7. ⏳ Ajustar animações baseado em feedback visual

---

**Criado em**: 2025-12-18  
**Status**: ✅ Implementado e Pronto para Uso
