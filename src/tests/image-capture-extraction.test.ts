// TESTING
import { describe, expect, it } from 'vitest'
// IMAGES
import {
  applyCaptureExtraction,
  extractCaptureAnnotations,
  planCaptureExtraction,
  type CaptureApplyStore,
  type CaptureDescriptionSnapshot,
  type CaptureImageSnapshot,
  type CapturePlan,
  type CaptureReceipt,
} from '#lib/images/capture-extraction.js'
import type { ImageMetadataDocument } from '#lib/images/storage.js'

const example =
  '(1) Photographed on 2025-03-14 (2-3) Photographed on 2022-02-08 (4) Photographed on 2021-11-22'

function snapshot(
  description = example,
  count = 4,
  locale = 'en',
): CaptureDescriptionSnapshot {
  const images: CaptureImageSnapshot[] = Array.from({ length: count }, (_, index) => ({
    id: `image-${index + 1}`,
    publicId: `images/test-${index + 1}`,
    env: 'local',
    version: 1,
    contentHash: null,
    associatedFeatureIds: ['feature-1'],
    isArchived: false,
    isPublished: true,
    metadata: {
      capturedAt: null,
      metadata: { Make: 'Original camera', Artist: 'Original artist' },
    },
  }))
  return {
    featureId: 'feature-1',
    locationId: 'location-1',
    locale,
    revision: 'revision-1',
    description,
    isArchived: false,
    isDraft: false,
    images,
    orderedImageIds: images.map(i => i.id),
    historicalOrderVerified: true,
    orderEvidence: 'immutable-import:reviewed-original-gallery',
  }
}

function harness(plan: CapturePlan) {
  const snapshots = structuredClone(plan.snapshots)
  const documents = new Map(
    snapshots.flatMap(s =>
      s.images.map(i => [i.id, structuredClone(i.metadata!)] as const),
    ),
  )
  const receipts: CaptureReceipt[] = []
  let writes = 0
  let clears = 0
  let invalidates = 0
  let failWrite = 0
  let failReadback = false
  let failClear = false
  let failInvalidation = false
  const store: CaptureApplyStore = {
    async readSnapshot(featureId, locale) {
      return structuredClone(
        snapshots.find(s => s.featureId === featureId && s.locale === locale)!,
      )
    },
    async readMetadata(image) {
      if (failReadback && writes) return { capturedAt: 'unexpected-concurrent-value' }
      return structuredClone(documents.get(image.id)!)
    },
    async writeMetadata(image, expected, next) {
      writes++
      if (writes === failWrite) throw new Error('Simulated interrupted metadata write')
      expect(documents.get(image.id)).toEqual(expected)
      documents.set(image.id, structuredClone(next))
      for (const s of snapshots)
        for (const i of s.images)
          if (i.id === image.id) {
            i.metadata = structuredClone(next)
            i.version = (i.version ?? 0) + 1
          }
    },
    async invalidate() {
      invalidates++
      if (failInvalidation) throw new Error('Simulated invalidation failure')
    },
    async clearDescriptions(changes) {
      if (failClear) throw new Error('Simulated description failure')
      for (const { expected } of changes) {
        const current = snapshots.find(
          s => s.featureId === expected.featureId && s.locale === expected.locale,
        )!
        if (
          current.description !== expected.description ||
          current.revision !== expected.revision ||
          JSON.stringify(current.orderedImageIds) !==
            JSON.stringify(expected.orderedImageIds)
        )
          throw new Error('Description CAS failed')
      }
      for (const { expected, next } of changes) {
        const current = snapshots.find(
          s => s.featureId === expected.featureId && s.locale === expected.locale,
        )!
        current.description = next
        clears++
      }
      for (const current of snapshots.filter(
        s => s.featureId === changes[0].expected.featureId,
      ))
        current.revision = 'own-cleanup-revision'
    },
    async readReceipt(planId, key, stage) {
      return (
        receipts.find(r => r.planId === planId && r.key === key && r.stage === stage) ??
        null
      )
    },
    async receipt(receipt) {
      receipts.push(structuredClone(receipt))
    },
  }
  return {
    store,
    snapshots,
    documents,
    receipts,
    stats: () => ({ writes, clears, invalidates }),
    interruptWrite: (number: number) => {
      failWrite = number
    },
    corruptReadback: () => {
      failReadback = true
    },
    interruptCleanup: (value: boolean) => {
      failClear = value
    },
    interruptInvalidation: (value: boolean) => {
      failInvalidation = value
    },
  }
}

