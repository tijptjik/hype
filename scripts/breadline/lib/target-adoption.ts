// NODE
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
// SQLITE
import { Database, type SQLQueryBindings } from 'bun:sqlite'
// PIPELINE
import {
  normalizedEmail,
  normalizeTelephone,
  planUsers,
  titleCaseImportedName,
  type LegacyUser,
  type TargetIdentitySnapshot,
} from './users'
import type { UserDecisions } from './user-decisions'
import {
  strongestOrganisationRole,
  ORGANISATION_ROLE_LEVEL,
  type OrganisationRoleGrants,
} from '../../../src/lib/roles/organisation'

// +++ Table Of Contents
// 1. PRIVATE REVIEW AND INVENTORY
// 2. GUARDED MERGE AND ADOPTION
// ---

type Row = Record<string, SQLQueryBindings>
interface Reference {
  table: string
  column: string
  primaryKey: string[]
}
export interface AdoptionDecision {
  caseId: string
  sourceUserIds: number[]
  anchorHypeUserId: string
  scope: 'target_adoption' | 'merge_all_source_and_hype_candidates'
  hypeUserIds?: string[]
  requestedName?: string
}
export interface AdoptionReview {
  snapshot: string
  manifestSha256: string
  decisions: AdoptionDecision[]
}
interface ManifestCase {
  caseId: string
  sourceUserIds: number[]
  candidates: Array<{ id: string }>
}
export interface AdoptionPlan {
  version: 1
  reviewHash: string
  sourceHash: string
  seedHash: string
  sourceDecisionsHash: string
  beforeHash: string
  decisions: AdoptionDecision[]
}

/**
 * Hash private evidence without putting its values into logs.
 * @param value JSON-serializable private evidence.
 * @returns SHA-256 digest.
 */
export function evidenceHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/**
 * Quote a schema-derived SQLite identifier.
 * @param value Identifier from schema introspection.
 * @returns Escaped SQL identifier.
 */
function quote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

/**
 * Return schema tables, excluding SQLite internals and FTS shadow/cache storage.
 * @param db Offline SQLite connection.
 * @returns Sorted application table names.
 */
function tables(db: Database): string[] {
  return db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'featureSearchFts%' ORDER BY name",
    )
    .all()
    .map(row => row.name)
}

/**
 * Discover every declared user reference plus reviewed unconstrained references.
 * @param db Offline SQLite connection.
 * @returns Reference columns and their row keys.
 */
export function userReferences(db: Database): Reference[] {
  const result: Reference[] = []
  for (const table of tables(db)) {
    const columns = db
      .query<{ name: string; pk: number }, []>(`PRAGMA table_info(${quote(table)})`)
      .all()
    const primaryKey = columns
      .filter(c => c.pk)
      .sort((a, b) => a.pk - b.pk)
      .map(c => c.name)
    const references = db
      .query<{ table: string; from: string; to: string }, []>(
        `PRAGMA foreign_key_list(${quote(table)})`,
      )
      .all()
    const names = new Set(
      references
        .filter(ref => ref.table === 'user' && ref.to === 'id')
        .map(ref => ref.from),
    )
    // These historical/application references intentionally have no user foreign key.
    for (const column of columns) {
      if (
        ['userId', 'actorId', 'contributorId', 'publisherId', 'reviewerId'].includes(
          column.name,
        )
      )
        names.add(column.name)
    }
    for (const column of [...names].sort()) {
      if (!primaryKey.length) throw new Error(`Unkeyed user-reference table: ${table}`)
      result.push({ table, column, primaryKey })
    }
  }
  return result
}

/**
 * Read the exact fields consumed by the normal importer.
 * @param db Offline SQLite connection.
 * @returns Identity and private crosswalk snapshot.
 */
