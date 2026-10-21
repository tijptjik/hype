// TABLE OF CONTENTS
// 1. Snapshot, manifest and receipt contracts
// 2. Conservative annotation parsing and cleanup
// 3. Cross-locale/shared-image planning
// 4. Resumable staged application through fenced persistence ports

// TYPES
import type { ImageMetadataDocument } from './storage.js'
import type { ImageCapture, ImageCaptureSource } from './capture.js'

export type CaptureImageSnapshot = {
  id: string
  publicId: string
  env: 'local' | 'preview' | 'production'
  version: number | null
  contentHash: string | null
  associatedFeatureIds: string[]
  isArchived: boolean
  isPublished: boolean
  metadata: ImageMetadataDocument | null
}

export type CaptureDescriptionSnapshot = {
  featureId: string
  locationId: string | null
  locale: string
  revision: string
  description: string | null
  isArchived: boolean
  isDraft: boolean
  images: CaptureImageSnapshot[]
  /** Freeze the full gallery, including unavailable/draft images; never renumber after filtering. */
  orderedImageIds: string[]
  historicalOrderVerified: boolean
  orderEvidence: string | null
}

export type CaptureAnnotation = {
  start: number
  end: number
  text: string
  ordinals: number[] | null
  capture: ImageCapture
}

export type CaptureProposal = {
  manifestVersion: 1
  featureId: string
  locationId: string | null
  imageId: string | null
  field: 'image.metadata.capture'
  expectedBefore: ImageCapture | null
  proposedAfter: ImageCapture
  decision: 'supported' | 'unresolved' | 'conflict' | 'no-change'
  evidence: Array<{ reference: string; quotedText: string; supports: 'capture' }>
  effectiveDate: string
  datePrecision: ImageCapture['precision']
  confidence: 'high' | 'low'
  notes: string
  source: ImageCaptureSource
}

export type CaptureUnresolved = {
  manifestVersion: 1
  featureId: string
  locale: string
  descriptionHash: string
  decision: 'unresolved'
  quotedText: string
  notes: string
}

export type CapturePlan = {
  manifestVersion: 1
  id: string
  snapshots: CaptureDescriptionSnapshot[]
  proposals: CaptureProposal[]
  unresolved: CaptureUnresolved[]
  cleanup: Array<{
    featureId: string
    locale: string
    expectedBefore: string | null
    proposedAfter: string | null
    descriptionHash: string
    revision: string
    spans: Array<{ start: number; end: number; text: string }>
  }>
}

const dateToken = String.raw`\d{4}(?:[-/]\d{2}(?:[-/]\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?)?|年(?:\d{1,2}月(?:\d{1,2}日)?)?)?`
const annotationPattern = new RegExp(
  String.raw`(?:[（(]([\d\s,，、\-–—至]+)[）)]\s*)?(?:Photographed\s+(?:on|in)|拍攝於|拍摄于|攝於|摄于)\s*[:：]?\s*((?:circa\s+|around\s+|approximately\s+|約\s*|约\s*)?)(${dateToken})(?:\s*(?:to|至|–|—)\s*(${dateToken}))?(?![\d\w:/+\-年月日])`,
  'giu',
)

/**
 * Computes a SHA-256 fingerprint without conflating null with an empty description.
 * @param value Exact JSON-compatible input.
 * @returns Hexadecimal fingerprint for manifests and expected-content checks.
 */
export async function captureFingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

/**
 * Validates expressed calendar/time components without interpreting them as a local instant.
 * @param token Date/time wording recognised by the capture grammar.
 * @returns Normalised value and precision, or null for impossible dates/times.
 */
function parseDate(token: string): Pick<ImageCapture, 'value' | 'precision'> | null {
  const value = token
    .replace(/年|月/gu, '-')
    .replace(/日$/u, '')
    .replace(/-$/u, '')
    .replaceAll('/', '-')
    .replace(' ', 'T')
    .replace(/-(\d)(?=-|$)/gu, '-0$1')
  const match =
    /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?)?)?)?$/u.exec(
      value,
    )
  if (!match || Number(match[1]) < 1) return null
  const [, year, month, day, hour, minute, second, offset] = match
  if (month && (Number(month) < 1 || Number(month) > 12)) return null
  const y = Number(year)
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (day && (Number(day) < 1 || Number(day) > days[Number(month) - 1])) return null
  if (hour && (Number(hour) > 23 || Number(minute) > 59 || Number(second ?? 0) > 59))
    return null
  if (
    offset &&
    offset !== 'Z' &&
    (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59)
  )
    return null
  return {
    value,
    precision: second
      ? 'second'
      : hour
        ? 'minute'
        : day
          ? 'day'
          : month
            ? 'month'
            : 'year',
  }
}

