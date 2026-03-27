/**
 * Remotion Root
 * 
 * Registra todas as composições de vídeo disponíveis.
 * Adicione novas composições aqui conforme necessário.
 */
import React from 'react';
import { Composition } from 'remotion';
import { ExampleComposition, exampleCompositionSchema } from './compositions/ExampleComposition';
import { 
  VideoProjectComposition, 
  videoProjectCompositionSchema,
  defaultVideoProject,
} from './compositions/VideoProject';
import { TrailPrintingDemo } from './compositions/TrailPrintingDemo';
import { TrailPrintingVisualGuide } from './compositions/TrailPrintingVisualGuide';
import { WaveEffectDemo } from './compositions/WaveEffectDemo';
import { Timeline3D, timeline3DSchema } from './components/Timeline3D';
import { calculateProjectFrames } from './types/project';
import { 
  QuizVideoComposition, 
  quizVideoCompositionSchema,
  defaultQuizProps,
  calculateQuizDuration,
} from './compositions/QuizVideoComposition';
import {
  QuizVideoSyncedComposition,
  quizVideoSyncedSchema,
  defaultSyncedQuizProps,
  calculateSyncedQuizDuration,
} from './compositions/QuizVideoSyncedComposition';

export const RemotionRoot: React.FC = () => {
  // Calcular duração do projeto de exemplo
  const exampleProjectFrames = calculateProjectFrames(defaultVideoProject, 30);
  
  return (
    <>
      {/* 
        =========================================
        VIDEO PROJECT - Composição Principal
        =========================================
        Recebe um JSON estruturado e gera o vídeo completo.
        Use esta composição para projetos gerados por IA.
      */}
      <Composition
        id="VideoProject"
        component={VideoProjectComposition}
        durationInFrames={exampleProjectFrames}
        fps={defaultVideoProject.config?.fps || 30}
        width={defaultVideoProject.config?.width || 1920}
        height={defaultVideoProject.config?.height || 1080}
        schema={videoProjectCompositionSchema}
        defaultProps={{
          project: defaultVideoProject,
        }}
        // Permite calcular metadados dinamicamente
        calculateMetadata={async ({ props }) => {
          const project = props.project;
          const fps = project.config?.fps || 30;
          const duration = project.scenes.reduce((maxDuration, scene) => {
            return Math.max(maxDuration, scene.end_time);
          }, 10);
          
          return {
            durationInFrames: Math.ceil(duration * fps),
            fps,
            width: project.config?.width || 1920,
            height: project.config?.height || 1080,
          };
        }}
      />

      {/* 
        =========================================
        EXAMPLE - Composição de Exemplo Simples
        =========================================
        Use como referência para criar composições customizadas.
      */}
      <Composition
        id="Example"
        component={ExampleComposition}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        schema={exampleCompositionSchema}
        defaultProps={{
          title: 'Hello, Remotion!',
          backgroundColor: '#1a1a2e',
        }}
      />

      {/* 
        =========================================
        TRAIL PRINTING EFFECT DEMOS
        =========================================
        Demonstrações do efeito trail printing / accordion blur.
      */}
      <Composition
        id="TrailPrintingDemo"
        component={TrailPrintingDemo}
        durationInFrames={400}
        fps={30}
        width={1920}
        height={1080}
      />

      <Composition
        id="TrailPrintingVisualGuide"
        component={TrailPrintingVisualGuide}
        durationInFrames={400}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* 
        =========================================
        WAVE EFFECT DEMO
        =========================================
        Demonstração do efeito wave em highlight words.
      */}
      <Composition
        id="WaveEffectDemo"
        component={WaveEffectDemo}
        durationInFrames={1440} // 24 segundos a 60fps
        fps={60}
        width={1920}
        height={1080}
      />

      {/* 
        =========================================
        ADICIONE NOVAS COMPOSIÇÕES AQUI
        =========================================
        
        Exemplo:
        
        <Composition
          id="MinhaComposicao"
          component={MinhaComposicao}
          durationInFrames={300}
          fps={30}
          width={1920}
          height={1080}
          schema={minhaComposicaoSchema}
          defaultProps={{}}
        />
      */}
      {/* 
        =========================================
        TIMELINE 3D - Historical Visuals
        =========================================
      */}
      <Composition
        id="Timeline3D"
        component={Timeline3D}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        schema={timeline3DSchema}
        defaultProps={{
          items: [
            {
              id: '1',
              year: '470 BC',
              label: 'Socrates',
              image: '/generic_historical_figure.png', 
            },
            {
              id: '2',
              year: '1903',
              label: 'Marie Curie',
              image: '/generic_historical_figure.png',
            },
            {
              id: '3',
              year: '1915',
              label: 'Albert Einstein',
              image: '/generic_historical_figure.png',
            },
          ]
        }}
      />

      {/* 
        =========================================
        QUIZ VIDEO - Vídeos de Quiz Interativos
        =========================================
        Gera vídeos de quiz com perguntas, opções
        e revelação animada das respostas.
      */}
      <Composition
        id="QuizVideo"
        component={QuizVideoComposition}
        durationInFrames={calculateQuizDuration(
          defaultQuizProps.questions.length,
          defaultQuizProps.thinkingTimeSeconds,
          defaultQuizProps.showAnswerTimeSeconds,
          30
        )}
        fps={30}
        width={1080}
        height={1920}
        schema={quizVideoCompositionSchema}
        defaultProps={defaultQuizProps}
        calculateMetadata={async ({ props }) => {
          const fps = 30;
          const durationInFrames = calculateQuizDuration(
            props.questions.length,
            props.thinkingTimeSeconds,
            props.showAnswerTimeSeconds,
            fps
          );
          return {
            durationInFrames,
            fps,
            width: 1080,
            height: 1920,
          };
        }}
      />

      {/* 
        =========================================
        QUIZ VIDEO SYNCED - Sincronizado com Áudio
        =========================================
        Versão do quiz que sincroniza elementos visuais
        com os timestamps do áudio transcrito.
      */}
      <Composition
        id="QuizVideoSynced"
        component={QuizVideoSyncedComposition}
        durationInFrames={calculateSyncedQuizDuration(defaultSyncedQuizProps.audioDuration, 30)}
        fps={30}
        width={1080}
        height={1920}
        schema={quizVideoSyncedSchema}
        defaultProps={defaultSyncedQuizProps}
        calculateMetadata={async ({ props }) => {
          const fps = 30;
          const durationInFrames = calculateSyncedQuizDuration(
            props.audioDuration || 60,
            fps
          );
          return {
            durationInFrames,
            fps,
            width: 1080,
            height: 1920,
          };
        }}
      />
    </>
  );
};
