# Menu Radial - Avatar AI

## 📋 Descrição

O Menu Radial é uma interface circular intuitiva que aparece ao segurar o botão direito do mouse sobre o avatar. Ele fornece acesso rápido aos principais atalhos da ActionBar.

## 🎯 Como Usar

1. **Ativar o Menu**: Posicione o cursor sobre o avatar e **segure o botão direito do mouse** por **500ms** (meio segundo)
2. **Feedback Visual**: Durante o hold, um círculo de progresso aparecerá indicando quando o menu será ativado
3. **Selecionar Opção**: Quando o menu aparecer, mova o cursor sobre o item desejado e clique
4. **Fechar o Menu**: 
   - Pressione **ESC**
   - Clique fora do menu
   - Clique no botão "Fechar" (vermelho)

## 🎨 Opções Disponíveis

O menu oferece 5 opções dispostas em círculo:

| Posição | Ícone | Ação | Cor | Descrição |
|---------|-------|------|-----|-----------|
| 0° (direita) | ⚙️ | **Configurações** | Roxo (#8B5CF6) | Abre o painel de configurações |
| 72° | 🕐 | **Histórico** | Verde (#10B981) | Visualiza o histórico de conversas |
| 144° | 🎤 | **Começar a Ouvir** | Azul (#0066FF) | Ativa a janela de transcrição (equivalente a Ctrl+D) |
| 216° | 💬 | **Perguntar** | Laranja (#F59E0B) | Abre interface para fazer perguntas |
| 288° | ❌ | **Fechar** | Vermelho (#EF4444) | Fecha o menu radial |

## ✨ Recursos

### Animações
- **Aparição suave**: Menu aparece com efeito de fade-in e zoom
- **Items escalonados**: Cada item aparece com um pequeno delay (50ms entre eles)
- **Hover effects**: Botões crescem e brilham ao passar o mouse
- **Ripple effect**: Efeito de ondulação nos itens ao hover
- **Progresso visual**: Círculo de progresso durante o hold do botão direito

### Feedback Visual
- **Centro pulsante**: Indicador branco no centro do menu que pulsa
- **Círculo de fundo**: Fundo escuro semi-transparente com blur
- **Labels dinâmicas**: Nomes das ações aparecem ao passar o mouse
- **Cores distintas**: Cada ação tem sua própria cor para fácil identificação
- **Indicador de progresso**: Mostra visualmente quando o menu será ativado

### UX
- **Atalhos de teclado**: ESC para fechar
- **Click outside**: Clica fora do menu para fechá-lo
- **Cancelamento**: Soltar o botão antes de 500ms cancela a ação
- **Z-index alto**: Menu sempre aparece sobre outros elementos (z-9999)
- **Pointer events**: Apenas os botões são clicáveis, o resto é transparente a eventos

## 🔧 Configuração

### Constantes Ajustáveis

No arquivo `RadialMenu.tsx`:

```typescript
const HOLD_DURATION = 500;  // Tempo de hold em ms (padrão: 500ms)
const MENU_RADIUS = 100;    // Raio do círculo em px (padrão: 100px)
const ITEM_SIZE = 50;       // Tamanho dos botões em px (padrão: 50px)
```

### Personalização de Cores

Cada item do menu possui duas cores:
- `color`: Cor padrão do botão
- `hoverColor`: Cor ao passar o mouse

Para alterar, edite o array `menuItems` no componente.

## 📊 Geometria

O menu usa coordenadas polares para posicionar os itens:

```
Ângulo (graus) → Posição no círculo
0°   → Direita (3h)
72°  → Superior-direita (1h30)
144° → Superior-esquerda (10h30)
216° → Inferior-esquerda (7h30)
288° → Inferior-direita (4h30)
```

Fórmula de conversão:
```typescript
const angleRad = (angle * Math.PI) / 180;
const x = Math.cos(angleRad) * MENU_RADIUS;
const y = Math.sin(angleRad) * MENU_RADIUS;
```

## 🎭 Animações CSS

Arquivo: `renderer/styles/radial-menu.css` (importado globalmente em `_app.tsx`)

- `radial-appear`: Animação de aparecimento do menu completo
- `radial-item-appear`: Animação de aparecimento individual dos itens
- `radial-pulse`: Pulsação do centro do menu
- `radial-ripple`: Efeito de ondulação nos itens

**Nota**: O CSS é importado globalmente no `_app.tsx` conforme exigido pelo Next.js para arquivos CSS globais.

## 🐛 Troubleshooting

### O menu não aparece
- Verifique se está clicando com o botão direito sobre o canvas do avatar
- Certifique-se de segurar o botão por pelo menos 500ms
- Verifique o console para logs de ativação

### Items não respondem ao click
- Certifique-se de que os handlers foram passados corretamente como props
- Verifique se há erros no console
- Confirme que as funções estão definidas no componente pai (HomePage)

### Menu aparece em posição errada
- O menu usa as coordenadas do mouse no momento do clique direito
- Se a janela for redimensionada durante o hold, pode haver desalinhamento

## 🔄 Integração com HomePage

No arquivo `home.tsx`, o menu está integrado com:

```tsx
<RadialMenu
  onOpenSettings={handleOpenSettings}
  onOpenHistory={handleOpenHistory}
  onStartListening={handleStartListening}
  onAsk={handleAsk}
/>
```

Cada handler executa a ação correspondente e fecha o menu automaticamente.

## 📝 TODO

- [ ] Implementar funcionalidade de histórico
- [ ] Implementar funcionalidade de "Perguntar" (Ctrl+Enter)
- [ ] Adicionar mais opções ao menu (customizável)
- [ ] Permitir configuração do tempo de hold nas settings
- [ ] Adicionar sons de feedback (opcional)
- [ ] Suporte a gestos touch em tablets
