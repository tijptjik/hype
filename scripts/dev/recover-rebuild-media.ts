// NODE
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
// VALIDATION
import { z } from 'zod'
// REVISIONS
import { cacheRevisionMedia } from '../revisions/cache-media'
import { enrollLegacyRevisions } from '../revisions/enroll'

export const RebuildRecoveryManifestSchema = z.strictObject({
  version: z.literal(1),
  recoveries: z
    .array(
      z.strictObject({
        featureIds: z.array(z.string().min(1)).min(1),
        reason: z.string().min(1),
        priorReceipt: z.string().min(1),
      }),
    )
    .min(1),
})

/** Verify retained recovery evidence before enrolling it in a private rebuild.
 * @param database Private rebuild database; never a remote binding.
 * @param directory Private receipt directory.
 * @param manifestPath Explicitly approved manifest of exact prior recovery receipts.
 * @returns Number of verified recovery cohorts.
 * @remarks Missing or changed locators, bytes or metadata abort before enrollment.
 */
export async function recoverRebuildMedia(
  database: string,
  directory: string,
  manifestPath: string,
): Promise<number> {
  const manifest = RebuildRecoveryManifestSchema.parse(
    JSON.parse(readFileSync(manifestPath, 'utf8')),
  )
  for (const [index, recovery] of manifest.recoveries.entries()) {
    const options = {
      featureIds: recovery.featureIds,
      emptyMetadataReason: recovery.reason,
    }
    const cache = resolve(directory, 'verified-recovery', String(index))
    const prior = JSON.parse(readFileSync(resolve(recovery.priorReceipt), 'utf8'))
    const result = await cacheRevisionMedia(database, cache, options)
    assert.equal(result.blocked, 0, 'Recovery still has unavailable source evidence')
    const fresh = JSON.parse(readFileSync(resolve(cache, 'receipt.json'), 'utf8'))
    assert.equal(
      fresh.evidence.length,
      prior.evidence.length,
      'Recovery cohort changed',
    )
    assert.deepEqual(
      fresh.evidence.map((row: { locator: { id: string } }) => row.locator.id).sort(),
      prior.evidence.map((row: { locator: { id: string } }) => row.locator.id).sort(),
      'Recovery membership changed',
    )
    for (const row of fresh.evidence) {
      const old = prior.evidence.find(
        (item: { locator: { id: string } }) => item.locator.id === row.locator.id,
      )
      assert.ok(old && old.status === 'verified', 'No verified prior recovery')
      for (const field of ['id', 'env', 'publicId', 'version'])
        assert.equal(
          row.locator[field],
          old.locator[field],
          `Recovery locator changed: ${field}`,
        )
      assert.equal(row.contentHash, old.contentHash, 'Original image bytes changed')
      assert.equal(row.metadataHash, old.metadataHash, 'Recovered metadata changed')
    }
    const enrolled = await enrollLegacyRevisions(
      database,
      cache,
      resolve(cache, 'enrollment.json'),
      undefined,
      options,
    )
    assert.equal(enrolled.blocked, 0, 'Recovery enrollment incomplete')
  }
  writeFileSync(
    resolve(directory, 'approved-media-recovery.json'),
    JSON.stringify(manifest, null, 2),
    { mode: 0o600 },
  )
  return manifest.recoveries.length
}