export function readIdentitySnapshot(db: Database): TargetIdentitySnapshot {
  return {
    users: db
      .query(
        'SELECT id,email,username,emailVerified,isArchived,isAnonymous,telephone FROM user ORDER BY id',
      )
      .all(),
    accounts: db
      .query('SELECT id,userId,providerId,accountId FROM account ORDER BY id')
      .all(),
    importUsers: db
      .query(
        'SELECT userId,telephone,state,claimedEmail FROM breadlineImportUser ORDER BY userId',
      )
      .all(),
    identities: db
      .query(
        'SELECT sourceUserId,sourceVolunteerId,userId,email,name,sourceUid FROM breadlineImportIdentity ORDER BY sourceUserId',
      )
      .all(),
  } as TargetIdentitySnapshot
}

/**
 * Read immutable source records without credentials or tokens.
 * @param db Read-only source mirror.
 * @returns Source rows ordered by source ID.
 */
export function readSourceUsers(db: Database): LegacyUser[] {
  return db
    .query(
      'SELECT id,volunteer_id,uid,email,name,telephone,locale,picture,created_at,last_updated_at FROM breadline__public__users ORDER BY id',
    )
    .all() as LegacyUser[]
}

/**
 * Return all explicitly approved existing owners, including each anchor.
 * @param decisions Reviewed adoption decisions.
 * @returns Sorted unique target owner IDs.
 */
function approvedOwners(decisions: AdoptionDecision[]): string[] {
  return [
    ...new Set(decisions.flatMap(d => d.hypeUserIds ?? [d.anchorHypeUserId])),
  ].sort()
}

/**
 * Fingerprint complete affected rows, including credentials, permissions and history.
 * @param db Offline SQLite connection.
 * @param decisions Reviewed adoption decisions.
 * @returns Hash of full affected-row evidence.
 */
export function targetEvidence(db: Database, decisions: AdoptionDecision[]): string {
  const ids = approvedOwners(decisions)
  const references = userReferences(db)
  const evidence: unknown[] = [references]
  for (const id of ids) evidence.push(db.query('SELECT * FROM user WHERE id=?').get(id))
  for (const ref of references) {
    const rows = ids.flatMap(id =>
      db
        .query<Row, [string]>(
          `SELECT * FROM ${quote(ref.table)} WHERE ${quote(ref.column)}=? ORDER BY ${ref.primaryKey.map(quote).join(',')}`,
        )
        .all(id),
    )
    evidence.push([ref.table, ref.column, rows])
  }
  return evidenceHash(evidence)
}

/**
 * Pin reviewed identity and authorization across different offline rebuild stages.
 * @param db Pinned or newly prepared target database.
 * @param decisions Reviewed anchors and absorbed identities.
 * @returns Hash of complete users, credentials, roles and persisted import ownership.
 * @remarks Content is fenced separately by the apply plan's complete affected-row hash.
 */
function identityAuthorityEvidence(
  db: Database,
  decisions: AdoptionDecision[],
): string {
  const ids = approvedOwners(decisions)
  const evidence: unknown[] = ids.map(id =>
    db.query('SELECT * FROM user WHERE id=?').get(id),
  )
  for (const ref of userReferences(db).filter(ref =>
    [
      'account',
      'passkey',
      'session',
      'hubRole',
      'organisationRole',
      'projectRole',
      'breadlineImportUser',
      'breadlineImportIdentity',
    ].includes(ref.table),
  )) {
    evidence.push([
      ref.table,
      ids.flatMap(id =>
        db
          .query(
            `SELECT * FROM ${quote(ref.table)} WHERE ${quote(ref.column)}=? ORDER BY ${ref.primaryKey.map(quote).join(',')}`,
          )
          .all(id),
      ),
    ])
  }
  return evidenceHash(evidence)
}

/**
 * Validate private operator decisions against the immutable reviewed case manifest.
 * @param reviewPath Private operator decision JSON.
 * @param manifestPath Original reviewed case manifest.
 * @returns Validated review, or throws on changed or incomplete evidence.
 */
