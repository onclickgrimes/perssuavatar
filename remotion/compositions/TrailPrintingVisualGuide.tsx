/**
 * Trail Printing Visual Example
 * 
 * Este arquivo demonstra visualmente como o efeito funciona com marcações visuais
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

export const TrailPrintingVisualGuide: React.FC = () => {
  const frame = useCurrentFrame();
  
  // Simular um objeto em movimento
  const objectX = (frame % 200) * 5;
  const objectY = 540;
  
  const trailCount = 6;
  const baseOpacity = 0.2;
  const trails = Array.from({ length: trailCount }, (_, i) => i);
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      {/* Título */}
      <div
        style={{
          position: 'absolute',
          top: 50,
          left: 0,
          right: 0,
          textAlign: 'center',
          color: '#FFF',
          fontFamily: 'Inter, sans-serif',
          fontSize: 40,
          fontWeight: 'bold',
        }}
      >
        Trail Printing Effect - Visual Guide
      </div>
      
      {/* Descrição */}
      <div
        style={{
          position: 'absolute',
          top: 110,
          left: 0,
          right: 0,
          textAlign: 'center',
          color: '#AAA',
          fontFamily: 'Inter, sans-serif',
          fontSize: 18,
        }}
      >
        Observe o rastro deixado pelo objeto em movimento
      </div>
      
      {/* Grid de referência */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.1,
        }}
        viewBox="0 0 1920 1080"
      >
        {/* Linhas verticais */}
        {Array.from({ length: 20 }).map((_, i) => (
          <line
            key={`v-${i}`}
            x1={i * 100}
            y1={0}
            x2={i * 100}
            y2={1080}
            stroke="#FFF"
            strokeWidth={1}
          />
        ))}
        {/* Linhas horizontais */}
        {Array.from({ length: 11 }).map((_, i) => (
          <line
            key={`h-${i}`}
            x1={0}
            y1={i * 100}
            x2={1920}
            y2={i * 100}
            stroke="#FFF"
            strokeWidth={1}
          />
        ))}
      </svg>
      
      {/* Demonstração do efeito */}
      <div
        style={{
          position: 'absolute',
          top: 200,
          left: 0,
          right: 0,
          height: 700,
        }}
      >
        {/* Rastros */}
        {trails.reverse().map((trailIndex) => {
          const opacity = baseOpacity * (1 - trailIndex / (trailCount + 2));
          const horizontalOffset = trailIndex * 8;
          const verticalOffset = Math.sin((frame - trailIndex * 3) * 0.03) * (trailIndex * 2);
          const scale = 1 - (trailIndex * 0.01);
          const rotation = (trailIndex - trailCount / 2) * 0.3;
          const blur = trailIndex * 0.5;
          
          const posX = objectX - horizontalOffset;
          
          return (
            <div
              key={trailIndex}
              style={{
                position: 'absolute',
                left: posX,
                top: objectY + verticalOffset,
                width: 100,
                height: 100,
                backgroundColor: '#FF6B35',
                borderRadius: '50%',
                opacity,
                transform: `scale(${scale}) rotate(${rotation}deg)`,
                filter: `blur(${blur}px)`,
                boxShadow: '0 0 30px rgba(255, 107, 53, 0.5)',
              }}
            >
              {/* Label do rastro */}
              <div
                style={{
                  position: 'absolute',
                  top: -30,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  color: '#FFF',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                  opacity: 0.6,
                }}
              >
                Trail {trailIndex}
              </div>
            </div>
          );
        })}
        
        {/* Objeto atual */}
        <div
          style={{
            position: 'absolute',
            left: objectX,
            top: objectY,
            width: 100,
            height: 100,
            backgroundColor: '#FFD93D',
            borderRadius: '50%',
            boxShadow: '0 0 50px rgba(255, 217, 61, 0.8)',
            border: '3px solid #FFF',
          }}
        >
          {/* Label */}
          <div
            style={{
              position: 'absolute',
              top: -40,
              left: '50%',
              transform: 'translateX(-50%)',
              color: '#FFD93D',
              fontSize: 16,
              fontFamily: 'monospace',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
            }}
          >
            Current Frame
          </div>
        </div>
      </div>
      
      {/* Legenda */}
      <div
        style={{
          position: 'absolute',
          bottom: 50,
          left: 50,
          right: 50,
          display: 'flex',
          justifyContent: 'space-around',
          flexWrap: 'wrap',
          gap: 30,
        }}
      >
        <LegendItem color="#FFD93D" label="Frame Atual (100% opacity)" />
        <LegendItem color="#FF6B35" label="Rastros (opacidade decrescente)" />
        <LegendItem color="#FFF" label="Movimento horizontal + vertical" />
        <LegendItem color="#AAA" label="Blur + escala progressivos" />
      </div>
      
      {/* Informações técnicas */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          padding: 15,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          borderRadius: 8,
          border: '1px solid rgba(255, 255, 255, 0.2)',
        }}
      >
        <div style={{ color: '#FFF', fontFamily: 'monospace', fontSize: 12 }}>
          <div>Frame: {frame}</div>
          <div>Trails: {trailCount}</div>
          <div>Base Opacity: {baseOpacity}</div>
          <div>Movement: Sine Wave</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Componente auxiliar para a legenda
interface LegendItemProps {
  color: string;
  label: string;
}

const LegendItem: React.FC<LegendItemProps> = ({ color, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <div
      style={{
        width: 20,
        height: 20,
        backgroundColor: color,
        borderRadius: '50%',
        boxShadow: `0 0 15px ${color}`,
      }}
    />
    <span
      style={{
        color: '#CCC',
        fontFamily: 'Inter, sans-serif',
        fontSize: 14,
      }}
    >
      {label}
    </span>
  </div>
);
