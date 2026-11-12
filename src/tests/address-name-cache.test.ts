// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
const { loadBuildings } = vi.hoisted(() => ({ loadBuildings: vi.fn() }))
vi.mock('#lib/sources/saanseoi.js', () => ({
  loadBuildingNames: loadBuildings,
  loadSaanseoiNames: vi.fn(),
}))
afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
  loadBuildings.mockReset()
})
it('shares adapted catalogues across locale pickers and refreshes after expiry', async () => {
  vi.useFakeTimers()
  loadBuildings.mockResolvedValue({
    release: 'release-1',
    records: [{ id: '1', names: { en: 'TEST BUILDING' }, divisionCodes: [] }],
  })
  const { loadAddressNames } = await import('../lib/addresses/nameCatalogue')
  const [first, second] = await Promise.all([
    loadAddressNames('buildings'),
    loadAddressNames('buildings'),
  ])
  expect(second).toBe(first)
  expect(await loadAddressNames('buildings')).toBe(first)
  expect(loadBuildings).toHaveBeenCalledTimes(1)
  expect(first[0]).toMatchObject({
    release: 'release-1',
    names: { en: 'Test Building' },
  })
  vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1)
  expect(await loadAddressNames('buildings')).not.toBe(first)
  expect(loadBuildings).toHaveBeenCalledTimes(2)
})
it('allows retry after a failed inventory load', async () => {
  loadBuildings
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ records: [], release: 'release-1' })
  const { loadAddressNames } = await import('../lib/addresses/nameCatalogue')
  await expect(loadAddressNames('buildings')).rejects.toThrow('offline')
  await expect(loadAddressNames('buildings')).resolves.toEqual([])
  expect(loadBuildings).toHaveBeenCalledTimes(2)
})
