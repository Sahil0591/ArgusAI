// Runs on the audio render thread. Forwards raw mic samples (mono Float32,
// at whatever sample rate the AudioContext was created with — 16kHz, to
// match Gemini Live's required input format) to the main thread for
// PCM16 conversion + base64 encoding + WebSocket send.
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel && channel.length > 0) {
      // Copy — the underlying buffer is reused by the audio engine.
      this.port.postMessage(channel.slice());
    }
    return true;
  }
}

registerProcessor("capture-processor", CaptureProcessor);
