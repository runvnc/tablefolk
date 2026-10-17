class PocketPCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options.processorOptions || {};
    this.bufferSize = opts.bufferSize || sampleRate * 60;
    this.minBufferSamples = opts.minBufferSamples || Math.floor(sampleRate * 0.35);
    this.targetBufferSamples = opts.targetBufferSamples || this.minBufferSamples * 2;
    // Separate, much shorter threshold for resuming after a mid-stream
    // underrun. minBufferSamples is a cold-start cushion (nothing has played
    // yet, so a bigger buffer is worth the wait); once already speaking, we
    // just want playback to pick back up as soon as anything is there rather
    // than re-waiting for the full cold-start amount again, which turned a
    // brief gap into a much longer audible stutter.
    this.resumeBufferSamples = opts.resumeBufferSamples || Math.floor(sampleRate * 0.02);
    this.ring = new Float32Array(this.bufferSize);
    this.readPos = 0;
    this.writePos = 0;
    this.buffered = 0;
    this.started = false;
    this.everStarted = false; // false only before the very first cold start of this stream
    this.streamEnded = false;
    this.underruns = 0;
    this.samplesPlayed = 0;
    this.reportCounter = 0;
    this.drainedReported = false;
    this.audioPort = null;  // direct port from worker (bypasses main thread)
    this.throttleCounter = 0;

    this.port.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === 'set_audio_port' && e.ports && e.ports.length) {
        this.audioPort = e.ports[0];
        this.audioPort.onmessage = (ev) => {
          const d = ev.data || {};
          if (d.type === 'audio') this.push(d.data);
          else if (d.type === 'reset') this.reset();
          else if (d.type === 'stream-ended') this.streamEnded = true;
          else if (d.type === 'set-min-buffer') this.minBufferSamples = d.samples | 0;
        };
      }
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
    this.everStarted = false;
    this.streamEnded = false;
    this.underruns = 0;
    this.samplesPlayed = 0;
    this.drainedReported = false;
  }

  push(data) {
    const src = data instanceof Float32Array ? data : new Float32Array(data);
    for (let i = 0; i < src.length; i++) {
      if (this.buffered >= this.bufferSize) {
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

    if (this.streamEnded && this.buffered === 0 && !this.drainedReported) {
      this.drainedReported = true;
      this.port.postMessage({ type: 'drained', samplesPlayed: this.samplesPlayed });
    }

    if (!this.started) {
      const threshold = this.everStarted ? this.resumeBufferSamples : this.minBufferSamples;
      if (this.buffered >= threshold || (this.streamEnded && this.buffered > 0)) {
        this.port.postMessage({ type: 'playback-started', buffered: this.buffered, resumed: this.everStarted });
        this.started = true;
        this.everStarted = true;
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

    // Send capacity back through the direct port if available, so the worker
    // can throttle if needed without involving the main thread.
    if (this.audioPort && this.buffered < this.targetBufferSamples) {
      this.audioPort.postMessage({ type: 'capacity', buffered: this.buffered });
    }
    return true;
  }

  report() {
    this.reportCounter++;
    if (this.reportCounter % 64 === 0) {
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
