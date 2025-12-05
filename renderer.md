import * as PIXI from 'pixi.js';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { VoiceAssistant } from './voice-assistant';
import { ipcRenderer } from 'electron';

// Expose PIXI to window for pixi-live2d-display BEFORE importing it
(window as any).PIXI = PIXI;

// Now import the plugin using require to ensure it runs after PIXI is exposed
const { Live2DModel } = require('pixi-live2d-display/cubism4');

const app = new PIXI.Application({
  view: document.getElementById('canvas') as HTMLCanvasElement,
  backgroundAlpha: 0,
  resizeTo: window,
  autoStart: true
});

// Initialize Voice Assistant
const voiceAssistant = new VoiceAssistant('elevenlabs'); // or 'elevenlabs'
let micStream: Readable;
let audioContext: AudioContext;
let scriptProcessor: ScriptProcessorNode;
let mediaStreamSource: MediaStreamAudioSourceNode;

async function startMicrophone() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        audioContext = new AudioContext({ sampleRate: 16000 });
        mediaStreamSource = audioContext.createMediaStreamSource(stream);
        // Buffer size 4096, 1 input channel, 1 output channel
        scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
        
        micStream = new Readable({
            read() {}
        });
        
        scriptProcessor.onaudioprocess = (event) => {
            const inputBuffer = event.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);
            
            // Convert Float32 to Int16 (linear16)
            const buffer = new ArrayBuffer(inputData.length * 2);
            const view = new DataView(buffer);
            for (let i = 0; i < inputData.length; i++) {
                // Clamp and scale
                const s = Math.max(-1, Math.min(1, inputData[i]));
                // s < 0 ? s * 0x8000 : s * 0x7FFF
                view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); // little-endian
            }
            
            micStream.push(Buffer.from(buffer));
        };
        
        mediaStreamSource.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination); // Needed for script processor to run
        
        console.log('Microphone started');
        voiceAssistant.startDeepgram(micStream);
        
    } catch (err) {
        console.error('Error accessing microphone:', err);
    }
}

// Listen for Voice Assistant events
voiceAssistant.on('audio-ready', (audioPath: string) => {
    // Convert to file URL with cache busting
    const audioUrl = 'file:///' + audioPath.replace(/\\/g, '/') + '?t=' + Date.now();
    console.log('Voice Assistant Audio Ready:', audioUrl);
    (window as any).playAudio(audioUrl);
});

voiceAssistant.on('transcription', (text: string) => {
    console.log('User said:', text);
});

voiceAssistant.on('status', (status: string) => {
    console.log('Status:', status);
});

// Handle Code Popup
const codePopup = document.getElementById('code-popup');
const codeContent = document.getElementById('code-content');
const closePopupBtn = document.getElementById('close-popup');
const copyCodeBtn = document.getElementById('copy-code');

voiceAssistant.on('code-detected', (code: string) => {
    const popup = document.getElementById('code-popup');
    const content = document.getElementById('code-content');
    
    if (popup && content) {
        // Clean up code block markers for display if desired, or keep them
        content.textContent = code;
        popup.style.display = 'flex';
        
        // Enable mouse interaction for the popup
        ipcRenderer.send('set-ignore-mouse-events', false);
    }
});

if (closePopupBtn) {
    closePopupBtn.addEventListener('click', () => {
        if (codePopup) codePopup.style.display = 'none';
        // Re-enable click-through (ignore mouse)
        // We pass { forward: true } to let clicks pass through if not on the avatar
        // But since we are closing the popup, we generally want to go back to the default state
        // The default state in this app seems to be: ignore mouse unless over avatar.
        ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
    });
}

if (copyCodeBtn && codeContent) {
    copyCodeBtn.addEventListener('click', () => {
        const text = codeContent.textContent || '';
        navigator.clipboard.writeText(text).then(() => {
            const originalText = copyCodeBtn.textContent;
            copyCodeBtn.textContent = 'Copiado!';
            setTimeout(() => {
                if (copyCodeBtn) copyCodeBtn.textContent = originalText;
            }, 2000);
        });
    });
}

// Start microphone automatically (or you can trigger it)
startMicrophone();

