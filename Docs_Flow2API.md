# Flow2API

**Um serviço de API compatível com OpenAI e completo, que fornece uma interface unificada para o Flow**

## ✨ Recursos principais

- 🎨 **Texto para imagem** / **imagem para imagem**.
- 🎬 **Texto para vídeo** / **imagem para vídeo**.
- 🎞️ **Vídeo com quadro inicial e final**.
- 🔄 **Atualização automática de AT/ST** - quando o AT expira, ele é renovado automaticamente; quando o ST expira, ele é atualizado automaticamente pelo navegador (modo personal).
- 📊 **Exibição de saldo** - consulta e mostra em tempo real os créditos do VideoFX.
- 🚀 **Balanceamento de carga** - rotação entre múltiplos tokens e controle de concorrência.
- 🌐 **Suporte a proxy** - compatível com proxy HTTP/SOCKS5.
- 📱 **Interface web de administração** - gerenciamento intuitivo de tokens e configurações.
- 🎨 **Conversas contínuas para geração de imagens**.
- 🧩 **Compatível com o corpo de requisição oficial do Gemini** - suporta `generateContent` / `streamGenerateContent`, `systemInstruction`, `contents.parts.text/inlineData/fileData`.
- ✅ **Formato oficial do Gemini testado com sucesso para geração de imagens** - já foi verificado com token real que `/models/{model}:generateContent` retorna corretamente `candidates[].content.parts[].inlineData`.


## 🚀 Início rápido

### Requisitos

- Docker e Docker Compose (recomendado).
- Ou Python 3.8+.