/**
 * Expands explicit positive ordinals and inclusive ranges; malformed or excessive lists fail closed.
 * @param text Parenthesised reference contents.
 * @returns Unique ordinals, or null for an ambiguous list.
 */
function parseOrdinals(text: string): number[] | null {
  const result: number[] = []
  for (const part of text.split(/[,，、]/u)) {
    const match = /^\s*(\d+)\s*(?:[-–—至]\s*(\d+)\s*)?$/u.exec(part)
    if (!match) return null
    const start = Number(match[1])
    const end = Number(match[2] ?? start)
    if (start < 1 || end < start || end > 10000) return null
    for (let index = start; index <= end; index++) result.push(index)
  }
  return new Set(result).size === result.length ? result : null
}

/**
 * Finds only explicit photography annotations within raw text nodes, preserving exact source offsets.
 * @param description Original plain text or HTML description.
 * @returns Recognised spans; unsupported wording remains untouched.
 * @remarks The grammar never crosses markup. Non-ordinal text maps only to a single-image gallery.
 */
export function extractCaptureAnnotations(description: string): CaptureAnnotation[] {
  const annotations: CaptureAnnotation[] = []
  // Examine only text nodes; attribute values and tag markup are never capture prose.
  const opaque = [
    ...description.matchAll(/<(script|style|code|pre)\b[^>]*>[\s\S]*?<\/\1>/giu),
  ]
  const nodes = description.matchAll(/[^<>]+(?=<|$)/gu)
  for (const node of nodes) {
    if (node.index > 0 && description[node.index - 1] === '<') continue
    if (
      opaque.some(
        match =>
          node.index >= match.index && node.index < match.index + match[0].length,
      )
    )
      continue
    for (const match of node[0].matchAll(annotationPattern)) {
      const date = parseDate(match[3])
      const end = match[4] ? parseDate(match[4]) : null
      const ordinals = match[1] ? parseOrdinals(match[1]) : null
      if (!date || (match[4] && !end) || (match[1] && !ordinals)) continue
      // Different endpoint precision or offsets require manual interval interpretation.
      if (
        end &&
        (end.precision !== date.precision ||
          end.value < date.value ||
          end.value.match(/(?:Z|[+-]\d{2}:\d{2})$/u)?.[0] !==
            date.value.match(/(?:Z|[+-]\d{2}:\d{2})$/u)?.[0])
      )
        continue
      const suffix = node[0].slice(match.index + match[0].length)
      if (/^\s*(?:at\b|to\b|[-–—至/]|[ap]\.?m\.?\b)/iu.test(suffix)) continue
      const start = node.index + match.index
      const preceding = description.slice(Math.max(node.index, start - 40), start)
      // Never extract a suffix from an unsupported ordinal/qualifier and then clear its meaning.
      if (!match[1] && /[）)]\s*$/u.test(preceding)) continue
      // Extract standalone annotations, not fragments of substantive narrative sentences.
      if (!match[1] && !/(?:^|[\n.!?。！？;；])\s*$/u.test(preceding)) continue
      const remainder = suffix.replace(/^[ \t]+/u, '')
      if (remainder && !/^(?:[\r\n.,;:!?，。；：！？）)]|[（(]\d)/u.test(remainder))
        continue
      annotations.push({
        start,
        end: start + match[0].length,
        text: match[0],
        ordinals,
        capture: {
          ...date,
          endValue: end?.value ?? null,
          endPrecision: end?.precision ?? null,
          approximate: Boolean(match[2]),
          originalText: match[0],
        },
      })
    }
  }
  return annotations
}

/**
 * Removes only approved spans and empty paragraph wrappers left by those removals.
 * @param description Original description.
 * @param spans Recognised spans whose metadata has been verified.
 * @returns Preserved substantive HTML/text, or the established null empty-description value.
 */
