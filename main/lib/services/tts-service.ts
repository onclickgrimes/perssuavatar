import AWS from 'aws-sdk';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import * as dotenv from 'dotenv';
import { EventEmitter } from 'events';

dotenv.config();

export class TTSService extends EventEmitter {
    private polly: AWS.Polly;
    private elevenlabs: ElevenLabsClient;

    constructor() {
        super();
        
        // AWS Polly Config
        if (process.env.AWS_ACCESS_KEY_ID) {
            AWS.config.update({
                region: 'sa-east-1',
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            });
        }
        this.polly = new AWS.Polly();

        // ElevenLabs Config
        this.elevenlabs = new ElevenLabsClient({
            apiKey: process.env.ELEVENLABS_API_KEY_2 
        });
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
        const params = {
            OutputFormat: 'mp3',
            Text: text,
            VoiceId: 'Camila', 
            LanguageCode: 'pt-BR',
        };
        const data = await this.polly.synthesizeSpeech(params).promise();
        if (data.AudioStream instanceof Buffer) {
            return data.AudioStream;
        } else if (data.AudioStream instanceof Uint8Array) {
            return Buffer.from(data.AudioStream);
        }
        throw new Error("Formato de áudio Polly inválido");
    }

    private async generateElevenLabsAudio(text: string): Promise<Buffer> {
        const voiceId = process.env.VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; 
        const response = await this.elevenlabs.textToSpeech.convert(voiceId, {
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
        } else if (typeof ReadableStream !== 'undefined' && (response as any) instanceof ReadableStream) {
            const reader = (response as any).getReader();
            const chunks: any[] = [];
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
            }
            return Buffer.concat(chunks);
        } else {
             // Try async iterable fallback
             try {
                const chunks: any[] = [];
                for await (const chunk of (response as any)) {
                    chunks.push(chunk);
                }
                return Buffer.concat(chunks);
              } catch (e) {
                throw new Error("Could not convert ElevenLabs response to Buffer");
              }
        }
    }
}
