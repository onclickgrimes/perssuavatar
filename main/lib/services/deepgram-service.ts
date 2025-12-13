import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import * as dotenv from 'dotenv';

dotenv.config();

export class DeepgramService extends EventEmitter {
    private deepgramLive: any;
    private apiKey: string;
    private client: any;

    constructor() {
        super();
        this.apiKey = process.env.DEEPGRAM_API_KEY || '';
        if (!this.apiKey) {
            console.error("Deepgram API Key missing!");
        }
        this.client = createClient(this.apiKey);
    }

    public start(audioStream?: Readable) {
        if (this.deepgramLive) return;

        console.log('Iniciando DeepgramService...');
        this.deepgramLive = this.client.listen.live({
            model: "nova-3",
            language: "multi",
            encoding: 'linear16',
            sample_rate: 16000,
            punctuate: true,
            endpointing: 100,
            interim_results: true,
            vad_events: true,
            utterance_end_ms: 1000
        });

        this.deepgramLive.on(LiveTranscriptionEvents.Open, () => {
            console.log("Deepgram: Conexão estabelecida");
            this.emit('status', 'Listening');
        });

        let transcriptionBuffer = '';

        this.deepgramLive.on(LiveTranscriptionEvents.Transcript, (data: any) => {
            if (data.is_final) {
                const transcript = data.channel.alternatives[0].transcript.trim();

                if (transcript.length > 0) {
                    console.log(`Transcrição recebida: "${transcript}"`);
                    transcriptionBuffer += (transcriptionBuffer ? ' ' : '') + transcript;

                    const hasPunctuation = /[.?!]$/.test(transcript);
                    
                    if (hasPunctuation || data.speech_final) {
                        const textToSend = transcriptionBuffer.trim();
                        // Instead of processing directly, emit the event for the consumer (VoiceAssistant)
                        this.emit('transcription-final', textToSend);
                        transcriptionBuffer = ''; 
                    }
                }
            }
        });

        this.deepgramLive.on(LiveTranscriptionEvents.Error, (err: any) => {
            console.error("Deepgram Erro:", err);
            this.emit('error', err);
        });

        if (audioStream) {
            audioStream.on('data', (chunk) => {
                console.log("Deepgram: Recebendo chunk de áudio");
                this.processAudioStream(chunk);
            });
        }
    }

    public processAudioStream(chunk: Buffer) {
        if (this.deepgramLive && this.deepgramLive.getReadyState() === 1) {
            this.deepgramLive.send(chunk);
        }
    }

    public stop() {
        if (this.deepgramLive) {
            this.deepgramLive.finish();
            this.deepgramLive = null;
            console.log("Deepgram parado");
        }
    }
}
