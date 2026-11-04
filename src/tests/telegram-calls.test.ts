// @vitest-environment node
// TESTS
import { afterEach, expect, it, vi } from 'vitest'
// FIXTURES
import { nativeVideoOffer } from './fixtures/telegramNativeSignal'
// ADAPTERS
import { TelegramBrowserCall } from '#lib/adapters/telegram/call.js'
import { localContents, localSetup, parseSignal, TelegramNegotiation, type Negotiation } from '#lib/adapters/telegram/negotiation.js'

const setup = { '@type': 'InitialSetup' as const, ufrag: 'abcd', pwd: 'x'.repeat(24), renomination: false, fingerprints: [{ hash: 'sha-256', setup: 'actpass', fingerprint: Array(32).fill('AA').join(':') }] }
const channel = { type: 'audio' as const, ssrc: '12345', payloadTypes: [{ id: 111, name: 'opus', clockrate: 48000, channels: 2, parameters: { minptime: '10', useinbandfec: '1' }, feedbackTypes: [{ type: 'transport-cc', subtype: '' }] }], rtpExtensions: [{ id: 3, uri: 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01' }], ssrcGroups: [] }
const offer: Negotiation = { '@type': 'NegotiateChannels', exchangeId: '789', contents: [channel] }
const localSdp = ['v=0', 'o=- 1 1 IN IP4 0.0.0.0', 's=-', 't=0 0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111', 'c=IN IP4 0.0.0.0', 'a=mid:0', 'a=sendonly', 'a=ice-ufrag:abcd', `a=ice-pwd:${'x'.repeat(24)}`, `a=fingerprint:sha-256 ${setup.fingerprints[0].fingerprint}`, 'a=setup:actpass', 'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=1', 'a=rtcp-fb:111 transport-cc', `a=extmap:3 ${channel.rtpExtensions[0].uri}`, 'a=ssrc:12345 cname:synthetic', ''].join('\r\n')

afterEach(() => vi.restoreAllMocks())

it('validates nested remote SDP fields and rejects injection, duplicate identifiers, and missing fingerprints', () => {
  expect(parseSignal(offer)).toEqual(offer)
  expect(localSetup(localSdp)).toEqual(setup)
  expect(localContents(localSdp)).toEqual([channel])
  for (const message of [
    { ...setup, ufrag: 'abcd\r\na=ice-lite' }, { ...setup, fingerprints: [] },
    { ...setup, fingerprints: [{ ...setup.fingerprints[0], hash: 'sha-1' }] },
    { ...offer, contents: [{ ...channel, ssrc: '4294967296' }] },
    { ...offer, contents: [{ ...channel, payloadTypes: [...channel.payloadTypes, ...channel.payloadTypes] }] },
    { ...offer, contents: [{ ...channel, payloadTypes: [{ ...channel.payloadTypes[0], parameters: { minptime: '10\r\na=inactive' } }] }] },
    { ...offer, contents: [{ ...channel, rtpExtensions: [{ id: 3, uri: 'urn:bad\na=inactive' }] }] },
    { ...offer, contents: [channel, channel] },
    { '@type': 'Candidates', candidates: [{ sdpString: 'candidate:1\r\na=inactive' }] },
  ]) expect(() => parseSignal(message)).toThrow()
})

it('uses the native send-only contract: answers acknowledge offered SSRCs without inventing peer tracks', () => {
  const n = new TelegramNegotiation()
  expect(n.offer(localSdp)).toEqual([channel])
  const answer = n.description(setup, offer, localSdp, true, true)
  expect(answer).toContain('a=recvonly')
  expect(answer).toContain('a=setup:passive')
  expect(answer).not.toContain('a=ssrc:')
  expect(() => n.description(setup, { ...offer, contents: [{ ...channel, ssrc: '999' }] }, localSdp, true, true)).toThrow('unknown channel')
  const peerOffer = { ...offer, exchangeId: '790', contents: [{ ...channel, ssrc: '999' }] }
  const description = n.description(setup, peerOffer, localSdp, false, true)
  expect(description).toContain('a=mid:0\r\na=recvonly')
  expect(description).toContain('a=mid:100\r\na=sendonly')
  expect(description).toContain('a=ssrc:999 cname:telegram')
  const browserAnswer = description.replace(/a=sendonly/g, 'a=RECV').replace(/a=recvonly/g, 'a=sendonly').replace(/a=RECV/g, 'a=recvonly')
  expect(n.answer(browserAnswer, peerOffer).map(c => c.ssrc)).toEqual(['999'])
})

function fixture(media?: Promise<MediaStream>, ticket?: Promise<{ url: string; token: string; expiresAt: number }>) {
  class Socket extends EventTarget {
    readyState = 1; bufferedAmount = 0; protocol = 'hype.telegram.v1'
    send = vi.fn(); close = vi.fn()
    message(value: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })) }
  }
  const socket = new Socket(), track = { kind: 'audio', stop: vi.fn(), enabled: true }
  const stream = { getTracks: () => [track], getAudioTracks: () => [track], getVideoTracks: () => [] } as unknown as MediaStream
  const audio = { pause: vi.fn(), play: vi.fn().mockResolvedValue(undefined), srcObject: null, autoplay: false } as unknown as HTMLAudioElement
  const peer = { close: vi.fn() } as unknown as RTCPeerConnection
  const deps = { media: vi.fn().mockImplementation(() => media ?? Promise.resolve(stream)), ticket: vi.fn().mockImplementation(() => ticket ?? Promise.resolve({ url: 'ws://localhost/calls/id', token: 'a'.repeat(64), expiresAt: Date.now() + 30000 })), socket: vi.fn().mockReturnValue(socket), audio: () => audio, peer: vi.fn().mockReturnValue(peer) }
  const callbacks = { snapshot: vi.fn(), error: vi.fn(), closed: vi.fn(), video: vi.fn() }
  const call = new TelegramBrowserCall(callbacks, deps)
  const input = { kind: 'answer' as const, requestId: 'synthetic', id: '123' }
  async function open() { const pending = call.start(input); await vi.waitFor(() => expect(deps.socket).toHaveBeenCalledOnce()); socket.dispatchEvent(new Event('open')); await pending }
  return { call, input, deps, socket, callbacks, stream, track, audio, peer, open }
}

