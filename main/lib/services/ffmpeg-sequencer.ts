import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { VideoProjectInput } from './video-service';

// Conectar ffmpeg-fluent ao instalador baixado
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

type GpuEncoderType = 'nvenc' | 'amf' | 'qsv' | 'cpu';

let cachedGpuEncoder: GpuEncoderType | null = null;
let gpuEncoderDetectionPromise: Promise<GpuEncoderType> | null = null;
const MAX_STDERR_BUFFER_CHARS = 200_000;

interface SceneAudioCandidate {
  inputIndex: number;
  sourcePath: string;
  sceneId: string | number;
  startTime: number;
  duration: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  playbackTempo: number;
}

interface MediaProbeInfo {
  hasAudio: boolean;
  durationSec: number | null;
}

export class FFmpegSequencer {
  constructor(private outputDir: string, private tempDir: string) {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  }

  private async detectGpuEncoder(): Promise<GpuEncoderType> {
    if (cachedGpuEncoder) {
      return cachedGpuEncoder;
    }

    if (!gpuEncoderDetectionPromise) {
      gpuEncoderDetectionPromise = (async () => {
        try {
          const encodersOutput = execFileSync(
            ffmpegInstaller.path,
            ['-hide_banner', '-encoders'],
            {
              encoding: 'utf8',
              windowsHide: true,
              stdio: ['ignore', 'pipe', 'pipe'],
            },
          );

          if (/\bh264_nvenc\b/i.test(encodersOutput)) {
            return 'nvenc';
          }

          if (/\bh264_amf\b/i.test(encodersOutput)) {
            return 'amf';
          }

          if (/\bh264_qsv\b/i.test(encodersOutput)) {
            return 'qsv';
          }
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          console.warn(`[FFmpeg] Falha ao detectar encoders GPU; fallback CPU. Motivo: ${reason}`);
        }

        return 'cpu';
      })();
    }

    cachedGpuEncoder = await gpuEncoderDetectionPromise;
    gpuEncoderDetectionPromise = null;
    console.log(`[FFmpeg] Encoder detectado: ${cachedGpuEncoder}`);

    return cachedGpuEncoder;
  }

  private getCustomOutputArgs(gpuEncoder: GpuEncoderType): string[] {
    switch (gpuEncoder) {
      case 'nvenc':
        return ['-c:v h264_nvenc', '-preset p4', '-rc vbr', '-cq 20'];
      case 'amf':
        return ['-c:v h264_amf', '-quality balanced', '-qp 20'];
      case 'qsv':
        return ['-c:v h264_qsv', '-global_quality 20'];
      default:
        return ['-vcodec libx264', '-preset:v faster', '-crf 20'];
    }
  }

  private appendToLimitedBuffer(currentBuffer: string, line: string, maxChars = MAX_STDERR_BUFFER_CHARS): string {
    if (!line) {
      return currentBuffer;
    }

    const next = `${currentBuffer}${line}\n`;
    if (next.length <= maxChars) {
      return next;
    }

    return next.slice(-maxChars);
  }

  private shouldFallbackToCpu(err: unknown, stderrContent: string): boolean {
    const errorMessage = err instanceof Error ? err.message : String(err ?? '');
    const combined = `${errorMessage}\n${stderrContent}`.toLowerCase();
    const normalized = combined.trim();

    if (!normalized || normalized === '[object object]') {
      return true;
    }

    return /(nvenc|cuda|amf|qsv|gpu|out of memory|insufficient|resource unavailable|no device|device busy|driver|d3d11|dxva)/i.test(combined);
  }

  private shouldUseStagedPipeline(params: {
    baseSceneCount: number;
    overlayCount: number;
    keepRangeCount: number;
    sceneAudioCount: number;
    projectDurationSeconds: number;
  }): boolean {
    if (params.baseSceneCount >= 28) return true;
    if (params.overlayCount >= 10) return true;
    if (params.keepRangeCount >= 20) return true;
    if (params.sceneAudioCount >= 26) return true;
    if (params.projectDurationSeconds >= 150) return true;
    return false;
  }

  private mapTransition(remotionTransition: string): string {
    const map: Record<string, string> = {
      'fade': 'fade',
      'crossfade': 'fade',
      'slide_left': 'slideleft',
      'slide_right': 'slideright',
      'slide_up': 'slideup',
      'slide_down': 'slidedown',
      'wipe_left': 'wipeleft',
      'wipe_right': 'wiperight',
      'zoom_in': 'zoomin',
      'none': 'none',
    };
    return map[remotionTransition] || 'fade';
  }

  private parseTimemarkToSeconds(timemark?: string): number | null {
    if (!timemark || typeof timemark !== 'string') {
      return null;
    }

    const parts = timemark.trim().split(':');
    if (parts.length !== 3) {
      return null;
    }

    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    const seconds = Number(parts[2].replace(',', '.'));
    if (![hours, minutes, seconds].every(Number.isFinite)) {
      return null;
    }

    return (hours * 3600) + (minutes * 60) + seconds;
  }

  private parseProgressSecondsFromStderrLine(stderrLine: string): number | null {
    if (!stderrLine || typeof stderrLine !== 'string') {
      return null;
    }

    const timeMatch = stderrLine.match(/\btime=\s*([0-9]{2}:[0-9]{2}:[0-9]{2}(?:[.,][0-9]+)?)/i);
    if (!timeMatch || !timeMatch[1]) {
      return null;
    }

    return this.parseTimemarkToSeconds(timeMatch[1]);
  }

  private updateProgressFromStderrLine(params: {
    stderrLine: string;
    totalDurationSeconds: number;
    highestTimemarkSeconds: number;
    highestPercentReported: number;
    onProgress: (percent: number) => void;
    capPercent?: number;
  }): { highestTimemarkSeconds: number; highestPercentReported: number } {
    const timemarkSeconds = this.parseProgressSecondsFromStderrLine(params.stderrLine);
    if (timemarkSeconds === null || !Number.isFinite(params.totalDurationSeconds) || params.totalDurationSeconds <= 0) {
      return {
        highestTimemarkSeconds: params.highestTimemarkSeconds,
        highestPercentReported: params.highestPercentReported,
      };
    }

    const nextHighestTimemarkSeconds = Math.max(params.highestTimemarkSeconds, timemarkSeconds);
    const computedPercent = (nextHighestTimemarkSeconds / params.totalDurationSeconds) * 100;
    const capPercent = params.capPercent ?? 99.4;
    const boundedPercent = Math.max(0, Math.min(computedPercent, capPercent));
    const monotonicPercent = Math.max(params.highestPercentReported, boundedPercent);

    if (monotonicPercent > params.highestPercentReported) {
      params.onProgress(monotonicPercent);
    }

    return {
      highestTimemarkSeconds: nextHighestTimemarkSeconds,
      highestPercentReported: monotonicPercent,
    };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private toPositiveNumber(value: unknown): number | null {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      return null;
    }
    return num;
  }

  private getMediaProbeCacheKey(source: string): string {
    return source.startsWith('http') ? source : path.normalize(source).toLowerCase();
  }

  private isLikelyImageSource(source: string): boolean {
    return Boolean(source.match(/\.(png|jpe?g|webp|gif|bmp|tiff|svg)$/i)) || source.startsWith('data:image/');
  }

  private isLikelyAudioSource(source: string): boolean {
    return Boolean(source.match(/\.(mp3|wav|m4a|aac|ogg|flac|opus|wma|aif|aiff|mka)(\?.*)?$/i)) || source.startsWith('data:audio/');
  }

  private shouldIncludeSceneInVisualPipeline(scene: any): boolean {
    const assetType = String(scene?.assetType ?? scene?.asset_type ?? '').toLowerCase();
    if (assetType === 'audio') {
      return false;
    }

    const localPath = scene?.asset_local_path || scene?.asset_url || scene?.imageUrl || '';
    if (!localPath) {
      return true;
    }

    return !this.isLikelyAudioSource(localPath);
  }

  private isAudioOnlyScene(scene: any, sourcePath: string): boolean {
    const assetType = String(scene?.assetType ?? scene?.asset_type ?? '').toLowerCase();
    if (assetType.startsWith('audio')) {
      return true;
    }

    return this.isLikelyAudioSource(sourcePath);
  }

