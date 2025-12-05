
import { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
// Importação dinâmica para evitar erro de 'window is not defined' no build
// const { Live2DModel } = require('pixi-live2d-display/cubism4');

// Expor PIXI globalmente (necessário para o plugin)
if (typeof window !== 'undefined') {
    (window as any).PIXI = PIXI;
}

export default function AvatarCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const stopListening = window.electron.on('play-audio', (url) => {
            // Tocar áudio
            const audio = new Audio(url as string);
            audio.play();
            // ... Lógica de LipSync (Web Audio API no frontend) ...
        });
        return () => stopListening();
    }, []);

    return <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" />;
}