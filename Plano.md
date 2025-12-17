Vou explicar a stack:
1. Atualize a service existente do deepgram ou crie uma nova para o Whisper.

Código de exemplo para transcrever arquivos pré gravados:
import { createClient } from '@deepgram/sdk';

const listen = async () => {
  const deepgramApiKey = 'YOUR_SECRET';
  const url = 'https://static.deepgram.com/examples/Bueller-Life-moves-pretty-fast.wav';
  const deepgram = createClient(deepgramApiKey);

  const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
    { url },
    {
      model: 'nova-3',
      language: 'pt-BR',
      smart_format: true,
      diarize: true,
      punctuate: true,
      paragraphs: true,
    },
  );

  if (error) {
    console.error(error);
  } else {
    console.dir(result, { depth: null });
  }
}

listen();

Exemplo de resposta:
{

  "metadata": {

    "transaction_key": "deprecated",

    "request_id": "ae967c10-6787-4e06-a542-47084fde424a",

    "sha256": "379dcbe6f1d594a424d01b1b34c2e2041d415dbbbda0ab0c9da2850e340d6cb0",

    "created": "2025-12-17T04:07:30.662Z",

    "duration": 17.789375,

    "channels": 1,

    "models": [

      "869781fd-6665-4e85-bedb-50db537af2d2"

    ],

    "model_info": {

      "869781fd-6665-4e85-bedb-50db537af2d2": {

        "name": "general-nova-3",

        "version": "2025-08-18.31473",

        "arch": "nova-3"

      }

    }

  },

  "results": {

    "channels": [

      {

        "alternatives": [

          {

            "transcript": "Gente, o governo federal aprovou as raspadinhas, sabe aquelas que só eram vendidas nas lotéricas da Caixa? Pois é, agora elas podem ser compradas online, direto no celular. Eu joguei e, nossa, que nostalgia.",

            "confidence": 0.9941406,

            "words": [

              {

                "word": "gente",

                "start": 0,

                "end": 0.71999997,

                "confidence": 0.97387695,

                "speaker": 0,

                "speaker_confidence": 1,

                "punctuated_word": "Gente,"

              },

              {

                "word": "o",

                "start": 0.71999997,

                "end": 0.88,

                "confidence": 0.9980469,

                "speaker": 0,

                "speaker_confidence": 1,

                "punctuated_word": "o"

              },

              {

                "word": "governo",

                "start": 0.88,

                "end": 1.28,

                "confidence": 0.6508789,

                "speaker": 0,

                "speaker_confidence": 1,

                "punctuated_word": "governo"

              },

              {

                "word": "federal",

                "start": 1.28,

                "end": 2.08,

                "confidence": 0.99609375,

                "speaker": 0,

                "speaker_confidence": 1,

                "punctuated_word": "federal"

              },

...

              {

                "word": "que",

                "start": 14.824375,

                "end": 14.904375,

                "confidence": 0.9980469,

                "speaker": 0,

                "speaker_confidence": 1,

                "punctuated_word": "que"

              },

              {

                "word": "nostalgia",

                "start": 14.904375,

                "end": 15.544374,

                "confidence": 0.9848633,

                "speaker": 0,

                "speaker_confidence": 1,

                "punctuated_word": "nostalgia."

              }

            ],

            "paragraphs": {

              "transcript": "\nSpeaker 0: Gente, o governo federal aprovou as raspadinhas, sabe aquelas que só eram vendidas nas lotéricas da Caixa? Pois é, agora elas podem ser compradas online, direto no celular. Eu joguei e, nossa, que nostalgia.",

              "paragraphs": [

                {

                  "sentences": [

                    {

                      "text": "Gente, o governo federal aprovou as raspadinhas, sabe aquelas que só eram vendidas nas lotéricas da Caixa?",

                      "start": 0,

                      "end": 7.44

                    },

                    {

                      "text": "Pois é, agora elas podem ser compradas online, direto no celular.",

                      "start": 7.784375,

                      "end": 12.584375

                    },

                    {

                      "text": "Eu joguei e, nossa, que nostalgia.",

                      "start": 12.744375,

                      "end": 15.544374

                    }

                  ],

                  "speaker": 0,

                  "num_words": 34,

                  "start": 0,

                  "end": 15.544374

                }

              ]

            }

          }

        ]

      }

    ]

  }

}



2. Envia a transcrição para a LLM (openai, gemini ou DeepSeek - Services já existem) com um system prompt específico com o estilo de edição, a conclusão do autor sobre o tema e outro fixo dizendo para analisar a transcrição, sugerir emoções para as minutagens dos parágrafos do vídeo (retornado no deepgram) que seriam os keyframes que achar válido, o usuário pode aceitar ou alterar as emoções. Após isso, o sistema vai para a parte da criação de imagens baseadas na transcrição e keyframes. O sistema sugere prompts de imagens e o usuário pode aprovar, usar seus próprios prompts, ou carregar a própria imagem. Esses prompts vão para apis como o flux ou replicate.com para criar as imagens (Não crie esses serviços de imagem ainda). Essas imagens podem ser aprovadas pelo usuário, desaprovadas (mandar refazer) ou o usuário carregar sua própria imagem. Após isso, o sistema vai pra fazer gerar vídeos a partir dessas imagens e transcrição do deepgram usando o Remotion. 