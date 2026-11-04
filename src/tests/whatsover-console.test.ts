// @vitest-environment jsdom
// TESTS
import { cleanup, fireEvent, render as renderComponent, waitFor, within } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// COMPONENTS
import Console from './fixtures/components/WhatsAppConsoleFixture.svelte'
import Pane from './fixtures/components/ConversationPaneFixture.svelte'
// TYPES
import type { WhatsAppMessage, WhatsAppSnapshot } from '#lib/api/services/whatsover.types.js'

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), connect: vi.fn(), stop: vi.fn(), send: vi.fn(), upload: vi.fn(), download: vi.fn(), profile: vi.fn(), ticket: vi.fn(), decline: vi.fn(), telegramFactory: vi.fn(), voiceFactory: vi.fn(), callbacks: null as any, voiceStart: vi.fn(), voiceClose: vi.fn(), voiceMute: vi.fn(), voiceCamera: vi.fn(), microphoneFactory: vi.fn(), microphoneStart: vi.fn(), microphoneClose: vi.fn(), microphoneSend: null as null | ((packet: ArrayBuffer) => void) }))
vi.mock('#lib/adapters/whatsapp/voiceAudio.js', async importOriginal => ({
  ...await importOriginal<typeof import('#lib/adapters/whatsapp/voiceAudio.js')>(),
  BrowserVoiceAudio: class { constructor(...args: unknown[]) { return mocks.microphoneFactory(...args) } },
}))
vi.mock('#lib/adapters/whatsapp/voiceVideo.js', () => ({ BrowserVoiceVideo: { supported: async () => true } }))
vi.mock('#lib/adapters/telegram/call.js', () => ({ TelegramBrowserCall: { supported: () => true, create: mocks.telegramFactory } }))
vi.mock('#lib/adapters/whatsapp/voiceCall.js', () => ({ BrowserVoiceCall: { create: mocks.voiceFactory } }))
vi.mock('#lib/bits/core/index.js', async () => ({ Button: (await import('#lib/bits/core/button/Button.svelte')).default }))

/** Supply a synthetic organisation transport explicitly; UI tests never select a personal account. */
function render(component: typeof Console, props?: { options: Parameters<typeof import('#lib/adapters/whatsapp/useWhatsAppModel.svelte.js').createWhatsAppModel>[0] }) {
  return renderComponent(component, { options: props?.options ?? {
    viewId: 'synthetic-whatsapp', platform: 'whatsapp',
    transport: {
      snapshot: mocks.snapshot, connect: mocks.connect, disconnect: mocks.stop,
      send: mocks.send, profile: mocks.profile, upload: mocks.upload, media: mocks.download,
      voiceTicket: mocks.ticket, declineCall: mocks.decline,
    },
  } })
}

const connected: WhatsAppSnapshot = {
  status: { connected: true, loggedOut: false, qr: null, qrExpiresAt: null },
  messages: [], outbox: [], calls: { incoming: [], current: null, videoSupported: true },
}
beforeEach(() => {
  vi.useRealTimers()
  // Browser checks cover actual textarea and menu geometry; jsdom needs the observer lifecycle.
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} })
  vi.resetAllMocks()
  mocks.snapshot.mockResolvedValue(connected)
  mocks.stop.mockResolvedValue({ stopped: true })
  mocks.microphoneStart.mockResolvedValue(undefined)
  mocks.microphoneFactory.mockImplementation(send => {
    mocks.microphoneSend = send
    return { start: mocks.microphoneStart, close: mocks.microphoneClose }
  })
  const factory = (callbacks: any) => {
    mocks.callbacks = callbacks
    mocks.voiceClose.mockImplementation(() => callbacks.closed())
    return { start: mocks.voiceStart, close: mocks.voiceClose, mute: mocks.voiceMute, camera: mocks.voiceCamera }
  }
  mocks.voiceFactory.mockImplementation(factory)
  mocks.telegramFactory.mockImplementation(factory)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('keeps send errors visible across polling and retries the exact same request', async () => {
  mocks.send.mockRejectedValue(new Error('Synthetic response lost'))
  const screen = render(Console)
  await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy())
  await fireEvent.input(screen.getByLabelText('Recipient'), { target: { value: '+15555550100' } })
  await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Synthetic message' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Synthetic response lost'))
  await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => expect(mocks.snapshot.mock.calls.length).toBeGreaterThan(2))
  expect(screen.getByRole('alert').textContent).toContain('Synthetic response lost')
  expect((screen.getByLabelText('Recipient') as HTMLInputElement).readOnly).toBe(true)
  await fireEvent.click(screen.getByRole('button', { name: 'Check / retry same request' }))
  await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2))
  expect(mocks.send.mock.calls[1][0]).toEqual(mocks.send.mock.calls[0][0])
})

it('does not let an older connected snapshot overwrite a completed stop', async () => {
  let resolveSnapshot!: (value: WhatsAppSnapshot) => void
  mocks.snapshot.mockReturnValueOnce(new Promise<WhatsAppSnapshot>(resolve => { resolveSnapshot = resolve }))
  const screen = render(Console)
  await waitFor(() => expect(mocks.snapshot).toHaveBeenCalledTimes(1))
  await fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
  await waitFor(() => expect(mocks.stop).toHaveBeenCalledTimes(1))
  resolveSnapshot(connected)
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(screen.getByText('Disconnected')).toBeTruthy()
  expect(screen.queryByText('Connected')).toBeNull()
})

it('renders pairing and inbox content without treating message text as HTML', async () => {
  mocks.snapshot.mockResolvedValue({
    status: { ...connected.status, connected: false, qr: 'synthetic-pairing-fixture', qrExpiresAt: Date.now() + 60_000 },
    outbox: [],
    messages: [{ sequence: 1, chat: 'synthetic-chat', sender: 'synthetic-sender', id: 'synthetic-id', timestamp: Date.now(), fromMe: false, text: '<img src=x onerror=alert(1)>' }],
  })
  const screen = render(Console)
  await waitFor(() => expect(screen.getByText('Ready to link')).toBeTruthy())
  expect(screen.getByAltText('WhatsApp linked-device pairing QR code').getAttribute('src')).toMatch(/^data:image\/svg\+xml,/)
  expect(screen.getAllByText('<img src=x onerror=alert(1)>')).toHaveLength(2)
  expect(screen.container.querySelector('[onerror]')).toBeNull()
})


it('replies with an exact stored target and keeps that target stable after a lost response', async () => {
  const original = { sequence: 1, chat: '15555550100@s.whatsapp.net', sender: '15555550100@s.whatsapp.net', id: 'original', timestamp: 1, fromMe: false, text: 'Original message' }
  mocks.snapshot.mockResolvedValue({ ...connected, messages: [original] })
  mocks.send.mockRejectedValue(new Error('Synthetic reply response lost'))
  const screen = render(Console)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Reply' })).toBeTruthy())
  await fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
  expect((screen.getByLabelText('Recipient') as HTMLInputElement).value).toBe(original.chat)
  await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'A quoted reply' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1))
  expect(mocks.send.mock.calls[0][0]).toMatchObject({ to: original.chat, text: 'A quoted reply', replyTo: { id: 'original', sender: original.sender } })
  await fireEvent.click(screen.getByRole('button', { name: 'Check / retry same request' }))
  await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2))
  expect(mocks.send.mock.calls[1][0]).toEqual(mocks.send.mock.calls[0][0])
})

it('advances past hidden protocol rows and displays the latest reaction only', async () => {
  const original = { sequence: 1, chat: '15555550100@s.whatsapp.net', sender: '15555550100@s.whatsapp.net', id: 'original', timestamp: 1, fromMe: false, text: 'Hello' }
  const event = (sequence: number, emoji: string) => ({ ...original, sequence, id: `reaction-${sequence}`, text: null, content: { kind: 'reaction', reaction: { targetId: 'original', targetSender: original.sender, targetFromMe: true, emoji } } })
  mocks.snapshot.mockResolvedValue({ ...connected, messages: [original, event(2, '👍'), event(3, '❤️'), { ...original, sequence: 4, id: 'sync', text: 'INTERNAL PROTOCOL', content: { kind: 'protocol' } }] })
  const screen = render(Console)
  await waitFor(() => expect(screen.getByLabelText('Reactions').textContent).toContain('❤️'))
  expect(screen.getByLabelText('Reactions').textContent).not.toContain('👍')
  expect(screen.queryByText('INTERNAL PROTOCOL')).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => expect(mocks.snapshot).toHaveBeenLastCalledWith(4))
})

