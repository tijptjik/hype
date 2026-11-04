import { runInDurableObject } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { expect, it, vi } from 'vitest'

it('uses registration lookup instead of permissive profile lookup and caches results', async () => {
  await runInDurableObject(
    env.ACCOUNTS.getByName('phone-registration'),
    async instance => {
      const lookupPhone = vi.fn().mockResolvedValue(
        JSON.stringify({
          status: 'registered',
          address: '15555550100@s.whatsapp.net',
        }),
      )
      const status = vi.spyOn(instance, 'status').mockReturnValue({
        connected: true,
        loggedOut: false,
        qr: null,
        qrExpiresAt: null,
      })
      Object.assign(instance, { session: { lookupPhone } })
      try {
        expect(await instance.lookupPhone('+15555550100')).toEqual({
          status: 'registered',
          address: '15555550100@s.whatsapp.net',
        })
        await instance.lookupPhone('+15555550100')
        expect(lookupPhone).toHaveBeenCalledExactlyOnceWith('+15555550100')
        lookupPhone.mockResolvedValue(JSON.stringify({ status: 'not_found' }))
        expect(await instance.lookupPhone('+15555550101')).toEqual({
          status: 'not_found',
        })
        lookupPhone.mockRejectedValue(new Error('lookup failed'))
        expect(await instance.lookupPhone('+15555550102')).toEqual({
          status: 'unavailable',
        })
      } finally {
        Object.assign(instance, { session: undefined })
        status.mockRestore()
      }
    },
  )
})

it('reports an offline account without inventing a registration result', async () => {
  expect(await exports.default.lookupPhone('phone-offline', '+15555550100')).toEqual({
    status: 'unavailable',
  })
})
