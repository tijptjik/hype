import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'

describe('explicit pairing recovery', () => {
  it.each([false, true])(
    'replaces a terminal session once (logged out: %s) and returns a fresh QR',
    async loggedOut => {
      const account = env.ACCOUNTS.getByName(`synthetic-expired-pairing-${loggedOut}`)
      await runInDurableObject(account, async instance => {
        const expired = {
          status: () =>
            JSON.stringify({
              connected: false,
              loggedOut,
              qr: null,
              qrExpiresAt: null,
              lastEvent: loggedOut ? 'LoggedOut' : 'PairingQrCodesExhausted',
            }),
          contactUpdates: () => '[]',
          stop: vi.fn(async () => {}),
          free: vi.fn(),
        }
        const fresh = {
          ...expired,
          status: () =>
            JSON.stringify({
              connected: false,
              loggedOut: false,
              qr: 'synthetic-new-qr',
              qrExpiresAt: Date.now() + 60_000,
              lastEvent: 'PairingQrCode',
            }),
          configureRelay: vi.fn(),
          stop: vi.fn(async () => {}),
          free: vi.fn(),
        }
        instance.database.batch([
          {
            kind: 'put',
            key: ['device', '', '', ''],
            value: new Uint8Array([1, 2]),
            timestamp: 1,
          },
        ])
        Object.assign(instance, { session: expired })
        const start = vi
          .spyOn(instance.engine, 'startSession')
          .mockResolvedValue(
            fresh as unknown as Awaited<
              ReturnType<typeof instance.engine.startSession>
            >,
          )
        try {
          const results = await Promise.all([instance.start(), instance.start()])
          expect(results.every(status => status.qr === 'synthetic-new-qr')).toBe(true)
          expect(expired.stop).toHaveBeenCalledTimes(1)
          expect(expired.free).toHaveBeenCalledTimes(1)
          expect(start).toHaveBeenCalledTimes(1)
          expect(instance.database.read(['device', '', '', ''], 10)).toEqual(
            loggedOut ? null : new Uint8Array([1, 2]),
          )
        } finally {
          await instance.stop()
          start.mockRestore()
        }
      })
    },
  )

  it('leaves automatic recovery and an already-connected session intact', async () => {
    const account = env.ACCOUNTS.getByName('synthetic-pairing-no-automatic-restart')
    await runInDurableObject(account, async (instance, state) => {
      let connected = false
      const session = {
        status: () =>
          JSON.stringify({
            connected,
            loggedOut: false,
            qr: null,
            qrExpiresAt: null,
            lastEvent: 'PairingQrCodesExhausted',
          }),
        contactUpdates: () => '[]',
        stop: vi.fn(async () => {}),
        free: vi.fn(),
      }
      Object.assign(instance, { session })
      await state.storage.put('enabled', true)
      await instance.alarm()
      expect(session.stop).not.toHaveBeenCalled()
      connected = true
      expect((await instance.start()).connected).toBe(true)
      expect(session.stop).not.toHaveBeenCalled()
      await instance.stop()
    })
  })
})
