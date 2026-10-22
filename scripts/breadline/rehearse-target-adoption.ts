// NODE
import {
  copyFileSync,
  constants,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
// SQLITE
import { Database } from 'bun:sqlite'
// PIPELINE
import {
  applyAdoptions,
  evidenceHash,
  prepareAdoptions,
  readAdoptionReview,
  readIdentitySnapshot,
  readSourceUsers,
  targetEvidence,
} from './lib/target-adoption'
import { parseUserDecisions } from './lib/user-decisions'
import { planUsers, userPlanSql } from './lib/users'

/**
 * Rehearse reviewed target merges only in a new private directory.
 * @returns Nothing; prints aggregate verification results without identity evidence.
 * @remarks No live database, remote binding or production write option is supported.
 */
async function main(): Promise<void> {
  process.umask(0o077)
  const [reviewPath, manifestPath, outputPath] = process.argv.slice(2)
  if (!reviewPath || !manifestPath || !outputPath || process.argv.length !== 5)
    throw new Error('Expected review, manifest and new output directory')
  const review = readAdoptionReview(reviewPath, manifestPath)
  const directory = resolve(outputPath)
  mkdirSync(directory, { mode: 0o700 })
  const sourceDb = new Database(resolve(review.snapshot, 'inputs/breadline.sqlite'), {
    readonly: true,
  })
  const source = readSourceUsers(sourceDb)
  sourceDb.close()
  const seed = JSON.parse(
    readFileSync(resolve(review.snapshot, 'identity-seed.json'), 'utf8'),
  ).seed as string
  const decisions = parseUserDecisions(
    JSON.parse(readFileSync(resolve(review.snapshot, 'user-decisions.json'), 'utf8')),
  )
  const target = resolve(directory, 'rehearsal.sqlite')
  copyFileSync(
    resolve(review.snapshot, 'prepared.sqlite'),
    target,
    constants.COPYFILE_EXCL,
  )
  const db = new Database(target, { strict: true, create: false })
  try {
    const plan = prepareAdoptions(db, source, review, seed, decisions)
    writeFileSync(resolve(directory, 'plan.json'), JSON.stringify(plan, null, 2), {
      flag: 'wx',
    })
    const receipt = applyAdoptions(
      db,
      source,
      review,
      plan,
      seed,
      decisions,
      resolve(directory, 'before.sqlite'),
    )
    // The immediate exact replay is a read-only check of the complete post-state.
    if (
      targetEvidence(db, review.decisions) !== receipt.afterHash ||
      evidenceHash(review) !== plan.reviewHash
    )
      throw new Error('Post-state changed')
    const normal = planUsers(source, readIdentitySnapshot(db), seed, decisions)
    if (
      normal.users.length ||
      normal.accounts.length ||
      normal.importUsers.length ||
      normal.identities.length ||
      normal.phoneUpdates.length
    )
      db.transaction(() => db.exec(userPlanSql(normal)))()
    const replay = planUsers(source, readIdentitySnapshot(db), seed, decisions)
    if (
      replay.exceptions.length ||
      replay.users.length ||
      replay.accounts.length ||
      replay.importUsers.length ||
      replay.identities.length ||
      replay.phoneUpdates.length
    )
      throw new Error('Normal importer replay failed')
    // Independently restore the immutable before-image and verify its exact logical scope.
    const rollbackDb = new Database(resolve(directory, 'before.sqlite'), {
      readonly: true,
    })
    try {
      if (targetEvidence(rollbackDb, review.decisions) !== plan.beforeHash)
        throw new Error('Before-image rollback check failed')
    } finally {
      rollbackDb.close()
    }
    const result = {
      ...receipt,
      sourceCounts: replay.counts,
      integrity: 'ok',
      rollbackVerified: true,
      target,
      liveDatabaseChanged: false,
    }
    writeFileSync(resolve(directory, 'receipt.json'), JSON.stringify(result, null, 2), {
      flag: 'wx',
    })
    console.log(JSON.stringify(result, null, 2))
  } finally {
    db.close()
  }
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Adoption rehearsal failed')
  process.exitCode = 1
})
