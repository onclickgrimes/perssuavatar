/**
 * ChromaKey Media Component
 * 
 * Componente para aplicar efeito de chroma key (remoção de fundo verde/azul)
 * em vídeos ou imagens usando canvas.
 * 
 * Baseado na documentação oficial do Remotion:
 * https://www.remotion.dev/docs/video-manipulation#greenscreen-example
 */
import React, { useCallback, useRef } from 'react';
import { AbsoluteFill, OffthreadVideo, useVideoConfig, Img } from 'remotion';

// ========================================
// TIPOS E INTERFACES
// ========================================

export type ChromaKeyColor = 'green' | 'blue' | 'custom';

export interface ChromaKeyConfig {
  /** Cor base para remoção (green, blue, ou custom) */
  color: ChromaKeyColor;
  /** Cor customizada em formato RGB (apenas se color === 'custom') */
  customColor?: { r: number; g: number; b: number };
  /** Limiar para detecção da cor (0-255), padrão: 100 */
  threshold?: number;
  /** Suavização das bordas (0-1), padrão: 0 */
  smoothing?: number;
}

export interface ChromaKeyMediaProps {
  /** URL do vídeo ou imagem */
  src: string;
  /** Tipo de mídia */
  type: 'video' | 'image';
  /** Configuração do chroma key */
  chromaKey: ChromaKeyConfig;
  /** Estilos adicionais para o container */
  style?: React.CSSProperties;
  /** Volume do vídeo (0-1), padrão: 0 (mudo) */
  volume?: number;
  /** Frame inicial do vídeo */
  startFrom?: number;
  /** Frame final do vídeo */
  endAt?: number;
}

// ========================================
// FUNÇÕES AUXILIARES
// ========================================

/**
 * Verifica se um pixel corresponde à cor de chroma key
 */
const isChromaKeyPixel = (
  r: number,
  g: number,
  b: number,
  config: ChromaKeyConfig
): boolean => {
  const threshold = config.threshold ?? 100;
  
  switch (config.color) {
    case 'green':
      // Verde: canal verde alto, vermelho e azul baixos
      return g > threshold && r < threshold && b < threshold;
    
    case 'blue':
      // Azul: canal azul alto, vermelho e verde baixos
      return b > threshold && r < threshold && g < threshold;
    
    case 'custom':
      if (!config.customColor) return false;
      // Cor customizada: verificar proximidade
      const { r: targetR, g: targetG, b: targetB } = config.customColor;
      const distance = Math.sqrt(
        Math.pow(r - targetR, 2) +
        Math.pow(g - targetG, 2) +
        Math.pow(b - targetB, 2)
      );
      return distance < threshold;
    
    default:
      return false;
  }
};

/**
 * Calcula a opacidade do pixel baseado na suavização
 */
const calculateAlpha = (
  r: number,
  g: number,
  b: number,
  config: ChromaKeyConfig
): number => {
  const threshold = config.threshold ?? 100;
  const smoothing = config.smoothing ?? 0;
  
  if (smoothing === 0) {
    return isChromaKeyPixel(r, g, b, config) ? 0 : 255;
  }
  
  let intensity = 0;
  
  switch (config.color) {
    case 'green':
      // Quanto mais verde em relação aos outros canais, mais transparente
      intensity = Math.max(0, g - Math.max(r, b));
      break;
    
    case 'blue':
      intensity = Math.max(0, b - Math.max(r, g));
      break;
    
    case 'custom':
      if (config.customColor) {
        const { r: targetR, g: targetG, b: targetB } = config.customColor;
        const distance = Math.sqrt(
          Math.pow(r - targetR, 2) +
          Math.pow(g - targetG, 2) +
          Math.pow(b - targetB, 2)
        );
        intensity = Math.max(0, threshold - distance);
      }
      break;
  }
  
  // Aplicar suavização
  const smoothRange = threshold * smoothing;
  if (intensity >= threshold) {
    return 0;
  } else if (intensity > threshold - smoothRange) {
    return Math.round(((threshold - intensity) / smoothRange) * 255);
  }
  return 255;
};

