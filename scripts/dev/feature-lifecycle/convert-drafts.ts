// DATABASE
import type { Database } from 'bun:sqlite'
// DOMAIN
import { FeatureRevisionContentSchema } from '../../../src/lib/revisions/featureContent'
import {
  FeatureChangesSchema,
  applyFeatureChanges,
} from '../../../src/lib/revisions/featureChanges'
// DEPLOYMENT
import {
  guard,
  identifier,
  type Group,
  type Statement,
} from '../../revisions/production/contract'

type Row = Record<string, string | number | null>
const owned = new Set([
  'featureOrigin',
  'featureI18n',
  'featureProperty',
  'featurePropertyI18n',
  'featureImage',
  'featureSpatial',
  'featureSearchDocument',
  'featureDivisionMembership',
  'featureDivisionJob',
  'featureCountEntry',
  'featureMtrJob',
  'featureRevision',
  'featureRevisionProposal',
  'featureRevisionReview',
  'featureUploadEvidence',
  'task',
])

/** Prepare lossless conversion of unfinished legacy contributions into ordinary creation proposals.
 * @param db Isolated target-schema database; never a live binding.
 * @returns Atomic managed deployment groups, one per contribution.
 * @remarks Original rows, including removed revision pins, are retained in immutable change-set evidence.
 * Unexpected social, Location, identity or third-party references block cleanup. No image bytes are changed.
 */
