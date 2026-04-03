import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import http from 'http';
import https from 'https';
import { createVideoGenAIClient } from './genai-video-client';

type ImageGenerationStage =
  | 'opening'
  | 'navigating'
  | 'submitting'
  | 'generating'
  | 'downloading'
  | 'complete'
  | 'error';

export interface GeminiImageResult {
  success: boolean;
  imagePaths?: string[];
  error?: string;
  durationMs?: number;
}

export type GeminiImageProgressCallback = (progress: {
  stage: ImageGenerationStage;
  message: string;
  percent?: number;
}) => void;

interface InlineImageData {
  data: string;
  mimeType: string;
}

const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const IMAGE_MODEL_PRO = 'gemini-3-pro-image-preview';

export class GeminiImageService {
  private outputDir: string;

  constructor() {
    this.outputDir = path.join(
      app.getPath('userData'),
      'video-projects',
      'gemini-images'
    );

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private emit(
    onProgress: GeminiImageProgressCallback | undefined,
    stage: ImageGenerationStage,
    message: string,
    percent?: number
  ): void {
    console.log(`🖼️ [Gemini/Img] ${message}`);
    onProgress?.({ stage, message, percent });
  }

  private resolveModel(model?: string): string {
    const raw = String(model || '').trim();
    if (!raw) return DEFAULT_IMAGE_MODEL;

    const normalized = raw.toLowerCase();

    if (
      normalized === DEFAULT_IMAGE_MODEL ||
      normalized === IMAGE_MODEL_PRO
    ) {
      return normalized;
    }

    if (
      normalized.includes('nano banana pro') ||
      normalized.includes('pro image')
    ) {
      return IMAGE_MODEL_PRO;
    }

    if (
      normalized.includes('nano banana') ||
      normalized.includes('flash image')
    ) {
      return DEFAULT_IMAGE_MODEL;
    }

    return raw;
  }

  private mapMimeToExtension(mimeType: string): string {
    const normalized = mimeType.toLowerCase();
    if (normalized.includes('png')) return 'png';
    if (normalized.includes('webp')) return 'webp';
    if (normalized.includes('gif')) return 'gif';
    if (normalized.includes('bmp')) return 'bmp';
    return 'jpg';
  }

  private guessMimeType(source: string, headerMimeType?: string): string {
    const fromHeader = String(headerMimeType || '')
      .toLowerCase()
      .split(';')[0]
      .trim();

    if (fromHeader.startsWith('image/')) {
      return fromHeader;
    }

    const cleanPath = source.split('?')[0];
    const extension = path.extname(cleanPath).toLowerCase();
    const byExt: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
    };

    return byExt[extension] || 'image/jpeg';
  }

  private isHttpUrl(value: string): boolean {
    const v = String(value || '').trim().toLowerCase();
    return v.startsWith('http://') || v.startsWith('https://');
  }

