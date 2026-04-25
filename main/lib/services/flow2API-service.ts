import * as fs from 'fs';
import * as path from 'path';
import http from 'http';
import https from 'https';
import { app } from 'electron';

type Flow2APIStage =
  | 'opening'
  | 'submitting'
  | 'generating'
  | 'downloading'
  | 'complete'
  | 'error';

export type Flow2APIProgressCallback = (progress: {
  stage: Flow2APIStage;
  message: string;
  percent?: number;
}) => void;

export type Flow2APIFlowVideoService = 'veo3' | 'veo3-lite-flow' | 'veo2-flow';

export interface Flow2APIVideoOptions {
  prompt: string;
  service?: Flow2APIFlowVideoService;
  aspectRatio?: string;
  count?: number;
  model?: string;
  referenceImagePath?: string;
  finalImagePath?: string;
  ingredientImagePaths?: string[];
  onProgress?: Flow2APIProgressCallback;
}

export interface Flow2APIVideoResult {
  success: boolean;
  videoPath?: string;
  error?: string;
  durationMs?: number;
  rawContent?: string;
}

export interface Flow2APIImageResult {
  success: boolean;
  imagePaths?: string[];
  error?: string;
  durationMs?: number;
  rawContent?: string;
}

interface ChatCompletionResult {
  content: string;
  mediaUrls: string[];
}

interface LoadedMedia {
  dataUrl: string;
  mimeType: string;
}

const DEFAULT_BASE_URL = 'http://localhost:8000';
const DEFAULT_API_KEY = 'han1234';
const DEFAULT_VIDEO_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_IMAGE_TIMEOUT_MS = 8 * 60 * 1000;
const MAX_REFERENCE_IMAGES = 3;

