import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { expect, it, vi } from 'vitest'

it('retains the shared session when a viewer arrives while idle shutdown drains voice', async () => {
  const account = env.ACCOUNTS.getByName('synthetic-viewer-shutdown-race')
  await runInDurableObject(account, async (instance, state) => {
    const session = {
      status: () =>
        JSON.stringify({
          connected: true,
          loggedOut: false,
          qr: null,
          qrExpiresAt: null,
        }),
      contactUpdates: () => '[]',
      stop: vi.fn(async () => {}),
      free: vi.fn(),
    }
    let drained!: () => void
    let closing!: () => void
    const closingStarted = new Promise<void>(resolve => {
      closing = resolve
    })
    const drain = new Promise<void>(resolve => {
      drained = resolve
    })
    const voice = {
      close: vi.fn(() => {
        closing()
        return drain
      }),
    }
    Object.assign(instance, { session, voice })
    await state.storage.put('enabled', true)
    await state.storage.put('viewerManaged', true)
    const stopping = instance.alarm()
    await closingStarted
    await instance.watch('returning-operator', 'local')
    drained()
    await stopping
    expect(session.stop).not.toHaveBeenCalled()
    expect(session.free).not.toHaveBeenCalled()
    expect(await state.storage.getAlarm()).not.toBeNull()
    expect(instance.status().connected).toBe(true)
    await instance.stop()
    expect(session.stop).toHaveBeenCalledOnce()
  })
})
