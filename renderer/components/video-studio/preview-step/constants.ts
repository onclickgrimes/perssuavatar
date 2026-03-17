// ========================================
// FILMORA DARK PALETTE  
// ========================================
export const FILMORA = {
  bg:         '#14151a',   // Fundo geral (preto azulado)
  bgDark:     '#1e1f26',   // Painéis laterais / TopBar / Timeline Header
  bgDarker:   '#0d0e12',   // Fundo base da timeline
  surface:    '#2b2d38',   // Cards / Inputs / Containers internos
  surfaceAlt: '#383a48',   // Containers em hover
  border:     '#313340',   // Bordas sutis de divisão
  borderLight:'#474a5c',   // Bordas de destaque
  accent:     '#00e5ff',   // Ciano do Filmora (primário)
  accentDark: '#00b3cc',   // Ciano escuro
  accentHover:'#33ebff',   // Ciano hover
  text:       '#e1e1e3',   // Texto principal claro
  textMuted:  '#9ca3af',   // Texto secundário (ícones inativos)
  textDim:    '#6b7280',   // Texto terciário
  playhead:   '#ff3b5c',   // Playhead vermelho
  trackVideo: '#818cf8',   // Trilha de vídeo
  trackImage: '#38bdf8',   // Trilha de imagem
  trackAudio: '#34d399',   // Trilha de áudio
  ruler:      '#1e1f26',   // Fundo da Régua
  rulerText:  '#9ca3af',   // Texto da Régua
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
