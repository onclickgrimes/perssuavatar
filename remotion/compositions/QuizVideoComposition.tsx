/**
 * Quiz Video Composition
 * 
 * Composição para criar vídeos de quiz interativos.
 * O espectador vê uma pergunta com múltiplas escolhas,
 * tem tempo para pensar, e depois vê a resposta correta revelada.
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
  Audio,
} from 'remotion';
import { z } from 'zod';

// Schema de uma questão
export const quizQuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.string()),
  correctIndex: z.number(),
  explanation: z.string().optional(),
});

// Schema da composição do quiz
export const quizVideoCompositionSchema = z.object({
  theme: z.string(),
  questions: z.array(quizQuestionSchema),
  thinkingTimeSeconds: z.number().default(5),
  showAnswerTimeSeconds: z.number().default(3),
  primaryColor: z.string().default('#8B5CF6'),
  secondaryColor: z.string().default('#EC4899'),
  backgroundColor: z.string().default('#0a0a0f'),
  // Áudio narrado do quiz
  audioUrl: z.string().optional(),
  // Sons de efeito
  questionSound: z.string().optional(),
  correctSound: z.string().optional(),
  wrongSound: z.string().optional(),
  tickSound: z.string().optional(),
});

export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type QuizVideoCompositionProps = z.infer<typeof quizVideoCompositionSchema>;

// Componente de Timer
const Timer: React.FC<{ 
  progress: number; 
  primaryColor: string;
  secondaryColor: string;
}> = ({ progress, primaryColor, secondaryColor }) => {
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference * (1 - progress);
  
  return (
    <div style={{
      position: 'absolute',
      top: 40,
      right: 40,
      width: 100,
      height: 100,
    }}>
      <svg width="100" height="100" viewBox="0 0 100 100">
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
          stroke={`url(#timerGradient)`}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
        <defs>
          <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
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
        fontSize: 32,
        fontWeight: 'bold',
        color: 'white',
        fontFamily: 'Inter, sans-serif',
      }}>
        {Math.ceil(progress * 10)}
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
  delay: number;
  primaryColor: string;
  secondaryColor: string;
}> = ({ label, index, isCorrect, showAnswer, delay, primaryColor, secondaryColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  
  // Animação de entrada
  const slideIn = spring({
    frame: frame - delay,
    fps,
    config: {
      damping: 15,
      stiffness: 100,
    },
  });
  
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
      padding: '20px 24px',
      marginBottom: 16,
      borderRadius: 16,
      backgroundColor: bgColor,
      border: `2px solid ${borderColor}`,
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      transition: 'background-color 0.3s, border-color 0.3s',
    }}>
      {/* Letter badge */}
      <div style={{
        width: 50,
        height: 50,
        borderRadius: 12,
        background: showAnswer && isCorrect 
          ? `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`
          : labelBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        fontWeight: 'bold',
        color: 'white',
        fontFamily: 'Inter, sans-serif',
      }}>
        {letters[index]}
      </div>
      
      {/* Option text */}
      <span style={{
        fontSize: 28,
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
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: isCorrect ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          transform: `scale(${answerReveal})`,
        }}>
          {isCorrect ? '✓' : '✗'}
        </div>
      )}
    </div>
  );
};

