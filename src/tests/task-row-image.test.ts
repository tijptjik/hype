// TESTS
import { describe, expect, it } from 'vitest'
// IMAGE DELIVERY
import { taskRowImage } from '#lib/bits/patterns/resource/rows/TaskRow/taskRowImage.js'
import { getURLfromImage } from '#lib/client/services/image.js'
// TYPES
import type { Task } from '#lib/db/zod/schema/task.types.js'
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'

const images = [
  {
    taskId: 'task-id',
    imageId: 'image-id',
    image: { id: 'image-id', imageRevisionId: 'retained-revision', version: 1 },
  },
] as Task['images']

describe('task row thumbnail delivery', () => {
  it('includes private Feature review context without requiring a hydrated Feature', () => {
    const image = taskRowImage({ featureId: 'feature-id', images })
    const url = new URL(
      getURLfromImage({
        image: image as ImageCtxEnvelope,
        transformation: 'c_fill,h_128,w_128',
      }),
      'https://hype.test',
    )
    expect(url.pathname).toBe('/api/images/revisions/retained-revision')
    expect(url.searchParams.get('feature')).toBe('feature-id')
    expect(url.searchParams.get('t')).toBe('c_fill,h_128,w_128')
  })

  it('retains proposal-only images without inventing a Feature context', () => {
    const image = taskRowImage({ featureId: null, images })
    const url = new URL(
      getURLfromImage({ image: image as ImageCtxEnvelope }),
      'https://hype.test',
    )
    expect(url.pathname).toBe('/api/images/revisions/retained-revision')
    expect(url.searchParams.has('feature')).toBe(false)
  })

  it('keeps the placeholder for tasks without image evidence', () => {
    expect(taskRowImage({ featureId: 'feature-id', images: [] })).toBeUndefined()
  })
})