export function readAdoptionReview(
  reviewPath: string,
  manifestPath: string,
): AdoptionReview {
  const review = JSON.parse(readFileSync(reviewPath, 'utf8')) as AdoptionReview
  const raw = readFileSync(manifestPath)
  if (createHash('sha256').update(raw).digest('hex') !== review.manifestSha256)
    throw new Error('Reviewed manifest changed')
  const cases = raw
    .toString()
    .trim()
    .split('\n')
    .map(line => JSON.parse(line) as ManifestCase)
  const sourceIds = new Set<number>(),
    ownerIds = new Set<string>(),
    caseIds = new Set<string>()
  if (!Array.isArray(review.decisions) || !review.decisions.length)
    throw new Error('Missing adoption review')
  for (const decision of review.decisions) {
    const cohort = cases.find(c => c.caseId === decision.caseId)
    if (
      !cohort ||
      caseIds.has(decision.caseId) ||
      JSON.stringify(cohort.sourceUserIds) !== JSON.stringify(decision.sourceUserIds)
    )
      throw new Error('Invalid reviewed cohort')
    caseIds.add(decision.caseId)
    if (!cohort.candidates.some(c => c.id === decision.anchorHypeUserId))
      throw new Error('Unreviewed anchor')
    const expected = cohort.candidates.map(c => c.id).sort()
    const actual = approvedOwners([decision])
    if (
      JSON.stringify(expected) !== JSON.stringify(actual) ||
      (actual.length > 1 &&
        decision.scope !== 'merge_all_source_and_hype_candidates') ||
      !['target_adoption', 'merge_all_source_and_hype_candidates'].includes(
        decision.scope,
      )
    )
      throw new Error('Incomplete target-owner adjudication')
    if (
      decision.requestedName !== undefined &&
      (typeof decision.requestedName !== 'string' || !decision.requestedName.trim())
    )
      throw new Error('Invalid reviewed name')
    for (const id of decision.sourceUserIds) {
      if (sourceIds.has(id)) throw new Error('Overlapping source decisions')
      sourceIds.add(id)
    }
    for (const id of actual) {
      if (ownerIds.has(id)) throw new Error('Overlapping target decisions')
      ownerIds.add(id)
    }
  }
  return review
}

/**
 * Prepare a plan pinned to complete source cohorts and affected target before-images.
 * @param db Offline target connection.
 * @param source Pinned source rows.
 * @param review Validated operator review.
 * @param seed Retained target seed.
 * @param decisions Existing source decisions.
 * @returns Immutable adoption fences; performs no writes.
 */
export function prepareAdoptions(
  db: Database,
  source: LegacyUser[],
  review: AdoptionReview,
  seed: string,
  decisions: UserDecisions,
): AdoptionPlan {
  const normal = planUsers(source, readIdentitySnapshot(db), seed, decisions)
  for (const decision of review.decisions) {
    if (
      !normal.exceptions.some(
        e =>
          e.reason === 'conflicting_target_identities' &&
          JSON.stringify(e.sourceUserIds) === JSON.stringify(decision.sourceUserIds),
      )
    )
      throw new Error('Reviewed source cohort or target collision changed')
  }
  return {
    version: 1,
    reviewHash: evidenceHash(review),
    sourceHash: evidenceHash(source),
    seedHash: evidenceHash(seed),
    sourceDecisionsHash: evidenceHash(decisions),
    beforeHash: targetEvidence(db, review.decisions),
    decisions: review.decisions,
  }
}

/**
 * Fetch a row by its schema-derived primary key.
 * @param db Offline target connection.
 * @param ref Table and row-key metadata.
 * @param row Values containing the key.
 * @returns Matching row, or null.
 */
function keyedRow(db: Database, ref: Reference, row: Row): Row | null {
  return db
    .query<Row, SQLQueryBindings[]>(
      `SELECT * FROM ${quote(ref.table)} WHERE ${ref.primaryKey.map(k => `${quote(k)} IS ?`).join(' AND ')}`,
    )
    .get(...ref.primaryKey.map(k => row[k]))
}

/**
 * Update exactly one row without REPLACE, cascaded deletion or ignored conflicts.
 * @param db Offline target connection.
 * @param ref Table and row-key metadata.
 * @param before Existing row.
 * @param after Proposed row.
 * @returns Nothing; throws if the original row is absent.
 */
