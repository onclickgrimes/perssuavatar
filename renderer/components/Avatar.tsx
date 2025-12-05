import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';

export default function Avatar() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [model, setModel] = useState<any>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const appRef = useRef<PIXI.Application | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Expose PIXI globally for pixi-live2d-display
    (window as any).PIXI = PIXI;
    
    let isMounted = true;

    const init = () => {
        if (!isMounted) return;

        if (!(window as any).Live2DCubismCore) {
            console.log('Waiting for Live2DCubismCore...');
            setTimeout(init, 100);
            return;
        }

        // Import Live2DModel dynamically
        const { Live2DModel } = require('pixi-live2d-display/cubism4');

        const app = new PIXI.Application({
          view: canvasRef.current!,
          backgroundAlpha: 0,
          resizeTo: window,
          autoStart: true,
        });
        appRef.current = app;

        // Load Model from public/models
        const modelUrl = '/models/freeca/model.model3.json';

        Live2DModel.from(modelUrl).then((loadedModel: any) => {
            if (!isMounted || !appRef.current) {
                loadedModel.destroy();
                return;
            }

            // Wrap model in a container to handle interaction safely
            const modelWrapper = new PIXI.Container();
            modelWrapper.interactive = true;
            modelWrapper.buttonMode = true;

            // Center wrapper
            modelWrapper.x = window.innerWidth / 2;
            modelWrapper.y = window.innerHeight / 2;

            // Setup model inside wrapper
            // Model should be at (0,0) of the wrapper
            loadedModel.x = 0;
            loadedModel.y = 0;
            loadedModel.anchor.set(0.5, 0.5);
            
            // Auto-scale
            const scaleX = window.innerWidth / loadedModel.width;
            const scaleY = window.innerHeight / loadedModel.height;
            const scale = Math.min(scaleX, scaleY) * 0.8;
            loadedModel.scale.set(scale);

            // Disable interaction on the model itself to prevent crashes
            loadedModel.interactive = false;
            loadedModel.interactiveChildren = false;

            // Add model to wrapper
            modelWrapper.addChild(loadedModel);

            // Define hitArea for the wrapper based on model size
            // Since model is centered at (0,0) with anchor 0.5, the bounds are -w/2 to w/2
            const bounds = loadedModel.getBounds();
            // We can use a simple rectangle based on scaled size
            modelWrapper.hitArea = new PIXI.Rectangle(
                -loadedModel.width / 2,
                -loadedModel.height / 2,
                loadedModel.width,
                loadedModel.height
            );

            appRef.current.stage.addChild(modelWrapper);
            setModel(loadedModel); // Keep reference to model for lip sync

            // Mouse events on the wrapper
            modelWrapper.on('pointerover', () => {
                 window.electron.setIgnoreMouseEvents(false);
            });
            modelWrapper.on('pointerout', () => {
                 window.electron.setIgnoreMouseEvents(true, { forward: true });
            });
        });

        // Initial ignore
        window.electron.setIgnoreMouseEvents(true, { forward: true });
    };

    init();

    // Handle Window Resize
    const handleResize = () => {
        if (!appRef.current) return;
        const app = appRef.current;
        
        // Center wrapper
        const modelWrapper = app.stage.children[0] as PIXI.Container; 
        if (modelWrapper) {
            modelWrapper.x = window.innerWidth / 2;
            modelWrapper.y = window.innerHeight / 2;
        }
    };

    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('resize', handleResize);
        isMounted = false;
        if (appRef.current) {
            appRef.current.destroy(true, { children: true });
            appRef.current = null;
        }
    };
  }, []);

  const isSpeakingRef = useRef(false);

  // Handle Audio & Lip Sync
  useEffect(() => {
    if (!model) return;

    const handlePlayAudio = (buffer: ArrayBuffer) => {
        const blob = new Blob([buffer], { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        
        const audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(audio);
        const analyser = audioContext.createAnalyser();
        
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        let animationId: number;
        setIsSpeaking(true);
        isSpeakingRef.current = true;

        // Force look forward immediately when speaking starts
        if (model.internalModel && model.internalModel.focusController) {
            model.internalModel.focusController.focus(0, 0);
        }

        const updateLipSync = () => {
            if (audio.paused || audio.ended) {
                cancelAnimationFrame(animationId);
                if (model.internalModel && model.internalModel.coreModel) {
                     model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', 0);
                }
                setIsSpeaking(false);
                isSpeakingRef.current = false;
                return;
            }
            
            analyser.getByteFrequencyData(dataArray);
            
            let sum = 0;
            for(let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;
            const mouthOpen = Math.min(1.0, average / 50);
            
            if (model.internalModel && model.internalModel.coreModel) {
                 model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', mouthOpen);
            }
            
            animationId = requestAnimationFrame(updateLipSync);
        };
        
        audio.play().catch(e => console.error("Error playing audio:", e));
        updateLipSync();
    };

    const unsubscribeAudio = window.electron.onPlayAudio(handlePlayAudio);
    
    const unsubscribeTranscription = window.electron.onTranscription((text) => {
        console.log("🎤 User Transcription:", text);
    });

    const unsubscribeAi = window.electron.onAiResponse((text) => {
        console.log("🤖 AI Response:", text);
    });

    // Global Mouse Tracking
    const unsubscribeGlobalMouse = window.electron.onGlobalMouseMove(({ x, y }) => {
        // Use ref to check current speaking state inside the closure
        if (!model || isSpeakingRef.current) return;

        // Calculate position relative to the window center
        // window.screenX/Y gives the window position on the screen
        const windowX = window.screenX;
        const windowY = window.screenY;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        // Center of the window in screen coordinates
        const centerX = windowX + windowWidth / 2;
        const centerY = windowY + windowHeight / 2;

        // Calculate offset from center
        const offsetX = x - centerX;
        const offsetY = y - centerY;

        // Normalize to -1 to 1 range, but allow going beyond for "looking away" effect
        // We use a reference size (e.g., screen size) to normalize sensitivity
        const sensitivity = 1000; // Adjust this value to control how much head moves
        
        const lookX = Math.max(-1, Math.min(1, offsetX / sensitivity));
        const lookY = Math.max(-1, Math.min(1, -offsetY / sensitivity)); // Invert Y for Live2D

        if (model.internalModel && model.internalModel.focusController) {
            model.internalModel.focusController.focus(lookX, lookY);
        }
    });

    return () => {
        unsubscribeAudio();
        unsubscribeTranscription();
        unsubscribeAi();
        unsubscribeGlobalMouse();
    };
  }, [model]);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}
