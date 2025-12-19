/**
 * Video Project Composition
 * 
 * Composição principal que renderiza um projeto de vídeo completo
 * a partir de um JSON estruturado.
 * 
 * Recebe um VideoProject e renderiza todas as cenas em sequência,
 * aplicando transições, efeitos de câmera e overlays.
 */
import React, { useMemo } from 'react';
import { 
  AbsoluteFill, 
  Audio,
  Sequence, 
  useCurrentFrame, 
  useVideoConfig,
  interpolate,
} from 'remotion';
import { z } from 'zod';
import { 
  VideoProjectSchema, 
  type VideoProject,
  type ProjectConfig,
  calculateProjectDuration,
} from '../types/project';
import { Scene } from '../components/Scene';
import { applyTransition, transitionSecondsToFrames } from '../utils/transitions';
import { ProjectConfigContext } from '../contexts/ProjectConfigContext';

// Schema das props
export const videoProjectCompositionSchema = z.object({
  project: VideoProjectSchema,
});

type VideoProjectCompositionProps = z.infer<typeof videoProjectCompositionSchema>;

export const VideoProjectComposition: React.FC<VideoProjectCompositionProps> = ({
  project,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  
  // Configurações do projeto com tipo correto
  const config: Partial<ProjectConfig> = project.config || {};
  const backgroundColor = config.backgroundColor || '#000000';
  
  // Pré-calcular informações das cenas
  const sceneInfos = useMemo(() => {
    return project.scenes.map((scene, index) => {
      const startFrame = Math.round(scene.start_time * fps);
      const endFrame = Math.round(scene.end_time * fps);
      const baseDuration = endFrame - startFrame;
      const transitionFrames = transitionSecondsToFrames(
        scene.transition_duration || 0.5, 
        fps
      );
      
      const isFirstScene = index === 0;
      const isLastScene = index === project.scenes.length - 1;
      
      // Ajustar o início da Sequence:
      // - Primeira cena: começa no frame original
      // - Demais cenas: começam ANTES do tempo original (para sobrepor com saída da anterior)
      const sequenceStart = isFirstScene ? startFrame : startFrame - transitionFrames;
      
      // Ajustar a duração da Sequence:
      // - Se for a última cena: duração base + transição de entrada (se não for a primeira)
      // - Se não for a última: duração base + transição de entrada + transição de saída (para sobrepor com a próxima)
      const sequenceDuration = isLastScene
        ? baseDuration + (isFirstScene ? 0 : transitionFrames) // Última cena não precisa de transição de saída
        : baseDuration + (isFirstScene ? transitionFrames : transitionFrames * 2); // Outras cenas precisam de entrada e saída
      
      return {
        scene,
        startFrame: sequenceStart,
        endFrame,
        durationFrames: sequenceDuration,
        transitionFrames,
        baseDuration,
        isFirstScene,
        isLastScene,
      };
    });
  }, [project.scenes, fps]);
  
  return (
    <ProjectConfigContext.Provider value={config}>
      <AbsoluteFill
        style={{
          backgroundColor,
          overflow: 'hidden',
          fontFamily: 'Pricedown',
        }}
      >
        {/* Renderizar cada cena como uma Sequence */}
        {sceneInfos.map((info, index) => {
          const { scene, startFrame, durationFrames, transitionFrames, baseDuration, isFirstScene, isLastScene } = info;
          
          return (
            <Sequence
              key={scene.id}
              from={startFrame}
              durationInFrames={durationFrames}
              name={`Cena ${scene.id}`}
            >
              <SceneWithTransition
                scene={scene}
                durationFrames={durationFrames}
                transitionFrames={transitionFrames}
                baseDuration={baseDuration}
                isFirstScene={isFirstScene}
                isLastScene={isLastScene}
              />
            </Sequence>
          );
        })}
        
        {/* Áudio de fundo (música) */}
        {config.backgroundMusic?.src && (
          <Audio
            src={config.backgroundMusic.src}
            volume={config.backgroundMusic.volume || 0.3}
          />
        )}
      </AbsoluteFill>
    </ProjectConfigContext.Provider>
  );
};

// ========================================
// SCENE WITH TRANSITION WRAPPER
// ========================================

interface SceneWithTransitionProps {
  scene: VideoProject['scenes'][0];
  durationFrames: number;
  transitionFrames: number;
  baseDuration: number;
  isFirstScene: boolean;
  isLastScene: boolean;
}

const SceneWithTransition: React.FC<SceneWithTransitionProps> = ({
  scene,
  durationFrames,
  transitionFrames,
  baseDuration,
  isFirstScene,
  isLastScene,
}) => {
  const frame = useCurrentFrame();
  
  // Calcular o offset inicial (transição de entrada)
  // Se não for a primeira cena, temos um offset de transitionFrames
  const entryOffset = isFirstScene ? 0 : transitionFrames;
  
  // Calcular estilos de transição
  const isInEnterTransition = frame < entryOffset + transitionFrames;
  const isInExitTransition = !isLastScene && frame > entryOffset + baseDuration;
  
  let transitionStyles: React.CSSProperties = {};
  
  if (isInEnterTransition) {
    // Transição de entrada
    // Para a primeira cena, frame vai de 0 a transitionFrames
    // Para outras cenas, frame vai de 0 a entryOffset+transitionFrames, mas a transição começa em entryOffset
    const enterFrame = frame - entryOffset;
    transitionStyles = applyTransition(scene.transition, {
      frame: Math.max(0, enterFrame),
      transitionFrames,
      isEntering: true,
    });
  } else if (isInExitTransition) {
    // Transição de saída
    const exitStartFrame = entryOffset + baseDuration;
    const exitFrame = frame - exitStartFrame;
    transitionStyles = applyTransition(scene.transition, {
      frame: exitFrame,
      transitionFrames,
      isEntering: false,
    });
  }
  
  return (
    <AbsoluteFill
      style={{
        ...transitionStyles,
      }}
    >
      <Scene
        scene={scene}
        relativeFrame={frame}
        sceneDurationFrames={durationFrames}
      />
    </AbsoluteFill>
  );
};

// ========================================
// DEFAULT PROPS FOR STUDIO
// ========================================

export const defaultVideoProject: VideoProject = {
  project_title: "Projeto de Exemplo",
  description: "Um projeto de exemplo para visualização no Studio",
  config: {
    width: 1920,
    height: 1080,
    fps: 30,
    backgroundColor: '#0a0a0a',
  },
  scenes: [
    {
      id: 1,
      start_time: 0,
      end_time: 4,
      transcript_segment: "Introdução",
      visual_concept: {
        description: "Tela de abertura",
        art_style: "modern",
        emotion: "profissional",
      },
      asset_type: 'solid_color',
      camera_movement: 'static',
      transition: 'fade',
      transition_duration: 0.5,
      text_overlay: {
        text: "Título do Vídeo",
        position: 'center',
        style: 'title',
        animation: 'pop',
      },
    },
    {
      id: 2,
      start_time: 4,
      end_time: 9,
      transcript_segment: "Primeira cena",
      visual_concept: {
        description: "Demonstração de zoom",
        art_style: "photorealistic",
        emotion: "dinâmico",
        color_palette: ['#1a1a2e', '#16213e'],
      },
      asset_type: 'solid_color',
      camera_movement: 'zoom_in_slow',
      transition: 'slide_left',
      transition_duration: 0.5,
      text_overlay: {
        text: "Efeito Ken Burns",
        position: 'bottom',
        style: 'subtitle',
        animation: 'slide_up',
      },
      // Exemplo de palavras destacadas
      highlight_words: [
        {
          text: 'Ken Burns',
          time: 1.0,
          duration: 1.5,
          entryAnimation: 'pop',
          exitAnimation: 'evaporate',
          size: 'huge',
          position: 'center',
          color: '#FFD700',
          effect: 'glow',
          fontWeight: 'black',
        },
      ],
    },

    {
      id: 3,
      start_time: 9,
      end_time: 14,
      transcript_segment: "Segunda cena",
      visual_concept: {
        description: "Placeholder de imagem",
        art_style: "illustration",
        emotion: "inspirador",
      },
      asset_type: 'image_flux',
      // asset_url será preenchido após geração
      prompt_suggestion: "beautiful landscape, mountains, sunset",
      camera_movement: 'ken_burns',
      transition: 'crossfade',
      transition_duration: 1,
    },
    {
      id: 4,
      start_time: 14,
      end_time: 18,
      transcript_segment: "Encerramento",
      visual_concept: {
        description: "Tela final",
        art_style: "minimal",
        emotion: "conclusivo",
        color_palette: ['#0f3460'],
      },
      asset_type: 'solid_color',
      camera_movement: 'static',
      transition: 'fade',
      transition_duration: 0.8,
      text_overlay: {
        text: "Obrigado!",
        position: 'center',
        style: 'title',
        animation: 'pop',
      },
    },
  ],
  schema_version: '1.0',
};
