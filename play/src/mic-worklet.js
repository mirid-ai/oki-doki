// This processor runs in the browser's audio worklet, not on the main thread.
// Its only output is a copy of the first microphone channel for WAV encoding.
class ReplyCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.finished = false;
    this.port.onmessage = (event) => {
      if (event.data?.type !== 'finish' || this.finished) return;
      // Messages sent by this port arrive in order. Acknowledge only after
      // previously posted audio, so the main thread can drain queued samples.
      this.finished = true;
      this.port.postMessage({ type: 'finished' });
    };
  }
  process(inputs) {
    if (this.finished) return false;
    const channel = inputs[0]?.[0];
    if (channel?.length) {
      const copy = new Float32Array(channel);
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}
registerProcessor('reply-capture', ReplyCapture);
