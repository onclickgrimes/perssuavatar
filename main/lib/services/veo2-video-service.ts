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

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import https from 'https';
import http from 'http';
import {
  buildVertexVideoModelResource,
  buildVideoDownloadUrl,
  createVideoGenAIClient,
  getVertexVideoProjectConfig,
} from './genai-video-client';

// ========================================
// INTERFACES
// ========================================

export interface Veo2GenerationOptions {
  prompt: string;
  /** Proporção: '16:9' (paisagem) | '9:16' (retrato) */
  aspectRatio?: '16:9' | '9:16';
  /** Duração em segundos (padrão 8, máx 8) */
  durationSeconds?: number;
  /** Chave Google GenAI (Gemini API ou Vertex API key) */
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

  private decodeProtoValue(value: any): any {
    if (Array.isArray(value)) {
      return value.map((item) => this.decodeProtoValue(item));
    }
    if (!value || typeof value !== 'object') {
      return value;
    }
    if ('stringValue' in value) return value.stringValue;
    if ('numberValue' in value) return value.numberValue;
    if ('boolValue' in value) return value.boolValue;
    if ('nullValue' in value) return null;
    if ('structValue' in value) {
      const fields = value.structValue?.fields || {};
      const out: Record<string, any> = {};
      Object.keys(fields).forEach((key) => {
        out[key] = this.decodeProtoValue(fields[key]);
      });
      return out;
    }
    if ('listValue' in value) {
      return this.decodeProtoValue(value.listValue?.values || []);
    }
    return value;
  }

  private extractGeneratedVideos(operation: any): Array<{ video: { uri?: string; videoBytes?: string; mimeType?: string } }> {
    const response = operation?.response ?? {};
    const rawCandidates = [
      response.generatedVideos,
      response.videos,
      response.generatedSamples,
      response.generateVideoResponse?.generatedVideos,
      response.generateVideoResponse?.videos,
      response.generateVideoResponse?.generatedSamples,
      response.predictions,
    ];

    const rawList = rawCandidates.find((value) => Array.isArray(value) && value.length > 0);
    if (!Array.isArray(rawList)) return [];

    return rawList
      .map((entry: any) => {
        const normalized = this.decodeProtoValue(entry);
        const videoNode = normalized?.video ?? normalized;
        const uri =
          videoNode?.uri ??
          videoNode?.gcsUri ??
          normalized?.uri ??
          normalized?.gcsUri;
        const videoBytes =
          videoNode?.videoBytes ??
          videoNode?.bytesBase64Encoded ??
          videoNode?.encodedVideo ??
          normalized?.videoBytes ??
          normalized?.bytesBase64Encoded ??
          normalized?.encodedVideo;
        const mimeType =
          videoNode?.mimeType ??
          videoNode?.encoding ??
          normalized?.mimeType ??
          normalized?.encoding ??
          'video/mp4';

        if (!uri && !videoBytes) return null;
        return { video: { uri, videoBytes, mimeType } };
      })
      .filter(Boolean) as Array<{ video: { uri?: string; videoBytes?: string; mimeType?: string } }>;
  }

