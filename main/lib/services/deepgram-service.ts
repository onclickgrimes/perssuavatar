import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { getPrimaryApiKey } from '../credentials';

export class DeepgramService extends EventEmitter {
    private deepgramLive: any;
    private client: any = null;
    private clientApiKey: string | null = null;

    constructor() {
        super();
    }

    private ensureClient(): boolean {
        const apiKey = getPrimaryApiKey('deepgram');
        if (!apiKey) {
            this.client = null;
            this.clientApiKey = null;
            return false;
        }

        if (this.client && this.clientApiKey === apiKey) {
            return true;
        }

        this.client = createClient(apiKey);
        this.clientApiKey = apiKey;
        return true;
    }

    public start(audioStream?: Readable) {
        if (this.deepgramLive) return;

        if (!this.ensureClient()) {
            const error = new Error('Deepgram API key não configurada. Cadastre uma chave em Configurações > API e Modelos.');
            console.error("Deepgram API Key missing!");
            this.emit('error', error);
            this.emit('status', 'Idle');
            return;
        }

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