// ========================================
// COMPONENTE PRINCIPAL
// ========================================

export const ChromaKeyMedia: React.FC<ChromaKeyMediaProps> = ({
  src,
  type,
  chromaKey,
  style,
  volume = 0,
  startFrom,
  endAt,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height } = useVideoConfig();
  
  // Processar um frame de vídeo
  const onVideoFrame = useCallback(
    (frame: CanvasImageSource) => {
      if (!canvasRef.current) return;
      
      const context = canvasRef.current.getContext('2d');
      if (!context) return;
      
      // Desenhar o frame no canvas
      context.drawImage(frame, 0, 0, width, height);
      
      // Obter dados da imagem
      const imageData = context.getImageData(0, 0, width, height);
      const { data } = imageData;
      
      // Processar cada pixel
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Calcular e aplicar alpha
        data[i + 3] = calculateAlpha(r, g, b, chromaKey);
      }
      
      // Aplicar os dados processados de volta ao canvas
      context.putImageData(imageData, 0, 0);
    },
    [width, height, chromaKey]
  );
  
  // Processar imagem estática
  const processImage = useCallback(
    (img: HTMLImageElement) => {
      if (!canvasRef.current) return;
      
      const context = canvasRef.current.getContext('2d');
      if (!context) return;
      
      // Desenhar a imagem no canvas
      context.drawImage(img, 0, 0, width, height);
      
      // Obter dados da imagem
      const imageData = context.getImageData(0, 0, width, height);
      const { data } = imageData;
      
      // Processar cada pixel
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Calcular e aplicar alpha
        data[i + 3] = calculateAlpha(r, g, b, chromaKey);
      }
      
      // Aplicar os dados processados de volta ao canvas
      context.putImageData(imageData, 0, 0);
    },
    [width, height, chromaKey]
  );
  
  // Callback para quando a imagem carrega
  const handleImageLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      processImage(event.currentTarget);
    },
    [processImage]
  );
  
  return (
    <AbsoluteFill style={style}>
      {type === 'video' ? (
        <>
          {/* Vídeo invisível que dispara o callback de frame */}
          <AbsoluteFill>
            <OffthreadVideo
              style={{ opacity: 0 }}
              onVideoFrame={onVideoFrame}
              src={src}
              volume={volume}
              startFrom={startFrom}
              endAt={endAt}
            />
          </AbsoluteFill>
          
          {/* Canvas que mostra o resultado processado */}
          <AbsoluteFill>
            <canvas
              ref={canvasRef}
              width={width}
              height={height}
              style={{
                width: '100%',
                height: '100%',
              }}
            />
          </AbsoluteFill>
        </>
      ) : (
        <>
          {/* Imagem invisível para carregar */}
          <Img
            src={src}
            style={{ opacity: 0, position: 'absolute' }}
            onLoad={handleImageLoad}
          />
          
          {/* Canvas que mostra o resultado processado */}
          <AbsoluteFill>
            <canvas
              ref={canvasRef}
              width={width}
              height={height}
              style={{
                width: '100%',
                height: '100%',
              }}
            />
          </AbsoluteFill>
        </>
      )}
    </AbsoluteFill>
  );
};

// ========================================
// PRESETS DE CHROMA KEY
// ========================================

/** Preset para tela verde padrão */
export const greenScreenPreset: ChromaKeyConfig = {
  color: 'green',
  threshold: 100,
  smoothing: 0.2,
};

/** Preset para tela azul padrão */
export const blueScreenPreset: ChromaKeyConfig = {
  color: 'blue',
  threshold: 100,
  smoothing: 0.2,
};

/** Preset para verde intenso (usado em estúdios profissionais) */
export const studioGreenPreset: ChromaKeyConfig = {
  color: 'green',
  threshold: 80,
  smoothing: 0.3,
};

/** Preset para azul intenso (usado em estúdios profissionais) */
export const studioBluePreset: ChromaKeyConfig = {
  color: 'blue',
  threshold: 80,
  smoothing: 0.3,
};

export default ChromaKeyMedia;
