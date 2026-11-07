import { describe, it, expect } from 'vitest'
import {
  applyFeatureChanges,
  buildFeatureChanges,
  FeatureChangesSchema,
} from '#lib/revisions/featureChanges.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'

function content(): FeatureRevisionContent {
  return {
    format: 'feature-content/v1',
    profile: {
      isIntangible: false,
      visitability: { isVisitable: true, asOf: '2026-01-01' },
    },
    placement: {
      geometry: { type: 'Point', coordinates: [114, 22] },
      addressMeta: null,
      location: null,
    },
    detachedBrands: null,
    translations: {
      en: {
        title: { value: 'Original', generated: false },
        description: { value: 'Original description', generated: false },
        address: { value: null, generated: false, properties: null },
      },
    },
    properties: {},
    gallery: {
      order: ['original'],
      entries: {
        original: {
          imageRevisionId: 'image-v1',
          intent: 'general',
          isPublished: true,
          caption: { en: 'Original caption' },
          alt: {},
        },
      },
    },
  }
}
const image = {
  imageRevisionId: 'upload-v1',
  intent: 'general' as const,
  isPublished: true,
  caption: {},
  alt: {},
}

describe('partial Feature proposals', () => {
  it('stores only changed fields and keeps unrelated staff edits', () => {
    const base = content(),
      proposed = content(),
      current = content()
    proposed.translations.en.title.value = 'Corrected'
    current.translations.en.description.value = 'Staff description'
    const changes = buildFeatureChanges(base, proposed)
    expect(changes.operations).toHaveLength(1)
    expect(JSON.stringify(changes)).not.toContain('Original description')
    const result = applyFeatureChanges(base, current, changes)
    expect(result.status).toBe('ready')
    if (result.status === 'ready')
      expect(result.content.translations.en).toMatchObject({
        title: { value: 'Corrected' },
        description: { value: 'Staff description' },
      })
  })
  it('distinguishes explicit null from omitted fields', () => {
    const base = content(),
      proposed = content()
    proposed.translations.en.description.value = null
    const result = applyFeatureChanges(base, base, buildFeatureChanges(base, proposed))
    expect(
      result.status === 'ready' && result.content.translations.en.description.value,
    ).toBeNull()
    expect(
      result.status === 'ready' && result.content.translations.en.title.value,
    ).toBe('Original')
  })
  it('reports overlapping edits without silently overwriting current content', () => {
    const base = content(),
      proposed = content(),
      current = content()
    proposed.translations.en.title.value = 'Proposed'
    current.translations.en.title.value = 'Staff'
    const result = applyFeatureChanges(
      base,
      current,
      buildFeatureChanges(base, proposed),
    )
    expect(result).toMatchObject({
      status: 'conflict',
      conflicts: [{ path: ['translations', 'en', 'title'] }],
    })
    expect(current.translations.en.title.value).toBe('Staff')
  })
  it('adds a photo alongside independently added photos without replacing the gallery', () => {
    const base = content(),
      proposed = content(),
      current = content()
    proposed.gallery.entries.upload = image
    proposed.gallery.order.push('upload')
    current.gallery.entries.staff = { ...image, imageRevisionId: 'staff-v1' }
    current.gallery.order.push('staff')
    const changes = buildFeatureChanges(base, proposed)
    expect(changes.operations.map(row => row.op)).toEqual(['addImage'])
    const result = applyFeatureChanges(base, current, changes)
    expect(result.status === 'ready' && result.content.gallery.order).toEqual([
      'original',
      'staff',
      'upload',
    ])
  })
  it('conflicts on removing a photo that staff subsequently edited', () => {
    const base = content(),
      proposed = content(),
      current = content()
    proposed.gallery = { order: [], entries: {} }
    current.gallery.entries.original.caption.en = 'Staff caption'
    expect(
      applyFeatureChanges(base, current, buildFeatureChanges(base, proposed)).status,
    ).toBe('conflict')
  })
  it('replaces image bytes by reference while retaining independently edited captions', () => {
    const base = content(),
      proposed = content(),
      current = content()
    proposed.gallery.entries.original.imageRevisionId = 'replacement-v2'
    current.gallery.entries.original.caption.en = 'Staff caption'
    const result = applyFeatureChanges(
      base,
      current,
      buildFeatureChanges(base, proposed),
    )
    expect(
      result.status === 'ready' && result.content.gallery.entries.original,
    ).toMatchObject({
      imageRevisionId: 'replacement-v2',
      caption: { en: 'Staff caption' },
    })
  })
  it('retains concurrent photos during an explicit gallery reorder', () => {
    const base = content()
    base.gallery.entries.second = image
    base.gallery.order.push('second')
    const proposed = structuredClone(base),
      current = structuredClone(base)
    proposed.gallery.order.reverse()
    current.gallery.entries.staff = { ...image, imageRevisionId: 'staff-v1' }
    current.gallery.order.push('staff')
    const result = applyFeatureChanges(
      base,
      current,
      buildFeatureChanges(base, proposed),
    )
    expect(result.status === 'ready' && result.content.gallery.order).toEqual([
      'second',
      'original',
      'staff',
    ])
  })
  it('rejects unsafe paths, unknown operations and malformed resulting records', () => {
    expect(() =>
      FeatureChangesSchema.parse({
        format: 'feature-changes/v1',
        operations: [
          {
            op: 'set',
            path: ['translations', '__proto__', 'title'],
            value: 'pollution',
          },
        ],
      }),
    ).toThrow()
    expect(() =>
      FeatureChangesSchema.parse({
        format: 'feature-changes/v1',
        operations: [{ op: 'set', path: ['isPublished'], value: true }],
      }),
    ).toThrow()
    expect(() =>
      applyFeatureChanges(content(), content(), {
        format: 'feature-changes/v1',
        operations: [{ op: 'remove', path: ['profile'] }],
      }),
    ).toThrow()
  })
  it('rejects overlapping operations rather than letting their order decide the outcome', () => {
    expect(() =>
      applyFeatureChanges(content(), content(), {
        format: 'feature-changes/v1',
        operations: [
          { op: 'remove', path: ['translations', 'en'] },
          {
            op: 'set',
            path: ['translations', 'en', 'title'],
            value: { value: 'Changed', generated: false },
          },
        ],
      }),
    ).toThrow('Overlapping')
  })
})

describe('gallery sort mode revisions', () => {
  it('round-trips an explicit manual mode without changing image content', () => {
    const base = content(),
      proposed = content()
    proposed.gallery.sortMode = 'manual'
    const changes = buildFeatureChanges(base, proposed)
    expect(changes.operations).toEqual([{ op: 'setGallerySortMode', mode: 'manual' }])
    const result = applyFeatureChanges(base, base, changes)
    expect(result.status).toBe('ready')
    if (result.status === 'ready')
      expect(result.content.gallery).toEqual(proposed.gallery)
  })
  it('appends newly accepted images without overriding a concurrent manual gallery', () => {
    const base = content(),
      proposed = content(),
      current = content()
    proposed.gallery.entries.new = image
    proposed.gallery.order.push('new')
    current.gallery.sortMode = 'manual'
    const result = applyFeatureChanges(
      base,
      current,
      buildFeatureChanges(base, proposed),
    )
    expect(result.status).toBe('ready')
    if (result.status === 'ready') {
      expect(result.content.gallery.sortMode).toBe('manual')
      expect(result.content.gallery.order).toEqual(['original', 'new'])
    }
  })
})
