import { useCurrentFrame, useVideoConfig } from "remotion";

export function WavyGrid() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Configuração da grade - maior para cobrir toda a tela
  const gridRows = 12;
  const gridCols = 16;
  const spacing = Math.max(width, height) / 10; // Espaçamento dinâmico baseado no tamanho da tela
  
  // Animação das ondas - mais intensa
  const waveSpeed = 0.03;
  const waveAmplitude = 60; // Amplitude maior para mais distorção
  const waveAmplitude2 = 40;
  
  // Criar pontos da grade com efeito de onda distorcida
  const createGridPoints = () => {
    const points: { x: number; y: number; z: number }[] = [];
    
    for (let row = 0; row <= gridRows; row++) {
      for (let col = 0; col <= gridCols; col++) {
        // Posição base
        const x = (col - gridCols / 2) * spacing;
        const y = (row - gridRows / 2) * spacing;
        
        // Calcular distância do centro para efeito radial
        const distanceFromCenter = Math.sqrt(
          Math.pow(col - gridCols / 2, 2) + Math.pow(row - gridRows / 2, 2)
        );
        
        // Múltiplas ondas para efeito mais complexo e distorcido
        const wave1 = Math.sin(distanceFromCenter * 0.4 + frame * waveSpeed) * waveAmplitude;
        const wave2 = Math.cos(distanceFromCenter * 0.3 - frame * waveSpeed * 0.8) * waveAmplitude2;
        const wave3 = Math.sin(col * 0.2 + frame * waveSpeed * 1.2) * (waveAmplitude * 0.3);
        const wave4 = Math.cos(row * 0.2 - frame * waveSpeed * 0.9) * (waveAmplitude * 0.3);
        
        const z = wave1 + wave2 + wave3 + wave4;
        
        points.push({ x, y, z });
      }
    }
    
    return points;
  };
  
  const points = createGridPoints();
  
  // Projetar pontos 3D em 2D (perspectiva)
  const project3DTo2D = (x: number, y: number, z: number) => {
    const perspective = 800;
    const scale = perspective / (perspective + z);
    
    return {
      x: x * scale + width / 2,
      y: y * scale + height / 2,
      scale,
    };
  };
  
  // Criar linhas da grade
  const renderGridLines = () => {
    const lines: JSX.Element[] = [];
    
    // Linhas horizontais
    for (let row = 0; row <= gridRows; row++) {
      const linePoints: string[] = [];
      
      for (let col = 0; col <= gridCols; col++) {
        const index = row * (gridCols + 1) + col;
        const point = points[index];
        const projected = project3DTo2D(point.x, point.y, point.z);
        
        linePoints.push(`${projected.x},${projected.y}`);
      }
      
      lines.push(
        <polyline
          key={`h-${row}`}
          points={linePoints.join(' ')}
          fill="none"
          stroke="rgba(255, 255, 255, 0.4)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    
    // Linhas verticais
    for (let col = 0; col <= gridCols; col++) {
      const linePoints: string[] = [];
      
      for (let row = 0; row <= gridRows; row++) {
        const index = row * (gridCols + 1) + col;
        const point = points[index];
        const projected = project3DTo2D(point.x, point.y, point.z);
        
        linePoints.push(`${projected.x},${projected.y}`);
      }
      
      lines.push(
        <polyline
          key={`v-${col}`}
          points={linePoints.join(' ')}
          fill="none"
          stroke="rgba(255, 255, 255, 0.4)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    
    return lines;
  };
  
  
  // Criar estrelas/partículas de fundo COM MOVIMENTO ALEATÓRIO
  const stars = Array.from({ length: 150 }, (_, i) => {
    // Usar seed aleatório baseado no índice para consistência
    const seed1 = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    const seed2 = Math.sin(i * 93.9898 + 12.233) * 43758.5453;
    const seed3 = Math.sin(i * 45.1234 + 56.789) * 43758.5453;
    
    const random1 = (seed1 - Math.floor(seed1));
    const random2 = (seed2 - Math.floor(seed2));
    const random3 = (seed3 - Math.floor(seed3));
    
    // Movimento mais aleatório e variado
    const speedX = (random1 - 0.5) * 4; // -2 a +2
    const speedY = (random2 - 0.5) * 4;
    
    // Posição base aleatória
    const baseX = random1 * width;
    const baseY = random2 * height;
    
    // Posição animada com wrapping
    let x = (baseX + speedX * frame * 0.5) % width;
    let y = (baseY + speedY * frame * 0.5) % height;
    
    // Wrap around para movimento contínuo
    if (x < 0) x += width;
    if (y < 0) y += height;
    
    // Twinkle mais variado
    const twinkleSpeed = 0.03 + random3 * 0.05;
    const twinkle = Math.sin(frame * twinkleSpeed + i * random1) * 0.5 + 0.5;
    
    // Tamanho muito mais variado
    const sizeVariation = random3 * random3; // Squared para mais pequenas e poucas grandes
    const size = 0.5 + sizeVariation * 3; // 0.5 a 3.5px
    
    // Opacidade base variada
    const baseOpacity = 0.3 + random2 * 0.6; // 0.3 a 0.9
    
    return (
      <circle
        key={`star-${i}`}
        cx={x}
        cy={y}
        r={size}
        fill={`rgba(255, 255, 255, ${twinkle * baseOpacity})`}
      />
    );
  });

  return (
    <div
      style={{
        width,
        height,
        background: "black",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Estrelas de fundo em movimento */}
      <svg
        width={width}
        height={height}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        {stars}
      </svg>
      
      {/* Grade ondulada e distorcida */}
      <svg
        width={width}
        height={height}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        {renderGridLines()}
      </svg>
    </div>
  );
}
