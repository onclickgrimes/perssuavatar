// renderer\public\audio-processor.js

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    
    // Buffer interno
    this.bufferSize = 2048; 
    this._buffer = new Int16Array(this.bufferSize);
    this._bytesWritten = 0;

    // Resampling state
    this._nextSampleIndex = 0;

    // Debug Info (Check console)
    // Note: 'sampleRate' is a global in AudioWorkletGlobalScope
    const currentRate = sampleRate;
    // console.log(`[AudioWorklet] Initialized. System SampleRate: ${currentRate}Hz. Target: ${this.targetSampleRate}Hz. Ratio: ${currentRate / this.targetSampleRate}`);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const inputChannel = input[0]; // Float32 do microfone
      
      // Calculate ratio dynamically (in case it changes, though unlikely)
      const ratio = sampleRate / this.targetSampleRate;
      
      // Resampling with floating point index accumulation (Nearest Neighbor)
      // This handles non-integer ratios (like 44.1kHz -> 16kHz) correctly
      while (this._nextSampleIndex < inputChannel.length) {
          const i = Math.floor(this._nextSampleIndex);
          
          if (i < inputChannel.length) {
              const sample = inputChannel[i];
              // Float32 (-1.0 a 1.0) -> Int16
              const s = Math.max(-1, Math.min(1, sample));
              this._buffer[this._bytesWritten] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              this._bytesWritten++;

              if (this._bytesWritten >= this.bufferSize) {
                  this.flush();
              }
          }

          this._nextSampleIndex += ratio;
      }

      // Adjust index for next block (relative to the end of this block)
      this._nextSampleIndex -= inputChannel.length;
    }
    return true;
  }

  flush() {
    // Cria um novo Int16Array com os dados escritos até agora
    const dataToSend = new Int16Array(this._bytesWritten);
    for (let i = 0; i < this._bytesWritten; i++) {
      dataToSend[i] = this._buffer[i];
    }
    
    // Envia o ArrayBuffer (transferível)
    this.port.postMessage(dataToSend.buffer, [dataToSend.buffer]);
    
    // Reseta contador (o buffer principal permanece intacto)
    this._bytesWritten = 0;
  }
}

registerProcessor('audio-processor', AudioProcessor);