export function prepareLegacyDraftConversion(db: Database): Group[] {
  const columns = db.query("PRAGMA table_info('feature')").all() as { name: string }[]
  if (!columns.some(column => column.name === 'currentRevisionId'))
    throw new Error('Draft conversion requires the lifecycle schema')
  const tables = (
    db
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .all() as { name: string }[]
  ).map(row => row.name)
  const scoped = tables.filter(table =>
    (
      db.query(`PRAGMA table_info(${identifier(table)})`).all() as { name: string }[]
    ).some(column => column.name === 'featureId'),
  )
  const drafts = db
    .query(
      `SELECT t.id taskId,t.featureId,t.proposalId FROM task t JOIN featureRevisionProposal p ON p.id=t.proposalId
    WHERE t.type='newFeature' AND t.isDraft=1 AND t.isReviewed=0 AND p.status='draft'
      AND json_extract(p.creationScope,'$.legacyInitial.mode')='contribution' ORDER BY t.id`,
    )
    .all() as { taskId: string; featureId: string; proposalId: string }[]
  const triggers = db
    .query(
      "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND (name LIKE 'featureRevisionImage_immutable_%' OR name='feature_current_revision_owner' OR name LIKE 'feature_revision_%' OR name LIKE 'feature_proposal_%' OR name LIKE 'feature_review_%' OR name LIKE 'feature_upload_evidence_%')",
    )
    .all() as { name: string; sql: string }[]
  return drafts.map(draft => {
    const rows = (table: string, where: string, params: string[]): Row[] =>
      db
        .query(`SELECT * FROM ${identifier(table)} WHERE ${where}`)
        .all(...params) as Row[]
    const feature = rows('feature', 'id=?', [draft.featureId])[0]
    const snapshots: Record<string, Row[]> = { feature: [feature] }
    if (!feature || feature.isPublished || feature.isArchived || !feature.isDraft)
      throw new Error(`Legacy draft is not private: ${draft.taskId}`)
    for (const table of scoped) {
      const records = rows(table, 'featureId=?', [draft.featureId])
      if (!records.length) continue
      if (!owned.has(table))
        throw new Error(`Legacy draft ${draft.taskId} has retained ${table} references`)
      snapshots[table] = records
    }
    // Numbered migration 0243 recorded the creation channel before removing the provisional identity.
    // External source identities require their own conversion, including any reverse references.
    for (const origin of snapshots.featureOrigin ?? []) {
      if (
        !['admin_contribution', 'app_contribution'].includes(String(origin.origin)) ||
        origin.originId !== null ||
        origin.recordedBy !== null ||
        !origin.recordedAt
      )
        throw new Error(
          'Legacy draft has independently attributed origin: ' + draft.taskId,
        )
    }
    if (snapshots.task?.length !== 1 || snapshots.task[0].id !== draft.taskId)
      throw new Error('Legacy draft has additional tasks')
    const task = snapshots.task[0]
    const proposals = snapshots.featureRevisionProposal ?? []
    const original = proposals.find(row => row.id === draft.proposalId)
    if (
      !original ||
      original.contributorId !== task.contributorId ||
      feature.contributorId !== task.contributorId ||
      proposals.some(
        row => row.status !== 'draft' || row.contributorId !== task.contributorId,
      )
    )
      throw new Error('Legacy draft proposal ownership or status differs')
    const revisions = snapshots.featureRevision ?? []
    const base = revisions.find(row => row.id === original.baseRevisionId)
    const current = revisions.find(row => row.id === feature.currentRevisionId)
    if (!base || !current) throw new Error('Legacy draft content is unavailable')
    // A never-published contribution must not erase any accepted/public identity history.
    if (
      revisions.some(
        row => row.recordState && JSON.parse(String(row.recordState)).isPublished,
      )
    )
      throw new Error('Legacy draft has public history')
    const parsed = (row: Row) =>
      FeatureRevisionContentSchema.parse(JSON.parse(String(row.content)))
    const candidate = applyFeatureChanges(
      parsed(base),
      parsed(current),
      FeatureChangesSchema.parse(JSON.parse(String(original.changes))),
    )
    if (candidate.status !== 'ready')
      throw new Error('Legacy draft has unresolved changes')
    const content = candidate.content
    const uploads = snapshots.featureUploadEvidence ?? []
    snapshots.taskImage = rows('taskImage', 'taskId=?', [draft.taskId])
    for (const upload of uploads) {
      if (
        upload.actorId !== task.contributorId ||
        JSON.stringify(JSON.parse(String(upload.taskIds))) !==
          JSON.stringify([draft.taskId])
      )
        throw new Error('Legacy upload belongs to another task or contributor')
      const proposal = proposals.find(row => row.id === upload.proposalId)
      const uploadBase = revisions.find(row => row.id === proposal?.baseRevisionId)
      if (!proposal || !uploadBase)
        throw new Error('Legacy upload content is unavailable')
      const result = applyFeatureChanges(
        parsed(uploadBase),
        parsed(uploadBase),
        FeatureChangesSchema.parse(JSON.parse(String(proposal.changes))),
      )
      const entry =
        result.status === 'ready'
          ? result.content.gallery.entries[String(upload.imageId)]
          : undefined
      if (!entry || entry.imageRevisionId !== upload.imageRevisionId)
        throw new Error('Legacy upload pin differs')
      if (!content.gallery.entries[String(upload.imageId)])
        content.gallery.order.push(String(upload.imageId))
      content.gallery.entries[String(upload.imageId)] = { ...entry, isPublished: true }
    }
    if (
      content.gallery.order.length !== snapshots.taskImage.length ||
      snapshots.taskImage.some(
        link => !uploads.some(upload => upload.imageId === link.imageId),
      )
    )
      throw new Error('Legacy draft gallery has unaccounted photo evidence')
    FeatureRevisionContentSchema.parse(content)
    const ids = JSON.stringify(revisions.map(row => row.id))
    snapshots.featureRevisionImage = db
      .query(
        'SELECT * FROM featureRevisionImage WHERE featureRevisionId IN (SELECT value FROM json_each(?))',
      )
      .all(ids) as Row[]
    // No foreign revision or proposal may retain a pointer into the removed private identity.
    for (const table of tables)
      for (const fk of db
        .query(`PRAGMA foreign_key_list(${identifier(table)})`)
        .all() as { table: string; from: string; to: string }[]) {
        if (
          fk.table === 'feature' &&
          fk.to === 'id' &&
          !(owned.has(table) && fk.from === 'featureId')
        ) {
          if (rows(table, `${identifier(fk.from)}=?`, [draft.featureId]).length)
            throw new Error(`Unowned legacy reference: ${table}.${fk.from}`)
        }
        if (fk.table === 'featureRevision' && fk.to === 'id') {
          const linked = db
            .query(
              `SELECT * FROM ${identifier(table)} WHERE ${identifier(fk.from)} IN (SELECT value FROM json_each(?))`,
            )
            .all(ids) as Row[]
          if (
            linked.some(row =>
              table === 'feature'
                ? row.id !== draft.featureId
                : table === 'featureRevisionImage'
                  ? false
                  : row.featureId !== draft.featureId,
            )
          )
            throw new Error(`Foreign history references legacy draft: ${table}`)
        }
      }
    const changeId = `draft-conversion:${draft.taskId}`,
      version = crypto.randomUUID()
    const statement = (sql: string, ...params: Statement['params']): Statement => ({
      sql,
      params,
    })
    const before = JSON.stringify(snapshots)
    if (Buffer.byteLength(before) > 900_000)
      throw new Error('Legacy draft evidence requires a separately reviewed partition')
    const statements: Statement[] = [
      statement('PRAGMA defer_foreign_keys=ON'),
      guard(
        "EXISTS(SELECT 1 FROM task t JOIN feature f ON f.id=t.featureId JOIN featureRevisionProposal p ON p.id=t.proposalId WHERE t.id=? AND t.featureId=? AND t.modifiedAt=? AND t.isDraft=1 AND t.isReviewed=0 AND p.id=? AND p.version=? AND p.status='draft' AND f.currentRevisionId=? AND f.isDraft=1 AND f.isPublished=0)",
        [
          draft.taskId,
          draft.featureId,
          task.modifiedAt,
          draft.proposalId,
          original.version,
          feature.currentRevisionId,
        ],
      ),
      ...triggers.map(trigger => statement(`DROP TRIGGER ${identifier(trigger.name)}`)),
      statement(
        'INSERT INTO revisionChangeSet(id,actorId,origin,reason,createdAt,legacyEvidence) VALUES(?,?,?,?,?,?)',
        changeId,
        'migration:feature-lifecycle',
        'migration',
        'Convert unfinished contribution to creation proposal',
        new Date().toISOString(),
        JSON.stringify({
          format: 'legacy-creation-conversion/v1',
          taskId: draft.taskId,
          featureId: draft.featureId,
          proposalId: draft.proposalId,
          before: JSON.parse(before),
        }),
      ),
      statement(
        "UPDATE featureRevisionProposal SET featureId=NULL,baseRevisionId=NULL,kind='create',version=?,changes=?,creationScope=? WHERE id=?",
        version,
        JSON.stringify({ format: 'feature-create/v1', content }),
        JSON.stringify({
          organisationId: feature.organisationId,
          projectId: feature.projectId,
          layerId: feature.layerId,
        }),
        draft.proposalId,
      ),
      statement('UPDATE task SET featureId=NULL WHERE id=?', draft.taskId),
      statement(
        'UPDATE featureUploadEvidence SET featureId=NULL,proposalId=?,proposalVersion=? WHERE featureId=?',
        draft.proposalId,
        version,
        draft.featureId,
      ),
      statement('DELETE FROM featureRevisionReview WHERE featureId=?', draft.featureId),
      statement(
        'DELETE FROM featureRevisionProposal WHERE featureId=?',
        draft.featureId,
      ),
      statement(
        'UPDATE feature SET currentRevisionId=NULL WHERE id=?',
        draft.featureId,
      ),
      statement(
        'DELETE FROM featureRevisionImage WHERE featureRevisionId IN (SELECT value FROM json_each(?))',
        ids,
      ),
      statement('DELETE FROM featureRevision WHERE featureId=?', draft.featureId),
      ...[
        'featurePropertyI18n',
        'featureProperty',
        ...scoped.filter(
          table =>
            owned.has(table) &&
            ![
              'featurePropertyI18n',
              'featureProperty',
              'featureRevision',
              'featureRevisionProposal',
              'featureRevisionReview',
              'featureUploadEvidence',
              'task',
            ].includes(table),
        ),
      ]
        .filter(table => tables.includes(table))
        .map(table =>
          statement(
            `DELETE FROM ${identifier(table)} WHERE featureId=?`,
            draft.featureId,
          ),
        ),
      statement('DELETE FROM feature WHERE id=?', draft.featureId),
      ...triggers.map(trigger => statement(trigger.sql)),
    ]
    return { label: `legacy-creation:${draft.taskId}`, statements }
  })
}

/** Apply prepared cleanup on an already isolated database inside the caller's transaction.
 * @param db Private rehearsal database. @param groups Exact prepared atomic units.
 * @returns Nothing; constraint failures abort the caller's transaction.
 */
export function applyLegacyDraftConversion(db: Database, groups: Group[]): void {
  for (const group of groups)
    for (const statement of group.statements)
      db.query(statement.sql).run(...statement.params)
}
