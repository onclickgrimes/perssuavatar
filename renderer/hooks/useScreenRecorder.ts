import { useState, useRef, useCallback } from 'react';

export const useScreenRecorder = () => {
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const accumulatedSizeRef = useRef<number>(0);
    const stopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const debugIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const startTimeRef = useRef<number>(0);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        if (stopTimeoutRef.current) {
            clearTimeout(stopTimeoutRef.current);
            stopTimeoutRef.current = null;
        }
        if (debugIntervalRef.current) {
            clearInterval(debugIntervalRef.current);
            debugIntervalRef.current = null;
        }
        setIsRecording(false);
    }, []);

    const startRecording = useCallback(async () => {
        try {
            console.log("Solicitando fontes de tela...");
            const sources = await window.electron.getScreenSources();
            
            const source = sources.find((s: any) => s.name === 'Entire Screen' || s.name === 'Screen 1') || sources[0];
            
            if (!source) {
                console.error("Nenhuma fonte de tela encontrada.");
                return;
            }

            console.log("Fonte selecionada:", source.name);

            // Resolução Dinâmica (Metade do monitor)
            const screenWidth = window.screen.width;
            const screenHeight = window.screen.height;
            const halfWidth = Math.round(screenWidth / 2);
            const halfHeight = Math.round(screenHeight / 2);

            console.log(`Configurando captura para: ${halfWidth}x${halfHeight} (Metade de ${screenWidth}x${screenHeight})`);

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: source.id,
                        maxWidth: halfWidth, 
                        maxHeight: halfHeight,
                        maxFrameRate: 15 // Aumentado para 15 conforme pedido
                    }
                } as any
            });

            // Limite de segurança (19.5MB)
            const MAX_VIDEO_SIZE = 19.5 * 1024 * 1024;
            
            const options = { 
                mimeType: 'video/webm; codecs=vp9',
                bitsPerSecond: 1500000 // 1.5 Mbps bitrate control
            };
            
            const mediaRecorder = new MediaRecorder(stream, options);
            
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];
            accumulatedSizeRef.current = 0;
            startTimeRef.current = Date.now();

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                    accumulatedSizeRef.current += e.data.size;

                    // CORTE AUTOMÁTICO (Hard Limit)
                    if (accumulatedSizeRef.current >= MAX_VIDEO_SIZE) {
                        console.warn("Limite de tamanho atingido! Parando gravação...");
                        stopRecording();
                    }
                }
            };

            mediaRecorder.onstop = async () => {
                console.log("Gravação finalizada. Processando...");
                const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                
                const arrayBuffer = await blob.arrayBuffer();
                
                console.log(`Enviando vídeo para análise (${(blob.size / 1024 / 1024).toFixed(2)} MB)...`);
                window.electron.analyzeVideo(arrayBuffer);
                
                stream.getTracks().forEach(track => track.stop());
            };

            // start(1000) para disparar ondataavailable a cada 1s e checar o tamanho
            mediaRecorder.start(1000); 
            setIsRecording(true);
            console.log("Gravação iniciada...");

            // Timeout de segurança opcional (ex: 60s) para não gravar eternamente se o vídeo for muito leve
            // Removido timeout curto de 5s. Agora para pelo tamanho ou manually.
            // Mas vamos colocar um limite máximo de tempo por precaução (e.g. 5 minutos)
            stopTimeoutRef.current = setTimeout(() => {
                console.warn("Tempo máximo de gravação atingido (5 min). Parando...");
                stopRecording();
            }, 5 * 60 * 1000);

            // Debug Interval
            debugIntervalRef.current = setInterval(() => {
                const duration = ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
                const sizeMB = (accumulatedSizeRef.current / 1024 / 1024).toFixed(2);
                console.log(`🎥 Gravando: ${duration}s | Tamanho: ${sizeMB} MB`);
            }, 1000); 

        } catch (err) {
            console.error("Erro ao iniciar gravação:", err);
            setIsRecording(false);
        }
    }, [stopRecording]);

    return {
        isRecording,
        startRecording,
        stopRecording
    };
};
