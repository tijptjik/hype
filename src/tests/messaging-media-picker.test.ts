// @vitest-environment jsdom
// TESTS
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi, type Mock } from 'vitest'
// COMPONENTS
import Fixture from './fixtures/components/MediaPickerFixture.svelte'
// TYPES
import type { ChatTransport } from '#lib/messaging/chat-transport.js'
import type {
  MediaCatalogItem,
  MediaCatalogPage,
} from '#lib/messaging/media-catalog.js'

// Picker interaction tests do not exercise the canvas-dependent animation renderer.
vi.mock('#lib/messaging/sticker-player.js', () => ({ stickerPlayer: undefined }))

vi.mock('#lib/bits/core/index.js', async () => ({
  Button: (await import('#lib/bits/core/button/Button.svelte')).default,
}))
const item = (id: string, kind: 'gif' | 'sticker' = 'gif'): MediaCatalogItem => ({
  id,
  key: id,
  kind,
  title: `${id} ${kind}`,
  mimeType: kind === 'gif' ? 'video/mp4' : 'image/webp',
  width: 320,
  height: 240,
})
let search: Mock<NonNullable<ChatTransport['searchMedia']>>
let stage: Mock<NonNullable<ChatTransport['stageMedia']>>
let send: Mock<NonNullable<ChatTransport['send']>>
let preview: Mock<NonNullable<ChatTransport['catalogMedia']>>
let transport: ChatTransport
const emptyContent = {
  text: null,
  mimeType: null,
  fileName: null,
  byteLength: null,
  duration: null,
  voiceNote: false,
  viewOnce: false,
  quoted: null,
  reaction: null,
}

beforeEach(() => {
  vi.useRealTimers()
  // Browser checks cover actual textarea and menu geometry; jsdom needs the observer lifecycle.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  search = vi.fn().mockResolvedValue({ items: [], nextOffset: null })
  stage = vi.fn().mockResolvedValue({
    id: 'staged-id',
    content: { ...emptyContent, kind: 'video', animated: true },
  })
  send = vi.fn().mockImplementation(async request => ({
    request,
    messageId: '',
    state: 'uncertain',
  }))
  preview = vi.fn().mockResolvedValue(new Uint8Array([1]))
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:synthetic'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
  transport = {
    snapshot: async () => ({
      status: { connected: true, loggedOut: false, qr: null, qrExpiresAt: null },
      messages: [],
      outbox: [],
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    profile: vi.fn(),
    upload: vi.fn(),
    media: vi.fn(),
    voiceTicket: vi.fn(),
    declineCall: vi.fn(),
    searchMedia: search,
    catalogMedia: preview,
    stageMedia: stage,
    send,
  }
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function setup() {
  const view = render(Fixture, {
    options: { platform: 'telegram', viewId: 'catalog-fixture', transport },
  })
  await waitFor(() => expect(view.getByText('Connected')).toBeTruthy())
  await fireEvent.input(view.getByLabelText('Recipient'), { target: { value: '42' } })
  return view
}

/** Open the catalog through the composer attachment menu. */
async function openMediaPicker(
  view: Awaited<ReturnType<typeof setup>>,
  name: 'GIFs' | 'Stickers',
): Promise<void> {
  await fireEvent.keyDown(view.getByRole('button', { name: 'Attach files' }), {
    key: 'Enter',
  })
  // jsdom has no anchor geometry; the browser check verifies menu visibility and placement.
  const menu = within(await view.findByRole('menu', { hidden: true }))
  await fireEvent.click(menu.getByText(name))
}

it('debounces searches and rejects stale responses after changing query or closing', async () => {
  let resolveOld!: (page: MediaCatalogPage) => void
  search.mockReturnValueOnce(
    new Promise(resolve => {
      resolveOld = resolve
    }),
  )
  const view = await setup()
  await openMediaPicker(view, 'GIFs')
  await fireEvent.input(view.getByLabelText('Search GIFs'), {
    target: { value: 'happy' },
  })
  search.mockResolvedValue({ items: [item('new')], nextOffset: null })
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Send new gif' })).toBeTruthy(),
  )
  resolveOld({ items: [item('old')], nextOffset: null })
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(view.queryByRole('button', { name: 'Send old gif' })).toBeNull()
  await fireEvent.click(view.getByRole('button', { name: 'Close picker' }))
  expect(view.queryByRole('dialog')).toBeNull()
  expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
})

it('retains pagination results on error, retries the cursor, and deduplicates repeated media', async () => {
  search.mockResolvedValueOnce({ items: [item('first')], nextOffset: 'page-2' })
  const view = await setup()
  await openMediaPicker(view, 'GIFs')
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Load more' })).toBeTruthy(),
  )
  search.mockRejectedValueOnce(new Error('Synthetic search failure'))
  await fireEvent.click(view.getByRole('button', { name: 'Load more' }))
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Retry search' })).toBeTruthy(),
  )
  expect(view.getByRole('button', { name: 'Send first gif' })).toBeTruthy()
  search.mockResolvedValueOnce({
    items: [item('first'), item('second')],
    nextOffset: null,
  })
  await fireEvent.click(view.getByRole('button', { name: 'Retry search' }))
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Send second gif' })).toBeTruthy(),
  )
  expect(search.mock.calls[2][0].offset).toBe('page-2')
  expect(view.getAllByRole('button', { name: 'Send first gif' })).toHaveLength(1)
})

