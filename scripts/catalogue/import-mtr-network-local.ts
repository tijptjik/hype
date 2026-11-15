// NODE
import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
// CLOUDFLARE
import { getPlatformProxy } from 'wrangler'
// DRIZZLE
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
// VALIDATION
import { z } from 'zod'
// DOMAIN
import {
  readIdentityCatalogue,
  readIdentityCatalogueByCode,
  saveIdentityCatalogue,
} from '../../src/lib/db/services/identityCatalogue'
import { seedIdentityCatalogue } from '../../src/lib/locations/identityCatalogue'
import { retryBusyRead } from '../../src/lib/db/services/sqlite'
import { executeRevisionBatch } from '../../src/lib/db/services/revisionBatch'
import { identityCatalogueSource } from '../../src/lib/db/schema/identityCatalogue'
import { DEV_PERSONAS } from '../../src/lib/auth/dev-personas'
// TYPES
import type { Database } from '../../src/lib/types'
import type { D1Database } from '@cloudflare/workers-types'

// TABLE OF CONTENTS
// 1. Reviewed inputs and source-integrity checks
// 2. Read-only database preflight
// 3. Local publication and receipts

const DecisionSchema = z.object({
  businessKey: z.string().startsWith('mtr-business-'),
  name: z.string().min(1),
  entries: z.number().int().positive(),
  sourceRecordIds: z.array(z.string().min(1)).nonempty(),
  action: z.enum(['existing', 'create', 'review', 'service', 'skip']),
  targetId: z.string().optional(),
  canonicalName: z.string().optional(),
  reason: z.string().min(1),
})
const PlanSchema = z.object({
  sourceDirectory: z.literal('.research/mtr-shops/2026-11-14'),
  sourceManifestSha256: z.string().length(64),
  businessesSha256: z.string().length(64),
  recordsSha256: z.string().length(64),
  decisions: z.array(DecisionSchema),
})
type Decision = z.infer<typeof DecisionSchema>
const apply = process.argv.includes('--apply')
if (process.argv.slice(2).some(arg => arg !== '--apply'))
  throw new Error('Local-only importer: only --apply is supported')
const planPath = 'scripts/catalogue/mtr-network-reconciliation.json'
const planBytes = await Bun.file(planPath).text()
const plan = PlanSchema.parse(JSON.parse(planBytes))
const source = 'brand:mtr-business-label'

/** Hash exact retained input bytes before any database access.
 * @param file Input path. @returns SHA-256 hexadecimal digest.
 */
async function checksum(file: string): Promise<string> {
  return createHash('sha256')
    .update(new Uint8Array(await Bun.file(file).arrayBuffer()))
    .digest('hex')
}
/** Derive a stable public code without inventing a translation for Chinese-only labels.
 * @param name Reviewed publisher name. @param id Deterministic catalogue identity.
 * @returns ASCII catalogue code, with an opaque fallback for non-Latin names.
 */
function codeFor(name: string, id: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .replace(/-$/, '')
  return slug || `mtr-${id.slice(-24)}`
}

// Reject changed captures, incomplete plans and mismatched source memberships before writing.
for (const [file, expected] of [
  ['manifest.json', plan.sourceManifestSha256],
  ['businesses.json', plan.businessesSha256],
  ['records.ndjson', plan.recordsSha256],
]) {
  if ((await checksum(`${plan.sourceDirectory}/${file}`)) !== expected)
    throw new Error(`Source checksum changed: ${file}`)
}
const businesses = (await Bun.file(
  `${plan.sourceDirectory}/businesses.json`,
).json()) as { businessKey: string; name: string; sourceRecordIds: string[] }[]
const byKey = new Map(businesses.map(row => [row.businessKey, row]))
const seen = new Set<string>()
const records = new Map(
  (await Bun.file(`${plan.sourceDirectory}/records.ndjson`).text())
    .trim()
    .split('\n')
    .map(line => {
      const row = JSON.parse(line) as { sourceRecordId: string; sourceUrl: string }
      return [row.sourceRecordId, row] as const
    }),
)
const targets = new Map<string, Decision[]>()
for (const decision of plan.decisions) {
  const original = byKey.get(decision.businessKey)
  if (
    !original ||
    seen.has(decision.businessKey) ||
    original.name !== decision.name ||
    JSON.stringify(original.sourceRecordIds) !==
      JSON.stringify(decision.sourceRecordIds)
  )
    throw new Error(`Invalid reviewed source: ${decision.name}`)
  seen.add(decision.businessKey)
  for (const id of decision.sourceRecordIds) {
    const record = records.get(id)
    if (
      !record ||
      record.sourceUrl !==
        `https://www.mtr.com.hk/en/customer/shops/shop_search.php?id=${id}`
    )
      throw new Error(`Invalid MTR detail evidence: ${id}`)
  }
  if (['review', 'service', 'skip'].includes(decision.action)) continue
  if (!decision.targetId || !decision.canonicalName)
    throw new Error(`Missing reviewed target: ${decision.name}`)
  const cohort = targets.get(decision.targetId) ?? []
  if (
    cohort.some(
      row =>
        row.action !== decision.action || row.canonicalName !== decision.canonicalName,
    )
  )
    throw new Error(`Conflicting target decisions: ${decision.name}`)
  targets.set(decision.targetId, [...cohort, decision])
}
if (seen.size !== byKey.size)
  throw new Error('Plan does not account for every research label')

