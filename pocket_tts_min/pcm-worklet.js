class PocketPCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options.processorOptions || {};
    this.bufferSize = opts.bufferSize || sampleRate * 60;
    this.minBufferSamples = opts.minBufferSamples || Math.floor(sampleRate * 0.35);
    this.ring = new Float32Array(this.bufferSize);
    this.readPos = 0;
    this.writePos = 0;
    this.buffered = 0;
    this.started = false;
    this.streamEnded = false;
    this.underruns = 0;
    this.samplesPlayed = 0;
    this.reportCounter = 0;

    this.port.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === 'audio') this.push(m.data);
      else if (m.type === 'reset') this.reset();
      else if (m.type === 'stream-ended') this.streamEnded = true;
      else if (m.type === 'set-min-buffer') this.minBufferSamples = m.samples | 0;
    };
  }

  reset() {
    this.readPos = 0;
    this.writePos = 0;
    this.buffered = 0;
    this.started = false;
    this.streamEnded = false;
    this.underruns = 0;
    this.samplesPlayed = 0;
  }

  push(data) {
    const src = data instanceof Float32Array ? data : new Float32Array(data);
    for (let i = 0; i < src.length; i++) {
      if (this.buffered >= this.bufferSize) {
        // Drop oldest sample rather than blocking the audio thread.
        this.readPos = (this.readPos + 1) % this.bufferSize;
        this.buffered--;
      }
      this.ring[this.writePos] = src[i];
      this.writePos = (this.writePos + 1) % this.bufferSize;
      this.buffered++;
    }
  }

  process(inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;

    if (!this.started) {
      if (this.buffered >= this.minBufferSamples || (this.streamEnded && this.buffered > 0)) {
        this.started = true;
      } else {
        out.fill(0);
        this.report();
        return true;
      }
    }

    for (let i = 0; i < out.length; i++) {
      if (this.buffered > 0) {
        out[i] = this.ring[this.readPos];
        this.readPos = (this.readPos + 1) % this.bufferSize;
        this.buffered--;
        this.samplesPlayed++;
      } else {
        out[i] = 0;
        if (!this.streamEnded) this.underruns++;
        this.started = false;
      }
    }

    this.report();
    return true;
  }

  report() {
    this.reportCounter++;
    if (this.reportCounter % 32 === 0) {
      this.port.postMessage({
        type: 'stats',
        buffered: this.buffered,
        bufferedMs: Math.round(this.buffered / sampleRate * 1000),
        underruns: this.underruns,
        samplesPlayed: this.samplesPlayed,
      });
    }
  }
}

registerProcessor('pocket-pcm-processor', PocketPCMProcessor);