async function loadModel() {
  const modelsDir = path.join(__dirname, '../models');
  
  try {
    if (!fs.existsSync(modelsDir)) {
      console.error('Models directory not found:', modelsDir);
      return;
    }

    const files = fs.readdirSync(modelsDir);
    // Find the first .model3.json file recursively or in the root of models? 
    // The request implies "root/models" contains the files. 
    // Let's search for the first .model3.json in the models directory (or immediate subdirectories if structured that way).
    // For simplicity based on request "encontrar o primeiro arquivo .model3.json", we'll search recursively or just check subfolders.
    
    let modelPath = '';

    // Simple recursive search helper
    const findModelFile = (dir: string): string | null => {
        console.log('Searching in:', dir);
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const found = findModelFile(fullPath);
                if (found) return found;
            } else if (entry.isFile() && entry.name.endsWith('.model3.json')) {
                console.log('Found model file:', fullPath);
                return fullPath;
            }
        }
        return null;
    };

    // List of available models (folders in models directory)
    // You can expand this list based on your directory structure
    // Case 1: freeca (The one we fixed)
    // Case 2: Haru
    // Case 3: Hiyori
    // etc.
    
    const modelSelection: number = 1; // CHANGE THIS NUMBER TO SELECT MODEL (1, 2, 3...)
    
    let selectedModelDir = '';
    
    switch (modelSelection) {
        case 1:
            selectedModelDir = path.join(modelsDir, 'freeca');
            break;
        case 2:
            selectedModelDir = path.join(modelsDir, 'Haru');
            break;
        case 3:
            selectedModelDir = path.join(modelsDir, 'Hiyori');
            break;
        case 4:
            selectedModelDir = path.join(modelsDir, 'Mao');
            break;
        case 5:
            selectedModelDir = path.join(modelsDir, 'Mark');
            break;
        case 6:
            selectedModelDir = path.join(modelsDir, 'Natori');
            break;
        case 7:
            selectedModelDir = path.join(modelsDir, 'Rice');
            break;
        case 8:
            selectedModelDir = path.join(modelsDir, 'Wanko');
            break;
        case 9:
            selectedModelDir = path.join(modelsDir, 'Yuino');
            break;
        case 10:
            selectedModelDir = path.join(modelsDir, '简');
            break;
        default:
            console.warn('Invalid selection, defaulting to freeca');
            selectedModelDir = path.join(modelsDir, 'freeca');
            break;
    }

    modelPath = findModelFile(selectedModelDir) || '';

    if (!modelPath) {
      console.error('No .model3.json file found in models directory.');
      return;
    }

    // Convert path to file URL to avoid issues with Windows paths and XHR
    const modelUrl = 'file:///' + modelPath.replace(/\\/g, '/');
    console.log('Loading model from URL:', modelUrl);

    const model = await Live2DModel.from(modelUrl);

    // Center the model
    model.x = app.screen.width / 2;
    model.y = app.screen.height / 2;
    
    // Scale model to fit window if needed, or set a reasonable default
    // This depends on model size, but let's start with a reasonable scale or auto-fit
    const scaleX = app.screen.width / model.width;
    const scaleY = app.screen.height / model.height;
    const scale = Math.min(scaleX, scaleY) * 0.8; // Use 80% of screen size
    
    model.scale.set(scale);
    model.anchor.set(0.5, 0.5);

    // Enable interaction
    model.interactive = true;
    model.buttonMode = true;

    // Handle click-through: Only capture mouse when over the model
    // Handle click-through: Only capture mouse when over the model
    // ipcRenderer is imported at the top level now
    
    model.on('pointerover', () => {
        ipcRenderer.send('set-ignore-mouse-events', false);
    });

    model.on('pointerout', () => {
        const popup = document.getElementById('code-popup');
        const isPopupVisible = popup && popup.style.display !== 'none';
        
        if (!isPopupVisible) {
            ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
        }
    });

    // Ensure popup captures mouse events
    const popup = document.getElementById('code-popup');
    if (popup) {
        popup.addEventListener('mouseenter', () => {
            ipcRenderer.send('set-ignore-mouse-events', false);
        });
        popup.addEventListener('mouseleave', () => {
             // Only ignore if not over model (model pointerover handles the other case)
             // But to be safe, we can default to ignore, and if we are over model, pointerover will fire?
             // Actually, if we leave popup and enter model, pointerover fires.
             // If we leave popup and enter void, we want ignore.
             ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
        });
    }

    // Initial state: ignore mouse (let it pass through empty space)
    ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });

    // Handle global mouse tracking
    ipcRenderer.on('global-mouse-move', (_event: any, { x, y }: { x: number, y: number }) => {
        // If speaking, ignore mouse tracking
        if (isSpeaking) return;

        // Calculate position relative to the window
        const localX = x - window.screenX;
        const localY = y - window.screenY;

        // The model.focus() method expects coordinates relative to the model's center?
        // Actually, looking at the library source, it expects coordinates in the model's local space (if using toLocal) 
        // OR it might just take the point and handle it.
        // But usually, standard Live2D interaction uses the center of the screen/model as (0,0) for looking.
        // pixi-live2d-display's focus() takes x and y.
        
        // Let's try passing the local window coordinates. 
        // We might need to adjust based on where the model is.
        // If the model is centered at (width/2, height/2), then:
        // We want the look target to be relative to that center.
        
        // However, the library's `focus` method is often mapped to `hitTest` or just setting the drag target.
        // A more direct way for "looking" is often `model.internalModel.focusController.focus(x, y)` 
        // where x and y are in the range -1 to 1.
        
        // Let's calculate normalized coordinates (-1 to 1) relative to the window center
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        // Normalize: (value - center) / (dimension / 2)
        // This gives -1 (left/top) to 1 (right/bottom)
        // But we need to account for the whole screen if we want it to look "at" the mouse correctly 
        // even when far away.
        // Actually, Live2D parameters usually clamp at -1 and 1.
        // So if the mouse is far right, it should just look max right.
        
        const lookX = (localX - centerX) / (centerX); 
        const lookY = -((localY - centerY) / (centerY)); // Invert Y because screen Y is top-down, but Live2D Y is usually up-down (positive is up)

        // Use the internal focus controller for direct control
        if (model.internalModel && model.internalModel.focusController) {
            model.internalModel.focusController.focus(lookX, lookY);
        } else {
            // Fallback if internal model structure is different (Cubism 4 vs 2/3)
            // For Cubism 4, it's usually handled via parameters directly or focus controller.
            model.focus(localX, localY); 
        }
    });

    app.stage.addChild(model);

    // Optional: Draggable logic could go here if not handled by CSS/Electron drag region
    
    // State to track if avatar is speaking
    let isSpeaking = false;
    let currentAudio: HTMLAudioElement | null = null;

    // Function to play audio and lip sync
    (window as any).playAudio = (audioPath: string) => {
        // Stop previous audio if playing
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }

        const audio = new Audio(audioPath);
        currentAudio = audio;
        
        // Create a simple lip sync effect based on volume
        const audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(audio);
        const analyser = audioContext.createAnalyser();
        
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        let animationId: number;
        
        // Start speaking state
        isSpeaking = true;
        
        // Force look forward (center)
        if (model.internalModel && model.internalModel.focusController) {
            model.internalModel.focusController.focus(0, 0);
        }

        const updateLipSync = () => {
            if (audio.paused || audio.ended) {
                cancelAnimationFrame(animationId);
                if (model.internalModel && model.internalModel.coreModel) {
                     // Reset mouth open parameter
                     model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', 0);
                }
                // End speaking state only if this is still the current audio
                if (currentAudio === audio) {
                    isSpeaking = false;
                    currentAudio = null;
                }
                return;
            }
            
            analyser.getByteFrequencyData(dataArray);
            
            // Calculate average volume
            let sum = 0;
            for(let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;
            
            // Map volume to mouth opening (0.0 to 1.0)
            // Adjust sensitivity as needed (e.g., divide by 50 or 100)
            const mouthOpen = Math.min(1.0, average / 50);
            
            if (model.internalModel && model.internalModel.coreModel) {
                 // Set mouth open parameter (Standard ID for Cubism 4 is ParamMouthOpenY)
                 // Some models might use ParamMouthOpen
                 model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', mouthOpen);
            }
            
            animationId = requestAnimationFrame(updateLipSync);
        };
        
        audio.play().catch(e => console.error("Error playing audio:", e));
        updateLipSync();
    };

    // // Auto-play the requested audio for testing
    // // Note: In a real app, you might trigger this via IPC or UI
    // const testAudioPath = path.join(__dirname, '../public/audios/1744091533880.wav');
    // // Convert to file URL
    // const testAudioUrl = 'file:///' + testAudioPath.replace(/\\/g, '/');
    
    // // Wait a bit for model to be fully ready
    // setTimeout(() => {
    //     console.log('Playing test audio:', testAudioUrl);
    //     (window as any).playAudio(testAudioUrl);
    // }, 2000);
    // // But user requested CSS -webkit-app-region: drag for moving the window.
    // // Interaction with the model (e.g. looking at mouse) is handled by Live2DModel automatically usually.

  } catch (error) {
    console.error('Failed to load model:', error);
  }
}

loadModel();