it('stages an image without sending it and includes its opaque ID in an explicit send', async () => {
  mocks.upload.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000000', content: { kind: 'image' } })
  mocks.send.mockImplementation(async input => ({ request: input, messageId: 'sent', state: 'submitted' }))
  const screen = render(Console)
  await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy())
  const file = new File(['synthetic'], 'photo.png', { type: 'image/png' })
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode('synthetic').buffer })
  await fireEvent.change(screen.getByLabelText('Choose image'), { target: { files: [file] } })
  await waitFor(() => expect(screen.getByText('photo.png')).toBeTruthy())
  expect(mocks.send).not.toHaveBeenCalled()
  await fireEvent.input(screen.getByLabelText('Recipient'), { target: { value: '+15555550100' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1))
  expect(mocks.send.mock.calls[0][0]).toMatchObject({ text: '', attachmentId: '00000000-0000-4000-8000-000000000000' })
})


it('uses resolved names, handles and photos while joining verified PN and LID history', async () => {
  const photo = 'data:image/png;base64,iVBORw0KGgo='
  const pn = '15555550100@s.whatsapp.net', lid = '123456789012@lid'
  mocks.profile.mockResolvedValue({ jid: lid, name: 'Synthetic Person', username: 'synthetic.person', phone: '+15555550100', aliases: [pn, lid], photo })
  mocks.snapshot.mockResolvedValue({ ...connected, messages: [{ sequence: 1, chat: lid, sender: lid, id: 'incoming', timestamp: 1, fromMe: false, text: 'Hello from a LID' }], outbox: [{ request: { requestId: 'outgoing', to: pn, text: 'Hello back' }, messageId: 'sent', state: 'submitted' }] })
  const screen = render(Console)
  await waitFor(() => expect(screen.getAllByText('Synthetic Person').length).toBeGreaterThan(1))
  expect(screen.getAllByText('@synthetic.person').length).toBeGreaterThan(1)
  expect(screen.getByText('Hello back')).toBeTruthy()
  expect(screen.getByRole('navigation', { name: 'WhatsApp conversations' }).querySelectorAll('button')).toHaveLength(1)
  expect(screen.queryByText(lid)).toBeNull()
})


it('releases the composer after a confirmed send while retaining failed attempts', async () => {
  mocks.send.mockImplementation(async input => ({ request: input, messageId: 'sent', state: 'submitted' }))
  const screen = render(Console)
  await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy())
  await fireEvent.input(screen.getByLabelText('Recipient'), { target: { value: '+15555550100' } })
  await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Confirmed message' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe(''))
  expect((screen.getByLabelText('Recipient') as HTMLInputElement).readOnly).toBe(false)
  expect((screen.getByRole('button', { name: 'Attach files' }) as HTMLButtonElement).disabled).toBe(false)
  await fireEvent.keyDown(screen.getByRole('button', { name: 'Attach files' }), { key: 'Enter' })
  const menu = within(await screen.findByRole('menu', { hidden: true }))
  expect(menu.getByText('Photo or video').closest('[role="menuitem"]')?.hasAttribute('data-disabled')).toBe(false)
})

it('starts calls only on an explicit click and exposes mute and hang-up controls', async () => {
  mocks.snapshot.mockResolvedValue({ ...connected, voiceAvailable: true, calls: { incoming: [], current: null } })
  const screen = render(Console)
  await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy())
  await fireEvent.input(screen.getByLabelText('Recipient'), { target: { value: '+15555550100' } })
  expect(mocks.voiceFactory).not.toHaveBeenCalled()
  await fireEvent.click(screen.getByRole('button', { name: 'Voice call' }))
  expect(mocks.voiceStart).toHaveBeenCalledWith(expect.objectContaining({ kind: 'outgoing', to: '+15555550100' }))
  const input = mocks.voiceStart.mock.calls[0][0]
  mocks.callbacks.snapshot({ incoming: [], current: { requestId: input.requestId, id: 'call', peer: '+15555550100', phase: 'active', muted: false, startedAt: Date.now(), connectedAt: Date.now(), error: null } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Mute' }).hasAttribute('disabled')).toBe(false))
  await fireEvent.click(screen.getByRole('button', { name: 'Mute' }))
  expect(mocks.voiceMute).toHaveBeenCalledWith(true)
  await fireEvent.click(screen.getByRole('button', { name: 'Hang up' }))
  expect(mocks.voiceClose).toHaveBeenCalledOnce()
})

it('declines incoming calls without starting microphone setup', async () => {
  mocks.snapshot.mockResolvedValue({ ...connected, voiceAvailable: true, calls: { incoming: [{ id: 'incoming', peer: '15555550100@s.whatsapp.net', name: 'Synthetic Caller', receivedAt: Date.now() }], current: null } })
  const screen = render(Console)
  await waitFor(() => expect(screen.getByText('Synthetic Caller')).toBeTruthy())
  await fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
  expect(mocks.decline).toHaveBeenCalledWith('incoming')
  expect(mocks.voiceFactory).not.toHaveBeenCalled()
})

it('answers the selected incoming call and releases it on navigation', async () => {
  mocks.snapshot.mockResolvedValue({ ...connected, voiceAvailable: true, calls: { incoming: [{ id: 'incoming', peer: '15555550100@s.whatsapp.net', name: 'Synthetic Caller', receivedAt: Date.now() }], current: null } })
  const screen = render(Console)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Answer' })).toBeTruthy())
  await fireEvent.click(screen.getByRole('button', { name: 'Answer' }))
  expect(mocks.voiceStart).toHaveBeenCalledWith(expect.objectContaining({ kind: 'answer', id: 'incoming' }))
  screen.unmount()
  expect(mocks.voiceClose).toHaveBeenCalledOnce()
})


it('explains expired pairing and shows a fresh QR after explicit reconnect', async () => {
  const expired = { ...connected, status: { ...connected.status, connected: false, lastEvent: 'PairingQrCodesExhausted' } }
  const ready = { ...connected, status: { ...connected.status, connected: false, qr: 'synthetic-renewed-code', qrExpiresAt: Date.now() + 60_000, lastEvent: 'PairingQrCode' } }
  mocks.snapshot.mockResolvedValue(expired)
  mocks.connect.mockImplementation(async () => { mocks.snapshot.mockResolvedValue(ready); return ready.status })
  const screen = render(Console)
  await waitFor(() => expect(screen.getByText('QR code expired')).toBeTruthy())
  expect(screen.queryByAltText('WhatsApp linked-device pairing QR code')).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Show new QR code' }))
  await waitFor(() => expect(screen.getByAltText('WhatsApp linked-device pairing QR code')).toBeTruthy())
  expect(screen.getByText('Ready to link')).toBeTruthy()
  expect(mocks.connect).toHaveBeenCalledTimes(1)
})


it.each(['s.whatsapp.net', 'lid'])('resolves device-qualified %s senders without changing reply targets', async server => {
  const jid = `15555550100@${server}`, sender = `15555550100:73@${server}`
  const message = { sequence: 1, chat: jid, sender, senderName: 'Phone nickname', id: 'device-message', timestamp: 1, fromMe: false, text: 'From a linked device' }
  mocks.profile.mockImplementation(async requested => {
    if (requested !== jid) throw new Error('Device-qualified profile addresses are not supported')
    return { jid, name: 'Resolved Person', username: 'resolved.person', phone: server === 's.whatsapp.net' ? '+15555550100' : null, aliases: [jid], photo: 'data:image/png;base64,iVBORw0KGgo=' }
  })
  mocks.snapshot.mockResolvedValue({ ...connected, messages: [message] })
  mocks.send.mockImplementation(async request => ({ request, state: 'submitted', messageId: 'reply' }))
  const screen = render(Console)
  await waitFor(() => expect(screen.getByRole('article', { name: 'Message from Resolved Person' })).toBeTruthy())
  expect(mocks.profile.mock.calls.every(([address]) => address === jid)).toBe(true)
  expect(screen.getAllByText('@resolved.person').length).toBeGreaterThan(1)
  await fireEvent.click(screen.getByRole('button', { name: 'Reply' }))
  await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Reply to the same stored sender' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1))
  expect(mocks.send.mock.calls[0][0].replyTo).toEqual({ id: message.id, sender })
})

/** Control viewport entry without downloading offscreen fixtures.
 * @returns Observer notifications and private URL spies.
 */
function mediaViewport() {
  const entries: { callback: IntersectionObserverCallback; node: Element }[] = []
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(node: Element) { entries.push({ callback: this.callback, node }) }
    disconnect() {}
  })
  const create = vi.fn(() => 'blob:synthetic-media')
  const revoke = vi.fn()
  vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke })
  return { create, revoke, enter: () => { for (const { callback, node } of entries) callback([{ isIntersecting: true, target: node } as IntersectionObserverEntry], {} as IntersectionObserver) } }
}

