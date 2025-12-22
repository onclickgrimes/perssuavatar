import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Img } from 'remotion';
import { z } from 'zod';

export const timeline3DSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    year: z.string(),
    label: z.string(),
    image: z.string().optional(),
  })),
});

export type Timeline3DProps = z.infer<typeof timeline3DSchema>;

const TimelineCard: React.FC<{
  item: Timeline3DProps['items'][0];
  index: number;
  cameraX: number;
  width: number;
  height: number;
}> = ({ item, index, cameraX, width, height }) => {
  const CARD_WIDTH = 900;  // Mais largo (Landscape)
  const CARD_HEIGHT = 506; // ~16:9 aspect ratio
  const SPACING = 1200;    // Espaçamento maior entre cards
  
  const frame = useCurrentFrame();
  
  // Posição no mundo
  const worldX = index * SPACING;
  // Posição relativa à câmera
  const relativeX = worldX - cameraX;
  
  // Centro da tela
  const distanceFromCenter = relativeX;

  // Rotação Y: Efeito de carrossel (vira para o centro)
  const rotationY = interpolate(
    distanceFromCenter,
    [-width * 0.8, 0, width * 0.8],
    [35, 0, -35], 
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  // Inclinação Diagonal (Z): Dá a sensação de que a timeline "sobe" ou "curva"
  const rotationZ = interpolate(
    distanceFromCenter,
    [-width, 0, width],
    [-5, 0, 5], 
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Opacidade: Sair de foco nas bordas extremas
  const opacity = interpolate(
    Math.abs(distanceFromCenter),
    [width * 0.5, width * 1.0],
    [1, 0.3], // Não apaga totalmente, apenas escurece
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Escala: Diminuição mais acentuada para profundidade
  const scale = interpolate(
    Math.abs(distanceFromCenter),
    [0, width],
    [1.1, 0.7],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%', // Centralizar no container pai
        top: '40%',  // Subir um pouco para dar espaço ao texto embaixo
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        marginLeft: -CARD_WIDTH / 2, // Compensar largura para centralizar
        marginTop: -CARD_HEIGHT / 2,
        transform: `translateX(${relativeX}px) translateZ(0) rotateY(${rotationY}deg) rotateZ(${rotationZ}deg) scale(${scale})`,
        opacity,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        transformStyle: 'preserve-3d', 
      }}
    >
      {/* CARD IMAGE */}
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#000',
          borderRadius: '4px',
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
          position: 'relative',
        }}
      >
        {item.image ? (
            <Img src={item.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(45deg, #111, #222)', display:'flex', alignItems:'center', justifyContent:'center', color: '#444' }}>
                Placeholder
            </div>
        )}
        
        {/* Color Overlay (Dramatic Lighting - Red & Green) */}
         <div 
            style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(120deg, rgba(255,0,0,0.3) 0%, rgba(0,0,0,0) 40%, rgba(0,255,100,0.1) 100%)',
                mixBlendMode: 'overlay',
            }}
        />
        {/* Shadow Vignette */}
        <div 
             style={{
                 position: 'absolute',
                 inset: 0,
                 boxShadow: 'inset 0 0 100px rgba(0,0,0,0.7)',
             }}
        />
      </div>

      {/* MARKER (White Dot) */}
      <div style={{
          position: 'absolute',
          bottom: -100, // Distância do card até a linha
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          backgroundColor: '#fff',
          boxShadow: '0 0 15px rgba(255, 255, 255, 0.8)',
          zIndex: 20,
      }} />

      {/* TEXTO ABAIXO DA LINHA */}
      <div style={{
          position: 'absolute',
          bottom: -200, // Abaixo do marker
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          width: '100%',
      }}>
          <h2 style={{
            fontFamily: 'Inter, sans-serif',
            color: 'white',
            fontSize: '48px',
            fontWeight: 600,
            margin: 0,
            textShadow: '0 2px 4px rgba(0,0,0,0.5)',
          }}>
            {item.label}
          </h2>
           {item.year && (
              <p style={{
                fontFamily: 'monospace',
                color: 'rgba(255,255,255,0.6)',
                fontSize: '24px',
                margin: '10px 0 0 0',
              }}>
                {item.year}
              </p>
           )}
      </div>

    </div>
  );
};

export const Timeline3D: React.FC<Timeline3DProps> = ({ items }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  
  // Robustness check
  const timelineItems = React.useMemo(() => {
     if (Array.isArray(items)) return items;
     if (items && typeof items === 'object') return [items] as any;
     return [];
  }, [items]);

  const SPACING = 1200;
  // Queremos que a câmera termine no último item
  const TOTAL_SCENE_WIDTH = Math.max(0, (timelineItems.length - 1) * SPACING);
  
  // Movimento da câmera
  const cameraX = interpolate(
    frame,
    [0, durationInFrames],
    [-width * 0.2, TOTAL_SCENE_WIDTH + width * 0.2], // Começa antes, termina depois
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: '#111', 
        position: 'relative',
        overflow: 'hidden',
        perspective: '2000px', 
      }}
    >
      {/* BACKGROUND GRADIENTE */}
       <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 50% 30%, #1a1a1a 0%, #000000 80%)',
      }}/>

      {/* RED TIMELINE LINE */}
      <div 
        style={{
            position: 'absolute',
            top: 'calc(40% + 253px + 80px)', // Top do card + Meia Altura + Distancia
            left: 0,
            width: '100%',
            height: '12px',
            background: '#ff0000', 
            boxShadow: '0 0 20px rgba(255, 0, 0, 0.4)',
            zIndex: 10,
        }}
      />
      
      {/* 3D SCENE CONTAINER */}
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          transformStyle: 'preserve-3d',
        }}
      >
        {timelineItems.map((item: { id: string; year: string; label: string; image?: string | undefined; }, i: number) => (
          <TimelineCard 
            key={item.id} 
            item={item} 
            index={i} 
            cameraX={cameraX} 
            width={width}
            height={height}
          />
        ))}
      </div>
    
      {/* VIGNETTE OVERLAY */}
      <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 50% 50%, transparent 60%, black 100%)',
          pointerEvents: 'none',
          zIndex: 100,
      }}/>
      
    </div>
  );
};