it('stops a microphone permission result arriving after cancellation without submitting a call', async () => {
  let resolve!: (s: MediaStream) => void
  const f = fixture(new Promise(r => { resolve = r }))
  const pending = f.call.start(f.input)
  f.call.close(); resolve(f.stream); await pending
  expect(f.track.stop).toHaveBeenCalledOnce()
  expect(f.deps.ticket).not.toHaveBeenCalled()
  expect(f.callbacks.closed).toHaveBeenCalledOnce()
})

it('discards a late ticket and releases media after cancellation', async () => {
  let resolve!: (t: { url: string; token: string; expiresAt: number }) => void
  const f = fixture(undefined, new Promise(r => { resolve = r }))
  const pending = f.call.start(f.input)
  await vi.waitFor(() => expect(f.deps.ticket).toHaveBeenCalledOnce())
  f.call.close(); resolve({ url: 'ws://localhost', token: 'a', expiresAt: Date.now() + 1000 }); await pending
  expect(f.track.stop).toHaveBeenCalledOnce()
  expect(f.deps.socket).not.toHaveBeenCalled()
})

it('enforces relay-only media policy and closes resources on an authenticated fingerprint change', async () => {
  const f = fixture(); await f.open()
  f.socket.message({ kind: 'setup', setup: { outgoing: false, video: false, p2pAllowed: false, iceServers: [{ urls: 'turn:127.0.0.1:3478', username: 'synthetic', credential: 'synthetic' }], fingerprint: '1' } })
  await vi.waitFor(() => expect(f.deps.peer).toHaveBeenCalledWith(expect.objectContaining({ iceTransportPolicy: 'relay' })))
  f.socket.message({ kind: 'signal', message: setup })
  f.socket.message({ kind: 'signal', message: { ...setup, fingerprints: [{ ...setup.fingerprints[0], fingerprint: Array(32).fill('BB').join(':') }] } })
  await vi.waitFor(() => expect(f.callbacks.error).toHaveBeenCalledOnce())
  expect(f.peer.close).toHaveBeenCalledOnce()
  expect(f.track.stop).toHaveBeenCalledOnce()
  expect(f.audio.srcObject).toBeNull()
})

it('closes once on socket backpressure without recursive hangup failure or call resubmission', async () => {
  const f = fixture(); await f.open()
  f.socket.bufferedAmount = 300000
  f.socket.message({ kind: 'setup', setup: { outgoing: false, video: false, p2pAllowed: true, iceServers: [], fingerprint: '1' } })
  await vi.waitFor(() => expect(f.deps.peer).toHaveBeenCalledOnce())
  f.call.mute(true)
  expect(f.callbacks.error).toHaveBeenCalledOnce()
  expect(f.callbacks.closed).toHaveBeenCalledOnce()
  expect(f.socket.send.mock.calls.filter(([s]) => JSON.parse(s).kind === 'answer')).toHaveLength(1)
  await expect(f.call.start(f.input)).rejects.toThrow('cannot be reused')
})


it('normalizes native video channel sentinels before constructing browser SDP', () => {
  const parsed = parseSignal(nativeVideoOffer) as Negotiation
  expect(parsed.contents[0].payloadTypes.every(payload => payload.channels === undefined)).toBe(true)
  const sdp = new TelegramNegotiation().description(setup, parsed, '', false, false)
  expect(sdp).toContain('a=rtpmap:100 VP8/90000\r\n')
  expect(sdp).toContain('a=rtpmap:101 rtx/90000\r\n')
  expect(sdp).toContain('a=fmtp:101 apt=100')
  expect(sdp).toContain('a=ssrc-group:FID 23456 23457')
  expect(sdp).not.toContain('/90000/0')
  expect(() => parseSignal({ ...offer, contents: [{ ...channel, payloadTypes: [{ ...channel.payloadTypes[0], channels: 0 }] }] })).toThrow()
})
