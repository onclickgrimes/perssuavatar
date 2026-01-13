/**
 * Quiz Video Synced Composition
 * 
 * Composição para criar vídeos de quiz sincronizados com o áudio.
 * Usa os timestamps de transcrição para sincronizar elementos visuais.
 * 
 * Documentação: https://www.remotion.dev/docs/the-fundamentals
 */
import React, { useMemo } from 'react';
import { 
  AbsoluteFill, 
  useCurrentFrame, 
  useVideoConfig, 
  interpolate,
  spring,
  Audio,
  Sequence,
} from 'remotion';
import { z } from 'zod';

// Schema de um segmento de áudio transcrito
export const audioSegmentSchema = z.object({
  id: z.number(),
  text: z.string(),
  start: z.number(), // segundos
  end: z.number(), // segundos
  words: z.array(z.object({
    word: z.string(),
    start: z.number(),
    end: z.number(),
    confidence: z.number().optional(),
  })).optional(),
});

// Schema de uma questão com timing
export const syncedQuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.string()),
  correctIndex: z.number(),
  explanation: z.string().optional(),
  // Timestamps calculados
  questionStartTime: z.number().optional(), // Quando a pergunta começa
  optionsStartTime: z.number().optional(),  // Quando as opções são lidas
  answerRevealTime: z.number().optional(),  // Quando revelar a resposta
  endTime: z.number().optional(),           // Fim desta questão
});

// Schema da composição sincronizada
export const quizVideoSyncedSchema = z.object({
  theme: z.string(),
  questions: z.array(syncedQuestionSchema),
  primaryColor: z.string().default('#8B5CF6'),
  secondaryColor: z.string().default('#EC4899'),
  backgroundColor: z.string().default('#0a0a0f'),
  // Tema visual (comics = colorido/divertido, vintage = pergaminho/clássico)
  visualTheme: z.enum(['comics', 'vintage']).default('comics'),
  // Áudio
  audioUrl: z.string().optional(),
  audioDuration: z.number().default(0), // Duração total em segundos
  // Segments de transcrição para sincronização (fallback)
  audioSegments: z.array(audioSegmentSchema).optional(),
  // Timestamps precisos por questão (nova geração com rate limiting)
  questionTimestamps: z.array(z.object({
    questionIndex: z.number(),
    startTime: z.number(),
    optionsTime: z.number(),
    answerTime: z.number(),
    endTime: z.number(),
  })).optional(),
  // Tempo extra após cada pergunta (para "pensar")
  thinkingSilenceSeconds: z.number().default(3),
});

export type AudioSegment = z.infer<typeof audioSegmentSchema>;
export type SyncedQuestion = z.infer<typeof syncedQuestionSchema>;
export type QuizVideoSyncedProps = z.infer<typeof quizVideoSyncedSchema>;

