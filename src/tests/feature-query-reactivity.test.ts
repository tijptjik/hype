// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { flushSync } from 'svelte'
import {
  FeatureQuery,
  FeatureQueryRetention,
} from '#lib/context/feature-query.svelte.js'
import type { FeatureQueryPage } from '#lib/api/services/featureQuery.types.js'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
import {
  featureQueryProbe,
  observeFeatureRows,
} from './fixtures/featureQueryHarness.svelte.js'

const input = { meta: { isAdminRequest: false, scope: 'user-a' } }
const page: FeatureQueryPage = {
  data: [
    { id: 'private', isPublished: true, isArchived: false },
  ] as FeatureFromCollection[],
  totalCount: 1,
  facets: null,
  nextCursor: null,
}

it.each([false, true])(
  'reactively hides an active traversal after shared native denial (map=%s)',
  async bounded => {
    const native = featureQueryProbe(page)
    const query = new FeatureQuery(() => native.query, undefined, undefined, bounded)
    await query.load(input)
    const observe = vi.fn()
    const stop = observeFeatureRows(query, observe)
    try {
      flushSync()
      expect(observe).toHaveBeenLastCalledWith(['private'])
      native.setError(403)
      flushSync()
      expect(observe).toHaveBeenLastCalledWith([])
      native.setError()
      flushSync()
      expect(observe).toHaveBeenLastCalledWith(['private'])
    } finally {
      stop()
    }
  },
)

it('reactively hides a retained preview when its native source is denied', async () => {
  const source = featureQueryProbe(page)
  const empty = featureQueryProbe({ ...page, data: [], totalCount: 0 })
  const retained = new FeatureQueryRetention()
  retained.retain(page.data, input, source.query)
  const query = new FeatureQuery(() => empty.query, retained)
  await query.load(input)
  const observe = vi.fn()
  const stop = observeFeatureRows(query, observe)
  try {
    flushSync()
    expect(observe).toHaveBeenLastCalledWith(['private'])
    source.setError(403)
    flushSync()
    expect(observe).toHaveBeenLastCalledWith([])
  } finally {
    stop()
  }
})
