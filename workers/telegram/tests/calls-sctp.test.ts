import { describe, expect, it, vi } from 'vitest'
import { SignalingSctp } from '../src/calls/sctp'

describe('Telegram SCTP in Workers', () => {
  it('negotiates stream zero and reassembles binary signalling in both directions', async () => {
    const receivedA: Uint8Array[] = [],
      receivedB: Uint8Array[] = []
    const failure = vi.fn()
    const tasks: Promise<void>[] = []
    const keepAlive = (task: Promise<void>) => {
      tasks.push(task)
    }
    const a: SignalingSctp = new SignalingSctp(true, {
      send: (packet): Promise<void> => b.receive(packet),
      receive: packet => receivedA.push(packet),
      failed: failure,
      keepAlive,
    })
    const b: SignalingSctp = new SignalingSctp(false, {
      send: (packet): Promise<void> => a.receive(packet),
      receive: packet => receivedB.push(packet),
      failed: failure,
      keepAlive,
    })
    try {
      const large = crypto.getRandomValues(new Uint8Array(12000))
      await b.start()
      await a.start()
      await a.send(large)
      await b.send(new Uint8Array([1, 2, 3]))
      await vi.waitFor(() => {
        expect(receivedB).toEqual([large])
        expect(receivedA).toEqual([new Uint8Array([1, 2, 3])])
      })
      expect(failure).not.toHaveBeenCalled()
    } finally {
      await a.close()
      await b.close()
      await Promise.allSettled(tasks)
    }
  })

  it('handles malformed packets without unhandled promises or lingering timers', async () => {
    const failure = vi.fn()
    const tasks: Promise<void>[] = []
    const transport = new SignalingSctp(false, {
      send: async () => {},
      receive: () => {},
      failed: failure,
      keepAlive: task => {
        tasks.push(task)
      },
    })
    await transport.start()
    await transport.receive(new Uint8Array(20))
    expect(failure).toHaveBeenCalledOnce()
    await expect(transport.send(new Uint8Array([1]))).rejects.toThrow('closed')
    await transport.close()
    await Promise.allSettled(tasks)
  })
})
