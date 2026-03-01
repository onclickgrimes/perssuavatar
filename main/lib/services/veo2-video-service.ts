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
  /** Caminho local ou URL HTTP de uma imagem de referência para image-to-video */
  referenceImagePath?: string;
  finalImagePath?: string;
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

      // Preparar imagem de referência (se fornecida)
      let imageInput: { imageBytes: string; mimeType: string } | undefined;
      if (options.referenceImagePath) {
        emit(7, 'Carregando imagem de referência...');
        try {
          let imageBuffer: Buffer;
          const refPath = options.referenceImagePath;

          if (refPath.startsWith('http://') || refPath.startsWith('https://')) {
            // Baixar imagem da URL HTTP (ex: servidor local do projeto)
            imageBuffer = await new Promise<Buffer>((resolve, reject) => {
              const protocol = refPath.startsWith('https://') ? https : http;
              const chunks: Buffer[] = [];
              protocol.get(refPath, (res) => {
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks)));
                res.on('error', reject);
              }).on('error', reject);
            });
          } else {
            // Ler do disco
            imageBuffer = fs.readFileSync(refPath);
          }

          // Detectar MIME type pela extensão
          const ext = refPath.toLowerCase().split('.').pop() || 'jpg';
          const mimeMap: Record<string, string> = {
            jpg: 'image/jpeg', jpeg: 'image/jpeg',
            png: 'image/png', webp: 'image/webp',
            gif: 'image/gif',
          };
          const mimeType = mimeMap[ext] || 'image/jpeg';

          imageInput = {
            imageBytes: imageBuffer.toString('base64'),
            mimeType,
          };
          emit(9, `Imagem de referência carregada (${Math.round(imageBuffer.length / 1024)} KB, ${mimeType})`);
        } catch (imgErr: any) {
          console.warn(`[Veo2] Falha ao carregar imagem de referência: ${imgErr.message}. Gerando apenas com texto.`);
        }
      }

      // 1. Submeter operação de geração
      // NOTA: personGeneration 'dont_allow' bloqueia silenciosamente quando há pessoas
      // na imagem de referência → usar 'allow_adult' para image-to-video
      const personGen = imageInput ? 'allow_adult' : 'dont_allow';

      // Log completo do que está sendo enviado para a API
      console.log('[Veo2] ======= PAYLOAD DA REQUISIÇÃO =======');
      console.log(`[Veo2] model        : veo-2.0-generate-001`);
      console.log(`[Veo2] mode         : ${imageInput ? 'image-to-video' : 'text-to-video'}`);
      console.log(`[Veo2] prompt       : ${prompt}`);
      console.log(`[Veo2] image        : ${imageInput ? `✅ ${Math.round(imageInput.imageBytes.length * 3/4 / 1024)} KB (${imageInput.mimeType})` : '❌ (nenhuma imagem)'}`);
      if (options.finalImagePath) {
         console.log(`[Veo2] finalImage   : Ignorado pelo API Veo 2 (suportado apenas no Flow)`);
      }
      console.log(`[Veo2] aspectRatio  : ${aspectRatio}`);
      console.log(`[Veo2] personGen    : ${personGen}`);
      console.log(`[Veo2] resolution   : ${imageInput ? '(omitida no image-to-video)' : '720p'}`);
      console.log(`[Veo2] duration     : ${Math.min(durationSeconds, 8)}s`);
      console.log('[Veo2] ==========================================');

      let operation = await ai.models.generateVideos({
        model: 'veo-2.0-generate-001',
        prompt,
        ...(imageInput ? { image: imageInput } : {}),
        config: {
          numberOfVideos: 1,
          aspectRatio,
          negativePrompt: "Watermark, text, logo, bad quality, low quality",
          ...(imageInput ? {} : { resolution: '720p' }), // resolution pode conflitar com image-to-video
          personGeneration: personGen,
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

      // Log detalhado para diagnóstico quando a API retorna 0 vídeos
      if (!generatedVideos || generatedVideos.length === 0) {
        console.error('[Veo2] ❌ API retornou generatedVideos vazio. Resposta completa:');
        console.error(JSON.stringify(operation.response, null, 2));
        const raiReasons = (operation.response as any)?.raiMediaFilteredReasons;
        const raiMsg = raiReasons ? ` | Motivo (filtro RAI): ${JSON.stringify(raiReasons)}` : '';
        throw new Error(`Nenhum vídeo foi gerado pela API Veo 2.${raiMsg}`);
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