Como o Flow adicionou um CAPTCHA extra, você pode optar por resolvê-lo com navegador ou com um serviço terceirizado: registre-se no [YesCaptcha](https://yescaptcha.com/i/13Xd8K) e obtenha uma chave de API; depois, preencha a área `YesCaptcha API密钥` na página de configuração do sistema.

Por padrão, o `docker-compose.yml` é recomendado para uso com serviços terceirizados de resolução de CAPTCHA (`yescaptcha/capmonster/ezcaptcha/capsolver`).
Se quiser usar resolução com navegador visível dentro do Docker (`browser/personal`), use o arquivo `docker-compose.headed.yml`.

Extensão do navegador para atualização automática de ST: [Flow2API-Token-Updater](https://github.com/TheSmallHanCat/Flow2API-Token-Updater).

### Método 1: implantação com Docker (recomendado)

#### Modo padrão (sem proxy)

```bash
# Clonar o projeto
git clone https://github.com/TheSmallHanCat/flow2api.git
cd flow2api

# Iniciar o serviço
docker-compose up -d

# Ver logs
docker-compose logs -f
```

Observação: o Compose já monta `./tmp:/app/tmp` por padrão. Se o tempo de expiração do cache for definido como `0`, isso significa “não expirar nem excluir automaticamente”; se você quiser preservar os arquivos de cache após recriar o contêiner, também precisará manter essa montagem de `tmp`.

#### Modo WARP (com proxy)

```bash
# Iniciar com proxy WARP
docker-compose -f docker-compose.warp.yml up -d

# Ver logs
docker-compose -f docker-compose.warp.yml logs -f
```


#### Modo Docker com navegador visível para CAPTCHA (`browser / personal`)

Esse modo é indicado para cenários em que você precisa de desktop virtualizado e quer habilitar um navegador visível dentro do contêiner para resolver CAPTCHA.
Ele inicia por padrão `Xvfb + Fluxbox` para fornecer visualização interna no contêiner e define `ALLOW_DOCKER_HEADED_CAPTCHA=true`.
Apenas a porta da aplicação é exposta; nenhuma porta de conexão remota de desktop é disponibilizada.
O navegador embutido no modo `personal` agora inicia por padrão em modo visível; se quiser voltar temporariamente ao modo headless, defina também a variável `PERSONAL_BROWSER_HEADLESS=true`.

```bash
# Iniciar modo visível (na primeira vez, recomenda-se usar --build)
docker compose -f docker-compose.headed.yml up -d --build

# Ver logs
docker compose -f docker-compose.headed.yml logs -f
```

- Porta da API: `8000`.
- Depois de entrar no painel de administração, defina o método de CAPTCHA como `browser` ou `personal`.


### Método 2: implantação local

```bash
# Clonar o projeto
git clone https://github.com/TheSmallHanCat/flow2api.git
cd flow2api

# Criar ambiente virtual
python -m venv venv

# Ativar ambiente virtual
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

# Instalar dependências
pip install -r requirements.txt

# Iniciar serviço
python main.py
```


### Primeiro acesso

Depois que o serviço for iniciado, acesse o painel administrativo em **http://localhost:8000**; após o primeiro login, altere a senha imediatamente.

- **Usuário**: `admin`.
- **Senha**: `admin`.


### Página de teste de modelos

Acesse **http://localhost:8000/test** para abrir a página interna de teste de modelos.

Ela suporta:

- Navegar por todos os modelos disponíveis por categoria, como geração de imagem, texto/imagem para vídeo, vídeo com múltiplas imagens e upscaling de vídeo.
- Inserir um prompt e testar com um clique, exibindo o progresso da geração em streaming.
- Fazer upload de imagem em cenários de imagem para imagem e imagem para vídeo.
- Visualizar diretamente a imagem ou o vídeo após a geração.


## 📋 Modelos suportados

### Geração de imagem

| Nome do modelo | Descrição | Dimensão |
| :-- | :-- | :-- |
| `gemini-2.5-flash-image-landscape` | Imagem a partir de imagem/texto | Horizontal |
| `gemini-2.5-flash-image-portrait` | Imagem a partir de imagem/texto | Vertical |
| `gemini-3.0-pro-image-landscape` | Imagem a partir de imagem/texto | Horizontal |
| `gemini-3.0-pro-image-portrait` | Imagem a partir de imagem/texto | Vertical |
| `gemini-3.0-pro-image-square` | Imagem a partir de imagem/texto | Quadrado |
| `gemini-3.0-pro-image-four-three` | Imagem a partir de imagem/texto | Horizontal 4:3 |
| `gemini-3.0-pro-image-three-four` | Imagem a partir de imagem/texto | Vertical 3:4 |
| `gemini-3.0-pro-image-landscape-2k` | Imagem a partir de imagem/texto (2K) | Horizontal |
| `gemini-3.0-pro-image-portrait-2k` | Imagem a partir de imagem/texto (2K) | Vertical |
| `gemini-3.0-pro-image-square-2k` | Imagem a partir de imagem/texto (2K) | Quadrado |
| `gemini-3.0-pro-image-four-three-2k` | Imagem a partir de imagem/texto (2K) | Horizontal 4:3 |
| `gemini-3.0-pro-image-three-four-2k` | Imagem a partir de imagem/texto (2K) | Vertical 3:4 |
| `gemini-3.0-pro-image-landscape-4k` | Imagem a partir de imagem/texto (4K) | Horizontal |
| `gemini-3.0-pro-image-portrait-4k` | Imagem a partir de imagem/texto (4K) | Vertical |
| `gemini-3.0-pro-image-square-4k` | Imagem a partir de imagem/texto (4K) | Quadrado |
| `gemini-3.0-pro-image-four-three-4k` | Imagem a partir de imagem/texto (4K) | Horizontal 4:3 |
| `gemini-3.0-pro-image-three-four-4k` | Imagem a partir de imagem/texto (4K) | Vertical 3:4 |
| `imagen-4.0-generate-preview-landscape` | Imagem a partir de imagem/texto | Horizontal |
| `imagen-4.0-generate-preview-portrait` | Imagem a partir de imagem/texto | Vertical |
| `gemini-3.1-flash-image-landscape` | Imagem a partir de imagem/texto | Horizontal |
| `gemini-3.1-flash-image-portrait` | Imagem a partir de imagem/texto | Vertical |
| `gemini-3.1-flash-image-square` | Imagem a partir de imagem/texto | Quadrado |
| `gemini-3.1-flash-image-four-three` | Imagem a partir de imagem/texto | Horizontal 4:3 |
| `gemini-3.1-flash-image-three-four` | Imagem a partir de imagem/texto | Vertical 3:4 |
| `gemini-3.1-flash-image-landscape-2k` | Imagem a partir de imagem/texto (2K) | Horizontal |
| `gemini-3.1-flash-image-portrait-2k` | Imagem a partir de imagem/texto (2K) | Vertical |
| `gemini-3.1-flash-image-square-2k` | Imagem a partir de imagem/texto (2K) | Quadrado |
| `gemini-3.1-flash-image-four-three-2k` | Imagem a partir de imagem/texto (2K) | Horizontal 4:3 |
| `gemini-3.1-flash-image-three-four-2k` | Imagem a partir de imagem/texto (2K) | Vertical 3:4 |
| `gemini-3.1-flash-image-landscape-4k` | Imagem a partir de imagem/texto (4K) | Horizontal |
| `gemini-3.1-flash-image-portrait-4k` | Imagem a partir de imagem/texto (4K) | Vertical |
| `gemini-3.1-flash-image-square-4k` | Imagem a partir de imagem/texto (4K) | Quadrado |
| `gemini-3.1-flash-image-four-three-4k` | Imagem a partir de imagem/texto (4K) | Horizontal 4:3 |
| `gemini-3.1-flash-image-three-four-4k` | Imagem a partir de imagem/texto (4K) | Vertical 3:4 |

### Geração de vídeo

#### Texto para vídeo (T2V - Text to Video)

⚠️ **Não suporta upload de imagem**.


| Nome do modelo | Descrição | Dimensão |
| :-- | :-- | :-- |
| `veo_3_1_t2v_fast_portrait` | Texto para vídeo | Vertical |
| `veo_3_1_t2v_fast_landscape` | Texto para vídeo | Horizontal |
| `veo_3_1_t2v_fast_portrait_ultra` | Texto para vídeo | Vertical |
| `veo_3_1_t2v_fast_ultra` | Texto para vídeo | Horizontal |
| `veo_3_1_t2v_fast_portrait_ultra_relaxed` | Texto para vídeo | Vertical |
| `veo_3_1_t2v_fast_ultra_relaxed` | Texto para vídeo | Horizontal |
| `veo_3_1_t2v_portrait` | Texto para vídeo | Vertical |
| `veo_3_1_t2v_landscape` | Texto para vídeo | Horizontal |
| `veo_3_1_t2v_lite_portrait` | Texto para vídeo Lite | Vertical |
| `veo_3_1_t2v_lite_landscape` | Texto para vídeo Lite | Horizontal |

#### Modelos com quadro inicial/final (I2V - Image to Video)

📸 **Suporta 1 ou 2 imagens: 1 como quadro inicial, 2 como quadro inicial e final**.

O sistema escolhe automaticamente o `model_key` correto com base no número de imagens.

- **Modo de quadro único** (1 imagem): usa a imagem inicial para gerar o vídeo.
- **Modo de quadro duplo** (2 imagens): usa quadro inicial + final para gerar um vídeo de transição.
- `veo_3_1_i2v_lite_*` suporta apenas **1 imagem** de quadro inicial.
- `veo_3_1_interpolation_lite_*` suporta apenas **2 imagens** de quadro inicial/final.

| Nome do modelo | Descrição | Dimensão |
| :-- | :-- | :-- |
| `veo_3_1_i2v_s_fast_portrait_fl` | Imagem para vídeo | Vertical |
| `veo_3_1_i2v_s_fast_fl` | Imagem para vídeo | Horizontal |
| `veo_3_1_i2v_s_fast_portrait_ultra_fl` | Imagem para vídeo | Vertical |
| `veo_3_1_i2v_s_fast_ultra_fl` | Imagem para vídeo | Horizontal |
| `veo_3_1_i2v_s_fast_portrait_ultra_relaxed` | Imagem para vídeo | Vertical |
| `veo_3_1_i2v_s_fast_ultra_relaxed` | Imagem para vídeo | Horizontal |
| `veo_3_1_i2v_s_portrait` | Imagem para vídeo | Vertical |
| `veo_3_1_i2v_s_landscape` | Imagem para vídeo | Horizontal |
| `veo_3_1_i2v_lite_portrait` | Imagem para vídeo Lite (somente quadro inicial) | Vertical |
| `veo_3_1_i2v_lite_landscape` | Imagem para vídeo Lite (somente quadro inicial) | Horizontal |
| `veo_3_1_interpolation_lite_portrait` | Imagem para vídeo Lite (transição entre quadro inicial e final) | Vertical |
| `veo_3_1_interpolation_lite_landscape` | Imagem para vídeo Lite (transição entre quadro inicial e final) | Horizontal |

#### Geração com múltiplas imagens (R2V - Reference Images to Video)

🖼️ **Suporta múltiplas imagens**.

Atualização de 2026-03-06: o projeto sincronizou o novo corpo de requisição upstream para `R2V`, trocou `textInput` por `structuredPrompt.parts`, adicionou `mediaGenerationContext.batchId` e `useV2ModelConfig: true`, unificou o corpo para modelos horizontal/vertical e passou a usar o formato `*_landscape` para o `videoModelKey` horizontal.
De acordo com o protocolo upstream atual, `referenceImages` aceita no máximo **3 imagens**.


| Nome do modelo | Descrição | Dimensão |
| :-- | :-- | :-- |
| `veo_3_1_r2v_fast_portrait` | Imagem para vídeo | Vertical |
| `veo_3_1_r2v_fast` | Imagem para vídeo | Horizontal |
| `veo_3_1_r2v_fast_portrait_ultra` | Imagem para vídeo | Vertical |
| `veo_3_1_r2v_fast_ultra` | Imagem para vídeo | Horizontal |
| `veo_3_1_r2v_fast_portrait_ultra_relaxed` | Imagem para vídeo | Vertical |
| `veo_3_1_r2v_fast_ultra_relaxed` | Imagem para vídeo | Horizontal |

#### Modelos de upscaling de vídeo

| Nome do modelo | Descrição | Saída |
| :-- | :-- | :-- |
| `veo_3_1_t2v_fast_portrait_4k` | Upscaling de texto para vídeo | 4K |
| `veo_3_1_t2v_fast_4k` | Upscaling de texto para vídeo | 4K |
| `veo_3_1_t2v_fast_portrait_ultra_4k` | Upscaling de texto para vídeo | 4K |
| `veo_3_1_t2v_fast_ultra_4k` | Upscaling de texto para vídeo | 4K |
| `veo_3_1_t2v_fast_portrait_1080p` | Upscaling de texto para vídeo | 1080P |
| `veo_3_1_t2v_fast_1080p` | Upscaling de texto para vídeo | 1080P |
| `veo_3_1_t2v_fast_portrait_ultra_1080p` | Upscaling de texto para vídeo | 1080P |
| `veo_3_1_t2v_fast_ultra_1080p` | Upscaling de texto para vídeo | 1080P |
| `veo_3_1_i2v_s_fast_portrait_ultra_fl_4k` | Upscaling de imagem para vídeo | 4K |
| `veo_3_1_i2v_s_fast_ultra_fl_4k` | Upscaling de imagem para vídeo | 4K |
| `veo_3_1_i2v_s_fast_portrait_ultra_fl_1080p` | Upscaling de imagem para vídeo | 1080P |
| `veo_3_1_i2v_s_fast_ultra_fl_1080p` | Upscaling de imagem para vídeo | 1080P |
| `veo_3_1_r2v_fast_portrait_ultra_4k` | Upscaling de vídeo com múltiplas imagens | 4K |
| `veo_3_1_r2v_fast_ultra_4k` | Upscaling de vídeo com múltiplas imagens | 4K |
| `veo_3_1_r2v_fast_portrait_ultra_1080p` | Upscaling de vídeo com múltiplas imagens | 1080P |
| `veo_3_1_r2v_fast_ultra_1080p` | Upscaling de vídeo com múltiplas imagens | 1080P |

## 📡 Exemplos de uso da API (é necessário usar streaming)

Além dos exemplos compatíveis com OpenAI mostrados abaixo, o serviço também suporta o formato oficial do Gemini por meio dos endpoints `POST /v1beta/models/{model}:generateContent`, `POST /models/{model}:generateContent`, `POST /v1beta/models/{model}:streamGenerateContent` e `POST /models/{model}:streamGenerateContent`.

O formato oficial do Gemini suporta as seguintes formas de autenticação:

- `Authorization: Bearer <api_key>`
- `x-goog-api-key: <api_key>`
- `?key=<api_key>`

O corpo oficial de requisição de imagem do Gemini é compatível com:

- `systemInstruction`.
- `contents[].parts[].text`.
- `contents[].parts[].inlineData`.
- `contents[].parts[].fileData.fileUri`.
- `generationConfig.responseModalities`.
- `generationConfig.imageConfig.aspectRatio`.
- `generationConfig.imageConfig.imageSize`.


### Gemini oficial `generateContent` (texto para imagem)

Já foi testado com token real e aprovado.
Se quiser retorno em streaming, substitua o caminho por `:streamGenerateContent?alt=sse`.

```bash
curl -X POST "http://localhost:8000/models/gemini-3.1-flash-image:generateContent" \
  -H "x-goog-api-key: han1234" \
  -H "Content-Type: application/json" \
  -d '{
    "systemInstruction": {
      "parts": [
        {
          "text": "Return an image only."
        }
      ]
    },
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "Uma maçã vermelha sobre uma mesa de madeira, com iluminação de estúdio e fundo minimalista"
          }
        ]
      }
    ],
    "generationConfig": {
      "responseModalities": ["IMAGE"],
      "imageConfig": {
        "aspectRatio": "1:1",
        "imageSize": "1K"
      }
    }
  }'
```


### Texto para imagem

```bash
curl -X POST "http://localhost:8000/v1/chat/completions" \
  -H "Authorization: Bearer han1234" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.1-flash-image-landscape",
    "messages": [
      {
        "role": "user",
        "content": "Um gatinho fofo brincando no jardim"
      }
    ],
    "stream": true
  }'
```


### Imagem para imagem

```bash
curl -X POST "http://localhost:8000/v1/chat/completions" \
  -H "Authorization: Bearer han1234" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.1-flash-image-landscape",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Transforme esta imagem em um estilo de aquarela"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/jpeg;base64,<imagem_em_base64>"
            }
          }
        ]
      }
    ],
    "stream": true
  }'
```


### Texto para vídeo

```bash
curl -X POST "http://localhost:8000/v1/chat/completions" \
  -H "Authorization: Bearer han1234" \
  -H "Content-Type": "application/json" \
  -d '{
    "model": "veo_3_1_t2v_fast_landscape",
    "messages": [
      {
        "role": "user",
        "content": "Um gatinho correndo atrás de borboletas em um gramado"
      }
    ],
    "stream": true
  }'
```


### Gerar vídeo com quadro inicial e final

```bash
curl -X POST "http://localhost:8000/v1/chat/completions" \
  -H "Authorization: Bearer han1234" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "veo_3_1_i2v_s_fast_fl_landscape",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Faça a transição da primeira imagem para a segunda"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/jpeg;base64,<base64_do_quadro_inicial>"
            }
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/jpeg;base64,<base64_do_quadro_final>"
            }
          }
        ]
      }
    ],
    "stream": true
  }'
```


### Gerar vídeo com múltiplas imagens

O `R2V` é montado automaticamente no servidor usando o novo corpo de requisição de vídeo, e o cliente continua usando entrada compatível com OpenAI.
O servidor também mapeia automaticamente o `R2V` horizontal para a chave de modelo upstream mais recente no formato `*_landscape`.
Atualmente, no máximo **3 imagens de referência** podem ser enviadas.

```bash
curl -X POST "http://localhost:8000/v1/chat/completions" \
  -H "Authorization: Bearer han1234" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "veo_3_1_r2v_fast_portrait",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Com base nas três imagens de referência de personagens e cenário, gere um vídeo vertical com avanço suave de câmera"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/jpeg;base64/<referencia1_base64>"
            }
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/jpeg;base64/<referencia2_base64>"
            }
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/jpeg;base64/<referencia3_base64>"
            }
          }
        ]
      }
    ],
    "stream": true
  }'
```
