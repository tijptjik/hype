// Synthetic-only browser qualification: no Telegram accounts, credentials or external ICE servers.
// Run: bun scripts/dev/check-telegram-media.ts [--relay] [--native-fields]
// --native-fields emits the native tgcalls JSON codec fields at the signalling boundary.
// --relay also builds the local Go TURN fixture and verifies UDP and TCP relays.
import { chromium } from 'playwright'
import { join, resolve } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
const root = resolve(import.meta.dir, '../..')
const bundle = await Bun.build({
  entrypoints: [resolve(root, 'src/lib/adapters/telegram/call.ts')],
  target: 'browser',
})
if (!bundle.success) throw new Error(String(bundle.logs))
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch: request =>
    new URL(request.url).pathname === '/call.js'
      ? new Response(bundle.outputs[0], {
          headers: { 'content-type': 'application/javascript' },
        })
      : new Response(
          '<!doctype html><title>Synthetic Telegram call test</title><body><h1>Synthetic Telegram call test</h1></body>',
          { headers: { 'content-type': 'text/html' } },
        ),
})
/** Start a bounded loopback-only relay; never print its ephemeral test credentials. */
async function startTurnFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'hype-telegram-turn-run-'))
  const executable = join(directory, 'turn-fixture')
  const build = Bun.spawn(['go', 'build', '-buildvcs=false', '-o', executable, '.'], {
    cwd: resolve(root, 'scripts/dev/telegram-turn'),
    stdout: 'inherit',
    stderr: 'inherit',
  })
  if ((await build.exited) !== 0) {
    await rm(directory, { recursive: true, force: true })
    throw new Error('Could not build the local TURN fixture')
  }
  const child = Bun.spawn([executable], { stdout: 'pipe', stderr: 'inherit' })
  const reader = child.stdout.getReader()
  const timeout = setTimeout(() => child.kill(), 10000)
  try {
    let text = ''
    while (!text.includes('\n')) {
      const { done, value } = await reader.read()
      if (done || text.length > 8192)
        throw new Error('TURN fixture did not provide its local endpoints')
      text += new TextDecoder().decode(value)
    }
    const config = JSON.parse(text.split('\n')[0]) as {
      udpPort: number
      tcpPort: number
      username: string
      credential: string
    }
    if (
      ![config.udpPort, config.tcpPort].every(
        port => Number.isInteger(port) && port > 0 && port <= 65535,
      )
    )
      throw new Error('Invalid local TURN port')
    return {
      config,
      async close() {
        child.kill()
        await child.exited
        await rm(directory, { recursive: true, force: true })
      },
    }
  } catch (error) {
    child.kill()
    await child.exited
    await rm(directory, { recursive: true, force: true })
    throw error
  } finally {
    clearTimeout(timeout)
    reader.releaseLock()
  }
}

