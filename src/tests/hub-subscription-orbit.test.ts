import { expect, it, vi } from 'vitest'
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'
vi.mock('#lib/client/services/image.js', () => ({
  getURLfromImage: ({ image }: { image: ImageCtxEnvelope }) =>
    `/images/${image.image.id}`,
}))
import { getDecorativeFeatureImages } from '#lib/bits/patterns/bars/hubSubscriptionOverlay/hubSubscriptionOverlay.utils.js'

it('deduplicates shared feature photos before limiting the subscription orbit', () => {
  const image = (id: string) => ({ image: { id } }) as ImageCtxEnvelope
  const result = getDecorativeFeatureImages([image('a'), image('a'), image('b')], 0, 2)
  expect(result.map(row => row.id)).toEqual(['a', 'b'])
  expect(result.map(row => row.index)).toEqual([0, 1])
  expect(result.map(row => row.src)).toEqual(['/images/a', '/images/b'])
})
