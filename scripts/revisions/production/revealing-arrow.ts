// NODE
import { execFileSync } from 'node:child_process'
// DRIZZLE
import { sql } from 'drizzle-orm'
// DATABASE
import { openSqliteDomain } from '../../locations/lib/sqlite-domain'
import { preparePropertyCatalogCapture } from '../../../src/lib/db/services/propertyCatalogRevision'
import { readFeatureRevisionSource } from '../../../src/lib/db/services/featureRevisionSource'
import { buildFeatureRevisionBaselineContent } from '../../../src/lib/db/services/featureRevisionContent'
import { FeatureRevisionContentSchema } from '../../../src/lib/revisions/featureContent'
import { guard, type Group, type Statement } from './contract'

const feature = 'rx81h67xsLkz'
const oldHead = 'ffc4084b-12bd-4a2f-9d0e-00c0fc73ea72'
const project = 'YuSFnia9VOtG'
const actor = {
  actorId: 'system:revealing-arrow-cutover',
  origin: 'migration' as const,
  reason:
    'Retain sign material Tiles and use the production Ghost Signs classification',
}

/** Prepare and verify one journal transaction for the frozen recording and its current classification.
 * @param domain Offline production-shaped snapshot. @returns Exact D1 group including catalogue capture.
 * @remarks The four authored Feature revisions remain intact. The new head records the catalogue change.
 */
export async function prepareRevealingArrow(
  domain: ReturnType<typeof openSqliteDomain>,
): Promise<Group> {
  const { db, sqlite } = domain
  const statements: Statement[] = []
  const run = (statement: Statement) => {
    sqlite.query(statement.sql).all(...statement.params)
    statements.push(statement)
  }
  sqlite.exec('SAVEPOINT revealing_arrow')
  try {
    const capture = await preparePropertyCatalogCapture(
      db,
      { scope: 'project', id: project },
      actor,
    )
    if (!capture.before.length)
      throw new Error('Ghost Signs catalogue recording is required')
    run(
      guard(
        `EXISTS(SELECT 1 FROM property WHERE id='vX7yZ1wA3bC6' AND projectId=? AND key='material')
      AND EXISTS(SELECT 1 FROM property p JOIN propertyValue v ON v.propertyId=p.id JOIN propertyValueI18n i ON i.propertyValueId=v.id
        WHERE p.projectId=? AND p.key='stratigraphy' AND p.id='af38c4209f82' AND v.id='5cfb6a877559' AND i.locale='en' AND i.value='Revealed')
      AND NOT EXISTS(SELECT 1 FROM propertyValue v JOIN propertyValueI18n i ON i.propertyValueId=v.id
        WHERE v.propertyId='vX7yZ1wA3bC6' AND i.locale='en' AND lower(trim(i.value))='tiles' AND v.id<>'rbOSdVBy3Guc')
      AND NOT EXISTS(SELECT 1 FROM propertyValue WHERE id='rbOSdVBy3Guc')`,
        [project, project],
      ),
    )
    for (const q of capture.before)
      run((q as unknown as { toSQL(): Statement }).toSQL())
    run({
      sql: "INSERT INTO propertyValue(id,propertyId,rank,value) SELECT 'rbOSdVBy3Guc','vX7yZ1wA3bC6',coalesce(max(rank),-1)+1,NULL FROM propertyValue WHERE propertyId='vX7yZ1wA3bC6'",
      params: [],
    })
    run({
      sql: "INSERT INTO propertyValueI18n(propertyValueId,locale,value,valueGen,isAutomaticOnly) VALUES('rbOSdVBy3Guc','en','Tiles',0,0)",
      params: [],
    })
    for (const q of capture.after) run((q as unknown as { toSQL(): Statement }).toSQL())
    const recording = JSON.parse(
      execFileSync(
        'python3',
        ['migrations/pending/revealing-arrow/production-statements.py'],
        { encoding: 'utf8' },
      ),
    ) as Statement[]
    for (const row of recording) run(row)
    const historical = sqlite
      .query(
        'SELECT content FROM featureRevision WHERE id=? AND featureId=? AND sequence=11',
      )
      .get(oldHead, feature) as { content: string }
    const content = FeatureRevisionContentSchema.parse(JSON.parse(historical.content))
    const source = await readFeatureRevisionSource(db, feature, sql`1`)
    if (!source) throw new Error('Missing Revealing Arrow projection')
    const pins = Object.fromEntries(
      Object.entries(content.gallery.entries).map(([id, entry]) => [
        id,
        entry.imageRevisionId,
      ]),
    )
    content.properties = buildFeatureRevisionBaselineContent(source.snapshot, {
      revisions: pins,
      order: content.gallery.order,
    }).properties
    const id = 'revealing-arrow:production-taxonomy-v1'
    run({
      sql: 'INSERT INTO featureRevisionWriteScope(featureId,token) VALUES(?,?)',
      params: [feature, id],
    })
    run({
      sql: 'INSERT INTO revisionChangeSet(id,actorId,origin,reason,createdAt) VALUES(?,?,?,?,?)',
      params: [id, actor.actorId, actor.origin, actor.reason, new Date().toISOString()],
    })
    run({
      sql: 'INSERT INTO featureRevision(id,featureId,previousRevisionId,changeSetId,schemaVersion,content,recordState,sequence) SELECT ?,featureId,id,?,schemaVersion,?,recordState,sequence+1 FROM featureRevision WHERE id=?',
      params: [id, id, JSON.stringify(content), oldHead],
    })
    run({
      sql: 'UPDATE feature SET currentRevisionId=?,revisionVersion=12 WHERE id=? AND currentRevisionId=? AND revisionVersion=11',
      params: [id, feature, oldHead],
    })
    run({
      sql: 'DELETE FROM featureRevisionWriteScope WHERE featureId=? AND token=?',
      params: [feature, id],
    })
    run(
      guard(
        `EXISTS(SELECT 1 FROM feature WHERE id=? AND currentRevisionId=? AND revisionVersion=12)
      AND (SELECT count(*) FROM featureRevision WHERE featureId=?)=5
      AND (SELECT count(*) FROM featureRevisionImage WHERE featureRevisionId=?)=2
      AND NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check)`,
        [feature, id, feature, id],
      ),
    )
    sqlite.exec('RELEASE revealing_arrow')
    return { label: 'revealing-arrow', statements }
  } catch (error) {
    sqlite.exec('ROLLBACK TO revealing_arrow; RELEASE revealing_arrow')
    throw error
  }
}
