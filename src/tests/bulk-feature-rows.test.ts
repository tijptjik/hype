// TESTS
import { expect, it } from 'vitest'
// SERVICES
import { patchBulkFeatureRows } from '#lib/client/services/bulkFeatureRows.js'
// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
import type { FeatureBulkStateResult } from '#lib/client/services/bulkEdit.types.js'

it('uses persisted state, revision and attribution while retaining hydrated content', () => {
  const row = {
    id: 'f',
    isPublished: false,
    modifiedAt: '2026-01-01',
    publisher: { id: 'old' },
    i18n: { en: { title: 'Title' } },
  } as unknown as Feature
  const results = [
    {
      id: 'f',
      ok: true,
      data: {
        id: 'f',
        isPublished: true,
        modifiedAt: '2026-01-02',
        publisherId: 'new',
        publishedAt: '2026-01-02',
      },
    },
  ] as FeatureBulkStateResult[]
  const [patched] = patchBulkFeatureRows([row], results)
  expect(patched).toMatchObject({
    isPublished: true,
    modifiedAt: '2026-01-02',
    publisherId: 'new',
    publishedAt: '2026-01-02',
    publisher: null,
  })
  expect(patched.i18n).toBe(row.i18n)
})

it('does not replace newer refreshed rows or failed and unrelated rows', () => {
  const rows = [
    { id: 'newer', modifiedAt: '2026-01-03' },
    { id: 'failed' },
    { id: 'other' },
  ] as Feature[]
  const results = [
    { id: 'newer', ok: true, data: { modifiedAt: '2026-01-02' } },
    { id: 'failed', ok: false, error: 'Denied' },
  ] as FeatureBulkStateResult[]
  const patched = patchBulkFeatureRows(rows, results)
  rows.forEach((row, index) => {
    expect(patched[index]).toBe(row)
  })
})