function updateRow(db: Database, ref: Reference, before: Row, after: Row): void {
  const changed = Object.keys(after).filter(k => after[k] !== before[k])
  if (!changed.length) return
  db.query(
    `UPDATE ${quote(ref.table)} SET ${changed.map(k => `${quote(k)}=?`).join(',')} WHERE ${ref.primaryKey.map(k => `${quote(k)} IS ?`).join(' AND ')}`,
  ).run(...changed.map(k => after[k]), ...ref.primaryKey.map(k => before[k]))
  if ((db.query('SELECT changes() AS n').get() as { n: number }).n !== 1)
    throw new Error(`Reference update lost its row: ${ref.table}`)
}

/**
 * Coalesce identical membership records; retain an existing organisation owner role.
 * @param ref Table and row-key metadata.
 * @param retained Existing anchor row.
 * @param moved Incoming row after owner substitution.
 * @returns Lossless combined row; otherwise throws for adjudication.
 */
function coalesce(ref: Reference, retained: Row, moved: Row): Row {
  if (evidenceHash(retained) === evidenceHash(moved)) return retained
  if (ref.table === 'organisationRole') {
    // Preserve every independent grant and take the stronger level for shared sources.
    if ('grant' in retained && 'grant' in moved) {
      const grants = JSON.parse(String(retained.grant)) as OrganisationRoleGrants
      for (const [source, level] of Object.entries(
        JSON.parse(String(moved.grant)) as OrganisationRoleGrants,
      )) {
        if (
          !grants[source] ||
          ORGANISATION_ROLE_LEVEL[level] > ORGANISATION_ROLE_LEVEL[grants[source]]
        )
          grants[source] = level
      }
      if (
        evidenceHash({ ...retained, role: null, grant: null }) !==
        evidenceHash({ ...moved, role: null, grant: null })
      )
        throw new Error('Conflicting organisation membership fields')
      return {
        ...retained,
        role: strongestOrganisationRole(grants),
        grant: JSON.stringify(grants),
      }
    }
    // Older offline fixtures predate grant provenance; preserve their strongest staff role.
    if (
      ['owner', 'member'].includes(String(retained.role)) &&
      ['owner', 'member'].includes(String(moved.role)) &&
      evidenceHash({ ...retained, role: null }) ===
        evidenceHash({ ...moved, role: null })
    ) {
      return {
        ...retained,
        role: retained.role === 'owner' || moved.role === 'owner' ? 'owner' : 'member',
      }
    }
  }
  // A cache revision has no user content; advance beyond both invalidation counters.
  if (ref.table === 'featureCountUserRevision')
    return {
      ...retained,
      revision: Math.max(Number(retained.revision), Number(moved.revision)) + 1,
    }
  throw new Error(`Conflicting merge rows require explicit resolution: ${ref.table}`)
}

/**
 * Move all user references and fail on ambiguous content or permission collisions.
 * @param db Offline target connection inside the apply transaction.
 * @param loser Explicitly approved absorbed owner.
 * @param anchor Retained owner.
 * @param references Complete discovered reference inventory.
 * @returns Nothing; throws on unhandled references or conflicts.
 */
function mergeOwner(
  db: Database,
  loser: string,
  anchor: string,
  references: Reference[],
): void {
  for (const ref of [...references].sort(
    (a, b) =>
      Number(a.table === 'featureCountUserRevision') -
      Number(b.table === 'featureCountUserRevision'),
  )) {
    const rows = db
      .query<Row, [string]>(
        `SELECT * FROM ${quote(ref.table)} WHERE ${quote(ref.column)}=?`,
      )
      .all(loser)
    for (const before of rows) {
      const after = { ...before, [ref.column]: anchor }
      const collision = ref.primaryKey.includes(ref.column)
        ? keyedRow(db, ref, after)
        : null
      if (collision) {
        updateRow(db, ref, collision, coalesce(ref, collision, after))
        db.query(
          `DELETE FROM ${quote(ref.table)} WHERE ${ref.primaryKey.map(k => `${quote(k)} IS ?`).join(' AND ')}`,
        ).run(...ref.primaryKey.map(k => before[k]))
      } else updateRow(db, ref, before, after)
    }
  }
  // Unknown plain-text/JSON references must not become dangling history.
  for (const table of tables(db)) {
    if (table === 'user') continue
    const columns = db
      .query<{ name: string; type: string }, []>(`PRAGMA table_info(${quote(table)})`)
      .all()
    for (const column of columns.filter(c => c.type.toLowerCase() === 'text')) {
      // Provider account identifiers are credential keys, not HYPE ownership references.
      if (table === 'account' && column.name === 'accountId') continue
      if (
        db
          .query(
            `SELECT 1 FROM ${quote(table)} WHERE instr(${quote(column.name)},?)>0 LIMIT 1`,
          )
          .get(loser)
      )
        throw new Error(`Unresolved embedded user reference: ${table}.${column.name}`)
    }
  }
  db.query('DELETE FROM user WHERE id=?').run(loser)
}

