// Runs on the audio render thread. Buffers Float32 chunks posted from the
// main thread (decoded from Gemini's 24kHz PCM16 output) and streams them
// out continuously as the audio graph pulls frames, so playback doesn't
// stutter between chunk arrivals.
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.readOffset = 0;
    this.port.onmessage = (event) => {
      if (event.data === "clear") {
        this.queue = [];
        this.readOffset = 0;
        return;
      }
      this.queue.push(event.data);
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) {
      if (this.queue.length === 0) {
        output[i] = 0;
        continue;
      }
      const current = this.queue[0];
      output[i] = current[this.readOffset++];
      if (this.readOffset >= current.length) {
        this.queue.shift();
        this.readOffset = 0;
      }
    }
    return true;
  }
}

registerProcessor("playback-processor", PlaybackProcessor);
