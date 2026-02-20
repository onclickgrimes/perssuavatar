/**
 * Audio Transcription Service
 * 
 * Serviço para transcrição de arquivos de áudio usando Deepgram.
 * Diferente do serviço de transcrição em tempo real, este processa arquivos completos.
 */
import { createClient, DeepgramClient } from '@deepgram/sdk';
import * as fs from 'fs';
import * as path from 'path';

// ========================================
// TYPES
// ========================================

export interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker: number;
  punctuatedWord: string;
}

export interface TranscriptionSentence {
  text: string;
  start: number;
  end: number;
}

export interface TranscriptionParagraph {
  sentences: TranscriptionSentence[];
  speaker: number;
  numWords: number;
  start: number;
  end: number;
}

export interface TranscriptionResult {
  success: boolean;
  error?: string;
  duration: number;
  transcript: string;
  confidence: number;
  words: TranscriptionWord[];
  paragraphs: TranscriptionParagraph[];
  segments: TranscriptionSegment[];
}

export interface TranscriptionSegment {
  id: number;
  text: string;
  start: number;
  end: number;
  speaker: number;
  words: TranscriptionWord[];
}

// ========================================
// SERVICE CLASS
// ========================================

export class AudioTranscriptionService {
  private client: DeepgramClient | null = null;

  constructor() {
    this.initClient();
  }

  private initClient(): void {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (apiKey) {
      this.client = createClient(apiKey);
      console.log('🎤 AudioTranscriptionService initialized');
    } else {
      console.warn('⚠️ DEEPGRAM_API_KEY not found - transcription will not work');
    }
  }

