import { describe, expect, it, vi } from 'vitest'
import { CallSignaling, type CallSignalMessage } from '../src/calls/signaling'
import { CallPacketCipher } from '../src/calls/crypto'

describe('Telegram V3 encrypted signalling', () => {
  it('exchanges compressed authenticated messages over a real SCTP association', async () => {
    const key = crypto.getRandomValues(new Uint8Array(256))
    const receivedA: CallSignalMessage[] = [],
      receivedB: CallSignalMessage[] = []
    const failure = vi.fn(),
      tasks: Promise<void>[] = []
    const keepAlive = (task: Promise<void>) => {
      tasks.push(task)
    }
    const a: CallSignaling = new CallSignaling(key, true, {
      send: (packet): Promise<void> => b.receive(packet),
      receive: message => receivedA.push(message),
      failed: failure,
      keepAlive,
    })
    const b: CallSignaling = new CallSignaling(key, false, {
      send: (packet): Promise<void> => a.receive(packet),
      receive: message => receivedB.push(message),
      failed: failure,
      keepAlive,
    })
    try {
      await b.start()
      await a.start()
      const setup: CallSignalMessage = {
        '@type': 'InitialSetup',
        ufrag: 'synthetic',
        pwd: 'synthetic-password',
        fingerprints: [{ hash: 'sha-256', setup: 'actpass', fingerprint: 'synthetic' }],
      }
      const state: CallSignalMessage = {
        '@type': 'MediaState',
        muted: true,
        videoState: 'inactive',
      }
      await a.send(setup)
      await b.send(state)
      await vi.waitFor(() => {
        expect(receivedA).toEqual([state])
        expect(receivedB).toEqual([setup])
      })
      expect(failure).not.toHaveBeenCalled()
    } finally {
      await a.close()
      await b.close()
      await Promise.allSettled(tasks)
    }
  })

  it('rejects a validly encrypted decompression bomb before parsing or delivering it', async () => {
    const key = crypto.getRandomValues(new Uint8Array(256))
    const receive = vi.fn(),
      failed = vi.fn(),
      tasks: Promise<void>[] = []
    const channel = new CallSignaling(
      key,
      false,
      {
        send: async () => {},
        receive,
        failed,
        keepAlive: task => {
          tasks.push(task)
        },
      },
      false,
    )
    const compressed = new Uint8Array(
      await new Response(
        new Blob([new Uint8Array(300 * 1024)])
          .stream()
          .pipeThrough(new CompressionStream('gzip')),
      ).arrayBuffer(),
    )
    await channel.receive(await new CallPacketCipher(key, true).seal(compressed))
    expect(receive).not.toHaveBeenCalled()
    expect(failed).toHaveBeenCalledOnce()
    await expect(channel.send({ '@type': 'MediaState' })).rejects.toThrow('closed')
    await channel.close()
    await Promise.allSettled(tasks)
  })

  it('accepts native-compatible authenticated uncompressed JSON and still rejects tampering', async () => {
    const key = crypto.getRandomValues(new Uint8Array(256))
    const receive = vi.fn(),
      failed = vi.fn(),
      tasks: Promise<void>[] = []
    const channel = new CallSignaling(
      key,
      false,
      {
        send: async () => {},
        receive,
        failed,
        keepAlive: task => {
          tasks.push(task)
        },
      },
      false,
    )
    const peer = new CallPacketCipher(key, true)
    try {
      const state = {
        '@type': 'MediaState',
        muted: false,
        videoState: 'inactive',
        screencastState: 'inactive',
        lowBattery: false,
        videoRotation: 0,
      }
      await channel.receive(
        await peer.seal(new TextEncoder().encode(JSON.stringify(state))),
      )
      expect(receive).toHaveBeenCalledExactlyOnceWith(state)
      const tampered = await peer.seal(new TextEncoder().encode(JSON.stringify(state)))
      tampered[tampered.length - 1] ^= 1
      await channel.receive(tampered)
      expect(receive).toHaveBeenCalledOnce()
    } finally {
      peer.dispose()
      await channel.close()
      await Promise.allSettled(tasks)
    }
  })
})
