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