  private async refetchCompletedOperation(ai: any, operation: any): Promise<any> {
    if (!operation?.name) return operation;

    let current = operation;
    const retries = 3;
    for (let i = 0; i < retries; i++) {
      const hasVideos = this.extractGeneratedVideos(current).length > 0;
      const filteredCount = Number(current?.response?.raiMediaFilteredCount || 0);
      const hasReasons = Array.isArray(current?.response?.raiMediaFilteredReasons)
        && current.response.raiMediaFilteredReasons.length > 0;

      if (hasVideos || current?.error || filteredCount > 0 || hasReasons) {
        return current;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
      current = await ai.operations.getVideosOperation({ operation: current });
    }

    return current;
  }

  private formatNoVideoDiagnostics(operation: any): string {
    const response = operation?.response ?? {};
    const details: string[] = [];

    if (operation?.error) {
      details.push(`operation.error=${JSON.stringify(operation.error)}`);
    }

    const filteredCount = response?.raiMediaFilteredCount;
    const filteredReasons = response?.raiMediaFilteredReasons;
    if (typeof filteredCount === 'number') {
      details.push(`raiMediaFilteredCount=${filteredCount}`);
    }
    if (Array.isArray(filteredReasons) && filteredReasons.length > 0) {
      details.push(`raiMediaFilteredReasons=${JSON.stringify(filteredReasons)}`);
    }

    const responseKeys = Object.keys(response);
    if (responseKeys.length > 0) {
      details.push(`responseKeys=${responseKeys.join(',')}`);
    }

    const metadataState = operation?.metadata?.state || operation?.metadata?.status;
    if (metadataState) {
      details.push(`metadataState=${String(metadataState)}`);
    }

    return details.length > 0 ? ` Detalhes: ${details.join(' | ')}` : '';
  }

  private writeVideoBytesToFile(videoBytes: string, outputPath: string): void {
    const normalized = videoBytes.includes(',')
      ? videoBytes.split(',').pop() || videoBytes
      : videoBytes;
    fs.writeFileSync(outputPath, Buffer.from(normalized, 'base64'));
  }

  private normalizeVideoUri(videoUri: string): string {
    if (!videoUri.startsWith('gs://')) return videoUri;

    const withoutScheme = videoUri.slice('gs://'.length);
    const slashIndex = withoutScheme.indexOf('/');
    if (slashIndex <= 0) return videoUri;

    const bucket = withoutScheme.slice(0, slashIndex);
    const objectPath = withoutScheme.slice(slashIndex + 1);
    return `https://storage.googleapis.com/${bucket}/${encodeURI(objectPath)}`;
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
    const overrideApiKey = options.apiKey?.trim() || null;

    const startTime = Date.now();
    const emit = (percent: number, message: string) => {
      onProgress?.(percent, message);
      console.log(`[Veo2] ${percent}% - ${message}`);
    };

    try {
      const {
        ai,
        backend,
        apiKey: resolvedApiKey,
      } = createVideoGenAIClient(overrideApiKey, 'primary');
      const { project: vertexProject, location: vertexLocation } = getVertexVideoProjectConfig();
      const modelResource = backend === 'vertex'
        ? buildVertexVideoModelResource('veo-2.0-generate-001', vertexProject, vertexLocation)
        : 'veo-2.0-generate-001';

      emit(5, `Iniciando geração Veo 2 (${backend === 'vertex' ? 'Vertex AI' : 'Gemini API'})...`);

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
        model: modelResource,
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

      while (!operation.done) {
        if (elapsed >= timeoutMs) {
          throw new Error('Timeout: o vídeo não foi gerado em 10 minutos.');
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
        elapsed += pollInterval;

        const estimatedPercent = Math.min(85, 10 + Math.round((elapsed / timeoutMs) * 75));
        emit(estimatedPercent, `Aguardando geração... (${Math.round(elapsed / 1000)}s)`);

        operation = await ai.operations.getVideosOperation({ operation });
      }

      emit(90, 'Gerado! Processando resultado...');
      operation = await this.refetchCompletedOperation(ai, operation);

      if (operation?.error) {
        throw new Error(`Operação Veo 2 finalizada com erro: ${JSON.stringify(operation.error)}`);
      }

      // 3. Extrair vídeo gerado (URI ou bytes)
      const generatedVideos = this.extractGeneratedVideos(operation);

      // Log detalhado para diagnóstico quando a API retorna 0 vídeos
      if (!generatedVideos || generatedVideos.length === 0) {
        console.error('[Veo2] ❌ API retornou operação sem vídeo. Resposta completa:');
        console.error(JSON.stringify(operation.response, null, 2));
        throw new Error(`Nenhum vídeo foi gerado pela API Veo 2.${this.formatNoVideoDiagnostics(operation)}`);
      }

      const firstVideo = generatedVideos[0]?.video;
      const outputFileName = `veo2-${Date.now()}.mp4`;
      const outputPath = path.join(this.outputDir, outputFileName);

      if (firstVideo?.videoBytes) {
        emit(92, 'Vídeo retornado em bytes. Salvando arquivo...');
        this.writeVideoBytesToFile(firstVideo.videoBytes, outputPath);
      } else {
        const videoUri = firstVideo?.uri;
        if (!videoUri) {
          throw new Error('URI do vídeo retornado pela API está vazia.');
        }

        // 4. Baixar o vídeo
        const normalizedUri = this.normalizeVideoUri(videoUri);
        const downloadUrl = buildVideoDownloadUrl(normalizedUri, resolvedApiKey || null);
        await this.downloadVideo(downloadUrl, outputPath);
      }

      const durationMs = Date.now() - startTime;
      emit(100, `Vídeo salvo em ${outputPath} (${Math.round(durationMs / 1000)}s)`);

      return {
        success: true,
        videoPath: outputPath,
        durationMs,
      };

    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const raw = String(error?.message || error || '');
      console.error('❌ [Veo2] Erro:', raw);
      if (raw.toLowerCase().includes('could not load the default credentials')) {
        return {
          success: false,
          error:
            'Falha de autenticação no Vertex AI: credenciais padrão do Google Cloud não foram encontradas. Configure um JSON de Service Account em Configurações > API e Modelos > Google Vertex AI, ou execute `gcloud auth application-default login`.',
          durationMs,
        };
      }
      if (raw.includes('RESOURCE_PROJECT_INVALID')) {
        return {
          success: false,
          error:
            'Vertex rejeitou o projeto (RESOURCE_PROJECT_INVALID). Verifique Projeto e Location em Configurações > API e Modelos, ou use ADC (gcloud auth application-default login) com projeto ativo no Vertex.',
          durationMs,
        };
      }
      if (raw.includes('Download falhou: HTTP 403')) {
        return {
          success: false,
          error:
            'Vídeo foi gerado, mas o download retornou 403 no Cloud Storage. Isso normalmente exige ADC (gcloud auth application-default login) com permissão de leitura no bucket de saída do Vertex.',
          durationMs,
        };
      }
      return {
        success: false,
        error: raw,
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