describe('capture annotation planning', () => {
  it('maps the supplied four-image example against the frozen gallery', async () => {
    const plan = await planCaptureExtraction([snapshot()])
    expect(plan.proposals.map(p => [p.imageId, p.proposedAfter.value])).toEqual([
      ['image-1', '2025-03-14'],
      ['image-2', '2022-02-08'],
      ['image-3', '2022-02-08'],
      ['image-4', '2021-11-22'],
    ])
    expect(plan.proposals.every(p => p.decision === 'supported')).toBe(true)
    expect(plan.cleanup[0].proposedAfter).toBeNull()
    expect(plan.snapshots[0].description).toBe(example)
  })

  it.each([
    ['Photographed on 2025-03-14', '2025-03-14', 'day', false, null],
    ['Photographed in 2025-03', '2025-03', 'month', false, null],
    ['Photographed in circa 2021', '2021', 'year', true, null],
    ['拍攝於約2022年2月', '2022-02', 'month', true, null],
    ['（1–2）拍摄于2022年2月8日', '2022-02-08', 'day', false, null],
    [
      'Photographed on 2021-01-01 to 2021-02-01',
      '2021-01-01',
      'day',
      false,
      '2021-02-01',
    ],
    ['Photographed on 2021-01-01 13:15', '2021-01-01T13:15', 'minute', false, null],
    [
      'Photographed on 2021-01-01T13:15:16+08:00',
      '2021-01-01T13:15:16+08:00',
      'second',
      false,
      null,
    ],
  ])('preserves precision for %s', (text, value, precision, approximate, endValue) => {
    const [span] = extractCaptureAnnotations(text)
    expect(span.capture).toMatchObject({ value, precision, approximate, endValue })
    expect(span.text).toBe(text)
  })

  it.each([
    'Photographed on 2025-02-30',
    'Photographed on 2025-13-01',
    'Photographed on 2025-01-01 at 12:00',
    '(4-2) Photographed on 2025-01-01',
    'Photographed on 2025-01-01 to unknown',
    'Photographed on 2025-01-01 - 2025-01-02',
    'Photographed on 2025-01-01T25:00',
    'We photographed on 2025-03-14 during a visit',
    'Photographed on 2025-03-14 and demolished in 2026',
    'Photographed on 2025-01-01T12:30:00+25:00',
  ])('leaves unsupported or invalid wording intact: %s', async text => {
    const plan = await planCaptureExtraction([snapshot(text, 1)])
    expect(plan.proposals).toHaveLength(0)
    expect(plan.cleanup).toHaveLength(0)
    expect(plan.unresolved.length).toBeGreaterThan(0)
  })

  it('preserves substantive HTML and unrelated dates, clearing semantically empty formatting', async () => {
    const plan = await planCaptureExtraction([
      snapshot(
        '<p>Opened in 1920.</p><p><strong>Photographed on 2025-03-14</strong></p>',
        1,
      ),
    ])
    expect(plan.cleanup[0].proposedAfter).toContain('<p>Opened in 1920.</p>')
    const empty = await planCaptureExtraction([
      snapshot('<p><strong>Photographed on 2025-03-14</strong></p>', 1),
    ])
    expect(empty.cleanup[0].proposedAfter).toBeNull()
    const attr = await planCaptureExtraction([
      snapshot('<a title="Photographed on 2025-03-14">Credit</a>', 1),
    ])
    expect(attr.cleanup).toHaveLength(0)
  })

  it.each([
    'order',
    'missing',
    'duplicate',
    'archived',
    'draft',
    'unpublished',
    'metadata',
    'outside-scope',
  ])('quarantines %s evidence', async reason => {
    const s = snapshot()
    if (reason === 'order') s.historicalOrderVerified = false
    if (reason === 'missing') s.orderedImageIds.pop()
    if (reason === 'duplicate') s.orderedImageIds[1] = s.orderedImageIds[0]
    if (reason === 'archived') s.isArchived = true
    if (reason === 'draft') s.isDraft = true
    if (reason === 'unpublished')
      s.images.forEach(i => {
        i.isPublished = false
      })
    if (reason === 'metadata')
      s.images.forEach(i => {
        i.metadata = null
      })
    if (reason === 'outside-scope')
      s.images.forEach(i => {
        i.associatedFeatureIds.push('unseen-feature')
      })
    const plan = await planCaptureExtraction([s])
    expect(plan.proposals.every(p => p.decision === 'unresolved')).toBe(true)
    expect(plan.cleanup).toHaveLength(0)
  })

  it('never assumes an unnumbered annotation applies to a multi-image gallery', async () => {
    const plan = await planCaptureExtraction([snapshot('Photographed on 2025-03-14')])
    expect(plan.proposals[0].imageId).toBeNull()
    expect(plan.cleanup).toHaveLength(0)
  })

  it('quarantines existing EXIF and authored capture conflicts without changing raw metadata', async () => {
    const s = snapshot('Photographed on 2025-03-14', 1)
    s.images[0].metadata!.capturedAt = '2020-01-01T12:00:00Z'
    const plan = await planCaptureExtraction([s])
    expect(plan.proposals[0].decision).toBe('conflict')
    expect(plan.cleanup).toHaveLength(0)
    expect(plan.snapshots[0].images[0].metadata).toEqual(s.images[0].metadata)
  })

  it('preserves an existing authored capture assertion when a description disagrees', async () => {
    const s = snapshot('Photographed on 2025-03-14', 1)
    s.images[0].metadata!.capture = extractCaptureAnnotations(
      'Photographed on 2020-01-01',
    )[0].capture
    const plan = await planCaptureExtraction([s])
    expect(plan.proposals[0].decision).toBe('conflict')
    expect(plan.cleanup).toHaveLength(0)
  })

  it('adds source receipts to a matching existing capture without rewriting its wording', async () => {
    const s = snapshot('Photographed on 2025-03-14', 1)
    s.images[0].metadata!.capture = {
      ...extractCaptureAnnotations(s.description!)[0].capture,
      originalText: 'Original evidenced wording',
    }
    const plan = await planCaptureExtraction([s])
    expect(plan.proposals[0].decision).toBe('no-change')
    const h = harness(plan)
    await applyCaptureExtraction(plan, h.store)
    expect(h.documents.get('image-1')!.capture!.originalText).toBe(
      'Original evidenced wording',
    )
    expect(h.documents.get('image-1')!.captureSources).toHaveLength(1)
  })

  it('reconciles conflicting shared-image assertions across Features and identical-byte copies', async () => {
    const first = snapshot('Photographed on 2025-03-14', 1)
    const second = snapshot('Photographed on 2020-01-01', 1)
    second.featureId = 'feature-2'
    first.images[0].associatedFeatureIds = second.images[0].associatedFeatureIds = [
      'feature-1',
      'feature-2',
    ]
    let plan = await planCaptureExtraction([first, second])
    expect(plan.proposals.every(p => p.decision === 'conflict')).toBe(true)
    expect(plan.cleanup).toHaveLength(0)
    second.images[0].id = 'different-id'
    second.images[0].publicId = 'different-object'
    second.orderedImageIds = ['different-id']
    first.images[0].contentHash = second.images[0].contentHash = 'same-normalized-bytes'
    plan = await planCaptureExtraction([first, second])
    expect(plan.proposals.every(p => p.decision === 'conflict')).toBe(true)
  })
})

