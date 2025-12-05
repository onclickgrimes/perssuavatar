import { useState, useRef, useCallback } from 'react';

export const useScreenRecorder = () => {
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const startRecording = useCallback(async () => {
        try {
            console.log("Solicitando fontes de tela...");
            const sources = await window.electron.getScreenSources();
            
            // Preferência por tela inteira ou a primeira disponível
            const source = sources.find((s: any) => s.name === 'Entire Screen' || s.name === 'Screen 1') || sources[0];
            
            if (!source) {
                console.error("Nenhuma fonte de tela encontrada.");
                return;
            }

            console.log("Fonte selecionada:", source.name);

            // Resolução reduzida (Metade do monitor, assumindo 1920x1080 -> 960x540 ou similar)
            // Para ser dinâmico, pegaríamos window.screen e dividiríamos.
            // Mas getUserMedia constraint 'maxWidth' pode ajudar.
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: source.id,
                        maxWidth: 1920 / 2, // Limite para ajudar no tamanho
                        maxHeight: 1080 / 2,
                        maxFrameRate: 10 // Baixo fps para economizar tamanho
                    }
                } as any
            });

            const options = { mimeType: 'video/webm; codecs=vp9' };
            const mediaRecorder = new MediaRecorder(stream, options);
            
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                console.log("Gravação finalizada. Processando...");
                const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                
                // Conversão para ArrayBuffer para envio via IPC
                const arrayBuffer = await blob.arrayBuffer();
                
                if (blob.size > 20 * 1024 * 1024) {
                    console.warn("Vídeo muito grande. Tente gravar menos tempo.");
                    // Poderíamos implementar lógica de corte ou rejeição aqui.
                }

                console.log(`Enviando vídeo para análise (${(blob.size / 1024 / 1024).toFixed(2)} MB)...`);
                window.electron.analyzeVideo(arrayBuffer);
                
                // Cleanup stream
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            console.log("Gravação iniciada...");

            // Parar automaticamente após 5 segundos para garantir tamanho pequeno (< 20MB)
            // 5s a 10fps e baixa resolução deve ser bem pequeno.
            setTimeout(() => {
                if (mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                    setIsRecording(false);
                }
            }, 5000);

        } catch (err) {
            console.error("Erro ao iniciar gravação:", err);
            setIsRecording(false);
        }
    }, []);

    return {
        isRecording,
        startRecording
    };
};
