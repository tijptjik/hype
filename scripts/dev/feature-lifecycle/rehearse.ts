// BUN
import { Database } from 'bun:sqlite'
// NODE
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
// CONVERSION
import {
  verifyPublishedSubmission,
  type PublishedSubmission,
} from '../../revisions/production/published-submissions'
import {
  prepareLegacyDraftConversion,
  applyLegacyDraftConversion,
} from './convert-drafts'
import { inspectFeatureLifecycleConversion } from './inspect'
import { inspectCurrentFeatureConversion } from './current'
// TYPES
import type { SQLQueryBindings } from 'bun:sqlite'

type Row = Record<string, string | number | null>
const removed = [
  'featureRevisionHead',
  'featurePrivateCapture',
  'featureRevisionPublication',
  'featureIdentityProposal',
  'featureIdentityProposalDecision',
  'featureIdentityReservation',
  'featureInitialRevision',
  'featureRevisionCreationPolicy',
  'featureImageUploadRevision',
  'featureBaselineAttribution',
  'featureTaskTransfer',
  'featureTaskUploadTransfer',
]
const replaced = [
  'featureRevision',
  'featureRevisionProposal',
  'featureRevisionReview',
  'featureIdentityOperation',
  'featureIdentityOperationMember',
  'featureRevisionWriteScope',
]

/** Quote an introspected SQLite identifier without treating it as SQL code.
 * @param name Exact database object name. @returns Quoted identifier.
 */
function identifier(name: string): string {
  return '"' + name.replaceAll('"', '""') + '"'
}
/** Retain a deterministic row-level receipt for conservation checks.
 * @param rows Ordered records. @returns SHA-256 of their exact JSON representation.
 */
function digest(rows: Row[]): string {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}
/** Insert one converted row with bounded bindings.
 * @param db Rehearsal database. @param table Trusted table. @param row Explicit converted fields.
 * @returns Nothing.
 */
