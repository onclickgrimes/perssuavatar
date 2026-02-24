/**
 * Veo2VideoService - Geração de vídeo via Google Veo 2 (API oficial @google/genai)
 *
 * Diferenças do Veo 3 (Flow via Puppeteer):
 *  - Usa a API REST oficial, sem necessidade de automação de browser
 *  - NÃO gera áudio (apenas vídeo visual)
 *  - Modelo: veo-2.0-generate-001
 *  - Duração: até 8 segundos por clipe
 *  - Aspect ratios suportados: '16:9', '9:16'
 *
 * Dependência: @google/genai (já instalada no projeto via gemini-voice-service)
 */

import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import https from 'https';
import http from 'http';

// ========================================
// INTERFACES
// ========================================

export interface Veo2GenerationOptions {
  prompt: string;
  /** Proporção: '16:9' (paisagem) | '9:16' (retrato) */
  aspectRatio?: '16:9' | '9:16';
  /** Duração em segundos (padrão 8, máx 8) */
  durationSeconds?: number;
  /** Chave de API do Gemini (usa GEMINI_API_KEY do env por padrão) */
  apiKey?: string;
  /** Callback de progresso (0-100) */
  onProgress?: (percent: number, message: string) => void;
}

export interface Veo2GenerationResult {
  success: boolean;
  videoPath?: string;
  error?: string;
  durationMs?: number;
}

// ========================================
// SERVICE
// ========================================

export class Veo2VideoService {
  private outputDir: string;

  constructor() {
    this.outputDir = path.join(
      app.getPath('userData'),
      'video-projects',
      'veo2-videos'
    );
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Gera um vídeo usando o modelo Veo 2 da Google.
   */
  async generateVideo(options: Veo2GenerationOptions): Promise<Veo2GenerationResult> {
    const {
      prompt,
      aspectRatio = '9:16',
      durationSeconds = 8,
      onProgress,
    } = options;

    const apiKey = options.apiKey || process.env.GOOGLE_API_KEY_2 || process.env.GOOGLE_API_KEY_1;
    if (!apiKey) {
      return { success: false, error: 'GEMINI_API_KEY não configurada.' };
    }

    const startTime = Date.now();
    const emit = (percent: number, message: string) => {
      onProgress?.(percent, message);
      console.log(`[Veo2] ${percent}% - ${message}`);
    };

    try {
      const ai = new GoogleGenAI({ apiKey });

      emit(5, 'Iniciando geração Veo 2...');

      // 1. Submeter operação de geração
      let operation = await ai.models.generateVideos({
        model: 'veo-2.0-generate-001',
        source: {
          prompt,
        },
        config: {
          numberOfVideos: 1,
          aspectRatio,
          resolution: '720p',
          personGeneration: 'dont_allow',
          durationSeconds: Math.min(durationSeconds, 8),
        },
      });

      emit(10, 'Operação enviada. Aguardando geração...');

      // 2. Polling até a operação concluir (timeout 10 min)
      const timeoutMs = 600_000;
      const pollInterval = 10_000;
      let elapsed = 0;
      let pollCount = 0;

      while (!operation.done) {
        if (elapsed >= timeoutMs) {
          throw new Error('Timeout: o vídeo não foi gerado em 10 minutos.');
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
        elapsed += pollInterval;
        pollCount++;

        const estimatedPercent = Math.min(85, 10 + Math.round((elapsed / timeoutMs) * 75));
        emit(estimatedPercent, `Aguardando geração... (${Math.round(elapsed / 1000)}s)`);

        operation = await ai.operations.getVideosOperation({ operation });
      }

      emit(90, 'Gerado! Baixando vídeo...');

      // 3. Extrair URI do vídeo gerado
      const generatedVideos = operation.response?.generatedVideos;
      if (!generatedVideos || generatedVideos.length === 0) {
        throw new Error('Nenhum vídeo foi gerado pela API Veo 2.');
      }

      const videoUri = generatedVideos[0]?.video?.uri;
      if (!videoUri) {
        throw new Error('URI do vídeo retornado pela API está vazia.');
      }

      // 4. Baixar o vídeo
      const downloadUrl = `${videoUri}&key=${apiKey}`;
      const outputFileName = `veo2-${Date.now()}.mp4`;
      const outputPath = path.join(this.outputDir, outputFileName);

      await this.downloadVideo(downloadUrl, outputPath);

      const durationMs = Date.now() - startTime;
      emit(100, `Vídeo salvo em ${outputPath} (${Math.round(durationMs / 1000)}s)`);

      return {
        success: true,
        videoPath: outputPath,
        durationMs,
      };

    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      console.error('❌ [Veo2] Erro:', error.message);
      return {
        success: false,
        error: error.message,
        durationMs,
      };
    }
  }

  // ========================================
  // PRIVADO - DOWNLOAD
  // ========================================

  private downloadVideo(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      const protocol = url.startsWith('https://') ? https : http;

      const request = protocol.get(url, (response) => {
        // Seguir redirecionamentos
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          fs.unlinkSync(destPath);
          return this.downloadVideo(response.headers.location, destPath)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          return reject(new Error(`Download falhou: HTTP ${response.statusCode}`));
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      });

      request.on('error', (err) => {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        reject(err);
      });

      file.on('error', (err) => {
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        reject(err);
      });
    });
  }
}

// Singleton
let veo2ServiceInstance: Veo2VideoService | null = null;

export function getVeo2VideoService(): Veo2VideoService {
  if (!veo2ServiceInstance) {
    veo2ServiceInstance = new Veo2VideoService();
  }
  return veo2ServiceInstance;
}
