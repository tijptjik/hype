/** Capture 16 kHz mono PCM in 60 ms packets without blocking the UI thread. */
const runtime =
  /** @type {{AudioWorkletProcessor: new () => {port: MessagePort}, registerProcessor: (name: string, processor: new () => {port: MessagePort}) => void}} */ (
    /** @type {unknown} */ (globalThis)
  )
class WhatsoverCapture extends runtime.AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new ArrayBuffer(1920)
    this.view = new DataView(this.buffer)
    this.offset = 0
    this.credits = 4
    this.port.onmessage = event => {
      if (event.data === 'ack') this.credits = Math.min(4, this.credits + 1)
    }
  }
  /** @param {Float32Array[][]} inputs @param {Float32Array[][]} outputs @returns {boolean} */
  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0)
    const input = inputs[0]?.[0]
    if (!input) return true
    for (const sample of input) {
      const value = Math.max(-1, Math.min(1, sample))
      this.view.setInt16(
        this.offset,
        Math.round(value * (value < 0 ? 32768 : 32767)),
        true,
      )
      this.offset += 2
      if (this.offset === 1920) {
        // A suspended UI thread cannot accumulate an unbounded microphone queue.
        if (this.credits > 0) {
          this.credits--
          this.port.postMessage(this.buffer, [this.buffer])
          this.buffer = new ArrayBuffer(1920)
          this.view = new DataView(this.buffer)
        }
        this.offset = 0
      }
    }
    return true
  }
}
runtime.registerProcessor('whatsover-capture', WhatsoverCapture)
