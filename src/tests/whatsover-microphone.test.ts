// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import {
  BrowserVoiceAudio,
  microphoneErrorMessage,
} from '#lib/adapters/whatsapp/voiceAudio.js'

function captureFixture() {
  const track = Object.assign(new EventTarget(), { stop: vi.fn(), enabled: true })
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
  const getUserMedia = vi.fn(
    async (_constraints: MediaStreamConstraints) => stream as unknown as MediaStream,
  )
  const close = vi.fn(async () => {})
  const disconnect = vi.fn()
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal(
    'AudioContext',
    class extends EventTarget {
      sampleRate = 16000
      state = 'running'
      close = close
      destination = {}
      resume = vi.fn(async () => {})
      audioWorklet = { addModule: vi.fn(async () => {}) }
      createMediaStreamSource() {
        return { connect: vi.fn(), disconnect }
      }
    },
  )
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      port = { close: vi.fn(), postMessage: vi.fn(), onmessage: null }
      connect = vi.fn()
      disconnect = disconnect
    },
  )
  return { getUserMedia, close, track, stream }
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('opens the explicitly selected input and releases it on close', async () => {
  const f = captureFixture()
  const audio = new BrowserVoiceAudio(vi.fn(), vi.fn(), 'synthetic-usb-input')
  await audio.start()
  expect(f.getUserMedia).toHaveBeenCalledWith({
    audio: expect.objectContaining({ deviceId: { exact: 'synthetic-usb-input' } }),
  })
  audio.close()
  audio.close()
  expect(f.track.stop).toHaveBeenCalledOnce()
  expect(f.close).toHaveBeenCalledOnce()
})

it('keeps the default input implicit and gives actionable failure guidance without opening another input', async () => {
  const f = captureFixture()
  f.getUserMedia.mockRejectedValue(
    new DOMException('Could not start audio source', 'NotReadableError'),
  )
  const audio = new BrowserVoiceAudio(vi.fn(), vi.fn())
  await expect(audio.start()).rejects.toThrow('Choose another input')
  expect(f.getUserMedia).toHaveBeenCalledOnce()
  expect(f.getUserMedia.mock.calls[0][0].audio).not.toHaveProperty('deviceId')
  expect(f.close).toHaveBeenCalledOnce()
})

it('releases late microphone grants after cancelling a local check', async () => {
  const f = captureFixture()
  let grant!: (stream: MediaStream) => void
  f.getUserMedia.mockImplementation(
    () =>
      new Promise(resolve => {
        grant = resolve
      }),
  )
  const audio = new BrowserVoiceAudio(vi.fn(), vi.fn(), 'synthetic-usb-input')
  const starting = audio.start()
  audio.close()
  grant(f.stream as unknown as MediaStream)
  await starting
  expect(f.track.stop).toHaveBeenCalledOnce()
  expect(f.close).toHaveBeenCalledOnce()
})

it.each([
  ['NotAllowedError', 'site settings'],
  ['SecurityError', 'site settings'],
  ['NotFoundError', 'selected microphone is unavailable'],
  ['OverconstrainedError', 'selected microphone is unavailable'],
  ['NotReadableError', 'busy or unavailable'],
  ['AbortError', 'busy or unavailable'],
])('explains %s without exposing raw browser errors', (name, guidance) => {
  expect(
    microphoneErrorMessage(new DOMException('raw device failure', name)),
  ).toContain(guidance)
})
