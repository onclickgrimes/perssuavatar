import { useEffect, useRef, useState, useCallback } from 'react';

interface ScreenShareOptions {
  fps?: number;  // Frames per second to send (default: 1)
  quality?: number;  // JPEG quality 0-1 (default: 0.7)
  maxWidth?: number;  // Max width to resize (default: 1280)
}

export function useScreenShare(options: ScreenShareOptions = {}) {
  const { fps = 1, quality = 0.7, maxWidth = 1280 } = options;
  
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startSharing = useCallback(async (sourceId?: string) => {
    try {
      setError(null);
      
      // Get screen sources if no sourceId provided
      let selectedSourceId = sourceId;
      if (!selectedSourceId) {
        const sources = await (window.electron as any).getScreenSources();
        if (sources.length === 0) {
          throw new Error('No screen sources available');
        }
        // Use entire screen by default
        const screenSource = sources.find((s: any) => s.name === 'Entire Screen' || s.name.includes('Screen')) || sources[0];
        selectedSourceId = screenSource.id;
      }

      // Request screen capture using Electron's desktopCapturer
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: selectedSourceId,
            maxWidth: 1920,
            maxHeight: 1080,
          },
        } as any,
      });

      streamRef.current = stream;

      // Create video element to capture frames
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.play();
      videoRef.current = video;

      // Create canvas for frame capture
      const canvas = document.createElement('canvas');
      canvasRef.current = canvas;

      // Wait for video to be ready
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => resolve();
      });

      setIsSharing(true);
      console.log('[ScreenShare] Started sharing screen');

      // Start sending frames periodically
      const captureInterval = 1000 / fps;
      intervalRef.current = setInterval(() => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;

        // Calculate dimensions maintaining aspect ratio
        let width = video.videoWidth;
        let height = video.videoHeight;
        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, width, height);
          
          // Convert to base64 JPEG
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const base64 = dataUrl.split(',')[1]; // Remove "data:image/jpeg;base64," prefix
          
          // Send to Gemini Live via IPC
          if ((window.electron as any).sendScreenFrame) {
            (window.electron as any).sendScreenFrame(base64);
          }
        }
      }, captureInterval);

    } catch (err: any) {
      console.error('[ScreenShare] Error:', err);
      setError(err.message || 'Failed to start screen sharing');
      setIsSharing(false);
    }
  }, [fps, quality, maxWidth]);

  const stopSharing = useCallback(() => {
    // Stop interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Cleanup video and canvas
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }
    canvasRef.current = null;

    setIsSharing(false);
    console.log('[ScreenShare] Stopped sharing screen');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSharing();
    };
  }, [stopSharing]);

  return {
    isSharing,
    error,
    startSharing,
    stopSharing,
  };
}
