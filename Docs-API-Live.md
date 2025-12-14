Iniciar e gerenciar sessões ao vivo (Vertex AI)Aumentar a duração da sessãoÉ possível aumentar a duração da sessão em incrementos de 10 minutos usando o SDK da IA generativa. Não há limite para o número de vezes que você pode estender uma sessão.Pythonasync for response in session.receive():
if response.go_away is not None: # The connection will soon be terminated
print(response.go_away.time_left)
Retomar uma sessão anteriorImportante: se você precisar garantir retenção zero de dados no seu aplicativo, não ative a retomada da sessão.A API Live oferece suporte à retomada de sessão para evitar que o usuário perca o contexto da conversa durante uma breve desconexão (por exemplo, ao mudar do Wi-Fi para o 5G). Você pode retomar uma sessão anterior em até 24 horas. A retomada da sessão é feita armazenando dados em cache, incluindo texto, vídeo, áudio, comandos e saídas do modelo. A privacidade no nível do projeto é aplicada a esses dados armazenados em cache.Por padrão, a retomada de sessão está desativada. Para ativar a retomada da sessão, defina o campo sessionResumption da mensagem BidiGenerateContentSetup. Se ativado, o servidor envia periodicamente mensagens SessionResumptionUpdate contendo um session_id e um token de retomada. Se o WebSocket for desconectado, o cliente poderá se reconectar e incluir essas credenciais na nova mensagem de configuração. Em seguida, o servidor restaura o contexto anterior, permitindo que a conversa continue sem problemas.A janela de retomada é finita (geralmente cerca de 10 minutos). Se o cliente não se reconectar dentro desse período, o estado da sessão será descartado para liberar recursos do servidor.Confira a seguir um exemplo de como ativar a retomada de sessão e recuperar o ID do identificador:Pythonimport asyncio
from google import genai
from google.genai import types

# Replace the PROJECT_ID and LOCATION with your Project ID and location.

client = genai.Client(vertexai=True, project="PROJECT_ID", location="LOCATION")

# Configuration

MODEL = "gemini-live-2.5-flash-preview-native-audio-09-2025"

async def main():
print(f"Connecting to the service with handle {previous_session_handle}...")

    async with client.aio.live.connect(
        model=MODEL,
        config=types.LiveConnectConfig(
            response_modalities=["audio"],
            session_resumption=types.SessionResumptionConfig(
                # The handle of the session to resume is passed here,
                # or else None to start a new session.
                handle=previous_session_handle
            ),
        ),
    ) as session:
        while True:
            await session.send_client_content(
                turns=types.Content(
                    role="user",
                    parts=[types.Part(text="Hello world!")]
                )
            )

            async for message in session.receive():
                # Periodically, the server will send update messages that may
                # contain a handle for the current state of the session.
                if message.session_resumption_update:
                    update = message.session_resumption_update
                    if update.resumable and update.new_handle:
                        # The handle should be retained and linked to the session.
                        return update.new_handle

                # For the purposes of this example, placeholder input is continually fed
                # to the model. In non-sample code, the model inputs would come from
                # the user.
                if message.server_content and message.server_content.turn_complete:
                    break

