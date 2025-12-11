import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { AVATAR_CONFIG, AvatarGesture, AvatarMood } from '../lib/avatar-config';

// Declare type for window.avatar
declare global {
  interface Window {
    avatar: {
      setMood: (mood: AvatarMood) => void;
      playGesture: (gesture: AvatarGesture) => void;
      setScale: (scale: number) => void;
    }
  }
}

interface AvatarProps {
  modelName: string;
  uiOpen: boolean;
}

export default function Avatar({ modelName, uiOpen }: AvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [model, setModel] = useState<any>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSpeakingRef = useRef(false);
  const isGesturingRef = useRef(false);
  const uiOpenRef = useRef(uiOpen);

  const appRef = useRef<PIXI.Application | null>(null);
  const currentModelWrapperRef = useRef<PIXI.Container | null>(null);
  const currentMoodRef = useRef<AvatarMood>('neutral');
  const baseScaleRef = useRef<number>(1);

  // Streaming Audio Refs (MP3/MediaSource)
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // PCM Streaming Refs (Gemini Live)
  const pcmContextRef = useRef<AudioContext | null>(null);
  const pcmNextStartTimeRef = useRef(0);
  const pcmPendingSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

    // Helper to execute model actions
    const executeAction = (model: any, action: any) => {
        if (!model) return;

        console.log('Executing Avatar Action:', action);

        if (action.type === 'expression') {
            model.expression(action.name);
        } else if (action.type === 'motion') {
            // Priority 3 = Force play
            model.motion(action.group, action.index, 3);
        } else if (action.type === 'parameter') {
            const coreModel = model.internalModel?.coreModel;
            if (!coreModel) return;

            // Se for um valor único, aplica diretamente
            if (typeof action.value === 'number') {
                coreModel.setParameterValueById(action.id, action.value);
            } 
            // Se for Array, executa animação procedural
            else if (Array.isArray(action.value)) {
                if (!appRef.current) return;

                const values = action.value;
                const duration = action.duration || 1000;
                const startTime = Date.now();
                const totalSteps = values.length - 1;
                
                const animate = () => {
                    const now = Date.now();
                    const progress = Math.min((now - startTime) / duration, 1);
                    
                    // Encontrar em qual segmento da animação estamos
                    // Ex: 5 valores = 4 segmentos (0-0.25, 0.25-0.5, etc)
                    const segmentProgress = progress * totalSteps; 
                    const currentIndex = Math.floor(segmentProgress);
                    const nextIndex = Math.min(currentIndex + 1, totalSteps);
                    const localProgress = segmentProgress - currentIndex; // Progresso dentro do segmento (0 a 1)

                    const startVal = values[currentIndex];
                    const endVal = values[nextIndex];
                    
                    // Interpolação Linear Simples
                    const currentVal = startVal + (endVal - startVal) * localProgress;
                    
                    // Aplica valor com prioridade UTILITY pra vencer as físicas padrão
                    coreModel.setParameterValueById(action.id, currentVal);

                    if (progress >= 1) {
                         appRef.current?.ticker.remove(animate);
                         // Garante valor final
                         coreModel.setParameterValueById(action.id, values[values.length - 1]);
                    }
                };

                // Adiciona ao ticker
                appRef.current.ticker.add(animate, undefined, PIXI.UPDATE_PRIORITY.UTILITY);
            }
        }
    };

    // Expose control methods to window
    useEffect(() => {
        window.avatar = {
            setMood: (mood: AvatarMood) => {
                currentMoodRef.current = mood;
                const config = AVATAR_CONFIG[modelName];
                if (config && config.moods[mood] && model) {
                    // Reset other mood params for Yuki-like models if necessary
                    if(modelName === 'Yuki' || modelName === 'DevilYuki') {
                         // Inclui Buttons e Params de Expressão na limpeza
                         // Yuki IDs + DevilYuki IDs
                         const idsToReset = [
                             'BlackFace', 'Corar', 'Cry', 'HeartEye', 'NoBrightEye', 'ParamEyeExpression1', 'ParamEyeExpression2', // Yuki
                             'ParamSwitch1', 'ParamSwitch2', 'ParamSwitch3', 'ParamSwitch4', 'ParamSwitch5', 'ParamSwitch6', // DevilYuki
                             'ParamSwitch7', 'ParamSwitch8', 'ParamSwitch9', 'ParamSwitch10', 'ParamSwitch11', 'ParamSwitch21' // DevilYuki
                         ];

                         idsToReset.forEach(id => {
                             if (model.internalModel?.coreModel) {
                                 model.internalModel.coreModel.setParameterValueById(id, 0);
                             }
                         });
                    }
                    executeAction(model, config.moods[mood]);
                }
            },
            playGesture: (gesture: AvatarGesture) => {
                const config = AVATAR_CONFIG[modelName];
                if (config && config.gestures[gesture] && model) {
                    executeAction(model, config.gestures[gesture]);
                }
            },
            setScale: (scale: number) => {
                if (model && baseScaleRef.current) {
                    // Use stored base scale and multiply by user preference
                    const finalScale = baseScaleRef.current * scale;
                    console.log(`Setting avatar scale: base=${baseScaleRef.current.toFixed(3)}, multiplier=${scale}, final=${finalScale.toFixed(3)}`);
                    model.scale.set(finalScale);
                }
            }
        };
    }, [model, modelName]);

  // Keep uiOpenRef in sync
  useEffect(() => {
    uiOpenRef.current = uiOpen;
    console.log('[Avatar] uiOpen changed:', uiOpen);
  }, [uiOpen]);

  // 1. Initialize PIXI App (Once)
  useEffect(() => {
    if (!canvasRef.current) return;

    // Expose PIXI globally for pixi-live2d-display
    (window as any).PIXI = PIXI;

    console.log("Initializing PIXI Application...");
    const app = new PIXI.Application({
      view: canvasRef.current,
      backgroundAlpha: 0,
      resizeTo: window,
      autoStart: true,
    });
    appRef.current = app;

    // Handle Window Resize for App
    const handleResize = () => {
        if (!appRef.current) return;
        // Center wrapper if it exists
        const wrapper = appRef.current.stage.children[0] as PIXI.Container;
        if (wrapper) {
            wrapper.x = window.innerWidth / 2;
            wrapper.y = window.innerHeight / 2;
        }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      console.log("Destroying PIXI Application...");
      window.removeEventListener('resize', handleResize);
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, []); // Run once on mount

  // 2. Load Model when modelName changes
  useEffect(() => {
    if (!appRef.current) return;

    let isCancelled = false;
    const app = appRef.current;

    const loadModel = async () => {
        // Init Live2D framework if needed
        if (!(window as any).Live2DCubismCore) {
            console.log('Waiting for Live2DCubismCore...');
            setTimeout(loadModel, 100);
            return;
        }

        const { Live2DModel } = require('pixi-live2d-display/cubism4');

        // Clean up previous model
        if (currentModelWrapperRef.current) {
            console.log("Removing previous model...");
            app.stage.removeChild(currentModelWrapperRef.current);
            currentModelWrapperRef.current.destroy({ children: true });
            currentModelWrapperRef.current = null;
            setModel(null);
        }

        // Find dynamic model file
        let fileName = `${modelName}.model3.json`;
        try {
            const foundFile = await window.electron.findModelFile(modelName);
            if (foundFile) {
                console.log(`Found model file for ${modelName}: ${foundFile}`);
                fileName = foundFile;
            } else {
                console.warn(`No .model3.json found for ${modelName}, trying default.`);
            }
        } catch (err) {
            console.error("Error finding model file:", err);
        }
        
        const modelUrl = `/models/${modelName}/${fileName}`;
        console.log(`Loading new model from: ${modelUrl}`);

        try {
            const loadedModel = await Live2DModel.from(modelUrl);
            
            if (isCancelled || !app.renderer) {
                loadedModel.destroy();
                return;
            }

            console.log("Model loaded successfully!", loadedModel);

            // Wrap model
            const modelWrapper = new PIXI.Container();
            modelWrapper.interactive = true;
            modelWrapper.buttonMode = true;
            modelWrapper.x = window.innerWidth / 2;
            modelWrapper.y = window.innerHeight / 2;

            // Setup model
            loadedModel.x = 0;
            loadedModel.y = 0;
            loadedModel.anchor.set(0.5, 0.5);

            console.log(`Dimensions: ${loadedModel.width}x${loadedModel.height}`);
            const scaleX = window.innerWidth / loadedModel.width;
            const scaleY = window.innerHeight / loadedModel.height;
            const scale = Math.min(scaleX, scaleY) * 0.8;
            console.log(`Calculated Base Scale: ${scale}`);
            
            // Store base scale for later use
            baseScaleRef.current = scale;
            loadedModel.scale.set(scale);
            loadedModel.interactive = false;
            loadedModel.interactiveChildren = false;

            // Hit Area
            modelWrapper.hitArea = new PIXI.Rectangle(
                -loadedModel.width / 2,
                -loadedModel.height / 2,
                loadedModel.width,
                loadedModel.height
            );

            modelWrapper.addChild(loadedModel);
            app.stage.addChild(modelWrapper);
            
            currentModelWrapperRef.current = modelWrapper;
            setModel(loadedModel);

            // Interaction
            modelWrapper.on('pointerover', () => window.electron.setIgnoreMouseEvents(false));
            modelWrapper.on('pointerout', () => window.electron.setIgnoreMouseEvents(true, { forward: true }));
            
            // Initial ignore
            window.electron.setIgnoreMouseEvents(true, { forward: true });

        } catch (e) {
            console.error("FAILED to load Live2D model:", e);
        }
    };

    loadModel();

    return () => {
        isCancelled = true;
    };
  }, [modelName]); // Re-run when modelName changes

  // 3. Audio/LipSync - relies on 'model' state
  useEffect(() => {
    if (!model) return;
    // --- Streaming Audio Logic ---

    const cleanupAudio = () => {
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        if (mediaSourceRef.current) {
            // Check state before changing?
            mediaSourceRef.current = null;
        }
        sourceBufferRef.current = null;
        audioQueueRef.current = [];
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        
        if (model.internalModel && model.internalModel.coreModel) {
             model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', 0);
        }
    };

    const setupAudioAnalysis = (audioElement: HTMLAudioElement) => {
        // Reuse context if possible, or create new
        if (audioContextRef.current) audioContextRef.current.close();
        
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaElementSource(audioElement);
        const analyser = audioContext.createAnalyser();
        
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        setIsSpeaking(true);
        isSpeakingRef.current = true;

        if (model.internalModel && model.internalModel.focusController) {
            model.internalModel.focusController.focus(0, 0);
        }

        const updateLipSync = () => {
            if (audioElement.paused || audioElement.ended) {
                 if (appRef.current) appRef.current.ticker.remove(updateLipSync);
                 setIsSpeaking(false);
                 isSpeakingRef.current = false;
                 // Reset mouth
                 if (model.internalModel && model.internalModel.coreModel) {
                     model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', 0);
                }
                 return;
            }
            
            analyser.getByteFrequencyData(dataArray);
            
            let sum = 0;
            for(let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;
            const mouthOpen = Math.min(1.0, average / 40);
            
            if (model.internalModel && model.internalModel.coreModel) {
                 model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', mouthOpen);
            }
        };

        if (appRef.current) {
            appRef.current.ticker.add(updateLipSync, undefined, PIXI.UPDATE_PRIORITY.UTILITY);
        }

        // Random Gesture
        const randomGesture = Math.random() > 0.6;
        if (randomGesture) {
            const gestures: AvatarGesture[] = ['nod', 'shake_head', 'tilt_head_left', 'tilt_head_right', 'look_around'];
            const selected = gestures[Math.floor(Math.random() * gestures.length)];
            if (window.avatar) window.avatar.playGesture(selected);
        }
    };

    const processAudioQueue = () => {
        if (!sourceBufferRef.current || sourceBufferRef.current.updating) return;
        
        if (audioQueueRef.current.length > 0) {
            const chunk = audioQueueRef.current.shift();
            try {
                if (chunk) sourceBufferRef.current.appendBuffer(chunk);
            } catch (e) {
                console.error("Error appending buffer:", e);
            }
        }
    };

    const initMediaSource = () => {
        if (mediaSourceRef.current) return;
        
        cleanupAudio(); // Ensure clean slate

        const ms = new MediaSource();
        mediaSourceRef.current = ms;
        
        const audio = new Audio();
        audio.src = URL.createObjectURL(ms);
        audioRef.current = audio;

        ms.addEventListener('sourceopen', () => {
            if (mediaSourceRef.current?.readyState !== 'open') return;
            
            try {
                // Check if sourceBuffer already exists (rare)
                if (ms.sourceBuffers.length > 0) return;

                const sb = ms.addSourceBuffer('audio/mpeg');
                sourceBufferRef.current = sb;
                sb.addEventListener('updateend', processAudioQueue);
                
                // Process any initial chunks
                processAudioQueue();
            } catch (e) {
                console.error("Error creating SourceBuffer:", e);
            }
        });

        // Start playing immediately (it will buffer)
        audio.play().catch(e => console.error("Error playing stream:", e));
        
        // Setup LipSync
        setupAudioAnalysis(audio);
    };

    const handleAudioChunk = async (chunkData: any) => {
        // Detect format: PCM from Gemini Live has {data, mimeType} structure
        // MP3 from classic mode is raw binary data (ArrayBuffer, Uint8Array, or Buffer-like)
        
        const isPcmFormat = chunkData && 
            typeof chunkData === 'object' && 
            'data' in chunkData && 
            'mimeType' in chunkData;

        if (!isPcmFormat) {
            // Classic mode: MP3 streaming - accumulate chunks, play on audio-end
            
            // Convert to Uint8Array for accumulation
            let bytes: Uint8Array;
            if (chunkData instanceof ArrayBuffer) {
                bytes = new Uint8Array(chunkData);
            } else if (chunkData instanceof Uint8Array) {
                bytes = chunkData;
            } else if (ArrayBuffer.isView(chunkData)) {
                bytes = new Uint8Array(chunkData.buffer, chunkData.byteOffset, chunkData.byteLength);
            } else {
                try {
                    bytes = new Uint8Array(chunkData);
                } catch (e) {
                    console.error("[Audio] Unknown chunk format:", typeof chunkData);
                    return;
                }
            }
            
            // Accumulate in queue (we'll combine them in handleAudioEnd)
            audioQueueRef.current.push(bytes.buffer as ArrayBuffer);
            return;
        }

        // Live mode: PCM base64 format from Gemini Live
        const { data: base64Data, mimeType } = chunkData;
        if (!base64Data) return;

        // Parse sample rate from mimeType (e.g., "audio/pcm;rate=24000")
        const rateMatch = /rate=(\d+)/i.exec(mimeType);
        const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;

        // Decode base64 to Int16 PCM
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const pcmData = new Int16Array(bytes.buffer);

        if (pcmData.length === 0) return;

        // Create/resume AudioContext with analyser for continuous lip sync
        if (!pcmContextRef.current) {
            pcmContextRef.current = new AudioContext();
            pcmNextStartTimeRef.current = 0;
        }
        const ctx = pcmContextRef.current;
        if (ctx.state === 'suspended') await ctx.resume();

        // Always set speaking state when receiving audio chunks
        if (!isSpeakingRef.current) {
            setIsSpeaking(true);
            isSpeakingRef.current = true;
            
            // Look forward when speaking (reset focus)
            if (model?.internalModel?.focusController) {
                model.internalModel.focusController.focus(0, 0);
            }
        }

        // Convert Int16 to Float32 for Web Audio
        const floatData = new Float32Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
            floatData[i] = pcmData[i] / 0x8000;
        }

        // Create AudioBuffer
        const buffer = ctx.createBuffer(1, floatData.length, sampleRate);
        buffer.getChannelData(0).set(floatData);

        // Create analyser for lip sync
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        
        // Schedule playback with minimal latency
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(analyser);
        analyser.connect(ctx.destination);

        const now = ctx.currentTime;
        const leadTime = 0.05; // 50ms lead time for smooth playback
        if (pcmNextStartTimeRef.current < now + leadTime) {
            pcmNextStartTimeRef.current = now + leadTime;
        }

        // Start lip sync animation when this source starts playing
        const sourceStartTime = pcmNextStartTimeRef.current;
        const sourceDuration = buffer.duration;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const updateLipSync = () => {
            const currentTime = ctx.currentTime;
            
            // Check if this source is currently playing
            if (currentTime >= sourceStartTime && currentTime < sourceStartTime + sourceDuration) {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                const average = sum / bufferLength;
                const mouthOpen = Math.min(1.0, average / 40);
                
                if (model?.internalModel?.coreModel) {
                    model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', mouthOpen);
                }
            }
            
            // Continue animation while source is pending
            if (pcmPendingSourcesRef.current.has(source)) {
                requestAnimationFrame(updateLipSync);
            }
        };

        source.onended = () => {
            pcmPendingSourcesRef.current.delete(source);
            if (pcmPendingSourcesRef.current.size === 0) {
                setIsSpeaking(false);
                isSpeakingRef.current = false;
                if (model?.internalModel?.coreModel) {
                    model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', 0);
                }
            }
        };

        source.start(pcmNextStartTimeRef.current);
        pcmPendingSourcesRef.current.add(source);
        pcmNextStartTimeRef.current += buffer.duration;

        // Start lip sync animation
        requestAnimationFrame(updateLipSync);
    };

    const handleAudioEnd = () => {
        // Classic mode: combine accumulated MP3 chunks and play
        if (audioQueueRef.current.length > 0) {
            console.log("[Audio] Combining", audioQueueRef.current.length, "MP3 chunks to play");
            
            // Combine all chunks
            const totalLength = audioQueueRef.current.reduce((acc, chunk) => acc + chunk.byteLength, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of audioQueueRef.current) {
                combined.set(new Uint8Array(chunk), offset);
                offset += chunk.byteLength;
            }
            audioQueueRef.current = [];
            
            // Play as blob
            const blob = new Blob([combined], { type: 'audio/mpeg' });
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audioRef.current = audio;
            
            audio.play()
                .then(() => setupAudioAnalysis(audio))
                .catch(e => console.error("[Audio] Error playing combined MP3:", e));
        }
        
        // MediaSource cleanup (if it was used)
        if (mediaSourceRef.current && mediaSourceRef.current.readyState === 'open') {
            try {
                mediaSourceRef.current.endOfStream();
            } catch(e) { /* ignore if updating */ }
        }
    };

    const handlePlayAudio = (buffer: ArrayBuffer) => {
        cleanupAudio(); // Stop streaming or previous audio

        const blob = new Blob([buffer], { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        
        audio.play()
            .then(() => setupAudioAnalysis(audio))
            .catch(e => console.error("Error playing audio:", e));
    };

    const unsubscribeAudio = window.electron.onPlayAudio(handlePlayAudio);
    
    // Subscribe to Streaming Events
    const unsubscribeAudioChunk = (window.electron as any).onAudioChunk ? (window.electron as any).onAudioChunk(handleAudioChunk) : () => {};
    const unsubscribeAudioEnd = (window.electron as any).onAudioEnd ? (window.electron as any).onAudioEnd(handleAudioEnd) : () => {};

    
    const unsubscribeTranscription = window.electron.onTranscription((text) => {
        console.log("🎤 User Transcription:", text);
    });

    const unsubscribeAi = window.electron.onAiResponse((text) => {
        console.log("🤖 AI Response:", text);
    });

    // Subscribe to global mouse tracking ALWAYS - but hit test logic will check uiOpenRef
    console.log('[Avatar] Creating global mouse listener. Current uiOpen:', uiOpenRef.current);
    
    // If UI is currently open, immediately disable hit testing
    if (uiOpenRef.current) {
        console.log('[Avatar] UI is open on listener creation - ensuring mouse events are enabled');
        window.electron.setIgnoreMouseEvents(false);
    }
    
    const unsubscribeGlobalMouse = window.electron.onGlobalMouseMove(({ x, y }) => {
        // --- 1. Eye Tracking Logic ---
        if (!model || isSpeakingRef.current || isGesturingRef.current) return;
        const windowX = window.screenX;
        const windowY = window.screenY;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const centerX = windowX + windowWidth / 2;
        const centerY = windowY + windowHeight / 2;
        const offsetX = x - centerX;
        const offsetY = y - centerY;
        const sensitivity = 1000; 
        const lookX = Math.max(-1, Math.min(1, offsetX / sensitivity));
        const lookY = Math.max(-1, Math.min(1, -offsetY / sensitivity)); 

        if (model.internalModel && model.internalModel.focusController) {
            model.internalModel.focusController.focus(lookX, lookY);
        }

        // --- 2. Hit Test Logic for Click-Through ---
        // ALWAYS check uiOpenRef before modifying mouse events
        if (uiOpenRef.current) {
            // UI is open - don't interfere with mouse events
            return;
        }
        
        if (currentModelWrapperRef.current && appRef.current) {
             // Convert global coordinates to canvas-local coordinates
             const localX = x - windowX;
             const localY = y - windowY;

             // Hit testing on the container
             const bounds = currentModelWrapperRef.current.getBounds();
             
             // Check if point is inside bounds
             const isInside = (
                 localX >= bounds.x &&
                 localX <= bounds.x + bounds.width &&
                 localY >= bounds.y &&
                 localY <= bounds.y + bounds.height
             );

             // Only change state if it transitions
             if (isInside) {
                  window.electron.setIgnoreMouseEvents(false);
                  canvasRef.current?.classList.add('drag');
             } else {
                  window.electron.setIgnoreMouseEvents(true, { forward: true });
                  canvasRef.current?.classList.remove('drag');
             }
        }
    });

    const unsubscribeAvatarAction = window.electron.onAvatarAction(({ type, value }) => {
        console.log(`Received Avatar Action IPC: ${type} -> ${value}`);
        if (window.avatar) {
            if (type === 'mood') {
                window.avatar.setMood(value as AvatarMood);
            } else if (type === 'gesture') {
                window.avatar.playGesture(value as AvatarGesture);
            }
        }
    });

    // Handle audio interruption (user barge-in) - stop all playback immediately
    const handleAudioInterrupted = () => {
        console.log("[Audio] Interrupted - stopping playback");
        
        // Stop PCM streaming audio
        pcmPendingSourcesRef.current.forEach(source => {
            try { source.stop(); } catch {}
        });
        pcmPendingSourcesRef.current.clear();
        pcmNextStartTimeRef.current = 0;
        
        // Stop regular audio
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        
        // Reset speaking state
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        if (model?.internalModel?.coreModel) {
            model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', 0);
        }
    };
    
    const unsubscribeInterrupted = (window.electron as any).onAudioInterrupted 
        ? (window.electron as any).onAudioInterrupted(handleAudioInterrupted) 
        : () => {};

    return () => {
        console.log('[Avatar] Cleaning up listeners and audio contexts');
        unsubscribeAudio();
        unsubscribeAudioChunk();
        unsubscribeAudioEnd();
        unsubscribeTranscription();
        unsubscribeAi();
        unsubscribeGlobalMouse();
        unsubscribeAvatarAction();
        unsubscribeInterrupted();
        cleanupAudio();
        
        // Cleanup PCM streaming
        if (pcmContextRef.current) {
            pcmContextRef.current.close();
            pcmContextRef.current = null;
        }
        pcmPendingSourcesRef.current.forEach(source => {
            try { source.stop(); } catch {}
        });
        pcmPendingSourcesRef.current.clear();
    };
  }, [model]);

  return <canvas ref={canvasRef} className="w-full h-full pointer-events-none" />;
}

