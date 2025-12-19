/**
 * Wave Effect Demo
 * 
 * Demonstração do efeito de onda (wave) em highlight words.
 * Carrega o projeto de exemplo do JSON wave-effect-demo.json
 */
import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { Scene } from '../components/Scene';
import type { VideoProject } from '../types/project';

// Importar o JSON de exemplo
import waveEffectProject from '../examples/wave-effect-demo.json';

export const WaveEffectDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Cast do JSON para o tipo correto
  const project = waveEffectProject as VideoProject;
  
  return (
    <AbsoluteFill style={{ backgroundColor: project.config?.backgroundColor || '#0a0a0a' }}>
      {/* Título da demo */}
      <div
        style={{
          position: 'absolute',
          top: 40,
          left: 0,
          right: 0,
          textAlign: 'center',
          color: '#FFFFFF',
          fontFamily: 'Pricedown, Inter, sans-serif',
          fontSize: 48,
          fontWeight: 'bold',
          zIndex: 1000,
          textShadow: '0 0 20px rgba(255,107,53,0.8), 0 2px 10px rgba(0,0,0,0.8)',
        }}
      >
        🌊 WAVE EFFECT DEMO
      </div>
      
      {/* Descrição */}
      <div
        style={{
          position: 'absolute',
          top: 100,
          left: 0,
          right: 0,
          textAlign: 'center',
          color: '#CCCCCC',
          fontFamily: 'Inter, sans-serif',
          fontSize: 16,
          zIndex: 1000,
          textShadow: '0 2px 10px rgba(0,0,0,0.8)',
          maxWidth: 800,
          margin: '0 auto',
          padding: '0 20px',
        }}
      >
        Efeito premium onde o texto aparece vazado (outline) e enche de baixo para cima como uma onda 🌊
      </div>
      
      {/* Renderizar cada cena do projeto */}
      {project.scenes.map((scene, index) => {
        const sceneStartFrame = Math.round(scene.start_time * fps);
        const sceneDurationFrames = Math.round((scene.end_time - scene.start_time) * fps);
        
        return (
          <Sequence
            key={scene.id}
            from={sceneStartFrame}
            durationInFrames={sceneDurationFrames}
            name={`Scene ${scene.id}`}
          >
            <Scene
              scene={scene}
              relativeFrame={Math.max(0, frame - sceneStartFrame)}
              sceneDurationFrames={sceneDurationFrames}
            />
          </Sequence>
        );
      })}
      
      {/* Informações técnicas */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          left: 40,
          color: '#666',
          fontFamily: 'monospace',
          fontSize: 14,
          zIndex: 1000,
          backgroundColor: 'rgba(0,0,0,0.5)',
          padding: '10px 15px',
          borderRadius: '8px',
        }}
      >
        <div>Frame: {frame} / {Math.round(project.scenes[project.scenes.length - 1].end_time * fps)}</div>
        <div>FPS: {fps}</div>
        <div>Scenes: {project.scenes.length}</div>
      </div>
      
      {/* Legenda das animações */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          right: 40,
          color: '#888',
          fontFamily: 'Inter, sans-serif',
          fontSize: 12,
          zIndex: 1000,
          backgroundColor: 'rgba(0,0,0,0.5)',
          padding: '15px',
          borderRadius: '8px',
          maxWidth: '300px',
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#FFF' }}>
          Wave Animations:
        </div>
        <div>• Entry: Texto enche de baixo ↑</div>
        <div>• Exit: Texto esvazia de cima ↓</div>
        <div style={{ marginTop: '8px', color: '#00D9FF' }}>
          Combinações testadas neste demo
        </div>
      </div>
    </AbsoluteFill>
  );
};