if **name** == "**main**":
asyncio.run(main())
Ativar a retomada de sessão sem problemas com o modo transparenteAo ativar a retomada de sessão, você também pode ativar o modo transparente para ajudar a tornar o processo de retomada mais fácil para o usuário. Quando o modo transparente está ativado, o índice da mensagem do cliente que corresponde ao snapshot de contexto é retornado explicitamente. Isso ajuda a identificar qual mensagem do cliente precisa ser enviada novamente quando você retoma a sessão do identificador de retomada.Para ativar o modo transparente:Pythonconfig = {
"response_modalities": ["audio"],
"session_resumption": {
"session_resumption_config": {
"transparent": True,
}
}
}
Atualizar instruções do sistema durante uma sessãoCom a API Live, é possível atualizar as instruções do sistema durante uma sessão ativa. Use isso para adaptar as respostas do modelo, como mudar o idioma ou modificar o tom.Para atualizar as instruções do sistema no meio da sessão, envie conteúdo de texto com a função system. A instrução atualizada vai continuar em vigor durante o restante da sessão.Pythonsession.send_client_content(
turns=types.Content(
role="system",
parts=[types.Part(text="new system instruction")]
),
turn_complete=False
)
Configurar a janela de contexto da sessãoA janela de contexto da API Live é usada para armazenar dados transmitidos em tempo real (25 tokens por segundo [TPS] para áudio e 258 TPS para vídeo) e outros conteúdos, incluindo entradas de texto e saídas de modelo. Uma sessão tem um limite de janela de contexto de:128 mil tokens para modelos de áudio nativo32 mil tokens para outros modelos da API LiveEm sessões longas, conforme a conversa avança, o histórico de tokens de áudio e texto se acumula. Se esse histórico exceder o limite do modelo, ele poderá alucinar, ficar mais lento ou a sessão poderá ser encerrada à força. Para ativar sessões mais longas, habilite a compressão da janela de contexto definindo o campo contextWindowCompression como parte da configuração da sessão.A compactação da janela de contexto usa uma janela deslizante do lado do servidor para truncar as conversas mais antigas quando ativada. Quando os tokens acumulados excedem um comprimento máximo definido (use o controle deslizante Tamanho máximo do conteúdo no Vertex AI Studio ou trigger_tokens na API), o servidor corta automaticamente as conversas mais antigas ou as resume para manter o contexto dentro do limite. Em ContextWindowCompressionConfig, é possível configurar um mecanismo de janela deslizante e o número de tokens definidos no parâmetro target_tokens que aciona a compactação.Isso permite durações de sessão teoricamente infinitas do ponto de vista do usuário, já que a "memória" é constantemente gerenciada. Sem compressão, as sessões somente de áudio podem ser limitadas a aproximadamente 15 minutos antes de atingir limites rígidos.Comprimentos mínimo e máximoOs comprimentos mínimo e máximo para o comprimento do contexto e o tamanho da meta são:Configuração (flag da API)Valor mínimoValor máximoTamanho máximo de contexto (trigger_tokens)5.000128.000Tamanho do contexto pretendido (target_tokens)0128.000Como definir a janela de contextoConsoleAbra Vertex AI Studio > Transmitir em tempo real.Clique para abrir o menu Avançado.Na seção Contexto da sessão, use o controle deslizante Tamanho máximo do contexto para definir um valor entre 5.000 e 128.000.(Opcional) Na mesma seção, use o controle deslizante Tamanho do contexto de destino para definir o tamanho de destino como um valor entre 0 e 128.000.PythonDefina os campos context_window_compression.trigger_tokens e context_window_compression.sliding_window.target_tokens na mensagem de configuração:config = {
"response_modalities": ["audio"], # Configures compression
"context_window_compression" : {
"trigger_tokens": 10000,
"sliding_window": {"target_tokens" : 512}
}
}
Ativar a transcrição de áudio para a sessãoÉ possível ativar as transcrições para o áudio de entrada e saída.Para receber transcrições, atualize a configuração da sessão. É necessário adicionar os objetos input_audio_transcription e output_audio_transcription e garantir que text esteja incluído em response_modalities.Pythonconfig = {
"response_modalities": ["audio", "text"],
"input_audio_transcription": {},
"output_audio_transcription": {},
}
Processamento da respostaO exemplo de código a seguir demonstra como se conectar usando a sessão configurada e extrair as partes de texto (transcrições) junto com os dados de áudio.Python# Receive Output Loop
async for message in session.receive():
server_content = message.server_content
if server_content: # Handle Model Turns (Audio + Text)
model_turn = server_content.model_turn
if model_turn and model_turn.parts:
for part in model_turn.parts: # Handle Text (Transcriptions)
if part.text:
print(f"Transcription: {part.text}")

                # Handle Audio
                if part.inline_data:
                    audio_data = part.inline_data.data
                    # Process audio bytes...
                    pass

    # Check for turn completion
    if server_content.turn_complete:
        print("Turn complete.")