describe('staged capture application', () => {
  it('writes and verifies four images before clearing prose, preserving EXIF and restore data', async () => {
    const plan = await planCaptureExtraction([snapshot()])
    const h = harness(plan)
    await applyCaptureExtraction(plan, h.store)
    expect(h.stats()).toEqual({ writes: 4, clears: 1, invalidates: 4 })
    expect(h.snapshots[0].description).toBeNull()
    expect(h.documents.get('image-2')).toMatchObject({
      capture: { value: '2022-02-08', precision: 'day' },
      metadata: { Make: 'Original camera', Artist: 'Original artist' },
      capturedAt: null,
    })
    expect(plan.snapshots[0].description).toBe(example)
    expect(h.receipts.filter(r => r.stage === 'prepared')).toHaveLength(4)
  })

  it('refuses changed gallery order, including on a replay', async () => {
    const plan = await planCaptureExtraction([snapshot()])
    const h = harness(plan)
    h.snapshots[0].orderedImageIds.reverse()
    await expect(applyCaptureExtraction(plan, h.store)).rejects.toThrow(
      'gallery changed',
    )
    expect(h.stats().writes).toBe(0)
  })

  it('supports multiple locales and shared-image wording with one reconciled metadata write', async () => {
    const plan = await planCaptureExtraction([
      snapshot('Photographed on 2025-03-14', 1),
      snapshot('拍攝於2025年3月14日', 1, 'zh-hant'),
    ])
    const h = harness(plan)
    await applyCaptureExtraction(plan, h.store)
    expect(h.stats().writes).toBe(1)
    expect(h.stats().clears).toBe(2)
    expect(h.documents.get('image-1')!.captureSources).toHaveLength(2)
  })

  it('retains all prose after interrupted writes and resumes without rewriting completed images', async () => {
    const plan = await planCaptureExtraction([snapshot()])
    const h = harness(plan)
    h.interruptWrite(2)
    await expect(applyCaptureExtraction(plan, h.store)).rejects.toThrow('interrupted')
    expect(h.snapshots[0].description).toBe(example)
    await applyCaptureExtraction(plan, h.store)
    expect(h.stats().writes).toBe(5) // Four successful writes and one failed attempt.
    expect(h.snapshots[0].description).toBeNull()
    const after = structuredClone([...h.documents])
    await applyCaptureExtraction(plan, h.store)
    expect(h.stats().writes).toBe(5)
    expect(h.stats().clears).toBe(1)
    expect([...h.documents]).toEqual(after)
  })

  it('leaves descriptions recoverable after failed readback', async () => {
    const plan = await planCaptureExtraction([snapshot()])
    const h = harness(plan)
    h.corruptReadback()
    await expect(applyCaptureExtraction(plan, h.store)).rejects.toThrow(
      'readback failed',
    )
    expect(h.snapshots[0].description).toBe(example)
    expect(h.receipts[0].before).toEqual(plan.snapshots[0].images[0].metadata)
  })

  it('requires cache invalidation to succeed before cleanup and resumes safely', async () => {
    const plan = await planCaptureExtraction([snapshot()])
    const h = harness(plan)
    h.interruptInvalidation(true)
    await expect(applyCaptureExtraction(plan, h.store)).rejects.toThrow(
      'invalidation failure',
    )
    expect(h.snapshots[0].description).toBe(example)
    h.interruptInvalidation(false)
    await applyCaptureExtraction(plan, h.store)
    expect(h.snapshots[0].description).toBeNull()
  })

  it('rechecks metadata after invalidation before cleaning descriptions', async () => {
    const plan = await planCaptureExtraction([snapshot()])
    const h = harness(plan)
    h.store.invalidate = async imageId => {
      h.documents.get(imageId)!.capture = null
    }
    await expect(applyCaptureExtraction(plan, h.store)).rejects.toThrow(
      'changed before cleanup',
    )
    expect(h.snapshots[0].description).toBe(example)
    expect(h.stats().clears).toBe(0)
  })

  it('resumes after metadata success and description failure', async () => {
    const plan = await planCaptureExtraction([snapshot()])
    const h = harness(plan)
    h.interruptCleanup(true)
    await expect(applyCaptureExtraction(plan, h.store)).rejects.toThrow(
      'description failure',
    )
    expect(h.stats().writes).toBe(4)
    expect(h.snapshots[0].description).toBe(example)
    h.interruptCleanup(false)
    await applyCaptureExtraction(plan, h.store)
    expect(h.stats().writes).toBe(4)
    expect(h.snapshots[0].description).toBeNull()
  })

  it('rejects changed descriptions and tampered manifests before writing metadata', async () => {
    const plan = await planCaptureExtraction([snapshot()])
    const h = harness(plan)
    h.snapshots[0].description = 'A newer description'
    await expect(applyCaptureExtraction(plan, h.store)).rejects.toThrow(
      'Description, revision',
    )
    plan.cleanup[0].proposedAfter = 'unreviewed deletion'
    await expect(applyCaptureExtraction(plan, h.store)).rejects.toThrow(
      'contents changed',
    )
    expect(h.stats().writes).toBe(0)
  })
})
