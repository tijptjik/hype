// TESTING
import { describe, expect, it } from 'vitest'
// SERVICES
import {
  OptimisticRecords,
  projectResourcePatch,
} from '#lib/client/services/optimisticRecords.js'

const patch =
  (id: string, data: Record<string, unknown>) =>
  (value: unknown, type: string): unknown =>
    projectResourcePatch(value, 'image', { meta: { id }, data }, type)

describe('shared optimistic record transactions', () => {
  it('projects any image metadata into flat cards, detail envelopes and galleries', () => {
    const image = { id: 'image', presentationMode: 'contain', version: 1 }
    const other = { id: 'other', presentationMode: 'contain' }
    const input = {
      meta: { id: image.id },
      data: { presentationMode: 'cover', version: 2 },
    }
    const original = {
      id: 'resource',
      image,
      images: [{ image, intent: 'canonical' }, { image: other }],
      metadata: { image },
    }
    const projected = projectResourcePatch(original, 'image', input, 'organisation')
    expect(projected.image).toMatchObject(input.data)
    expect(projected.images[0]).toMatchObject({
      image: input.data,
      intent: 'canonical',
    })
    expect(projected.images[1]).toBe(original.images[1])
    expect(projected.metadata).toBe(original.metadata)
    expect(original.image.presentationMode).toBe('contain')
  })

  it.each([true, false])(
    'retains or rolls back a completed mutation (success=%s)',
    success => {
      const store = new Map<string, unknown>([
        ['resource', { image: { id: 'image', presentationMode: 'contain' } }],
      ])
      const records = new OptimisticRecords()
      const settle = records.begin(
        [['organisation', store]],
        patch('image', { presentationMode: 'cover' }),
      )
      expect(store.get('resource')).toMatchObject({
        image: { presentationMode: 'cover' },
      })
      settle(success)
      settle(!success)
      expect(store.get('resource')).toMatchObject({
        image: { presentationMode: success ? 'cover' : 'contain' },
      })
    },
  )

  it.each([true, false])(
    'preserves newer changes when an older request fails (new success=%s)',
    success => {
      const store = new Map<string, unknown>([
        ['image', { id: 'image', version: 1, presentationMode: 'contain' }],
      ])
      const records = new OptimisticRecords()
      const first = records.begin(
        [['image', store]],
        patch('image', { presentationMode: 'cover' }),
      )
      const second = records.begin([['image', store]], patch('image', { version: 2 }))
      second(success)
      first(false)
      expect(store.get('image')).toEqual({
        id: 'image',
        version: success ? 2 : 1,
        presentationMode: 'contain',
      })
    },
  )

  it('does not resurrect old records after a scope change', () => {
    const store = new Map<string, unknown>([['image', { id: 'image', version: 1 }]])
    const records = new OptimisticRecords()
    const settle = records.begin([['image', store]], patch('image', { version: 2 }))
    records.clear()
    store.clear()
    store.set('image', { id: 'image', version: 9 })
    settle(false)
    expect(store.get('image')).toEqual({ id: 'image', version: 9 })
  })

  it('preserves unrelated fields from an authoritative update during a request', () => {
    const store = new Map<string, unknown>([['image', { id: 'image', version: 1 }]])
    const records = new OptimisticRecords()
    const settle = records.begin([['image', store]], patch('image', { version: 2 }))
    store.set('image', { id: 'image', version: 1, title: 'server update' })
    settle(false)
    expect(store.get('image')).toEqual({
      id: 'image',
      version: 1,
      title: 'server update',
    })
  })
})
