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
}> = ({ item, index, cameraX, width }) => {
  const CARD_SPACING = 800; // Distance between cards
  const CARD_WIDTH = 500;
  
  const frame = useCurrentFrame();
  const config = useVideoConfig();
  
  // Calculate position in world space
  const worldX = index * CARD_SPACING;
  
  // Calculate position relative to camera
  const relativeX = worldX - cameraX;
  
  // Parallax / 3D effect calculation
  // We want items to rotate slightly as they pass the center
  const centerOffset = relativeX - (width / 2) + (CARD_WIDTH / 2);
  const rotationY = interpolate(
    centerOffset,
    [-width, 0, width],
    [45, 0, -45],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  const opacity = interpolate(
    centerOffset,
    [-width * 0.8, -width * 0.2, width * 0.2, width * 0.8],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const scale = interpolate(
    Math.abs(centerOffset),
    [0, width],
    [1.1, 0.8],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: CARD_WIDTH,
        height: '600px',
        transform: `translateX(${relativeX}px) translateZ(0) rotateY(${rotationY}deg) scale(${scale})`,
        opacity,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        transformOrigin: 'center center',
      }}
    >
      {/* Connector Line to Timeline */}
      <div 
        style={{
          position: 'absolute',
          bottom: -100,
          left: '50%',
          width: 4,
          height: 100,
          background: 'linear-gradient(to bottom, cyan, red)',
          boxShadow: '0 0 10px red',
        }} 
      />

      {/* Card Content */}
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#111',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 0 30px rgba(255, 0, 0, 0.3), 0 0 50px rgba(0, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          position: 'relative',
        }}
      >
        {item.image ? (
            <Img src={item.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(45deg, #220000, #001111)', display:'flex', alignItems:'center', justifyContent:'center', color: '#555' }}>
                Image Placeholder
            </div>
        )}
        
        {/* Overlay Gradient for "Dramatic Lighting" */}
        <div 
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'linear-gradient(135deg, rgba(255,0,0,0.4) 0%, rgba(0,0,0,0) 50%, rgba(0,255,255,0.2) 100%)',
                mixBlendMode: 'overlay',
            }}
        />
        
      </div>
      
      {/* Label */}
      <h2 style={{
        marginTop: '60px',
        fontFamily: 'sans-serif',
        color: 'white',
        fontSize: '40px',
        fontWeight: 'bold',
        textShadow: '0 2px 10px rgba(0,0,0,0.8)',
        textAlign: 'center',
      }}>
        {item.label}
      </h2>
      <p style={{
        margin: '0',
        fontFamily: 'monospace',
        color: 'red',
        fontSize: '24px',
        textShadow: '0 0 5px red',
      }}>
        {item.year}
      </p>
    </div>
  );
};

export const Timeline3D: React.FC<Timeline3DProps> = ({ items }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames, fps } = useVideoConfig();
  
  // Robustness check: Ensure items is an array
  // This prevents runtime crash if JSON is malformed (e.g. items is an object instead of array)
  const timelineItems = React.useMemo(() => {
     if (Array.isArray(items)) return items;
     if (items && typeof items === 'object') return [items] as any; // Fallback for single object
     return [];
  }, [items]);

  // Camera movement
  // We want to pan through all items.
  // Start before the first item, end after the last item.
  const CARD_SPACING = 800;
  const TOTAL_WIDTH = timelineItems.length * CARD_SPACING;
  
  const cameraX = interpolate(
    frame,
    [0, durationInFrames],
    [-width * 0.5, Math.max(0, TOTAL_WIDTH - width * 0.5)], // Ensure safe range
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: '#050505', // Deep black background
        position: 'relative',
        overflow: 'hidden',
        perspective: '1500px', // key for 3D effect
      }}
    >
      {/* Background Ambience */}
      <div style={{
          position: 'absolute',
          top: 0, left: 0, width: '100%', height: '100%',
          background: 'radial-gradient(circle at 50% 50%, #1a0000 0%, #000000 70%)',
      }}/>

      {/* The Red Timeline Line */}
      <div style={{
          position: 'absolute',
          top: '700px', // Positioned lower, where the connector lines end
          left: 0,
          width: '100%',
          height: '6px',
          background: 'linear-gradient(90deg, darkred, red, darkred)',
          boxShadow: '0 0 20px red',
          zIndex: 10,
      }}/>
       {/* Moving markers on the timeline for effect */}
       <div style={{
           position: 'absolute',
           top: '693px',
           left: 0,
           width: '100%',
           height: '20px',
           transform: `translateX(${-cameraX * 0.5}px)`, // Parallax for the floor/line texture
           background: 'repeating-linear-gradient(90deg, transparent, transparent 190px, rgba(255,0,0,0.5) 200px)',
       }} />


      {/* 3D Container */}
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          transformStyle: 'preserve-3d',
          top: '100px', // Push cards down a bit
        }}
      >
        {timelineItems.map((item: { id: string; year: string; label: string; image?: string | undefined; }, i: number) => (
          <TimelineCard 
            key={item.id} 
            item={item} 
            index={i} 
            cameraX={cameraX} 
            width={width}
          />
        ))}
      </div>
      
      {/* Foreground Overlay (Vignette) */}
       <div style={{
          position: 'absolute',
          top: 0, left: 0, width: '100%', height: '100%',
          background: 'radial-gradient(circle at 50% 50%, transparent 50%, #000000 100%)',
          pointerEvents: 'none',
          zIndex: 100,
      }}/>
    </div>
  );
};
