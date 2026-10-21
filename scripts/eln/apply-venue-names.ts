// NODE
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
// VALIDATION
import { z } from 'zod'
// DATABASE
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { listLocationResources } from '../../src/lib/db/services/locationDirectory'
import { updateLocalLocationAddress } from '../../src/lib/db/services/locationLocal'
// VALIDATION
import { LocationNamesEditSchema } from '../../src/lib/locations/validation'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. GUARDED LOCAL APPLICATION
// 2. COMMAND LINE
// ---

const proposalSchema = z.object({
  featureId: z.string().min(1),
  locationId: z.string().min(1),
  organisationId: z.string().min(1),
  expectedRevisionId: z.string().min(1),
  expectedOrganisationRevision: z.string().nullable(),
  expectedBefore: LocationNamesEditSchema,
  proposedAfter: LocationNamesEditSchema,
  decision: z.enum(['supported', 'no-change', 'conflict', 'unresolved']),
})
type Proposal = z.infer<typeof proposalSchema>

/** Compare complete locale maps independently of property order.
 * @param value Retained names. @returns Stable serialized value.
 */
function namesKey(value: Record<string, string>): string {
  return JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
}

/** Apply a reviewed ELN name plan to an explicitly selected local SQLite database.
 * @param database Existing local database or rehearsal copy. @param proposals Reviewed manifest rows.
 * @param receiptPath Durable private receipt, updated after each saved Location. @param apply False for validation only.
 * @returns Counts and resulting immutable revision tokens.
 * @remarks No remote binding, Feature translation write or source-payload mutation occurs. Back up the database before application.
 */
export async function applyVenueNames(
  database: string,
  proposals: Proposal[],
  receiptPath: string,
  apply = false,
): Promise<Record<string, unknown>> {
  const domain = openSqliteDomain(database)
  const receipts: Record<string, unknown>[] = []
  const result = {
    database,
    apply,
    planned: 0,
    alreadyCorrect: 0,
    applied: 0,
    receipts,
  }
  await mkdir(dirname(receiptPath), { recursive: true })
  try {
    const unique = new Map<string, Proposal>()
    const featureTranslations = JSON.stringify(
      domain.sqlite.query('SELECT * FROM featureI18n ORDER BY featureId,locale').all(),
    )
    const associations = JSON.stringify(
      domain.sqlite.query('SELECT * FROM featureLocation ORDER BY featureId').all(),
    )
    // Validate the complete target set before writing the first revision; reject scope, identity and editorial drift.
    for (const input of proposals) {
      if (input.decision !== 'supported' && input.decision !== 'no-change') continue
      const scope = domain.sqlite
        .query(
          `SELECT f.organisationId,fl.locationId FROM feature f JOIN featureLocation fl ON fl.featureId=f.id JOIN project p ON p.id=f.projectId JOIN organisation o ON o.id=p.organisationId WHERE f.id=? AND p.code='eln' AND o.code='eunic'`,
        )
        .get(input.featureId) as { organisationId: string; locationId: string } | null
      if (
        scope?.organisationId !== input.organisationId ||
        scope?.locationId !== input.locationId
      )
        throw new Error(`ELN scope changed: ${input.featureId}`)
      const earlier = unique.get(input.locationId)
      if (earlier && namesKey(earlier.proposedAfter) !== namesKey(input.proposedAfter))
        throw new Error(`Shared Location name conflict: ${input.locationId}`)
      const resource = (
        await listLocationResources(domain.db, {
          id: input.locationId,
          organisationId: input.organisationId,
        })
      ).data[0]
      if (!resource?.facts || resource.state === 'redirect')
        throw new Error(`Location unavailable: ${input.locationId}`)
      if (
        namesKey(resource.facts.names) !== namesKey(input.proposedAfter) &&
        (resource.revisionId !== input.expectedRevisionId ||
          (resource.organisationRevision ?? null) !==
            input.expectedOrganisationRevision ||
          namesKey(resource.facts.names) !== namesKey(input.expectedBefore))
      )
        throw new Error(`Stale venue name: ${input.locationId}`)
      unique.set(input.locationId, input)
    }
    for (const input of unique.values()) {
      const before = (
        await listLocationResources(domain.db, {
          id: input.locationId,
          organisationId: input.organisationId,
        })
      ).data[0]
      if (!before.facts) throw new Error('Missing validated Location')
      if (namesKey(before.facts.names) === namesKey(input.proposedAfter)) {
        result.alreadyCorrect++
        continue
      }
      result.planned++
      if (!apply) continue
      const saved = await updateLocalLocationAddress(domain.db, {
        locationId: input.locationId,
        organisationId: input.organisationId,
        expectedRevisionId: input.expectedRevisionId,
        expectedOrganisationRevision: input.expectedOrganisationRevision,
        names: input.proposedAfter,
        actorId: 'eln-venue-name-correction',
      })
      if (!saved) throw new Error(`Venue save conflict: ${input.locationId}`)
      const after = (
        await listLocationResources(domain.db, {
          id: input.locationId,
          organisationId: input.organisationId,
        })
      ).data[0]
      if (!after.facts || namesKey(after.facts.names) !== namesKey(input.proposedAfter))
        throw new Error(`Venue readback failed: ${input.locationId}`)
      if (
        JSON.stringify({ ...before.facts, names: {} }) !==
          JSON.stringify({ ...after.facts, names: {} }) ||
        before.kind !== after.kind
      )
        throw new Error(`Unrelated Location facts changed: ${input.locationId}`)
      result.applied++
      receipts.push({
        locationId: input.locationId,
        beforeRevisionId: before.revisionId,
        beforeOrganisationRevision: before.organisationRevision,
        namesBefore: before.facts.names,
        ...saved,
      })
      await writeFile(receiptPath, JSON.stringify(result, null, 2) + '\n', {
        mode: 0o600,
      })
    }
    if (
      JSON.stringify(
        domain.sqlite
          .query('SELECT * FROM featureI18n ORDER BY featureId,locale')
          .all(),
      ) !== featureTranslations ||
      JSON.stringify(
        domain.sqlite.query('SELECT * FROM featureLocation ORDER BY featureId').all(),
      ) !== associations
    )
      throw new Error('Feature title or association changed during venue application')
    if (domain.sqlite.query('PRAGMA foreign_key_check').all().length)
      throw new Error('Foreign-key violation after name application')
    await writeFile(receiptPath, JSON.stringify(result, null, 2) + '\n', {
      mode: 0o600,
    })
    return result
  } finally {
    domain.close()
  }
}

if (import.meta.main) {
  const [database, manifest, receipt, mode] = process.argv.slice(2)
  if (!database || !manifest || !receipt || (mode && mode !== '--apply'))
    throw new Error(
      'Usage: bun scripts/eln/apply-venue-names.ts LOCAL.sqlite MANIFEST.jsonl RECEIPT.json [--apply]',
    )
  const proposals = (await Bun.file(manifest).text())
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => proposalSchema.parse(JSON.parse(line)))
  const result = await applyVenueNames(database, proposals, receipt, mode === '--apply')
  console.log(JSON.stringify({ ...result, receipts: undefined }))
}