  private async downloadBuffer(
    url: string,
    redirectDepth: number = 0
  ): Promise<{ buffer: Buffer; mimeType?: string }> {
    if (redirectDepth > 5) {
      throw new Error('Muitos redirecionamentos ao baixar imagem de referência.');
    }

    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https://') ? https : http;
      const request = protocol.get(url, (response) => {
        const statusCode = response.statusCode || 0;

        if (
          statusCode >= 300 &&
          statusCode < 400 &&
          response.headers.location
        ) {
          const redirectedUrl = new URL(response.headers.location, url).toString();
          response.resume();
          this.downloadBuffer(redirectedUrl, redirectDepth + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (statusCode >= 400) {
          response.resume();
          reject(new Error(`Falha HTTP ${statusCode} ao baixar referência: ${url}`));
          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on('end', () => {
          const contentType = typeof response.headers['content-type'] === 'string'
            ? response.headers['content-type']
            : undefined;
          resolve({
            buffer: Buffer.concat(chunks),
            mimeType: contentType,
          });
        });
        response.on('error', reject);
      });

      request.setTimeout(30000, () => {
        request.destroy(new Error('Timeout ao baixar imagem de referência.'));
      });
      request.on('error', reject);
    });
  }

  private async loadImageAsInlineData(imagePath: string): Promise<InlineImageData> {
    if (!imagePath) {
      throw new Error('Caminho de imagem inválido.');
    }

    if (this.isHttpUrl(imagePath)) {
      const downloaded = await this.downloadBuffer(imagePath);
      return {
        data: downloaded.buffer.toString('base64'),
        mimeType: this.guessMimeType(imagePath, downloaded.mimeType),
      };
    }

    if (!fs.existsSync(imagePath)) {
      throw new Error(`Imagem de referência não encontrada: ${imagePath}`);
    }

    const buffer = fs.readFileSync(imagePath);
    return {
      data: buffer.toString('base64'),
      mimeType: this.guessMimeType(imagePath),
    };
  }

  private extractResponseParts(response: any): any[] {
    const candidateParts = response?.candidates?.[0]?.content?.parts;
    if (Array.isArray(candidateParts)) return candidateParts;

    if (Array.isArray(response?.parts)) return response.parts;

    return [];
  }

  private extractGeneratedImages(response: any): InlineImageData[] {
    const parts = this.extractResponseParts(response);
    const images: InlineImageData[] = [];

    for (const part of parts) {
      const inlineData = part?.inlineData || part?.inline_data;
      if (!inlineData) continue;

      const data = inlineData.data;
      if (!data) continue;

      let base64 = '';
      if (typeof data === 'string') {
        base64 = data;
      } else if (data instanceof Uint8Array) {
        base64 = Buffer.from(data).toString('base64');
      } else {
        continue;
      }

      if (!base64) continue;
      images.push({
        data: base64,
        mimeType: inlineData.mimeType || inlineData.mime_type || 'image/png',
      });
    }

    return images;
  }

  private extractTextSummary(response: any): string {
    const parts = this.extractResponseParts(response);
    const textParts = parts
      .map((part) => String(part?.text || '').trim())
      .filter(Boolean);
    return textParts.join(' ').trim();
  }

  private normalizeError(rawMessage: string): string {
    const raw = String(rawMessage || '').trim();
    const lower = raw.toLowerCase();

    if (lower.includes('could not load the default credentials')) {
      return 'Falha de autenticação no Vertex AI: credenciais padrão do Google Cloud não foram encontradas. Configure um JSON de Service Account em Configurações > API e Modelos > Google Vertex AI, ou execute `gcloud auth application-default login`.';
    }

    if (raw.includes('RESOURCE_PROJECT_INVALID')) {
      return 'Vertex rejeitou o projeto (RESOURCE_PROJECT_INVALID). Verifique Projeto e Location em Configurações > API e Modelos, ou use ADC (gcloud auth application-default login) com projeto ativo no Vertex.';
    }

    if (lower.includes('permission_denied')) {
      return `Permissão negada na API de imagem do Gemini/Vertex: ${raw}`;
    }

    return raw || 'Erro desconhecido na geração de imagem.';
  }

  private buildPromptForVariation(
    prompt: string,
    index: number,
    total: number,
    hasIngredients: boolean
  ): string {
    const base = prompt.trim();
    const variationHint =
      total > 1
        ? `\n\nVariation ${index + 1} of ${total}: keep the same concept while changing composition/camera/framing details.`
        : '';
    const ingredientHint = hasIngredients
      ? '\n\nUse the provided reference images as ingredients and preserve key visual details where relevant.'
      : '';
    return `${base}${variationHint}${ingredientHint}`.trim();
  }

  async generateImages(
    prompt: string,
    count: number = 1,
    onProgress?: GeminiImageProgressCallback,
    model: string = DEFAULT_IMAGE_MODEL,
    aspectRatio?: string,
    ingredientImagePaths?: string[]
  ): Promise<GeminiImageResult> {
    const startTime = Date.now();
    const requestedCount = Math.max(1, Math.min(Math.floor(Number(count) || 1), 4));
    const cleanPrompt = String(prompt || '').trim();

    if (!cleanPrompt) {
      return {
        success: false,
        error: 'Prompt vazio para geração de imagem.',
        durationMs: 0,
      };
    }

    try {
      this.emit(onProgress, 'opening', 'Inicializando cliente GenAI...', 2);

      const {
        ai,
        backend,
      } = createVideoGenAIClient(null, 'primary');
      const resolvedModel = this.resolveModel(model);

      this.emit(
        onProgress,
        'navigating',
        `Conectado via ${backend === 'vertex' ? 'Vertex AI' : 'Gemini API'} (${resolvedModel})`,
        6
      );

      // Limite prático para manter payload da chamada estável.
      const referencePaths = (ingredientImagePaths || []).filter(Boolean).slice(0, 5);
      const references: InlineImageData[] = [];

      if (referencePaths.length > 0) {
        this.emit(
          onProgress,
          'submitting',
          `Carregando ${referencePaths.length} imagem(ns) de referência...`,
          10
        );

        for (let i = 0; i < referencePaths.length; i++) {
          try {
            const inlineImage = await this.loadImageAsInlineData(referencePaths[i]);
            references.push(inlineImage);
            const pct = 10 + Math.round(((i + 1) / referencePaths.length) * 10);
            this.emit(
              onProgress,
              'submitting',
              `Referência ${i + 1}/${referencePaths.length} carregada`,
              pct
            );
          } catch (error: any) {
            console.warn(`⚠️ [Gemini/Img] Falha ao carregar referência ${i + 1}: ${error?.message || error}`);
          }
        }
      }

      this.emit(
        onProgress,
        'submitting',
        `Gerando ${requestedCount} imagem(ns)...`,
        22
      );

      const generatedPaths: string[] = [];

      for (let i = 0; i < requestedCount; i++) {
        const generationPercent = Math.min(
          82,
          25 + Math.round((i / requestedCount) * 52)
        );
        this.emit(
          onProgress,
          'generating',
          `Gerando imagem ${i + 1} de ${requestedCount}...`,
          generationPercent
        );

        const promptForRequest = this.buildPromptForVariation(
          cleanPrompt,
          i,
          requestedCount,
          references.length > 0
        );

        const parts: any[] = [{ text: promptForRequest }];
        references.forEach((reference) => {
          parts.push({
            inlineData: {
              data: reference.data,
              mimeType: reference.mimeType,
            },
          });
        });

        const imageConfig: any = { imageSize: '2K' };
        if (aspectRatio && String(aspectRatio).trim()) {
          imageConfig.aspectRatio = String(aspectRatio).trim();
        }

        const config: any = {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig,
        };

        const response = await ai.models.generateContent({
          model: resolvedModel,
          contents: [{ role: 'user', parts }],
          config,
        } as any);

        const generatedImages = this.extractGeneratedImages(response);
        if (!generatedImages.length) {
          const responseText = this.extractTextSummary(response);
          const suffix = responseText ? ` Texto retornado: ${responseText.substring(0, 240)}` : '';
          throw new Error(`A API não retornou dados de imagem.${suffix}`);
        }

        const finalImage = generatedImages[generatedImages.length - 1];
        const extension = this.mapMimeToExtension(finalImage.mimeType);
        const fileName = `gemini-image-${Date.now()}-${String(i + 1).padStart(2, '0')}.${extension}`;
        const outputPath = path.join(this.outputDir, fileName);

        this.emit(
          onProgress,
          'downloading',
          `Salvando imagem ${i + 1} de ${requestedCount}...`,
          Math.min(94, 84 + Math.round(((i + 1) / requestedCount) * 10))
        );

        fs.writeFileSync(outputPath, Buffer.from(finalImage.data, 'base64'));
        const fileSize = fs.statSync(outputPath).size;

        if (fileSize <= 500) {
          fs.unlinkSync(outputPath);
          throw new Error('A imagem retornada pela API está vazia ou inválida.');
        }

        generatedPaths.push(outputPath);
      }

      const durationMs = Date.now() - startTime;
      this.emit(
        onProgress,
        'complete',
        `${generatedPaths.length} imagem(ns) gerada(s) com sucesso!`,
        100
      );

      return {
        success: true,
        imagePaths: generatedPaths,
        durationMs,
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const raw = String(error?.message || error || '');
      const normalized = this.normalizeError(raw);
      this.emit(onProgress, 'error', `Erro: ${normalized}`);
      console.error('❌ [Gemini/Img] Erro na geração:', raw);
      return {
        success: false,
        error: normalized,
        durationMs,
      };
    }
  }
}

let geminiImageServiceInstance: GeminiImageService | null = null;

export function getGeminiImageService(): GeminiImageService {
  if (!geminiImageServiceInstance) {
    geminiImageServiceInstance = new GeminiImageService();
  }
  return geminiImageServiceInstance;
}
