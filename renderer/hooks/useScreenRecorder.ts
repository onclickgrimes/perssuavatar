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
        let stream: MediaStream | null = null;
        let micStream: MediaStream | null = null;
        let audioContext: AudioContext | null = null;
        let mixedStream: MediaStream | null = null;

        try {
            console.log("Solicitando fontes de tela...");
            const sources = await window.electron.getScreenSources();
            
            const source = sources.find((s: any) => s.name === 'Entire Screen' || s.name === 'Screen 1') || sources[0];
            
            if (!source) {
                console.error("Nenhuma fonte de tela encontrada.");
                return;
            }

            console.log("Fonte selecionada:", source.name);

            const screenWidth = window.screen.width;
            const screenHeight = window.screen.height;
            const halfWidth = Math.round(screenWidth / 2);
            const halfHeight = Math.round(screenHeight / 2);

            console.log(`Configurando captura para: ${halfWidth}x${halfHeight} (Metade de ${screenWidth}x${screenHeight})`);

            // 1. Capture Screen Video + System Audio
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    mandatory: {
                        chromeMediaSource: 'desktop'
                    }
                },
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: source.id,
                        maxWidth: halfWidth, 
                        maxHeight: halfHeight,
                        maxFrameRate: 15
                    }
                } as any
            } as any);

            // 2. Capture Microphone Audio
            try {
                micStream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true
                    }, 
                    video: false 
                });
                console.log("Microfone capturado com sucesso.");
            } catch (e) {
                console.warn("Não foi possível acessar o microfone:", e);
            }

            // 3. Mix Audio Streams if Microphone exists
            if (micStream && stream.getAudioTracks().length > 0) {
                 audioContext = new AudioContext();
                 const dest = audioContext.createMediaStreamDestination();

                 const sysSource = audioContext.createMediaStreamSource(stream);
                 const micSource = audioContext.createMediaStreamSource(micStream);
                 
                 sysSource.connect(dest);
                 micSource.connect(dest);

                 const mixedAudioTrack = dest.stream.getAudioTracks()[0];
                 mixedStream = new MediaStream([
                     ...stream.getVideoTracks(),
                     mixedAudioTrack
                 ]);
                 console.log("Áudio do sistema e microfone mixados.");
            } else if (micStream) {
                // Only Mic + Video (No system audio detected, or failed)
                const mixedAudioTrack = micStream.getAudioTracks()[0];
                mixedStream = new MediaStream([
                    ...stream.getVideoTracks(),
                    mixedAudioTrack
                ]);
                console.log("Usando apenas áudio do microfone.");
            } else {
                // Fallback to whatever 'stream' has (System Audio or nothing)
                mixedStream = stream;
                console.log("Usando áudio original do sistema (sem mic).");
            }

            // 4. Setup MediaRecorder
            const MAX_VIDEO_SIZE = 19.5 * 1024 * 1024;
            const options = { 
                mimeType: 'video/webm; codecs=vp9',
                bitsPerSecond: 1500000 
            };
            
            // Use local variable for referencing inside closures/events without ref.current lag
            const mediaRecorder = new MediaRecorder(mixedStream!, options);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];
            accumulatedSizeRef.current = 0;
            startTimeRef.current = Date.now();

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                    accumulatedSizeRef.current += e.data.size;

                    // Hard Limit Check
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
                
                // Cleanup
                if (stream) stream.getTracks().forEach(track => track.stop());
                if (micStream) micStream.getTracks().forEach(track => track.stop());
                if (audioContext) audioContext.close();
                if (mixedStream) mixedStream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start(1000); 
            setIsRecording(true);
            console.log("Gravação iniciada...");

            stopTimeoutRef.current = setTimeout(() => {
                console.warn("Tempo máximo de gravação atingido (5 min). Parando...");
                stopRecording();
            }, 5 * 60 * 1000);

            debugIntervalRef.current = setInterval(() => {
                const duration = ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
                const sizeMB = (accumulatedSizeRef.current / 1024 / 1024).toFixed(2);
                console.log(`🎥 Gravando: ${duration}s | Tamanho: ${sizeMB} MB`);
            }, 1000); 

        } catch (err) {
            console.error("Erro ao iniciar gravação:", err);
            setIsRecording(false);
            // Cleanup on error
            if (stream) stream.getTracks().forEach(track => track.stop());
            if (micStream) micStream.getTracks().forEach(track => track.stop());
        }
    }, [stopRecording]);

    return {
        isRecording,
        startRecording,
        stopRecording
    };
};