afterEach(() => vi.unstubAllGlobals())

it.each([true, false])('loads visible synced media automatically with fromMe=%s and preserves the stored sender', async fromMe => {
  const viewport = mediaViewport()
  const sender = '15555550101:73@s.whatsapp.net'
  const messages = ['image', 'sticker', 'audio'].map((kind, i) => ({ sequence: i + 1, chat: '15555550100@s.whatsapp.net', sender, id: kind, timestamp: i + 1, fromMe, text: null, content: { kind, mimeType: kind === 'audio' ? 'audio/ogg; codecs=opus' : 'image/png', voiceNote: kind === 'audio', viewOnce: false } }))
  mocks.snapshot.mockResolvedValue({ ...connected, messages })
  mocks.download.mockResolvedValue(new Uint8Array([1, 2, 3]))
  const screen = render(Console)
  await waitFor(() => expect(screen.getAllByText('Waiting to load…')).toHaveLength(3))
  expect(mocks.download).not.toHaveBeenCalled()
  viewport.enter()
  await waitFor(() => expect(screen.getAllByAltText('Chat image')[0]).toBeTruthy())
  expect(screen.getAllByAltText('Chat sticker')[0]).toBeTruthy()
  expect(screen.getByLabelText('Voice message').getAttribute('src')).toBe('blob:synthetic-media')
  expect(screen.getByLabelText('Voice message').hasAttribute('autoplay')).toBe(false)
  expect(mocks.download.mock.calls.map(([, target]) => target)).toEqual(messages.map(({ id }) => ({ id, sender })))
  viewport.enter()
  mocks.snapshot.mockResolvedValue({ ...connected, messages: messages.map(message => ({ ...message, sequence: message.sequence + 100, readByMe: true })) })
  await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(screen.getAllByAltText('Chat image')[0].getAttribute('src')).toBe('blob:synthetic-media')
  expect(mocks.download).toHaveBeenCalledTimes(3)
  screen.unmount()
  expect(viewport.revoke).toHaveBeenCalledTimes(3)
})

it('leaves failed automatic media loads for an explicit retry and never auto-loads documents or view-once content', async () => {
  const viewport = mediaViewport()
  const original = { sequence: 1, chat: '15555550100@s.whatsapp.net', sender: '15555550101:73@s.whatsapp.net', id: 'image', timestamp: 1, fromMe: true, text: null, content: { kind: 'image', mimeType: 'image/png', viewOnce: false } }
  mocks.snapshot.mockResolvedValue({ ...connected, messages: [original, { ...original, sequence: 2, id: 'private', content: { ...original.content, viewOnce: true } }, { ...original, sequence: 3, id: 'document', content: { ...original.content, kind: 'document' } }] })
  mocks.download.mockRejectedValueOnce(new Error('Synthetic media unavailable')).mockResolvedValue(new Uint8Array([1]))
  const screen = render(Console)
  await waitFor(() => expect(screen.getByText('Waiting to load…')).toBeTruthy())
  viewport.enter()
  await waitFor(() => expect(screen.getByText('Synthetic media unavailable')).toBeTruthy())
  await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(mocks.download).toHaveBeenCalledTimes(1)
  expect(screen.getByText('View-once image · Open in WhatsApp')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Load document' })).toBeTruthy()
  await fireEvent.click(screen.getByRole('button', { name: 'Retry media' }))
  await waitFor(() => expect(screen.getAllByAltText('Chat image')[0]).toBeTruthy())
  expect(mocks.download).toHaveBeenCalledTimes(2)
  expect(screen.queryByText('Synthetic media unavailable')).toBeNull()
})

it('discards media downloads completing after the console is unmounted', async () => {
  const viewport = mediaViewport()
  let finish!: (bytes: Uint8Array) => void
  mocks.download.mockReturnValue(new Promise<Uint8Array>(resolve => { finish = resolve }))
  mocks.snapshot.mockResolvedValue({ ...connected, messages: [{ sequence: 1, chat: '15555550100@s.whatsapp.net', sender: '15555550101:73@s.whatsapp.net', id: 'late', timestamp: 1, fromMe: true, text: null, content: { kind: 'image', mimeType: 'image/png' } }] })
  const screen = render(Console)
  await waitFor(() => expect(screen.getByText('Waiting to load…')).toBeTruthy())
  viewport.enter()
  await waitFor(() => expect(mocks.download).toHaveBeenCalledOnce())
  screen.unmount()
  finish(new Uint8Array([1]))
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(viewport.create).not.toHaveBeenCalled()
})


it('checks microphone levels locally, prevents dialing during the check, and releases the input on stop', async () => {
  mocks.snapshot.mockResolvedValue({ ...connected, voiceAvailable: true })
  const screen = render(Console)
  await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy())
  await fireEvent.input(screen.getByLabelText('Recipient'), { target: { value: '+15555550100' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Microphone settings' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Test microphone' }))
  await waitFor(() => expect(screen.getByText('Speak now — this check stays on your device.')).toBeTruthy())
  expect(screen.getByRole('button', { name: 'Voice call' }).hasAttribute('disabled')).toBe(true)
  expect(mocks.ticket).not.toHaveBeenCalled()
  expect(mocks.voiceFactory).not.toHaveBeenCalled()
  expect(mocks.send).not.toHaveBeenCalled()
  const packet = new ArrayBuffer(2)
  new DataView(packet).setInt16(0, 16384, true)
  mocks.microphoneSend?.(packet)
  await waitFor(() => expect(screen.getByLabelText('Microphone input level').getAttribute('value')).toBe('0.5'))
  await fireEvent.click(screen.getByRole('button', { name: 'Stop mic check' }))
  expect(mocks.microphoneClose).toHaveBeenCalledOnce()
  expect(screen.getByText('Microphone check passed.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Voice call' }).hasAttribute('disabled')).toBe(false)
})