export function removeCaptureSpans(
  description: string,
  spans: Array<{ start: number; end: number }>,
): string | null {
  let result = description
  for (const span of [...spans].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, span.start) + result.slice(span.end)
  }
  result = result.replace(
    /<p(?:\s[^>]*)?>[\s.,;:()\-–—，。；：（）]*(?:<br\s*\/?>[\s.,;:()\-–—，。；：（）]*)*<\/p>/giu,
    '',
  )
  // Images, links and other semantic nodes must survive even if they have no visible text.
  const punctuationOnly = /^[\s.,;:()\-–—，。；：（）]*$/u
  const emptyCheck = result
    .replace(/<\/?(?:p|div|span|strong|em|b|i|u)(?:\s[^>]*)?>|<br\s*\/?>/giu, '')
    .replace(/&nbsp;|&#160;|&#x0*a0;/giu, ' ')
  if (punctuationOnly.test(emptyCheck)) return null
  return result.trim() || null
}

/**
 * Compares capture assertions independently of translated wording and provenance.
 * @param capture Capture assertion to compare.
 * @returns Stable representation of the asserted date/time meaning.
 */
function captureMeaning(capture: ImageCapture): string {
  return JSON.stringify([
    capture.value,
    capture.precision,
    capture.endValue,
    capture.endPrecision,
    capture.approximate,
  ])
}

/**
 * Builds reversible proposals across all locales and reconciles shared physical-image assertions.
 * @param snapshots Exact persisted descriptions, image state and reviewed historical gallery evidence.
 * @returns Frozen manifest with conservative mapping and conditional cleanup proposals.
 */