export class Flow2APIService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly videoOutputDir: string;
  private readonly imageOutputDir: string;

  constructor(config?: { baseUrl?: string; apiKey?: string }) {
    this.baseUrl = this.normalizeBaseUrl(
      config?.baseUrl
      || process.env.FLOW2API_BASE_URL
      || DEFAULT_BASE_URL
    );
    this.apiKey = (
      config?.apiKey
      || process.env.FLOW2API_API_KEY
      || process.env.FLOW2API_KEY
      || DEFAULT_API_KEY
    ).trim();

    const projectsDir = path.join(app.getPath('userData'), 'video-projects');
    this.videoOutputDir = path.join(projectsDir, 'flow2api-videos');
    this.imageOutputDir = path.join(projectsDir, 'flow2api-images');
    fs.mkdirSync(this.videoOutputDir, { recursive: true });
    fs.mkdirSync(this.imageOutputDir, { recursive: true });
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async isAvailable(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async generateVideo(options: Flow2APIVideoOptions): Promise<Flow2APIVideoResult> {
    const startTime = Date.now();
    const cleanPrompt = String(options.prompt || '').trim();

    if (!cleanPrompt) {
      return { success: false, error: 'Prompt vazio para geracao de video.', durationMs: 0 };
    }

    const emit = (stage: Flow2APIStage, message: string, percent?: number) => {
      console.log(`[Flow2API/Video] ${message}`);
      options.onProgress?.({ stage, message, percent });
    };

    try {
      emit('opening', `Conectando ao Flow2API em ${this.baseUrl}...`, 2);

      const references = await this.loadVideoReferences(options, emit);
      const model = this.resolveVideoModel(options, references.length);

      emit('submitting', `Enviando geracao para ${model}...`, 12);
      const result = await this.createChatCompletion({
        model,
        prompt: cleanPrompt,
        references,
        timeoutMs: DEFAULT_VIDEO_TIMEOUT_MS,
        onProgress: (message) => emit('generating', message, undefined),
      });

      const mediaUrl = result.mediaUrls.find(url => this.isVideoLikeUrl(url)) || result.mediaUrls[0];
      if (!mediaUrl) {
        throw new Error(`Flow2API nao retornou URL de video. Retorno: ${result.content.substring(0, 500)}`);
      }

      emit('downloading', 'Baixando video gerado...', 92);
      const outputPath = await this.saveMediaUrl(
        mediaUrl,
        this.videoOutputDir,
        `flow2api-video-${Date.now()}`,
        'mp4'
      );

      const durationMs = Date.now() - startTime;
      emit('complete', `Video gerado com Flow2API (${Math.round(durationMs / 1000)}s).`, 100);

      return {
        success: true,
        videoPath: outputPath,
        durationMs,
        rawContent: result.content,
      };
    } catch (error: any) {
      const message = this.normalizeError(error);
      emit('error', `Erro: ${message}`);
      console.error('[Flow2API/Video] Generation error:', message, error?.stack || error);
      return {
        success: false,
        error: message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  async generateImages(
    prompt: string,
    count: number = 1,
    onProgress?: Flow2APIProgressCallback,
    aspectRatio?: string,
    ingredientImagePaths?: string[]
  ): Promise<Flow2APIImageResult> {
    const startTime = Date.now();
    const cleanPrompt = String(prompt || '').trim();
    const requestedCount = Math.max(1, Math.min(Math.floor(Number(count) || 1), 4));

    if (!cleanPrompt) {
      return { success: false, error: 'Prompt vazio para geracao de imagem.', durationMs: 0 };
    }

    const emit = (stage: Flow2APIStage, message: string, percent?: number) => {
      console.log(`[Flow2API/Image] ${message}`);
      onProgress?.({ stage, message, percent });
    };

    try {
      emit('opening', `Conectando ao Flow2API em ${this.baseUrl}...`, 2);

      const referencePaths = (ingredientImagePaths || [])
        .filter(Boolean)
        .slice(0, MAX_REFERENCE_IMAGES);
      const references: LoadedMedia[] = [];

      if (referencePaths.length > 0) {
        emit('submitting', `Carregando ${referencePaths.length} referencia(s)...`, 8);
        for (let i = 0; i < referencePaths.length; i++) {
          references.push(await this.loadImageAsDataUrl(referencePaths[i]));
          emit(
            'submitting',
            `Referencia ${i + 1}/${referencePaths.length} carregada`,
            8 + Math.round(((i + 1) / referencePaths.length) * 12)
          );
        }
      }

      const model = this.resolveImageModel(aspectRatio);
      const imagePaths: string[] = [];
      const rawContentParts: string[] = [];
      const failures: string[] = [];

      for (let i = 0; i < requestedCount; i++) {
        const promptForRequest = this.buildImagePrompt(cleanPrompt, i, requestedCount, references.length > 0);
        emit('submitting', `Enviando imagem ${i + 1}/${requestedCount} para ${model}...`, 20);

        try {
          const result = await this.createChatCompletion({
            model,
            prompt: promptForRequest,
            references,
            timeoutMs: DEFAULT_IMAGE_TIMEOUT_MS,
            onProgress: (message) => emit('generating', message, undefined),
          });

          rawContentParts.push(result.content);
          const mediaUrl = result.mediaUrls.find(url => this.isImageLikeUrl(url)) || result.mediaUrls[0];
          if (!mediaUrl) {
            throw new Error(`Flow2API nao retornou URL de imagem. Retorno: ${result.content.substring(0, 500)}`);
          }

          emit('downloading', `Salvando imagem ${i + 1}/${requestedCount}...`, 82);
          const outputPath = await this.saveMediaUrl(
            mediaUrl,
            this.imageOutputDir,
            `flow2api-image-${Date.now()}-${String(i + 1).padStart(2, '0')}`,
            'jpg'
          );
          imagePaths.push(outputPath);
        } catch (error: any) {
          const normalized = this.normalizeError(error);
          failures.push(`Imagem ${i + 1}/${requestedCount}: ${normalized}`);
          console.warn(`[Flow2API/Image] Imagem ${i + 1}/${requestedCount} falhou: ${normalized}`);
          emit(
            'generating',
            `Imagem ${i + 1}/${requestedCount} falhou: ${normalized}${i < requestedCount - 1 ? ' Continuando...' : ''}`,
            undefined
          );
        }
      }

      if (imagePaths.length === 0) {
        throw new Error(failures.join(' | ') || 'Nenhuma imagem foi gerada pelo Flow2API.');
      }

      const durationMs = Date.now() - startTime;
      emit(
        'complete',
        failures.length > 0
          ? `${imagePaths.length}/${requestedCount} imagem(ns) gerada(s) com Flow2API. ${failures.length} falharam.`
          : `${imagePaths.length} imagem(ns) gerada(s) com Flow2API.`,
        100
      );

      return {
        success: true,
        imagePaths,
        error: failures.length > 0 ? failures.join(' | ') : undefined,
        durationMs,
        rawContent: [...rawContentParts, ...failures].join('\n'),
      };
    } catch (error: any) {
      const message = this.normalizeError(error);
      emit('error', `Erro: ${message}`);
      console.error('[Flow2API/Image] Generation error:', message, error?.stack || error);
      return {
        success: false,
        error: message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async createChatCompletion(options: {
    model: string;
    prompt: string;
    references: LoadedMedia[];
    timeoutMs: number;
    onProgress?: (message: string) => void;
  }): Promise<ChatCompletionResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const content: any[] = [{ type: 'text', text: options.prompt }];
      for (const reference of options.references) {
        content.push({
          type: 'image_url',
          image_url: { url: reference.dataUrl },
        });
      }

      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: options.model,
          messages: [
            {
              role: 'user',
              content: options.references.length === 0 ? options.prompt : content,
            },
          ],
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Flow2API HTTP ${response.status}: ${text || response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Flow2API retornou resposta sem stream.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let lastProgressMessage = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const rawLine of lines) {
          const parsed = this.parseStreamLine(rawLine);
          if (!parsed || parsed.done) continue;
          if (parsed.error) throw new Error(parsed.error);
          if (!parsed.content) continue;
          if (this.isFlow2APIBlockingError(parsed.content)) {
            throw new Error(parsed.content);
          }

          fullContent += parsed.content;
          const progressMessage = this.extractProgressMessage(parsed.content);
          if (progressMessage && progressMessage !== lastProgressMessage) {
            lastProgressMessage = progressMessage;
            options.onProgress?.(progressMessage);
          }
        }
      }

      const tail = buffer.trim();
      if (tail) {
        const parsed = this.parseStreamLine(tail);
        if (parsed?.error) throw new Error(parsed.error);
        if (parsed?.content && this.isFlow2APIBlockingError(parsed.content)) {
          throw new Error(parsed.content);
        }
        if (parsed?.content) fullContent += parsed.content;
      }

      const mediaUrls = this.extractMediaUrls(fullContent);
      return { content: fullContent, mediaUrls };
    } finally {
      clearTimeout(timer);
    }
  }

  private parseStreamLine(line: string): { done?: boolean; content?: string; error?: string } | null {
    const trimmed = String(line || '').trim();
    if (!trimmed) return null;

    let payloadText = trimmed;
    if (payloadText.startsWith('data:')) {
      payloadText = payloadText.slice('data:'.length).trim();
    }
    if (!payloadText || payloadText === '[DONE]') {
      return { done: true };
    }

    try {
      const payload = JSON.parse(payloadText);
      const error = payload?.error;
      if (error) {
        return {
          error: error.message || JSON.stringify(error),
        };
      }

      const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
      const delta = choice?.delta || {};
      const content = delta.reasoning_content || delta.content || choice?.message?.content || '';
      return { content: typeof content === 'string' ? content : '' };
    } catch {
      return null;
    }
  }

  private extractMediaUrls(content: string): string[] {
    const urls = new Set<string>();
    const text = String(content || '');

    const markdownImageRe = /!\[[^\]]*]\(([^)]+)\)/g;
    const videoTagRe = /<video[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const urlRe = /(https?:\/\/[^\s"'<>)]*|data:(?:image|video)\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/g;

    let match: RegExpExecArray | null;
    while ((match = markdownImageRe.exec(text)) !== null) {
      if (match[1]) urls.add(match[1].trim());
    }
    while ((match = videoTagRe.exec(text)) !== null) {
      if (match[1]) urls.add(match[1].trim());
    }
    while ((match = urlRe.exec(text)) !== null) {
      if (match[1]) urls.add(match[1].trim());
    }

    return Array.from(urls);
  }

  private async loadVideoReferences(
    options: Flow2APIVideoOptions,
    emit: (stage: Flow2APIStage, message: string, percent?: number) => void
  ): Promise<LoadedMedia[]> {
    const references: string[] = [];

    const ingredientPaths = (options.ingredientImagePaths || []).filter(Boolean);
    if (ingredientPaths.length > 0) {
      references.push(...ingredientPaths.slice(0, MAX_REFERENCE_IMAGES));
    } else {
      if (options.referenceImagePath) references.push(options.referenceImagePath);
      if (options.finalImagePath) references.push(options.finalImagePath);
    }

    const loaded: LoadedMedia[] = [];
    if (references.length === 0) return loaded;

    emit('submitting', `Carregando ${references.length} imagem(ns) para video...`, 6);
    for (let i = 0; i < references.length; i++) {
      loaded.push(await this.loadImageAsDataUrl(references[i]));
      emit(
        'submitting',
        `Imagem de referencia ${i + 1}/${references.length} carregada`,
        6 + Math.round(((i + 1) / references.length) * 8)
      );
    }

    return loaded;
  }

  private resolveVideoModel(options: Flow2APIVideoOptions, referenceCount: number): string {
    const service = this.normalizeVideoService(options);
    const orientation = this.isPortrait(options.aspectRatio) ? 'portrait' : 'landscape';
    const isLite = service === 'veo3-lite-flow';
    const legacyVeo2Override = service === 'veo2-flow'
      ? String(process.env.FLOW2API_VEO2_FLOW_MODEL || '').trim()
      : '';

    if (legacyVeo2Override) {
      return legacyVeo2Override;
    }

    if (referenceCount > 1) {
      if (isLite) {
        return orientation === 'portrait'
          ? 'veo_3_1_interpolation_lite_portrait'
          : 'veo_3_1_interpolation_lite_landscape';
      }
      return orientation === 'portrait'
        ? 'veo_3_1_r2v_fast_portrait'
        : 'veo_3_1_r2v_fast';
    }

    if (referenceCount === 1) {
      if (isLite) {
        return orientation === 'portrait'
          ? 'veo_3_1_i2v_lite_portrait'
          : 'veo_3_1_i2v_lite_landscape';
      }
      return orientation === 'portrait'
        ? 'veo_3_1_i2v_s_fast_portrait_fl'
        : 'veo_3_1_i2v_s_fast_fl';
    }

    if (isLite) {
      return orientation === 'portrait'
        ? 'veo_3_1_t2v_lite_portrait'
        : 'veo_3_1_t2v_lite_landscape';
    }

    return orientation === 'portrait'
      ? 'veo_3_1_t2v_fast_portrait'
      : 'veo_3_1_t2v_fast_landscape';
  }

  private normalizeVideoService(options: Flow2APIVideoOptions): Flow2APIFlowVideoService {
    if (options.service) return options.service;

    const normalizedModel = String(options.model || '').toLowerCase();
    if (normalizedModel.includes('lite')) return 'veo3-lite-flow';
    return 'veo3';
  }

  private resolveImageModel(aspectRatio?: string): string {
    const aspect = this.normalizeImageAspect(aspectRatio);
    return `gemini-3.1-flash-image-${aspect}`;
  }

  private normalizeImageAspect(aspectRatio?: string): string {
    const raw = String(aspectRatio || '16:9').trim().toLowerCase();
    if (raw === '9:16' || raw === 'portrait') return 'portrait';
    if (raw === '1:1' || raw === 'square') return 'square';
    if (raw === '4:3' || raw === 'four-three') return 'four-three';
    if (raw === '3:4' || raw === 'three-four') return 'three-four';
    return 'landscape';
  }

  private buildImagePrompt(prompt: string, index: number, total: number, hasReferences: boolean): string {
    const variation = total > 1
      ? `\n\nVariation ${index + 1} of ${total}: keep the same concept while changing composition, camera angle, or framing details.`
      : '';
    const referenceHint = hasReferences
      ? '\n\nUse the provided reference images as visual references and preserve key details where relevant.'
      : '';
    return `${prompt}${variation}${referenceHint}`.trim();
  }

  private async loadImageAsDataUrl(source: string): Promise<LoadedMedia> {
    const value = String(source || '').trim();
    if (!value) throw new Error('Caminho de imagem vazio.');

    if (value.startsWith('data:image/')) {
      const mimeType = value.slice('data:'.length, value.indexOf(';base64,'));
      return { dataUrl: value, mimeType: mimeType || 'image/jpeg' };
    }

    if (this.isHttpUrl(value)) {
      const downloaded = await this.downloadToBuffer(value);
      const mimeType = this.guessMimeType(value, downloaded.mimeType, 'image/jpeg');
      return {
        dataUrl: `data:${mimeType};base64,${downloaded.buffer.toString('base64')}`,
        mimeType,
      };
    }

    const filePath = value.startsWith('file://')
      ? this.fileUrlToPath(value)
      : value;

    if (!fs.existsSync(filePath)) {
      throw new Error(`Imagem de referencia nao encontrada: ${filePath}`);
    }

    const buffer = fs.readFileSync(filePath);
    const mimeType = this.guessMimeType(filePath, undefined, 'image/jpeg');
    return {
      dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
      mimeType,
    };
  }

  private async saveMediaUrl(
    mediaUrl: string,
    outputDir: string,
    fileStem: string,
    fallbackExtension: string
  ): Promise<string> {
    if (mediaUrl.startsWith('data:')) {
      return this.saveDataUrl(mediaUrl, outputDir, fileStem, fallbackExtension);
    }

    if (this.isHttpUrl(mediaUrl)) {
      const extension = this.extensionFromUrl(mediaUrl, fallbackExtension);
      const outputPath = path.join(outputDir, `${fileStem}.${extension}`);
      await this.downloadUrlToFile(mediaUrl, outputPath);
      return outputPath;
    }

    if (fs.existsSync(mediaUrl)) {
      return mediaUrl;
    }

    throw new Error(`URL de midia invalida retornada pelo Flow2API: ${mediaUrl}`);
  }

  private saveDataUrl(dataUrl: string, outputDir: string, fileStem: string, fallbackExtension: string): string {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('Data URL invalida retornada pelo Flow2API.');

    const mimeType = match[1] || '';
    const extension = this.extensionFromMimeType(mimeType, fallbackExtension);
    const outputPath = path.join(outputDir, `${fileStem}.${extension}`);
    fs.writeFileSync(outputPath, Buffer.from(match[2], 'base64'));
    return outputPath;
  }

  private async downloadUrlToFile(url: string, outputPath: string, redirectDepth: number = 0): Promise<void> {
    if (redirectDepth > 5) {
      throw new Error('Muitos redirecionamentos ao baixar midia do Flow2API.');
    }

    await new Promise<void>((resolve, reject) => {
      const protocol = url.startsWith('https://') ? https : http;
      const file = fs.createWriteStream(outputPath);
      const request = protocol.get(url, (response) => {
        const statusCode = response.statusCode || 0;

        if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
          response.resume();
          file.close();
          fs.rmSync(outputPath, { force: true });
          const nextUrl = new URL(response.headers.location, url).toString();
          this.downloadUrlToFile(nextUrl, outputPath, redirectDepth + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (statusCode !== 200) {
          response.resume();
          file.close();
          fs.rmSync(outputPath, { force: true });
          reject(new Error(`Download de midia falhou: HTTP ${statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      });

      request.setTimeout(60000, () => {
        request.destroy(new Error('Timeout ao baixar midia do Flow2API.'));
      });
      request.on('error', (error) => {
        file.close();
        fs.rmSync(outputPath, { force: true });
        reject(error);
      });
      file.on('error', (error) => {
        fs.rmSync(outputPath, { force: true });
        reject(error);
      });
    });
  }

  private async downloadToBuffer(url: string, redirectDepth: number = 0): Promise<{ buffer: Buffer; mimeType?: string }> {
    if (redirectDepth > 5) {
      throw new Error('Muitos redirecionamentos ao carregar imagem de referencia.');
    }

    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https://') ? https : http;
      const request = protocol.get(url, (response) => {
        const statusCode = response.statusCode || 0;

        if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
          response.resume();
          const nextUrl = new URL(response.headers.location, url).toString();
          this.downloadToBuffer(nextUrl, redirectDepth + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (statusCode >= 400) {
          response.resume();
          reject(new Error(`Falha HTTP ${statusCode} ao baixar referencia: ${url}`));
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
        request.destroy(new Error('Timeout ao baixar imagem de referencia.'));
      });
      request.on('error', reject);
    });
  }

  private buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private normalizeBaseUrl(url: string): string {
    return String(url || DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  private isPortrait(aspectRatio?: string): boolean {
    const raw = String(aspectRatio || '').trim().toLowerCase();
    return raw === '9:16' || raw === 'portrait';
  }

  private isHttpUrl(value: string): boolean {
    const raw = String(value || '').toLowerCase();
    return raw.startsWith('http://') || raw.startsWith('https://');
  }

  private isImageLikeUrl(url: string): boolean {
    const lower = String(url || '').toLowerCase();
    return lower.startsWith('data:image/')
      || /\.(png|jpe?g|webp|gif|bmp)(?:$|[?#])/i.test(lower)
      || lower.includes('/image');
  }

  private isVideoLikeUrl(url: string): boolean {
    const lower = String(url || '').toLowerCase();
    return lower.startsWith('data:video/')
      || /\.(mp4|webm|mov|m4v|avi|mkv)(?:$|[?#])/i.test(lower)
      || lower.includes('/video');
  }

  private extractProgressMessage(content: string): string {
    const trimmed = String(content || '')
      .replace(/!\[[^\]]*]\([^)]+\)/g, '')
      .replace(/<video[^>]+>/gi, '')
      .replace(/<\/video>/gi, '')
      .trim();

    if (!trimmed) return '';
    const normalized = this.normalizeFlow2APIText(trimmed);
    if (!normalized || this.isUnreadableProgressMessage(normalized)) return '';
    if (normalized.length > 180) return `${normalized.substring(0, 177)}...`;
    return normalized;
  }

  private guessMimeType(source: string, headerMimeType: string | undefined, fallback: string): string {
    const fromHeader = String(headerMimeType || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (fromHeader.startsWith('image/') || fromHeader.startsWith('video/')) {
      return fromHeader;
    }

    const ext = path.extname(source.split('?')[0]).toLowerCase();
    const byExt: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.m4v': 'video/mp4',
    };
    return byExt[ext] || fallback;
  }

  private extensionFromUrl(url: string, fallback: string): string {
    const ext = path.extname(url.split('?')[0]).replace('.', '').toLowerCase();
    if (ext && /^[a-z0-9]{2,5}$/.test(ext)) return ext;
    return fallback;
  }

  private extensionFromMimeType(mimeType: string, fallback: string): string {
    const lower = String(mimeType || '').toLowerCase();
    if (lower.includes('png')) return 'png';
    if (lower.includes('webp')) return 'webp';
    if (lower.includes('gif')) return 'gif';
    if (lower.includes('bmp')) return 'bmp';
    if (lower.includes('mp4')) return 'mp4';
    if (lower.includes('webm')) return 'webm';
    if (lower.includes('quicktime')) return 'mov';
    if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg';
    return fallback;
  }

  private fileUrlToPath(fileUrl: string): string {
    const url = new URL(fileUrl);
    return decodeURIComponent(url.pathname.replace(/^\/([a-zA-Z]:)/, '$1'));
  }

  private normalizeError(error: any): string {
    if (error?.name === 'AbortError') {
      return 'Timeout ao aguardar resposta do Flow2API.';
    }
    return this.normalizeFlow2APIText(
      String(error?.message || error || 'Erro desconhecido no Flow2API.')
    );
  }

  private normalizeFlow2APIText(rawMessage: string): string {
    const raw = String(rawMessage || '').trim();
    if (!raw) return '';

    const unsafeMatch = raw.match(/PUBLIC_ERROR_UNSAFE_GENERATION(?::\s*([^\n]+))?/i);
    if (unsafeMatch) {
      const suffix = (unsafeMatch[1] || '').trim();
      return [
        'Flow2API bloqueou a geracao por seguranca (PUBLIC_ERROR_UNSAFE_GENERATION).',
        suffix ? `Detalhe: ${suffix}` : '',
        'Ajuste o prompt para remover termos sensiveis como morte, cadaver, sangue, violencia ou decomposicao.',
      ].filter(Boolean).join(' ');
    }

    const flowFailureMatch = raw.match(/Flow API request failed:\s*([^\n]+)/i);
    if (flowFailureMatch) {
      return `Flow API request failed: ${flowFailureMatch[1].trim()}`;
    }

    return raw
      .replace(/^[\s?¿!¡:：-]+(?=[A-Za-z])/g, '')
      .trim();
  }

  private isFlow2APIBlockingError(message: string): boolean {
    return /PUBLIC_ERROR_UNSAFE_GENERATION|Flow API request failed:/i.test(String(message || ''));
  }

  private isUnreadableProgressMessage(message: string): boolean {
    const compact = String(message || '').replace(/\s/g, '');
    if (!compact) return true;
    const questionMarks = (compact.match(/\?/g) || []).length;
    const questionRatio = questionMarks / Math.max(compact.length, 1);
    return questionRatio > 0.3 && !/[A-Za-z]/.test(compact);
  }
}

let flow2APIServiceInstance: Flow2APIService | null = null;

export function getFlow2APIService(): Flow2APIService {
  if (!flow2APIServiceInstance) {
    flow2APIServiceInstance = new Flow2APIService();
  }
  return flow2APIServiceInstance;
}
