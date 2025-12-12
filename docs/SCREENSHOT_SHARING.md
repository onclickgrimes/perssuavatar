# Funcionalidade de Compartilhamento de Screenshots

## 📋 Visão Geral

Implementamos uma funcionalidade completa de compartilhamento de screenshots que permite:
- **Compartilhamento via voz**: Os assistentes de IA (modos Live e Classic) podem compartilhar screenshots usando chamadas de função
- **Compartilhamento manual**: Botões na galeria de screenshots permitem compartilhamento direto
- **Plataformas suportadas**: WhatsApp Web, Email e Google Drive

## 🎯 Como Usar

### 1. Via Comandos de Voz

#### Modo Classic (OpenAI/Gemini/DeepSeek)
```
Usuário: "Envia esse screenshot para o WhatsApp"
Assistente: *executa share_screenshot* "Pronto! WhatsApp Web foi aberto..."
```

#### Modo Live (Gemini Live)
```
Usuário: "Manda essa imagem para o meu email"
Assistente: *executa share_screenshot* "Email aberto com a imagem na área de transferência..."
```

### 2. Via Interface Gráfica

Na galeria de screenshots (janela suspensa no lado direito), ao passar o mouse sobre um screenshot:
- **Botão Verde** (WhatsApp): Compartilha via WhatsApp Web
- **Botão Azul** (Email): Abre cliente de email
- **Botão Amarelo** (Drive): Salva em pasta local e abre Google Drive

## 🔧 Implementação Técnica

### Arquivos Modificados/Criados

1. **`main/lib/tools.ts`**
   - Adicionada ferramenta `share_screenshot` em `UNIFIED_TOOLS` e `UNIFIED_LIVE_TOOLS`
   - Parâmetros: `platform` (whatsapp/email/drive), `recipient` (opcional), `message` (opcional)

2. **`main/lib/screenshot-share-service.ts`** (NOVO)
   - Serviço centralizado para compartilhamento
   - Métodos separados para cada plataforma
   - Integração com Electron shell e clipboard

3. **`main/lib/voice-assistant.ts`**
   - Handler `share_screenshot` no modo Live (`handleLiveToolCall`)
   - Handler `share_screenshot` no modo Classic (`processUserMessage`)
   - Instância do `ScreenshotShareService`

4. **`main/background.ts`**
   - IPC handler `share-screenshot` para comunicação renderer → main
   - Instância do `ScreenshotShareService`

5. **`renderer/pages/screenshot-gallery.tsx`**
   - Botões de compartilhamento com hover effects
   - Função `handleShare` que chama IPC
   - Ícones SVG para WhatsApp, Email e Drive

### Fluxo de Execução

#### Via Comando de Voz:
```
1. Usuário fala "envia para WhatsApp"
2. AI detecta intenção → chama tool share_screenshot
3. VoiceAssistant.handleLiveToolCall (ou processUserMessage)
4. ScreenshotShareService.shareScreenshot
5. Shell abre WhatsApp Web + clipboard com imagem
6. AI responde confirmando ação
```

#### Via Interface:
```
1. Usuário clica botão WhatsApp na galeria
2. handleShare → IPC 'share-screenshot'
3. background.ts handler → ScreenshotShareService
4. Shell abre WhatsApp Web + clipboard com imagem
5. Console log com resultado
```

## 🌐 Detalhes por Plataforma

### WhatsApp Web
- Abre `https://web.whatsapp.com/send`
- Se `recipient` fornecido: adiciona `?phone={número}`
- Se `message` fornecido: adiciona `&text={mensagem}`
- **Screenshot copiado para clipboard** → usuário cola com Ctrl+V

### Email
- Abre cliente padrão via `mailto:`
- Assunto: "Screenshot"
- Corpo: mensagem customizada ou padrão
- **Screenshot copiado para clipboard** → usuário cola com Ctrl+V
- *Nota: mailto: não suporta anexos nativamente, por isso usamos clipboard*

### Google Drive
- Salva screenshot em `Documentos/Screenshots para Drive/`
- Nome do arquivo: `screenshot_{timestamp}.png`
- Abre `https://drive.google.com/drive/my-drive`
- Mostra pasta no Explorer
- **Screenshot copiado para clipboard** → usuário pode arrastar arquivo ou colar

## 📝 Exemplos de Comandos de Voz

```javascript
"Tira um print da tela"
→ take_screenshot

"Envia esse print para o WhatsApp"
→ share_screenshot(platform: "whatsapp")

"Manda essa imagem para fulano@email.com"
→ share_screenshot(platform: "email", recipient: "fulano@email.com")

"Salva no Drive"
→ share_screenshot(platform: "drive")

"Manda pro WhatsApp do João com a mensagem 'olha isso'"
→ share_screenshot(platform: "whatsapp", message: "olha isso")
```

## 🎨 UI/UX

### Design dos Botões
- **Overlay gradient** aparece no hover
- **3 botões circulares** coloridos por plataforma
- **Animações**: scale(1.1) no hover
- **Tooltips**: title attributes para acessibilidade
- **Z-index**: botão de fechar (X) sempre visível acima dos botões de share

### Feedback Visual
- Console logs coloridos com emojis
- Mensagens de sucesso/erro no console
- *(Futuro)* Toast notifications para feedback visual direto ao usuário

## 🔐 Segurança e Privacidade

- Screenshots são salvos localmente em `app.getPath('userData')/last_screenshot.png`
- Nenhum upload automático para servidores externos
- Todas as ações de compartilhamento requerem ação explícita do usuário ou comando de voz
- Arquivos temporários podem ser limpos pelo usuário

## 🐛 Troubleshooting

### "Nenhum screenshot encontrado"
- **Causa**: Não há screenshot recente em `userData/last_screenshot.png`
- **Solução**: Use "tira um print" ou PrintScreen antes de tentar compartilhar

### WhatsApp Web não abre
- **Causa**: Navegador padrão não configurado
- **Solução**: Configure navegador padrão no Windows

### Email não abre
- **Causa**: Cliente de email não configurado
- **Solução**: Configure cliente de email padrão (Outlook, Thunderbird, etc.)

### Screenshot não cola no WhatsApp/Email
- **Causa**: Clipboard foi sobrescrito
- **Solução**: Execute o comando de compartilhamento novamente

## 🚀 Melhorias Futuras

1. **Múltiplos screenshots**: Permitir selecionar vários para compartilhar de uma vez
2. **Histórico de compartilhamentos**: Salvar log de onde cada screenshot foi enviado
3. **Integração direta com APIs**: 
   - WhatsApp Business API
   - Gmail API
   - Google Drive API (upload direto)
4. **Outros destinos**:
   - Slack
   - Discord
   - Telegram
   - Clipboard do sistema
   - Salvar em pasta customizada
5. **Edição antes de compartilhar**: Crop, anotações, desenhos
6. **Toast notifications**: Feedback visual na UI
7. **Atalhos de teclado**: Ex: Ctrl+Shift+W para WhatsApp

## 📚 Referências

- [Electron Shell API](https://www.electronjs.org/docs/latest/api/shell)
- [Electron Clipboard API](https://www.electronjs.org/docs/latest/api/clipboard)
- [WhatsApp Web URL Scheme](https://faq.whatsapp.com/general/chats/how-to-use-click-to-chat)
- [Mailto URL Scheme](https://datatracker.ietf.org/doc/html/rfc6068)
