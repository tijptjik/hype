// @vitest-environment node
import { createHash } from 'node:crypto'
import { beforeEach, expect, it, vi } from 'vitest'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
const mocks = vi.hoisted(() => ({
  names: vi.fn(),
  details: vi.fn(),
  fill: vi.fn(),
  get: vi.fn(),
  where: vi.fn(),
  context: { user: { isAnonymous: false }, db: {} as any },
}))
vi.mock('#lib/api/server/guarded.js', () => ({
  guardedQuery: (schema: any, handler: any) =>
    Object.assign((input: unknown) => handler(schema.parse(input), mocks.context), {
      __: { type: 'query' },
    }),
}))
vi.mock('#lib/sources/saanseoi.js', () => ({
  loadBuildingNames: mocks.names,
  loadBuildingDetails: mocks.details,
}))
vi.mock('#lib/addresses/buildingSelection.js', () => ({
  fillBuildingDetails: mocks.fill,
}))
import { getBuildingLocationDetails } from '#lib/api/buildingLocationDetails.remote.js'
import { buildingLocationId } from '#lib/locations/buildingLocationId.js'
const source = { id: 'garden-bakery', release: 'r1', addressId: 'second' }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.context.user.isAnonymous = false
  mocks.get.mockResolvedValue(undefined)
  mocks.where.mockReturnValue({ get: mocks.get })
  mocks.context.db = {
    get: async () => undefined,
    select: () => ({ from: () => ({ where: mocks.where }) }),
  }
  mocks.names.mockResolvedValue({
    release: 'r1',
    records: [{ id: source.id, name: 'Garden Bakery', names: { en: 'Garden Bakery' } }],
  })
  mocks.details.mockResolvedValue({ addresses: [{ id: 'first' }, { id: 'second' }] })
  mocks.fill.mockReturnValue({ coordinates: [114, 22] })
})
it('uses the same stable building identity as existing imports', async () => {
  const old = createHash('sha256')
    .update(JSON.stringify(['building-export', null, 'shared', source.id]))
    .digest('hex')
  expect(await buildingLocationId(source.id, 'shared')).toBe(`building:${old}`)
  expect(await buildingLocationId(source.id, 'exclusive', 'org')).not.toBe(
    `building:${old}`,
  )
})
it('rejects anonymous reads before any database or catalogue access', async () => {
  mocks.context.user.isAnonymous = true
  await expect(getBuildingLocationDetails(source)).rejects.toMatchObject({
    status: 403,
  })
  expect(mocks.get).not.toHaveBeenCalled()
  expect(mocks.names).not.toHaveBeenCalled()
})
it('opens an existing shared record without reimporting or fetching catalogue facts', async () => {
  mocks.get.mockResolvedValue({ id: 'existing' })
  expect(await getBuildingLocationDetails({ ...source, preferImported: true })).toEqual(
    {
      type: 'location',
      locationId: 'existing',
    },
  )
  expect(mocks.names).not.toHaveBeenCalled()
  const query = new SQLiteSyncDialect().sqlToQuery(mocks.where.mock.calls[0][0])
  expect(query.sql).toContain('"location"."state" <>')
  expect(query.params).toContain('manual')
})
it('shows a read-only preview using the selected release and address alternative', async () => {
  expect(await getBuildingLocationDetails(source)).toEqual({
    type: 'preview',
    names: { en: 'Garden Bakery' },
    address: { coordinates: [114, 22] },
    candidates: [{ id: 'first' }, { id: 'second' }],
    selectedId: 'second',
  })
  expect(mocks.details).toHaveBeenCalledWith(source.id, 'r1')
  expect(mocks.fill).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ release: 'r1' }),
    expect.anything(),
    { id: 'second' },
    false,
    'en',
  )
})
it('shows every candidate without choosing the first on an unqualified building link', async () => {
  mocks.get.mockResolvedValue({ id: 'existing' })
  const result = await getBuildingLocationDetails({
    id: source.id,
    release: source.release,
  })
  expect(result).toMatchObject({
    type: 'preview',
    candidates: [{ id: 'first' }, { id: 'second' }],
    selectedId: null,
  })
  expect(mocks.get).not.toHaveBeenCalled()
  expect(mocks.fill.mock.calls[0][3]).toBeUndefined()
})
it('opens an unnamed footprint without assigning an address', async () => {
  mocks.names.mockResolvedValueOnce({ release: source.release, records: [] })
  mocks.details.mockResolvedValueOnce({ addresses: [] })
  expect(
    await getBuildingLocationDetails({ id: source.id, release: source.release }),
  ).toMatchObject({
    type: 'preview',
    names: {},
    candidates: [],
    selectedId: null,
  })
})
it('rejects changed releases and missing address alternatives', async () => {
  mocks.names.mockResolvedValueOnce({ release: 'r2', records: [] })
  await expect(getBuildingLocationDetails(source)).rejects.toMatchObject({
    status: 409,
  })
  mocks.details.mockResolvedValueOnce({ addresses: [{ id: 'first' }] })
  await expect(getBuildingLocationDetails(source)).rejects.toMatchObject({
    status: 404,
  })
})
