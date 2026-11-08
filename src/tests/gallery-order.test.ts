import { describe, expect, it } from 'vitest'
import { orderGallery, orderGalleryForReview } from '#lib/images/galleryOrder.js'

const images = [
  { id: 'old', intent: 'general', createdAt: '2026-01-01', galleryPosition: 0 },
  { id: 'featured', intent: 'canonical', createdAt: '2025-01-01', galleryPosition: 1 },
  { id: 'new', intent: 'general', createdAt: '2026-02-01' },
]
const ids = (items: { id: string }[]) => items.map(item => item.id)

describe('explicit gallery ordering', () => {
  it('defaults historical arrays to intent order, placing new images by date within intent', () => {
    expect(ids(orderGallery(images))).toEqual(['featured', 'new', 'old'])
    expect(images[0].id).toBe('old')
  })
  it('uses the effective configured catalogue and puts removed intents last', () => {
    expect(
      ids(
        orderGallery([...images, { id: 'retired', intent: 'retired' }], 'automatic', [
          'general',
          'canonical',
        ]),
      ),
    ).toEqual(['new', 'old', 'featured', 'retired'])
  })
  it('keeps manual positions through intent changes and appends unpositioned uploads', () => {
    expect(ids(orderGallery(images, 'manual'))).toEqual(['old', 'featured', 'new'])
    expect(
      ids(
        orderGallery(
          images.map(item => ({ ...item, intent: 'canonical' })),
          'manual',
        ),
      ),
    ).toEqual(['old', 'featured', 'new'])
  })
})

it('puts unclassified photos first only in automatic review rails, newest first', () => {
  const pending = [
    ...images,
    {
      id: 'unclassified-old',
      intent: 'undefined',
      createdAt: '2026-01-01',
      galleryPosition: 3,
    },
    {
      id: 'unclassified-new',
      intent: null,
      createdAt: '2026-02-01',
      galleryPosition: 4,
    },
  ]
  expect(
    ids(
      orderGalleryForReview(pending, 'automatic', [
        'canonical',
        'general',
        'undefined',
      ]),
    ),
  ).toEqual(['unclassified-new', 'unclassified-old', 'featured', 'new', 'old'])
  expect(ids(orderGalleryForReview(pending, 'manual')).slice(0, 2)).toEqual([
    'old',
    'featured',
  ])
  expect(ids(orderGallery(pending))[0]).toBe('featured')
})