it('disposes the microphone check on navigation and ignores a late start result', async () => {
  let start!: () => void
  mocks.microphoneStart.mockImplementation(() => new Promise<void>(resolve => { start = resolve }))
  const screen = render(Console)
  await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy())
  await fireEvent.click(screen.getByRole('button', { name: 'Microphone settings' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Test microphone' }))
  screen.unmount()
  start()
  await Promise.resolve()
  expect(mocks.microphoneClose).toHaveBeenCalledOnce()
  expect(mocks.ticket).not.toHaveBeenCalled()
})


it('requires an explicit video action and carries the video mode to the call controller', async () => {
  mocks.snapshot.mockResolvedValue({ ...connected, voiceAvailable: true })
  const screen = render(Console)
  await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy())
  await fireEvent.input(screen.getByLabelText('Recipient'), { target: { value: '+15555550100' } })
  expect(mocks.voiceFactory).not.toHaveBeenCalled()
  await fireEvent.click(screen.getByRole('button', { name: 'Video call' }))
  expect(mocks.voiceStart).toHaveBeenCalledWith(expect.objectContaining({ kind: 'outgoing', video: true }))
  await fireEvent.click(screen.getByRole('button', { name: 'Camera off' }))
  expect(mocks.voiceCamera).toHaveBeenCalledWith(false)
  screen.unmount()
  expect(mocks.voiceClose).toHaveBeenCalledOnce()
})

it('identifies incoming video and answers it only on the video answer action', async () => {
  mocks.snapshot.mockResolvedValue({ ...connected, voiceAvailable: true, calls: { videoSupported: true, current: null, incoming: [{ id: 'incoming-video', peer: '15555550100@s.whatsapp.net', name: 'Synthetic Caller', video: true, receivedAt: Date.now() }] } })
  const screen = render(Console)
  await waitFor(() => expect(screen.getByText('Incoming video call')).toBeTruthy())
  expect(mocks.voiceFactory).not.toHaveBeenCalled()
  await fireEvent.click(screen.getByRole('button', { name: 'Answer video' }))
  expect(mocks.voiceStart).toHaveBeenCalledWith(expect.objectContaining({ kind: 'answer', id: 'incoming-video', video: true }))
})


it('uses Telegram transport, replaces edited messages, and releases its viewer lease', async () => {
  const message = { sequence: 1, chat: '42', sender: '42', id: '1', timestamp: Date.now(), fromMe: false, text: 'Original Telegram message' }
  const transport = {
    snapshot: vi.fn().mockResolvedValue({ ...connected, messages: [message] }),
    connect: vi.fn(), disconnect: vi.fn(), send: vi.fn(), profile: vi.fn().mockResolvedValue({ jid: '42', name: 'Synthetic contact', aliases: ['42'], username: 'synthetic', phone: null, photo: null }),
    upload: vi.fn(), media: vi.fn(), voiceTicket: vi.fn(), declineCall: vi.fn(), watch: vi.fn().mockResolvedValue(undefined), unwatch: vi.fn().mockResolvedValue(undefined),
  }
  const screen = render(Console, { options: { platform: 'telegram', viewId: 'telegram-a', transport } })
  await waitFor(() => expect(screen.getByRole('heading', { name: /^Telegram$/ })).toBeTruthy())
  await waitFor(() => expect(screen.getAllByText('Original Telegram message').length).toBeGreaterThan(0))
  expect(mocks.snapshot).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Recipient').id).toBe('telegram-a-recipient')
  transport.snapshot.mockResolvedValue({ ...connected, messages: [{ ...message, sequence: 2, text: 'Edited Telegram message' }] })
  await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => expect(screen.queryByText('Original Telegram message')).toBeNull())
  expect(screen.getAllByText('Edited Telegram message').length).toBeGreaterThan(0)
  const viewer = transport.watch.mock.calls[0][0]
  screen.unmount()
  await waitFor(() => expect(transport.unwatch).toHaveBeenCalledWith(viewer))
})

it('resolves Telegram recipients once and pins an uncertain send to the resolved account address', async () => {
  const transport = {
    snapshot: vi.fn().mockResolvedValue(connected), connect: vi.fn(), disconnect: vi.fn(),
    send: vi.fn().mockImplementation(async request => ({ request, state: 'uncertain', messageId: '' })),
    profile: vi.fn().mockResolvedValue({ jid: '42', name: 'Synthetic contact', aliases: ['42'], username: 'synthetic', phone: null, photo: null }),
    upload: vi.fn(), media: vi.fn(), voiceTicket: vi.fn(), declineCall: vi.fn(), watch: vi.fn().mockResolvedValue(undefined), unwatch: vi.fn().mockResolvedValue(undefined),
  }
  const screen = render(Console, { options: { platform: 'telegram', transport } })
  await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy())
  await fireEvent.input(screen.getByLabelText('Recipient'), { target: { value: '@synthetic' } })
  await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Synthetic Telegram message' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(transport.send).toHaveBeenCalledOnce())
  expect(transport.send.mock.calls[0][0]).toMatchObject({ to: '42', text: 'Synthetic Telegram message' })
  expect(mocks.send).not.toHaveBeenCalled()
  expect((screen.getByLabelText('Recipient') as HTMLInputElement).readOnly).toBe(true)
})


it('loads older Telegram history without advancing live replay or reverting a newer displayed edit', async () => {
  const message = { sequence: 1, chat: '42', sender: '42', id: '31', timestamp: 31000, fromMe: false, text: 'Recent Telegram message' }
  const older = { ...message, sequence: 200, id: '30', timestamp: 31000, text: 'Older edited message' }
  const transport = {
    snapshot: vi.fn().mockResolvedValue({ ...connected, messages: [message] }),
    history: vi.fn().mockRejectedValueOnce(new Error('History temporarily unavailable')).mockResolvedValueOnce({ messages: [older], nextBefore: '30' }).mockResolvedValue({ messages: [], nextBefore: null }),
    connect: vi.fn(), disconnect: vi.fn(), send: vi.fn(), profile: vi.fn().mockResolvedValue({ jid: '42', name: 'Synthetic contact', aliases: ['42'], username: null, phone: null, photo: null }),
    upload: vi.fn(), media: vi.fn(), voiceTicket: vi.fn(), declineCall: vi.fn(), watch: vi.fn().mockResolvedValue(undefined), unwatch: vi.fn().mockResolvedValue(undefined),
  }
  const screen = render(Console, { options: { platform: 'telegram', transport } })
  await waitFor(() => expect(screen.getAllByText('Recent Telegram message').length).toBeGreaterThan(0))
  await fireEvent.wheel(screen.getByRole('log', {name:'Messages'}), {deltaY:-100})
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('History temporarily unavailable'))
  await fireEvent.wheel(screen.getByRole('log', {name:'Messages'}), {deltaY:-100})
  await waitFor(() => expect(screen.getByText('Older edited message')).toBeTruthy())
  expect(screen.getAllByText('Recent Telegram message')).toHaveLength(2)
  expect(transport.history.mock.calls.slice(0, 2)).toEqual([['42', undefined], ['42', undefined]])
  transport.snapshot.mockResolvedValue({ ...connected, messages: [{ ...older, sequence: 2, text: 'Stale original' }, { ...message, sequence: 3, id: '32', text: 'Live message during history' }] })
  await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => expect(screen.getAllByText('Live message during history').length).toBeGreaterThan(0))
  expect(transport.snapshot).toHaveBeenLastCalledWith(1)
  expect(screen.queryByText('Stale original')).toBeNull()
  expect(screen.getByText('Older edited message')).toBeTruthy()
  await fireEvent.wheel(screen.getByRole('log', {name:'Messages'}), {deltaY:-100})
  await waitFor(() => expect(screen.getByText('Beginning of available history')).toBeTruthy())
  expect(transport.history).toHaveBeenLastCalledWith('42', '30')
})


it('discovers older conversations, skips an already imported page, and keeps the current chat selected', async () => {
  const original = { sequence: 1, id: '1', chat: '42', sender: '42', timestamp: 31000, fromMe: false, text: 'Current chat text' }
  const discovered = { ...original, sequence: 100, id: '8', chat: '900', sender: '900', timestamp: 1000, text: 'Older conversation preview' }
  const cursor = { peer: '42', id: 1, date: 31000 }
  const transport = {
    snapshot: vi.fn().mockResolvedValue({ ...connected, messages: [original] }),
    dialogs: vi.fn().mockResolvedValueOnce({ messages: [original], next: cursor }).mockResolvedValue({ messages: [discovered], next: null }),
    connect: vi.fn(), disconnect: vi.fn(), send: vi.fn(), profile: vi.fn().mockImplementation(async jid => ({ jid, name: 'Contact ' + jid, aliases: [jid], username: null, phone: null, photo: null })),
    upload: vi.fn(), media: vi.fn(), voiceTicket: vi.fn(), declineCall: vi.fn(), watch: vi.fn().mockResolvedValue(undefined), unwatch: vi.fn().mockResolvedValue(undefined),
  }
  const screen = render(Console, { options: { platform: 'telegram', transport } })
  await waitFor(() => expect(screen.getAllByText('Current chat text').length).toBeGreaterThan(0))
  await fireEvent.click(screen.getByRole('button', { name: 'Find more conversations' }))
  await waitFor(() => expect(screen.getByText('All available conversations loaded')).toBeTruthy())
  expect(transport.dialogs.mock.calls).toEqual([[undefined], [cursor]])
  expect(screen.getByText('Older conversation preview')).toBeTruthy()
  expect(screen.getByRole('log', { name: 'Messages' }).textContent).toContain('Current chat text')
  expect(screen.getByRole('log', { name: 'Messages' }).textContent).not.toContain('Older conversation preview')
  await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(transport.snapshot).toHaveBeenLastCalledWith(1)
})


