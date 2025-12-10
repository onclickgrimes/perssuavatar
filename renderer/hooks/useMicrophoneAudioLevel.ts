import { useState, useRef, useEffect, useCallback } from 'react';

interface UseMicrophoneAudioLevelOptions {
    onAudioLevel?: (level: number) => void; // Callback para nível de áudio (0-100)
    updateIntervalMs?: number; // Intervalo de atualização (default: 16ms = ~60fps)
}

export const useMicrophoneAudioLevel = (options: UseMicrophoneAudioLevelOptions = {}) => {
    const { 
        onAudioLevel,
        updateIntervalMs = 16 // 60fps para animação suave
    } = options;
    
    const [isMonitoring, setIsMonitoring] = useState(false);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const audioLevelIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const startMonitoring = useCallback(async () => {
        if (isMonitoring) return;

        try {
            console.log('[MicrophoneAudioLevel] Iniciando monitoramento de áudio do microfone...');

            // Capturar stream do microfone
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            streamRef.current = stream;

            // Criar AudioContext
            const audioContext = new AudioContext();
            audioContextRef.current = audioContext;

            const sourceNode = audioContext.createMediaStreamSource(stream);
            sourceRef.current = sourceNode;

            // Criar AnalyserNode para análise de nível de áudio em tempo real
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256; // Tamanho do FFT (menor = mais rápido)
            analyser.smoothingTimeConstant = 0.8; // Suavização
            analyserRef.current = analyser;

            // Conectar os nós
            sourceNode.connect(analyser);

            // Função para calcular e enviar nível de áudio
            const updateAudioLevel = () => {
                if (!analyserRef.current) return;

                const bufferLength = analyserRef.current.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                analyserRef.current.getByteTimeDomainData(dataArray);

                // Calcular RMS (Root Mean Square) para nível de áudio
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    const normalized = (dataArray[i] - 128) / 128; // Normalizar para -1 a 1
                    sum += normalized * normalized;
                }
                const rms = Math.sqrt(sum / bufferLength);
                const level = Math.min(100, rms * 380); // Converter para 0-100 com boost (+40% ganho visual)

                if (onAudioLevel) {
                    onAudioLevel(level);
                }
            };

            // Atualizar nível de áudio no intervalo especificado
            audioLevelIntervalRef.current = setInterval(updateAudioLevel, updateIntervalMs);
            
            setIsMonitoring(true);
            console.log('[MicrophoneAudioLevel] Monitoramento iniciado com sucesso!');

        } catch (err) {
            console.error('[MicrophoneAudioLevel] Erro ao iniciar:', err);
        }
    }, [isMonitoring, onAudioLevel, updateIntervalMs]);

    const stopMonitoring = useCallback(async () => {
        console.log('[MicrophoneAudioLevel] Parando monitoramento...');

        // Limpar intervalo de atualização de nível de áudio
        if (audioLevelIntervalRef.current) {
            clearInterval(audioLevelIntervalRef.current);
            audioLevelIntervalRef.current = null;
        }

        // Desconectar e limpar os nós de áudio
        if (analyserRef.current) {
            analyserRef.current.disconnect();
            analyserRef.current = null;
        }

        if (sourceRef.current) {
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }

        if (audioContextRef.current) {
            await audioContextRef.current.close();
            audioContextRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        setIsMonitoring(false);
        console.log('[MicrophoneAudioLevel] Monitoramento parado');
    }, []);

    return {
        isMonitoring,
        startMonitoring,
        stopMonitoring
    };
};
