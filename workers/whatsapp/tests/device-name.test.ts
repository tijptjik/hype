import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'

describe('linked-device identity', () => {
  it.each([
    ['production', 'HYPE'],
    ['prod', 'HYPE'],
    ['preview', 'HYPE preview'],
    ['local', 'HYPE local'],
  ])(
    'preserves the %s label through automatic session recovery',
    async (stage, label) => {
      const account = env.ACCOUNTS.getByName(`synthetic-device-name-${stage}`)
      await runInDurableObject(account, async (instance, state) => {
        const session = {
          status: () =>
            JSON.stringify({
              connected: false,
              loggedOut: false,
              qr: 'synthetic',
              qrExpiresAt: Date.now() + 60_000,
            }),
          contactUpdates: () => '[]',
          stop: vi.fn(async () => {}),
          free: vi.fn(),
          configureRelay: vi.fn(),
        }
        const start = vi
          .spyOn(instance.engine, 'startSession')
          .mockResolvedValue(
            session as unknown as Awaited<
              ReturnType<typeof instance.engine.startSession>
            >,
          )
        try {
          await instance.start(stage)
          expect(start).toHaveBeenLastCalledWith(
            instance.database,
            instance.journal,
            label,
          )
          await instance.stop()
          await state.storage.put('enabled', true)
          await instance.alarm()
          expect(start).toHaveBeenCalledTimes(2)
          expect(start).toHaveBeenLastCalledWith(
            instance.database,
            instance.journal,
            label,
          )
        } finally {
          await instance.stop()
          start.mockRestore()
        }
      })
    },
  )

  it('rejects an invalid stage before enabling an account', async () => {
    const account = env.ACCOUNTS.getByName('synthetic-invalid-device-stage')
    await runInDurableObject(account, async (instance, state) => {
      await expect(instance.start('preview\nother')).rejects.toThrow(
        'Invalid deployment stage',
      )
      expect(await state.storage.get('enabled')).toBeUndefined()
      expect(await state.storage.get('stage')).toBeUndefined()
    })
  })
})