it('uses Telegram WebRTC for explicit video calls, resolves usernames, and binds tickets to the current viewer', async () => {
  const transport = {
    snapshot: vi.fn().mockResolvedValue({ ...connected, voiceAvailable: true }),
    connect: vi.fn(), disconnect: vi.fn(), send: vi.fn(), profile: vi.fn().mockResolvedValue({ jid: '42', name: 'Synthetic contact', aliases: ['42'], username: 'synthetic', phone: null, photo: null }),
    upload: vi.fn(), media: vi.fn(), voiceTicket: vi.fn().mockResolvedValue({ url: 'ws://localhost/calls/id', token: 'synthetic', expiresAt: Date.now() + 30000 }), declineCall: vi.fn(), watch: vi.fn().mockResolvedValue(undefined), unwatch: vi.fn().mockResolvedValue(undefined),
  }
  const screen = render(Console, { options: { platform: 'telegram', viewId: 'telegram-call', transport } })
  await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy())
  await fireEvent.input(screen.getByLabelText('Recipient'), { target: { value: '@synthetic' } })
  expect(mocks.telegramFactory).not.toHaveBeenCalled()
  await fireEvent.click(screen.getByRole('button', { name: 'Video call' }))
  await waitFor(() => expect(mocks.voiceStart).toHaveBeenCalledWith(expect.objectContaining({ kind: 'outgoing', video: true, to: '42' })))
  expect(transport.profile).toHaveBeenCalledWith('@synthetic')
  expect(mocks.voiceFactory).not.toHaveBeenCalled()
  await mocks.telegramFactory.mock.calls[0][1]()
  expect(transport.voiceTicket).toHaveBeenCalledWith(transport.watch.mock.calls[0][0])
  await fireEvent.click(screen.getByRole('button', { name: 'Camera off' }))
  expect(mocks.voiceCamera).toHaveBeenCalledWith(false)
  screen.unmount()
  expect(mocks.voiceClose).toHaveBeenCalledOnce()
})


it('keeps the selected Hype recipient fixed in the compact conversation pane', async () => {
  mocks.send.mockResolvedValue({ state: 'submitted', messageId: 'synthetic-sent', requestId: 'synthetic-request' })
  const selectedChat = '15555550100@s.whatsapp.net'
  const screen = renderComponent(Pane, { selectedChat, options: {
    viewId: 'synthetic-locked-pane', platform: 'whatsapp', transport: {
      snapshot: mocks.snapshot, connect: mocks.connect, disconnect: mocks.stop,
      send: mocks.send, profile: mocks.profile, upload: mocks.upload, media: mocks.download,
      voiceTicket: mocks.ticket, declineCall: mocks.decline,
    },
  } })
  await waitFor(() => expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(false))
  expect(screen.getByRole('heading', { name: 'HYPE Test User' })).toBeTruthy()
  expect(screen.getByText('@hype-test-user')).toBeTruthy()
  expect(screen.getByText('WhatsApp', { exact: true })).toBeTruthy()
  expect(screen.queryByLabelText('Recipient')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Test microphone' })).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'Microphone settings' }))
  expect(screen.getByRole('button', { name: 'Test microphone' })).toBeTruthy()
  await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Synthetic message to the selected Hype user' } })
  await fireEvent.submit(screen.getByRole('form', { name: 'Message composer' }))
  await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce())
  expect(mocks.send.mock.calls[0][0].to).toBe(selectedChat)
})


it('preserves separate locked-recipient drafts and restores an uncertain send after changing conversations', async () => {
  const alpha = '15555550101@s.whatsapp.net', beta = '15555550102@s.whatsapp.net'
  mocks.snapshot.mockResolvedValue({ ...connected, messages: [
    { sequence: 1, id: 'alpha-incoming', chat: alpha, sender: alpha, senderName: 'Alpha User', timestamp: 1, fromMe: false, text: 'Alpha history' },
    { sequence: 2, id: 'beta-incoming', chat: beta, sender: beta, senderName: 'Beta User', timestamp: 2, fromMe: false, text: 'Beta history' },
  ] })
  mocks.send.mockImplementation(async request => ({ request, messageId: request.to === beta ? 'beta-sent' : '', state: request.to === beta ? 'submitted' : 'uncertain' }))
  const screen = render(Console, { options: {
    viewId: 'synthetic-locked-drafts', platform: 'whatsapp', recipientLocked: true,
    transport: {
      snapshot: mocks.snapshot, connect: mocks.connect, disconnect: mocks.stop,
      send: mocks.send, profile: mocks.profile, upload: mocks.upload, media: mocks.download,
      voiceTicket: mocks.ticket, declineCall: mocks.decline,
    },
  } })
  await waitFor(() => expect(screen.getByRole('button', { name: /Alpha User/ })).toBeTruthy())
  await fireEvent.click(screen.getByRole('button', { name: /Alpha User/ }))
  await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Draft only for Alpha' } })
  await fireEvent.click(screen.getByRole('button', { name: /Beta User/ }))
  expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('')
  expect((screen.getByLabelText('Recipient') as HTMLInputElement).value).toBe(beta)
  await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Send only to Beta' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce())
  expect(mocks.send.mock.calls[0][0]).toMatchObject({ to: beta, text: 'Send only to Beta' })
  await waitFor(() => expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe(''))
  await fireEvent.click(screen.getByRole('button', { name: /Alpha User/ }))
  expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Draft only for Alpha')
  await fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(screen.getByText(/Delivery is uncertain/)).toBeTruthy())
  expect(mocks.send.mock.calls[1][0]).toMatchObject({ to: alpha, text: 'Draft only for Alpha' })
  const uncertainRequest = structuredClone(mocks.send.mock.calls[1][0])
  await fireEvent.click(screen.getByRole('button', { name: /Beta User/ }))
  expect((screen.getByLabelText('Recipient') as HTMLInputElement).value).toBe(beta)
  expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('')
  expect(screen.queryByText(/Delivery is uncertain/)).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: /Alpha User/ }))
  expect((screen.getByLabelText('Recipient') as HTMLInputElement).value).toBe(alpha)
  expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe(uncertainRequest.text)
  expect((screen.getByLabelText('Message') as HTMLTextAreaElement).readOnly).toBe(true)
  expect((screen.getByRole('button', { name: 'Check / retry same request' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText(/Delivery is uncertain/)).toBeTruthy()
  expect(mocks.send).toHaveBeenCalledTimes(2)
})

it('edits an outgoing text inline while preserving the composer draft', async () => {
  const original = { sequence: 1, id: 'original', chat: '15555550100@s.whatsapp.net', sender: 'self', timestamp: Date.now(), fromMe: true, text: 'Before edit' }
  mocks.snapshot.mockResolvedValue({ ...connected, messages: [original] })
  mocks.send.mockImplementation(async request => {
    mocks.snapshot.mockResolvedValue({ ...connected, messages: [{ ...original, sequence: 2, text: request.text, editedAt: Date.now() }] })
    return { request, messageId: original.id, state: 'submitted' }
  })
  const screen = render(Console)
  await waitFor(() => expect(screen.getAllByText('Before edit')[0]).toBeTruthy())
  await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Unsent draft' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Edit message' }))
  await fireEvent.input(screen.getByLabelText('Edit message text'), { target: { value: 'After edit' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Save edit' }))
  await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce())
  expect(mocks.send.mock.calls[0][0]).toMatchObject({ to: original.chat, text: 'After edit', editTo: { id: 'original', sender: 'self' } })
  await waitFor(() => expect(screen.getAllByText('After edit')[0]).toBeTruthy())
  expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Unsent draft')
  expect(screen.getByText('edited')).toBeTruthy()
})


it('sends with Ctrl+Enter while leaving Enter and IME composition alone', async () => {
  mocks.send.mockImplementation(async request => ({ request, messageId: 'keyboard-send', state: 'submitted' }))
  const screen = render(Console)
  await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy())
  await fireEvent.input(screen.getByLabelText('Recipient'), { target: { value: '+15555550100' } })
  const input = screen.getByLabelText('Message')
  await fireEvent.input(input, { target: { value: 'First line\nSecond line' } })
  expect(input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))).toBe(true)
  await fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true, isComposing: true })
  await fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true, repeat: true })
  expect(mocks.send).not.toHaveBeenCalled()
  await fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
  await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce())
  expect(mocks.send.mock.calls[0][0].text).toBe('First line\nSecond line')
})

