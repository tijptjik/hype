// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const { load } = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('#lib/addresses/nameCatalogue.js', () => ({ loadAddressNames: load }))
import { findAddressNames } from '#lib/addresses/nameSearch.server.js'
import { GET } from '../routes/api/address-names/+server'
beforeEach(() => {
  load.mockReset()
})
it('bounds results and retains source release and translations', async () => {
  load.mockResolvedValue(
    Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      release: 'r1',
      names: { en: `Building ${i}`, 'zh-Hant': '大廈' },
      divisionCodes: [],
    })),
  )
  const rows = await findAddressNames('buildings', 'BUILDING', 'en')
  expect(rows).toHaveLength(30)
  expect(rows[0]).toMatchObject({ release: 'r1', names: { 'zh-Hant': '大廈' } })
})
it('does not load empty searches, excludes block identifiers and respects language', async () => {
  expect(await findAddressNames('buildings', '...', 'en')).toEqual([])
  expect(load).not.toHaveBeenCalled()
  load.mockResolvedValue([
    { id: 'block', names: { en: 'Block A' }, divisionCodes: [] },
    { id: 'mart', names: { en: 'M.Art', 'zh-Hant': '美雅' }, divisionCodes: [] },
  ])
  expect(await findAddressNames('buildings', 'Block', 'en')).toEqual([])
  expect((await findAddressNames('buildings', 'mart', 'en'))[0].id).toBe('mart')
  expect(await findAddressNames('buildings', 'mart', 'zhHans')).toEqual([])
})
it('validates request inputs and returns retryable upstream failures', async () => {
  const request = (params: string) =>
    GET({
      url: new URL(`http://hype.localhost/api/address-names?${params}`),
    } as Parameters<typeof GET>[0])
  await expect(request('family=other&locale=en&q=x')).rejects.toMatchObject({
    status: 400,
  })
  await expect(
    request(`family=streets&locale=en&q=${'x'.repeat(161)}`),
  ).rejects.toMatchObject({ status: 400 })
  load.mockRejectedValue(new Error('offline'))
  await expect(request('family=streets&locale=en&q=road')).rejects.toMatchObject({
    status: 502,
  })
  const empty = await request('family=streets&locale=en&q=')
  expect(await empty.json()).toEqual({ records: [] })
})