function insert(db: Database, table: string, row: Row): void {
  const fields = Object.keys(row)
  db.query(
    `INSERT INTO ${identifier(table)} (${fields.map(identifier).join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
  ).run(...fields.map(key => row[key]))
}

/** Rehearse lossless lifecycle conversion on a new private copy; never modifies the source database.
 * @param sourcePath Existing development database. @param destinationPath New, exclusive rehearsal file.
 * @param options Skip draft cleanup when preparing the preceding managed schema unit.
 * @returns Conservation and integrity receipts; any unsupported legacy state aborts the copy transaction.
 * @remarks Successful rehearsal is not application cutover authority or evidence that remaining API/UI adapters are complete.
 */
export async function rehearseFeatureLifecycle(
  sourcePath: string,
  destinationPath: string,
  options: {
    cleanupDrafts?: boolean
    publishedSubmissions?: readonly PublishedSubmission[]
  } = {},
): Promise<Record<string, unknown>> {
  if (resolve(sourcePath) === resolve(destinationPath))
    throw new Error('Rehearsal requires a separate destination')
  const source = new Database(sourcePath, { readonly: true })
  try {
    source.exec('BEGIN')
    writeFileSync(destinationPath, source.serialize(), { mode: 0o600, flag: 'wx' })
    source.exec('ROLLBACK')
  } finally {
    source.close()
  }
  const conversion = inspectFeatureLifecycleConversion(destinationPath),
    current = await inspectCurrentFeatureConversion(destinationPath)
  if (conversion.summary.issues.length || current.issues.length)
    throw new Error('Source conversion inventory has unresolved evidence')
  const db = new Database(destinationPath)
  try {
    const rows = (table: string): Row[] =>
      db.query(`SELECT * FROM ${identifier(table)} ORDER BY rowid`).all() as Row[]
    const original = Object.fromEntries(
      [
        ...new Set([
          ...removed,
          ...replaced,
          'revisionChangeSet',
          'task',
          'taskImage',
          'imageAssetVersion',
          'imageRevision',
          'featureRevisionImage',
          'feature',
        ]),
      ].map(table => [table, rows(table)]),
    )
    const schema = db
      .query(
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('trigger','view','index')",
      )
      .all() as { type: string; name: string; tbl_name: string; sql: string }[]
    const revisions = new Map(
      original.featureRevision.map(row => [String(row.id), row]),
    )
    const publications = original.featureRevisionPublication
    const baselineFor = new Map(
      original.featureBaselineAttribution.map(row => [String(row.featureId), row]),
    )
    const evidence = new Map<string, Record<string, Row[]>>()
    const preserve = (changeSetId: string, kind: string, row: Row): void => {
      const entry = evidence.get(changeSetId) ?? {}
      entry[kind] ??= []
      entry[kind].push(row)
      evidence.set(changeSetId, entry)
    }
    const identityProposals = new Map(
      original.featureIdentityProposal.map(row => [String(row.id), row]),
    )
    for (const row of original.featureIdentityProposal)
      preserve(String(row.changeSetId), 'identityProposals', row)
    for (const row of original.featureIdentityProposalDecision)
      preserve(String(row.changeSetId), 'identityDecisions', row)
    for (const row of original.featureIdentityReservation) {
      const parent = identityProposals.get(String(row.proposalId))
      if (!parent) throw new Error('Identity reservation has no preparation evidence')
      preserve(String(parent.changeSetId), 'identityReservations', row)
    }
    const transfers = new Map(
      original.featureTaskTransfer.map(row => [String(row.id), row]),
    )
    for (const row of original.featureTaskTransfer)
      preserve(String(row.changeSetId), 'taskTransfers', row)
    for (const row of original.featureTaskUploadTransfer) {
      const parent = transfers.get(String(row.transferId))
      if (!parent) throw new Error('Task upload transfer has no transfer evidence')
      preserve(String(parent.changeSetId), 'taskUploadTransfers', row)
    }
    // Link the approved creation task to its submitted photo proposal on the existing published identity.
    const publishedTaskProposals = new Map<string, string>()
    for (const entry of options.publishedSubmissions ?? []) {
      verifyPublishedSubmission(db, entry)
      const uploads = conversion.uploads.filter(
        row =>
          row.featureId === entry.featureId &&
          row.imageId === entry.imageId &&
          row.taskIds === JSON.stringify([entry.taskId]),
      )
      const proposal = conversion.proposals.find(
        row => row.id === uploads[0]?.proposalId,
      )
      if (
        uploads.length !== 1 ||
        !proposal ||
        proposal.status !== 'submitted' ||
        proposal.version !== uploads[0].proposalVersion ||
        proposal.contributorId !== uploads[0].actorId
      )
        throw new Error(
          'Published task lacks exact submitted upload proposal: ' + entry.taskId,
        )
      proposal.creationScope = JSON.stringify({ legacyPublishedTaskId: entry.taskId })
      publishedTaskProposals.set(entry.taskId, String(proposal.id))
    }
    const migrationId = crypto.randomUUID(),
      now = new Date().toISOString()
    db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE')
    try {
      // Remove obsolete guards/views before replacing their tables; unrelated resource/Location machinery is preserved.
      const obsolete = new RegExp('\\b(' + removed.join('|') + ')\\b')
      for (const object of schema) {
        if (
          object.type === 'view' &&
          (obsolete.test(object.sql) || object.name === 'featureTaskUploadEvidence')
        )
          db.exec(`DROP VIEW ${identifier(object.name)}`)
        if (
          object.type === 'trigger' &&
          (obsolete.test(object.sql) ||
            replaced.includes(object.tbl_name) ||
            object.tbl_name === 'revisionChangeSet')
        )
          db.exec(`DROP TRIGGER ${identifier(object.name)}`)
      }
      for (const table of [...removed, ...replaced])
        db.exec(`DROP TABLE ${identifier(table)}`)
      const target = readFileSync(
        'migrations/pending/feature-lifecycle/target.sql',
        'utf8',
      )
      // Later migrations may already install guards replaced by this lifecycle contract.
      for (const match of target.matchAll(/CREATE TRIGGER ([a-zA-Z0-9_]+)/g))
        db.exec(`DROP TRIGGER IF EXISTS ${identifier(match[1])}`)
      const triggerStart = target.indexOf('CREATE TRIGGER')
      const definitions = target
        .slice(0, triggerStart)
        .replace(/CREATE TABLE revisionChangeSet \([\s\S]*?\n\);/, '')
      db.exec(definitions)
      db.exec(
        'ALTER TABLE revisionChangeSet ADD COLUMN legacyEvidence TEXT CHECK(legacyEvidence IS NULL OR json_valid(legacyEvidence))',
      )
      insert(db, 'revisionChangeSet', {
        id: migrationId,
        actorId: 'migration:feature-lifecycle',
        origin: 'migration',
        reason: 'Consolidate accepted history and preserve legacy lifecycle evidence',
        createdAt: now,
      })
      for (const [changeSetId, value] of evidence) {
        const result = db
          .query('UPDATE revisionChangeSet SET legacyEvidence=? WHERE id=?')
          .run(JSON.stringify(value), changeSetId)
        if (result.changes !== 1)
          throw new Error('Legacy evidence has no attribution change set')
      }
      // Original revision IDs and image pins remain byte-for-byte evidence, including old candidate snapshots.
      for (const row of original.featureRevision)
        insert(db, 'featureRevision', {
          ...row,
          sequence: null,
          recordState: null,
          legacyEvidence: JSON.stringify({ kind: 'retained-legacy-snapshot' }),
        })
      for (const row of conversion.proposals) insert(db, 'featureRevisionProposal', row)
      for (const row of conversion.reviews) insert(db, 'featureRevisionReview', row)
      for (const row of conversion.uploads) insert(db, 'featureUploadEvidence', row)
      for (const row of original.featureIdentityOperation) {
        const dispositions = JSON.parse(String(row.dispositions))
        if (row.kind === 'merge') {
          const inputIds = original.featureIdentityOperationMember
            .filter(member => member.operationId === row.id && member.role === 'input')
            .map(member => member.featureId)
          const redirect = original.featureRevisionHead.find(
            head => inputIds.includes(head.featureId) && head.state === 'merged',
          )?.redirectFeatureId
          if (!redirect) throw new Error('Merge history has no exact redirect choice')
          dispositions.redirectFeatureId = redirect
        }
        insert(db, 'featureIdentityOperation', {
          ...row,
          dispositions: JSON.stringify(dispositions),
        })
      }
      for (const row of original.featureIdentityOperationMember)
        insert(db, 'featureIdentityOperationMember', row)
      // New accepted event snapshots pin existing image versions; importing old snapshots above does not duplicate their pins.
      for (const object of schema.filter(
        object =>
          object.type === 'trigger' &&
          ['feature_revision_gallery', 'feature_revision_gallery_pins'].includes(
            object.name,
          ),
      ))
        db.exec(object.sql)
      let eventCount = 0
      for (const record of current.current) {
        const events = [
          ...publications
            .filter(row => row.featureId === record.featureId)
            .map(row => ({
              kind: 'publication',
              row,
              order: Number(row.generation),
              sub: 0,
            })),
          ...original.featurePrivateCapture
            .filter(row => row.featureId === record.featureId)
            .map(row => ({
              kind: 'private-capture',
              row,
              order: Number(row.generation),
              sub: Number(row.sequence) + 1,
            })),
        ].sort((a, b) => a.order - b.order || a.sub - b.sub)
        let previous: string | null = null,
          sequence = 0
        for (const event of events) {
          const row = event.row
          let originalId =
            event.kind === 'publication'
              ? (row.revisionId ?? row.previousRevisionId)
              : row.revisionId
          if (!originalId) {
            const baseline = original.featureRevision.find(
              revision =>
                revision.featureId === record.featureId &&
                revision.changeSetId === row.changeSetId &&
                revision.previousRevisionId === null,
            )
            originalId = baseline?.id ?? null
          }
          const snapshot = revisions.get(String(originalId))
          if (!snapshot)
            throw new Error('Historical event has no exact content snapshot')
          const id = crypto.randomUUID()
          // Unknown historical archive/scope state stays unknown; original receipts remain exact retained evidence.
          const state = {
            isPublished: event.kind === 'publication' ? Boolean(row.revisionId) : false,
            isArchived: null,
            localIsPublished: null,
            organisationId: null,
            projectId: null,
            layerId: null,
          }
          insert(db, 'featureRevision', {
            id,
            featureId: record.featureId,
            previousRevisionId: previous,
            changeSetId:
              event.kind === 'publication' ? row.changeSetId : snapshot.changeSetId,
            content: snapshot.content,
            sequence,
            recordState: JSON.stringify(state),
            baselineAttribution:
              sequence === 0 && baselineFor.has(record.featureId)
                ? JSON.stringify(baselineFor.get(record.featureId))
                : null,
            legacyEvidence: JSON.stringify({
              kind: event.kind,
              receipt: row,
              sourceRevisionId: originalId,
            }),
          })
          previous = id
          sequence++
          eventCount++
        }
        const id = crypto.randomUUID()
        insert(db, 'featureRevision', {
          id,
          featureId: record.featureId,
          previousRevisionId: previous,
          changeSetId: migrationId,
          sequence,
          content: JSON.stringify(record.content),
          recordState: JSON.stringify(record.state),
          legacyEvidence: JSON.stringify({
            kind: 'current-projection-capture',
            sourceRevisionId: record.revisionId,
            basis: record.basis,
            projectionAdjustments: record.projectionAdjustments,
          }),
        })
        db.query(
          'UPDATE feature SET currentRevisionId=?,revisionVersion=? WHERE id=?',
        ).run(id, sequence, record.featureId)
      }
      // Rebuild task ownership without renaming the old table and rewriting unrelated child foreign keys.
      const taskSql = db
        .query("SELECT sql FROM sqlite_master WHERE type='table' AND name='task'")
        .get() as { sql: string }
      db.exec(
        taskSql.sql
          .replace('CREATE TABLE "task"', 'CREATE TABLE "task_lifecycle_new"')
          .replace('`featureId` text NOT NULL', '`featureId` text')
          .replace(
            '  `contributorId`',
            '  proposalId TEXT REFERENCES featureRevisionProposal(id),\n  `contributorId`',
          ),
      )
      const taskFields = Object.keys(original.task[0] ?? {})
      if (taskFields.length)
        db.exec(
          `INSERT INTO task_lifecycle_new (${taskFields.map(identifier).join(',')}) SELECT ${taskFields.map(identifier).join(',')} FROM task`,
        )
      db.exec('DROP TABLE task; ALTER TABLE task_lifecycle_new RENAME TO task')
      for (const [taskId, proposalId] of publishedTaskProposals)
        db.query('UPDATE task SET proposalId=? WHERE id=?').run(proposalId, taskId)
      for (const initial of original.featureInitialRevision)
        db.query(
          "UPDATE task SET proposalId=? WHERE featureId=? AND type='newFeature'",
        ).run(initial.proposalId, initial.featureId)
      for (const object of schema.filter(
        object =>
          (object.type === 'trigger' || object.type === 'index') &&
          object.tbl_name === 'task',
      )) {
        if (object.name === 'feature_task_assignment_requires_receipt') {
          // Historical tasks remain on their source; explicit proposal retargeting carries its own immutable review receipt.
          db.exec(`CREATE TRIGGER feature_task_assignment_requires_receipt BEFORE UPDATE OF featureId ON task
            WHEN NEW.featureId<>OLD.featureId AND
              (EXISTS(SELECT 1 FROM feature WHERE id=OLD.featureId AND currentRevisionId IS NOT NULL)
               OR EXISTS(SELECT 1 FROM feature WHERE id=NEW.featureId AND currentRevisionId IS NOT NULL))
              AND NOT EXISTS(SELECT 1 FROM featureRevisionReview r JOIN featureRevisionProposal p ON p.id=NEW.proposalId
                WHERE OLD.isReviewed=0 AND r.action='retargeted' AND r.proposalId=OLD.proposalId
                  AND json_extract(r.context,'$.sourceFeatureId')=OLD.featureId
                  AND json_extract(r.context,'$.targetFeatureId')=NEW.featureId
                  AND json_extract(r.context,'$.targetProposalId')=NEW.proposalId
                  AND p.featureId=NEW.featureId AND p.status='submitted')
            BEGIN SELECT RAISE(ABORT,'Assign enrolled tasks through reviewed proposal retargeting'); END`)
        } else {
          if (obsolete.test(object.sql))
            throw new Error(
              'Task trigger requires lifecycle conversion: ' + object.name,
            )
          db.exec(object.sql)
        }
      }
      db.exec(target.slice(triggerStart))
      db.exec(
        readFileSync('migrations/pending/feature-lifecycle/idle-windows.sql', 'utf8'),
      )
      for (const object of schema.filter(
        object => object.type === 'trigger' && object.tbl_name === 'revisionChangeSet',
      ))
        db.exec(object.sql)
      const foreignKeys = db.query('PRAGMA foreign_key_check').all()
      if (foreignKeys.length)
        throw new Error(`Foreign-key reconciliation failed (${foreignKeys.length})`)
      const retained = [
        'imageAssetVersion',
        'imageRevision',
        'featureRevisionImage',
        'taskImage',
      ]
      for (const table of retained) {
        const originalRows = original[table]
        if (table === 'featureRevisionImage') {
          const oldIds = new Set(originalRows.map(row => String(row.featureRevisionId)))
          if (
            digest(
              rows(table).filter(row => oldIds.has(String(row.featureRevisionId))),
            ) !== digest(originalRows)
          )
            throw new Error('Original Feature image pins changed')
        } else if (digest(rows(table)) !== digest(originalRows))
          throw new Error(`Retained ${table} changed`)
      }
      for (const table of ['feature', 'task', 'featureRevision', 'revisionChangeSet']) {
        const originalRows = original[table]
        if (!originalRows.length) continue
        const fields = Object.keys(originalRows[0]),
          ids = new Set(originalRows.map(row => String(row.id)))
        const after = rows(table)
          .filter(row => ids.has(String(row.id)))
          .map(row => Object.fromEntries(fields.map(field => [field, row[field]])))
        if (digest(after) !== digest(originalRows))
          throw new Error(`Original ${table} values changed`)
      }
      const draftGroups =
        options.cleanupDrafts === false ? [] : prepareLegacyDraftConversion(db)
      applyLegacyDraftConversion(db, draftGroups)
      if (db.query('PRAGMA foreign_key_check').all().length)
        throw new Error('Draft cleanup foreign-key reconciliation failed')
      for (const table of ['imageAssetVersion', 'imageRevision', 'taskImage'])
        if (digest(rows(table)) !== digest(original[table]))
          throw new Error(`Draft cleanup changed retained ${table}`)
      const integrity = db.query('PRAGMA integrity_check').all()
      if (JSON.stringify(integrity) !== JSON.stringify([{ integrity_check: 'ok' }]))
        throw new Error('SQLite integrity check failed')
      db.exec('COMMIT; PRAGMA foreign_keys=ON')
      return {
        features: current.current.length - draftGroups.length,
        convertedLegacyDrafts: draftGroups.length,
        legacyDraftEvidence: 'revisionChangeSet.legacyEvidence',
        activeProposals: (
          db.query('SELECT count(*) n FROM featureRevisionProposal').get() as {
            n: number
          }
        ).n,
        archivedDraftImagePins: (
          db
            .query(
              "SELECT COALESCE(sum(json_array_length(legacyEvidence,'$.before.featureRevisionImage')),0) n FROM revisionChangeSet WHERE id LIKE 'draft-conversion:%'",
            )
            .get() as { n: number }
        ).n,
        legacyEvents: eventCount,
        proposals: conversion.proposals.length,
        reviews: conversion.reviews.length,
        uploads: conversion.uploads.length,
        preservedAssetVersions: original.imageAssetVersion.length,
        preservedImageRevisions: original.imageRevision.length,
        preservedOriginalImagePins: original.featureRevisionImage.length,
        initialGalleryVisibilityCaptures: current.current.filter(
          row => row.projectionAdjustments.length,
        ).length,
        foreignKeyViolations: 0,
        integrity: 'ok',
        sourceModified: false,
        removedTables: removed,
      }
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  } finally {
    db.close()
  }
}
if (import.meta.main) {
  const [source, destination] = process.argv.slice(2)
  if (!source || !destination)
    throw new Error(
      'Usage: bun scripts/dev/feature-lifecycle/rehearse.ts SOURCE.sqlite NEW-PRIVATE-REHEARSAL.sqlite',
    )
  const receipt = await rehearseFeatureLifecycle(source, destination)
  writeFileSync(destination + '.receipt.json', JSON.stringify(receipt, null, 2), {
    mode: 0o600,
    flag: 'wx',
  })
  console.log(JSON.stringify(receipt, null, 2))
}
