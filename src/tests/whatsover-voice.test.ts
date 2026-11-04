// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { BrowserVoiceCall } from '#lib/adapters/whatsapp/voiceCall.js'
import captureSource from '#lib/adapters/whatsapp/voiceCapture.worklet.js?raw'
import { opusDuration } from '#lib/adapters/whatsapp/voiceAudio.js'

class Socket extends EventTarget {
  readyState = 0
  bufferedAmount = 0
  binaryType = 'blob'
  protocol = 'whatsover.v1'
  send = vi.fn()
  close = vi.fn(() => { this.readyState = 3; this.dispatchEvent(new Event('close')) })
  open() { this.readyState = 1; this.dispatchEvent(new Event('open')) }
  message(value: unknown) { this.dispatchEvent(new MessageEvent('message', { data: typeof value === 'string' || value instanceof ArrayBuffer ? value : JSON.stringify(value) })) }
}
const request = { kind: 'outgoing' as const, requestId: 'synthetic-call', to: '+15555550100' }

function fixture() {
  const socket = new Socket()
  const audio = { start: vi.fn(async () => {}), play: vi.fn(), mute: vi.fn(), close: vi.fn() }
  const callbacks = { snapshot: vi.fn(), error: vi.fn(), closed: vi.fn() }
  let capture!: (packet: ArrayBuffer) => void
  const deps = {
    ticket: vi.fn(async () => ({ url: 'wss://synthetic.example/voice/account', token: 'synthetic-token', expiresAt: Date.now() + 30000 })),
    socket: vi.fn(() => socket as unknown as WebSocket),
    audio: vi.fn((send: (packet: ArrayBuffer) => void) => { capture = send; return audio }),
  }
  const call = new BrowserVoiceCall(callbacks, deps)
  return { call, callbacks, deps, audio, socket, capture: (packet: ArrayBuffer) => capture(packet) }
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('cancels microphone setup without issuing a ticket or signaling after a late permission result', async () => {
  const f = fixture()
  let grant!: () => void
  f.audio.start.mockImplementation(() => new Promise<void>(resolve => { grant = resolve }))
  const starting = f.call.start(request)
  f.call.close(); grant(); await starting
  expect(f.audio.close).toHaveBeenCalledOnce()
  expect(f.deps.ticket).not.toHaveBeenCalled()
  expect(f.deps.socket).not.toHaveBeenCalled()
})

it('discards a late ticket after cancellation and releases microphone ownership', async () => {
  const f = fixture()
  let ticket!: (value: { url: string; token: string; expiresAt: number }) => void
  f.deps.ticket.mockImplementation(() => new Promise(resolve => { ticket = resolve }))
  const starting = f.call.start(request)
  await vi.waitFor(() => expect(f.deps.ticket).toHaveBeenCalledOnce())
  f.call.close(); ticket({ url: 'wss://synthetic.example', token: 'late-token', expiresAt: Date.now() + 30000 })
  await starting
  expect(f.deps.socket).not.toHaveBeenCalled()
  expect(f.audio.close).toHaveBeenCalledOnce()
})

it('sends one explicit attempt, gates buffered audio and releases all resources on hang-up', async () => {
  const f = fixture()
  const starting = f.call.start(request)
  await vi.waitFor(() => expect(f.deps.socket).toHaveBeenCalledOnce())
  expect(f.deps.socket).toHaveBeenCalledWith('wss://synthetic.example/voice/account', ['whatsover.v1', 'token.synthetic-token'])
  f.capture(new ArrayBuffer(1920)); expect(f.socket.send).not.toHaveBeenCalled()
  f.socket.open(); await starting
  expect(f.socket.send).toHaveBeenCalledWith(JSON.stringify(request))
  const packet = new ArrayBuffer(1920)
  f.capture(packet); expect(f.socket.send).toHaveBeenCalledWith(packet)
  f.socket.bufferedAmount = 100000
  f.socket.send.mockClear(); f.capture(packet); expect(f.socket.send).not.toHaveBeenCalled()
  const output = new ArrayBuffer(1921)
  f.socket.message(output); expect(f.audio.play).toHaveBeenCalledWith(output)
  f.call.mute(true)
  expect(f.audio.mute).toHaveBeenCalledWith(true)
  expect(f.socket.send).toHaveBeenCalledWith('{"kind":"mute","muted":true}')
  f.call.close(); f.call.close()
  expect(f.socket.send).toHaveBeenCalledWith('{"kind":"end"}')
  expect(f.audio.close).toHaveBeenCalledOnce()
  expect(f.callbacks.closed).toHaveBeenCalledOnce()
  await expect(f.call.start(request)).rejects.toThrow('cannot be reused')
})

it('ignores the previous call ending, but stops the microphone when this call ends', async () => {
  const f = fixture()
  const starting = f.call.start(request)
  await vi.waitFor(() => expect(f.deps.socket).toHaveBeenCalledOnce())
  f.socket.open(); await starting
  f.socket.message({ kind: 'snapshot', incoming: [], current: { requestId: 'previous', phase: 'ended' } })
  expect(f.audio.close).not.toHaveBeenCalled()
  f.socket.message({ kind: 'snapshot', incoming: [], current: { requestId: request.requestId, phase: 'ended' } })
  expect(f.audio.close).toHaveBeenCalledOnce()
})

it('does not retry a failed connection or keep a microphone open after a server rejection', async () => {
  const f = fixture()
  const starting = f.call.start(request)
  await vi.waitFor(() => expect(f.deps.socket).toHaveBeenCalledOnce())
  f.socket.open(); await starting
  f.socket.message({ kind: 'error', message: 'This call attempt was already submitted' })
  expect(f.callbacks.error).toHaveBeenCalledWith('This call attempt was already submitted')
  expect(f.audio.close).toHaveBeenCalledOnce()
  expect(f.deps.socket).toHaveBeenCalledOnce()
})

it('releases a pending socket attempt and microphone on connection failure', async () => {
  const f = fixture()
  const starting = f.call.start(request)
  await vi.waitFor(() => expect(f.deps.socket).toHaveBeenCalledOnce())
  f.socket.dispatchEvent(new Event('error')); await starting
  expect(f.audio.close).toHaveBeenCalledOnce()
  expect(f.socket.send).not.toHaveBeenCalled()
})

it('ends an abandoned connection without redialing when heartbeats stop', async () => {
  const f = fixture()
  const starting = f.call.start(request)
  await vi.waitFor(() => expect(f.deps.socket).toHaveBeenCalledOnce())
  vi.useFakeTimers()
  f.socket.open(); await starting
  await vi.advanceTimersByTimeAsync(30001)
  expect(f.callbacks.error).toHaveBeenCalledWith(expect.stringContaining('connection lost'))
  expect(f.audio.close).toHaveBeenCalledOnce()
  expect(f.deps.socket).toHaveBeenCalledOnce()
})

it('reads Opus frame durations and rejects malformed packet counts', () => {
  expect(opusDuration(new Uint8Array([24]))).toBe(60000)
  expect(opusDuration(new Uint8Array([0b10011000]))).toBe(20000)
  expect(opusDuration(new Uint8Array([0b10011001]))).toBe(40000)
  expect(() => opusDuration(new Uint8Array([0b10011011, 0]))).toThrow('duration')
  expect(() => opusDuration(new Uint8Array([0b10011011, 63]))).toThrow('duration')
})

it('bounds the real worklet queue while the UI thread is suspended', () => {
  const packets: ArrayBuffer[] = []
  const port = { onmessage: null as ((event: { data: string }) => void) | null, postMessage: (packet: ArrayBuffer) => { packets.push(packet) } }
  let Capture!: new () => { process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean }
  new Function('globalThis', captureSource)({
    AudioWorkletProcessor: class { port = port },
    registerProcessor: (_name: string, processor: typeof Capture) => { Capture = processor },
  })
  const capture = new Capture()
  for (let index = 0; index < 100; index++) capture.process([[new Float32Array(960).fill(0.25)]], [[new Float32Array(960)]])
  expect(packets).toHaveLength(4)
  expect(packets.every(packet => packet.byteLength === 1920)).toBe(true)
  expect(new DataView(packets[0]).getInt16(0, true)).toBe(8192)
  port.onmessage?.({ data: 'ack' }); port.onmessage?.({ data: 'ack' })
  for (let index = 0; index < 10; index++) capture.process([[new Float32Array(960)]], [[new Float32Array(960)]])
  expect(packets).toHaveLength(6)
})

it('never requests a voice ticket or dials when microphone acquisition fails', async () => {
  const f = fixture()
  f.audio.start.mockRejectedValue(new Error('The browser could not open this microphone'))
  await f.call.start(request)
  expect(f.deps.ticket).not.toHaveBeenCalled()
  expect(f.deps.socket).not.toHaveBeenCalled()
  expect(f.audio.close).toHaveBeenCalledOnce()
  expect(f.callbacks.error).toHaveBeenCalledWith(expect.stringContaining('microphone'))
})

it('starts camera only for explicit video, routes video separately and releases it on hang-up', async () => {
  const f = fixture()
  const video = { start: vi.fn(async () => {}), play: vi.fn(), keyframe: vi.fn(), camera: vi.fn(), close: vi.fn() }
  let sendVideo!: (packet: ArrayBuffer) => boolean
  const deps = { ...f.deps, video: vi.fn((send: (packet: ArrayBuffer) => boolean) => { sendVideo = send; return video }) }
  const call = new BrowserVoiceCall(f.callbacks, deps)
  const starting = call.start({ ...request, video: true })
  await vi.waitFor(() => expect(deps.socket).toHaveBeenCalledOnce())
  expect(video.start).toHaveBeenCalledOnce()
  expect(sendVideo(new Uint8Array([2, 1, 0, 0, 0, 0, 0, 1]).buffer)).toBe(false)
  f.socket.open(); await starting
  f.capture(new ArrayBuffer(1920))
  expect(f.socket.send.mock.calls.at(-1)?.[0]).toBeInstanceOf(Uint8Array)
  expect((f.socket.send.mock.calls.at(-1)?.[0] as Uint8Array).byteLength).toBe(1921)
  const packet = new Uint8Array([2, 1, 0, 0, 0, 0, 0, 1]).buffer
  expect(sendVideo(packet)).toBe(true)
  f.socket.message(packet)
  expect(video.play).toHaveBeenCalledWith(packet)
  expect(f.socket.send).toHaveBeenCalledWith('video-ack')
  f.socket.message(new Uint8Array([3]).buffer)
  expect(video.keyframe).toHaveBeenCalledOnce()
  call.camera(false); expect(video.camera).toHaveBeenCalledWith(false)
  call.close()
  expect(video.close).toHaveBeenCalledOnce()
  expect(f.audio.close).toHaveBeenCalledOnce()
})

it('never dials when the camera is denied and disposes pending video setup on cancellation', async () => {
  const f = fixture()
  const video = { start: vi.fn(async () => { throw new Error('Camera access is blocked') }), play: vi.fn(), keyframe: vi.fn(), camera: vi.fn(), close: vi.fn() }
  const call = new BrowserVoiceCall(f.callbacks, { ...f.deps, video: () => video })
  await call.start({ ...request, video: true })
  expect(f.deps.ticket).not.toHaveBeenCalled()
  expect(f.audio.close).toHaveBeenCalledOnce()
  expect(video.close).toHaveBeenCalledOnce()
  expect(f.callbacks.error).toHaveBeenCalledWith('Camera access is blocked')
})