/**
 * Atomically apply reviewed identities to an offline database with exact before-state checks.
 * @param db Disposable/rebuild SQLite destination, never a running D1 binding.
 * @param source Immutable source rows.
 * @param review Current operator-reviewed decisions; changes invalidate the plan.
 * @param plan Pinned prepared adoption plan.
 * @param seed Existing target seed, never regenerated.
 * @param decisions Existing source decisions.
 * @param backupPath Exclusive private before-image path.
 * @returns Aggregate receipt with an exact post-state fingerprint for replay checks.
 * @remarks Existing credentials and roles move with the approved identity. No source roles are imported.
 */
export function applyAdoptions(
  db: Database,
  source: LegacyUser[],
  review: AdoptionReview,
  plan: AdoptionPlan,
  seed: string,
  decisions: UserDecisions,
  backupPath: string,
): { cohorts: number; sourceRows: number; mergedUsers: number; afterHash: string } {
  db.exec('PRAGMA foreign_keys=ON')
  return db
    .transaction(() => {
      if (
        plan.version !== 1 ||
        plan.reviewHash !== evidenceHash(review) ||
        evidenceHash(plan.decisions) !== evidenceHash(review.decisions) ||
        plan.sourceHash !== evidenceHash(source) ||
        plan.seedHash !== evidenceHash(seed) ||
        plan.sourceDecisionsHash !== evidenceHash(decisions) ||
        plan.beforeHash !== targetEvidence(db, review.decisions)
      )
        throw new Error('Stale adoption plan')
      // Revalidate grouping, identifier owners, archive state and latent/claimed ownership under the write lock.
      prepareAdoptions(db, source, review, seed, decisions)
      // Adoption must use the same reviewed phone corrections and grouping as normal import.
      const canonical = planUsers(source, { users: [], accounts: [] }, seed, decisions)
      const references = userReferences(db)
      for (const id of approvedOwners(review.decisions)) {
        const user = db.query<Row, [string]>('SELECT * FROM user WHERE id=?').get(id)
        if (
          !user ||
          user.isArchived ||
          user.isAnonymous ||
          !normalizedEmail(user.email as string | null)
        )
          throw new Error('Anchor/member is archived, anonymous or email-less')
        if (
          db.query('SELECT 1 FROM breadlineImportUser WHERE userId=?').get(id) ||
          db.query('SELECT 1 FROM breadlineImportIdentity WHERE userId=?').get(id)
        )
          throw new Error('Existing import ownership requires separate review')
      }
      // The full SQLite before-image preserves tokens and history privately, without logging them.
      writeFileSync(backupPath, db.serialize(), { mode: 0o400, flag: 'wx' })
      let mergedUsers = 0
      for (const decision of review.decisions) {
        const anchor = decision.anchorHypeUserId
        const members = approvedOwners([decision])
        const rows = source.filter(row => decision.sourceUserIds.includes(row.id))
        const canonicalOwners = new Set(
          canonical.identities
            .filter(row => decision.sourceUserIds.includes(row.sourceUserId))
            .map(row => row.userId),
        )
        if (canonicalOwners.size !== 1)
          throw new Error('Adoption spans multiple reviewed identities')
        const canonicalOwner = canonical.users.find(row => canonicalOwners.has(row.id))
        if (!canonicalOwner) throw new Error('Reviewed adoption identity is missing')
        const phone = canonicalOwner.telephone
        // Validate every candidate's current phone and every colliding identifier, including non-Google emails.
        for (const user of db
          .query<Row, []>('SELECT id,email,telephone FROM user')
          .all()) {
          const collides =
            (phone !== null &&
              normalizeTelephone(user.telephone as string | null) === phone) ||
            rows.some(
              row =>
                normalizedEmail(row.email) &&
                normalizedEmail(row.email) ===
                  normalizedEmail(user.email as string | null),
            )
          if (collides && !members.includes(String(user.id)))
            throw new Error('Unreviewed identifier owner')
          if (
            members.includes(String(user.id)) &&
            user.telephone &&
            normalizeTelephone(user.telephone as string) !== phone
          )
            throw new Error('Existing target phone differs')
        }
        for (const loser of members.filter(id => id !== anchor)) {
          mergeOwner(db, loser, anchor, references)
          mergedUsers++
        }
        const retained = db
          .query<Row, [string]>('SELECT name,email FROM user WHERE id=?')
          .get(anchor)
        if (!retained) throw new Error('Retained anchor disappeared')
        db.query('UPDATE user SET name=?,telephone=? WHERE id=?').run(
          decision.requestedName ??
            titleCaseImportedName(retained.name as string | null),
          phone,
          anchor,
        )
        db.query(
          "INSERT INTO breadlineImportUser(userId,telephone,state,claimedEmail) VALUES(?,?,'claimed',?)",
        ).run(anchor, phone, normalizedEmail(retained.email as string))
        for (const row of rows) {
          db.query(
            'INSERT INTO breadlineImportIdentity(sourceUserId,sourceVolunteerId,userId,email,name,sourceUid) VALUES(?,?,?,?,?,?)',
          ).run(
            row.id,
            row.volunteer_id,
            anchor,
            normalizedEmail(row.email),
            row.name?.trim() || null,
            row.uid,
          )
          if (!row.uid || !/^\d{21}$/.test(row.uid)) continue
          const accounts = db
            .query<Row, [string]>(
              "SELECT id,userId FROM account WHERE providerId='google' AND accountId=?",
            )
            .all(row.uid)
          if (
            accounts.some(account => account.userId !== anchor) ||
            accounts.length > 1
          )
            throw new Error('Conflicting credential owner')
          if (!accounts.length) {
            const id = createHash('sha256')
              .update(`reviewed-google:${anchor}:${row.uid}`)
              .digest('hex')
              .slice(0, 32)
            db.query(
              "INSERT INTO account(id,userId,providerId,accountId,createdAt,updatedAt) VALUES(?,?,'google',?,?,?)",
            ).run(
              id,
              anchor,
              row.uid,
              Date.parse(row.created_at ?? ''),
              Date.parse(row.last_updated_at ?? row.created_at ?? ''),
            )
          }
        }
      }
      // Replan the normal importer: every approved row must now map to its retained anchor.
      const replay = planUsers(source, readIdentitySnapshot(db), seed, decisions)
      for (const decision of review.decisions)
        for (const id of decision.sourceUserIds) {
          if (
            !replay.mapping.some(
              m =>
                m.sourceUserId === id &&
                m.targetUserId === decision.anchorHypeUserId &&
                m.disposition === 'match',
            )
          )
            throw new Error('Adoption failed normal importer replay')
        }
      if (db.query('PRAGMA foreign_key_check').all().length)
        throw new Error('Adoption foreign-key check failed')
      if (
        (db.query('PRAGMA integrity_check').get() as { integrity_check: string })
          .integrity_check !== 'ok'
      )
        throw new Error('Adoption integrity failed')
      return {
        cohorts: review.decisions.length,
        sourceRows: review.decisions.reduce((n, d) => n + d.sourceUserIds.length, 0),
        mergedUsers,
        afterHash: targetEvidence(db, review.decisions),
      }
    })
    .immediate()
}