it('keeps an uncertain attachment batch on its original request and does not send the next file',async()=>{
 let staged=0
 mocks.upload.mockImplementation(async()=>({id:`attachment-${++staged}`,content:{kind:'document'}}))
 mocks.send.mockImplementation(async request=>({request,messageId:'',state:'uncertain'}))
 const screen=render(Console)
 await waitFor(()=>expect(screen.getByText('Connected')).toBeTruthy())
 await fireEvent.input(screen.getByLabelText('Recipient'),{target:{value:'+15555550100'}})
 const files=['one.txt','two.txt'].map(name=>{const file=new File(['synthetic'],name,{type:'text/plain'});Object.defineProperty(file,'arrayBuffer',{value:async()=>new TextEncoder().encode('synthetic').buffer});return file})
 await fireEvent.change(screen.getByLabelText('Choose attachments'),{target:{files}})
 await waitFor(()=>expect(screen.getByText('two.txt')).toBeTruthy())
 expect(mocks.send).not.toHaveBeenCalled()
 await fireEvent.click(screen.getByRole('button',{name:'Send message'}))
 await waitFor(()=>expect(mocks.send).toHaveBeenCalledTimes(1))
 expect(mocks.send.mock.calls[0][0].attachmentId).toBe('attachment-1')
 expect(screen.getByText('two.txt')).toBeTruthy()
})

it.each(['telegram', 'whatsapp'] as const)('searches saved %s history and restores the conversation when search closes', async platform => {
  const chat = platform === 'telegram' ? '42' : '15555550100@s.whatsapp.net'
  const initial = { sequence: 1, id: '1', chat, sender: chat, timestamp: 1, fromMe: false, text: 'Current conversation message' }
  const found = { ...initial, id: '99', sequence: 99, text: 'Found in saved history' }
  const search = vi.fn().mockResolvedValue([found])
  mocks.snapshot.mockResolvedValue({ ...connected, messages: [initial] })
  const screen = renderComponent(Pane, { selectedChat: chat, options: { platform, viewId: `search-${platform}`, transport: {
    snapshot: mocks.snapshot, connect: mocks.connect, disconnect: mocks.stop, send: mocks.send,
    profile: mocks.profile, upload: mocks.upload, media: mocks.download, voiceTicket: mocks.ticket,
    declineCall: mocks.decline, search,
  } } })
  await screen.findByText(initial.text)
  await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Keep this draft' } })
  const toggle = screen.getByRole('button', { name: 'Search messages' })
  await fireEvent.click(toggle)
  const input = screen.getByRole('textbox', { name: 'Search conversation' })
  await waitFor(() => expect(document.activeElement).toBe(input))
  await fireEvent.input(input, { target: { value: 'saved' } })
  await screen.findByText(found.text)
  expect(search).toHaveBeenLastCalledWith(chat, 'saved')
  expect(screen.queryByText(initial.text)).toBeNull()
  await screen.findByText('1 match')
  search.mockResolvedValueOnce([])
  await fireEvent.input(input, { target: { value: 'missing' } })
  await screen.findByText('No saved messages match “missing”.')
  let resolveSearch!: (rows: WhatsAppMessage[]) => void
  search.mockImplementationOnce(() => new Promise(resolve => { resolveSearch = resolve }))
  await fireEvent.input(input, { target: { value: 'slow' } })
  await waitFor(() => expect(search).toHaveBeenLastCalledWith(chat, 'slow'))
  await fireEvent.click(toggle)
  await screen.findByText(initial.text)
  expect(screen.queryByRole('textbox', { name: 'Search conversation' })).toBeNull()
  resolveSearch([found])
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(screen.queryByText(found.text)).toBeNull()
  expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Keep this draft')
  expect(document.activeElement).toBe(toggle)
})

it('acknowledges incoming messages only when focused, at the bottom, and outside search', async () => {
  const read = vi.fn().mockResolvedValue(undefined)
  const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  const message = { sequence: 1, id: 'incoming', chat: '15555550100@s.whatsapp.net', sender: 'sender', timestamp: Date.now(), fromMe: false, text: 'Read fixture' }
  mocks.snapshot.mockResolvedValue({ ...connected, messages: [message] })
  const screen = render(Console, { options: { viewId: 'read-fixture', platform: 'whatsapp', transport: { snapshot: mocks.snapshot, connect: mocks.connect, disconnect: mocks.stop, send: mocks.send, profile: mocks.profile, upload: mocks.upload, media: mocks.download, voiceTicket: mocks.ticket, declineCall: mocks.decline, read } } })
  await waitFor(() => expect(screen.getAllByText('Read fixture').length).toBeGreaterThan(0))
  expect(read).not.toHaveBeenCalled()
  focused.mockReturnValue(true)
  await fireEvent.focus(window)
  await waitFor(() => expect(read).toHaveBeenCalledTimes(1))
  await fireEvent.click(screen.getByRole('button', { name: 'Search messages' }))
  await fireEvent.input(screen.getByRole('textbox', { name: 'Search conversation' }), { target: { value: 'Read' } })
  mocks.snapshot.mockResolvedValue({ ...connected, messages: [{ ...message, id: 'second', sequence: 2 }] })
  await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(read).toHaveBeenCalledTimes(1)
  const log = screen.getByRole('log', { name: 'Messages' })
  Object.defineProperties(log, { scrollHeight: { value: 1000 }, clientHeight: { value: 100 } })
  log.scrollTop = 0
  await fireEvent.scroll(log)
  await fireEvent.input(screen.getByRole('textbox', { name: 'Search conversation' }), { target: { value: '' } })
  expect(read).toHaveBeenCalledTimes(1)
  log.scrollTop = 900
  await fireEvent.scroll(log)
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
  focused.mockRestore()
})

/** A reply fixture with the same native shape on both messaging platforms. */
function quotedMessages(chat: string): { original: WhatsAppMessage; reply: WhatsAppMessage } {
  const original: WhatsAppMessage = { sequence: 1, id: '7', chat, sender: chat, fromMe: false, timestamp: 1000, text: 'Original message to locate' }
  return { original, reply: { ...original, sequence: 2, id: '20', timestamp: 2000, text: 'Quoted reply body', content: {
    kind: 'text', text: 'Quoted reply body', mimeType: null, fileName: null, byteLength: null, duration: null, voiceNote: false, viewOnce: false, reaction: null,
    quoted: { id: original.id, sender: original.sender, text: 'Quote preview', kind: 'text' },
  } } }
}

