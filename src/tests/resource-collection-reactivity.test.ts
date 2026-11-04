// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { flushSync } from 'svelte'
// CONTEXT
import { ResourceList } from '#lib/context/resource-list.svelte.js'
import { ResourceCollection } from '#lib/resources/resourceCollection.js'
import { observeResourceCollection } from './fixtures/resourceCollectionHarness.svelte.js'
// TYPES
import type { RemoteQuery } from '$app/server'
import type { ResourcePage } from '#lib/api/services/resourcePage.types.js'

describe('resource collection first-render reactivity', () => {
  it.each([true, false])(
    'leaves skeletons after first load (has rows: %s)',
    async hasRows => {
      const data: ResourcePage = {
        data: hasRows
          ? [
              {
                id: 'org',
                code: 'org',
                modifiedAt: '',
                isPublished: true,
                isArchived: false,
              },
            ]
          : [],
        nextCursor: null,
      }
      const query = Object.assign(Promise.resolve(data), {
        current: data,
        ready: true,
        refresh: vi.fn(async () => {}),
      }) as unknown as RemoteQuery<ResourcePage>
      const collection = new ResourceCollection(
        new ResourceList(() => query),
        'organisation',
        () => ({ scope: 'admin', isAdminRequest: true }),
      )
      const observe = vi.fn()
      const stop = observeResourceCollection(collection, observe)
      try {
        flushSync()
        expect(observe).toHaveBeenLastCalledWith({ ids: [], isInitialised: false })
        await collection.load()
        flushSync()
        expect(observe).toHaveBeenLastCalledWith({
          ids: hasRows ? ['org'] : [],
          isInitialised: true,
        })
      } finally {
        stop()
        collection.release()
      }
    },
  )
})

it('notifies rendered collection observers when fallback native membership changes', async () => {
  const { reactiveCollectionPage } = await import(
    './fixtures/resourceCollectionHarness.svelte.js'
  )
  const original: ResourcePage = {
    data: [
      { id: 'org', code: 'org', modifiedAt: '', isPublished: true, isArchived: false },
    ],
    nextCursor: null,
  }
  const native = reactiveCollectionPage(original)
  let finish!: (value: ResourcePage) => void
  const pendingQuery = Object.assign(
    new Promise<ResourcePage>(resolve => {
      finish = resolve
    }),
    {
      current: undefined,
      ready: false,
    },
  ) as RemoteQuery<ResourcePage>
  const collection = new ResourceCollection(
    new ResourceList(
      vi.fn().mockReturnValueOnce(native.query).mockReturnValue(pendingQuery),
    ),
    'organisation',
    () => ({ scope: 'public', isAdminRequest: false }),
  )
  const observe = vi.fn()
  const stop = observeResourceCollection(collection, observe)
  try {
    await collection.load()
    const pending = collection.load({ q: 'new' })
    flushSync()
    expect(observe).toHaveBeenLastCalledWith({ ids: ['org'], isInitialised: true })
    native.replace({ data: [], nextCursor: null })
    flushSync()
    expect(observe).toHaveBeenLastCalledWith({ ids: [], isInitialised: false })
    native.replace(original)
    flushSync()
    expect(observe).toHaveBeenLastCalledWith({ ids: ['org'], isInitialised: true })
    const completed: ResourcePage = { data: [], nextCursor: null }
    Object.assign(pendingQuery, { current: completed, ready: true })
    finish(completed)
    await pending
    flushSync()
    expect(observe).toHaveBeenLastCalledWith({ ids: [], isInitialised: true })
  } finally {
    stop()
    collection.release()
  }
})
