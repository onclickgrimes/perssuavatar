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

export interface Veo3GenerationOptions {
  prompt: string;
  model?: string; // Permitirá escolher entre Veo 3.1 e Veo 3.1 Fast
  aspectRatio?: '16:9' | '9:16';
  durationSeconds?: number;
  apiKey?: string;
  referenceImagePath?: string;
  ingredientImagePaths?: string[]; // Imagens de referência (asset) para o Veo 3
  onProgress?: (percent: number, message: string) => void;
}

export interface Veo3GenerationResult {
  success: boolean;
  videoPath?: string;
  error?: string;
  durationMs?: number;
}

export class Veo3VideoService {
  private outputDir: string;
  
  // -- NOVAS PROPRIEDADES DA FILA --
  private usageFilePath: string;
  private queueMutexes: Record<string, Promise<any>> = {};
  // --------------------------------

  constructor() {
    this.outputDir = path.join(
      app.getPath('userData'),
      'video-projects',
      'veo3-videos'
    );
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    
    // -- DEFINE ONDE SALVAR O USO DIÁRIO --
    this.usageFilePath = path.join(app.getPath('userData'), 'veo3-usage.json');
  }

  private readUsage(): any {
    try {
      if (fs.existsSync(this.usageFilePath)) {
        return JSON.parse(fs.readFileSync(this.usageFilePath, 'utf-8'));
      }
    } catch (e) { console.error("[Veo3 API] Erro ao ler arquivo de uso:", e); }
    return {};
  }

  private writeUsage(usage: any) {
    try {
      fs.writeFileSync(this.usageFilePath, JSON.stringify(usage, null, 2), 'utf-8');
    } catch (e) { console.error("[Veo3 API] Erro ao salvar arquivo de uso:", e); }
  }

