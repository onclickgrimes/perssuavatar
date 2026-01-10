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


// Componente de Opção
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
}> = ({ label, index, isCorrect, showAnswer, isVisible, delay, primaryColor, secondaryColor, baseScale = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  
  // Animação de entrada
  const slideIn = isVisible ? spring({
    frame: frame - delay,
    fps,
    config: {
      damping: 15,
      stiffness: 100,
    },
  }) : 0;
  
  const translateX = interpolate(slideIn, [0, 1], [100, 0]);
  const opacity = interpolate(slideIn, [0, 1], [0, 1]);
  
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
  let bgColor = 'rgba(255,255,255,0.05)';
  let borderColor = 'rgba(255,255,255,0.1)';
  let labelBg = 'rgba(255,255,255,0.1)';
  
  if (showAnswer) {
    if (isCorrect) {
      bgColor = 'rgba(34, 197, 94, 0.15)';
      borderColor = 'rgba(34, 197, 94, 0.5)';
      labelBg = 'rgba(34, 197, 94, 0.3)';
    } else {
      bgColor = 'rgba(239, 68, 68, 0.1)';
      borderColor = 'rgba(239, 68, 68, 0.3)';
      labelBg = 'rgba(239, 68, 68, 0.2)';
    }
  }
  
  const scale = showAnswer && isCorrect ? 1 + answerReveal * 0.05 : 1;
  
  return (
    <div style={{
      transform: `translateX(${translateX}px) scale(${scale})`,
      opacity,
      padding: `${20 * baseScale}px ${24 * baseScale}px`,
      marginBottom: 16 * baseScale,
      borderRadius: 16 * baseScale,
      backgroundColor: bgColor,
      border: `2px solid ${borderColor}`,
      display: 'flex',
      alignItems: 'center',
      gap: 20 * baseScale,
      transition: 'background-color 0.3s, border-color 0.3s',
    }}>
      {/* Letter badge */}
      <div style={{
        width: 50 * baseScale,
        height: 50 * baseScale,
        borderRadius: 12 * baseScale,
        background: showAnswer && isCorrect 
          ? `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`
          : labelBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24 * baseScale,
        fontWeight: 'bold',
        color: 'white',
        fontFamily: 'Inter, sans-serif',
      }}>
        {letters[index]}
      </div>
      
      {/* Option text */}
      <span style={{
        fontSize: 28 * baseScale,
        color: 'white',
        fontFamily: 'Inter, sans-serif',
        fontWeight: 500,
        flex: 1,
      }}>
        {label}
      </span>
      
      {/* Correct/Wrong indicator */}
      {showAnswer && (
        <div style={{
          width: 40 * baseScale,
          height: 40 * baseScale,
          borderRadius: 20 * baseScale,
          backgroundColor: isCorrect ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24 * baseScale,
          transform: `scale(${answerReveal})`,
        }}>
          {isCorrect ? '✓' : '✗'}
        </div>
      )}
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
  
  // Intro
  if (isIntro) {
    const titleScale = spring({ frame, fps, config: { damping: 12, stiffness: 80 } });
    const subtitleOpacity = spring({ frame: frame - 15, fps, config: { damping: 15 } });
    
    return (
      <AbsoluteFill style={{ backgroundColor, opacity }}>
        {/* Áudio começa se tiver intro falada OU após o delay visual */}
        {audioUrl && (
          <Sequence from={audioStartFrame} layout="none">
            <Audio src={audioUrl} volume={1} />
          </Sequence>
        )}
        
        {/* Background gradient */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(circle at 30% 30%, ${primaryColor}30 0%, transparent 50%),
            radial-gradient(circle at 70% 70%, ${secondaryColor}30 0%, transparent 50%)
          `,
        }} />
        
        {/* Content */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <div style={{
            width: 150 * baseScale,
            height: 150 * baseScale,
            borderRadius: 40 * baseScale,
            background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 40 * baseScale,
            transform: `scale(${titleScale})`,
            boxShadow: `0 20px 60px ${primaryColor}50`,
          }}>
            <span style={{ fontSize: 80 * baseScale }}>❓</span>
          </div>
          
          <div style={{
            fontSize: 72 * baseScale,
            fontWeight: 'bold',
            color: 'white',
            textAlign: 'center',
            fontFamily: 'Inter, sans-serif',
            transform: `scale(${titleScale})`,
            marginBottom: 20 * baseScale,
            background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            QUIZ TIME!
          </div>
          
          <div style={{
            fontSize: 36 * baseScale,
            color: 'white',
            textAlign: 'center',
            fontFamily: 'Inter, sans-serif',
            opacity: subtitleOpacity,
            marginBottom: 30 * baseScale,
            padding: `0 ${40 * baseScale}px`,
          }}>
            {theme}
          </div>
          
          <div style={{
            padding: `${16 * baseScale}px ${32 * baseScale}px`,
            borderRadius: 30 * baseScale,
            backgroundColor: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            fontSize: 24 * baseScale,
            color: 'rgba(255,255,255,0.8)',
            fontFamily: 'Inter, sans-serif',
            opacity: subtitleOpacity,
          }}>
            {questions.length} questões
          </div>
        </div>
      </AbsoluteFill>
    );
  }
  
  // Main Render (Questions)
  return (
    <AbsoluteFill style={{ backgroundColor, opacity }}>
      {/* Áudio começa após a intro (ou imediato se tiver intro falada) */}
      {audioUrl && (
        <Sequence from={audioStartFrame} layout="none">
          <Audio src={audioUrl} volume={1} />
        </Sequence>
      )}
      
      {/* Background gradient */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `
          radial-gradient(ellipse at top left, ${primaryColor}15 0%, transparent 50%),
          radial-gradient(ellipse at bottom right, ${secondaryColor}15 0%, transparent 50%)
        `,
      }} />
      
      {/* Question number badge */}
      <div style={{
        position: 'absolute',
        top: 40 * baseScale,
        left: 40 * baseScale,
        display: 'flex',
        alignItems: 'center',
        gap: 12 * baseScale,
      }}>
        <div style={{
          padding: `${8 * baseScale}px ${16 * baseScale}px`,
          borderRadius: 20 * baseScale,
          background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
          fontSize: 18 * baseScale,
          fontWeight: 'bold',
          color: 'white',
          fontFamily: 'Inter, sans-serif',
        }}>
          Questão {currentQuestionIndex + 1} / {questions.length}
        </div>
      </div>
      
      {/* Timer (durante tempo de pensar) */}
      {isShowingOptions && !isShowingAnswer && (
        <div style={{
          position: 'absolute',
          top: 40 * baseScale,
          right: 40 * baseScale,
          zIndex: 10,
        }}>
          <Timer 
            progress={timerProgress} 
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            size={100 * baseScale}
          />
        </div>
      )}
      
      {/* Answer badge */}
      {isShowingAnswer && (
        <div style={{
          position: 'absolute',
          top: 40 * baseScale,
          right: 40 * baseScale,
          padding: `${12 * baseScale}px ${24 * baseScale}px`,
          borderRadius: 16 * baseScale,
          background: 'linear-gradient(135deg, #22C55E, #16A34A)',
          fontSize: 20 * baseScale,
          fontWeight: 'bold',
          color: 'white',
          fontFamily: 'Inter, sans-serif',
          transform: `scale(${spring({
            frame: frame - ((currentQuestion?.answerRevealTime || 0) * fps),
            fps,
            config: { damping: 10, stiffness: 200 },
          })})`,
          zIndex: 10,
        }}>
          ✓ RESPOSTA
        </div>
      )}
      
      {/* Main content */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: isLandscape ? 'row' : 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: isLandscape ? 40 * baseScale : 80 * baseScale,
        gap: isLandscape ? 60 * baseScale : 0,
      }}>
        {/* Question */}
        {currentQuestion && (
          <>
            <div style={{
              flex: isLandscape ? 1 : 'none',
              transform: `scale(${questionScale})`,
              fontSize: (isLandscape ? 56 : 48) * baseScale,
              fontWeight: 'bold',
              color: 'white',
              textAlign: isLandscape ? 'left' : 'center',
              marginBottom: isLandscape ? 0 : 60 * baseScale,
              fontFamily: 'Inter, sans-serif',
              textShadow: '0 4px 20px rgba(0,0,0,0.3)',
              maxWidth: isLandscape ? 'none' : 1200 * baseScale,
              lineHeight: 1.3,
            }}>
              {currentQuestion.question}
            </div>
            
            {/* Options */}
            <div style={{
              flex: isLandscape ? 1 : 'none',
              width: '100%',
              maxWidth: (isLandscape ? 800 : 900) * baseScale,
            }}>
              {currentQuestion.options.map((option, index) => (
                <QuizOption
                  key={index}
                  label={option}
                  index={index}
                  baseScale={baseScale}
                  isCorrect={index === currentQuestion.correctIndex}
                  showAnswer={isShowingAnswer || false}
                  isVisible={isShowingOptions || false}
                  delay={10 + index * 5}
                  primaryColor={primaryColor}
                  secondaryColor={secondaryColor}
                />
              ))}
            </div>
            
            {/* Explanation */}
            {isShowingAnswer && currentQuestion.explanation && (
              <div style={{
                marginTop: 40 * baseScale,
                padding: `${20 * baseScale}px ${32 * baseScale}px`,
                borderRadius: 16 * baseScale,
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                maxWidth: (isLandscape ? 800 : 900) * baseScale,
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
                  fontSize: 16 * baseScale,
                  color: primaryColor,
                  fontWeight: 'bold',
                  marginBottom: 8 * baseScale,
                  fontFamily: 'Inter, sans-serif',
                }}>
                  💡 Explicação
                </div>
                <div style={{
                  fontSize: 22 * baseScale,
                  color: 'rgba(255,255,255,0.8)',
                  fontFamily: 'Inter, sans-serif',
                  lineHeight: 1.5,
                }}>
                  {currentQuestion.explanation}
                </div>
              </div>
            )}
          </>
        )}
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
  audioDuration: 30,
  thinkingSilenceSeconds: 3,
};