  /**
   * Transcreve um arquivo de áudio local
   */
  public async transcribeFile(filePath: string): Promise<TranscriptionResult> {
    if (!this.client) {
      return {
        success: false,
        error: 'Deepgram client not initialized. Check DEEPGRAM_API_KEY.',
        duration: 0,
        transcript: '',
        confidence: 0,
        words: [],
        paragraphs: [],
        segments: [],
      };
    }

    try {
      console.log(`🎤 Transcribing file: ${filePath}`);

      // Verificar se arquivo existe
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Ler arquivo como buffer
      const audioBuffer = fs.readFileSync(filePath);

      // Detectar mimetype baseado na extensão
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.ogg': 'audio/ogg',
        '.flac': 'audio/flac',
        '.webm': 'audio/webm',
      };
      const mimetype = mimeTypes[ext] || 'audio/mpeg';

      // Chamar API do Deepgram
      const { result, error } = await this.client.listen.prerecorded.transcribeFile(
        audioBuffer,
        {
          model: 'nova-3',
          language: 'pt-BR', //'multi',
          smart_format: true,
          diarize: true,
          punctuate: true,
          paragraphs: true,
          utterances: true,
          mimetype,
        }
      );

      if (error) {
        throw error;
      }

      // Processar resultado
      const channel = result.results?.channels?.[0];
      const alternative = channel?.alternatives?.[0];

      if (!alternative) {
        throw new Error('No transcription result');
      }

      // Extrair dados
      const duration = result.metadata?.duration || 0;
      const transcript = alternative.transcript || '';
      const confidence = alternative.confidence || 0;

      // Processar palavras
      const words: TranscriptionWord[] = (alternative.words || []).map((w: any) => ({
        word: w.word,
        start: w.start,
        end: w.end,
        confidence: w.confidence,
        speaker: w.speaker || 0,
        punctuatedWord: w.punctuated_word || w.word,
      }));

      // Processar parágrafos
      const paragraphsData = alternative.paragraphs?.paragraphs || [];
      const paragraphs: TranscriptionParagraph[] = paragraphsData.map((p: any) => ({
        sentences: (p.sentences || []).map((s: any) => ({
          text: s.text,
          start: s.start,
          end: s.end,
        })),
        speaker: p.speaker || 0,
        numWords: p.num_words || 0,
        start: p.start || 0,
        end: p.end || 0,
      }));

      // Criar segmentos baseados nas sentenças dos parágrafos
      const segments: TranscriptionSegment[] = [];
      let segmentId = 1;

      for (const paragraph of paragraphs) {
        for (const sentence of paragraph.sentences) {
          // Encontrar palavras do segmento
          const segmentWords = words.filter(
            w => w.start >= sentence.start && w.end <= sentence.end
          );

          segments.push({
            id: segmentId++,
            text: sentence.text,
            start: sentence.start,
            end: sentence.end,
            speaker: paragraph.speaker,
            words: segmentWords,
          });
        }
      }

      console.log(`✅ Transcription complete: ${segments.length} segments, ${duration.toFixed(2)}s`);
      console.log(`Transcription result: ${JSON.stringify(segments)}`);

      return {
        success: true,
        duration,
        transcript,
        confidence,
        words,
        paragraphs,
        segments,
      };

    } catch (error: any) {
      console.error('❌ Transcription error:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
        duration: 0,
        transcript: '',
        confidence: 0,
        words: [],
        paragraphs: [],
        segments: [],
      };
    }
  }

  /**
   * Transcreve um arquivo de áudio a partir de uma URL
   */
  public async transcribeUrl(audioUrl: string): Promise<TranscriptionResult> {
    if (!this.client) {
      return {
        success: false,
        error: 'Deepgram client not initialized. Check DEEPGRAM_API_KEY.',
        duration: 0,
        transcript: '',
        confidence: 0,
        words: [],
        paragraphs: [],
        segments: [],
      };
    }

    try {
      console.log(`🎤 Transcribing URL: ${audioUrl}`);

      const { result, error } = await this.client.listen.prerecorded.transcribeUrl(
        { url: audioUrl },
        {
          model: 'nova-2',
          language: 'pt-BR',
          smart_format: true,
          diarize: true,
          punctuate: true,
          paragraphs: true,
          utterances: true,
        }
      );

      if (error) {
        throw error;
      }

      // Processar igual ao transcribeFile
      const channel = result.results?.channels?.[0];
      const alternative = channel?.alternatives?.[0];

      if (!alternative) {
        throw new Error('No transcription result');
      }

      const duration = result.metadata?.duration || 0;
      const transcript = alternative.transcript || '';
      const confidence = alternative.confidence || 0;

      const words: TranscriptionWord[] = (alternative.words || []).map((w: any) => ({
        word: w.word,
        start: w.start,
        end: w.end,
        confidence: w.confidence,
        speaker: w.speaker || 0,
        punctuatedWord: w.punctuated_word || w.word,
      }));

      const paragraphsData = alternative.paragraphs?.paragraphs || [];
      const paragraphs: TranscriptionParagraph[] = paragraphsData.map((p: any) => ({
        sentences: (p.sentences || []).map((s: any) => ({
          text: s.text,
          start: s.start,
          end: s.end,
        })),
        speaker: p.speaker || 0,
        numWords: p.num_words || 0,
        start: p.start || 0,
        end: p.end || 0,
      }));

      const segments: TranscriptionSegment[] = [];
      let segmentId = 1;

      for (const paragraph of paragraphs) {
        for (const sentence of paragraph.sentences) {
          const segmentWords = words.filter(
            w => w.start >= sentence.start && w.end <= sentence.end
          );

          segments.push({
            id: segmentId++,
            text: sentence.text,
            start: sentence.start,
            end: sentence.end,
            speaker: paragraph.speaker,
            words: segmentWords,
          });
        }
      }

      console.log(`✅ Transcription complete: ${segments.length} segments, ${duration.toFixed(2)}s`);

      return {
        success: true,
        duration,
        transcript,
        confidence,
        words,
        paragraphs,
        segments,
      };

    } catch (error: any) {
      console.error('❌ Transcription error:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
        duration: 0,
        transcript: '',
        confidence: 0,
        words: [],
        paragraphs: [],
        segments: [],
      };
    }
  }
}

// Singleton
let audioTranscriptionService: AudioTranscriptionService | null = null;

export function getAudioTranscriptionService(): AudioTranscriptionService {
  if (!audioTranscriptionService) {
    audioTranscriptionService = new AudioTranscriptionService();
  }
  return audioTranscriptionService;
}
