import { runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { User, MtPeerNotFoundError } from '@mtcute/core'
import { expect, it, vi } from 'vitest'
import { PhoneLookupCache } from '@hype/messaging-bridge/phone-lookup'

it('resolves a phone through Telegram and caches it without importing contacts', async () => {
  await runInDurableObject(env.ACCOUNTS.getByName('phone-resolved'), async instance => {
    const resolvePhoneNumber = vi
      .fn()
      .mockResolvedValue({ _: 'inputPeerUser', userId: 42 })
    const peer = Object.create(User.prototype)
    Object.defineProperties(peer, {
      id: { value: 42 },
      isBot: { value: false },
      isDeleted: { value: false },
    })
    Object.assign(instance, {
      state: { connected: true },
      client: { resolvePhoneNumber, getPeer: vi.fn().mockResolvedValue(peer) },
    })
    expect(await instance.lookupPhone('+15555550100')).toEqual({
      status: 'registered',
      address: '42',
    })
    expect(await instance.lookupPhone('+15555550100')).toEqual({
      status: 'registered',
      address: '42',
    })
    expect(resolvePhoneNumber).toHaveBeenCalledExactlyOnceWith('+15555550100', true)
  })
})

it('keeps privacy-hidden numbers distinct from connection failures', async () => {
  await runInDurableObject(env.ACCOUNTS.getByName('phone-hidden'), async instance => {
    const resolvePhoneNumber = vi
      .fn()
      .mockRejectedValue(new MtPeerNotFoundError('synthetic'))
    Object.assign(instance, {
      state: { connected: true },
      client: { resolvePhoneNumber },
    })
    expect(await instance.lookupPhone('+15555550100')).toEqual({ status: 'unresolved' })
    resolvePhoneNumber.mockRejectedValue(new Error('network failure'))
    expect(await instance.lookupPhone('+15555550101')).toEqual({
      status: 'unavailable',
    })
  })
})

it('isolates cache entries by account and retries failures after the short TTL', async () => {
  const first = new PhoneLookupCache(),
    second = new PhoneLookupCache()
  const lookup = vi.fn().mockRejectedValue(new Error('offline'))
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
  try {
    expect(await first.resolve('+15555550100', lookup)).toEqual({
      status: 'unavailable',
    })
    await first.resolve('+15555550100', lookup)
    expect(lookup).toHaveBeenCalledTimes(1)
    await second.resolve('+15555550100', lookup)
    expect(lookup).toHaveBeenCalledTimes(2)
    now.mockReturnValue(12_000)
    lookup.mockResolvedValue({ status: 'registered', address: '42' })
    expect(await first.resolve('+15555550100', lookup)).toEqual({
      status: 'registered',
      address: '42',
    })
  } finally {
    now.mockRestore()
  }
})