  private normalizeOutputRange(rawRange: any): { start: number; end: number } | null {
    const start = Math.max(0, Number(rawRange?.outputStart ?? rawRange?.start ?? 0));
    const end = Math.max(start, Number(rawRange?.outputEnd ?? rawRange?.end ?? start));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start <= 0.0001) {
      return null;
    }
    return { start, end };
  }

  private normalizeCompactionKeepRange(rawRange: any): {
    sourceStart: number;
    sourceEnd: number;
    outputStart: number;
    outputEnd: number;
  } | null {
    const sourceStart = Math.max(0, Number(rawRange?.sourceStart ?? 0));
    const sourceEnd = Math.max(sourceStart, Number(rawRange?.sourceEnd ?? sourceStart));
    const outputStart = Math.max(0, Number(rawRange?.outputStart ?? 0));
    const outputEnd = Math.max(outputStart, Number(rawRange?.outputEnd ?? outputStart));

    if (
      !Number.isFinite(sourceStart) ||
      !Number.isFinite(sourceEnd) ||
      !Number.isFinite(outputStart) ||
      !Number.isFinite(outputEnd) ||
      sourceEnd - sourceStart <= 0.0001 ||
      outputEnd - outputStart <= 0.0001
    ) {
      return null;
    }

    return {
      sourceStart,
      sourceEnd,
      outputStart,
      outputEnd,
    };
  }

  private subtractOutputRanges(
    baseRanges: Array<{ start: number; end: number }>,
    cutRanges: Array<{ start: number; end: number }>,
  ): Array<{ start: number; end: number }> {
    let current = baseRanges
      .map((range) => ({
        start: Math.max(0, Number(range.start)),
        end: Math.max(0, Number(range.end)),
      }))
      .filter((range) => range.end - range.start > 0.0001)
      .sort((a, b) => a.start - b.start);

    const cuts = cutRanges
      .map((range) => ({
        start: Math.max(0, Number(range.start)),
        end: Math.max(0, Number(range.end)),
      }))
      .filter((range) => range.end - range.start > 0.0001)
      .sort((a, b) => a.start - b.start);

    for (const cut of cuts) {
      const next: Array<{ start: number; end: number }> = [];

      for (const segment of current) {
        const noOverlap = cut.end <= segment.start + 0.0001 || cut.start >= segment.end - 0.0001;
        if (noOverlap) {
          next.push(segment);
          continue;
        }

        if (cut.start > segment.start + 0.0001) {
          next.push({ start: segment.start, end: Math.min(cut.start, segment.end) });
        }

        if (cut.end < segment.end - 0.0001) {
          next.push({ start: Math.max(cut.end, segment.start), end: segment.end });
        }
      }

      current = next.filter((range) => range.end - range.start > 0.0001);
    }

    return current;
  }

  private buildPrimaryAudioSlices(params: {
    removeAudioSilences: boolean;
    audioKeepRanges: Array<any>;
    audioMutedRanges: Array<any>;
    projectDuration: number;
  }): Array<{
    sourceStart: number;
    sourceEnd: number;
    outputStart: number;
    outputEnd: number;
  }> {
    const mutedOutputRanges = params.audioMutedRanges
      .map((range) => this.normalizeOutputRange(range))
      .filter((range): range is { start: number; end: number } => Boolean(range));

    if (params.removeAudioSilences && params.audioKeepRanges.length > 0) {
      const keepRanges = params.audioKeepRanges
        .map((range) => this.normalizeCompactionKeepRange(range))
        .filter(
          (
            range,
          ): range is {
            sourceStart: number;
            sourceEnd: number;
            outputStart: number;
            outputEnd: number;
          } => Boolean(range),
        )
        .sort((a, b) => a.outputStart - b.outputStart);

      const slices: Array<{
        sourceStart: number;
        sourceEnd: number;
        outputStart: number;
        outputEnd: number;
      }> = [];

      keepRanges.forEach((keepRange) => {
        const unmutedOutputSlices = this.subtractOutputRanges(
          [{ start: keepRange.outputStart, end: keepRange.outputEnd }],
          mutedOutputRanges,
        );

        unmutedOutputSlices.forEach((outputSlice) => {
          const sliceDuration = outputSlice.end - outputSlice.start;
          if (sliceDuration <= 0.0001) {
            return;
          }

          const sourceOffset = outputSlice.start - keepRange.outputStart;
          const sourceStart = keepRange.sourceStart + sourceOffset;
          const sourceEnd = sourceStart + sliceDuration;
          if (sourceEnd - sourceStart <= 0.0001) {
            return;
          }

          slices.push({
            sourceStart,
            sourceEnd,
            outputStart: outputSlice.start,
            outputEnd: outputSlice.end,
          });
        });
      });

      return slices;
    }

    const fullDuration = Math.max(0.1, Number(params.projectDuration || 0));
    const baseOutputSlices = this.subtractOutputRanges([{ start: 0, end: fullDuration }], mutedOutputRanges);

    return baseOutputSlices.map((slice) => ({
      sourceStart: slice.start,
      sourceEnd: slice.end,
      outputStart: slice.start,
      outputEnd: slice.end,
    }));
  }

  private async probeHasAudioStream(source: string, cache: Map<string, boolean>): Promise<boolean> {
    if (!source) {
      return false;
    }

    if (cache.has(source)) {
      return cache.get(source) ?? false;
    }

    const hasAudio = await new Promise<boolean>((resolve) => {
      ffmpeg.ffprobe(source, (err: any, metadata: any) => {
        if (err) {
          console.warn(`[FFmpeg] ffprobe falhou para áudio do asset (${source}): ${err.message || err}`);
          resolve(false);
          return;
        }

        const streams = metadata?.streams;
        const result = Array.isArray(streams) && streams.some((stream: any) => stream?.codec_type === 'audio');
        resolve(Boolean(result));
      });
    });

    cache.set(source, hasAudio);
    return hasAudio;
  }

  private async probeMediaInfo(source: string, cache: Map<string, MediaProbeInfo>): Promise<MediaProbeInfo> {
    const emptyResult: MediaProbeInfo = { hasAudio: false, durationSec: null };
    if (!source) {
      return emptyResult;
    }

    const key = this.getMediaProbeCacheKey(source);
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }

    const result = await new Promise<MediaProbeInfo>((resolve) => {
      ffmpeg.ffprobe(source, (err: any, metadata: any) => {
        if (err) {
          console.warn(`[FFmpeg] ffprobe falhou para asset (${source}): ${err.message || err}`);
          resolve(emptyResult);
          return;
        }

        const streams = Array.isArray(metadata?.streams) ? metadata.streams : [];
        const hasAudio = streams.some((stream: any) => stream?.codec_type === 'audio');

        const durationFromFormat = this.toPositiveNumber(metadata?.format?.duration);
        const durationFromStream = streams
          .map((stream: any) => this.toPositiveNumber(stream?.duration))
          .find((duration: number | null): duration is number => duration !== null);

        resolve({
          hasAudio,
          durationSec: durationFromFormat ?? durationFromStream ?? null,
        });
      });
    });

    cache.set(key, result);
    return result;
  }

  private resolveAssetDurationSeconds(params: {
    scene: any;
    sceneDefinedDuration: number;
    sourcePath?: string;
    mediaProbeCache: Map<string, MediaProbeInfo>;
  }): number | null {
    const { scene, sceneDefinedDuration, sourcePath, mediaProbeCache } = params;

    if (sourcePath) {
      const cached = mediaProbeCache.get(this.getMediaProbeCacheKey(sourcePath));
      const probedDuration = this.toPositiveNumber(cached?.durationSec);
      if (probedDuration !== null) {
        return probedDuration;
      }
    }

    const rawDuration = this.toPositiveNumber(scene?.asset_duration ?? scene?.assetDuration);
    if (rawDuration === null) {
      return null;
    }

    // Fallback para projetos legados onde asset_duration foi salvo em milissegundos.
    const msCandidate = rawDuration / 1000;
    if (rawDuration >= 1000 && msCandidate >= 0.1) {
      const rawDelta = sceneDefinedDuration > 0 ? Math.abs(rawDuration - sceneDefinedDuration) : Number.POSITIVE_INFINITY;
      const msDelta = sceneDefinedDuration > 0 ? Math.abs(msCandidate - sceneDefinedDuration) : Number.POSITIVE_INFINITY;
      const looksLikeMilliseconds = msDelta + 0.05 < rawDelta && msCandidate <= 600;
      if (looksLikeMilliseconds) {
        return msCandidate;
      }
    }

    return rawDuration;
  }

  private buildAtempoChain(rawTempo: number): string {
    const tempo = Number.isFinite(rawTempo) && rawTempo > 0 ? rawTempo : 1;
    if (Math.abs(tempo - 1) < 0.0001) {
      return '';
    }

    const filters: string[] = [];
    let remaining = tempo;

    while (remaining > 2) {
      filters.push('atempo=2');
      remaining /= 2;
    }

    while (remaining < 0.5) {
      filters.push('atempo=0.5');
      remaining *= 2;
    }

    filters.push(`atempo=${remaining.toFixed(6)}`);
    return filters.join(',');
  }

  private async renderVideoOnlyPass(params: {
    scenes: any[];
    orderedOverlays: any[];
    mediaProbeCache: Map<string, MediaProbeInfo>;
    width: number;
    height: number;
    fps: number;
    fitVideoToScene: boolean;
    projectDuration: number;
    encoder: GpuEncoderType;
    outputPath: string;
    onProgress: (percent: number) => void;
  }): Promise<void> {
    const customOutputArgs = this.getCustomOutputArgs(params.encoder);

    return new Promise((resolve, reject) => {
      const command = ffmpeg();
      const filterComplex: string[] = [];
      const filterScriptPath = path.join(
        this.tempDir,
        `ffmpeg-video-only-filter-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.txt`,
      );

      const bypassEncoderProbe = (cb: (err: Error | null, encoders: Record<string, unknown>) => void) => cb(null, {});
      (command as any).availableEncoders = bypassEncoderProbe;
      (command as any).getAvailableEncoders = bypassEncoderProbe;

      params.scenes.forEach((scene: any, index: number) => {
        const localPath = scene.asset_local_path || scene.asset_url || scene.imageUrl || '';

        const startTime = Number(scene.start_time ?? scene.start ?? 0);
        const endTime = Number(scene.end_time ?? scene.end ?? 0);
        const sceneDefinedDuration = Math.max(0.1, endTime - startTime);

        const isLastScene = index === params.scenes.length - 1;
        const nextScene = isLastScene ? null : params.scenes[index + 1];
        const nextStart = nextScene ? Number(nextScene.start_time ?? nextScene.start ?? endTime) : endTime;
        const outTransitionDur = nextScene ? Number(nextScene.transition_duration ?? nextScene.transitionDuration ?? 0) : 0;
        const requiredStreamDuration = Math.max(0.1, (nextStart - startTime) + outTransitionDur);

        if (!localPath) {
          const emotion = scene.visual_concept?.emotion || scene.emotion || 'black';
          const validColors = ['black', 'white', 'red', 'green', 'blue', 'yellow', 'purple', 'gray', 'pink', 'orange'];
          const pickedColor = validColors.includes(emotion) ? emotion : 'black';
          command.input(`color=c=${pickedColor}:s=${params.width}x${params.height}:r=${params.fps}:d=${requiredStreamDuration}`);
          command.inputOptions('-f', 'lavfi');
        } else {
          command.input(localPath);
          if (this.isLikelyImageSource(localPath)) {
            command.inputOptions('-loop', '1', '-t', String(requiredStreamDuration + 1));
          }
        }

        const outLabel = `[v${index}]`;
        const isActuallyImage = this.isLikelyImageSource(localPath);
        const assetDuration = this.resolveAssetDurationSeconds({
          scene,
          sceneDefinedDuration,
          sourcePath: localPath,
          mediaProbeCache: params.mediaProbeCache,
        });
        const transform = scene.transform || {};
        const transformScale = this.clamp(Number(transform.scale ?? 1), 0.02, 4);
        const transformPositionX = Number(transform.positionX ?? 0);
        const transformPositionY = Number(transform.positionY ?? 0);
        const hasBaseTransform =
          Math.abs(transformScale - 1) > 0.0001 ||
          Math.abs(transformPositionX) > 0.0001 ||
          Math.abs(transformPositionY) > 0.0001;

        let filter = `[${index}:v]`;
        if (params.fitVideoToScene && assetDuration && !isActuallyImage && !!localPath) {
          const speedFactor = sceneDefinedDuration / assetDuration;
          filter += `setpts=${speedFactor}*PTS,`;
        }

        filter += `scale=${params.width}:${params.height}:force_original_aspect_ratio=decrease,pad=${params.width}:${params.height}:(ow-iw)/2:(oh-ih)/2`;

        if (hasBaseTransform) {
          const transformedW = Math.max(2, Math.round(params.width * transformScale));
          const transformedH = Math.max(2, Math.round(params.height * transformScale));
          const offsetX = (transformPositionX / 100) * params.width;
          const offsetY = (transformPositionY / 100) * params.height;
          filter += `,scale=${transformedW}:${transformedH}:flags=lanczos`;

          if (transformScale >= 1) {
            const maxCropX = Math.max(0, transformedW - params.width);
            const maxCropY = Math.max(0, transformedH - params.height);
            const cropX = this.clamp((maxCropX / 2) - offsetX, 0, maxCropX);
            const cropY = this.clamp((maxCropY / 2) - offsetY, 0, maxCropY);
            filter += `,crop=${params.width}:${params.height}:${cropX.toFixed(3)}:${cropY.toFixed(3)}`;
          } else {
            const padX = ((params.width - transformedW) / 2) + offsetX;
            const padY = ((params.height - transformedH) / 2) + offsetY;
            filter += `,pad=${params.width}:${params.height}:${padX.toFixed(3)}:${padY.toFixed(3)}:black`;
          }
        }

        filter += ',setsar=1,format=yuv420p';

        const cameraMovement = scene.camera_movement || scene.cameraMovement || 'static';
        if (cameraMovement === 'zoom_in_slow' || cameraMovement === 'zoom_in_fast') {
          filter += `,zoompan=z='min(1+0.0015*in,1.5)':d=1:s=${params.width}x${params.height}`;
        } else if (cameraMovement === 'zoom_out_slow') {
          filter += `,zoompan=z='max(1.5-0.0015*in,1)':d=1:s=${params.width}x${params.height}`;
        }

        filter += `,tpad=stop_mode=add:stop=-1:color=black,trim=duration=${requiredStreamDuration}`;
        filter += `,fps=${params.fps},setpts=PTS-STARTPTS${outLabel}`;
        filterComplex.push(filter);
      });

      let lastOutputLabel = '[v0]';
      if (params.scenes.length > 1) {
        for (let i = 1; i < params.scenes.length; i++) {
          const scene = params.scenes[i];
          const startTime = Number(scene.start_time ?? scene.start ?? 0);
          const transition = scene.transition || 'fade';
          const mappedTransition = this.mapTransition(transition);
          const transitionDur = Number(scene.transition_duration ?? scene.transitionDuration ?? 0);
          const newOutLabel = `[merge${i}]`;

          if (mappedTransition === 'none' || transitionDur <= 0 || Number.isNaN(transitionDur)) {
            filterComplex.push(`${lastOutputLabel}[v${i}]concat=n=2:v=1:a=0${newOutLabel}`);
          } else {
            filterComplex.push(
              `${lastOutputLabel}[v${i}]xfade=transition=${mappedTransition}:duration=${transitionDur}:offset=${startTime}${newOutLabel}`,
            );
          }

          lastOutputLabel = newOutLabel;
        }
      }

      let overlayInputIndex = params.scenes.length;
      let overlayCounter = 0;
      params.orderedOverlays.forEach((scene: any) => {
        const localPath = scene.asset_local_path || scene.asset_url || scene.imageUrl || '';
        if (!localPath) return;

        const startTime = Number(scene.start_time ?? scene.start ?? 0);
        const endTime = Number(scene.end_time ?? scene.end ?? 0);
        const overlayDuration = Math.max(0.1, endTime - startTime);

        command.input(localPath);
        const isActuallyImage = this.isLikelyImageSource(localPath);
        if (isActuallyImage) {
          command.inputOptions('-loop', '1', '-t', String(overlayDuration + 1));
        }

        const transform = scene.transform || {};
        const scale = this.clamp(Number(transform.scale ?? 1), 0.02, 4);
        const opacity = this.clamp(Number(transform.opacity ?? 1), 0, 1);
        const positionX = Number(transform.positionX ?? 0);
        const positionY = Number(transform.positionY ?? 0);
        const maxOverlayW = Math.max(2, Math.round(params.width * scale));
        const maxOverlayH = Math.max(2, Math.round(params.height * scale));
        let overlayFilter = `[${overlayInputIndex}:v]`;

        const assetDuration = this.resolveAssetDurationSeconds({
          scene,
          sceneDefinedDuration: overlayDuration,
          sourcePath: localPath,
          mediaProbeCache: params.mediaProbeCache,
        });
        if (params.fitVideoToScene && assetDuration && !isActuallyImage) {
          const speedFactor = overlayDuration / assetDuration;
          overlayFilter += `setpts=${speedFactor}*PTS,`;
        }

        overlayFilter += `scale=${maxOverlayW}:${maxOverlayH}:force_original_aspect_ratio=decrease`;
        overlayFilter += opacity < 0.999 ? `,format=rgba,colorchannelmixer=aa=${opacity}` : ',format=rgba';
        overlayFilter +=
          `,tpad=stop_mode=clone:stop=-1` +
          `,trim=duration=${overlayDuration}` +
          `,fps=${params.fps}` +
          `,setpts=PTS-STARTPTS+${startTime.toFixed(6)}/TB[ov${overlayCounter}]`;
        filterComplex.push(overlayFilter);

        const offsetX = ((positionX / 100) * params.width).toFixed(3);
        const offsetY = ((positionY / 100) * params.height).toFixed(3);
        const overlayOutLabel = `[ovmerge${overlayCounter}]`;
        filterComplex.push(
          `${lastOutputLabel}[ov${overlayCounter}]` +
          `overlay=x=(W-w)/2+${offsetX}:y=(H-h)/2+${offsetY}:enable='between(t,${startTime.toFixed(3)},${endTime.toFixed(3)})'` +
          `${overlayOutLabel}`,
        );

        lastOutputLabel = overlayOutLabel;
        overlayInputIndex++;
        overlayCounter++;
      });

      const finalVideoLabel = '[vfinal]';
      filterComplex.push(`${lastOutputLabel}trim=duration=${params.projectDuration},setpts=PTS-STARTPTS${finalVideoLabel}`);
      lastOutputLabel = finalVideoLabel;

      fs.writeFileSync(filterScriptPath, filterComplex.join(';\n'), 'utf8');

      command.outputOptions([
        '-filter_complex_script',
        filterScriptPath,
        `-map ${lastOutputLabel}`,
        ...customOutputArgs,
        '-pix_fmt yuv420p',
        '-fps_mode cfr',
        `-r ${params.fps}`,
        '-movflags +faststart',
        '-max_muxing_queue_size 8192',
        '-max_interleave_delta 0',
        `-t ${params.projectDuration.toFixed(3)}`,
        '-an',
      ]);

      let stderrContent = '';
      let highestPercentReported = 0;
      let highestTimemarkSeconds = 0;

      command
        .save(params.outputPath)
        .on('stderr', (stderrLine) => {
          const line = String(stderrLine ?? '');
          stderrContent = this.appendToLimitedBuffer(stderrContent, line);
          const progressState = this.updateProgressFromStderrLine({
            stderrLine: line,
            totalDurationSeconds: params.projectDuration,
            highestTimemarkSeconds,
            highestPercentReported,
            onProgress: params.onProgress,
          });
          highestTimemarkSeconds = progressState.highestTimemarkSeconds;
          highestPercentReported = progressState.highestPercentReported;
        })
        .on('end', () => {
          if (fs.existsSync(filterScriptPath)) {
            try {
              fs.unlinkSync(filterScriptPath);
            } catch (_) {
              // no-op
            }
          }
          params.onProgress(100);
          resolve();
        })
        .on('error', (err) => {
          if (fs.existsSync(filterScriptPath)) {
            try {
              fs.unlinkSync(filterScriptPath);
            } catch (_) {
              // no-op
            }
          }

          const message = err instanceof Error ? err.message : String(err ?? 'Erro desconhecido do FFmpeg');
          reject(new Error(`FFMPEG video-pass error: ${message}\n\nLog: ${stderrContent.slice(-1000)}`));
        });
    });
  }

  private async renderAudioOnlyPass(params: {
    project: VideoProjectInput;
    sceneAudioCandidates: SceneAudioCandidate[];
    removeAudioSilences: boolean;
    audioKeepRanges: Array<any>;
    audioMutedRanges: Array<any>;
    projectDuration: number;
    outputPath: string;
    onProgress: (percent: number) => void;
  }): Promise<boolean> {
    const mainAudioPath = (params.project as any).audioPath;
    const hasMainAudio = Boolean(mainAudioPath && (mainAudioPath.startsWith('http') || fs.existsSync(mainAudioPath)));
    const bgMusic = params.project.config?.backgroundMusic;
    const bgMusicSrc = (bgMusic as any)?.src_local || bgMusic?.src;
    const hasBgMusic = Boolean(bgMusic && bgMusicSrc && (bgMusicSrc.startsWith('http') || fs.existsSync(bgMusicSrc)));

    if (params.sceneAudioCandidates.length === 0 && !hasMainAudio && !hasBgMusic) {
      return false;
    }

    return new Promise((resolve, reject) => {
      const command = ffmpeg();
      const filterComplex: string[] = [];
      const filterScriptPath = path.join(
        this.tempDir,
        `ffmpeg-audio-only-filter-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.txt`,
      );

      const audioStreams: string[] = [];
      let nextInputIndex = 0;
      const inputIndexByPath = new Map<string, number>();

      const resolveAudioInputIndex = (sourcePath: string): number => {
        const sourceKey = sourcePath.startsWith('http')
          ? sourcePath
          : path.normalize(sourcePath).toLowerCase();
        const existingIndex = inputIndexByPath.get(sourceKey);
        if (existingIndex !== undefined) {
          return existingIndex;
        }

        const inputIndex = nextInputIndex++;
        command.input(sourcePath);
        inputIndexByPath.set(sourceKey, inputIndex);
        return inputIndex;
      };

      const addPrimaryAudioSegments = (
        inputIndex: number,
        volume: number,
        sourceLabel: string,
      ) => {
        const slices = this.buildPrimaryAudioSlices({
          removeAudioSilences: params.removeAudioSilences,
          audioKeepRanges: params.audioKeepRanges,
          audioMutedRanges: params.audioMutedRanges,
          projectDuration: params.projectDuration,
        });

        if (slices.length === 0) {
          return;
        }

        slices.forEach((slice, idx) => {
          const delayMs = Math.max(0, Math.round(slice.outputStart * 1000));
          const audioLabel = `[${sourceLabel}_${idx}]`;

          filterComplex.push(
            `[${inputIndex}:a]` +
            `aresample=async=1:first_pts=0,` +
            `atrim=start=${slice.sourceStart.toFixed(6)}:end=${slice.sourceEnd.toFixed(6)},` +
            `asetpts=PTS-STARTPTS,` +
            `volume=${volume.toFixed(6)},` +
            `adelay=${delayMs}:all=1` +
            `${audioLabel}`,
          );
          audioStreams.push(audioLabel);
        });
      };

      params.sceneAudioCandidates.forEach((candidate, idx) => {
        if (!candidate.sourcePath) {
          return;
        }

        const sourceExists = candidate.sourcePath.startsWith('http') || fs.existsSync(candidate.sourcePath);
        if (!sourceExists) {
          return;
        }

        const inputIndex = resolveAudioInputIndex(candidate.sourcePath);
        const duration = Math.max(0.05, candidate.duration);
        const fadeIn = this.clamp(candidate.fadeIn, 0, duration);
        const fadeOut = this.clamp(candidate.fadeOut, 0, duration);
        const fadeOutStart = Math.max(0, duration - fadeOut);
        const delayMs = Math.max(0, Math.round(candidate.startTime * 1000));
        const atempoChain = this.buildAtempoChain(candidate.playbackTempo);
        const audioLabel = `[audio_scene_${idx}]`;

        let audioFilter = `[${inputIndex}:a]aresample=async=1:first_pts=0,asetpts=PTS-STARTPTS`;
        if (atempoChain) {
          audioFilter += `,${atempoChain}`;
        }
        audioFilter += `,atrim=duration=${duration.toFixed(6)},asetpts=PTS-STARTPTS`;
        if (fadeIn > 0) {
          audioFilter += `,afade=t=in:st=0:d=${fadeIn.toFixed(6)}`;
        }
        if (fadeOut > 0) {
          audioFilter += `,afade=t=out:st=${fadeOutStart.toFixed(6)}:d=${fadeOut.toFixed(6)}`;
        }
        audioFilter += `,volume=${candidate.volume.toFixed(6)},adelay=${delayMs}:all=1${audioLabel}`;
        filterComplex.push(audioFilter);
        audioStreams.push(audioLabel);
      });

      if (hasMainAudio && mainAudioPath) {
        const mainInputIndex = resolveAudioInputIndex(mainAudioPath);
        const vol = Math.max(0, Number((params.project.config as any)?.mainAudioVolume ?? 1.0));
        addPrimaryAudioSegments(mainInputIndex, vol, 'audio_main');
      }

      if (hasBgMusic && bgMusicSrc) {
        const bgInputIndex = resolveAudioInputIndex(bgMusicSrc);
        const vol = Math.max(0, Number(bgMusic?.volume ?? 0.1));
        const shouldTreatAsPrimaryAudio = !hasMainAudio;

        if (shouldTreatAsPrimaryAudio) {
          addPrimaryAudioSegments(bgInputIndex, vol, 'audio_bg');
        } else {
          command.inputOptions('-stream_loop', '-1');
          filterComplex.push(
            `[${bgInputIndex}:a]aresample=async=1:first_pts=0,volume=${vol.toFixed(6)},asetpts=PTS-STARTPTS[audio_bg]`,
          );
          audioStreams.push('[audio_bg]');
        }
      }

      if (audioStreams.length === 0) {
        resolve(false);
        return;
      }

      let finalAudioMap = '';
      if (audioStreams.length === 1) {
        const singleLabel = '[audio_single]';
        filterComplex.push(
          `${audioStreams[0]}atrim=duration=${params.projectDuration.toFixed(6)},asetpts=PTS-STARTPTS${singleLabel}`,
        );
        finalAudioMap = singleLabel;
      } else {
        filterComplex.push(
          `${audioStreams.join('')}` +
          `amix=inputs=${audioStreams.length}:duration=longest:normalize=0,` +
          `aresample=async=1:first_pts=0,atrim=duration=${params.projectDuration.toFixed(6)},asetpts=PTS-STARTPTS[mixed_audio]`,
        );
        finalAudioMap = '[mixed_audio]';
      }

      fs.writeFileSync(filterScriptPath, filterComplex.join(';\n'), 'utf8');

      command.outputOptions([
        '-filter_complex_script',
        filterScriptPath,
        `-map ${finalAudioMap}`,
        '-vn',
        '-c:a aac',
        '-b:a 192k',
        '-movflags +faststart',
        `-t ${params.projectDuration.toFixed(3)}`,
      ]);

      let stderrContent = '';
      let highestPercentReported = 0;
      let highestTimemarkSeconds = 0;

      command
        .save(params.outputPath)
        .on('stderr', (stderrLine) => {
          const line = String(stderrLine ?? '');
          stderrContent = this.appendToLimitedBuffer(stderrContent, line);
          const progressState = this.updateProgressFromStderrLine({
            stderrLine: line,
            totalDurationSeconds: params.projectDuration,
            highestTimemarkSeconds,
            highestPercentReported,
            onProgress: params.onProgress,
          });
          highestTimemarkSeconds = progressState.highestTimemarkSeconds;
          highestPercentReported = progressState.highestPercentReported;
        })
        .on('end', () => {
          if (fs.existsSync(filterScriptPath)) {
            try {
              fs.unlinkSync(filterScriptPath);
            } catch (_) {
              // no-op
            }
          }
          params.onProgress(100);
          resolve(true);
        })
        .on('error', (err) => {
          if (fs.existsSync(filterScriptPath)) {
            try {
              fs.unlinkSync(filterScriptPath);
            } catch (_) {
              // no-op
            }
          }
          const message = err instanceof Error ? err.message : String(err ?? 'Erro desconhecido do FFmpeg');
          reject(new Error(`FFMPEG audio-pass error: ${message}\n\nLog: ${stderrContent.slice(-1000)}`));
        });
    });
  }

  private async muxVideoAndAudio(params: {
    videoPath: string;
    audioPath: string;
    projectDuration: number;
    outputPath: string;
    onProgress: (percent: number) => void;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      let stderrContent = '';
      let highestPercentReported = 0;
      let highestTimemarkSeconds = 0;

      ffmpeg(params.videoPath)
        .input(params.audioPath)
        .outputOptions([
          '-map 0:v:0',
          '-map 1:a:0',
          '-c:v copy',
          '-c:a aac',
          '-b:a 192k',
          '-shortest',
          '-movflags +faststart',
        ])
        .save(params.outputPath)
        .on('stderr', (stderrLine) => {
          const line = String(stderrLine ?? '');
          stderrContent = this.appendToLimitedBuffer(stderrContent, line);
          const progressState = this.updateProgressFromStderrLine({
            stderrLine: line,
            totalDurationSeconds: params.projectDuration,
            highestTimemarkSeconds,
            highestPercentReported,
            onProgress: params.onProgress,
          });
          highestTimemarkSeconds = progressState.highestTimemarkSeconds;
          highestPercentReported = progressState.highestPercentReported;
        })
        .on('end', () => {
          params.onProgress(100);
          resolve();
        })
        .on('error', (err) => {
          const message = err instanceof Error ? err.message : String(err ?? 'Erro desconhecido do FFmpeg');
          reject(new Error(`FFMPEG mux error: ${message}\n\nLog: ${stderrContent.slice(-1000)}`));
        });
    });
  }

  private async buildBaseVideoInStages(params: {
    project: VideoProjectInput;
    outputPath: string;
    onProgress: (percent: number) => void;
    width: number;
    height: number;
    fps: number;
    fitVideoToScene: boolean;
    projectDuration: number;
    scenes: any[];
    orderedOverlays: any[];
    mediaProbeCache: Map<string, MediaProbeInfo>;
    sceneAudioCandidates: SceneAudioCandidate[];
    removeAudioSilences: boolean;
    audioKeepRanges: Array<any>;
    audioMutedRanges: Array<any>;
    preferredEncoder: GpuEncoderType;
  }): Promise<string> {
    const runId = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const tempVisualPath = path.join(this.tempDir, `ffmpeg-visual-${runId}.mp4`);
    const tempAudioPath = path.join(this.tempDir, `ffmpeg-audio-${runId}.m4a`);

    let selectedEncoder: GpuEncoderType = params.preferredEncoder;

    try {
      params.onProgress(0);

      const runVisual = async (encoder: GpuEncoderType) => {
        await this.renderVideoOnlyPass({
          scenes: params.scenes,
          orderedOverlays: params.orderedOverlays,
          mediaProbeCache: params.mediaProbeCache,
          width: params.width,
          height: params.height,
          fps: params.fps,
          fitVideoToScene: params.fitVideoToScene,
          projectDuration: params.projectDuration,
          encoder,
          outputPath: tempVisualPath,
          onProgress: (stagePct) => {
            const bounded = Math.max(0, Math.min(100, stagePct));
            params.onProgress(5 + (bounded * 0.70));
          },
        });
      };

      try {
        await runVisual(selectedEncoder);
      } catch (err) {
        const shouldRetryCpu = selectedEncoder !== 'cpu' && this.shouldFallbackToCpu(err, '');
        if (!shouldRetryCpu) {
          throw err;
        }

        selectedEncoder = 'cpu';
        console.warn('[FFmpeg] Visual pass falhou em GPU. Reexecutando em CPU (pipeline em fases).');
        await runVisual(selectedEncoder);
      }

      const hasAudio = await this.renderAudioOnlyPass({
        project: params.project,
        sceneAudioCandidates: params.sceneAudioCandidates,
        removeAudioSilences: params.removeAudioSilences,
        audioKeepRanges: params.audioKeepRanges,
        audioMutedRanges: params.audioMutedRanges,
        projectDuration: params.projectDuration,
        outputPath: tempAudioPath,
        onProgress: (stagePct) => {
          const bounded = Math.max(0, Math.min(100, stagePct));
          params.onProgress(75 + (bounded * 0.17));
        },
      });

      if (hasAudio) {
        await this.muxVideoAndAudio({
          videoPath: tempVisualPath,
          audioPath: tempAudioPath,
          projectDuration: params.projectDuration,
          outputPath: params.outputPath,
          onProgress: (stagePct) => {
            const bounded = Math.max(0, Math.min(100, stagePct));
            params.onProgress(92 + (bounded * 0.08));
          },
        });
      } else {
        fs.copyFileSync(tempVisualPath, params.outputPath);
      }

      params.onProgress(100);
      return params.outputPath;
    } finally {
      if (fs.existsSync(tempVisualPath)) {
        try {
          fs.unlinkSync(tempVisualPath);
        } catch (_) {
          // no-op
        }
      }

      if (fs.existsSync(tempAudioPath)) {
        try {
          fs.unlinkSync(tempAudioPath);
        } catch (_) {
          // no-op
        }
      }
    }
  }

  /**
   * Pipeline FFmpeg completo:
   * 1. Monta a trilha base (track mais baixo) com câmera/transições.
   * 2. Sobrepõe tracks superiores com scale/posição/opacidade.
   * 3. Mixa áudio dos clipes + narração + música de fundo.
   */
  public async buildBaseVideo(
    project: VideoProjectInput,
    outputPath: string,
    onProgress: (percent: number) => void
  ): Promise<string> {
    const gpuEncoder = await this.detectGpuEncoder();
    const customOutputArgs = this.getCustomOutputArgs(gpuEncoder);

    onProgress(0);

    const width = project.config?.width || 1080;
    const height = project.config?.height || 1920;
    const fps = project.config?.fps || 30;
    const fitVideoToScene = (project.config as any)?.fitVideoToScene ?? (project as any).fitVideoToScene ?? true;
    const removeAudioSilences = (project.config as any)?.removeAudioSilences === true;
    const audioKeepRanges = Array.isArray((project.config as any)?.audioKeepRanges)
      ? (project.config as any).audioKeepRanges
      : [];
    const audioMutedRanges = Array.isArray((project.config as any)?.audioMutedRanges)
      ? (project.config as any).audioMutedRanges
      : [];

    console.log(
      `[FFmpeg] Config de áudio: removeSilences=${removeAudioSilences} keepRanges=${audioKeepRanges.length} mutedRanges=${audioMutedRanges.length}`,
    );

    const rawScenes = project.scenes || (project as any).segments || [];
    const sortedScenes = rawScenes
      .slice()
      .sort((a: any, b: any) => {
        const trackA = Number(a.track ?? 1);
        const trackB = Number(b.track ?? 1);
        if (trackA !== trackB) return trackA - trackB;
        const startA = a.start_time ?? a.start ?? 0;
        const startB = b.start_time ?? b.start ?? 0;
        return startA - startB;
      });

    if (sortedScenes.length === 0) {
      throw new Error('Nenhuma cena encontrada para o FFmpeg sequenciar.');
    }

    const minTrack = sortedScenes.reduce((min: number, scene: any) => {
      const sceneTrack = Number(scene.track ?? 1);
      return Math.min(min, Number.isFinite(sceneTrack) ? sceneTrack : 1);
    }, Number.POSITIVE_INFINITY);

    const baseTrackScenes = sortedScenes.filter((scene: any) => Number(scene.track ?? 1) === minTrack);
    const overlayScenes = sortedScenes.filter((scene: any) => Number(scene.track ?? 1) > minTrack);
    const orderedOverlayScenes = overlayScenes.slice().sort((a: any, b: any) => {
      const trackA = Number(a.track ?? 1);
      const trackB = Number(b.track ?? 1);
      if (trackA !== trackB) return trackA - trackB;
      const startA = Number(a.start_time ?? a.start ?? 0);
      const startB = Number(b.start_time ?? b.start ?? 0);
      return startA - startB;
    });

    const projectDuration = Math.max(
      0.1,
      sortedScenes.reduce((maxEnd: number, scene: any) => {
        const end = Number(scene.end_time ?? scene.end ?? 0);
        return Math.max(maxEnd, Number.isFinite(end) ? end : 0);
      }, 0),
    );

    const scenes = baseTrackScenes.filter((scene: any) => this.shouldIncludeSceneInVisualPipeline(scene));
    const orderedOverlays = orderedOverlayScenes.filter((scene: any) => this.shouldIncludeSceneInVisualPipeline(scene));
    const skippedVisualSceneCount =
      (baseTrackScenes.length - scenes.length) + (orderedOverlayScenes.length - orderedOverlays.length);

    if (scenes.length === 0) {
      scenes.push({
        id: 'fallback-black-scene',
        start_time: 0,
        end_time: projectDuration,
        transition: 'none',
        transition_duration: 0,
        emotion: 'black',
      });
      console.warn('[FFmpeg] Nenhuma cena visual detectada na trilha base; usando fallback de fundo preto.');
    }

    if (skippedVisualSceneCount > 0) {
      console.log(`[FFmpeg] Ignorando ${skippedVisualSceneCount} item(ns) sem stream visual no pipeline de vídeo.`);
    }

    // Pré-coleta de trilhas de áudio dos clipes de vídeo para evitar erro em arquivos sem stream de áudio.
    const mediaProbeCache = new Map<string, MediaProbeInfo>();
    const scenesForProbe = [...baseTrackScenes, ...orderedOverlayScenes];
    for (const scene of scenesForProbe) {
      const localPath = scene.asset_local_path || scene.asset_url || scene.imageUrl || '';
      if (!localPath || this.isLikelyImageSource(localPath)) {
        continue;
      }
      await this.probeMediaInfo(localPath, mediaProbeCache);
    }

    const sceneAudioCandidates: SceneAudioCandidate[] = [];
    let probeInputIndex = 0;

    for (let index = 0; index < baseTrackScenes.length; index++) {
      const scene = baseTrackScenes[index];
      const localPath = scene.asset_local_path || scene.asset_url || scene.imageUrl || '';
      const startTime = Number(scene.start_time ?? scene.start ?? 0);
      const endTime = Number(scene.end_time ?? scene.end ?? 0);
      const sceneDefinedDuration = Math.max(0.1, endTime - startTime);

      if (localPath && !this.isLikelyImageSource(localPath)) {
        const mediaInfo = await this.probeMediaInfo(localPath, mediaProbeCache);
        if (mediaInfo.hasAudio) {
          const baseVolume = this.clamp(Number(scene.audio?.volume ?? 1), 0, 1);
          if (baseVolume > 0) {
            const assetDuration = this.resolveAssetDurationSeconds({
              scene,
              sceneDefinedDuration,
              sourcePath: localPath,
              mediaProbeCache,
            });
            let playbackTempo = 1;
            const isAudioOnly = this.isAudioOnlyScene(scene, localPath);
            if (fitVideoToScene && assetDuration && sceneDefinedDuration > 0 && !isAudioOnly) {
              const speedFactor = sceneDefinedDuration / assetDuration;
              playbackTempo = speedFactor > 0 ? 1 / speedFactor : 1;
            }

            sceneAudioCandidates.push({
              inputIndex: probeInputIndex,
              sourcePath: localPath,
              sceneId: scene.id ?? `base-${index}`,
              startTime,
              duration: sceneDefinedDuration,
              volume: baseVolume,
              fadeIn: Math.max(0, Number(scene.audio?.fadeIn ?? 0)),
              fadeOut: Math.max(0, Number(scene.audio?.fadeOut ?? 0)),
              playbackTempo,
            });
          }
        }
      }

      probeInputIndex++;
    }

    for (let index = 0; index < orderedOverlayScenes.length; index++) {
      const scene = orderedOverlayScenes[index];
      const localPath = scene.asset_local_path || scene.asset_url || scene.imageUrl || '';
      if (!localPath) {
        continue;
      }

      const startTime = Number(scene.start_time ?? scene.start ?? 0);
      const endTime = Number(scene.end_time ?? scene.end ?? 0);
      const overlayDuration = Math.max(0.1, endTime - startTime);

      if (!this.isLikelyImageSource(localPath)) {
        const mediaInfo = await this.probeMediaInfo(localPath, mediaProbeCache);
        if (mediaInfo.hasAudio) {
          const baseVolume = this.clamp(Number(scene.audio?.volume ?? 1), 0, 1);
          if (baseVolume > 0) {
            const assetDuration = this.resolveAssetDurationSeconds({
              scene,
              sceneDefinedDuration: overlayDuration,
              sourcePath: localPath,
              mediaProbeCache,
            });
            let playbackTempo = 1;
            const isAudioOnly = this.isAudioOnlyScene(scene, localPath);
            if (fitVideoToScene && assetDuration && overlayDuration > 0 && !isAudioOnly) {
              const speedFactor = overlayDuration / assetDuration;
              playbackTempo = speedFactor > 0 ? 1 / speedFactor : 1;
            }

            sceneAudioCandidates.push({
              inputIndex: probeInputIndex,
              sourcePath: localPath,
              sceneId: scene.id ?? `overlay-${index}`,
              startTime,
              duration: overlayDuration,
              volume: baseVolume,
              fadeIn: Math.max(0, Number(scene.audio?.fadeIn ?? 0)),
              fadeOut: Math.max(0, Number(scene.audio?.fadeOut ?? 0)),
              playbackTempo,
            });
          }
        }
      }

      probeInputIndex++;
    }

    if (sceneAudioCandidates.length > 0) {
      console.log(`[FFmpeg] Áudio de clipes detectado em ${sceneAudioCandidates.length} cena(s).`);
    }

    const shouldUseStagedPipeline = this.shouldUseStagedPipeline({
      baseSceneCount: scenes.length,
      overlayCount: orderedOverlays.length,
      keepRangeCount: audioKeepRanges.length,
      sceneAudioCount: sceneAudioCandidates.length,
      projectDurationSeconds: projectDuration,
    });

    if (shouldUseStagedPipeline) {
      console.log(
        `[FFmpeg] Usando pipeline em fases (video -> audio -> mux) para reduzir pico de memória. (base=${scenes.length}, overlays=${orderedOverlays.length}, keepRanges=${audioKeepRanges.length}, mutedRanges=${audioMutedRanges.length}, audioCenas=${sceneAudioCandidates.length}, duração=${projectDuration.toFixed(1)}s)`,
      );

      return this.buildBaseVideoInStages({
        project,
        outputPath,
        onProgress,
        width,
        height,
        fps,
        fitVideoToScene,
        projectDuration,
        scenes,
        orderedOverlays,
        mediaProbeCache,
        sceneAudioCandidates,
        removeAudioSilences,
        audioKeepRanges,
        audioMutedRanges,
        preferredEncoder: gpuEncoder,
      });
    }

    return new Promise((resolve, reject) => {
      const command = ffmpeg();
      const filterComplex: string[] = [];
      const filterScriptPath = path.join(
        this.tempDir,
        `ffmpeg-filter-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.txt`,
      );

      // Evita spawn extra (`ffmpeg -encoders`) no _prepare do fluent-ffmpeg.
      // Em projetos longos no Windows isso pode estourar ENAMETOOLONG.
      const bypassEncoderProbe = (cb: (err: Error | null, encoders: Record<string, unknown>) => void) => cb(null, {});
      (command as any).availableEncoders = bypassEncoderProbe;
      (command as any).getAvailableEncoders = bypassEncoderProbe;

      // Cada cena pode ter imagem, vídeo, ou cor sólida
      scenes.forEach((scene: any, index: number) => {
        const localPath = scene.asset_local_path || scene.asset_url || scene.imageUrl || '';

        const startTime = Number(scene.start_time ?? scene.start ?? 0);
        const endTime = Number(scene.end_time ?? scene.end ?? 0);
        const sceneDefinedDuration = Math.max(0.1, endTime - startTime);

        const isLastScene = index === scenes.length - 1;
        const nextScene = isLastScene ? null : scenes[index + 1];
        const nextStart = nextScene ? Number(nextScene.start_time ?? nextScene.start ?? endTime) : endTime;

        // A transição que afeta o FIM desta cena é a transição parametrizada na ENTRADA da cena SEGUINTE
        const outTransitionDur = nextScene ? Number(nextScene.transition_duration ?? nextScene.transitionDuration ?? 0) : 0;

        // Quadros exigidos: tempo da própria cena + gap do narrador respirando (se houver) + gordura (overlap) para o crossfade!
        const requiredStreamDuration = Math.max(0.1, (nextStart - startTime) + outTransitionDur);

        if (!localPath) {
          const emotion = scene.visual_concept?.emotion || scene.emotion || 'black';
          const validColors = ['black', 'white', 'red', 'green', 'blue', 'yellow', 'purple', 'gray', 'pink', 'orange'];
          let pickedColor = 'black';
          if (validColors.includes(emotion)) pickedColor = emotion;

          command.input(`color=c=${pickedColor}:s=${width}x${height}:r=${fps}:d=${requiredStreamDuration}`);
          command.inputOptions('-f', 'lavfi');
        } else {
          command.input(localPath);
          const isActuallyImage = this.isLikelyImageSource(localPath);
          if (isActuallyImage) {
            command.inputOptions('-loop', '1', '-t', String(requiredStreamDuration + 1));
          }
        }

        const inputIndex = index;
        const outLabel = `[v${index}]`;

        const isActuallyImage = this.isLikelyImageSource(localPath);
        const assetDuration = this.resolveAssetDurationSeconds({
          scene,
          sceneDefinedDuration,
          sourcePath: localPath,
          mediaProbeCache,
        });
        const transform = scene.transform || {};
        const transformScale = this.clamp(Number(transform.scale ?? 1), 0.02, 4);
        const transformPositionX = Number(transform.positionX ?? 0);
        const transformPositionY = Number(transform.positionY ?? 0);
        const hasBaseTransform =
          Math.abs(transformScale - 1) > 0.0001 ||
          Math.abs(transformPositionX) > 0.0001 ||
          Math.abs(transformPositionY) > 0.0001;

        let filter = `[${inputIndex}:v]`;

        // 1. Ajuste matemático de velocidade (Fit Video To Scene)
        if (fitVideoToScene && assetDuration && !isActuallyImage && !!localPath) {
          const speedFactor = sceneDefinedDuration / assetDuration;
          filter += `setpts=${speedFactor}*PTS,`;
        }

        // 2. Escala Espacial Uniforme
        filter += `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;

        // 2.1 Transformação (zoom/posição) também para a trilha base
        if (hasBaseTransform) {
          const transformedW = Math.max(2, Math.round(width * transformScale));
          const transformedH = Math.max(2, Math.round(height * transformScale));
          const offsetX = (transformPositionX / 100) * width;
          const offsetY = (transformPositionY / 100) * height;

          filter += `,scale=${transformedW}:${transformedH}:flags=lanczos`;

          if (transformScale >= 1) {
            const maxCropX = Math.max(0, transformedW - width);
            const maxCropY = Math.max(0, transformedH - height);
            const cropX = this.clamp((maxCropX / 2) - offsetX, 0, maxCropX);
            const cropY = this.clamp((maxCropY / 2) - offsetY, 0, maxCropY);
            filter += `,crop=${width}:${height}:${cropX.toFixed(3)}:${cropY.toFixed(3)}`;
          } else {
            const padX = ((width - transformedW) / 2) + offsetX;
            const padY = ((height - transformedH) / 2) + offsetY;
            filter += `,pad=${width}:${height}:${padX.toFixed(3)}:${padY.toFixed(3)}:black`;
          }
        }

        filter += ',setsar=1,format=yuv420p';

        // 3. Zoom / Crop dinâmico
        const cameraMovement = scene.camera_movement || scene.cameraMovement || 'static';
        if (cameraMovement === 'zoom_in_slow' || cameraMovement === 'zoom_in_fast') {
          filter += `,zoompan=z='min(1+0.0015*in,1.5)':d=1:s=${width}x${height}`;
        } else if (cameraMovement === 'zoom_out_slow') {
          filter += `,zoompan=z='max(1.5-0.0015*in,1)':d=1:s=${width}x${height}`;
        }

        // 4. Preenchimento de Gaps e Timestamps.
        filter += `,tpad=stop_mode=add:stop=-1:color=black,trim=duration=${requiredStreamDuration}`;

        // 5. Restauração FPS + SETPTS no final.
        filter += `,fps=${fps},setpts=PTS-STARTPTS`;
        filter += `${outLabel}`;
        filterComplex.push(filter);
      });

      // Se houver mais de uma cena, encadeia via xfade ou concat baseando no offset exato.
      let lastOutputLabel = '[v0]';
      if (scenes.length > 1) {
        for (let i = 1; i < scenes.length; i++) {
          const scene = scenes[i];
          const startTime = Number(scene.start_time ?? scene.start ?? 0);

          const transition = scene.transition || 'fade';
          const mappedTransition = this.mapTransition(transition);
          const transitionDur = Number(scene.transition_duration ?? scene.transitionDuration ?? 0);

          const newOutLabel = `[merge${i}]`;

          if (mappedTransition === 'none' || transitionDur <= 0 || Number.isNaN(transitionDur)) {
            filterComplex.push(`${lastOutputLabel}[v${i}]concat=n=2:v=1:a=0${newOutLabel}`);
          } else {
            const offset = startTime;
            filterComplex.push(
              `${lastOutputLabel}[v${i}]xfade=transition=${mappedTransition}:duration=${transitionDur}:offset=${offset}${newOutLabel}`,
            );
          }

          lastOutputLabel = newOutLabel;
        }
      }

      // Sobreposições (tracks acima da base) diretamente no FFmpeg.
      let overlayInputIndex = scenes.length;
      let overlayCounter = 0;
      orderedOverlays.forEach((scene: any) => {
        const localPath = scene.asset_local_path || scene.asset_url || scene.imageUrl || '';
        if (!localPath) return;

        const startTime = Number(scene.start_time ?? scene.start ?? 0);
        const endTime = Number(scene.end_time ?? scene.end ?? 0);
        const overlayDuration = Math.max(0.1, endTime - startTime);

        command.input(localPath);
        const isActuallyImage = this.isLikelyImageSource(localPath);
        if (isActuallyImage) {
          command.inputOptions('-loop', '1', '-t', String(overlayDuration + 1));
        }

        const transform = scene.transform || {};
        const scale = this.clamp(Number(transform.scale ?? 1), 0.02, 4);
        const opacity = this.clamp(Number(transform.opacity ?? 1), 0, 1);
        const positionX = Number(transform.positionX ?? 0);
        const positionY = Number(transform.positionY ?? 0);

        const maxOverlayW = Math.max(2, Math.round(width * scale));
        const maxOverlayH = Math.max(2, Math.round(height * scale));

        let overlayFilter = `[${overlayInputIndex}:v]`;

        const assetDuration = this.resolveAssetDurationSeconds({
          scene,
          sceneDefinedDuration: overlayDuration,
          sourcePath: localPath,
          mediaProbeCache,
        });
        if (fitVideoToScene && assetDuration && !isActuallyImage) {
          const speedFactor = overlayDuration / assetDuration;
          overlayFilter += `setpts=${speedFactor}*PTS,`;
        }

        overlayFilter += `scale=${maxOverlayW}:${maxOverlayH}:force_original_aspect_ratio=decrease`;
        overlayFilter += opacity < 0.999 ? `,format=rgba,colorchannelmixer=aa=${opacity}` : ',format=rgba';
        overlayFilter +=
          `,tpad=stop_mode=clone:stop=-1` +
          `,trim=duration=${overlayDuration}` +
          `,fps=${fps}` +
          `,setpts=PTS-STARTPTS+${startTime.toFixed(6)}/TB[ov${overlayCounter}]`;
        filterComplex.push(overlayFilter);

        const offsetX = ((positionX / 100) * width).toFixed(3);
        const offsetY = ((positionY / 100) * height).toFixed(3);
        const overlayOutLabel = `[ovmerge${overlayCounter}]`;
        filterComplex.push(
          `${lastOutputLabel}[ov${overlayCounter}]` +
          `overlay=x=(W-w)/2+${offsetX}:y=(H-h)/2+${offsetY}:enable='between(t,${startTime.toFixed(3)},${endTime.toFixed(3)})'` +
          `${overlayOutLabel}`,
        );

        lastOutputLabel = overlayOutLabel;
        overlayInputIndex++;
        overlayCounter++;
      });

      // Áudio: clipes de vídeo + trilhas globais (narração/música).
      let nextInputIndex = overlayInputIndex;
      const audioStreams: string[] = [];
      const getPathKey = (sourcePath: string): string => (
        sourcePath.startsWith('http') ? sourcePath : path.normalize(sourcePath).toLowerCase()
      );
      const candidateInputIndexByPath = new Map<string, number>();
      const resolveSceneAudioInputIndex = (sourcePath: string): number => {
        const key = getPathKey(sourcePath);
        const existingIndex = candidateInputIndexByPath.get(key);
        if (existingIndex !== undefined) {
          return existingIndex;
        }

        const inputIndex = nextInputIndex;
        command.input(sourcePath);
        nextInputIndex++;
        candidateInputIndexByPath.set(key, inputIndex);
        return inputIndex;
      };
      const addPrimaryAudioSegments = (
        inputIndex: number,
        volume: number,
        sourceLabel: string,
      ) => {
        const slices = this.buildPrimaryAudioSlices({
          removeAudioSilences,
          audioKeepRanges,
          audioMutedRanges,
          projectDuration,
        });

        if (slices.length === 0) {
          return;
        }

        slices.forEach((slice, idx) => {
          const delayMs = Math.max(0, Math.round(slice.outputStart * 1000));
          const audioLabel = `[${sourceLabel}_${idx}]`;

          filterComplex.push(
            `[${inputIndex}:a]` +
            `aresample=async=1:first_pts=0,` +
            `atrim=start=${slice.sourceStart.toFixed(6)}:end=${slice.sourceEnd.toFixed(6)},` +
            `asetpts=PTS-STARTPTS,` +
            `volume=${volume.toFixed(6)},` +
            `adelay=${delayMs}:all=1` +
            `${audioLabel}`,
          );
          audioStreams.push(audioLabel);
        });
      };

      sceneAudioCandidates.forEach((candidate, idx) => {
        const sourcePath = candidate.sourcePath || '';
        if (!sourcePath) {
          return;
        }
        const sourceExists = sourcePath.startsWith('http') || fs.existsSync(sourcePath);
        if (!sourceExists) {
          return;
        }

        const sceneInputIndex = resolveSceneAudioInputIndex(sourcePath);
        const duration = Math.max(0.05, candidate.duration);
        const fadeIn = this.clamp(candidate.fadeIn, 0, duration);
        const fadeOut = this.clamp(candidate.fadeOut, 0, duration);
        const fadeOutStart = Math.max(0, duration - fadeOut);
        const delayMs = Math.max(0, Math.round(candidate.startTime * 1000));
        const atempoChain = this.buildAtempoChain(candidate.playbackTempo);
        const audioLabel = `[audio_scene_${idx}]`;

        let audioFilter = `[${sceneInputIndex}:a]aresample=async=1:first_pts=0,asetpts=PTS-STARTPTS`;
        if (atempoChain) {
          audioFilter += `,${atempoChain}`;
        }
        audioFilter += `,atrim=duration=${duration.toFixed(6)},asetpts=PTS-STARTPTS`;
        if (fadeIn > 0) {
          audioFilter += `,afade=t=in:st=0:d=${fadeIn.toFixed(6)}`;
        }
        if (fadeOut > 0) {
          audioFilter += `,afade=t=out:st=${fadeOutStart.toFixed(6)}:d=${fadeOut.toFixed(6)}`;
        }
        audioFilter += `,volume=${candidate.volume.toFixed(6)},adelay=${delayMs}:all=1${audioLabel}`;
        filterComplex.push(audioFilter);
        audioStreams.push(audioLabel);
      });

      const mainAudioPath = (project as any).audioPath;
      if (mainAudioPath && (mainAudioPath.startsWith('http') || fs.existsSync(mainAudioPath))) {
        const key = getPathKey(mainAudioPath);
        const reusedInputIndex = candidateInputIndexByPath.get(key);
        const mainInputIndex = reusedInputIndex ?? nextInputIndex;
        if (reusedInputIndex === undefined) {
          command.input(mainAudioPath);
          nextInputIndex++;
        }
        const vol = Math.max(0, Number((project.config as any)?.mainAudioVolume ?? 1.0));
        addPrimaryAudioSegments(mainInputIndex, vol, 'audio_main');
      }

      const bgMusic = project.config?.backgroundMusic;
      const bgMusicSrc = (bgMusic as any)?.src_local || bgMusic?.src;
      if (bgMusic && bgMusicSrc && (bgMusicSrc.startsWith('http') || fs.existsSync(bgMusicSrc))) {
        const key = getPathKey(bgMusicSrc);
        const reusedInputIndex = candidateInputIndexByPath.get(key);
        const bgInputIndex = reusedInputIndex ?? nextInputIndex;
        if (reusedInputIndex === undefined) {
          command.input(bgMusicSrc);
          nextInputIndex++;
        }
        const vol = Math.max(0, Number(bgMusic.volume ?? 0.1));
        const shouldTreatAsPrimaryAudio = !mainAudioPath;

        if (shouldTreatAsPrimaryAudio) {
          addPrimaryAudioSegments(bgInputIndex, vol, 'audio_bg');
        } else {
          // stream_loop só funciona no input recém-adicionado.
          if (reusedInputIndex === undefined) {
            command.inputOptions('-stream_loop', '-1');
          }
          filterComplex.push(
            `[${bgInputIndex}:a]aresample=async=1:first_pts=0,volume=${vol.toFixed(6)},asetpts=PTS-STARTPTS[audio_bg]`,
          );
          audioStreams.push('[audio_bg]');
        }
      }

      let finalAudioMap = '';
      if (audioStreams.length === 1) {
        const singleLabel = '[audio_single]';
        filterComplex.push(
          `${audioStreams[0]}atrim=duration=${projectDuration.toFixed(6)},asetpts=PTS-STARTPTS${singleLabel}`,
        );
        finalAudioMap = singleLabel;
      } else if (audioStreams.length > 1) {
        filterComplex.push(
          `${audioStreams.join('')}` +
          `amix=inputs=${audioStreams.length}:duration=longest:normalize=0,` +
          `aresample=async=1:first_pts=0,atrim=duration=${projectDuration.toFixed(6)},asetpts=PTS-STARTPTS[mixed_audio]`,
        );
        finalAudioMap = '[mixed_audio]';
      }

      // Constrói stream final de vídeo com duração explícita para evitar drift na etapa de mux.
      const finalVideoLabel = '[vfinal]';
      filterComplex.push(`${lastOutputLabel}trim=duration=${projectDuration},setpts=PTS-STARTPTS${finalVideoLabel}`);
      lastOutputLabel = finalVideoLabel;

      fs.writeFileSync(filterScriptPath, filterComplex.join(';\n'), 'utf8');

      const outOptions = [
        '-filter_complex_script',
        filterScriptPath,
        `-map ${lastOutputLabel}`,
        ...customOutputArgs,
        '-pix_fmt yuv420p',
        '-fps_mode cfr',
        `-r ${fps}`,
        '-movflags +faststart',
        '-max_muxing_queue_size 8192',
        '-max_interleave_delta 0',
        `-t ${projectDuration.toFixed(3)}`,
      ];

      if (finalAudioMap) {
        outOptions.push(`-map ${finalAudioMap}`);
        outOptions.push('-c:a aac', '-b:a 192k');
      }

      command.outputOptions(outOptions);

      let stderrContent = '';
      let highestPercentReported = 0;
      let highestTimemarkSeconds = 0;

      command
        .save(outputPath)
        .on('stderr', (stderrLine) => {
          const line = String(stderrLine ?? '');
          stderrContent = this.appendToLimitedBuffer(stderrContent, line);
          const progressState = this.updateProgressFromStderrLine({
            stderrLine: line,
            totalDurationSeconds: projectDuration,
            highestTimemarkSeconds,
            highestPercentReported,
            onProgress,
          });
          highestTimemarkSeconds = progressState.highestTimemarkSeconds;
          highestPercentReported = progressState.highestPercentReported;
        })
        .on('end', () => {
          if (fs.existsSync(filterScriptPath)) {
            try {
              fs.unlinkSync(filterScriptPath);
            } catch (_) {
              // no-op
            }
          }
          onProgress(100);
          resolve(outputPath);
        })
        .on('error', (err) => {
          if (fs.existsSync(filterScriptPath)) {
            try {
              fs.unlinkSync(filterScriptPath);
            } catch (_) {
              // no-op
            }
          }
          console.error('FFMPEG Error no Base Video:', err);
          console.error('FFMPEG log:', stderrContent);
          reject(new Error(`FFMPEG error: ${err.message}\n\nLog: ${stderrContent.slice(-1000)}`));
        });
    });
  }

  /**
   * Pipeline Híbrido FASE 3: Junta o base_video gerado com o overlay (.webm) do Remotion
   */
  public async mergeOverlay(
    baseVideoPath: string,
    overlayWebmPath: string,
    outputPath: string,
    onProgress: (percent: number) => void
  ): Promise<string> {
    const gpuEncoder = await this.detectGpuEncoder();
    const customOutputArgs = this.getCustomOutputArgs(gpuEncoder);

    return new Promise((resolve, reject) => {
      onProgress(0);
      
      let stderrContent = '';

      ffmpeg(baseVideoPath)
        .input(overlayWebmPath)
        .complexFilter([
          '[0:v][1:v]overlay=x=0:y=0:shortest=1[outv]'
        ])
        .outputOptions([
          '-map [outv]',
          ...customOutputArgs,
          '-pix_fmt yuv420p'
        ])
        .save(outputPath)
        .on('stderr', (stderrLine) => {
          stderrContent = this.appendToLimitedBuffer(stderrContent, String(stderrLine ?? ''));
        })
        .on('end', () => resolve(outputPath))
        .on('error', (err) => {
           console.error("FFmpeg Merge Error:", err);
           reject(new Error(`Merge error: ${err.message}\nLog: ${stderrContent.slice(-1000)}`));
        });
    });
  }
}
