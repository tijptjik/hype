// RUNTIME
import { Database } from 'bun:sqlite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
// DOMAIN
import { DisplayTemplateDefinitionSchema } from '../../src/lib/templates/registry'
import {
  featureTemplateTitles,
  featureTemplateValues,
} from '../../src/lib/templates/featureValues'
import { FeatureRevisionContentSchema } from '../../src/lib/revisions/featureContent'
import { readLocationFacts } from '../../src/lib/locations/factsSnapshot'
import { resolveFeatureLocation } from '../../src/lib/locations/resolve'
import {
  amendSharedCorrections,
  SharedCorrectionPatchSchema,
  resolveSharedCorrections,
} from '../../src/lib/locations/sharedCorrection'
import { CANONICAL_DONOR_TEMPLATE_ID as templateId, DONOR_LAYER } from './donor-naming'
// TYPES
import type {
  LocationFacts,
  FeatureLocationOverrides,
} from '../../src/lib/locations/model'

// TABLE OF CONTENTS
// 1. Snapshot and historical brand evidence
// 2. Accepted naming inputs and restoration proposals
// 3. Atomic repair, rehearsal and verification

/** Read an explicit command argument. @param flag CLI option. @returns Required value. */
function argument(flag: string): string {
  const index = process.argv.indexOf(flag)
  const value = process.argv[index + 1]
  if (index < 0 || !value) throw new Error(`Required: ${flag}`)
  return value
}
const path = resolve(argument('--database'))
const output = resolve(argument('--output'))
mkdirSync(output, { recursive: true })
const changeId = 'breadline-restore-brand-references:v1'
const actor = 'hype-local-agent-admin'
const now = new Date().toISOString()
const source = new Database(path, { readonly: true })
const trialPath = resolve(output, `trial-${crypto.randomUUID()}.sqlite`)
writeFileSync(trialPath, source.serialize())
source.close()
const db = new Database(trialPath)
if (db.query('SELECT 1 FROM revisionChangeSet WHERE id=?').get(changeId)) {
  console.log('Brand restoration already applied; no changes.')
  db.close()
  process.exit(0)
}
const mutableTables = [
  'feature',
  'featureI18n',
  'featureLocation',
  'featureDisplayTemplateOutput',
  'locationSharedRevision',
  'locationRevision',
  'identityCatalogue',
  'locationCurationLockRevision',
]
/** Hash migration inputs without exporting source data. @param target SQLite connection. @returns Snapshot digest. */
function fingerprint(target: Database): string {
  const hash = new Bun.CryptoHasher('sha256')
  for (const table of mutableTables)
    hash.update(
      JSON.stringify(target.query(`SELECT * FROM ${table} ORDER BY rowid`).all()),
    )
  return hash.digest('hex')
}
const expected = fingerprint(db)
const skipped: { featureId: string; reason: string }[] = []
const locations = new Set<string>()
const template = db
  .query(
    'SELECT t.version,r.definition FROM displayTemplate t JOIN displayTemplateRevision r ON r.templateId=t.id AND r.version=t.version WHERE t.id=?',
  )
  .get(templateId) as { version: number; definition: string }
if (!template) throw new Error('Missing canonical donor template')
const definition = DisplayTemplateDefinitionSchema.parse(
  JSON.parse(template.definition),
)
const version = template.version
const excluded = db
  .query(
    'SELECT id,featureType,isArchived,currentRevisionId FROM feature WHERE layerId=? AND nameTemplate IS NULL ORDER BY id',
  )
  .all(DONOR_LAYER) as { id: string; featureType: string; isArchived: number }[]
if (excluded.some(row => row.featureType !== 'object' || !row.isArchived))
  throw new Error('Unassigned active donor requires review')
