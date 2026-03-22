import AWS from 'aws-sdk';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { getElevenLabsVoiceId, getNextApiKey, getPollyCredentials } from '../credentials';

export class TTSService extends EventEmitter {
    private elevenlabs: ElevenLabsClient | null = null;
    private elevenlabsApiKey: string | null = null;

    constructor() {
        super();
    }

    private getPollyClient(): AWS.Polly {
        const credentials = getPollyCredentials();
        if (!credentials) {
            throw new Error('Credenciais da AWS Polly não configuradas.');
        }

        AWS.config.update({
            region: credentials.region,
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
        });

        return new AWS.Polly();
    }

    private getElevenLabsClient(): ElevenLabsClient {
        const apiKey = getNextApiKey('elevenlabs');
        if (!apiKey) {
            throw new Error('Chave da ElevenLabs não configurada.');
        }

        if (this.elevenlabs && this.elevenlabsApiKey === apiKey) {
            return this.elevenlabs;
        }

        this.elevenlabs = new ElevenLabsClient({ apiKey });
        this.elevenlabsApiKey = apiKey;
        return this.elevenlabs;
    }

    public async generateAudio(text: string, provider: 'polly' | 'elevenlabs' = 'elevenlabs'): Promise<{ filePath: string, buffer: Buffer }> {
        try {
            let audioBuffer: Buffer;

            if (provider === 'polly') {
                audioBuffer = await this.generatePollyAudio(text);
            } else {
                audioBuffer = await this.generateElevenLabsAudio(text);
            }

            // Save Audio File
            const audioFilePath = path.join(__dirname, '../../temp_audio.mp3');
            // Ensure directory exists if needed, but usually relative path is fine since it's temp
            // Using absolute path based on __dirname of this service file:
            // Service is in /main/lib/services/
            // temp_audio was in ../temp_audio.mp3 from /main/lib/voice-assistant.ts
            // So relative to service it is ../../temp_audio.mp3 (in /main/lib/ or /main/?) 
            // Original was path.join(__dirname, '../temp_audio.mp3') from voice-assistant (which is in lib).
            // So original path resolved to /main/temp_audio.mp3.
            // From /main/lib/services/, we need ../../temp_audio.mp3
            
            fs.writeFileSync(audioFilePath, audioBuffer);
            console.log("TTSService: Áudio gerado em:", audioFilePath);
            
            return { filePath: audioFilePath, buffer: audioBuffer };

        } catch (error) {
            console.error("TTSService Erro:", error);
            throw error;
        }
    }

    private async generatePollyAudio(text: string): Promise<Buffer> {
        const polly = this.getPollyClient();
        const params = {
            OutputFormat: 'mp3',
            Text: text,
            VoiceId: 'Camila', 
            LanguageCode: 'pt-BR',
        };
        const data = await polly.synthesizeSpeech(params).promise();
        if (data.AudioStream instanceof Buffer) {
            return data.AudioStream;
        } else if (data.AudioStream instanceof Uint8Array) {
            return Buffer.from(data.AudioStream);
        }
        throw new Error("Formato de áudio Polly inválido");
    }

    public async streamAudio(text: string, provider: 'polly' | 'elevenlabs' = 'elevenlabs'): Promise<void> {
        try {
            if (provider === 'polly') {
                const buffer = await this.generatePollyAudio(text);
                this.emit('audio-chunk', buffer);
                this.emit('audio-end');
            } else {
                const voiceId = getElevenLabsVoiceId();
                const response = await this.getElevenLabsClient().textToSpeech.convert(voiceId, {
                    text: text,
                    modelId: 'eleven_v3',
                    outputFormat: 'mp3_44100_128',
                });

                for await (const chunk of (response as any)) {
                    this.emit('audio-chunk', chunk);
                }
                this.emit('audio-end');
            }
        } catch (error) {
            console.error("TTSService Stream Error:", error);
            this.emit('error', error);
        }
    }

    private async generateElevenLabsAudio(text: string): Promise<Buffer> {
        const voiceId = getElevenLabsVoiceId();
        const response = await this.getElevenLabsClient().textToSpeech.convert(voiceId, {
            text: text,
            modelId: 'eleven_v3',
            outputFormat: 'mp3_44100_128',
        });

        if (Buffer.isBuffer(response)) {
            return response;
        } else if (typeof response === 'object' && response !== null && 'pipe' in response) {
            const chunks: any[] = [];
            for await (const chunk of (response as any)) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks);
        } else if ((response as any) instanceof ArrayBuffer) {
            return Buffer.from(response as unknown as ArrayBuffer);
        } else {
             const chunks: any[] = [];
             for await (const chunk of (response as any)) {
                 chunks.push(chunk);
             }
             return Buffer.concat(chunks);
        }
    }
}
