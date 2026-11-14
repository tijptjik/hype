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
import { resolveSharedCorrections } from '../../src/lib/locations/sharedCorrection'
import { CANONICAL_DONOR_TEMPLATE_ID as templateId, DONOR_LAYER } from './donor-naming'
// TYPES
import type {
  LocationFacts,
  FeatureLocationOverrides,
} from '../../src/lib/locations/model'

// TABLE OF CONTENTS
// 1. Read-only local snapshot
// 2. Accepted naming inputs and generated-title comparison

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
const source = new Database(path, { readonly: true })
// Hold a consistent SQLite read transaction; never create or update live records.
const db = source
db.exec('BEGIN')
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
    titles,
    before,
    inputs: featureTemplateValues(content, 'en', effective),
  })
}
const review = {
  templateId,
  version,
  assigned: rows.length,
  excluded,
  changes: proposals
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
writeFileSync(resolve(output, 'template.json'), JSON.stringify(definition, null, 2))
writeFileSync(
  resolve(output, 'inputs.json'),
  JSON.stringify(
    proposals.map(row => ({
      featureId: row.id,
      title: row.titles.en,
      inputs: row.inputs,
    })),
    null,
    2,
  ),
)
db.close()
console.log(
  JSON.stringify({
    mode: 'read-only audit',
    version,
    donors: proposals.length,
    excluded: excluded.length,
    changedTitles: review.changes.length,
    output,
  }),
)
