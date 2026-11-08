// @vitest-environment node
import { expect, it } from 'vitest'
import { featureReviewLabel, featureReviewValue } from '#lib/revisions/featureReviewDisplay.js'
import { describeFeatureTransfers } from '#lib/db/services/featureTransferDescription.js'
import { featureRevisionContentFixture } from './fixtures/featureRevisionContent'
import { publicationSqlite } from './fixtures/publicationSqlite'
import type { RevisionDifference } from '#lib/revisions/diff.js'
import type { Database } from '#lib/types.js'

it('uses retained labels and options for a removed property without empty bookkeeping or IDs', () => {
  const property = featureRevisionContentFixture().properties.choice
  property.selection.definition.labels = { en: { value: 'Material', generated: false } }
  property.selection.definition.selectedOption = { id: 'opaque-option', value: 'Glass', translations: {} }
  property.selection.propertyValueId = 'opaque-option'
  property.selection.value = ''
  property.selection.valueJson = null
  property.translations = {}
  const change: RevisionDifference = { path: ['properties','opaque-property'], before: { present: true, value: property }, after: { present: false } }
  expect(featureReviewLabel(change.path, change)).toBe('Material')
  expect(featureReviewValue(change, 'before')).toBe('Glass')
  expect(featureReviewValue(change, 'after')).toBe('Removed')
  property.selection.definition.selectedOption = null
  expect(featureReviewValue(change, 'before')).toBe('Selected option (label unavailable)')
})

it('resolves existing transfer reasons into names without rewriting audit text or exposing missing IDs', async () => {
  const connection = publicationSqlite({})
  try {
    connection.sqlite.exec(`CREATE TABLE organisationI18n(organisationId TEXT,locale TEXT,name TEXT,nameShort TEXT);
      CREATE TABLE projectI18n(projectId TEXT,locale TEXT,name TEXT,nameShort TEXT);
      CREATE TABLE layerI18n(layerId TEXT,locale TEXT,name TEXT,nameShort TEXT);
      INSERT INTO organisationI18n VALUES('source-org','en','Hong Kong Ghost Signs','Ghost Signs'),('target-org','en','Archive','');
      INSERT INTO projectI18n VALUES('source-project','en','HK Ghost Signs','HKGS'),('target-project','en','Sign collection','Signs');
      INSERT INTO layerI18n VALUES('source-layer','en','Current',''),('target-layer','en','Historic','');`)
    const reason = 'Feature transferred from source-org/source-project/source-layer to target-org/target-project/target-layer'
    const entries = [{reason}, {reason:'Feature published'}, {reason:'Feature transferred from gone/gone/gone to target-org/target-project/target-layer'}]
    await describeFeatureTransfers(connection.db as unknown as Database, entries)
    expect(entries[0].reason).toBe('Feature moved from Ghost Signs › HKGS › Current to Archive › Signs › Historic')
    expect(entries[1].reason).toBe('Feature published')
    expect(entries[2].reason).not.toContain('gone')
    expect(reason).toContain('source-org')
  } finally { connection.sqlite.close() }
})