  // Fila sequencial que respeita o RPM (2) e RPD (10)
  private async waitInQueueAndConsume(model: string, emit: (p: number, m: string) => void): Promise<void> {
    const execute = async () => {
      let usage = this.readUsage();
      const today = new Date().toISOString().split('T')[0];

      // Inicializa o uso do dia para o modelo, se não existir
      if (!usage[model] || usage[model].date !== today) {
        usage[model] = { date: today, dailyCount: 0, history: [] };
      }

      // Valida o limite MÁXIMO POR DIA (RPD: 10)
      if (usage[model].dailyCount >= 10) {
        throw new Error(`Limite diário de 10 vídeos atingido para o modelo ${model}. Tente novamente amanhã.`);
      }

      // Limpa histórico de requisições mais velhas que 60 segundos
      let now = Date.now();
      usage[model].history = usage[model].history.filter((t: number) => now - t < 60000);

      // Valida o limite MÁXIMO POR MINUTO (RPM: 2)
      if (usage[model].history.length >= 2) {
        const oldest = usage[model].history[0];
        const waitTimeMs = 60000 - (now - oldest) + 2000; // +2s de margem de segurança
        let secondsLeft = Math.ceil(waitTimeMs / 1000);
        
        // Loop apenas para atualizar a interface do usuário com a contagem regressiva
        while (secondsLeft > 0) {
          emit(2, `Fila (Rate Limit): Aguardando liberação em ${secondsLeft}s...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          secondsLeft--;
        }
      }

      // Atualiza o estado após a espera (consome a cota)
      now = Date.now();
      usage = this.readUsage(); // Lê novamente caso outra rotina tenha alterado
      if (!usage[model] || usage[model].date !== today) usage[model] = { date: today, dailyCount: 0, history: [] };
      
      usage[model].history = usage[model].history.filter((t: number) => now - t < 60000);
      usage[model].history.push(now);
      usage[model].dailyCount++;
      
      this.writeUsage(usage);
      emit(4, `Iniciando geração... (Uso hoje: ${usage[model].dailyCount}/10)`);
    };

    // Lógica do Mutex: Encandeia a requisição atual na Promise da anterior.
    // Isso força com que os processamentos do mesmo modelo rodem um por um (fila indiana)
    if (!this.queueMutexes[model]) {
      this.queueMutexes[model] = Promise.resolve();
    }

    const result = this.queueMutexes[model].then(execute);
    // Garante que a fila não engasgue se uma requisição der erro
    this.queueMutexes[model] = result.catch(() => {}); 
    
    return result;
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

  async generateVideo(options: Veo3GenerationOptions): Promise<Veo3GenerationResult> {
    const {
      prompt,
      model = 'veo-3.1-generate-001', // Default model
      aspectRatio = '9:16',
      durationSeconds = 8,
      onProgress,
    } = options;
    const overrideApiKey = options.apiKey?.trim() || null;

    const startTime = Date.now();
    const emit = (percent: number, message: string) => {
      onProgress?.(percent, message);
      console.log(`[Veo3 API] ${percent}% - ${message}`);
    };

    try {
      const {
        ai,
        backend,
        apiKey: resolvedApiKey,
      } = createVideoGenAIClient(overrideApiKey, 'primary');
      emit(5, `Autenticando via ${backend === 'vertex' ? 'Vertex AI' : 'Gemini API'}...`);
      const { project: vertexProject, location: vertexLocation } = getVertexVideoProjectConfig();
      const modelResource = backend === 'vertex'
        ? buildVertexVideoModelResource(model, vertexProject, vertexLocation)
        : model;
      
      // BLOQUEIA AQUI: Aguarda na fila e consome as cotas RPM/RPD antes de continuar
      await this.waitInQueueAndConsume(model, emit);

      const normalizedModel = String(model || '').toLowerCase();
      const isLiteModel = normalizedModel.includes('veo-3.1-lite')
        || normalizedModel.includes('veo 3.1 - lite')
        || normalizedModel.includes('veo 3.1 lite');
      const effectiveIngredientImagePaths = isLiteModel ? [] : (options.ingredientImagePaths || []);
      if (isLiteModel && options.ingredientImagePaths && options.ingredientImagePaths.length > 0) {
        emit(6, 'Veo 3.1 Lite não suporta Ingredients. Usando Frames...');
        console.warn('[Veo3 API] Modelo Lite não suporta ingredients. Ignorando ingredientImagePaths.');
      }

      // Helper para carregar uma imagem (local ou URL) e retornar { imageBytes, mimeType }
      const loadImage = async (imgPath: string): Promise<{ imageBytes: string; mimeType: string }> => {
        let imageBuffer: Buffer;
        if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
          imageBuffer = await new Promise<Buffer>((resolve, reject) => {
            const protocol = imgPath.startsWith('https://') ? https : http;
            const chunks: Buffer[] = [];
            protocol.get(imgPath, (res) => {
              res.on('data', (chunk) => chunks.push(chunk));
              res.on('end', () => resolve(Buffer.concat(chunks)));
              res.on('error', reject);
            }).on('error', reject);
          });
        } else {
          imageBuffer = fs.readFileSync(imgPath);
        }
        const ext = imgPath.toLowerCase().split('.').pop() || 'jpg';
        const mimeMap: Record<string, string> = {
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
        };
        return {
          imageBytes: imageBuffer.toString('base64'),
          mimeType: mimeMap[ext] || 'image/jpeg',
        };
      };

      // Carregar imagens de referência (ingredientes) se fornecidas
      const hasIngredients = effectiveIngredientImagePaths.length > 0;
      let referenceImages: Array<{ image: { imageBytes: string; mimeType: string }; referenceType: string }> | undefined;

      if (hasIngredients) {
        emit(7, `Carregando ${effectiveIngredientImagePaths.length} imagem(ns) de referência...`);
        referenceImages = [];
        for (let i = 0; i < effectiveIngredientImagePaths.length; i++) {
          try {
            const imgData = await loadImage(effectiveIngredientImagePaths[i]);
            referenceImages.push({
              image: imgData,
              referenceType: 'asset',
            });
            emit(8, `Imagem de referência ${i + 1}/${effectiveIngredientImagePaths.length} carregada`);
          } catch (imgErr: any) {
            console.warn(`[Veo3 API] Falha ao carregar imagem de referência ${i + 1}: ${imgErr.message}`);
          }
        }
        if (referenceImages.length === 0) referenceImages = undefined;
      }

      // Carregar imagem singular (image-to-video) se não houver ingredientes
      let imageInput: { imageBytes: string; mimeType: string } | undefined;
      if (!hasIngredients && options.referenceImagePath) {
        emit(7, 'Carregando imagem de referência...');
        try {
          imageInput = await loadImage(options.referenceImagePath);
          emit(9, 'Imagem de referência carregada');
        } catch (imgErr: any) {
          console.warn(`[Veo3 API] Falha ao carregar imagem: ${imgErr.message}`);
        }
      }

      // Define a permissão correta baseada na presença de imagem de referência
      // Veo 3.1 exige 'allow_adult' para imagem-para-vídeo e 'allow_all' para texto-para-vídeo
      const hasAnyImage = !!imageInput || !!referenceImages;
      const hasReferenceImages = !!referenceImages && referenceImages.length > 0;
      const personGen = hasAnyImage ? 'allow_adult' : 'allow_all';

      let operation = await ai.models.generateVideos({
        model: modelResource,
        prompt,
        ...(imageInput ? { image: imageInput } : {}),
        config: {
          numberOfVideos: 1,
          aspectRatio,
          ...(!hasReferenceImages ? { negativePrompt: "Watermark, text, logo, bad quality, low quality" } : {}),
          ...(hasAnyImage ? {} : { resolution: '1080p' }),
          personGeneration: personGen,
          durationSeconds: Math.min(durationSeconds, 8),
          ...(referenceImages ? { referenceImages } : {}),
        },
      } as any);

      emit(10, 'Operação enviada. Aguardando...');

      const timeoutMs = 600_000;
      const pollInterval = 10_000;
      let elapsed = 0;

      while (!operation.done) {
        if (elapsed >= timeoutMs) throw new Error('Timeout de 10 minutos.');
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        elapsed += pollInterval;
        emit(Math.min(85, 10 + Math.round((elapsed / timeoutMs) * 75)), `Aguardando geração... (${Math.round(elapsed / 1000)}s)`);
        operation = await ai.operations.getVideosOperation({ operation });
      }

      emit(90, 'Gerado! Baixando vídeo...');
      operation = await this.refetchCompletedOperation(ai, operation);

      if (operation?.error) {
        throw new Error(`Operação Veo 3 finalizada com erro: ${JSON.stringify(operation.error)}`);
      }

      const generatedVideos = this.extractGeneratedVideos(operation);
      if (!generatedVideos || generatedVideos.length === 0) {
        console.error('[Veo3 API] ❌ API retornou operação sem vídeo. Resposta completa:');
        console.error(JSON.stringify(operation.response, null, 2));
        throw new Error(`Nenhum vídeo foi gerado pela API Veo 3.${this.formatNoVideoDiagnostics(operation)}`);
      }

      const firstVideo = generatedVideos[0]?.video;
      const outputFileName = `veo3-${Date.now()}.mp4`;
      const outputPath = path.join(this.outputDir, outputFileName);

      if (firstVideo?.videoBytes) {
        emit(92, 'Vídeo retornado em bytes. Salvando arquivo...');
        this.writeVideoBytesToFile(firstVideo.videoBytes, outputPath);
      } else {
        const videoUri = firstVideo?.uri;
        if (!videoUri) throw new Error('URI do vídeo está vazia.');
        const normalizedUri = this.normalizeVideoUri(videoUri);
        const downloadUrl = buildVideoDownloadUrl(normalizedUri, resolvedApiKey || null);
        await this.downloadVideo(downloadUrl, outputPath);
      }

      const durationMs = Date.now() - startTime;
      emit(100, `Vídeo salvo (${Math.round(durationMs / 1000)}s)`);

      return { success: true, videoPath: outputPath, durationMs };
    } catch (error: any) {
      const raw = String(error?.message || error || '');
      if (raw.toLowerCase().includes('could not load the default credentials')) {
        return {
          success: false,
          error:
            'Falha de autenticação no Vertex AI: credenciais padrão do Google Cloud não foram encontradas. Configure um JSON de Service Account em Configurações > API e Modelos > Google Vertex AI, ou execute `gcloud auth application-default login`.',
          durationMs: Date.now() - startTime,
        };
      }
      if (raw.includes('RESOURCE_PROJECT_INVALID')) {
        return {
          success: false,
          error:
            'Vertex rejeitou o projeto (RESOURCE_PROJECT_INVALID). Verifique Projeto e Location em Configurações > API e Modelos, ou use ADC (gcloud auth application-default login) com projeto ativo no Vertex.',
          durationMs: Date.now() - startTime,
        };
      }
      if (raw.includes('Download falhou: HTTP 403')) {
        return {
          success: false,
          error:
            'Vídeo foi gerado, mas o download retornou 403 no Cloud Storage. Isso normalmente exige ADC (gcloud auth application-default login) com permissão de leitura no bucket de saída do Vertex.',
          durationMs: Date.now() - startTime,
        };
      }
      return { success: false, error: raw, durationMs: Date.now() - startTime };
    }
  }

  private downloadVideo(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      const protocol = url.startsWith('https://') ? https : http;
      const request = protocol.get(url, (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close(); fs.unlinkSync(destPath);
          return this.downloadVideo(response.headers.location, destPath).then(resolve).catch(reject);
        }
        if (response.statusCode !== 200) {
          file.close(); fs.unlinkSync(destPath); return reject(new Error(`Download falhou: HTTP ${response.statusCode}`));
        }
        response.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      });
      request.on('error', (err) => { file.close(); if (fs.existsSync(destPath)) fs.unlinkSync(destPath); reject(err); });
      file.on('error', (err) => { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); reject(err); });
    });
  }
}

let veo3ServiceInstance: Veo3VideoService | null = null;
export function getVeo3VideoService(): Veo3VideoService {
  if (!veo3ServiceInstance) veo3ServiceInstance = new Veo3VideoService();
  return veo3ServiceInstance;
}