export async function planCaptureExtraction(
  snapshots: CaptureDescriptionSnapshot[],
): Promise<CapturePlan> {
  const frozen = structuredClone(snapshots)
  const proposals: CaptureProposal[] = []
  for (const snapshot of frozen) {
    const descriptionHash = await captureFingerprint(snapshot.description)
    for (const span of extractCaptureAnnotations(snapshot.description ?? '')) {
      const ordinals =
        span.ordinals ?? (snapshot.orderedImageIds.length === 1 ? [1] : [])
      const imageIds = ordinals.map(ordinal => snapshot.orderedImageIds[ordinal - 1])
      const invalidGallery =
        snapshot.isArchived ||
        snapshot.isDraft ||
        !snapshot.historicalOrderVerified ||
        !snapshot.orderEvidence ||
        new Set(snapshot.orderedImageIds).size !== snapshot.orderedImageIds.length ||
        snapshot.images.length !== snapshot.orderedImageIds.length ||
        snapshot.orderedImageIds.some(
          id => snapshot.images.filter(image => image.id === id).length !== 1,
        )
      const unresolved = invalidGallery || !imageIds.length || imageIds.some(id => !id)
      for (const imageId of unresolved ? [null] : imageIds) {
        const image = snapshot.images.find(item => item.id === imageId)
        const missing =
          !image ||
          image.isArchived ||
          !image.isPublished ||
          !image.metadata ||
          !image.associatedFeatureIds.includes(snapshot.featureId) ||
          image.associatedFeatureIds.some(id => !frozen.some(s => s.featureId === id))
        const existing = image?.metadata?.capture ?? null
        const exif = image?.metadata?.capturedAt
        // EXIF is independent evidence: preserve it and quarantine disagreements, including precision ambiguity.
        const exifConflict = Boolean(
          exif &&
            (span.capture.approximate ||
              span.capture.endValue ||
              exif !== span.capture.value),
        )
        const conflict =
          Boolean(
            existing && captureMeaning(existing) !== captureMeaning(span.capture),
          ) || exifConflict
        const decision =
          unresolved || missing
            ? 'unresolved'
            : conflict
              ? 'conflict'
              : existing
                ? 'no-change'
                : 'supported'
        const source: ImageCaptureSource = {
          featureId: snapshot.featureId,
          locale: snapshot.locale,
          descriptionHash,
          revision: snapshot.revision,
          start: span.start,
          end: span.end,
          quotedText: span.text,
          orderedImageIds: snapshot.orderedImageIds,
          orderEvidence: snapshot.orderEvidence ?? '',
        }
        proposals.push({
          manifestVersion: 1,
          featureId: snapshot.featureId,
          locationId: snapshot.locationId,
          imageId: imageId ?? null,
          field: 'image.metadata.capture',
          expectedBefore: existing,
          proposedAfter: span.capture,
          decision,
          evidence: [
            {
              reference: `feature:${snapshot.featureId}:${snapshot.locale}:${descriptionHash}`,
              quotedText: span.text,
              supports: 'capture',
            },
          ],
          effectiveDate: span.capture.value,
          datePrecision: span.capture.precision,
          confidence:
            decision === 'supported' || decision === 'no-change' ? 'high' : 'low',
          notes: unresolved
            ? 'Historical gallery order/association is unverified, duplicated or insufficient.'
            : missing
              ? 'Image is missing, archived, unpublished, metadata unavailable or shared-image scope incomplete.'
              : conflict
                ? 'Existing capture evidence conflicts; preserve both for review.'
                : 'Explicit capture annotation with frozen reviewed gallery order.',
          source,
        })
      }
    }
  }
  // Reconcile by storage identity and, where available, exact normalized-byte identity across Features.
  const groups = new Map<string, CaptureProposal[]>()
  for (const row of proposals) {
    if (!row.imageId) continue
    const image = frozen
      .find(s => s.featureId === row.featureId && s.locale === row.source.locale)
      ?.images.find(i => i.id === row.imageId)
    if (!image) continue
    for (const key of [
      `id:${image.id}`,
      `object:${image.env}:${image.publicId}`,
      ...(image.contentHash ? [`hash:${image.contentHash}`] : []),
    ]) {
      const group = groups.get(key) ?? []
      group.push(row)
      groups.set(key, group)
    }
  }
  let changed = true
  while (changed) {
    changed = false
    for (const group of groups.values()) {
      if (
        new Set(group.map(row => captureMeaning(row.proposedAfter))).size > 1 ||
        group.some(row => row.decision === 'conflict')
      ) {
        for (const row of group) {
          if (row.decision !== 'conflict') changed = true
          row.decision = 'conflict'
          row.confidence = 'low'
          row.notes =
            'Shared image has contradictory capture evidence; no metadata write or cleanup.'
        }
      }
    }
  }
  // Multiple logical image IDs for one object cannot be independently activated safely.
  for (const [key, group] of groups) {
    if (key.startsWith('object:') && new Set(group.map(row => row.imageId)).size > 1) {
      for (const row of group) {
        row.decision = 'conflict'
        row.confidence = 'low'
        row.notes =
          'Duplicate image IDs share a storage object; reconcile identities before applying.'
      }
    }
  }
  const unresolved: CaptureUnresolved[] = []
  for (const snapshot of frozen) {
    const description = snapshot.description ?? ''
    const spans = extractCaptureAnnotations(description)
    for (const match of description.matchAll(
      /photograph(?:ed|y|s)?|拍攝|拍摄|攝於|摄于/giu,
    )) {
      if (!spans.some(span => match.index >= span.start && match.index < span.end))
        unresolved.push({
          manifestVersion: 1,
          featureId: snapshot.featureId,
          locale: snapshot.locale,
          descriptionHash: await captureFingerprint(snapshot.description),
          decision: 'unresolved',
          quotedText: description.slice(
            Math.max(0, match.index - 60),
            match.index + 180,
          ),
          notes:
            'Capture-like wording outside the supported explicit grammar; preserve for manual review.',
        })
    }
  }
  const cleanup: CapturePlan['cleanup'] = []
  for (const snapshot of frozen) {
    const rows = proposals.filter(
      row =>
        row.featureId === snapshot.featureId && row.source.locale === snapshot.locale,
    )
    const spans = extractCaptureAnnotations(snapshot.description ?? '').filter(span => {
      const matches = rows.filter(row => row.source.start === span.start)
      return (
        matches.length > 0 &&
        matches.every(
          row => row.decision === 'supported' || row.decision === 'no-change',
        )
      )
    })
    if (spans.length && snapshot.description !== null)
      cleanup.push({
        featureId: snapshot.featureId,
        locale: snapshot.locale,
        expectedBefore: snapshot.description,
        proposedAfter: removeCaptureSpans(snapshot.description, spans),
        descriptionHash: await captureFingerprint(snapshot.description),
        revision: snapshot.revision,
        spans: spans.map(({ start, end, text }) => ({ start, end, text })),
      })
  }
  return {
    manifestVersion: 1,
    id: await captureFingerprint(frozen),
    snapshots: frozen,
    proposals,
    unresolved,
    cleanup,
  }
}