it('sends a GIF on selection, renders it before staging, and never resends an uncertain attempt', async () => {
  let finishStage!: (
    value: Awaited<ReturnType<NonNullable<ChatTransport['stageMedia']>>>,
  ) => void
  stage.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finishStage = resolve
      }),
  )
  search.mockResolvedValue({ items: [item('dance')], nextOffset: null })
  const view = await setup()
  await openMediaPicker(view, 'GIFs')
  await fireEvent.click(await view.findByRole('button', { name: 'Send dance gif' }))
  await waitFor(() => expect(view.queryByRole('dialog')).toBeNull())
  expect(view.getByRole('img', { name: 'Sending' })).toBeTruthy()
  expect(send).not.toHaveBeenCalled()
  finishStage({
    id: 'staged-id',
    content: { ...emptyContent, kind: 'video', animated: true },
  })
  await waitFor(() => expect(send).toHaveBeenCalledOnce())
  expect(send.mock.calls[0][0]).toMatchObject({
    to: '42',
    text: '',
    attachmentId: 'staged-id',
  })
  await fireEvent.click(await view.findByRole('button', { name: 'Check status' }))
  expect(send).toHaveBeenCalledOnce()
})

it('sends only the selected sticker and preserves the independent typed draft', async () => {
  search.mockResolvedValue({ items: [item('wave', 'sticker')], nextOffset: null })
  stage.mockResolvedValue({
    id: 'sticker-id',
    content: { ...emptyContent, kind: 'sticker', mimeType: 'image/webp' },
  })
  send.mockImplementation(async request => ({
    request,
    messageId: 'sent',
    state: 'submitted',
  }))
  const view = await setup()
  await fireEvent.input(view.getByLabelText('Message'), { target: { value: 'Hello' } })
  await openMediaPicker(view, 'Stickers')
  const dialog = within(await view.findByRole('dialog'))
  await fireEvent.input(dialog.getByLabelText('Search stickers'), {
    target: { value: '👋' },
  })
  await waitFor(() =>
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'sticker', query: '👋' }),
    ),
  )
  await fireEvent.click(
    await dialog.findByRole('button', { name: 'Send wave sticker' }),
  )
  await waitFor(() => expect(send).toHaveBeenCalledOnce())
  expect(send.mock.calls[0][0]).toMatchObject({ text: '', attachmentId: 'sticker-id' })
  expect((view.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Hello')
})

it('keeps staging failures in the timeline and retries only before a send was attempted', async () => {
  search.mockResolvedValue({ items: [item('expired')], nextOffset: null })
  stage.mockRejectedValueOnce(new Error('Bridge temporarily disconnected'))
  const view = await setup()
  await openMediaPicker(view, 'GIFs')
  await fireEvent.click(await view.findByRole('button', { name: 'Send expired gif' }))
  await waitFor(() => expect(view.getByRole('img', { name: 'Not sent' })).toBeTruthy())
  expect(view.queryByRole('dialog')).toBeNull()
  expect(send).not.toHaveBeenCalled()
  await fireEvent.click(view.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(send).toHaveBeenCalledOnce())
})

