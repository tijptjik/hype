// @vitest-environment node
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import {
  createFeatureParentSectionController,
  featureCreationSourceLayerId,
  toParentLayerItem,
} from '#lib/bits/patterns/forms/formFeatureParentSection/formFeatureParentSection.controller.js'

const historical = {
  id: 'historic',
  historicalSourceLayerId: 'source',
  projectId: 'project',
  organisationId: 'organisation',
  code: '',
}

describe('historical feature creation selection', () => {
  it('retains the historical choice and sets status, then clears status for an ordinary choice', () => {
    const applyFeatureParentSelection = vi.fn()
    const controller = createFeatureParentSectionController({
      getCreatableProjectRecords: async () => [],
      searchParentOrganisations: async () => [],
      searchParentLayers: async () => [],
      syncSelectedOrganisation: vi.fn(),
      syncSelectedProject: vi.fn(),
      syncSelectedLayer: vi.fn(),
      getSelectedOrganisation: () => null,
      getSelectedProject: () => null,
      getSelectedLayer: () => null,
      getOrganisationIdValue: () => '',
      getProjectIdValue: () => '',
      getLayerIdValue: () => '',
      getIsReplacingParentProject: () => false,
      getIsReplacingParentLayer: () => false,
      setIsReplacingParentProject: vi.fn(),
      setIsReplacingParentLayer: vi.fn(),
      applyFeatureParentSelection,
    })
    const item = toParentLayerItem(historical)
    if (!item) throw new Error('Expected a historical choice')
    controller.onReplaceParentLayer(item)
    expect(applyFeatureParentSelection).toHaveBeenLastCalledWith({
      organisationId: 'organisation',
      projectId: 'project',
      layerId: 'historic',
      isIntangible: true,
    })
    expect(featureCreationSourceLayerId('historic', item)).toBe('source')
    controller.onReplaceParentLayer({
      ...item,
      id: 'source',
      historicalSourceLayerId: null,
    })
    expect(applyFeatureParentSelection).toHaveBeenLastCalledWith({
      organisationId: 'organisation',
      projectId: 'project',
      layerId: 'source',
      isIntangible: false,
    })
  })

  it('routes a historical creation submitted through its source into the selected collection', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec(`
        CREATE TABLE project(id TEXT, flags TEXT);
        CREATE TABLE layer(id TEXT, projectId TEXT, historicalSourceLayerId TEXT);
        CREATE TABLE feature(id TEXT, layerId TEXT, isIntangible INTEGER);
        INSERT INTO project VALUES('project','{"showHistoricalLayers":true}');
        INSERT INTO layer VALUES('source','project',NULL),('historic','project','source');
      `)
      const migration = readFileSync('migrations/0147_historical_layers.sql', 'utf8')
      const trigger = migration.match(
        /CREATE TRIGGER historical_feature_insert[\s\S]*?END;/,
      )?.[0]
      if (!trigger) throw new Error('Missing historical creation trigger')
      db.exec(trigger)
      db.prepare('INSERT INTO feature VALUES(?,?,?)').run(
        'new',
        featureCreationSourceLayerId('historic', historical),
        1,
      )
      expect(db.prepare('SELECT layerId,isIntangible FROM feature').get()).toEqual({
        layerId: 'historic',
        isIntangible: 1,
      })
    } finally {
      db.close()
    }
  })

  it('never substitutes ancestry from a stale selection', () => {
    expect(featureCreationSourceLayerId('other', historical)).toBe('other')
    expect(featureCreationSourceLayerId('source', null)).toBe('source')
  })
})
