// STYLES
import '#lib/styles/app.css'
// SVELTE
import { mount } from 'svelte'
// COMPONENTS
import Fixture from './components/MediaPickerFixture.svelte'
// TYPES
import type { WhatsAppMessage } from '#lib/api/services/whatsover.types.js'
import type { MediaCatalogItem } from '#lib/messaging/media-catalog.js'

const animation = {
  v: '5.7.4',
  fr: 30,
  ip: 0,
  op: 60,
  w: 512,
  h: 512,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'Synthetic rotating sticker',
      sr: 1,
      ip: 0,
      op: 60,
      st: 0,
      bm: 0,
      ks: {
        o: { a: 0, k: 100 },
        r: {
          a: 1,
          k: [
            {
              t: 0,
              s: [0],
              e: [360],
              o: { x: 0.33, y: 0.33 },
              i: { x: 0.67, y: 0.67 },
            },
            { t: 60, s: [360] },
          ],
        },
        p: { a: 0, k: [256, 256, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      shapes: [
        {
          ty: 'rc',
          d: 1,
          s: { a: 0, k: [280, 180] },
          p: { a: 0, k: [0, 0] },
          r: { a: 0, k: 40 },
        },
        { ty: 'fl', c: { a: 0, k: [0.95, 0.2, 0.5, 1] }, o: { a: 0, k: 100 }, r: 1 },
      ],
    },
  ],
}
const tgs = await new Response(
  new Blob([JSON.stringify(animation)])
    .stream()
    .pipeThrough(new CompressionStream('gzip')),
).arrayBuffer()
const fixtures: MediaCatalogItem[] = [
  {
    id: 'gif-1',
    key: 'gif-1',
    kind: 'gif',
    title: 'A colourful celebration',
    mimeType: 'video/mp4',
    width: 320,
    height: 240,
  },
  {
    id: 'sticker-static',
    key: 'sticker-static',
    kind: 'sticker',
    title: 'A very long sticker name that remains readable on a narrow screen',
    mimeType: 'image/webp',
    width: 256,
    height: 256,
  },
  {
    id: 'sticker-animated',
    key: 'sticker-animated',
    kind: 'sticker',
    title: 'Animated celebration',
    mimeType: 'application/x-tgsticker',
    width: 512,
    height: 512,
  },
  {
    id: 'sticker-video',
    key: 'sticker-video',
    kind: 'sticker',
    title: 'Video sticker',
    mimeType: 'video/webm',
    width: 256,
    height: 256,
  },
]
const crowded = new URLSearchParams(location.search).has('crowded')
if (crowded) {
  const original = fixtures.filter(item => item.kind === 'sticker')
  for (let index = 0; index < 33; index++)
    fixtures.push({
      ...original[index % original.length],
      id: `layout-${index}`,
      key: `layout-${index}`,
    })
}
const unavailable = async (): Promise<never> => {
  throw new Error('Synthetic browser fixture has no provider')
}
const events: string[] = []
const nativeMessages: WhatsAppMessage[] = []
const staged = new Map<string, MediaCatalogItem>()
// This fixture is loaded only by the manual browser check, with wholly synthetic media.
Object.assign(window, { mediaFixtureEvents: events })
mount(Fixture, {
  target: document.getElementById('app')!,
  props: {
    initialChat: '42',
    options: {
      platform: 'telegram',
      viewId: 'synthetic-media-picker',
      cacheScope: 'test-operator:synthetic-media-picker',
      transport: {
        snapshot: async () => ({
          status: { connected: true, loggedOut: false, qr: null, qrExpiresAt: null },
          messages: [...nativeMessages],
          outbox: [],
        }),
        connect: unavailable,
        disconnect: unavailable,
        profile: unavailable,
        upload: unavailable,
        media: unavailable,
        voiceTicket: unavailable,
        declineCall: unavailable,
        stickerPacks: async () => [
          { id: 'SyntheticPack', title: 'Celebrations', count: crowded ? 36 : 3 },
          ...(crowded
            ? Array.from({ length: 12 }, (_, index) => ({
                id: `pack-${index}`,
                title: `Toastie and friends · Collection ${index + 1}`,
                count: 36,
              }))
            : []),
        ],
        searchMedia: async input => {
          await new Promise(resolve => setTimeout(resolve, 250))
          events.push(`search:${input.kind}:${input.query}`)
          return {
            items: fixtures.filter(item => item.kind === input.kind),
            nextOffset: null,
          }
        },
        catalogMedia: async id => {
          events.push(`preview:${id}`)
          const item = fixtures.find(item => item.id === id)!
          if (item.mimeType === 'application/x-tgsticker') return new Uint8Array(tgs)
          return new Uint8Array(
            await (
              await fetch(`/__media-fixture.${item.mimeType.split('/')[1]}`)
            ).arrayBuffer(),
          )
        },
        stageMedia: async id => {
          events.push(`stage:${id}`)
          const item = fixtures.find(item => item.id === id)!
          await new Promise(resolve => setTimeout(resolve, 650))
          staged.set(id, item)
          return {
            id,
            content: {
              kind: item.kind === 'gif' ? 'video' : 'sticker',
              animated: item.kind === 'gif',
              mimeType: item.mimeType,
              text: null,
              fileName: item.title,
              byteLength: 100,
              duration: null,
              voiceNote: false,
              viewOnce: false,
              quoted: null,
              reaction: null,
            },
          }
        },
        send: async request => {
          events.push(`send:${request.to}`)
          const item = staged.get(request.attachmentId!)!
          const messageId = `synthetic-${request.requestId}`
          nativeMessages.push({
            id: messageId,
            chat: request.to,
            sender: 'self',
            sequence: nativeMessages.length + 1,
            fromMe: true,
            timestamp: Date.now(),
            text: null,
            delivery: 'sent',
            content: {
              kind: item.kind === 'gif' ? 'video' : 'sticker',
              animated: item.kind === 'gif',
              mimeType: item.mimeType,
              text: null,
              fileName: item.title,
              byteLength: 100,
              duration: null,
              voiceNote: false,
              viewOnce: false,
              quoted: null,
              reaction: null,
            },
          })
          return { request, messageId, state: 'submitted' }
        },
      },
    },
  },
})
