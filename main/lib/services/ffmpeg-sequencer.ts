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

interface SceneAudioCandidate {
  inputIndex: number;
  sceneId: string | number;
  startTime: number;
  duration: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  playbackTempo: number;
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

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private isLikelyImageSource(source: string): boolean {
    return Boolean(source.match(/\.(png|jpe?g|webp|gif|bmp|tiff|svg)$/i)) || source.startsWith('data:image/');
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

    const scenes = sortedScenes.filter((scene: any) => Number(scene.track ?? 1) === minTrack);
    const overlayScenes = sortedScenes.filter((scene: any) => Number(scene.track ?? 1) > minTrack);
    const orderedOverlays = overlayScenes.slice().sort((a: any, b: any) => {
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

    // Pré-coleta de trilhas de áudio dos clipes de vídeo para evitar erro em arquivos sem stream de áudio.
    const sceneAudioCandidates: SceneAudioCandidate[] = [];
    const audioProbeCache = new Map<string, boolean>();
    let probeInputIndex = 0;

    for (let index = 0; index < scenes.length; index++) {
      const scene = scenes[index];
      const localPath = scene.asset_local_path || scene.asset_url || scene.imageUrl || '';
      const startTime = Number(scene.start_time ?? scene.start ?? 0);
      const endTime = Number(scene.end_time ?? scene.end ?? 0);
      const sceneDefinedDuration = Math.max(0.1, endTime - startTime);

      if (localPath && !this.isLikelyImageSource(localPath)) {
        const hasAudio = await this.probeHasAudioStream(localPath, audioProbeCache);
        if (hasAudio) {
          const baseVolume = this.clamp(Number(scene.audio?.volume ?? 1), 0, 1);
          if (baseVolume > 0) {
            const assetDuration = Number(scene.asset_duration ?? scene.assetDuration ?? 0);
            let playbackTempo = 1;
            if (fitVideoToScene && assetDuration > 0 && sceneDefinedDuration > 0) {
              const speedFactor = sceneDefinedDuration / assetDuration;
              playbackTempo = speedFactor > 0 ? 1 / speedFactor : 1;
            }

            sceneAudioCandidates.push({
              inputIndex: probeInputIndex,
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

    for (let index = 0; index < orderedOverlays.length; index++) {
      const scene = orderedOverlays[index];
      const localPath = scene.asset_local_path || scene.asset_url || scene.imageUrl || '';
      if (!localPath) {
        continue;
      }

      const startTime = Number(scene.start_time ?? scene.start ?? 0);
      const endTime = Number(scene.end_time ?? scene.end ?? 0);
      const overlayDuration = Math.max(0.1, endTime - startTime);

      if (!this.isLikelyImageSource(localPath)) {
        const hasAudio = await this.probeHasAudioStream(localPath, audioProbeCache);
        if (hasAudio) {
          const baseVolume = this.clamp(Number(scene.audio?.volume ?? 1), 0, 1);
          if (baseVolume > 0) {
            const assetDuration = Number(scene.asset_duration ?? scene.assetDuration ?? 0);
            let playbackTempo = 1;
            if (fitVideoToScene && assetDuration > 0 && overlayDuration > 0) {
              const speedFactor = overlayDuration / assetDuration;
              playbackTempo = speedFactor > 0 ? 1 / speedFactor : 1;
            }

            sceneAudioCandidates.push({
              inputIndex: probeInputIndex,
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
        const assetDuration = Number(scene.asset_duration ?? scene.assetDuration ?? 0);
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
        if (fitVideoToScene && assetDuration > 0 && !isActuallyImage && !!localPath) {
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

        const assetDuration = Number(scene.asset_duration ?? scene.assetDuration ?? 0);
        if (fitVideoToScene && assetDuration > 0 && !isActuallyImage) {
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

      sceneAudioCandidates.forEach((candidate, idx) => {
        const duration = Math.max(0.05, candidate.duration);
        const fadeIn = this.clamp(candidate.fadeIn, 0, duration);
        const fadeOut = this.clamp(candidate.fadeOut, 0, duration);
        const fadeOutStart = Math.max(0, duration - fadeOut);
        const delayMs = Math.max(0, Math.round(candidate.startTime * 1000));
        const atempoChain = this.buildAtempoChain(candidate.playbackTempo);
        const audioLabel = `[audio_scene_${idx}]`;

        let audioFilter = `[${candidate.inputIndex}:a]aresample=async=1:first_pts=0,asetpts=PTS-STARTPTS`;
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
        command.input(mainAudioPath);
        const vol = Math.max(0, Number((project.config as any)?.mainAudioVolume ?? 1.0));
        filterComplex.push(
          `[${nextInputIndex}:a]aresample=async=1:first_pts=0,volume=${vol},asetpts=PTS-STARTPTS[audio_main]`,
        );
        audioStreams.push('[audio_main]');
        nextInputIndex++;
      }

      const bgMusic = project.config?.backgroundMusic;
      const bgMusicSrc = (bgMusic as any)?.src_local || bgMusic?.src;
      if (bgMusic && bgMusicSrc && (bgMusicSrc.startsWith('http') || fs.existsSync(bgMusicSrc))) {
        command.input(bgMusicSrc);
        command.inputOptions('-stream_loop', '-1');
        const vol = Math.max(0, Number(bgMusic.volume ?? 0.1));
        filterComplex.push(
          `[${nextInputIndex}:a]aresample=async=1:first_pts=0,volume=${vol},asetpts=PTS-STARTPTS[audio_bg]`,
        );
        audioStreams.push('[audio_bg]');
        nextInputIndex++;
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
        .on('progress', (progress) => {
          const timemarkSeconds = this.parseTimemarkToSeconds(progress.timemark);
          if (timemarkSeconds !== null) {
            highestTimemarkSeconds = Math.max(highestTimemarkSeconds, timemarkSeconds);
          }

          let computedPercent: number | null = null;
          if (highestTimemarkSeconds > 0 && projectDuration > 0) {
            computedPercent = (highestTimemarkSeconds / projectDuration) * 100;
          } else if (typeof progress.percent === 'number' && Number.isFinite(progress.percent)) {
            computedPercent = progress.percent;
          }

          if (computedPercent === null) {
            return;
          }

          const bounded = Math.max(0, Math.min(computedPercent, 99.4));
          const monotonic = Math.max(highestPercentReported, bounded);
          highestPercentReported = monotonic;
          onProgress(monotonic);
        })
        .on('stderr', (stderrLine) => {
          stderrContent += stderrLine + '\n';
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
        .on('progress', (prog) => {
           if (prog.percent) onProgress(prog.percent);
        })
        .on('stderr', (stderrLine) => {
          stderrContent += stderrLine + '\n';
        })
        .on('end', () => resolve(outputPath))
        .on('error', (err) => {
           console.error("FFmpeg Merge Error:", err);
           reject(new Error(`Merge error: ${err.message}\nLog: ${stderrContent.slice(-1000)}`));
        });
    });
  }
}