it.each(['telegram', 'whatsapp'] as const)('opens a loaded %s quote directly and preserves the composer draft', async platform => {
  const { original, reply } = quotedMessages(platform === 'telegram' ? '42' : '15555550100@s.whatsapp.net')
  const quotedMessage = vi.fn()
  mocks.snapshot.mockResolvedValue({ ...connected, messages: [original, reply] })
  const screen = render(Console, { options: { platform, transport: { snapshot: mocks.snapshot, connect: mocks.connect, disconnect: mocks.stop, send: mocks.send, profile: mocks.profile, upload: mocks.upload, media: mocks.download, voiceTicket: mocks.ticket, declineCall: mocks.decline, quotedMessage } } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Show quoted message' })).toBeTruthy())
  await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Keep my draft' } })
  const scrollTo = vi.fn()
  Object.defineProperty(screen.getByRole('log', { name: 'Messages' }), 'scrollTo', { value: scrollTo })
  vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList)
  await fireEvent.click(screen.getByRole('button', { name: 'Show quoted message' }))
  await waitFor(() => expect(scrollTo).toHaveBeenCalledOnce())
  expect(screen.container.querySelector('[data-quote-target]')?.textContent).toContain(original.text)
  expect(document.activeElement).toBe(screen.container.querySelector('[data-quote-target]'))
  expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Keep my draft')
  expect(quotedMessage).not.toHaveBeenCalled()
  expect(mocks.send).not.toHaveBeenCalled()
})

it('looks up a missing quote only on click and keeps lookup replay separate from live polling', async () => {
  const { original, reply } = quotedMessages('42')
  const quotedMessage = vi.fn().mockResolvedValue({ ...original, sequence: 80 })
  mocks.snapshot.mockResolvedValue({ ...connected, messages: [reply] })
  const screen = render(Console, { options: { platform: 'telegram', transport: { snapshot: mocks.snapshot, connect: mocks.connect, disconnect: mocks.stop, send: mocks.send, profile: mocks.profile, upload: mocks.upload, media: mocks.download, voiceTicket: mocks.ticket, declineCall: mocks.decline, quotedMessage } } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Show quoted message' })).toBeTruthy())
  expect(quotedMessage).not.toHaveBeenCalled()
  const scrollTo = vi.fn()
  Object.defineProperty(screen.getByRole('log', { name: 'Messages' }), 'scrollTo', { value: scrollTo })
  vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList)
  await fireEvent.click(screen.getByRole('button', { name: 'Show quoted message' }))
  await waitFor(() => expect(scrollTo).toHaveBeenCalledOnce())
  expect(quotedMessage).toHaveBeenCalledExactlyOnceWith('42', { id: reply.id, sender: reply.sender })
  await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(mocks.snapshot).toHaveBeenLastCalledWith(2)
  expect(screen.container.querySelector('[data-quote-target]')?.textContent).toContain(original.text)
})


it.each(['telegram', 'whatsapp'] as const)('ignores a late %s quote lookup after switching conversations', async platform => {
  const alpha = platform === 'telegram' ? '42' : '15555550100@s.whatsapp.net'
  const beta = platform === 'telegram' ? '43' : '15555550101@s.whatsapp.net'
  const { original, reply } = quotedMessages(alpha)
  let resolveOriginal!: (message: WhatsAppMessage) => void
  const quotedMessage = vi.fn().mockReturnValue(new Promise<WhatsAppMessage>(resolve => { resolveOriginal = resolve }))
  mocks.snapshot.mockResolvedValue({ ...connected, messages: [
    { ...reply, senderName: 'Alpha User' },
    { ...reply, sequence: 3, id: '30', chat: beta, sender: beta, senderName: 'Beta User', text: 'Beta history', content: undefined },
  ] })
  const screen = render(Console, { options: { platform, recipientLocked: true, transport: { snapshot: mocks.snapshot, connect: mocks.connect, disconnect: mocks.stop, send: mocks.send, profile: mocks.profile, upload: mocks.upload, media: mocks.download, voiceTicket: mocks.ticket, declineCall: mocks.decline, quotedMessage } } })
  await waitFor(() => expect(screen.getByRole('button', { name: /Alpha User/ })).toBeTruthy())
  await fireEvent.click(screen.getByRole('button', { name: /Alpha User/ }))
  await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Alpha draft' } })
  const scrollTo = vi.fn()
  Object.defineProperty(screen.getByRole('log', { name: 'Messages' }), 'scrollTo', { value: scrollTo })
  await fireEvent.click(screen.getByRole('button', { name: 'Show quoted message' }))
  expect(screen.getByText('Finding quoted message…')).toBeTruthy()
  await fireEvent.click(screen.getByRole('button', { name: /Beta User/ }))
  await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Beta draft' } })
  resolveOriginal(original)
  await quotedMessage.mock.results[0].value
  expect(screen.getByRole('button', { name: /Beta User/ }).getAttribute('aria-current')).toBe('true')
  expect(screen.getByRole('log', { name: 'Messages' }).textContent).not.toContain(original.text)
  expect(screen.container.querySelector('[data-quote-target]')).toBeNull()
  expect(screen.queryByText('Finding quoted message…')).toBeNull()
  expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Beta draft')
  expect(scrollTo).not.toHaveBeenCalled()
  await fireEvent.click(screen.getByRole('button', { name: /Alpha User/ }))
  expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Alpha draft')
  expect(mocks.send).not.toHaveBeenCalled()
})

it('does not acknowledge old quotes or load history during a quote scroll', async () => {
  const { original, reply } = quotedMessages('42')
  const read = vi.fn().mockResolvedValue(undefined)
  const history = vi.fn().mockResolvedValue({ messages: [], nextBefore: null })
  const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  const quotedMessage = vi.fn().mockResolvedValue({ ...original, sequence: 80 })
  mocks.snapshot.mockResolvedValue({ ...connected, messages: [{ ...reply, readByMe: true }] })
  try {
    const screen = render(Console, { options: { platform: 'telegram', transport: { snapshot: mocks.snapshot, connect: mocks.connect, disconnect: mocks.stop, send: mocks.send, profile: mocks.profile, upload: mocks.upload, media: mocks.download, voiceTicket: mocks.ticket, declineCall: mocks.decline, quotedMessage, read, history } } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Show quoted message' })).toBeTruthy())
    const log = screen.getByRole('log', { name: 'Messages' }), scrollTo = vi.fn()
    Object.defineProperties(log, { scrollTo: { value: scrollTo }, scrollHeight: { value: 1000 }, clientHeight: { value: 100 } })
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList)
    await fireEvent.click(screen.getByRole('button', { name: 'Show quoted message' }))
    await waitFor(() => expect(scrollTo).toHaveBeenCalledOnce())
    log.scrollTop = 0
    await fireEvent.scroll(log)
    await fireEvent.focus(window)
    mocks.snapshot.mockResolvedValue({ ...connected, messages: [{ ...reply, sequence: 3, id: '21', text: 'New live unread message', content: undefined }] })
    await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.getAllByText('New live unread message').length).toBeGreaterThan(0))
    expect(read).not.toHaveBeenCalled()
    expect(history).not.toHaveBeenCalled()
    expect(screen.container.querySelector('[data-quote-target]')?.textContent).toContain(original.text)
    await fireEvent.wheel(log, { deltaY: -100 })
    await waitFor(() => expect(history).toHaveBeenCalledExactlyOnceWith('42', undefined))
  } finally { focused.mockRestore() }
})


it('renders the original text and sender when a native reply has no preview', async () => {
  const { original, reply } = quotedMessages('42')
  original.senderName = 'Original Author'
  reply.content!.quoted!.text = null; reply.content!.quoted!.sender = ''
  mocks.snapshot.mockResolvedValue({ ...connected, messages: [original, reply] })
  const screen = render(Console, { options: { platform: 'telegram', transport: { snapshot: mocks.snapshot, connect: mocks.connect, disconnect: mocks.stop, send: mocks.send, profile: mocks.profile, upload: mocks.upload, media: mocks.download, voiceTicket: mocks.ticket, declineCall: mocks.decline } } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Show quoted message' })).toBeTruthy())
  expect(screen.getByRole('button', { name: 'Show quoted message' }).textContent).toContain(original.text)
  expect(screen.getByRole('button', { name: 'Show quoted message' }).textContent).toContain('Original Author')
  expect(screen.queryByText('[text]')).toBeNull()
  expect(screen.queryByText('Reply to New conversation')).toBeNull()
})

it('loads a visible missing preview without inserting history or sending read receipts', async () => {
  const { original, reply } = quotedMessages('42')
  reply.content!.quoted!.text = null; reply.content!.quoted!.sender = ''
  const quoteLookup = vi.fn().mockResolvedValue({ ...original, sequence: 80, senderName: 'Original Author' })
  const read = vi.fn().mockResolvedValue(undefined)
  const observers: (() => void)[] = []
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: (entries: {isIntersecting: boolean}[]) => void) { observers.push(() => callback([{ isIntersecting: true }])) }
    observe() {} disconnect() {}
  })
  try {
    mocks.snapshot.mockResolvedValue({ ...connected, messages: [{ ...reply, readByMe: true }] })
    const screen = render(Console, { options: { platform: 'telegram', transport: { snapshot: mocks.snapshot, connect: mocks.connect, disconnect: mocks.stop, send: mocks.send, profile: mocks.profile, upload: mocks.upload, media: mocks.download, voiceTicket: mocks.ticket, declineCall: mocks.decline, quotedMessage: quoteLookup, read } } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Show quoted message' })).toBeTruthy())
    expect(quoteLookup).not.toHaveBeenCalled()
    observers.forEach(show => show())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Show quoted message' }).textContent).toContain(original.text))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(read).not.toHaveBeenCalled()
    // A foreign quote with the same message ID must not reuse this conversation's cached preview.
    mocks.snapshot.mockResolvedValue({ ...connected, messages: [{ ...reply, id: 'foreign-reply', sequence: 3, text: 'Foreign quote', readByMe: true, content: { ...reply.content!, quoted: { ...reply.content!.quoted!, chat: '99' } } }] })
    await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    expect(screen.getAllByText(original.text!)).toHaveLength(1)
    const scrollTo = vi.fn()
    Object.defineProperty(screen.getByRole('log', { name: 'Messages' }), 'scrollTo', { value: scrollTo })
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList)
    await fireEvent.click(screen.getByRole('button', { name: 'Show quoted message' }))
    await waitFor(() => expect(scrollTo).toHaveBeenCalledOnce())
    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(quoteLookup).toHaveBeenCalledOnce()
    expect(read).not.toHaveBeenCalled()
  } finally { vi.unstubAllGlobals() }
})

it.each(['telegram', 'whatsapp'] as const)('stages a selected Telegram excerpt and keeps %s replies native', async platform => {
  const chat = platform === 'telegram' ? '42' : '15555550100@s.whatsapp.net'
  const original = { sequence: 1, id: '7', chat, sender: chat, senderName: 'Original Author', timestamp: 1000, fromMe: false, text: 'Hello 🥖\nBread tomorrow?' }
  mocks.snapshot.mockResolvedValue({ ...connected, messages: [original] })
  mocks.send.mockImplementation(async request => ({ request, messageId: '', state: 'uncertain' }))
  const screen = render(Console, { options: { platform, transport: { snapshot: mocks.snapshot, connect: mocks.connect, disconnect: mocks.stop, send: mocks.send, profile: mocks.profile, upload: mocks.upload, media: mocks.download, voiceTicket: mocks.ticket, declineCall: mocks.decline } } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Reply' })).toBeTruthy())
  const line = screen.container.querySelectorAll('[data-selectable-message] p')[1].firstChild!
  const range = document.createRange(); range.setStart(line, 0); range.setEnd(line, 5)
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range)
  await fireEvent(document, new Event('selectionchange'))
  await fireEvent.click(screen.getByRole('button', { name: platform === 'telegram' ? 'Reply to selected text' : 'Reply' }))
  expect(screen.getByRole('form', { name: 'Message composer' }).textContent).toContain(platform === 'telegram' ? 'Quoting Original AuthorBread' : 'Replying to Original AuthorHello')
  await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Yes' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce())
  expect(mocks.send.mock.calls[0][0].replyTo).toEqual({ id: '7', sender: chat, ...(platform === 'telegram' ? { quote: { text: 'Bread', offset: 9 } } : {}) })
  selection.removeAllRanges()
})

it.each(['telegram', 'whatsapp'] as const)('shows a pending %s message immediately and keeps it through lagging snapshots without a composer footer', async platform => {
  const chat = platform === 'telegram' ? '42' : '15555550100@s.whatsapp.net'
  let finish!: (value: Awaited<ReturnType<import('#lib/messaging/chat-transport.js').ChatTransport['send']>>) => void
  mocks.send.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const screen = renderComponent(Pane, { selectedChat: chat, options: { platform, viewId: 'optimistic-send', transport: {
    snapshot: mocks.snapshot, connect: mocks.connect, disconnect: mocks.stop, send: mocks.send,
    profile: mocks.profile, upload: mocks.upload, media: mocks.download, voiceTicket: mocks.ticket, declineCall: mocks.decline,
  } } })
  await waitFor(() => expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(false))
  await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Immediate optimistic message' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  const composer = within(screen.getByRole('form', { name: 'Message composer' }))
  expect(screen.getByRole('article', { name: 'Message from you' }).textContent).toContain('Immediate optimistic message')
  expect(screen.getByRole('img', { name: 'Sending' })).toBeTruthy()
  expect(composer.queryByRole('status')).toBeNull()
  expect(composer.queryByRole('button', { name: 'New message' })).toBeNull()
  const request = mocks.send.mock.calls[0][0]
  finish({ request, state: 'submitted', messageId: 'native-echo' })
  await waitFor(() => expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe(''))
  expect(screen.getAllByText('Immediate optimistic message')).toHaveLength(1)
  expect(screen.getByRole('img', { name: platform === 'telegram' ? 'Sent to Telegram cloud' : 'Sent to WhatsApp' })).toBeTruthy()
  expect(composer.queryByRole('status')).toBeNull()
  mocks.snapshot.mockResolvedValue({ ...connected, messages: [{ id: 'native-echo', chat, sender: 'self', sequence: 1, timestamp: Date.now(), fromMe: true, text: request.text, delivery: 'sent' }], outbox: [{ request, state: 'pending', messageId: '' }] })
  await waitFor(() => expect(screen.container.querySelector('[data-pending-send]')).toBeNull(), { timeout: 5000 })
  expect(screen.getAllByText('Immediate optimistic message')).toHaveLength(1)
})

it.each(['telegram', 'whatsapp'] as const)('releases a %s draft when a later poll confirms delivery without sending again', async platform => {
  mocks.send.mockImplementation(async request => ({ request, state: 'pending', messageId: '' }))
  const screen = render(Console, { options: { platform, transport: {
    snapshot: mocks.snapshot, connect: mocks.connect, disconnect: mocks.stop, send: mocks.send,
    profile: mocks.profile, upload: mocks.upload, media: mocks.download, voiceTicket: mocks.ticket, declineCall: mocks.decline,
  } } })
  await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy())
  await fireEvent.input(screen.getByLabelText('Recipient'), { target: { value: platform === 'telegram' ? '42' : '+15555550100' } })
  await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Delayed acknowledgment' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Check / retry same request' })).toBeTruthy())
  expect((screen.getByLabelText('Message') as HTMLTextAreaElement).readOnly).toBe(true)
  const request = mocks.send.mock.calls[0][0]
  mocks.snapshot.mockResolvedValue({ ...connected, outbox: [{ request, state: 'submitted', messageId: 'confirmed-later' }] })
  await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => expect((screen.getByLabelText('Message') as HTMLTextAreaElement).readOnly).toBe(false))
  expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('')
  expect(mocks.send).toHaveBeenCalledOnce()
  expect(within(screen.getByRole('form', { name: 'Message composer' })).queryByRole('status')).toBeNull()
  expect(screen.getByRole('article', { name: 'Message from you' }).textContent).toContain('Delayed acknowledgment')
})