// Função para encontrar timestamps de questões
// Prioriza questionTimestamps precisos quando disponíveis
function findQuestionTimings(
  segments: AudioSegment[], 
  questions: SyncedQuestion[],
  thinkingSilenceSeconds: number,
  questionTimestamps?: Array<{
    questionIndex: number;
    startTime: number;
    optionsTime: number;
    answerTime: number;
    endTime: number;
  }>
): SyncedQuestion[] {
  console.log('=== findQuestionTimings ===');
  console.log('segments count:', segments?.length || 0);
  console.log('questions count:', questions.length);
  console.log('questionTimestamps available:', !!questionTimestamps && questionTimestamps.length > 0);
  
  // PRIORIDADE 1: Usar timestamps precisos quando disponíveis (nova geração)
  if (questionTimestamps && questionTimestamps.length === questions.length) {
    console.log('✅ Using PRECISE timestamps from audio generation');
    return questions.map((q, i) => {
      const ts = questionTimestamps[i];
      console.log(`Q${i + 1}: start=${ts.startTime.toFixed(2)}, options=${ts.optionsTime.toFixed(2)}, answer=${ts.answerTime.toFixed(2)}, end=${ts.endTime.toFixed(2)}`);
      return {
        ...q,
        questionStartTime: ts.startTime,
        optionsStartTime: ts.optionsTime,
        answerRevealTime: ts.answerTime,
        endTime: ts.endTime,
      };
    });
  }
  
  // PRIORIDADE 2: Calcular a partir dos segments de transcrição
  // Calcula duração total do áudio
  let totalDuration = 60;
  if (segments && segments.length > 0) {
    const lastSegment = segments[segments.length - 1];
    totalDuration = lastSegment?.end || 60;
  }
  
  // Se não há segments, usa timing fixo como fallback
  if (!segments || segments.length === 0) {
    console.log('No segments, using fallback timing');
    const perQuestion = totalDuration / questions.length;
    return questions.map((q, i) => ({
      ...q,
      questionStartTime: i * perQuestion,
      optionsStartTime: i * perQuestion + 2,
      answerRevealTime: i * perQuestion + perQuestion * 0.8,
      endTime: (i + 1) * perQuestion,
    }));
  }

  // Flatten todas as palavras com timestamps
  const allWords: Array<{word: string, start: number, end: number}> = [];
  segments.forEach(seg => {
    if (seg.words) {
      allWords.push(...seg.words);
    }
  });
  
  console.log('Total words extracted:', allWords.length);

  // Encontrar TODAS as ocorrências de "questão" no áudio
  // Cada uma marca o INÍCIO de uma questão
  const questionMarkers: number[] = [];
  
  for (let w = 0; w < allWords.length; w++) {
    const word = allWords[w].word.toLowerCase();
    // Aceita variações: "questão", "questao"
    if (word.includes('quest')) {
      questionMarkers.push(allWords[w].start);
      console.log(`Found "questão" at ${allWords[w].start.toFixed(2)}s`);
    }
  }
  
  console.log(`Found ${questionMarkers.length} question markers for ${questions.length} questions`);

  // Se não encontrou marcadores, divide igualmente (fallback)
  if (questionMarkers.length === 0) {
    console.log('No question markers found, dividing audio equally');
    const perQuestion = totalDuration / questions.length;
    
    return questions.map((q, i) => ({
      ...q,
      questionStartTime: i * perQuestion,
      optionsStartTime: i * perQuestion + 2,
      answerRevealTime: Math.max(i * perQuestion + 3, (i + 1) * perQuestion - thinkingSilenceSeconds),
      endTime: (i + 1) * perQuestion,
    }));
  }
  
  // Se temos menos marcadores que questões, precisamos descobrir QUAL questão está faltando
  if (questionMarkers.length < questions.length) {
    const missingCount = questions.length - questionMarkers.length;
    console.log(`Missing ${missingCount} question marker(s), analyzing gaps...`);
    
    // Calcular duração média esperada por questão
    const avgQuestionDuration = totalDuration / questions.length;
    
    // Se o primeiro marcador está muito longe do início (>20s ou >30% da duração média),
    // pode ser que tem intro E Q1 começa depois
    const introThreshold = Math.min(20, avgQuestionDuration * 0.5);
    
    if (questionMarkers[0] > introThreshold) {
      // Verificar se há espaço para a intro + Q1 antes do primeiro marcador
      // Se o primeiro marcador está muito longe, Q1 pode estar sem "Questão 1"
      console.log(`First marker at ${questionMarkers[0].toFixed(2)}s, checking if Q1 is missing...`);
      
      // Se o gap até o primeiro marcador é grande demais, assume que Q1 não tem marcador
      if (questionMarkers[0] > avgQuestionDuration * 0.8) {
        console.log('First question seems to not have "Questão" marker, adding start of audio as Q1');
        // Não adiciona 0, mas sim um tempo após a possível intro (5s?)
        const estimatedQ1Start = Math.min(5, questionMarkers[0] - avgQuestionDuration);
        questionMarkers.unshift(Math.max(0, estimatedQ1Start));
      }
    }
    
    // Agora verificar gaps entre marcadores consecutivos para encontrar questões faltantes
    // Um gap muito grande indica que uma questão intermediária não tem marcador
    while (questionMarkers.length < questions.length) {
      let maxGapIndex = -1;
      let maxGap = 0;
      
      // Encontrar o maior gap
      for (let i = 0; i < questionMarkers.length - 1; i++) {
        const gap = questionMarkers[i + 1] - questionMarkers[i];
        if (gap > maxGap) {
          maxGap = gap;
          maxGapIndex = i;
        }
      }
      
      // Também verificar o gap final (do último marcador até o fim)
      const finalGap = totalDuration - questionMarkers[questionMarkers.length - 1];
      
      // Se o maior gap é significativamente maior que a média, inserir um marcador no meio
      if (maxGapIndex >= 0 && maxGap > avgQuestionDuration * 1.5) {
        const insertTime = questionMarkers[maxGapIndex] + (maxGap / 2);
        questionMarkers.splice(maxGapIndex + 1, 0, insertTime);
        console.log(`Inserted missing marker at ${insertTime.toFixed(2)}s (gap was ${maxGap.toFixed(2)}s)`);
      } else {
        // Se não há gaps grandes, adicionar no final
        const lastMarker = questionMarkers[questionMarkers.length - 1];
        const estimatedNext = lastMarker + avgQuestionDuration;
        questionMarkers.push(Math.min(estimatedNext, totalDuration - 5));
        console.log(`Appended marker at ${estimatedNext.toFixed(2)}s`);
      }
    }
  }
  
  // Mapear questões usando os marcadores
  const timedQuestions: SyncedQuestion[] = [];
  
  for (let i = 0; i < questions.length; i++) {
    const questionStartTime = questionMarkers[i] || 0;
    
    // Fim da questão = início da próxima ou fim do áudio
    const endTime = (i < questions.length - 1) 
      ? questionMarkers[i + 1] 
      : totalDuration;
    
    // Opções aparecem 2 segundos após a questão
    const optionsStartTime = questionStartTime + 2;
    
    // Tentar encontrar marcador de resposta DENTRO deste intervalo de tempo
    // para definir o momento exato da revelação visual
    let answerRevealTime = -1;
    
    for (let w = 0; w < allWords.length - 1; w++) {
      const wordStart = allWords[w].start;
      
      // Só procura palavras dentro do tempo desta questão
      if (wordStart >= questionStartTime && wordStart < endTime) {
        const word = allWords[w].word.toLowerCase().replace(/[^a-záàâãéèêíïóôõöúç]/g, '');
        const nextWord = allWords[w + 1]?.word?.toLowerCase().replace(/[^a-záàâãéèêíïóôõöúç]/g, '') || '';
        const thirdWord = allWords[w + 2]?.word?.toLowerCase().replace(/[^a-záàâãéèêíïóôõöúç]/g, '') || '';
        
        // Padrão 1: "resposta" seguido de "correta" ou "certa"
        if (word.includes('resposta') && (nextWord.includes('correta') || nextWord.includes('certa'))) {
          answerRevealTime = allWords[w].start;
          console.log(`✅ Found answer reveal for Q${i+1} at ${answerRevealTime.toFixed(2)}s (pattern: resposta correta/certa)`);
          break;
        }
        
        // Padrão 2: "resposta" seguido de "é" (a resposta é X)
        if (word.includes('resposta') && nextWord === 'é') {
          answerRevealTime = allWords[w].start;
          console.log(`✅ Found answer reveal for Q${i+1} at ${answerRevealTime.toFixed(2)}s (pattern: resposta é)`);
          break;
        }
        
        // Padrão 3: "correta" ou "certa" seguido de "é"
        if ((word.includes('correta') || word.includes('certa')) && nextWord === 'é') {
          answerRevealTime = w > 0 ? allWords[w - 1].start : allWords[w].start;
          console.log(`✅ Found answer reveal for Q${i+1} at ${answerRevealTime.toFixed(2)}s (pattern: correta/certa é)`);
          break;
        }
        
        // Padrão 4: "correta" ou "certa" seguido de letra (a, b, c, d)
        if ((word.includes('correta') || word.includes('certa')) && ['a', 'b', 'c', 'd', 'e', 'f'].includes(nextWord)) {
          answerRevealTime = w > 0 ? allWords[w - 1].start : allWords[w].start;
          console.log(`✅ Found answer reveal for Q${i+1} at ${answerRevealTime.toFixed(2)}s (pattern: correta/certa + letter)`);
          break;
        }
        
        // Padrão 5: "a resposta" seguido de "correta/certa/é"
        if (word === 'a' && nextWord === 'resposta' && (thirdWord.includes('correta') || thirdWord.includes('certa') || thirdWord === 'é')) {
          answerRevealTime = allWords[w].start;
          console.log(`✅ Found answer reveal for Q${i+1} at ${answerRevealTime.toFixed(2)}s (pattern: a resposta ...)`);
          break;
        }
        
        // Padrão 6: Apenas "correta" ou "certa" isolados (fallback menos preciso)
        if ((word === 'correta' || word === 'certa') && !nextWord.includes('questão')) {
          answerRevealTime = w > 0 ? allWords[w - 1].start : allWords[w].start;
          console.log(`✅ Found answer reveal for Q${i+1} at ${answerRevealTime.toFixed(2)}s (pattern: correta/certa isolated)`);
          break;
        }
      }
    }
    
    // Se não encontrou marcador de resposta, usa fallback calculado
    if (answerRevealTime === -1) {
       const questionDuration = endTime - questionStartTime;
       answerRevealTime = Math.max(
        questionStartTime + 3, 
        endTime - Math.min(thinkingSilenceSeconds, questionDuration * 0.25)
      );
      console.log(`⚠️ No answer marker for Q${i+1}, using calculated: ${answerRevealTime.toFixed(2)}s`);
    }

    console.log(`Q${i + 1}: start=${questionStartTime.toFixed(2)}, options=${optionsStartTime.toFixed(2)}, answer=${answerRevealTime.toFixed(2)}, end=${endTime.toFixed(2)}`);
    
    timedQuestions.push({
      ...questions[i],
      questionStartTime,
      optionsStartTime,
      answerRevealTime,
      endTime,
    });
  }
  
  return timedQuestions;
}

