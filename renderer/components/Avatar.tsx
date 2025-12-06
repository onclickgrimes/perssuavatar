import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';

interface AvatarProps {
  modelName: string;
}

export default function Avatar({ modelName }: AvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [model, setModel] = useState<any>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const appRef = useRef<PIXI.Application | null>(null);

  const currentModelWrapperRef = useRef<PIXI.Container | null>(null);

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

        // Handle different naming conventions
        let fileName = `${modelName}.model3.json`;
        if (modelName === 'freeca') {
            fileName = 'model.model3.json';
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
            console.log(`Calculated Scale: ${scale}`);
            
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

  // 3. Audio/LipSync (Existing logic) - relies on 'model' state
  const isSpeakingRef = useRef(false);
  useEffect(() => {
    if (!model) return;
    // ... existing logic ...
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
        

        setIsSpeaking(true);
        isSpeakingRef.current = true;

        if (model.internalModel && model.internalModel.focusController) {
            model.internalModel.focusController.focus(0, 0);
        }

        const updateLipSync = () => {
            if (audio.paused || audio.ended) {
                if (appRef.current) {
                    appRef.current.ticker.remove(updateLipSync);
                }
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
            const mouthOpen = Math.min(1.0, average / 40);
            
            if (model.internalModel && model.internalModel.coreModel) {
                 model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', mouthOpen);
            }
        };
        
        audio.play()
            .then(() => {
                if (appRef.current) {
                    // Adiciona com prioridade UTILITY (-50) para rodar APÓS o update padrão do modelo (NORMAL 0)
                    // Garantindo que nosso valor de boca sobrescreva qualquer animação de idle
                    appRef.current.ticker.add(updateLipSync, undefined, PIXI.UPDATE_PRIORITY.UTILITY);
                }
            })
            .catch(e => console.error("Error playing audio:", e));
    };

    const unsubscribeAudio = window.electron.onPlayAudio(handlePlayAudio);
    
    const unsubscribeTranscription = window.electron.onTranscription((text) => {
        console.log("🎤 User Transcription:", text);
    });

    const unsubscribeAi = window.electron.onAiResponse((text) => {
        console.log("🤖 AI Response:", text);
    });

    const unsubscribeGlobalMouse = window.electron.onGlobalMouseMove(({ x, y }) => {
        if (!model || isSpeakingRef.current) return;
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
