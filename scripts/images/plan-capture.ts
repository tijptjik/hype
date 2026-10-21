// NODE
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
// IMAGES
import { planCaptureExtraction, type CaptureDescriptionSnapshot } from '../../src/lib/images/capture-extraction.js'

const [input, directory] = process.argv.slice(2)
if (!input || !directory) throw new Error('Usage: bun scripts/images/plan-capture.ts SNAPSHOTS.json PRIVATE_OUTPUT_DIRECTORY')
const snapshots = await Bun.file(input).json() as CaptureDescriptionSnapshot[]
const plan = await planCaptureExtraction(snapshots)
await mkdir(directory, { recursive: true })
await Bun.write(resolve(directory, 'plan.json'), JSON.stringify(plan, null, 2) + '\n')
await Bun.write(resolve(directory, 'proposals.jsonl'), plan.proposals.map(row => JSON.stringify(row)).join('\n') + (plan.proposals.length ? '\n' : ''))
await Bun.write(resolve(directory, 'unresolved.jsonl'), plan.unresolved.map(row => JSON.stringify(row)).join('\n') + (plan.unresolved.length ? '\n' : ''))
await Bun.write(resolve(directory, 'restore.json'), JSON.stringify(plan.snapshots, null, 2) + '\n')
console.log(JSON.stringify({ planId: plan.id, descriptions: snapshots.length, proposals: plan.proposals.length,
  decisions: Object.fromEntries(['supported', 'no-change', 'unresolved', 'conflict'].map(key => [key, plan.proposals.filter(row => row.decision === key).length])),
  unsupportedWording: plan.unresolved.length, cleanup: plan.cleanup.length }, null, 2))