// Componente de Timer
const Timer: React.FC<{ 
  progress: number; 
  primaryColor: string;
  secondaryColor: string;
  size?: number;
}> = ({ progress, primaryColor, secondaryColor, size = 100 }) => {
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference * (1 - progress);
  
  return (
    <div style={{
      width: size,
      height: size,
      position: 'relative', // Relative ao container pai
    }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        {/* Background circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="8"
        />
        {/* Progress circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke={`url(#timerGradientSynced)`}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
        <defs>
          <linearGradient id="timerGradientSynced" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={primaryColor} />
            <stop offset="100%" stopColor={secondaryColor} />
          </linearGradient>
        </defs>
      </svg>
      {/* Timer text */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.32,
        fontWeight: 'bold',
        color: 'white',
        fontFamily: 'Inter, sans-serif',
      }}>
        {Math.max(0, Math.ceil(progress * 10))}
      </div>
    </div>
  );
};


// Cores do tema Comics/Cartoon
const COMIC_COLORS = {
  pink: '#E91E8C',        // Rosa magenta vibrante
  pinkDark: '#B8156E',    // Rosa escuro para sombra
  yellow: '#FFE500',      // Amarelo vibrante
  cyan: '#00D4E4',        // Azul turquesa
  cyanDark: '#00A8B5',    // Turquesa escuro
  yellowBg: '#FFE135',    // Amarelo de fundo
  white: '#FFFFFF',
  black: '#1a1a1a',
  green: '#32CD32',       // Verde para resposta correta
  greenDark: '#228B22',
  red: '#E74C3C',         // Vermelho para resposta errada
};

// Componente de Estrela decorativa
const Star: React.FC<{
  x: number;
  y: number;
  size: number;
  rotation?: number;
  color?: string;
}> = ({ x, y, size, rotation = 0, color = COMIC_COLORS.black }) => (
  <div style={{
    position: 'absolute',
    left: x,
    top: y,
    width: size,
    height: size,
    transform: `rotate(${rotation}deg)`,
    fontSize: size,
    color,
    lineHeight: 1,
  }}>
    ★
  </div>
);