const rows = db
  .query(
    "SELECT f.id,f.currentRevisionId,f.revisionVersion,r.content,r.recordState FROM feature f JOIN featureRevision r ON r.id=f.currentRevisionId WHERE f.layerId=? AND json_extract(f.nameTemplate,'$.rule.registry.id')=? ORDER BY f.id",
  )
  .all(DONOR_LAYER, templateId) as {
  id: string
  currentRevisionId: string
  revisionVersion: number
  content: string
  recordState: string
}[]
const proposals = []
for (const row of rows) {
  const content = FeatureRevisionContentSchema.parse(JSON.parse(row.content))
  if (content.profile.nameTemplate?.rule.registry?.version !== template.version)
    throw new Error(`Unexpected version: ${row.id}`)
  const association = content.placement.location
  if (!association) {
    skipped.push({ featureId: row.id, reason: 'No linked Location' })
    continue
  }
  const head = db
    .query('SELECT id,corrections FROM locationSharedHead WHERE locationId=?')
    .get(association.locationId) as { id: string; corrections: string } | null
  const corrections = JSON.parse(head?.corrections ?? '{}')
  if (
    corrections.brandId?.choice.mode === 'override' &&
    corrections.brandId.choice.value
  )
    continue
  if (corrections.brandId)
    throw new Error(`Explicit shared brand choice needs review: ${row.id}`)
  const historical = db
    .query('SELECT id,content FROM featureRevision WHERE id=? AND featureId=?')
    .get(`breadline-donor-naming:v1:${row.id}`, row.id) as {
    id: string
    content: string
  } | null
  if (!historical) throw new Error(`Missing accepted brand history: ${row.id}`)
  const prior = JSON.parse(historical.content).placement.location
  const brandPin = prior.acceptancePolicy.factsSharedFields.find(
    (pin: { field: string }) => pin.field === 'brandId',
  )
  const evidence = db
    .query('SELECT corrections FROM locationSharedRevision WHERE id=? AND locationId=?')
    .get(brandPin?.revision, prior.locationId) as { corrections: string } | null
  if (!evidence) throw new Error(`Missing accepted brand evidence: ${row.id}`)
  const old = JSON.parse(evidence.corrections)
  const brandId = old.brandId?.choice.value as string | undefined
  if (!brandId) throw new Error(`Missing historical brand: ${row.id}`)
  const brandOverride = association.acceptedOverrides.brandId
  const brandsOverride = association.acceptedOverrides.brands
  if (
    brandOverride &&
    brandOverride.mode !== 'inherit' &&
    (brandOverride.mode !== 'override' || brandOverride.value !== brandId)
  )
    throw new Error(`Conflicting brand override: ${row.id}`)
  if (
    brandsOverride &&
    brandsOverride.mode !== 'inherit' &&
    (brandsOverride.mode !== 'override' ||
      brandsOverride.value.length !== 1 ||
      brandsOverride.value[0]?.identifiers.catalogueId !== brandId)
  )
    throw new Error(`Conflicting brands override: ${row.id}`)

  const catalogue = db
    .query(
      "SELECT c.version,r.content FROM identityCatalogue c JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version WHERE c.id=? AND c.kind='brand'",
    )
    .get(brandId) as { version: number; content: string } | null
  if (!catalogue) throw new Error(`Missing catalogue brand: ${row.id}`)
  const brand = {
    ...JSON.parse(catalogue.content),
    id: brandId,
    kind: 'brand',
    version: catalogue.version,
  }
  if (brand.isArchived) throw new Error(`Archived brand: ${brandId}`)
  const latest = db
    .query(
      'SELECT id,facts FROM locationRevisionContent WHERE locationId=? ORDER BY version DESC LIMIT 1',
    )
    .get(association.locationId) as { id: string; facts: string }
  const sourceFacts = readLocationFacts(latest.facts)
  if (sourceFacts.brandId && sourceFacts.brandId !== brandId)
    throw new Error(`Conflicting source brand: ${row.id}`)
  const locks = db
    .query('SELECT openFields FROM locationCurationLockHead WHERE locationId=?')
    .get(association.locationId) as { openFields: string } | null
  if (
    locks &&
    ['brandId', 'brands'].some(field => JSON.parse(locks.openFields)[field] === false)
  )
    throw new Error(`Locked brand field: ${row.id}`)
  if (locations.has(association.locationId))
    throw new Error(`Shared target requires grouped review: ${association.locationId}`)
  locations.add(association.locationId)
  const names = Object.fromEntries(
    Object.entries(brand.i18n).map(([locale, value]) => [
      locale,
      (value as { name: string }).name,
    ]),
  )
  const sharedId = `${changeId}:location:${association.locationId}`
  const patch = SharedCorrectionPatchSchema.parse({
    brandId: { mode: 'override', value: brandId },
    brands: {
      mode: 'override',
      value: [
        {
          identifiers: {
            catalogueId: brandId,
            catalogueVersion: String(brand.version),
          },
          names,
          ...(brand.logo ? { logo: brand.logo } : {}),
        },
      ],
    },
  })
  const nextCorrections = amendSharedCorrections(corrections, patch, sourceFacts, {
    actorId: actor,
    editedAt: now,
    sourceRevisionId: latest.id,
  })
  if (!nextCorrections.brandId) throw new Error('Missing brand correction')
  nextCorrections.brandId.catalogue = brand
  const revision = `${changeId}:${row.id}`
  // Change only the accepted brand pins; retain branch, address and all other choices.
  const next = JSON.parse(row.content)
  const nextAssociation = next.placement.location
  nextAssociation.associationVersion = revision
  nextAssociation.acceptancePolicy = {
    ...nextAssociation.acceptancePolicy,
    factsSharedFields: [
      ...(nextAssociation.acceptancePolicy?.factsSharedFields ?? []).filter(
        (pin: { field: string }) => !['brandId', 'brands'].includes(pin.field),
      ),
      { field: 'brandId', revision: sharedId },
      { field: 'brands', revision: sharedId },
    ],
    lastSharedRevision: sharedId,
  }
  let effective: ReturnType<typeof resolveFeatureLocation> | undefined
  if (association) {
    const readFacts = (id: string): LocationFacts => {
      const record = db
        .query('SELECT facts FROM locationRevisionContent WHERE id=? AND locationId=?')
        .get(id, association.locationId) as { facts: string } | null
      if (!record) throw new Error(`Missing accepted source: ${id}`)
      return readLocationFacts(record.facts)
    }
    const accepted = association.acceptancePolicy
    const sourceFacts = readFacts(association.factsRevisionId)
    const resolvePin = (facts: LocationFacts, revision: unknown): LocationFacts => {
      if (typeof revision !== 'string') return structuredClone(facts)
      const shared = db
        .query(
          'SELECT corrections FROM locationSharedRevision WHERE id=? AND locationId=?',
        )
        .get(revision, association.locationId) as { corrections: string } | null
      if (!shared) throw new Error(`Missing accepted correction: ${row.id} ${revision}`)
      return resolveSharedCorrections(facts, JSON.parse(shared.corrections), false)
        .facts
    }
    const facts = resolvePin(sourceFacts, accepted?.factsSharedRevision)
    // Apply only explicitly accepted field pins, never the mutable Location head.
    for (const pin of (accepted?.factsSharedFields ?? []) as {
      field: keyof LocationFacts
      revision: string | null
    }[]) {
      const pinned = resolvePin(sourceFacts, pin.revision)
      Object.assign(facts, { [pin.field]: pinned[pin.field] })
      if (pin.field === 'groupId') facts.group = pinned.group
    }
    const position = resolvePin(
      readFacts(association.locationRevisionId),
      accepted?.locationSharedRevision,
    )
    const restored = resolveSharedCorrections(sourceFacts, nextCorrections, false).facts
    facts.brandId = restored.brandId
    facts.brands = restored.brands
    effective = resolveFeatureLocation(
      facts,
      position.location,
      association.acceptedOverrides as FeatureLocationOverrides,
    )
  }
  const titles = featureTemplateTitles(content, definition, effective)
  const before = db
    .query('SELECT locale,title FROM featureI18n WHERE featureId=? ORDER BY locale')
    .all(row.id) as { locale: string; title: string }[]
  if (
    before.length !== Object.keys(titles).length ||
    before.some(t => !Object.hasOwn(titles, t.locale))
  )
    throw new Error(`Locale mismatch: ${row.id}`)
  proposals.push({
    ...row,
    revision,
    next: JSON.stringify(next),
    sharedId,
    locationId: association.locationId,
    previousShared: head?.id ?? null,
    sourceRevision: latest.id,
    corrections: nextCorrections,
    brandId,
    brandName: names.en,
    historicalRevision: historical.id,
    brandEvidence: brandPin.revision,
    titles,
    before,
    inputs: featureTemplateValues(content, 'en', effective),
  })
}
const review = {
  templateId,
  version,
  restored: proposals.length,
  skipped,
  brands: proposals.map(row => ({
    featureId: row.id,
    locationId: row.locationId,
    brandId: row.brandId,
    brandName: row.brandName,
    historicalRevision: row.historicalRevision,
  })),
  changedTitles: proposals
    .flatMap(row =>
      row.before.map(t => ({
        featureId: row.id,
        locale: t.locale,
        before: t.title,
        after: row.titles[t.locale],
      })),
    )
    .filter(row => row.before !== row.after),
}
writeFileSync(resolve(output, 'review.json'), JSON.stringify(review, null, 2))
/** Capture all source and authored content that must remain untouched. @param target SQLite connection. @returns Snapshot digest. */
function protectedState(target: Database): string {
  const hash = new Bun.CryptoHasher('sha256')
  for (const table of [
    'locationRevision',
    'locationRevisionI18n',
    'identityCatalogue',
    'identityCatalogueRevision',
    'featureProperty',
    'featurePropertyI18n',
    'displayTemplate',
    'displayTemplateRevision',
    'featureIntentPolicy',
  ])
    hash.update(
      JSON.stringify(target.query(`SELECT * FROM ${table} ORDER BY rowid`).all()),
    )
  hash.update(
    JSON.stringify(
      target
        .query(
          'SELECT featureId,locale,baseName,nameOverride,description,displayAddress FROM featureI18n ORDER BY featureId,locale',
        )
        .all(),
    ),
  )
  return hash.digest('hex')
}
const protectedBefore = protectedState(db)
/** Verify accepted pins, catalogue reference and title projection before commit. @param target SQLite connection. @returns Nothing. */
function verify(target: Database): void {
  if (protectedState(target) !== protectedBefore)
    throw new Error('Unrelated source or authored data changed')
  for (const row of proposals) {
    const current = target
      .query(
        'SELECT r.content,f.revisionVersion FROM feature f JOIN featureRevision r ON r.id=f.currentRevisionId WHERE f.id=?',
      )
      .get(row.id) as { content: string; revisionVersion: number }
    if (
      current.content !== row.next ||
      current.revisionVersion !== row.revisionVersion + 1
    )
      throw new Error(`History mismatch: ${row.id}`)
    const association = target
      .query('SELECT version,acceptancePolicy FROM featureLocation WHERE featureId=?')
      .get(row.id) as { version: string; acceptancePolicy: string }
    if (
      association.version !== row.revision ||
      association.acceptancePolicy !==
        JSON.stringify(JSON.parse(row.next).placement.location.acceptancePolicy)
    )
      throw new Error(`Acceptance mismatch: ${row.id}`)
    const shared = target
      .query('SELECT corrections FROM locationSharedHead WHERE locationId=?')
      .get(row.locationId) as { corrections: string }
    if (
      JSON.stringify(JSON.parse(shared.corrections)) !== JSON.stringify(row.corrections)
    )
      throw new Error(`Brand mismatch: ${row.id}`)
    const actual = target
      .query('SELECT locale,title FROM featureI18n WHERE featureId=? ORDER BY locale')
      .all(row.id)
    if (
      JSON.stringify(actual) !==
      JSON.stringify(
        row.before.map(t => ({ locale: t.locale, title: row.titles[t.locale] })),
      )
    )
      throw new Error(`Title mismatch: ${row.id}`)
  }
  if (target.query('PRAGMA foreign_key_check').get())
    throw new Error('Foreign key check failed')
  if (
    (target.query('PRAGMA integrity_check').get() as Record<string, string>)
      .integrity_check !== 'ok'
  )
    throw new Error('Integrity check failed')
  if (target.query('SELECT 1 FROM featureRevisionWriteScope').get())
    throw new Error('Unclosed revision scope')
}
/** Apply the guarded migration atomically. @param target Destination. @param backup Save the locked live snapshot before writes. @returns Nothing. */
function apply(target: Database, backup = false): void {
  target.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE')
  try {
    if (target.query('SELECT 1 FROM revisionChangeSet WHERE id=?').get(changeId)) {
      verify(target)
      target.exec('ROLLBACK')
      return
    }
    if (fingerprint(target) !== expected)
      throw new Error('Snapshot changed; regenerate preview')
    if (backup) writeFileSync(resolve(output, 'before.sqlite'), target.serialize())
    target
      .query(
        'INSERT INTO revisionChangeSet(id,actorId,origin,reason,createdAt) VALUES(?,?,?,?,?)',
      )
      .run(
        changeId,
        actor,
        'migration',
        'Restore previously accepted donor brand references after Location relinking. Refs #194.',
        now,
      )
    for (const row of proposals) {
      target
        .query(
          'INSERT INTO locationSharedRevision(id,locationId,previousRevisionId,sourceRevisionId,corrections,actorId,provenance,createdAt) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          row.sharedId,
          row.locationId,
          row.previousShared,
          row.sourceRevision,
          JSON.stringify(row.corrections),
          actor,
          JSON.stringify({
            kind: 'breadline-brand-restoration',
            featureId: row.id,
            acceptedFeatureRevision: row.historicalRevision,
            acceptedBrandRevision: row.brandEvidence,
          }),
          now,
        )
      target
        .query('INSERT INTO featureRevisionWriteScope VALUES(?,?)')
        .run(row.id, changeId)
      target
        .query(
          'INSERT INTO featureRevision(id,featureId,previousRevisionId,changeSetId,schemaVersion,content,recordState,sequence) SELECT ?,featureId,id,?,schemaVersion,?,recordState,sequence+1 FROM featureRevision WHERE id=?',
        )
        .run(row.revision, changeId, row.next, row.currentRevisionId)
      target
        .query(
          'INSERT INTO featureRevisionImage(featureRevisionId,imageId,imageRevisionId,position,intent) SELECT ?,imageId,imageRevisionId,position,intent FROM featureRevisionImage WHERE featureRevisionId=?',
        )
        .run(row.revision, row.currentRevisionId)
      target
        .query(
          'UPDATE featureLocation SET version=?,acceptancePolicy=?,actorId=? WHERE featureId=?',
        )
        .run(
          row.revision,
          JSON.stringify(JSON.parse(row.next).placement.location.acceptancePolicy),
          actor,
          row.id,
        )
      target
        .query(
          'UPDATE feature SET currentRevisionId=?,revisionVersion=revisionVersion+1,modifiedAt=? WHERE id=?',
        )
        .run(row.revision, now, row.id)
      target
        .query('DELETE FROM featureDisplayTemplateOutput WHERE featureId=?')
        .run(row.id)
      for (const [locale, title] of Object.entries(row.titles))
        target
          .query('INSERT INTO featureDisplayTemplateOutput VALUES(?,?,?,?,?)')
          .run(row.id, locale, templateId, version, title)
      target
        .query('DELETE FROM featureRevisionWriteScope WHERE featureId=? AND token=?')
        .run(row.id, changeId)
    }
    verify(target)
    target.exec('COMMIT')
  } catch (error) {
    target.exec('ROLLBACK')
    throw error
  }
}
apply(db)
const first = fingerprint(db)
apply(db)
if (fingerprint(db) !== first) throw new Error('Replay changed data')
db.close()
if (process.argv.includes('--apply')) {
  const live = new Database(path)
  apply(live, true)
  live.close()
}
console.log(
  JSON.stringify({
    mode: process.argv.includes('--apply') ? 'applied' : 'rehearsed',
    restored: proposals.length,
    skipped: skipped.length,
    changedTitles: review.changedTitles.length,
    output,
  }),
)