export type CaptureReceipt = {
  planId: string
  stage: 'prepared' | 'metadata-verified' | 'cleanup-prepared' | 'cleaned'
  key: string
  before: unknown
  after: unknown
}

/** Ports must enforce CAS atomically, use exact environments and retain durable receipts before effects. */
export type CaptureApplyStore = {
  readSnapshot(featureId: string, locale: string): Promise<CaptureDescriptionSnapshot>
  readMetadata(image: CaptureImageSnapshot): Promise<ImageMetadataDocument>
  /** Compare the complete current document to expected; activate a fresh immutable version, never overwrite old sidecars. */
  writeMetadata(
    image: CaptureImageSnapshot,
    expected: ImageMetadataDocument,
    next: ImageMetadataDocument,
    operationId: string,
  ): Promise<void>
  /** Invalidate metadata plus image/gallery/Feature handles for every image reuse before prose cleanup. */
  invalidate(imageId: string): Promise<void>
  /** CAS all locale descriptions for one Feature AND its gallery/revision in one transaction, fencing activated image versions too. */
  clearDescriptions(
    changes: Array<{ expected: CaptureDescriptionSnapshot; next: string | null }>,
    operationId: string,
  ): Promise<void>
  readReceipt(
    planId: string,
    key: string,
    stage: CaptureReceipt['stage'],
  ): Promise<CaptureReceipt | null>
  receipt(receipt: CaptureReceipt): Promise<void>
}

/**
 * Requires a verified manifest reference without silently accepting a missing snapshot or image.
 * @param value Value resolved from the immutable plan.
 * @returns Present value narrowed for application.
 */
function requirePlanValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Missing capture plan reference')
  return value
}

/**
 * Applies a reviewed plan in resumable stages with readback before description cleanup.
 * @param plan Immutable reviewed plan; snapshots also provide exact restore material.
 * @param store Environment-specific fenced persistence and durable receipt adapter.
 * @returns Durable stage receipts from this execution; replay does not repeat successful mutations.
 * @remarks No remote adapter is selected implicitly. Any write/read/invalidation failure leaves prose uncleared.
 */