// Componente de Opção - Estilo Comics/Cartoon
const QuizOption: React.FC<{
  label: string;
  index: number;
  isCorrect: boolean;
  showAnswer: boolean;
  isVisible: boolean;
  delay: number;
  primaryColor: string;
  secondaryColor: string;
  baseScale?: number;
}> = ({ label, index, isCorrect, showAnswer, isVisible, delay, baseScale = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Animação de entrada
  const slideIn = isVisible ? spring({
    frame: frame - delay,
    fps,
    config: {
      damping: 15,
      stiffness: 100,
    },
  }) : 0;
  
  const translateY = interpolate(slideIn, [0, 1], [50, 0]);
  const opacity = interpolate(slideIn, [0, 1], [0, 1]);
  const scaleAnim = interpolate(slideIn, [0, 1], [0.8, 1]);
  
  // Animação de revelação da resposta
  const answerReveal = showAnswer ? spring({
    frame: frame - delay,
    fps,
    config: {
      damping: 12,
      stiffness: 200,
    },
  }) : 0;
  
  // Cores baseadas no estado
  let bgColor = COMIC_COLORS.pink;
  let shadowColor = COMIC_COLORS.pinkDark;
  let textColor = COMIC_COLORS.yellow;
  let borderColor = COMIC_COLORS.pinkDark;
  
  if (showAnswer) {
    if (isCorrect) {
      bgColor = COMIC_COLORS.green;
      shadowColor = COMIC_COLORS.greenDark;
      textColor = COMIC_COLORS.white;
      borderColor = COMIC_COLORS.greenDark;
    } else {
      bgColor = COMIC_COLORS.red;
      shadowColor = '#A93226';
      textColor = COMIC_COLORS.white;
      borderColor = '#A93226';
    }
  }
  
  const scale = showAnswer && isCorrect ? 1 + answerReveal * 0.08 : 1;
  
  return (
    <div style={{
      transform: `translateY(${translateY}px) scale(${scaleAnim * scale})`,
      opacity,
      marginBottom: 18 * baseScale,
      position: 'relative',
    }}>
      {/* Sombra 3D */}
      <div style={{
        position: 'absolute',
        inset: 0,
        top: 6 * baseScale,
        backgroundColor: shadowColor,
        borderRadius: 50 * baseScale,
        border: `3px solid ${borderColor}`,
      }} />
      
      {/* Botão principal */}
      <div style={{
        position: 'relative',
        padding: `${16 * baseScale}px ${32 * baseScale}px`,
        borderRadius: 50 * baseScale,
        backgroundColor: bgColor,
        border: `3px solid ${borderColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12 * baseScale,
        cursor: 'pointer',
      }}>
        {/* Option text */}
        <span style={{
          fontSize: 32 * baseScale,
          color: textColor,
          fontFamily: "'Nunito', 'Comic Sans MS', sans-serif",
          fontWeight: 800,
          textAlign: 'center',
          textShadow: showAnswer && isCorrect 
            ? `0 2px 4px rgba(0,0,0,0.3)` 
            : 'none',
          letterSpacing: '0.5px',
        }}>
          {label}
        </span>
        
        {/* Indicador de resposta */}
        {showAnswer && (
          <div style={{
            position: 'absolute',
            right: 16 * baseScale,
            width: 36 * baseScale,
            height: 36 * baseScale,
            borderRadius: 18 * baseScale,
            backgroundColor: isCorrect ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24 * baseScale,
            fontWeight: 'bold',
            color: COMIC_COLORS.white,
            transform: `scale(${answerReveal})`,
          }}>
            {isCorrect ? '✓' : '✗'}
          </div>
        )}
      </div>
    </div>
  );
};

// =====================================
// TEMA VINTAGE (Pergaminho/Clássico)
// =====================================

const VINTAGE_COLORS = {
  parchment: '#F5E6C8',       // Cor de pergaminho
  parchmentDark: '#E8D4A8',   // Pergaminho escuro
  brown: '#5D4037',           // Marrom texto
  brownDark: '#3E2723',       // Marrom escuro
  gold: '#C9A227',            // Dourado
  goldDark: '#9E7B12',        // Dourado escuro
  blue: '#2B6CB0',            // Azul opção A
  blueDark: '#1A4971',
  yellow: '#D69E2E',          // Amarelo opção B
  yellowDark: '#B7791F',
  green: '#38A169',           // Verde opção C (correta)
  greenDark: '#276749',
  red: '#C53030',             // Vermelho opção D
  redDark: '#9B2C2C',
  white: '#FFFFFF',
  cream: '#FFF8E7',
};

// Cores das opções para o tema Vintage
const VINTAGE_OPTION_COLORS = [
  { bg: VINTAGE_COLORS.blue, border: VINTAGE_COLORS.blueDark, letter: 'A' },
  { bg: VINTAGE_COLORS.yellow, border: VINTAGE_COLORS.yellowDark, letter: 'B' },
  { bg: VINTAGE_COLORS.green, border: VINTAGE_COLORS.greenDark, letter: 'C' },
  { bg: VINTAGE_COLORS.red, border: VINTAGE_COLORS.redDark, letter: 'D' },
  { bg: VINTAGE_COLORS.gold, border: VINTAGE_COLORS.goldDark, letter: 'E' },
  { bg: VINTAGE_COLORS.brown, border: VINTAGE_COLORS.brownDark, letter: 'F' },
];

// Componente de Opção - Estilo Vintage/Pergaminho
const VintageQuizOption: React.FC<{
  label: string;
  index: number;
  isCorrect: boolean;
  showAnswer: boolean;
  isVisible: boolean;
  delay: number;
  baseScale?: number;
}> = ({ label, index, isCorrect, showAnswer, isVisible, delay, baseScale = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const optionStyle = VINTAGE_OPTION_COLORS[index] || VINTAGE_OPTION_COLORS[0];
  
  // Animação de entrada
  const slideIn = isVisible ? spring({
    frame: frame - delay,
    fps,
    config: {
      damping: 15,
      stiffness: 100,
    },
  }) : 0;
  
  const translateY = interpolate(slideIn, [0, 1], [30, 0]);
  const opacity = interpolate(slideIn, [0, 1], [0, 1]);
  const scaleAnim = interpolate(slideIn, [0, 1], [0.95, 1]);
  
  // Animação de revelação da resposta
  const answerReveal = showAnswer ? spring({
    frame: frame - delay,
    fps,
    config: {
      damping: 12,
      stiffness: 200,
    },
  }) : 0;
  
  // Cores baseadas no estado
  let bgColor = VINTAGE_COLORS.cream;
  let borderColor = optionStyle.border;
  let textColor = VINTAGE_COLORS.brownDark;
  
  if (showAnswer) {
    if (isCorrect) {
      bgColor = '#C6F6D5'; // Verde claro
      borderColor = VINTAGE_COLORS.greenDark;
    } else {
      bgColor = '#FED7D7'; // Vermelho claro
      borderColor = VINTAGE_COLORS.redDark;
    }
  }
  
  const scale = showAnswer && isCorrect ? 1 + answerReveal * 0.05 : 1;
  
  return (
    <div style={{
      transform: `translateY(${translateY}px) scale(${scaleAnim * scale})`,
      opacity,
      marginBottom: 14 * baseScale,
      position: 'relative',
    }}>
      {/* Botão principal */}
      <div style={{
        position: 'relative',
        padding: `${14 * baseScale}px ${20 * baseScale}px`,
        borderRadius: 12 * baseScale,
        backgroundColor: bgColor,
        border: `3px solid ${borderColor}`,
        display: 'flex',
        alignItems: 'center',
        gap: 14 * baseScale,
        boxShadow: '0 3px 8px rgba(0,0,0,0.15)',
      }}>
        {/* Letra da opção */}
        <div style={{
          fontFamily: "'Cinzel', 'Times New Roman', serif",
          fontSize: 28 * baseScale,
          fontWeight: 700,
          color: optionStyle.border,
          minWidth: 35 * baseScale,
        }}>
          {letters[index]}.
        </div>
        
        {/* Texto da opção */}
        <span style={{
          fontSize: 26 * baseScale,
          color: textColor,
          fontFamily: "'Cinzel', 'Times New Roman', serif",
          fontWeight: 600,
          flex: 1,
        }}>
          {label}
        </span>
        
        {/* Indicador de resposta */}
        {showAnswer && isCorrect && (
          <div style={{
            fontSize: 28 * baseScale,
            color: VINTAGE_COLORS.greenDark,
            fontWeight: 'bold',
            transform: `scale(${answerReveal})`,
          }}>
            ✓
          </div>
        )}
      </div>
    </div>
  );
};

// Composição Principal Sincronizada
export const QuizVideoSyncedComposition: React.FC<QuizVideoSyncedProps> = ({
  theme,
  questions,
  primaryColor = '#8B5CF6',
  secondaryColor = '#EC4899',
  backgroundColor = '#0a0a0f',
  visualTheme = 'comics',
  audioUrl,
  audioDuration = 0,
  audioSegments = [],
  questionTimestamps, // Timestamps precisos (nova geração)
  thinkingSilenceSeconds = 3,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig(); // Adicionado width/height
  const isLandscape = width > height;

  // Escala baseada na resolução (referência 1080px de largura mobile)
  const scale = width / 1080;
  // Para landscape, reduz um pouco a escala vertical para caber
  const baseScale = isLandscape ? scale * 0.7 : scale;
  
  // Calcula timings base (sem offset de intro visual extra)
  const baseTimings = useMemo(() => {
    return findQuestionTimings(
      audioSegments || [], 
      questions, 
      thinkingSilenceSeconds,
      questionTimestamps
    );
  }, [audioSegments, questions, thinkingSilenceSeconds, questionTimestamps]);

  // Detecta se há intro falada (se a primeira pergunta começa após 2s)
  const firstQuestionStart = baseTimings[0]?.questionStartTime || 0;
  const hasSpokenIntro = firstQuestionStart > 2.0;
  
  // Se tiver intro falada, não adicionamos tempo extra visual. Se não tiver, adicionamos 3s fixos.
  const visualIntroOffset = hasSpokenIntro ? 0 : 3;

  // Timings finais ajustados
  const timedQuestions = useMemo(() => {
    return baseTimings.map(q => ({
      ...q,
      questionStartTime: (q.questionStartTime || 0) + visualIntroOffset,
      optionsStartTime: (q.optionsStartTime || 0) + visualIntroOffset,
      answerRevealTime: (q.answerRevealTime || 0) + visualIntroOffset,
      endTime: (q.endTime || 0) + visualIntroOffset,
    }));
  }, [baseTimings, visualIntroOffset]);
  
  // Tempo atual em segundos
  const currentTime = frame / fps;
  
  // Encontra a questão atual baseado no tempo
  const currentQuestionIndex = useMemo(() => {
    for (let i = timedQuestions.length - 1; i >= 0; i--) {
      const q = timedQuestions[i];
      if (currentTime >= (q.questionStartTime || 0)) {
        return i;
      }
    }
    // Se não encontrou nenhuma (está antes da primeira), é intro (-1)
    if (timedQuestions.length > 0 && currentTime < timedQuestions[0].questionStartTime) {
      return -1;
    }
    return 0;
  }, [currentTime, timedQuestions]);
  
  const currentQuestion = currentQuestionIndex >= 0 ? timedQuestions[currentQuestionIndex] : null;
  
  // Estado da questão atual
  const isIntro = currentQuestionIndex < 0;
  const isShowingQuestion = currentQuestion && currentTime >= (currentQuestion.questionStartTime || 0);
  const isShowingOptions = currentQuestion && currentTime >= (currentQuestion.optionsStartTime || 0);
  const isShowingAnswer = currentQuestion && currentTime >= (currentQuestion.answerRevealTime || 0);
  
  // Progresso do timer (durante o tempo de "pensar")
  const timerProgress = useMemo(() => {
    if (!currentQuestion || !isShowingOptions || isShowingAnswer) return 0;
    
    const thinkingStart = currentQuestion.optionsStartTime || 0;
    const thinkingEnd = currentQuestion.answerRevealTime || (thinkingStart + thinkingSilenceSeconds);
    const thinkingDuration = thinkingEnd - thinkingStart;
    
    const elapsed = currentTime - thinkingStart;
    return Math.max(0, Math.min(1, 1 - (elapsed / thinkingDuration)));
  }, [currentTime, currentQuestion, isShowingOptions, isShowingAnswer, thinkingSilenceSeconds]);
  
  // Animações
  const questionScale = spring({
    frame: currentQuestionIndex >= 0 ? frame - (timedQuestions[currentQuestionIndex]?.questionStartTime || 0) * fps : frame,
    fps,
    config: { damping: 12, stiffness: 80 },
  });
  
  // Fade in/out
  const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp' }
  );
  const opacity = Math.min(fadeIn, fadeOut);
  
  // Frame onde o áudio deve começar
  const audioStartFrame = Math.ceil(visualIntroOffset * fps);
  
  // =====================================
  // INTRO - Tema Vintage (Pergaminho)
  // =====================================
  if (isIntro && visualTheme === 'vintage') {
    const titleScale = spring({ frame, fps, config: { damping: 12, stiffness: 80 } });
    const subtitleOpacity = spring({ frame: frame - 15, fps, config: { damping: 15 } });
    
    return (
      <AbsoluteFill style={{ backgroundColor: VINTAGE_COLORS.parchment, opacity }}>
        {/* Áudio */}
        {audioUrl && (
          <Sequence from={audioStartFrame} layout="none">
            <Audio src={audioUrl} volume={1} />
          </Sequence>
        )}
        
        {/* Fundo de pergaminho com textura */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(ellipse at center, ${VINTAGE_COLORS.parchment} 0%, ${VINTAGE_COLORS.parchmentDark} 100%)
          `,
        }} />
        
        {/* Bordas decorativas */}
        <div style={{
          position: 'absolute',
          inset: 20 * baseScale,
          border: `8px double ${VINTAGE_COLORS.gold}`,
          borderRadius: 10 * baseScale,
          pointerEvents: 'none',
        }} />
        
        {/* Cantos decorativos */}
        {[
          { top: 10, left: 10 },
          { top: 10, right: 10 },
          { bottom: 10, left: 10 },
          { bottom: 10, right: 10 },
        ].map((pos, i) => (
          <div key={i} style={{
            position: 'absolute',
            ...Object.fromEntries(
              Object.entries(pos).map(([k, v]) => [k, (v as number) * baseScale])
            ),
            fontSize: 40 * baseScale,
            color: VINTAGE_COLORS.gold,
            transform: `scale(${titleScale})`,
          }}>
            ✦
          </div>
        ))}
        
        {/* Título principal */}
        <div style={{
          position: 'absolute',
          top: height * 0.15,
          left: '50%',
          transform: `translateX(-50%) scale(${titleScale})`,
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: "'Cinzel Decorative', 'Times New Roman', serif",
            fontSize: 72 * baseScale,
            fontWeight: 900,
            color: VINTAGE_COLORS.brownDark,
            textShadow: `
              2px 2px 0 ${VINTAGE_COLORS.gold},
              4px 4px 8px rgba(0,0,0,0.3)
            `,
            letterSpacing: '4px',
          }}>
            QUIZ
          </div>
          <div style={{
            fontFamily: "'Cinzel', 'Times New Roman', serif",
            fontSize: 48 * baseScale,
            fontWeight: 700,
            color: VINTAGE_COLORS.brown,
            marginTop: 10 * baseScale,
          }}>
            {theme}
          </div>
        </div>
        
        {/* Ícone central decorativo */}
        <div style={{
          position: 'absolute',
          top: '45%',
          left: '50%',
          transform: `translate(-50%, -50%) scale(${subtitleOpacity})`,
          fontSize: 120 * baseScale,
          opacity: 0.3,
        }}>
          📜
        </div>
        
        {/* Info de questões */}
        <div style={{
          position: 'absolute',
          bottom: height * 0.2,
          left: '50%',
          transform: `translateX(-50%) scale(${subtitleOpacity})`,
          padding: `${20 * baseScale}px ${40 * baseScale}px`,
          backgroundColor: VINTAGE_COLORS.gold + '30',
          borderRadius: 8 * baseScale,
          border: `2px solid ${VINTAGE_COLORS.gold}`,
        }}>
          <span style={{
            fontFamily: "'Cinzel', 'Times New Roman', serif",
            fontSize: 28 * baseScale,
            color: VINTAGE_COLORS.brownDark,
            fontWeight: 600,
          }}>
            📿 {questions.length} questões
          </span>
        </div>
      </AbsoluteFill>
    );
  }
  
  // =====================================
  // INTRO - Tema Comics (Colorido)
  // =====================================
  if (isIntro) {
    const titleScale = spring({ frame, fps, config: { damping: 12, stiffness: 80 } });
    const subtitleOpacity = spring({ frame: frame - 15, fps, config: { damping: 15 } });
    const bounceAnim = spring({ frame, fps, config: { damping: 8, stiffness: 150 } });
    
    return (
      <AbsoluteFill style={{ backgroundColor: COMIC_COLORS.cyan, opacity }}>
        {/* Áudio começa se tiver intro falada OU após o delay visual */}
        {audioUrl && (
          <Sequence from={audioStartFrame} layout="none">
            <Audio src={audioUrl} volume={1} />
          </Sequence>
        )}
        
        {/* Fundo dividido - Turquesa + Amarelo */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(to bottom, ${COMIC_COLORS.cyan} 65%, ${COMIC_COLORS.yellowBg} 65%)`,
        }} />
        
        {/* Estrelas decorativas */}
        <Star x={width * 0.08} y={height * 0.15} size={30 * baseScale} rotation={15} />
        <Star x={width * 0.85} y={height * 0.12} size={24 * baseScale} rotation={-10} />
        <Star x={width * 0.12} y={height * 0.35} size={20 * baseScale} rotation={25} />
        <Star x={width * 0.92} y={height * 0.28} size={18 * baseScale} rotation={-20} />
        <Star x={width * 0.75} y={height * 0.18} size={22 * baseScale} rotation={5} />
        <Star x={width * 0.88} y={height * 0.45} size={16 * baseScale} rotation={30} />
        
        {/* Balão explosivo QUIZ! */}
        <div style={{
          position: 'absolute',
          top: height * 0.02,
          left: '50%',
          transform: `translateX(-50%) scale(${bounceAnim * titleScale})`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          {/* Efeito de raios/explosão */}
          <svg 
            width={450 * baseScale} 
            height={350 * baseScale} 
            viewBox="0 0 450 350" 
            style={{
              position: 'absolute',
              top: 0,
              filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.2))',
              overflow: 'visible',
            }}
          >
            {/* Balão explosivo estilo comic */}
            <path
              d="M225,40 
                 L260,65 L290,35 L295,75 L340,60 L320,100 
                 L370,95 L340,135 L400,145 L350,175 
                 L420,200 L355,215 L400,255 L340,255 
                 L360,300 L300,280 L290,325 L240,290 
                 L200,325 L195,280 L140,305 L160,260 
                 L90,270 L130,230 L50,225 L110,190 
                 L30,175 L95,150 L40,120 L110,120 
                 L70,80 L140,95 L130,55 L190,80 L185,40 Z"
              fill={COMIC_COLORS.pink}
              stroke={COMIC_COLORS.pinkDark}
              strokeWidth="4"
            />
            {/* Padrão de pontos (halftone) */}
            <defs>
              <pattern id="halftone" patternUnits="userSpaceOnUse" width="15" height="15">
                <circle cx="7.5" cy="7.5" r="4" fill="rgba(255,255,255,0.25)" />
              </pattern>
            </defs>
            <ellipse cx="225" cy="185" rx="130" ry="90" fill="url(#halftone)" />
          </svg>
          
          {/* Texto QUIZ! */}
          <div style={{
            position: 'relative',
            fontFamily: "'Bangers', 'Impact', 'Comic Sans MS', sans-serif",
            fontSize: 100 * baseScale,
            fontWeight: 900,
            color: COMIC_COLORS.white,
            textShadow: `
              4px 4px 0 ${COMIC_COLORS.black},
              -2px -2px 0 ${COMIC_COLORS.black},
              2px -2px 0 ${COMIC_COLORS.black},
              -2px 2px 0 ${COMIC_COLORS.black},
              6px 6px 0 ${COMIC_COLORS.pinkDark}
            `,
            letterSpacing: '4px',
            marginTop: 80 * baseScale,
            zIndex: 10,
          }}>
            QUIZ!
          </div>
        </div>
        
        {/* Card central com pergunta do tema */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -30%) scale(${subtitleOpacity})`,
          backgroundColor: COMIC_COLORS.white,
          borderRadius: 50 * baseScale,
          padding: `${70 * baseScale}px ${80 * baseScale}px`,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          border: `6px solid ${COMIC_COLORS.cyanDark}`,
          maxWidth: width * 0.92,
          minWidth: width * 0.75,
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: 52 * baseScale,
            fontWeight: 800,
            color: COMIC_COLORS.black,
            fontFamily: "'Nunito', 'Comic Sans MS', sans-serif",
            lineHeight: 1.4,
            marginBottom: 40 * baseScale,
          }}>
            {theme}
          </div>
          
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 14 * baseScale,
            padding: `${20 * baseScale}px ${40 * baseScale}px`,
            borderRadius: 50 * baseScale,
            backgroundColor: COMIC_COLORS.pink,
            fontSize: 30 * baseScale,
            fontWeight: 700,
            color: COMIC_COLORS.yellow,
            fontFamily: "'Nunito', 'Comic Sans MS', sans-serif",
            boxShadow: `0 5px 0 ${COMIC_COLORS.pinkDark}`,
          }}>
            🎯 {questions.length} questões
          </div>
        </div>
        
        {/* Mão decorativa (canto inferior esquerdo) */}
        <div style={{
          position: 'absolute',
          bottom: height * 0.18,
          left: -20 * baseScale,
          fontSize: 180 * baseScale,
          transform: `rotate(20deg) scale(${subtitleOpacity})`,
          filter: 'drop-shadow(5px 5px 10px rgba(0,0,0,0.2))',
        }}>
          ✌️
        </div>
      </AbsoluteFill>
    );
  }
  
  // =====================================
  // QUESTÕES - Tema Vintage (Pergaminho)
  // =====================================
  if (visualTheme === 'vintage') {
    return (
      <AbsoluteFill style={{ backgroundColor: VINTAGE_COLORS.parchment, opacity }}>
        {/* Áudio */}
        {audioUrl && (
          <Sequence from={audioStartFrame} layout="none">
            <Audio src={audioUrl} volume={1} />
          </Sequence>
        )}
        
        {/* Fundo de pergaminho */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(ellipse at center, ${VINTAGE_COLORS.parchment} 0%, ${VINTAGE_COLORS.parchmentDark} 100%)
          `,
        }} />
        
        {/* Bordas decorativas */}
        <div style={{
          position: 'absolute',
          inset: 15 * baseScale,
          border: `6px double ${VINTAGE_COLORS.gold}`,
          borderRadius: 8 * baseScale,
          pointerEvents: 'none',
        }} />
        
        {/* Título pequeno no topo */}
        <div style={{
          position: 'absolute',
          top: 40 * baseScale,
          left: '50%',
          transform: 'translateX(-50%)',
          textAlign: 'center',
          zIndex: 20,
        }}>
          <div style={{
            fontFamily: "'Cinzel Decorative', 'Times New Roman', serif",
            fontSize: 42 * baseScale,
            fontWeight: 800,
            color: VINTAGE_COLORS.brownDark,
            textShadow: `1px 1px 0 ${VINTAGE_COLORS.gold}`,
          }}>
            Quiz {theme}
          </div>
        </div>
        
        {/* Badge de número da questão */}
        <div style={{
          position: 'absolute',
          top: 100 * baseScale,
          left: 40 * baseScale,
          padding: `${8 * baseScale}px ${18 * baseScale}px`,
          backgroundColor: VINTAGE_COLORS.gold + '40',
          borderRadius: 6 * baseScale,
          border: `2px solid ${VINTAGE_COLORS.gold}`,
          zIndex: 15,
        }}>
          <span style={{
            fontFamily: "'Cinzel', 'Times New Roman', serif",
            fontSize: 18 * baseScale,
            fontWeight: 700,
            color: VINTAGE_COLORS.brownDark,
          }}>
            {currentQuestionIndex + 1} / {questions.length}
          </span>
        </div>
        
        {/* Timer (durante tempo de pensar) */}
        {isShowingOptions && !isShowingAnswer && (
          <div style={{
            position: 'absolute',
            top: 95 * baseScale,
            right: 40 * baseScale,
            zIndex: 15,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8 * baseScale,
              padding: `${8 * baseScale}px ${16 * baseScale}px`,
              backgroundColor: VINTAGE_COLORS.brownDark + '20',
              borderRadius: 6 * baseScale,
              border: `2px solid ${VINTAGE_COLORS.brown}`,
            }}>
              <span style={{
                fontSize: 24 * baseScale,
              }}>⏱️</span>
              <span style={{
                fontFamily: "'Cinzel', 'Times New Roman', serif",
                fontSize: 22 * baseScale,
                fontWeight: 700,
                color: VINTAGE_COLORS.brownDark,
              }}>
                {String(Math.floor(timerProgress * 10)).padStart(2, '0')}:{String(Math.floor((timerProgress * 10 % 1) * 60)).padStart(2, '0')}
              </span>
            </div>
          </div>
        )}
        
        {/* Card principal com pergunta */}
        {currentQuestion && (
          <div style={{
            position: 'absolute',
            top: isLandscape ? '18%' : '16%',
            left: '50%',
            transform: `translateX(-50%) scale(${questionScale})`,
            width: isLandscape ? '88%' : '90%',
            maxWidth: 950 * baseScale,
          }}>
            {/* Pergunta */}
            <div style={{
              fontSize: (isLandscape ? 34 : 32) * baseScale,
              fontWeight: 700,
              color: VINTAGE_COLORS.brownDark,
              textAlign: 'center',
              fontFamily: "'Cinzel', 'Times New Roman', serif",
              marginBottom: 30 * baseScale,
              lineHeight: 1.4,
              padding: `0 ${20 * baseScale}px`,
            }}>
              {currentQuestion.question}
            </div>
            
            {/* Opções */}
            <div style={{
              width: '100%',
              maxWidth: 800 * baseScale,
              margin: '0 auto',
            }}>
              {currentQuestion.options.map((option, index) => (
                <VintageQuizOption
                  key={index}
                  label={option}
                  index={index}
                  baseScale={baseScale * 0.9}
                  isCorrect={index === currentQuestion.correctIndex}
                  showAnswer={isShowingAnswer || false}
                  isVisible={isShowingOptions || false}
                  delay={10 + index * 6}
                />
              ))}
            </div>
            
            {/* Explicação */}
            {isShowingAnswer && currentQuestion.explanation && (
              <div style={{
                marginTop: 25 * baseScale,
                padding: `${18 * baseScale}px ${25 * baseScale}px`,
                borderRadius: 12 * baseScale,
                backgroundColor: VINTAGE_COLORS.gold + '20',
                border: `2px solid ${VINTAGE_COLORS.gold}`,
                transform: `translateY(${interpolate(
                  spring({
                    frame: frame - ((currentQuestion.answerRevealTime || 0) * fps) - 10,
                    fps,
                    config: { damping: 15 },
                  }),
                  [0, 1],
                  [20, 0]
                )}px)`,
                opacity: spring({
                  frame: frame - ((currentQuestion.answerRevealTime || 0) * fps) - 10,
                  fps,
                  config: { damping: 15 },
                }),
              }}>
                <div style={{
                  fontSize: 18 * baseScale,
                  color: VINTAGE_COLORS.gold,
                  fontWeight: 700,
                  marginBottom: 6 * baseScale,
                  fontFamily: "'Cinzel', 'Times New Roman', serif",
                }}>
                  📖 Explicação
                </div>
                <div style={{
                  fontSize: 20 * baseScale,
                  color: VINTAGE_COLORS.brownDark,
                  fontFamily: "'Cinzel', serif",
                  lineHeight: 1.5,
                  fontWeight: 500,
                }}>
                  {currentQuestion.explanation}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Próxima questão / Botão */}
        <div style={{
          position: 'absolute',
          bottom: 40 * baseScale,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 12 * baseScale,
          padding: `${12 * baseScale}px ${24 * baseScale}px`,
          backgroundColor: VINTAGE_COLORS.brownDark,
          borderRadius: 8 * baseScale,
          boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
        }}>
          <span style={{
            fontSize: 18 * baseScale,
            color: VINTAGE_COLORS.cream,
            fontFamily: "'Cinzel', 'Times New Roman', serif",
            fontWeight: 600,
          }}>
            PRÓXIMA
          </span>
        </div>
      </AbsoluteFill>
    );
  }
  
  // =====================================
  // QUESTÕES - Tema Comics (Colorido)
  // =====================================
  // Main Render (Questions)
  return (
    <AbsoluteFill style={{ backgroundColor: COMIC_COLORS.cyan, opacity }}>
      {/* Áudio começa após a intro (ou imediato se tiver intro falada) */}
      {audioUrl && (
        <Sequence from={audioStartFrame} layout="none">
          <Audio src={audioUrl} volume={1} />
        </Sequence>
      )}
      
      {/* Fundo dividido - Turquesa + Amarelo */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `linear-gradient(to bottom, ${COMIC_COLORS.cyan} 65%, ${COMIC_COLORS.yellowBg} 65%)`,
      }} />
      
      {/* Estrelas decorativas */}
      <Star x={width * 0.05} y={height * 0.08} size={28 * baseScale} rotation={10} />
      <Star x={width * 0.92} y={height * 0.05} size={22 * baseScale} rotation={-15} />
      <Star x={width * 0.08} y={height * 0.25} size={18 * baseScale} rotation={20} />
      <Star x={width * 0.88} y={height * 0.18} size={24 * baseScale} rotation={-5} />
      <Star x={width * 0.15} y={height * 0.85} size={20 * baseScale} rotation={25} />
      <Star x={width * 0.85} y={height * 0.75} size={16 * baseScale} rotation={-20} />
      
      {/* Pequeno balão QUIZ! no topo */}
      <div style={{
        position: 'absolute',
        top: 30 * baseScale,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
      }}>
        <svg 
          width={180 * baseScale} 
          height={120 * baseScale} 
          viewBox="0 0 180 120" 
          style={{
            filter: 'drop-shadow(0 5px 15px rgba(0,0,0,0.2))',
          }}
        >
          <path
            d="M90,5 
               L110,15 L125,5 L125,22 L150,15 L140,35 
               L170,38 L145,55 L175,70 L140,75 
               L160,100 L120,90 L110,115 L90,95 
               L70,115 L60,90 L20,100 L40,75 
               L5,70 L35,55 L10,38 L40,35 
               L30,15 L55,22 L55,5 L70,15 Z"
            fill={COMIC_COLORS.pink}
            stroke={COMIC_COLORS.pinkDark}
            strokeWidth="2"
          />
        </svg>
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Bangers', 'Impact', 'Comic Sans MS', sans-serif",
          fontSize: 36 * baseScale,
          fontWeight: 900,
          color: COMIC_COLORS.white,
          textShadow: `
            2px 2px 0 ${COMIC_COLORS.black},
            -1px -1px 0 ${COMIC_COLORS.black},
            1px -1px 0 ${COMIC_COLORS.black},
            -1px 1px 0 ${COMIC_COLORS.black}
          `,
          paddingBottom: 15 * baseScale,
        }}>
          QUIZ!
        </div>
      </div>
      
      {/* Badge de número da questão */}
      <div style={{
        position: 'absolute',
        top: 40 * baseScale,
        left: 40 * baseScale,
        padding: `${10 * baseScale}px ${20 * baseScale}px`,
        borderRadius: 30 * baseScale,
        backgroundColor: COMIC_COLORS.pink,
        fontSize: 18 * baseScale,
        fontWeight: 800,
        color: COMIC_COLORS.yellow,
        fontFamily: "'Nunito', 'Comic Sans MS', sans-serif",
        boxShadow: `0 4px 0 ${COMIC_COLORS.pinkDark}`,
        zIndex: 15,
      }}>
        {currentQuestionIndex + 1} / {questions.length}
      </div>
      
      {/* Timer (durante tempo de pensar) */}
      {isShowingOptions && !isShowingAnswer && (
        <div style={{
          position: 'absolute',
          top: 35 * baseScale,
          right: 40 * baseScale,
          zIndex: 15,
        }}>
          <Timer 
            progress={timerProgress} 
            primaryColor={COMIC_COLORS.pink}
            secondaryColor={COMIC_COLORS.yellow}
            size={90 * baseScale}
          />
        </div>
      )}
      
      {/* Answer badge */}
      {isShowingAnswer && (
        <div style={{
          position: 'absolute',
          top: 40 * baseScale,
          right: 40 * baseScale,
          padding: `${14 * baseScale}px ${28 * baseScale}px`,
          borderRadius: 30 * baseScale,
          backgroundColor: COMIC_COLORS.green,
          fontSize: 22 * baseScale,
          fontWeight: 800,
          color: COMIC_COLORS.white,
          fontFamily: "'Nunito', 'Comic Sans MS', sans-serif",
          boxShadow: `0 4px 0 ${COMIC_COLORS.greenDark}`,
          transform: `scale(${spring({
            frame: frame - ((currentQuestion?.answerRevealTime || 0) * fps),
            fps,
            config: { damping: 10, stiffness: 200 },
          })})`,
          zIndex: 15,
        }}>
          ✓ RESPOSTA
        </div>
      )}
      
      {/* Card principal com pergunta e opções */}
      {currentQuestion && (
        <div style={{
          position: 'absolute',
          top: isLandscape ? '10%' : '22%',
          left: '50%',
          transform: `translateX(-50%) scale(${questionScale})`,
          width: isLandscape ? '92%' : '94%',
          maxWidth: isLandscape ? 1300 * baseScale : 1100 * baseScale,
          backgroundColor: COMIC_COLORS.white,
          borderRadius: (isLandscape ? 35 : 50) * baseScale,
          padding: isLandscape 
            ? `${30 * baseScale}px ${45 * baseScale}px`
            : `${55 * baseScale}px ${60 * baseScale}px`,
          boxShadow: '0 25px 70px rgba(0,0,0,0.18)',
          border: `${isLandscape ? 5 : 7}px solid ${COMIC_COLORS.cyanDark}`,
        }}>
          {/* Pergunta */}
          <div style={{
            fontSize: (isLandscape ? 42 : 52) * baseScale,
            fontWeight: 800,
            color: COMIC_COLORS.black,
            textAlign: 'center',
            fontFamily: "'Nunito', 'Comic Sans MS', sans-serif",
            marginBottom: (isLandscape ? 25 : 50) * baseScale,
            lineHeight: 1.3,
          }}>
            {currentQuestion.question}
          </div>
          
          {/* Opções */}
          <div style={{
            width: '100%',
          }}>
            {currentQuestion.options.map((option, index) => (
              <QuizOption
                key={index}
                label={option}
                index={index}
                baseScale={isLandscape ? baseScale * 0.88 : baseScale * 1.1}
                isCorrect={index === currentQuestion.correctIndex}
                showAnswer={isShowingAnswer || false}
                isVisible={isShowingOptions || false}
                delay={10 + index * 6}
                primaryColor={primaryColor}
                secondaryColor={secondaryColor}
              />
            ))}
          </div>
          
          {/* Explicação */}
          {isShowingAnswer && currentQuestion.explanation && (
            <div style={{
              marginTop: (isLandscape ? 18 : 40) * baseScale,
              padding: isLandscape 
                ? `${15 * baseScale}px ${24 * baseScale}px`
                : `${28 * baseScale}px ${35 * baseScale}px`,
              borderRadius: (isLandscape ? 15 : 25) * baseScale,
              backgroundColor: COMIC_COLORS.cyan + '20',
              border: `${isLandscape ? 3 : 4}px solid ${COMIC_COLORS.cyanDark}`,
              transform: `translateY(${interpolate(
                spring({
                  frame: frame - ((currentQuestion.answerRevealTime || 0) * fps) - 10,
                  fps,
                  config: { damping: 15 },
                }),
                [0, 1],
                [20, 0]
              )}px)`,
              opacity: spring({
                frame: frame - ((currentQuestion.answerRevealTime || 0) * fps) - 10,
                fps,
                config: { damping: 15 },
              }),
            }}>
              <div style={{
                fontSize: (isLandscape ? 16 : 24) * baseScale,
                color: COMIC_COLORS.cyanDark,
                fontWeight: 800,
                marginBottom: (isLandscape ? 6 : 12) * baseScale,
                fontFamily: "'Nunito', 'Comic Sans MS', sans-serif",
              }}>
                💡 Explicação
              </div>
              <div style={{
                fontSize: (isLandscape ? 20 : 32) * baseScale,
                color: COMIC_COLORS.black,
                fontFamily: "'Nunito', 'Comic Sans MS', sans-serif",
                lineHeight: 1.45,
                fontWeight: 600,
              }}>
                {currentQuestion.explanation}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Mão decorativa (canto inferior) */}
      <div style={{
        position: 'absolute',
        bottom: height * 0.02,
        left: -30 * baseScale,
        fontSize: 140 * baseScale,
        transform: 'rotate(25deg)',
        filter: 'drop-shadow(5px 5px 10px rgba(0,0,0,0.15))',
        zIndex: 5,
      }}>
        ✌️
      </div>
      
      {/* Elemento decorativo direita */}
      <div style={{
        position: 'absolute',
        bottom: height * 0.05,
        right: -20 * baseScale,
        fontSize: 100 * baseScale,
        transform: 'rotate(-15deg)',
        filter: 'drop-shadow(5px 5px 10px rgba(0,0,0,0.15))',
        zIndex: 5,
      }}>
        🌟
      </div>
    </AbsoluteFill>
  );
};

// Função para calcular duração total baseada no áudio
export const calculateSyncedQuizDuration = (
  audioDuration: number,
  fps: number
): number => {
  const INTRO_DURATION_SECONDS = 3; // Deve corresponder ao valor na composição
  // Adiciona intro + áudio + buffer
  return Math.ceil((INTRO_DURATION_SECONDS + audioDuration + 1) * fps);
};

// Default props para preview
export const defaultSyncedQuizProps: QuizVideoSyncedProps = {
  theme: 'Quiz Sincronizado',
  questions: [
    {
      question: 'Qual é a capital do Brasil?',
      options: ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador'],
      correctIndex: 2,
      explanation: 'Brasília se tornou a capital do Brasil em 1960.',
    },
  ],
  primaryColor: '#8B5CF6',
  secondaryColor: '#EC4899',
  backgroundColor: '#0a0a0f',
  visualTheme: 'comics',
  audioDuration: 30,
  thinkingSilenceSeconds: 3,
};