it.each([
  ['telegram', 'uncertain'], ['whatsapp', 'uncertain'],
  ['telegram', 'response-lost'], ['whatsapp', 'response-lost'],
] as const)('keeps recovery for a %s %s reaction outside the composer', async (platform, outcome) => {
  const chat = platform === 'telegram' ? '42' : '15555550100@s.whatsapp.net'
  const original = { sequence: 1, id: 'react-to', chat, sender: chat, timestamp: 1, fromMe: false, text: 'React to this message' }
  let model!: import('#lib/bits/patterns/whatsapp/whatsapp.types.js').WhatsAppConsoleModel
  mocks.snapshot.mockResolvedValue({ ...connected, messages: [original] })
  if (outcome === 'uncertain') mocks.send.mockImplementation(async request => ({ request, state: 'uncertain', messageId: '' }))
  else mocks.send.mockRejectedValue(new Error('Synthetic reaction response lost'))
  const screen = renderComponent(Pane, { selectedChat: chat, onReady: value => { model = value }, options: { platform, transport: {
    snapshot: mocks.snapshot, connect: mocks.connect, disconnect: mocks.stop, send: mocks.send,
    profile: mocks.profile, upload: mocks.upload, media: mocks.download, voiceTicket: mocks.ticket, declineCall: mocks.decline,
  } } })
  await waitFor(() => expect(model.status.connected).toBe(true))
  // Exercise reaction recovery through the real adapter; the browser check covers its portaled picker.
  await model.react(original, '👍')
  await waitFor(() => expect(screen.getByRole('button', { name: 'New message' })).toBeTruthy())
  expect(mocks.send.mock.calls[0][0]).toMatchObject({ reaction: '👍', replyTo: { id: 'react-to', sender: chat } })
  const composer = within(screen.getByRole('form', { name: 'Message composer' }))
  expect(composer.queryByRole('status')).toBeNull()
  expect(composer.queryByRole('button', { name: 'New message' })).toBeNull()
  await fireEvent.click(screen.getByRole('button', { name: 'New message' }))
  expect((screen.getByLabelText('Message') as HTMLTextAreaElement).readOnly).toBe(false)
  expect(mocks.send).toHaveBeenCalledOnce()
})