// Componente de uma única questão
const QuestionSlide: React.FC<{
  question: QuizQuestion;
  questionNumber: number;
  totalQuestions: number;
  thinkingTimeSeconds: number;
  showAnswerTimeSeconds: number;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
}> = ({ 
  question, 
  questionNumber, 
  totalQuestions,
  thinkingTimeSeconds,
  showAnswerTimeSeconds,
  primaryColor,
  secondaryColor,
  backgroundColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  
  const thinkingFrames = thinkingTimeSeconds * fps;
  const answerFrames = showAnswerTimeSeconds * fps;
  const totalFrames = thinkingFrames + answerFrames;
  
  // Fase atual: "question" ou "answer"
  const isAnswerPhase = frame >= thinkingFrames;
  
  // Progresso do timer
  const timerProgress = interpolate(
    frame,
    [0, thinkingFrames],
    [1, 0],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
  );
  
  // Animação da pergunta
  const questionScale = spring({
    frame,
    fps,
    config: {
      damping: 12,
      stiffness: 80,
    },
  });
  
  // Fade in/out geral
  const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(
    frame,
    [totalFrames - 15, totalFrames],
    [1, 0],
    { extrapolateLeft: 'clamp' }
  );
  const opacity = Math.min(fadeIn, fadeOut);
  
  return (
    <AbsoluteFill style={{
      backgroundColor,
      opacity,
    }}>
      {/* Background gradient effect */}
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
        top: 40,
        left: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{
          padding: '8px 16px',
          borderRadius: 20,
          background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
          fontSize: 18,
          fontWeight: 'bold',
          color: 'white',
          fontFamily: 'Inter, sans-serif',
        }}>
          Questão {questionNumber} / {totalQuestions}
        </div>
      </div>
      
      {/* Timer */}
      {!isAnswerPhase && (
        <Timer 
          progress={timerProgress} 
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
        />
      )}
      
      {/* Answer badge */}
      {isAnswerPhase && (
        <div style={{
          position: 'absolute',
          top: 40,
          right: 40,
          padding: '12px 24px',
          borderRadius: 16,
          background: 'linear-gradient(135deg, #22C55E, #16A34A)',
          fontSize: 20,
          fontWeight: 'bold',
          color: 'white',
          fontFamily: 'Inter, sans-serif',
          transform: `scale(${spring({
            frame: frame - thinkingFrames,
            fps,
            config: { damping: 10, stiffness: 200 },
          })})`,
        }}>
          ✓ RESPOSTA
        </div>
      )}
      
      {/* Main content */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 80,
      }}>
        {/* Question */}
        <div style={{
          transform: `scale(${questionScale})`,
          fontSize: 48,
          fontWeight: 'bold',
          color: 'white',
          textAlign: 'center',
          marginBottom: 60,
          fontFamily: 'Inter, sans-serif',
          textShadow: '0 4px 20px rgba(0,0,0,0.3)',
          maxWidth: 1200,
          lineHeight: 1.3,
        }}>
          {question.question}
        </div>
        
        {/* Options */}
        <div style={{
          width: '100%',
          maxWidth: 900,
        }}>
          {question.options.map((option, index) => (
            <QuizOption
              key={index}
              label={option}
              index={index}
              isCorrect={index === question.correctIndex}
              showAnswer={isAnswerPhase}
              delay={10 + index * 5}
              primaryColor={primaryColor}
              secondaryColor={secondaryColor}
            />
          ))}
        </div>
        
        {/* Explanation (shown during answer phase) */}
        {isAnswerPhase && question.explanation && (
          <div style={{
            marginTop: 40,
            padding: '20px 32px',
            borderRadius: 16,
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            maxWidth: 900,
            transform: `translateY(${interpolate(
              spring({
                frame: frame - thinkingFrames - 10,
                fps,
                config: { damping: 15 },
              }),
              [0, 1],
              [20, 0]
            )}px)`,
            opacity: spring({
              frame: frame - thinkingFrames - 10,
              fps,
              config: { damping: 15 },
            }),
          }}>
            <div style={{
              fontSize: 16,
              color: `${primaryColor}`,
              fontWeight: 'bold',
              marginBottom: 8,
              fontFamily: 'Inter, sans-serif',
            }}>
              💡 Explicação
            </div>
            <div style={{
              fontSize: 22,
              color: 'rgba(255,255,255,0.8)',
              fontFamily: 'Inter, sans-serif',
              lineHeight: 1.5,
            }}>
              {question.explanation}
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// Intro do Quiz
const QuizIntro: React.FC<{
  theme: string;
  totalQuestions: number;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
}> = ({ theme, totalQuestions, primaryColor, secondaryColor, backgroundColor }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  
  const titleScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80 },
  });
  
  const subtitleOpacity = spring({
    frame: frame - 15,
    fps,
    config: { damping: 15 },
  });
  
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp' }
  );
  
  return (
    <AbsoluteFill style={{
      backgroundColor,
      opacity: fadeOut,
    }}>
      {/* Animated background */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `
          radial-gradient(circle at 30% 30%, ${primaryColor}30 0%, transparent 50%),
          radial-gradient(circle at 70% 70%, ${secondaryColor}30 0%, transparent 50%)
        `,
      }} />
      
      {/* Quiz icon */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <div style={{
          width: 150,
          height: 150,
          borderRadius: 40,
          background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 40,
          transform: `scale(${titleScale})`,
          boxShadow: `0 20px 60px ${primaryColor}50`,
        }}>
          <span style={{ fontSize: 80 }}>❓</span>
        </div>
        
        <div style={{
          fontSize: 72,
          fontWeight: 'bold',
          color: 'white',
          textAlign: 'center',
          fontFamily: 'Inter, sans-serif',
          transform: `scale(${titleScale})`,
          marginBottom: 20,
          background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          QUIZ TIME!
        </div>
        
        <div style={{
          fontSize: 36,
          color: 'white',
          textAlign: 'center',
          fontFamily: 'Inter, sans-serif',
          opacity: subtitleOpacity,
          marginBottom: 30,
        }}>
          {theme}
        </div>
        
        <div style={{
          padding: '16px 32px',
          borderRadius: 30,
          backgroundColor: 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.2)',
          fontSize: 24,
          color: 'rgba(255,255,255,0.8)',
          fontFamily: 'Inter, sans-serif',
          opacity: subtitleOpacity,
        }}>
          {totalQuestions} questões
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Composição principal do Quiz
export const QuizVideoComposition: React.FC<QuizVideoCompositionProps> = ({
  theme,
  questions,
  thinkingTimeSeconds = 5,
  showAnswerTimeSeconds = 3,
  primaryColor = '#8B5CF6',
  secondaryColor = '#EC4899',
  backgroundColor = '#0a0a0f',
  audioUrl,
  questionSound,
  correctSound,
}) => {
  const { fps } = useVideoConfig();
  
  const introFrames = 3 * fps; // 3 segundos de intro
  const questionFrames = (thinkingTimeSeconds + showAnswerTimeSeconds) * fps;
  
  return (
    <AbsoluteFill>
      {/* Áudio narrado do quiz */}
      {audioUrl && (
        <Audio src={audioUrl} volume={1} />
      )}

      {/* Intro */}
      <Sequence from={0} durationInFrames={introFrames}>
        <QuizIntro
          theme={theme}
          totalQuestions={questions.length}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          backgroundColor={backgroundColor}
        />
      </Sequence>
      
      {/* Questions */}
      {questions.map((question, index) => (
        <Sequence
          key={index}
          from={introFrames + index * questionFrames}
          durationInFrames={questionFrames}
        >
          <QuestionSlide
            question={question}
            questionNumber={index + 1}
            totalQuestions={questions.length}
            thinkingTimeSeconds={thinkingTimeSeconds}
            showAnswerTimeSeconds={showAnswerTimeSeconds}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            backgroundColor={backgroundColor}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

// Função utilitária para calcular duração total do quiz
export const calculateQuizDuration = (
  questionsCount: number,
  thinkingTimeSeconds: number,
  showAnswerTimeSeconds: number,
  fps: number
): number => {
  const introFrames = 3 * fps;
  const questionFrames = (thinkingTimeSeconds + showAnswerTimeSeconds) * fps;
  return introFrames + questionsCount * questionFrames;
};

// Default props para preview
export const defaultQuizProps: QuizVideoCompositionProps = {
  theme: 'Conhecimentos Gerais',
  questions: [
    {
      question: 'Qual é a capital do Brasil?',
      options: ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador'],
      correctIndex: 2,
      explanation: 'Brasília se tornou a capital do Brasil em 1960, substituindo o Rio de Janeiro.',
    },
    {
      question: 'Quanto é 2 + 2?',
      options: ['3', '4', '5', '22'],
      correctIndex: 1,
    },
    {
      question: 'Qual planeta é conhecido como "Planeta Vermelho"?',
      options: ['Vênus', 'Júpiter', 'Marte', 'Saturno'],
      correctIndex: 2,
      explanation: 'Marte é chamado de Planeta Vermelho devido ao óxido de ferro em sua superfície.',
    },
  ],
  thinkingTimeSeconds: 5,
  showAnswerTimeSeconds: 3,
  primaryColor: '#8B5CF6',
  secondaryColor: '#EC4899',
  backgroundColor: '#0a0a0f',
};
