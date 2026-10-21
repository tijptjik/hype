// NODE
import { mkdir, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
// IMAGES
import {
  applyCaptureExtraction, captureFingerprint, type CaptureApplyStore,
  type CaptureDescriptionSnapshot, type CapturePlan, type CaptureReceipt,
} from '../../src/lib/images/capture-extraction.js'
import type { ImageMetadataDocument } from '../../src/lib/images/storage.js'

type RehearsalState = {
  planId: string
  snapshots: CaptureDescriptionSnapshot[]
  documents: Record<string, ImageMetadataDocument>
  receipts: CaptureReceipt[]
  metadataWrites: number
  descriptionWrites: number
  invalidatedImageIds: string[]
}

const [input, directory] = process.argv.slice(2)
if (!input || !directory) throw new Error('Usage: bun scripts/images/rehearse-capture.ts PLAN.json PRIVATE_REHEARSAL_DIRECTORY')
const plan = await Bun.file(input).json() as CapturePlan
await mkdir(directory, { recursive: true })
const statePath = resolve(directory, 'state.json')
const state: RehearsalState = await Bun.file(statePath).exists()
  ? await Bun.file(statePath).json()
  : {
    planId: plan.id, snapshots: structuredClone(plan.snapshots),
    documents: Object.fromEntries(plan.snapshots.flatMap(s => s.images.filter(i => i.metadata).map(i => [i.id, i.metadata!]))),
    receipts: [], metadataWrites: 0, descriptionWrites: 0, invalidatedImageIds: [],
  }
if (state.planId !== plan.id) throw new Error('Rehearsal directory belongs to another plan')
/**
 * Atomically saves the private rehearsal state after each receipt or simulated mutation.
 * @returns Nothing.
 * @remarks This adapter modifies JSON rehearsal files only; it never contacts D1, R2 or an application server.
 */
async function save(): Promise<void> {
  await Bun.write(statePath + '.tmp', JSON.stringify(state, null, 2) + '\n')
  await rename(statePath + '.tmp', statePath)
}
const store: CaptureApplyStore = {
  async readSnapshot(featureId, locale) {
    const snapshot = state.snapshots.find(s => s.featureId === featureId && s.locale === locale)
    if (!snapshot) throw new Error('Missing rehearsal snapshot')
    return structuredClone(snapshot)
  },
  async readMetadata(image) {
    const document = state.documents[image.id]
    if (!document) throw new Error('Missing rehearsal metadata')
    return structuredClone(document)
  },
  async writeMetadata(image, expected, next) {
    if (await captureFingerprint(state.documents[image.id]) !== await captureFingerprint(expected)) throw new Error('Rehearsal metadata CAS conflict')
    state.documents[image.id] = structuredClone(next)
    for (const snapshot of state.snapshots) for (const item of snapshot.images) if (item.id === image.id) {
      item.metadata = structuredClone(next); item.version = (item.version ?? 0) + 1
    }
    state.metadataWrites++
    await save()
  },
  async invalidate(imageId) {
    if (!state.invalidatedImageIds.includes(imageId)) state.invalidatedImageIds.push(imageId)
    await save()
  },
  async clearDescriptions(changes) {
    for (const { expected } of changes) {
      const current = state.snapshots.find(s => s.featureId === expected.featureId && s.locale === expected.locale)!
      const before = { ...current, images: expected.images }
      if (await captureFingerprint(before) !== await captureFingerprint(expected)) throw new Error('Rehearsal description/gallery CAS conflict')
    }
    for (const { expected, next } of changes) {
      const current = state.snapshots.find(s => s.featureId === expected.featureId && s.locale === expected.locale)!
      current.description = next; state.descriptionWrites++
    }
    for (const current of state.snapshots.filter(s => s.featureId === changes[0].expected.featureId)) current.revision = `capture-cleanup:${plan.id}`
    await save()
  },
  async readReceipt(planId, key, stage) {
    return state.receipts.find(r => r.planId === planId && r.key === key && r.stage === stage) ?? null
  },
  async receipt(receipt) { state.receipts.push(structuredClone(receipt)); await save() },
}
await Bun.write(resolve(directory, 'restore.json'), JSON.stringify(plan.snapshots, null, 2) + '\n')
await save()
const before = { metadataWrites: state.metadataWrites, descriptionWrites: state.descriptionWrites }
await applyCaptureExtraction(plan, store)
await Bun.write(resolve(directory, 'receipts.jsonl'), state.receipts.map(r => JSON.stringify(r)).join('\n') + (state.receipts.length ? '\n' : ''))
console.log(JSON.stringify({ planId: plan.id, before,
  after: { metadataWrites: state.metadataWrites, descriptionWrites: state.descriptionWrites },
  unresolved: plan.proposals.filter(p => ['conflict', 'unresolved'].includes(p.decision)).length,
  cleanupProposals: plan.cleanup.length, restore: resolve(directory, 'restore.json'),
}, null, 2))
