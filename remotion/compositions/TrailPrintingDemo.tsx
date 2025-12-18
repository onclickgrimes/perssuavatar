/**
 * Trail Printing Demo
 * 
 * Demonstração do efeito de trail printing / accordion blur.
 * Este efeito deixa um rastro visual das frames anteriores com opacidade decrescente.
 */
import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { Scene } from '../components/Scene';
import type { Scene as SceneType } from '../types/project';

export const TrailPrintingDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Cena de demonstração com o efeito trail printing
  const demoScene: SceneType = {
    id: 1,
    start_time: 0,
    end_time: 10,
    transcript_segment: 'Demonstração do efeito de trail printing',
    visual_concept: {
      description: 'Monges budistas em movimento com efeito de trail printing',
      art_style: 'cinematográfico, dramático',
      emotion: 'místico, contemplativo',
      lighting: 'low key, iluminação teatral',
      color_palette: ['#1a1a1a', '#8B4513', '#FFD700'],
    },
    asset_type: 'image_static',
    // Você pode substituir por uma imagem real ou usar o placeholder
    asset_url: '', // Deixe vazio para usar o placeholder
    camera_movement: 'trail_printing',
    transition: 'fade',
    transition_duration: 0.5,
    text_overlay: {
      text: 'Trail Printing Effect',
      position: 'bottom',
      style: 'title',
      animation: 'fade',
      fontSize: 48,
      color: '#FFFFFF',
    },
  };
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {/* Título da demo */}
      <div
        style={{
          position: 'absolute',
          top: 40,
          left: 0,
          right: 0,
          textAlign: 'center',
          color: '#FFFFFF',
          fontFamily: 'Inter, sans-serif',
          fontSize: 32,
          fontWeight: 'bold',
          zIndex: 10,
          textShadow: '0 2px 10px rgba(0,0,0,0.8)',
        }}
      >
        Accordion Blur / Trail Printing Effect
      </div>
      
      {/* Descrição */}
      <div
        style={{
          position: 'absolute',
          top: 90,
          left: 0,
          right: 0,
          textAlign: 'center',
          color: '#CCCCCC',
          fontFamily: 'Inter, sans-serif',
          fontSize: 16,
          zIndex: 10,
          textShadow: '0 2px 10px rgba(0,0,0,0.8)',
          maxWidth: 800,
          margin: '0 auto',
          padding: '0 20px',
        }}
      >
        Efeito que deixa um rastro das frames anteriores antes de alcançar a cena atual,
        criando uma múltipla exposição visual reminiscente da técnica prática de step-printing.
      </div>
      
      {/* Cena com o efeito */}
      <Sequence from={60}>
        <Scene
          scene={demoScene}
          relativeFrame={Math.max(0, frame - 60)}
          sceneDurationFrames={10 * fps}
        />
      </Sequence>
      
      {/* Informações técnicas */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          left: 40,
          color: '#888',
          fontFamily: 'monospace',
          fontSize: 12,
          zIndex: 10,
        }}
      >
        Frame: {frame} | FPS: {fps}
      </div>
    </AbsoluteFill>
  );
};
