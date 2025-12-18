# 🎬 Trail Printing / Accordion Blur Effect

![Exemplo do efeito](../../.gemini/antigravity/brain/a19874fd-7d23-4915-9284-c1a20e1baf1a/uploaded_image_1766023696175.png)

> **Efeito de múltipla exposição que deixa um rastro visual das frames anteriores, criando uma sensação de movimento fluido e dinâmico.**

## ⚡ Quick Start

```typescript
// Em qualquer cena do seu projeto
{
  "camera_movement": "trail_printing"
}
```

## 🎥 Ver as Demos

Execute o projeto Remotion:
```bash
npm run dev
```

Selecione uma das composições:
- **`TrailPrintingDemo`** - Veja o efeito em ação
- **`TrailPrintingVisualGuide`** - Entenda como funciona

## 📚 Documentação Completa

- **[TRAIL_PRINTING_EFFECT.md](./TRAIL_PRINTING_EFFECT.md)** - Guia completo de uso
- **[TRAIL_PRINTING_IMPLEMENTATION.md](./TRAIL_PRINTING_IMPLEMENTATION.md)** - Detalhes técnicos

## 🎨 O que faz?

O efeito cria **6 camadas semi-transparentes** do mesmo conteúdo com:
- ✅ Opacidade decrescente
- ✅ Movimento horizontal ondulante  
- ✅ Deslocamento vertical sutil
- ✅ Blur progressivo
- ✅ Escala e rotação variável

## 💫 Quando usar?

- Cenas de **ação** e movimento rápido
- Momentos **dramáticos** ou emocionais
- Efeitos **musicais** sincronizados
- Estética **retrô** ou experimental
- Movimentos **contemplativos** (meditação, dança)

## 🔧 Customização

Ajuste os parâmetros em `Scene.tsx`:

```typescript
const trailCount = 6;      // Número de rastros
const baseOpacity = 0.2;   // Opacidade inicial
```

## 🚀 Pronto!

O efeito está totalmente integrado e disponível para uso imediato em todos os projetos de vídeo! 🎉
