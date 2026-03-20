import * as fs from 'fs';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { VideoProjectInput } from './video-service';

// Conectar ffmpeg-fluent ao instalador baixado
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export class FFmpegSequencer {
  constructor(private outputDir: string, private tempDir: string) {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
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

  /**
   * Pipeline Híbrido:
   * 1. Renderiza os Overlays Transparentes (.webm)
   * 2. Junta backgrounds de vídeo/imagem aplicando camera movements e crossfades
   * 3. Sobrepõe os Overlays via filter_complex
   */
  /**
   * Pipeline Híbrido FASE 1: Constrói apenas o vídeo base (sem overlays do Remotion)
   * Isso permite falhar rápido (fail fast) caso haja erros no FFmpeg
   * antes de esperar 40min do Remotion.
   */
  public async buildBaseVideo(
    project: VideoProjectInput,
    outputPath: string,
    onProgress: (percent: number) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      onProgress(0);

      const command = ffmpeg();
      const inputs: string[] = [];
      const filterComplex: string[] = [];

      const width = project.config?.width || 1080;
      const height = project.config?.height || 1920;
      const fps = project.config?.fps || 30;

      const rawScenes = project.scenes || (project as any).segments || [];
      
      // Filtrar APENAS a trilha principal (base video/imagens).
      // Sobreposições (track 2, PiP, etc) são ignoradas aqui e delegadas ao Remotion
      const scenes = rawScenes
         .filter((s: any) => !s.track || s.track === 1 || s.track === 0)
         .sort((a: any, b: any) => {
            const startA = a.start_time ?? a.start ?? 0;
            const startB = b.start_time ?? b.start ?? 0;
            return startA - startB;
         });

      if (scenes.length === 0) {
        reject(new Error("Nenhuma cena de base encontrada para o FFmpeg sequenciar."));
        return;
      }

      // Cada cena pode ter imagem, vídeo, ou cor sólida
      scenes.forEach((scene: any, index: number) => {
        let localPath = scene.asset_url || scene.imageUrl || '';
        if (localPath.startsWith('http')) {
           // Em ambiente de desenvolvimento nativo, o ffmpeg pode baixar direto,
           // ou pegar do cache. Aqui assumimos que já resolveu para caminho local.
        }

        const startTime = scene.start_time ?? scene.start ?? 0;
        const endTime = scene.end_time ?? scene.end ?? 0;
        const sceneDefinedDuration = Math.max(0.1, endTime - startTime); // A duração exigida pelo bloco da cena.

        const isLastScene = index === scenes.length - 1;
        const nextScene = isLastScene ? null : scenes[index + 1];
        const nextStart = nextScene ? (nextScene.start_time ?? nextScene.start ?? endTime) : endTime;
        
        // A transição que afeta o FIM desta cena é a transição parametrizada na ENTRADA da cena SEGUINTE
        const outTransitionDur = nextScene ? (nextScene.transition_duration ?? nextScene.transitionDuration ?? 0) : 0;
        
        // Quadros exigidos: tempo da própria cena + gap do narrador respirando (se houver) + gordura (overlap) para o crossfade!
        const requiredStreamDuration = Math.max(0.1, (nextStart - startTime) + outTransitionDur);

        if (!localPath) {
          const emotion = scene.visual_concept?.emotion || scene.emotion || 'black';
          const validColors = ['black', 'white', 'red', 'green', 'blue', 'yellow', 'purple', 'gray', 'pink', 'orange'];
          // mapeamento rústico de cor para emoção, default para black
          let pickedColor = 'black';
          if (validColors.includes(emotion)) pickedColor = emotion;
          
          command.input(`color=c=${pickedColor}:s=${width}x${height}:r=${fps}:d=${requiredStreamDuration}`);
          command.inputOptions('-f', 'lavfi');
        } else {
          command.input(localPath);
          // Validação restrita pela extensão ou cabeçalho do arquivo real
          const isActuallyImage = localPath.match(/\.(png|jpe?g|webp)$/i) || localPath.startsWith('data:image/');
          
          if (isActuallyImage) {
            command.inputOptions('-loop', '1', '-t', String(requiredStreamDuration + 1));
          } else {
            // Apenas carregamos o vídeo nativamente.
          }
        }

        const inputIndex = index;
        const outLabel = `[v${index}]`;

        const isActuallyImage = localPath.match(/\.(png|jpe?g|webp)$/i) || localPath.startsWith('data:image/');
        const assetDuration = scene.asset_duration ?? scene.assetDuration;
        const fitVideo = (project.config as any)?.fitVideoToScene ?? (project as any).fitVideoToScene ?? true;
        
        let filter = `[${inputIndex}:v]`;

        // 1. Ajuste matemático de velocidade (Fit Video To Scene)
        if (fitVideo && assetDuration && assetDuration > 0 && !isActuallyImage && !!localPath) {
           const speedFactor = sceneDefinedDuration / assetDuration;
           filter += `setpts=${speedFactor}*PTS,`;
        }

        // 2. Escala Espacial Uniforme
        filter += `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p`;
        
        // 3. Zoom / Crop dinâmico
        const cameraMovement = scene.camera_movement || scene.cameraMovement || 'static';

        if (cameraMovement === 'zoom_in_slow' || cameraMovement === 'zoom_in_fast') {
          filter += `,zoompan=z='min(1+0.0015*in,1.5)':d=1:s=${width}x${height}`;
        } else if (cameraMovement === 'zoom_out_slow') {
          filter += `,zoompan=z='max(1.5-0.0015*in,1)':d=1:s=${width}x${height}`;
        }

        // 4. Preenchimento de Gaps e Timestamps! O tpad clona o último frame para preencher respirações do narrador!
        filter += `,tpad=stop_mode=clone:stop=-1,trim=duration=${requiredStreamDuration}`;
        
        // 5. Restauração FPS + SETPTS no FINAl! (Após os cortes e efeitos de tempo, garantimos output a 60fps)
        filter += `,fps=${fps},setpts=PTS-STARTPTS`;
        
        filter += `${outLabel}`;
        filterComplex.push(filter);
      });

      // Se houver mais de uma cena, encadeia via xfade ou concat baseando no offset EXATO
      let lastOutputLabel = '[v0]';
      if (scenes.length > 1) {
        for (let i = 1; i < scenes.length; i++) {
          const scene = scenes[i];
          const startTime = scene.start_time ?? scene.start ?? 0;
          
          let transition = scene.transition || 'fade';
          const mappedTransition = this.mapTransition(transition);
          const transitionDur = scene.transition_duration ?? scene.transitionDuration ?? 0;

          const newOutLabel = `[merge${i}]`;

          if (mappedTransition === 'none' || transitionDur <= 0 || isNaN(transitionDur)) {
             // Hard cut: As durações dos streams já estão modeladas para costurar perfeitamente uns aos outros.
             filterComplex.push(`${lastOutputLabel}[v${i}]concat=n=2:v=1:a=0${newOutLabel}`);
          } else {
             // Xfade: O offset global determina ONDE a cena 2 nasce. (Start Absoluto mapeado!)
             const offset = startTime;
             filterComplex.push(`${lastOutputLabel}[v${i}]xfade=transition=${mappedTransition}:duration=${transitionDur}:offset=${offset}${newOutLabel}`);
          }
          
          lastOutputLabel = newOutLabel;
        }
      }

      // Restauração das Trilhas de Áudio Originais (Voz + Música de Fundo) !!
      let nextInputIndex = scenes.length;
      const audioStreams: string[] = [];

      const mainAudioPath = (project as any).audioPath;
      if (mainAudioPath && (mainAudioPath.startsWith('http') || fs.existsSync(mainAudioPath))) {
         command.input(mainAudioPath);
         const vol = (project.config as any)?.mainAudioVolume ?? 1.0;
         filterComplex.push(`[${nextInputIndex}:a]volume=${vol}[audio_main]`);
         audioStreams.push('[audio_main]');
         nextInputIndex++;
      }

      const bgMusic = project.config?.backgroundMusic;
      if (bgMusic && bgMusic.src && (bgMusic.src.startsWith('http') || fs.existsSync(bgMusic.src))) {
         // Usar -stream_loop para alongar músicas curtas
         command.input(bgMusic.src);
         command.inputOptions('-stream_loop', '-1');
         const vol = bgMusic.volume ?? 0.1;
         filterComplex.push(`[${nextInputIndex}:a]volume=${vol}[audio_bg]`);
         audioStreams.push('[audio_bg]');
         nextInputIndex++;
      }

      let finalAudioMap = '';
      if (audioStreams.length === 1) {
         finalAudioMap = audioStreams[0];
      } else if (audioStreams.length > 1) {
         filterComplex.push(`${audioStreams.join('')}amix=inputs=${audioStreams.length}:duration=first:normalize=0[mixed_audio]`);
         finalAudioMap = '[mixed_audio]';
      }

      command.complexFilter(filterComplex.join('; '));

      const outOptions = [
        `-map ${lastOutputLabel}`,
        '-c:v libx264',
        '-preset ultrafast', // Render rápido pro base video
        '-crf 23',
        '-pix_fmt yuv420p',
        '-max_muxing_queue_size 1024', // ✅ Resolve o erro "No space left on device" em cadeias longas de filtros
      ];

      if (finalAudioMap) {
         outOptions.push(`-map ${finalAudioMap}`);
         outOptions.push('-c:a aac', '-b:a 192k', '-shortest');
      }

      // Mapear saída do base video nativo
      command.outputOptions(outOptions);

      let stderrContent = '';

      command
        .save(outputPath)
        .on('progress', (progress) => {
          if (progress.percent !== undefined) {
             onProgress(progress.percent);
          }
        })
        .on('stderr', (stderrLine) => {
          stderrContent += stderrLine + '\n';
        })
        .on('end', () => resolve(outputPath))
        .on('error', (err) => {
          console.error("FFMPEG Error no Base Video:", err);
          console.error("FFMPEG log:", stderrContent);
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
          '-c:v libx264',
          '-preset medium',
          '-crf 23',
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