export async function applyCaptureExtraction(
  plan: CapturePlan,
  store: CaptureApplyStore,
): Promise<CaptureReceipt[]> {
  if (
    plan.manifestVersion !== 1 ||
    plan.id !== (await captureFingerprint(plan.snapshots))
  )
    throw new Error('Capture plan fingerprint mismatch')
  const rebuilt = await planCaptureExtraction(plan.snapshots)
  if ((await captureFingerprint(rebuilt)) !== (await captureFingerprint(plan)))
    throw new Error('Capture plan contents changed')
  const receipts: CaptureReceipt[] = []
  const record = async (receipt: CaptureReceipt): Promise<void> => {
    await store.receipt(receipt)
    receipts.push(receipt)
  }
  // Validate every cleanup source before any metadata effect, then recheck with CAS at cleanup time.
  for (const cleanup of plan.cleanup) {
    const original = requirePlanValue(
      plan.snapshots.find(
        s => s.featureId === cleanup.featureId && s.locale === cleanup.locale,
      ),
    )
    const current = await store.readSnapshot(original.featureId, original.locale)
    const prior = await store.readReceipt(
      plan.id,
      `${original.featureId}:${original.locale}`,
      'cleanup-prepared',
    )
    const replay = Boolean(prior) && current.description === cleanup.proposedAfter
    // Metadata/version changes are checked separately against the exact before/after documents.
    const normalize = (snapshot: CaptureDescriptionSnapshot): unknown => ({
      ...snapshot,
      revision: replay ? original.revision : snapshot.revision,
      images: snapshot.images.map(
        ({ metadata: _metadata, version: _version, ...image }) => image,
      ),
    })
    const expected = replay
      ? { ...original, description: cleanup.proposedAfter }
      : original
    if (
      (await captureFingerprint(normalize(current))) !==
      (await captureFingerprint(normalize(expected)))
    )
      throw new Error('Description, revision, image state or gallery changed')
  }
  const imageRows = new Map<string, CaptureProposal[]>()
  for (const row of plan.proposals) {
    if (!row.imageId || !['supported', 'no-change'].includes(row.decision)) continue
    const rows = imageRows.get(row.imageId) ?? []
    rows.push(row)
    imageRows.set(row.imageId, rows)
  }
  for (const [imageId, rows] of imageRows) {
    const original = requirePlanValue(
      plan.snapshots.find(
        s => s.featureId === rows[0].featureId && s.locale === rows[0].source.locale,
      ),
    )
    const image = requirePlanValue(original.images.find(i => i.id === imageId))
    const before = requirePlanValue(image.metadata)
    const sources = [...(before.captureSources ?? [])]
    for (const row of rows)
      if (
        !sources.some(source => JSON.stringify(source) === JSON.stringify(row.source))
      )
        sources.push(row.source)
    const next = {
      ...before,
      capture: before.capture ?? rows[0].proposedAfter,
      captureSources: sources,
    }
    const current = await store.readMetadata(image)
    const matches =
      (await captureFingerprint(current)) === (await captureFingerprint(next))
    if (!matches) {
      if ((await captureFingerprint(current)) !== (await captureFingerprint(before)))
        throw new Error(`Metadata conflict: ${imageId}`)
      await record({
        planId: plan.id,
        stage: 'prepared',
        key: imageId,
        before,
        after: next,
      })
      await store.writeMetadata(image, before, next, `${plan.id}:${imageId}`)
    }
    if (
      (await captureFingerprint(await store.readMetadata(image))) !==
      (await captureFingerprint(next))
    )
      throw new Error(`Metadata readback failed: ${imageId}`)
    await store.invalidate(imageId)
    await record({
      planId: plan.id,
      stage: 'metadata-verified',
      key: imageId,
      before,
      after: next,
    })
  }
  const cleanupByFeature = new Map<string, CapturePlan['cleanup']>()
  for (const cleanup of plan.cleanup) {
    const group = cleanupByFeature.get(cleanup.featureId) ?? []
    group.push(cleanup)
    cleanupByFeature.set(cleanup.featureId, group)
  }
  for (const [featureId, cleanups] of cleanupByFeature) {
    const changes: Array<{
      expected: CaptureDescriptionSnapshot
      next: string | null
    }> = []
    for (const cleanup of cleanups) {
      const original = requirePlanValue(
        plan.snapshots.find(
          s => s.featureId === featureId && s.locale === cleanup.locale,
        ),
      )
      // Recheck every intended document immediately before the atomic Feature/locale cleanup.
      for (const row of plan.proposals.filter(
        row =>
          row.featureId === featureId &&
          row.source.locale === original.locale &&
          row.imageId &&
          cleanup.spans.some(span => span.start === row.source.start),
      )) {
        const image = requirePlanValue(
          original.images.find(image => image.id === row.imageId),
        )
        const document = await store.readMetadata(image)
        if (
          !document.capture ||
          captureMeaning(document.capture) !== captureMeaning(row.proposedAfter) ||
          !document.captureSources?.some(
            source => JSON.stringify(source) === JSON.stringify(row.source),
          )
        )
          throw new Error('Capture metadata changed before cleanup')
      }
      const current = await store.readSnapshot(featureId, original.locale)
      if (current.description !== cleanup.proposedAfter) {
        await record({
          planId: plan.id,
          stage: 'cleanup-prepared',
          key: `${featureId}:${original.locale}`,
          before: original,
          after: cleanup.proposedAfter,
        })
        changes.push({ expected: original, next: cleanup.proposedAfter })
      }
    }
    // One Feature write token covers all locales; never advance it between locale writes.
    if (changes.length)
      await store.clearDescriptions(changes, `${plan.id}:${featureId}`)
    for (const cleanup of cleanups) {
      const original = requirePlanValue(
        plan.snapshots.find(
          s => s.featureId === featureId && s.locale === cleanup.locale,
        ),
      )
      const readback = await store.readSnapshot(featureId, cleanup.locale)
      if (readback.description !== cleanup.proposedAfter)
        throw new Error('Description cleanup readback failed')
      await record({
        planId: plan.id,
        stage: 'cleaned',
        key: `${featureId}:${cleanup.locale}`,
        before: original,
        after: cleanup.proposedAfter,
      })
    }
  }
  return receipts
}
