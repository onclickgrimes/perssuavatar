import { useEffect } from 'react';

export function useMicrophone() {
  useEffect(() => {
    let audioContext: AudioContext;
    let workletNode: AudioWorkletNode;
    let source: MediaStreamAudioSourceNode;
    let stream: MediaStream;

    const init = async () => {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Use native sample rate - the audio-processor.js handles resampling to 16kHz
            audioContext = new AudioContext();

            // console.log(`[Microphone] Context Sample Rate: ${audioContext.sampleRate}Hz (native, will be resampled to 16kHz)`);
            
            // Load the worklet module
            await audioContext.audioWorklet.addModule('/audio-processor.js');
            
            source = audioContext.createMediaStreamSource(stream);
            workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
            
            workletNode.port.onmessage = (event) => {
                // Receive Int16 buffer from worklet
                const buffer = event.data;
                // console.log("🎤 Mic Data Packet:", buffer.byteLength);
                window.electron.sendAudioData(buffer);
            };
            
            source.connect(workletNode);
            workletNode.connect(audioContext.destination);
            
        } catch (err) {
            console.error("Error accessing microphone:", err);
        }
    };

    init();

    return () => {
        if (source) source.disconnect();
        if (workletNode) workletNode.disconnect();
        if (audioContext) audioContext.close();
        if (stream) stream.getTracks().forEach(track => track.stop());
    }
  }, []);
}