/**
 * Verify an already applied plan without reopening ownership or adding credentials.
 * @param db Offline post-apply database.
 * @param source Current source rows.
 * @param review Current reviewed decisions.
 * @param plan Original immutable plan.
 * @param afterHash Receipt's exact affected post-state hash.
 * @returns Nothing; throws if source, decision, credential, role or history state changed.
 */
export function verifyAdoptionReplay(
  db: Database,
  source: LegacyUser[],
  review: AdoptionReview,
  plan: AdoptionPlan,
  afterHash: string,
): void {
  if (
    evidenceHash(source) !== plan.sourceHash ||
    evidenceHash(review) !== plan.reviewHash ||
    targetEvidence(db, review.decisions) !== afterHash
  )
    throw new Error('Adoption replay state changed')
}

/**
 * Apply reviewed adoptions during an offline development rebuild only.
 * @param dbPath Newly prepared rebuild database.
 * @param source Source rows already loaded by the normal rebuild.
 * @param reviewPath Private reviewed decisions adjacent to their case manifest.
 * @param seed Durable target identity seed.
 * @param decisions Existing source import decisions.
 * @param artifactPrefix Private path prefix for immutable plan and before-image files.
 * @returns Aggregate adoption receipt.
 * @remarks The reviewed snapshot supplies the authoritative affected target before-state.
 */
