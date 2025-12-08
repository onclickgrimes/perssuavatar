import { useState, useRef, useCallback } from 'react';

interface UseContinuousRecorderOptions {
    maxBufferSeconds?: number;  // Maximum buffer size in seconds (default: 600 = 10 minutes)
}

interface DiskSegment {
    path: string;
    startTime: number;
    endTime: number;
    size: number;
}

export const useContinuousRecorder = (options: UseContinuousRecorderOptions = {}) => {
    const { maxBufferSeconds = 600 } = options;  // Default 10 minutes buffer
    
    const [isRecording, setIsRecording] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const streamRef = useRef<MediaStream | null>(null);
    const segmentsRef = useRef<DiskSegment[]>([]);  // Only metadata, actual data on disk
    const segmentIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const segmentCounterRef = useRef<number>(0);
    const isStoppingRef = useRef<boolean>(false);
    const recorderOptionsRef = useRef<MediaRecorderOptions | null>(null);
    
    const SEGMENT_DURATION_MS = 30000; // 30 second segments

    // Record a single segment (complete file with headers)
    const recordSegment = useCallback(async (): Promise<void> => {
        if (!streamRef.current || isStoppingRef.current) return;
        
        return new Promise((resolve) => {
            const chunks: Blob[] = [];
            const segmentStartTime = Date.now();
            const segmentId = `${segmentStartTime}_${segmentCounterRef.current++}`;
            
            const mediaRecorder = new MediaRecorder(streamRef.current!, recorderOptionsRef.current!);
            
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunks.push(e.data);
                }
            };
            
            mediaRecorder.onstop = async () => {
                if (chunks.length === 0 || isStoppingRef.current) {
                    resolve();
                    return;
                }
                
                const blob = new Blob(chunks, { type: 'video/webm' });
                const arrayBuffer = await blob.arrayBuffer();
                
                try {
                    const segmentPath = await window.electron.saveSegment(arrayBuffer, segmentId);
                    
                    const segment: DiskSegment = {
                        path: segmentPath,
                        startTime: segmentStartTime,
                        endTime: Date.now(),
                        size: blob.size
                    };
                    
                    segmentsRef.current.push(segment);
                    
                    // Clean up old segments beyond buffer limit
                    const cutoffTime = Date.now() - (maxBufferSeconds * 1000);
                    const oldSegments = segmentsRef.current.filter(s => s.endTime <= cutoffTime);
                    
                    if (oldSegments.length > 0) {
                        const pathsToDelete = oldSegments.map(s => s.path);
                        await window.electron.deleteSegments(pathsToDelete);
                        segmentsRef.current = segmentsRef.current.filter(s => s.endTime > cutoffTime);
                    }
                    
                    const totalDuration = segmentsRef.current.reduce((acc, s) => acc + (s.endTime - s.startTime), 0) / 1000;
                    console.log(`[ContinuousRecorder] Segment saved. Buffer: ${segmentsRef.current.length} segments, ${totalDuration.toFixed(0)}s`);
                } catch (err) {
                    console.error("[ContinuousRecorder] Failed to save segment:", err);
                }
                
                resolve();
            };
            
            mediaRecorder.onerror = () => {
                resolve();
            };
            
            // Record for the segment duration
            mediaRecorder.start();
            
            setTimeout(() => {
                if (mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                } else {
                    resolve();
                }
            }, SEGMENT_DURATION_MS);
        });
    }, [maxBufferSeconds]);

    // Recording loop
    const recordingLoop = useCallback(async () => {
        while (!isStoppingRef.current && streamRef.current) {
            await recordSegment();
        }
    }, [recordSegment]);

    // Start continuous recording
    const startRecording = useCallback(async () => {
        if (isRecording) return;

        try {
            console.log("[ContinuousRecorder] Starting continuous recording (disk-based)...");
            isStoppingRef.current = false;
            
            const sources = await window.electron.getScreenSources();
            const source = sources.find((s: any) => s.name === 'Entire Screen' || s.name === 'Screen 1') || sources[0];
            
            if (!source) {
                console.error("[ContinuousRecorder] No screen source found.");
                return;
            }

            // Capture video AND audio together in a single call (required by Electron)
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
                            minFrameRate: 30,
                            maxFrameRate: 60
                        }
                    } as any
                } as any);
                console.log("[ContinuousRecorder] Video + Audio captured");
            } catch (err) {
                // Fallback: video only if audio fails
                console.warn("[ContinuousRecorder] Audio capture failed, using video only:", err);
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: source.id,
                            minFrameRate: 30,
                            maxFrameRate: 60
                        }
                    } as any
                } as any);
            }

            streamRef.current = stream;

            // High bitrate for quality
            const HIGH_BITRATE = 20000000;  // 8 Mbps (good for H264)
            
            // Prefer H264 for fast remuxing to MP4
            if (MediaRecorder.isTypeSupported('video/webm; codecs=h264')) {
                recorderOptionsRef.current = { 
                    mimeType: 'video/webm; codecs=h264',
                    bitsPerSecond: HIGH_BITRATE
                };
                console.log("[ContinuousRecorder] Using H264 @ 8 Mbps (fast MP4 conversion)");
            } else if (MediaRecorder.isTypeSupported('video/webm; codecs=vp8')) {
                recorderOptionsRef.current = { 
                    mimeType: 'video/webm; codecs=vp8',
                    bitsPerSecond: HIGH_BITRATE
                };
                console.log("[ContinuousRecorder] Using VP8 @ 8 Mbps");
            } else {
                recorderOptionsRef.current = { 
                    mimeType: 'video/webm',
                    bitsPerSecond: HIGH_BITRATE
                };
                console.log("[ContinuousRecorder] Using default webm codec");
            }
            
            segmentsRef.current = [];
            segmentCounterRef.current = 0;
            
            setIsRecording(true);
            setIsInitialized(true);
            
            // Start the recording loop
            recordingLoop();
            
            console.log("[ContinuousRecorder] Recording started (each segment is a complete file)");

        } catch (err) {
            console.error("[ContinuousRecorder] Failed to start:", err);
        }
    }, [isRecording, recordingLoop]);

    // Stop recording
    const stopRecording = useCallback(async () => {
        console.log("[ContinuousRecorder] Stopping...");
        isStoppingRef.current = true;
        
        if (segmentIntervalRef.current) {
            clearInterval(segmentIntervalRef.current);
            segmentIntervalRef.current = null;
        }
        
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        
        // Clean up all segments from disk
        if (segmentsRef.current.length > 0) {
            const allPaths = segmentsRef.current.map(s => s.path);
            await window.electron.deleteSegments(allPaths);
        }
        
        setIsRecording(false);
        setIsInitialized(false);
        segmentsRef.current = [];
        console.log("[ContinuousRecorder] Recording stopped");
    }, []);

    // Save the last N seconds to a file
    const saveLastSeconds = useCallback(async (seconds: number): Promise<string | null> => {
        if (segmentsRef.current.length === 0) {
            console.warn("[ContinuousRecorder] No recording data available");
            return null;
        }

        const now = Date.now();
        const cutoffTime = now - (seconds * 1000);
        
        // Get segments that overlap with the requested time range
        const relevantSegments = segmentsRef.current.filter(s => s.endTime > cutoffTime);
        
        if (relevantSegments.length === 0) {
            console.warn("[ContinuousRecorder] No data in the requested time range");
            return null;
        }

        const actualDuration = (relevantSegments[relevantSegments.length - 1].endTime - relevantSegments[0].startTime) / 1000;
        console.log(`[ContinuousRecorder] Saving ${actualDuration.toFixed(1)}s from ${relevantSegments.length} segments (requested: ${seconds}s)`);

        // Generate filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `screen_recording_${timestamp}_${Math.round(actualDuration)}s.webm`;
        
        // Concatenate segments on disk (via main process)
        const segmentPaths = relevantSegments.map(s => s.path);
        const savedPath = await window.electron.concatenateSegments(segmentPaths, filename);
        
        if (savedPath) {
            console.log(`[ContinuousRecorder] Saved to: ${savedPath}`);
        }
        
        return savedPath;
    }, []);

    // Get current buffer info
    const getBufferInfo = useCallback(() => {
        const segmentSize = segmentsRef.current.reduce((acc, s) => acc + s.size, 0);
        const segmentDuration = segmentsRef.current.reduce((acc, s) => acc + (s.endTime - s.startTime), 0) / 1000;
        
        return { 
            duration: segmentDuration, 
            size: segmentSize, 
            segments: segmentsRef.current.length
        };
    }, []);

    return {
        isRecording,
        isInitialized,
        startRecording,
        stopRecording,
        saveLastSeconds,
        getBufferInfo
    };
};
