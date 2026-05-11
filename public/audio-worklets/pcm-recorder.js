/* eslint-disable no-undef -- AudioWorkletGlobalScope (AudioWorkletProcessor, sampleRate, registerProcessor) is provided by the AudioWorklet runtime, not by any standard JS environment ESLint knows about. */
// PCM recorder AudioWorklet — captures mic at the system rate (iOS Safari
// commonly 48k, occasionally 44.1k; sampleRate constraint is ignored on
// iOS) and resamples to 16 kHz mono int16-LE for Gemini Live.
//
// Posts ArrayBuffer chunks back to the main thread roughly every ~100 ms.
// The main thread base64-encodes + ships them as realtimeInput.

class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.ratio = sampleRate / this.targetRate;
    this.acc = 0; // fractional sample index for linear interpolation
    this.buffer = []; // int16 samples queued for next post
    this.flushThreshold = Math.floor(this.targetRate * 0.1); // ~100ms
  }

  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch || ch.length === 0) return true;

    // Linear interpolation resample, take only channel 0 (mono).
    let pos = this.acc;
    while (pos < ch.length) {
      const i = Math.floor(pos);
      const frac = pos - i;
      const s0 = ch[i] ?? 0;
      const s1 = ch[i + 1] ?? s0;
      const sample = s0 + (s1 - s0) * frac;
      // clamp + convert to int16
      const clamped = Math.max(-1, Math.min(1, sample));
      this.buffer.push(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
      pos += this.ratio;
    }
    this.acc = pos - ch.length;

    if (this.buffer.length >= this.flushThreshold) {
      const out = new Int16Array(this.buffer.length);
      for (let i = 0; i < this.buffer.length; i++) out[i] = this.buffer[i] | 0;
      this.buffer.length = 0;
      // Transfer buffer ownership to avoid copy.
      this.port.postMessage(out.buffer, [out.buffer]);
    }

    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorder);
