import { useState, useRef, useCallback, useEffect } from 'react';

interface UseDesktopAudioTranscriberOptions {
    onTranscription?: (text: string, isFinal: boolean) => void;
    onError?: (error: any) => void;
    chunkIntervalMs?: number; // Intervalo para enviar chunks (default: 100ms)
    sourceId?: string | null; // ID da fonte de áudio (null = sistema inteiro)
}

export const useDesktopAudioTranscriber = (options: UseDesktopAudioTranscriberOptions = {}) => {
    const { 
        onTranscription, 
        onError,
        chunkIntervalMs = 100, // 100ms = 10 chunks por segundo (ótimo para realtime)
        sourceId = null // Por padrão, captura do sistema inteiro
    } = options;
    
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [status, setStatus] = useState<string>('idle');
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const isStoppingRef = useRef<boolean>(false);

    // Listener para transcrições do Deepgram
    useEffect(() => {
        if (!window.electron?.onDesktopTranscription) return;

        const unsubscribe = window.electron.onDesktopTranscription((data: any) => {
            if (onTranscription) {
                onTranscription(data.text, data.isFinal);
            }
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [onTranscription]);

    // Listener para status do Deepgram
    useEffect(() => {
        if (!window.electron?.onDesktopTranscriptionStatus) return;

        const unsubscribe = window.electron.onDesktopTranscriptionStatus((newStatus: string) => {
            setStatus(newStatus);
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    // Listener para erros do Deepgram
    useEffect(() => {
        if (!window.electron?.onDesktopTranscriptionError) return;

        const unsubscribe = window.electron.onDesktopTranscriptionError((error: any) => {
            console.error('[DesktopAudioTranscriber] Error:', error);
            if (onError) onError(error);
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [onError]);

    const startTranscribing = useCallback(async () => {
        if (isTranscribing) return;

        try {
            console.log('[DesktopAudioTranscriber] Iniciando captura de áudio...');
            isStoppingRef.current = false;

            // Pegar a fonte da tela
            const sources = await window.electron.getScreenSources();
            
            // Usar o sourceId fornecido ou pegar tela inteira por padrão
            let source;
            if (sourceId) {
                source = sources.find((s: any) => s.id === sourceId);
                console.log('[DesktopAudioTranscriber] Usando fonte específica:', source?.name);
            } else {
                source = sources.find((s: any) => s.name === 'Entire Screen' || s.name === 'Screen 1') || sources[0];
                console.log('[DesktopAudioTranscriber] Usando sistema inteiro');
            }

            if (!source) {
                throw new Error('Nenhuma fonte de tela encontrada');
            }

            // Capturar vídeo + áudio juntos (requisito do Electron para desktop audio)
            // Mesmo processo do useContinuousRecorder, mas usaremos apenas o áudio
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: source.id
                        }
                    } as any,
                    video: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: source.id,
                            minWidth: 640,
                            maxWidth: 640,
                            minHeight: 480,
                            maxHeight: 480
                        }
                    } as any
                } as any);
                console.log('[DesktopAudioTranscriber] Vídeo + Áudio capturados');
            } catch (err) {
                // Fallback: tentar apenas vídeo
                console.warn('[DesktopAudioTranscriber] Falha ao capturar áudio, tentando só vídeo:', err);
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: source.id,
                            minWidth: 640,
                            maxWidth: 640,
                            minHeight: 480,
                            maxHeight: 480
                        }
                    } as any
                } as any);
            }

            streamRef.current = stream;

            // Verificar se temos áudio
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) {
                console.warn('[DesktopAudioTranscriber] Nenhuma faixa de áudio encontrada!');
                throw new Error('Nenhum áudio capturado. Certifique-se de que o áudio do sistema está sendo reproduzido.');
            }

            console.log('[DesktopAudioTranscriber] Faixas de áudio:', audioTracks.length);

            // Criar AudioContext para processar apenas o áudio
            const audioContext = new AudioContext({ sampleRate: 16000 }); // Deepgram usa 16kHz
            audioContextRef.current = audioContext;

            const sourceNode = audioContext.createMediaStreamSource(stream);
            sourceRef.current = sourceNode;

            // Criar processador de áudio para capturar os chunks
            const bufferSize = 4096;
            const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                if (isStoppingRef.current) return;

                // Pegar os dados de áudio (float32)
                const inputData = e.inputBuffer.getChannelData(0);
                
                // Converter Float32 para Int16 (formato esperado pelo Deepgram)
                const int16Data = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                // Enviar para o Deepgram via IPC
                window.electron.sendDesktopAudioChunk(int16Data.buffer);
            };

            // Conectar os nós
            sourceNode.connect(processor);
            processor.connect(audioContext.destination);

            // Iniciar o Deepgram no backend
            await window.electron.startDesktopTranscription();
            
            setIsTranscribing(true);
            console.log('[DesktopAudioTranscriber] Transcrição iniciada com sucesso!');

        } catch (err) {
            console.error('[DesktopAudioTranscriber] Erro ao iniciar:', err);
            if (onError) onError(err);
        }
    }, [isTranscribing, onError, sourceId]);

    const stopTranscribing = useCallback(async () => {
        console.log('[DesktopAudioTranscriber] Parando...');
        isStoppingRef.current = true;

        // Desconectar e limpar os nós de áudio
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current.onaudioprocess = null;
            processorRef.current = null;
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

        // Parar o Deepgram no backend
        await window.electron.stopDesktopTranscription();

        setIsTranscribing(false);
        setStatus('idle');
        console.log('[DesktopAudioTranscriber] Transcrição parada');
    }, []);

    const changeAudioSource = useCallback(async (newSourceId: string | null) => {
        if (!isTranscribing) {
            console.warn('[DesktopAudioTranscriber] Não está transcrevendo, use startTranscribing');
            return;
        }

        try {
            console.log('[DesktopAudioTranscriber] Trocando fonte de áudio...');
            
            // Parar apenas o stream anterior (não o Deepgram)
            if (processorRef.current) {
                processorRef.current.disconnect();
                processorRef.current.onaudioprocess = null;
                processorRef.current = null;
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

            // Pegar a nova fonte
            const sources = await window.electron.getScreenSources();
            
            let source;
            if (newSourceId) {
                source = sources.find((s: any) => s.id === newSourceId);
                console.log('[DesktopAudioTranscriber] Nova fonte:', source?.name);
            } else {
                source = sources.find((s: any) => s.name === 'Entire Screen' || s.name === 'Screen 1') || sources[0];
                console.log('[DesktopAudioTranscriber] Nova fonte: Sistema inteiro');
            }

            if (!source) {
                throw new Error('Fonte não encontrada');
            }

            // Capturar novo stream
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: source.id
                        }
                    } as any,
                    video: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: source.id,
                            minWidth: 640,
                            maxWidth: 640,
                            minHeight: 480,
                            maxHeight: 480
                        }
                    } as any
                } as any);
            } catch (err) {
                console.warn('[DesktopAudioTranscriber] Falha ao capturar áudio, tentando só vídeo:', err);
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: source.id,
                            minWidth: 640,
                            maxWidth: 640,
                            minHeight: 480,
                            maxHeight: 480
                        }
                    } as any
                } as any);
            }

            streamRef.current = stream;

            // Verificar áudio
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) {
                console.warn('[DesktopAudioTranscriber] Nenhuma faixa de áudio na nova fonte!');
            }

            // Criar novo AudioContext e processador
            const audioContext = new AudioContext({ sampleRate: 16000 });
            audioContextRef.current = audioContext;

            const sourceNode = audioContext.createMediaStreamSource(stream);
            sourceRef.current = sourceNode;

            const bufferSize = 4096;
            const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                if (isStoppingRef.current) return;

                const inputData = e.inputBuffer.getChannelData(0);
                const int16Data = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                window.electron.sendDesktopAudioChunk(int16Data.buffer);
            };

            sourceNode.connect(processor);
            processor.connect(audioContext.destination);

            console.log('[DesktopAudioTranscriber] Fonte trocada com sucesso! Deepgram continua conectado.');

        } catch (err) {
            console.error('[DesktopAudioTranscriber] Erro ao trocar fonte:', err);
            if (onError) onError(err);
        }
    }, [isTranscribing, onError]);

    return {
        isTranscribing,
        status,
        startTranscribing,
        stopTranscribing,
        changeAudioSource
    };
};