export function applyRebuildAdoptions(
  dbPath: string,
  source: LegacyUser[],
  reviewPath: string,
  seed: string,
  decisions: UserDecisions,
  artifactPrefix: string,
): ReturnType<typeof applyAdoptions> {
  const review = readAdoptionReview(
    reviewPath,
    resolve(dirname(reviewPath), 'cases.v1.jsonl'),
  )
  const baseline = new Database(`${review.snapshot}/prepared.sqlite`, {
    readonly: true,
  })
  const baselineSource = new Database(`${review.snapshot}/inputs/breadline.sqlite`, {
    readonly: true,
  })
  const db = new Database(dbPath, { strict: true, create: false })
  try {
    const pinnedSeed = JSON.parse(
      readFileSync(`${review.snapshot}/identity-seed.json`, 'utf8'),
    ).seed
    const pinnedDecisions = JSON.parse(
      readFileSync(`${review.snapshot}/user-decisions.json`, 'utf8'),
    )
    if (
      seed !== pinnedSeed ||
      evidenceHash(decisions) !== evidenceHash(pinnedDecisions)
    )
      throw new Error('Reviewed seed or source decisions changed')
    if (
      evidenceHash(source) !== evidenceHash(readSourceUsers(baselineSource)) ||
      identityAuthorityEvidence(db, review.decisions) !==
        identityAuthorityEvidence(baseline, review.decisions)
    )
      throw new Error('Reviewed source or target authority changed')
    // Imported Features are a later rebuild stage: fence current content at preparation,
    // while requiring the original reviewed identity/credential/role state above.
    const plan = prepareAdoptions(db, source, review, seed, decisions)
    writeFileSync(`${artifactPrefix}.review.json`, JSON.stringify(review, null, 2), {
      flag: 'wx',
      mode: 0o400,
    })
    writeFileSync(
      `${artifactPrefix}.cases.jsonl`,
      readFileSync(resolve(dirname(reviewPath), 'cases.v1.jsonl')),
      { flag: 'wx', mode: 0o400 },
    )
    writeFileSync(`${artifactPrefix}.plan.json`, JSON.stringify(plan, null, 2), {
      flag: 'wx',
      mode: 0o400,
    })
    const receipt = applyAdoptions(
      db,
      source,
      review,
      plan,
      seed,
      decisions,
      `${artifactPrefix}.before.sqlite`,
    )
    verifyAdoptionReplay(db, source, review, plan, receipt.afterHash)
    writeFileSync(`${artifactPrefix}.receipt.json`, JSON.stringify(receipt, null, 2), {
      flag: 'wx',
      mode: 0o400,
    })
    return receipt
  } finally {
    db.close()
    baseline.close()
    baselineSource.close()
  }
}