let fixture: Awaited<ReturnType<typeof startTurnFixture>> | undefined
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  if (process.argv.includes('--relay')) fixture = await startTurnFixture()
  browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  })
  const modes: ('direct' | 'udp' | 'tcp')[] = fixture
    ? ['direct', 'udp', 'tcp']
    : ['direct']
  for (const transport of modes)
    for (const video of [false, true]) {
      const turn = fixture?.config
      const iceServers: RTCIceServer[] =
        transport === 'direct'
          ? []
          : [
              {
                urls: `turn:127.0.0.1:${transport === 'udp' ? turn!.udpPort : turn!.tcpPort}?transport=${transport}`,
                username: turn!.username,
                credential: turn!.credential,
              },
            ]
      const page = await browser.newPage()
      await page.goto(`http://127.0.0.1:${server.port}`)
      const result = await page.evaluate(
        async ({ video, transport, iceServers, nativeFields }) => {
          const modulePath = '/call.js'
          const { TelegramBrowserCall } = await import(modulePath)
          const errors: string[] = [],
            events: any[] = [],
            sockets: any[] = [],
            peers: RTCPeerConnection[] = []
          const connected = new Set<number>()
          class Socket extends EventTarget {
            readyState = 1
            bufferedAmount = 0
            protocol = 'hype.telegram.v1'
            constructor(readonly id: number) {
              super()
              sockets[id] = this
              setTimeout(() => this.dispatchEvent(new Event('open')), 0)
            }
            send(text: string) {
              if (text === 'ping') {
                this.dispatchEvent(new MessageEvent('message', { data: 'pong' }))
                return
              }
              const value = JSON.parse(text)
              events.push([
                this.id,
                value.kind,
                value.message?.['@type'],
                value.message?.contents?.map((c: any) => [c.type, c.ssrc]),
              ])
              // Native tgcalls serializes channels=0 for video; browsers omit that field.
              // Mutate only the wire envelope so the receiver exercises native-format input.
              if (nativeFields && value.message?.['@type'] === 'NegotiateChannels') {
                for (const content of value.message.contents)
                  for (const payload of content.payloadTypes) {
                    if (content.type === 'video') payload.channels = 0
                  }
              }
              if (value.kind === 'signal')
                sockets[1 - this.id].dispatchEvent(
                  new MessageEvent('message', {
                    data: JSON.stringify({ kind: 'signal', message: value.message }),
                  }),
                )
              if (value.kind === 'connected') connected.add(this.id)
            }
            close() {
              this.readyState = 3
            }
          }
          const calls = [0, 1].map(
            id =>
              new TelegramBrowserCall(
                {
                  snapshot() {},
                  video() {},
                  error(e: string) {
                    errors.push(`${id}: ${e}`)
                  },
                  closed() {},
                },
                {
                  ticket: async () => ({
                    url: 'ws://local',
                    token: 'a'.repeat(64),
                    expiresAt: Date.now() + 30000,
                  }),
                  socket: () => new Socket(id),
                  media: (c: any) => navigator.mediaDevices.getUserMedia(c),
                  peer: (c: any) => {
                    const p = new RTCPeerConnection(c)
                    peers[id] = p
                    return p
                  },
                  audio: () => new Audio(),
                },
              ),
          )
          const result = await (async () => {
            try {
              await Promise.all(
                calls.map((call, id) =>
                  call.start(
                    id === 0
                      ? { kind: 'outgoing', requestId: 'test-a', to: '2', video }
                      : { kind: 'answer', requestId: 'test-b', id: '123', video },
                  ),
                ),
              )
              for (let id = 0; id < 2; id++)
                sockets[id].dispatchEvent(
                  new MessageEvent('message', {
                    data: JSON.stringify({
                      kind: 'setup',
                      setup: {
                        outgoing: id === 0,
                        video,
                        p2pAllowed: transport === 'direct',
                        iceServers,
                        fingerprint: '1',
                      },
                    }),
                  }),
                )
              const until = Date.now() + 15000
              let stats: any[] = []
              while (Date.now() < until && !errors.length) {
                await new Promise(resolve => setTimeout(resolve, 100))
                stats = await Promise.all(
                  peers.map(async p =>
                    [...(await p.getStats()).values()]
                      .filter((v: any) => v.type === 'inbound-rtp')
                      .map((v: any) => ({
                        kind: v.kind,
                        packets: v.packetsReceived,
                        bytes: v.bytesReceived,
                        frames: v.framesDecoded,
                      })),
                  ),
                )
                if (
                  connected.size === 2 &&
                  stats.length === 2 &&
                  stats.every(side =>
                    (video ? ['audio', 'video'] : ['audio']).every(kind =>
                      side.some(
                        (v: any) =>
                          v.kind === kind &&
                          v.packets > 10 &&
                          (kind !== 'video' || v.frames > 0),
                      ),
                    ),
                  )
                )
                  break
              }
              const selected = await Promise.all(
                peers.map(async peer => {
                  const report = await peer.getStats()
                  const connection = [...report.values()].find(
                    (row: any) =>
                      row.type === 'transport' && row.selectedCandidatePairId,
                  )
                  const pair =
                    connection && report.get(connection.selectedCandidatePairId)
                  const local = pair && report.get(pair.localCandidateId),
                    remote = pair && report.get(pair.remoteCandidateId)
                  return {
                    local: local?.candidateType,
                    remote: remote?.candidateType,
                    relayProtocol: local?.relayProtocol,
                  }
                }),
              )
              calls[0].mute(true)
              calls[1].camera(false)
              return {
                errors,
                selected,
                connected: [...connected],
                stats,
                events,
                states: peers.map(p => ({
                  signaling: p.signalingState,
                  connection: p.connectionState,
                  tracks: p.getTransceivers().map(t => ({
                    mid: t.mid,
                    direction: t.direction,
                    current: t.currentDirection,
                    sending: t.sender.track?.kind,
                  })),
                })),
                mute: calls[0].stream
                  ?.getAudioTracks()
                  .every((t: MediaStreamTrack) => !t.enabled),
                cameraOff: calls[1].stream
                  ?.getVideoTracks()
                  .every((t: MediaStreamTrack) => !t.enabled),
              }
            } finally {
              calls.forEach(c => {
                c.close()
              })
            }
          })()
          if (
            peers.some(p => p.connectionState !== 'closed') ||
            calls.some(c =>
              c.stream
                ?.getTracks()
                .some((t: MediaStreamTrack) => t.readyState !== 'ended'),
            )
          )
            throw new Error('Call leaked media resources')
          return result
        },
        {
          video,
          transport,
          iceServers,
          nativeFields: process.argv.includes('--native-fields'),
        },
      )
      console.log(
        JSON.stringify({
          transport,
          nativeFields: process.argv.includes('--native-fields'),
          mode: video ? 'video' : 'voice',
          connected: result.connected,
          media: result.stats,
          selected: result.selected,
          mute: result.mute,
          cameraOff: result.cameraOff,
          errors: result.errors,
        }),
      )
      if (
        result.errors.length ||
        result.connected.length !== 2 ||
        !result.mute ||
        !result.cameraOff ||
        (transport !== 'direct' &&
          !result.selected.every(
            pair =>
              pair.local === 'relay' &&
              pair.remote === 'relay' &&
              pair.relayProtocol === transport,
          )) ||
        !result.stats.every((s: any[]) =>
          (video ? ['audio', 'video'] : ['audio']).every(k =>
            s.some(
              v => v.kind === k && v.packets > 10 && (k !== 'video' || v.frames > 0),
            ),
          ),
        )
      )
        process.exitCode = 1
      await page.close()
    }
} finally {
  await browser?.close()
  await fixture?.close()
  server.stop(true)
}
