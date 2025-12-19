/**
 * Composição de Exemplo
 * 
 * Um exemplo simples para demonstrar os conceitos básicos do Remotion:
 * - Props com schema de validação (Zod)
 * - Uso de useCurrentFrame e useVideoConfig
 * - Animações com interpolate
 * - Uso de Sequence para timing
 * 
 * Documentação: https://www.remotion.dev/docs/the-fundamentals
 */
import React from 'react';
import { 
  AbsoluteFill, 
  useCurrentFrame, 
  useVideoConfig, 
  interpolate,
  spring,
  Sequence,
} from 'remotion';
import { z } from 'zod';

// Schema de validação das props (opcional, mas recomendado)
export const exampleCompositionSchema = z.object({
  title: z.string(),
  backgroundColor: z.string().optional(),
});

type ExampleCompositionProps = z.infer<typeof exampleCompositionSchema>;

export const ExampleComposition: React.FC<ExampleCompositionProps> = ({
  title,
  backgroundColor = '#1a1a2e',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  // Animação de spring para o título
  const titleScale = spring({
    frame,
    fps,
    config: {
      damping: 12,
      stiffness: 100,
    },
  });

  // Fade in no início
  const fadeIn = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Fade out no final
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 30, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp' }
  );

  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        justifyContent: 'center',
        alignItems: 'center',
        opacity,
      }}
    >
      {/* Título animado */}
      <Sequence from={0}>
        <div
          style={{
            transform: `scale(${titleScale})`,
            color: 'white',
            fontSize: 80,
            fontWeight: 'bold',
            fontFamily: 'Pricedown',
            textAlign: 'center',
            textShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          {title}
        </div>
      </Sequence>

      {/* Contador de frames (para debug) */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          right: 40,
          color: 'rgba(255,255,255,0.5)',
          fontSize: 24,
          fontFamily: 'monospace',
        }}
      >
        Frame: {frame} / {durationInFrames}
      </div>
    </AbsoluteFill>
  );
};