it('reopens cached results and previews without repeating transfers', async () => {
  search.mockResolvedValue({ items: [item('saved')], nextOffset: null })
  const view = await setup()
  await openMediaPicker(view, 'GIFs')
  await view.findByRole('button', { name: 'Send saved gif' })
  await waitFor(() => expect(preview).toHaveBeenCalledOnce())
  await fireEvent.click(view.getByRole('button', { name: 'Close picker' }))
  await openMediaPicker(view, 'GIFs')
  await view.findByRole('button', { name: 'Send saved gif' })
  expect(search).toHaveBeenCalledOnce()
  expect(preview).toHaveBeenCalledOnce()
})

it('loads an installed pack and saves every preview with bounded concurrency', async () => {
  transport.stickerPacks = vi
    .fn()
    .mockResolvedValue([{ id: 'HappyPack', title: 'Happy pack', count: 6 }])
  search.mockResolvedValue({
    items: Array.from({ length: 6 }, (_, index) => item(`pack-${index}`, 'sticker')),
    nextOffset: null,
  })
  const view = await setup()
  await openMediaPicker(view, 'Stickers')
  await fireEvent.click(await view.findByRole('button', { name: 'Happy pack' }))
  await waitFor(() =>
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ pack: 'HappyPack' }),
    ),
  )
  await fireEvent.click(await view.findByRole('button', { name: 'Save offline' }))
  await view.findByText(
    'Previews ready for this session. Browser storage is unavailable.',
  )
  expect(send).not.toHaveBeenCalled()
})

it('renews an evicted cached reference before sending and keeps the chosen media identity', async () => {
  search.mockResolvedValueOnce({
    items: [{ ...item('old'), key: 'same-media' }],
    nextOffset: null,
  })
  search.mockResolvedValue({
    items: [{ ...item('fresh'), key: 'same-media' }],
    nextOffset: null,
  })
  stage.mockRejectedValueOnce(new Error('This result expired. Search again.'))
  const view = await setup()
  await openMediaPicker(view, 'GIFs')
  await fireEvent.click(await view.findByRole('button', { name: 'Send old gif' }))
  await waitFor(() => expect(send).toHaveBeenCalledOnce())
  expect(stage.mock.calls.map(call => call[0])).toEqual(['old', 'fresh'])
  expect(search).toHaveBeenCalledTimes(2)
})

it.each(['gif', 'sticker'] as const)(
  'previews a held %s without sending and restores tap-to-send after closing',
  async kind => {
    search.mockResolvedValue({ items: [item('held', kind)], nextOffset: null })
    const view = await setup()
    await openMediaPicker(view, kind === 'gif' ? 'GIFs' : 'Stickers')
    const tile = await view.findByRole('button', { name: `Send held ${kind}` })
    await fireEvent.pointerDown(tile, { button: 0, clientX: 20, clientY: 20 })
    await waitFor(() =>
      expect(view.getByRole('region', { name: 'Media preview' })).toBeTruthy(),
    )
    await fireEvent.pointerUp(tile)
    await fireEvent.click(tile)
    expect(stage).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    await fireEvent.click(view.getByRole('button', { name: 'Close preview' }))
    await waitFor(() =>
      expect(view.queryByRole('region', { name: 'Media preview' })).toBeNull(),
    )
    await fireEvent.pointerDown(tile, { button: 0 })
    await fireEvent.pointerUp(tile)
    await fireEvent.click(tile)
    await waitFor(() => expect(stage).toHaveBeenCalledOnce())
  },
)

it('scrolls overflowing sticker packs horizontally with the mouse wheel', async () => {
  transport.stickerPacks = vi
    .fn()
    .mockResolvedValue([{ id: 'HappyPack', title: 'Happy pack', count: 6 }])
  const view = await setup()
  await openMediaPicker(view, 'Stickers')
  const row = await view.findByRole('group', { name: 'Sticker packs' })
  Object.defineProperties(row, {
    scrollWidth: { value: 1000 },
    clientWidth: { value: 300 },
  })
  await fireEvent.wheel(row, { deltaY: 120, deltaX: 0 })
  expect(row.scrollLeft).toBe(120)
  expect(view.getByLabelText('Search stickers')).toBeTruthy()
})