const proxy = await getPlatformProxy<{ DB: D1Database }>({
  configPath: './wrangler.local.toml',
  remoteBindings: false,
})
const db = drizzle(proxy.env.DB) as Database
const receipts: unknown[] = []
const codes = new Map<string, string>()
const output = '.research/mtr-shops/2026-11-14/hype-import'
await mkdir(output, { recursive: true })
const run = new Date().toISOString().replaceAll(':', '-')
try {
  // Preflight every identity and mapping; never silently reassign an existing source key.
  const reserved = new Set<string>()
  let missing = 0
  for (const [id, cohort] of targets) {
    const row = cohort[0]
    const current = await retryBusyRead(() => readIdentityCatalogue(db, id))
    if (current && (current.kind !== 'brand' || current.isArchived))
      throw new Error(`Target unavailable: ${id}`)
    if (row.action === 'existing' && !current)
      throw new Error(`Existing target disappeared: ${id}`)
    if (!current) missing++
    let code = current?.code ?? codeFor(row.canonicalName!, id)
    const conflict = await retryBusyRead(() =>
      readIdentityCatalogueByCode(db, 'brand', code),
    )
    if ((conflict && conflict.id !== id) || reserved.has(code))
      code = `${code.slice(0, 70)}-${id.slice(-12)}`
    if (
      !current &&
      (await retryBusyRead(() => readIdentityCatalogueByCode(db, 'brand', code)))
    )
      throw new Error(`Code conflict: ${code}`)
    reserved.add(code)
    codes.set(id, code)
    for (const item of cohort) {
      const mapped = await retryBusyRead(() =>
        db.get<{ catalogueId: string }>(
          sql`SELECT catalogueId FROM identityCatalogueSource WHERE source=${source} AND sourceId=${item.businessKey}`,
        ),
      )
      if (mapped && mapped.catalogueId !== id)
        throw new Error(`Source already linked elsewhere: ${item.name}`)
    }
  }
  console.log(
    JSON.stringify({
      apply,
      labels: seen.size,
      acceptedLabels: [...targets.values()].flat().length,
      acceptedIdentities: targets.size,
      newIdentities: missing,
      reviewLabels: plan.decisions.filter(row => row.action === 'review').length,
      serviceLabels: plan.decisions.filter(row => row.action === 'service').length,
      excludedLabels: plan.decisions.filter(row => row.action === 'skip').length,
    }),
  )

  for (const [id, cohort] of targets) {
    const row = cohort[0]
    let current = await retryBusyRead(() => readIdentityCatalogue(db, id))
    if (!current && apply) {
      const content = seedIdentityCatalogue({
        en: row.canonicalName!,
        'zh-Hant': '',
        'zh-Hans': '',
      })
      content.code = codes.get(id)!
      // Source names establish listing identity only; no parent, category, location or logo is inferred.
      content.evidence = cohort.map(item => ({
        kind: 'directory' as const,
        url: records.get(item.sourceRecordIds[0])!.sourceUrl,
        note: `MTR capture 2026-11-14: ${item.name}; ${item.entries} listings. Reviewed label ${item.businessKey}. Listing status does not establish current operation; full source IDs retained in the reconciliation manifest.`,
      }))
      current = await saveIdentityCatalogue(db, {
        id,
        kind: 'brand',
        expectedVersion: 0,
        content,
        actorId: DEV_PERSONAS.admin.id,
        guard: sql`1`,
      })
      if (!current) throw new Error(`Concurrent creation: ${id}`)
      receipts.push({
        action: 'created',
        id,
        code: current.code,
        name: row.canonicalName,
      })
    }
    for (const item of cohort) {
      if (apply) {
        const saved = await executeRevisionBatch(
          db,
          sql`EXISTS(SELECT 1 FROM identityCatalogue c JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version WHERE c.id=${id} AND c.kind='brand' AND coalesce(json_extract(r.content,'$.isArchived'),0)=0) AND NOT EXISTS(SELECT 1 FROM identityCatalogueSource WHERE source=${source} AND sourceId=${item.businessKey} AND catalogueId<>${id})`,
          [
            db
              .insert(identityCatalogueSource)
              .values({ source, sourceId: item.businessKey, catalogueId: id })
              .onConflictDoNothing(),
          ],
        )
        if (!saved) throw new Error(`Concurrent source or target change: ${item.name}`)
      }
      receipts.push({
        action: apply ? 'linked' : 'proposed',
        businessKey: item.businessKey,
        name: item.name,
        targetId: id,
        sourceRecordIds: item.sourceRecordIds,
      })
    }
  }
  console.log(
    `Completed ${apply ? 'local import' : 'dry run'}; ${receipts.filter(row => (row as { action: string }).action === 'created').length} created.`,
  )
} finally {
  await Bun.write(
    `${output}/${run}-${apply ? 'apply' : 'dry-run'}.json`,
    JSON.stringify(
      {
        apply,
        planSha256: createHash('sha256').update(planBytes).digest('hex'),
        receipts,
      },
      null,
      2,
    ) + '\n',
  )
  await Bun.write(
    `${output}/review.json`,
    JSON.stringify(
      plan.decisions.filter(row => row.action === 'review'),
      null,
      2,
    ) + '\n',
  )
  await proxy.dispose()
}
