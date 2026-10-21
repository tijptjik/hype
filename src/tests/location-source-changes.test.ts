import { expect, test, vi } from 'vitest'
import {
  readSaanSeoiPlaceSourceChanges,
  validateLocationSourceChangesPage,
} from '#lib/locations/sourceChanges.js'

const pin = {
  datasetCode: 'overture-places',
  resourceType: 'places',
  fromRelease: 'from-id',
  toRelease: 'to-id',
}
const record = {
  sourceRecordId: 'publisher-id',
  properties: { name: 'Publisher name' },
  sourceGeometry: { type: 'Point', coordinates: [114, 22] },
}
const page = () => ({
  pin,
  records: [
    {
      sourceRecordId: record.sourceRecordId,
      type: 'added',
      before: null,
      after: record,
      fields: [],
    },
  ],
  nextCursor: null,
})
const input = { fromRelease: 'from-code', toRelease: 'to-code' }

test('reads the actual source endpoint and retains publisher evidence without canonical projection', async () => {
  const fetcher = vi.fn(async () => Response.json(page()))
  const result = await readSaanSeoiPlaceSourceChanges(
    {
      baseUrl: 'https://source.example',
      apiKey: 'test-key',
      fetch: fetcher as unknown as typeof fetch,
    },
    input,
  )
  expect(result.records[0].after).toEqual(record)
  const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit]
  expect(url.pathname).toBe('/places/v0.1/sources/changes')
  expect(url.searchParams.get('view')).toBe('records')
  expect(url.searchParams.get('region')).toBe('hk')
  expect(options.redirect).toBe('error')
})

test('resumes only with resolved release identities and rejects pin drift', () => {
  const request = {
    fromRelease: pin.fromRelease,
    toRelease: pin.toRelease,
    cursor: 'opaque',
  }
  expect(validateLocationSourceChangesPage(page(), request, pin).nextCursor).toBeNull()
  expect(() => validateLocationSourceChangesPage(page(), request)).toThrow('pin')
  expect(() =>
    validateLocationSourceChangesPage(
      { ...page(), pin: { ...pin, datasetCode: 'other' } },
      request,
      pin,
    ),
  ).toThrow('pin')
  expect(() =>
    validateLocationSourceChangesPage(page(), { ...input, cursor: 'opaque' }, pin),
  ).toThrow('pin')
})

test('rejects duplicate records, malformed variants, filters and cursor loops', () => {
  const valid = page()
  expect(() =>
    validateLocationSourceChangesPage(
      { ...valid, records: [], summary: { count: 1000 } },
      input,
    ),
  ).toThrow('summary')
  for (const bad of [
    { ...valid, records: [...valid.records, ...valid.records] },
    { ...valid, records: [{ ...valid.records[0], before: record }] },
    { ...valid, records: [{ ...valid.records[0], type: 'changed' }] },
    {
      ...valid,
      records: [{ ...valid.records[0], after: { ...record, sourceRecordId: 'other' } }],
    },
    { ...valid, nextCursor: 'next' },
  ])
    expect(() => validateLocationSourceChangesPage(bad, input)).toThrow()
  expect(() =>
    validateLocationSourceChangesPage(valid, { ...input, type: 'removed' }),
  ).toThrow('filtered')
  expect(() =>
    validateLocationSourceChangesPage(
      { ...valid, nextCursor: 'same' },
      {
        fromRelease: pin.fromRelease,
        toRelease: pin.toRelease,
        limit: 1,
        cursor: 'same',
      },
      pin,
    ),
  ).toThrow('pagination')
})

test('terminal empty pages are valid while bad input and source failures are not empty success', async () => {
  expect(
    validateLocationSourceChangesPage({ ...page(), records: [] }, input).records,
  ).toEqual([])
  const fetcher = vi.fn(async () => new Response('private diagnostic', { status: 404 }))
  const client = {
    baseUrl: 'https://source.example',
    apiKey: 'test-key',
    fetch: fetcher as unknown as typeof fetch,
  }
  await expect(
    readSaanSeoiPlaceSourceChanges(client, { ...input, limit: 101 }),
  ).rejects.toThrow()
  expect(fetcher).not.toHaveBeenCalled()
  await expect(readSaanSeoiPlaceSourceChanges(client, input)).rejects.toThrow(
    'failed (404)',
  )
})
