// Refs #194. Local-only queue examples use the same evidence readers as real reviews.
// Stop the development server before applying to its database; rebuilds use an isolated copy.
// NODE
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import { taskQueueProjection } from '../../src/lib/db/services/taskQueue'
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { readLocationFacts, serializeLocationFacts } from '../../src/lib/locations/factsSnapshot'
import { proposeFeatureLocationAdoption } from '../../src/lib/db/services/locationAdoptionReview'
import { captureLocationIdentityReview, readLocationIdentityBaseline } from '../../src/lib/db/services/locationIdentityReview'
import { DEV_PERSONAS } from '../../src/lib/auth/dev-personas'

const path = resolve(process.argv[2] ?? '')
if (!path.endsWith('.sqlite') || !existsSync(path) || !process.argv.includes('--apply'))
  throw new Error('Usage: bun run scripts/dev/seed-tasks.ts /explicit/local.sqlite --apply')
const local = openSqliteDomain(path)
const { sqlite, db } = local
const backup = `${path}.before-task-fixtures`
if (!existsSync(backup)) writeFileSync(backup, sqlite.serialize())
const types = ['reportedMissing', 'newPhoto', 'newFeature', 'locationFacts', 'locationPosition', 'locationIdentity', 'locationMerge'] as const
const names: Record<(typeof types)[number], string> = { reportedMissing: 'Sample Grocer', newPhoto: 'Sample Bookshop', newFeature: 'Sample Café', locationFacts: 'Sample Bakery', locationPosition: 'Sample Florist', locationIdentity: 'Sample Hardware', locationMerge: 'Sample Tea House' }
/** Insert a known fixture row with bound values. @param table Owned table. @param values Fixture columns. @returns Nothing. */
function insert(table: string, values: Record<string, unknown>): void {
  const keys = Object.keys(values)
  sqlite.query(`INSERT INTO "${table}" (${keys.map(key => `"${key}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(values) as never[])
}
try {
  const base = sqlite.query("SELECT * FROM feature WHERE id='lifecycle-demo-a-feature'").get() as Record<string, unknown> | null
  const revision = sqlite.query("SELECT * FROM locationRevision WHERE id='lifecycle-demo-a-shop-r1'").get() as Record<string, unknown> | null
  if (!base || !revision) throw new Error('Seed lifecycle fixtures first')
  if (!sqlite.query('SELECT 1 FROM user WHERE id=?').get(DEV_PERSONAS.admin.id)) throw new Error('Seed development personas first')
  const fresh = !sqlite.query("SELECT 1 FROM feature WHERE id LIKE 'task-demo-%' LIMIT 1").get()
  // Create separate unpublished Features so review actions never alter imported data or A–Z examples.
  sqlite.exec('BEGIN IMMEDIATE')
  try {
    for (const type of types) {
      const id = `task-demo-${type}`
      if (sqlite.query('SELECT 1 FROM feature WHERE id=?').get(id)) {
        // Upgrade only the initial seed's generated labels; preserve subsequent user edits.
        sqlite.query('UPDATE featureI18n SET title=?, titleGen=0, displayAddressGen=0 WHERE featureId=? AND title=?').run(names[type], id, `Queue example · ${type}`)
        continue
      }
      insert('feature', { ...base, id })
      insert('featureI18n', { featureId: id, locale: 'en', title: names[type], titleGen: 0, displayAddressGen: 0, displayAddress: '18 Sample Street' })
      if (!type.startsWith('location')) {
        insert('task', { id, organisationId: base.organisationId, projectId: base.projectId, featureId: id, contributorId: DEV_PERSONAS.admin.id, isDraft: 0, type, message: 'Synthetic local queue example. Safe to review.', isReviewed: 0 })
        if (type === 'newPhoto') {
          const image = sqlite.query('SELECT imageId FROM taskImage LIMIT 1').get() as { imageId: string } | null
          if (image) insert('taskImage', { taskId: id, imageId: image.imageId })
        }
        continue
      }
      const facts = readLocationFacts(revision.facts)
      facts.names = { en: names[type] }
      insert('location', { id, kind: 'unknown', state: 'unresolved', ownerOrganisationId: base.organisationId })
      insert('locationRevision', { ...revision, id: `${id}-r1`, locationId: id, facts: serializeLocationFacts(facts, 'unknown'), contentHash: `${id}-r1` })
      insert('featureLocation', { featureId: id, locationId: id, version: `${id}-accepted`, factsRevisionId: `${id}-r1`, locationRevisionId: `${id}-r1`, actorId: DEV_PERSONAS.admin.id })
      if (type === 'locationFacts' || type === 'locationPosition') {
        if (type === 'locationFacts') facts.names.en = 'Sample Bakery & Café'
        else facts.location.geometry.coordinates = [114.17, 22.31]
        insert('locationRevision', { ...revision, id: `${id}-r2`, locationId: id, version: 2, facts: serializeLocationFacts(facts, 'unknown'), contentHash: `${id}-r2` })
      }
      if (type === 'locationMerge') {
        insert('location', { id: `${id}-target`, kind: 'unknown', state: 'linked', ssId: `${id}-source`, ownerOrganisationId: null })
        insert('locationRevision', { ...revision, id: `${id}-target-r1`, locationId: `${id}-target`, origin: 'saanseoi', apiVersion: 'fixture', releaseId: 'fixture', snapshotId: 'fixture', ssId: `${id}-source`, facts: serializeLocationFacts(facts, 'unknown'), contentHash: `${id}-target-r1` })
      }
    }
    sqlite.exec('COMMIT')
  } catch (error) { sqlite.exec('ROLLBACK'); throw error }
  // Reuse existing imagery only on synthetic Features; never duplicate or alter the source image.
  const photo = sqlite.query("SELECT imageId FROM featureImage WHERE featureId NOT LIKE 'task-demo-%' AND intent='canonical' ORDER BY featureId LIMIT 1").get() as { imageId: string } | null
  if (!photo) throw new Error('A mirrored Feature photo is required for the queue examples')
  for (const type of types) {
    const id = `task-demo-${type}`
    sqlite.query("INSERT INTO featureImage(featureId,imageId,intent,isPublished) VALUES(?,?,'canonical',0) ON CONFLICT DO NOTHING").run(id, photo.imageId)
    if (!type.startsWith('location')) sqlite.query('INSERT INTO taskImage(taskId,imageId) VALUES(?,?) ON CONFLICT DO NOTHING').run(id, photo.imageId)
  }
  // Upgrade untouched demo comparisons by appending evidence, preserving all immutable prior snapshots.
  for (const type of ['locationFacts', 'locationPosition']) {
    const id = `task-demo-${type}`
    const association = sqlite.query('SELECT factsRevisionId,locationRevisionId,version FROM featureLocation WHERE featureId=?').get(id) as { factsRevisionId: string; locationRevisionId: string; version: string } | null
    const decisions = sqlite.query('SELECT 1 FROM locationAdoptionProposal WHERE featureId=? AND (factsDecision IS NOT NULL OR locationDecision IS NOT NULL) LIMIT 1').get(id)
    if (!association || decisions || association.factsRevisionId !== `${id}-r1` || association.locationRevisionId !== `${id}-r1`) continue
    const facts = readLocationFacts(revision.facts)
    facts.names = { en: names[type as keyof typeof names] }
    facts.location.address.authored = { scope: 'unit', i18n: { en: { formattedAddress: 'Shop 12, 1/F, East Wing, Example Court, 18 Sample Street', buildingName: 'East Wing', premisesName: 'Example Court', blockExpression: 'Block A', phaseExpression: 'Phase 1', buildingNumberExpression: '18', streetName: 'Sample Street' } }, unit: { unitRef: '12', unitType: 'S', floorRef: '1', floorType: 'F', unitPortion: null }, unitI18n: {} }
    facts.location.address.fallbackDisplay = { en: facts.location.address.authored.i18n.en.formattedAddress }
    sqlite.exec('BEGIN IMMEDIATE')
    try {
      insert('locationRevision', { ...revision, id: `${id}-r3`, locationId: id, version: 3, facts: serializeLocationFacts(facts, 'unknown'), contentHash: `${id}-r3` })
      // Pin a populated synthetic baseline so the review can demonstrate both old and new components.
      sqlite.query('UPDATE featureLocation SET factsRevisionId=?,locationRevisionId=?,version=? WHERE featureId=?').run(`${id}-r3`, `${id}-r3`, `${id}-accepted-address`, id)
      if (type === 'locationFacts') facts.names.en = 'Sample Bakery & Café'
      facts.location.geometry.coordinates = type === 'locationFacts' ? [114.162, 22.301] : [114.17, 22.31]
      facts.location.address.authored.unit = { unitRef: '8', unitType: 'S', floorRef: '2', floorType: 'F', unitPortion: null }
      facts.location.address.authored.i18n.en.buildingName = 'West Wing'
      facts.location.address.authored.i18n.en.buildingNumberExpression = '20'
      facts.location.address.authored.i18n.en.formattedAddress = 'Shop 8, 2/F, West Wing, Example Court, 20 Sample Street'
      facts.location.address.fallbackDisplay = { en: facts.location.address.authored.i18n.en.formattedAddress }
      insert('locationRevision', { ...revision, id: `${id}-r4`, locationId: id, version: 4, facts: serializeLocationFacts(facts, 'unknown'), contentHash: `${id}-r4` })
      sqlite.exec('COMMIT')
    } catch (error) { sqlite.exec('ROLLBACK'); throw error }
  }
  // Materialize the demo's accepted address for the ordinary Feature Location tab too.
  for (const type of ['locationFacts', 'locationPosition']) {
    const id = `task-demo-${type}`
    const accepted = sqlite.query('SELECT r.facts FROM featureLocation fl JOIN locationRevision r ON r.id=fl.locationRevisionId WHERE fl.featureId=? AND fl.version=?').get(id, `${id}-accepted-address`) as { facts: string } | null
    if (!accepted) continue
    const facts = readLocationFacts(accepted.facts)
    sqlite.query("UPDATE feature SET addressMeta=json_set(COALESCE(addressMeta,'{}'),'$.address',json(?)) WHERE id=? AND json_extract(addressMeta,'$.address') IS NULL").run(JSON.stringify({ version: 1, source: facts.location.address, coordinates: facts.location.geometry.coordinates, matchStatus: facts.location.address.status, overrides: {} }), id)
  }
  // Persist real comparison evidence; replay retains decisions instead of reopening reviewed tasks.
  for (const type of types.filter(type => type.startsWith('location'))) {
    const id = `task-demo-${type}`
    if (type === 'locationFacts' || type === 'locationPosition') {
      const result = await proposeFeatureLocationAdoption(db, { featureId: id, projectId: String(base.projectId), candidateRevisionId: sqlite.query('SELECT 1 FROM locationRevision WHERE id=?').get(`${id}-r4`) ? `${id}-r4` : `${id}-r2` })
      if (!result) throw new Error(`No adoption proposal for ${type}`)
    } else if (!sqlite.query('SELECT 1 FROM locationIdentityReview WHERE locationId=?').get(id)) {
      const baseline = await readLocationIdentityBaseline(db, id, String(base.organisationId))
      if (!baseline) throw new Error(`No identity baseline for ${type}`)
      const facts = readLocationFacts((sqlite.query('SELECT facts FROM locationRevision WHERE id=?').get(`${id}-r1`) as { facts: string }).facts)
      const review = await captureLocationIdentityReview(db, baseline, { ssId: `${id}-source`, apiVersion: 'fixture', releaseId: 'fixture', snapshotId: 'fixture', facts, rawSource: { synthetic: true }, issues: [] }, DEV_PERSONAS.admin.id)
      if (!review) throw new Error(`No identity review for ${type}`)
    }
  }
  if (fresh) {
    const rows = await db.all<{ type: string }>(sql`${taskQueueProjection()} SELECT DISTINCT type FROM task WHERE featureId LIKE 'task-demo-%'`)
    const missing = types.filter(type => !rows.some(row => row.type === type))
    if (missing.length) throw new Error(`Seed did not expose queue types: ${missing.join(', ')}`)
  }
  console.info(JSON.stringify({ types, features: types.map(type => `task-demo-${type}`) }))
} finally { local.close() }
