// ========================================
// FILMORA DARK PALETTE  
// ========================================
export const FILMORA = {
  bg:         '#1a1a2e',   // Fundo geral
  bgDark:     '#0f0f1e',   // Painéis laterais / timeline
  bgDarker:   '#0a0a16',   // Fundo da timeline
  surface:    '#21213b',   // Cards / Containers
  surfaceAlt: '#2a2a4a',   // Containers hover
  border:     '#2d2d52',   // Bordas
  borderLight:'#3a3a60',   // Bordas mais claras
  accent:     '#00d4aa',   // Verde/Teal Filmora (primário)
  accentDark: '#00b894',   // Verde escuro
  accentHover:'#00e8bc',   // Verde hover
  text:       '#e8e8f0',   // Texto principal
  textMuted:  '#8888aa',   // Texto secundário
  textDim:    '#555570',   // Texto dim
  playhead:   '#ff3b5c',   // Playhead vermelho
  trackVideo: '#6c5ce7',   // Trilha vídeo — roxo
  trackImage: '#0984e3',   // Trilha imagem — azul
  trackAudio: '#00b894',   // Trilha áudio — verde (matching accent)
  ruler:      '#16162e',   // Régua
  rulerText:  '#6666aa',   // Texto régua
};

// ========================================
// CONSTANTES DA TIMELINE
// ========================================
export const MIN_ZOOM = 5;
export const MAX_ZOOM = 300;
export const DEFAULT_ZOOM = 60;

export const getRulerSteps = (zoom: number) => {
  if (zoom < 10) return { major: 60, minor: 10 };
  if (zoom < 20) return { major: 30, minor: 5 };
  if (zoom < 50) return { major: 15, minor: 5 };
  if (zoom < 100) return { major: 5, minor: 1 };
  if (zoom < 200) return { major: 2, minor: 1 };
  return { major: 1, minor: 0.5 };
};

export const formatTimecode = (totalSec: number): string => {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const f = Math.round((totalSec % 1) * 30);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
};

export const formatRulerTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:00`;
  return `00:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:00`;
};
