// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { migrateResearchSettings } from '#lib/fieldResearch/configurationMigration.js'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import {
  componentFields,
  expressionSource,
  updateComponentField,
} from '#lib/templates/componentEditor.js'
import {
  parseDisplayTemplate,
  renderDisplayTemplate,
} from '#lib/templates/displayTemplate.js'
import {
  researchConfigurationSchema,
  researchPropertyIncluded,
  initialResearchProperties,
  suggestResearchFeatureType,
  researchLayerOverridesSchema,
  resolveResearchConfiguration,
} from '#lib/fieldResearch/configuration.js'

describe('field research configuration', () => {
  it('inherits defaults and replaces only explicitly overridden settings', () => {
    const session = researchConfigurationSchema.parse({
      code: 'SURVEY',
      properties: {
        material: { isVisible: true, isRecordable: true, defaultValue: 'stone' },
      },
    })
    const overrides = researchLayerOverridesSchema.parse({
      defaults: { isVisitable: true },
      fieldVisibility: { isDraft: false },
      properties: { material: { isVisible: false, defaultValue: null } },
    })
    const resolved = resolveResearchConfiguration(session, overrides)
    expect(resolved.defaults).toEqual({
      featureType: 'object',
      isVisitable: true,
      isIntangible: false,
      isDraft: true,
      isPendingReview: true,
    })
    expect(resolved.properties.material).toEqual({
      isVisible: false,
      isRecordable: false,
      defaultValue: null,
    })
    expect(resolved.fieldVisibility.isDraft).toBe(false)
    expect(resolved.fieldVisibility.isVisitable).toBe(true)
    expect(session.properties.material.isVisible).toBe(true)
  })
  it('normalizes legacy flags into inclusion while retaining inherited defaults', () => {
    const session = researchConfigurationSchema.parse({
      code: 'TEST',
      properties: {
        material: { isVisible: true, isRecordable: false, defaultValue: 'stone' },
      },
    })
    expect(session.properties.material).toEqual({
      isVisible: true,
      isRecordable: true,
      defaultValue: 'stone',
    })
    const layer = researchLayerOverridesSchema.parse({
      properties: { material: { defaultValue: 'wood' } },
    })
    expect(researchPropertyIncluded(layer.properties.material)).toBeUndefined()
    expect(resolveResearchConfiguration(session, layer).properties.material).toEqual({
      isVisible: true,
      isRecordable: true,
      defaultValue: 'wood',
    })
    expect(researchPropertyIncluded({ isVisible: false, isRecordable: true })).toBe(
      true,
    )
  })
  it('renders zero-padded ordinals and rejects templates without a sequence', () => {
    const template = '{{session.code}}-{{000}}'
    expect(
      renderDisplayTemplate(template, {
        'session.code': 'SURVEY',
        'session.sequence': 7,
      }),
    ).toBe('SURVEY-007')
    expect(
      renderDisplayTemplate(template, {
        'session.code': 'SURVEY',
        'session.sequence': 1000,
      }),
    ).toBe('SURVEY-1000')
    expect(renderDisplayTemplate(template, { 'session.code': 'SURVEY' })).toBe(
      'SURVEY-',
    )
    expect(() =>
      researchConfigurationSchema.parse({
        code: 'SURVEY',
        properties: {},
        titleTemplate: '{{session.code}}',
      }),
    ).toThrow()
  })
  it('edits legacy sequences with named digit and padding options', () => {
    const legacy = parseDisplayTemplate('{{000}}').components[0].expression
    expect(componentFields(legacy).map(field => [field.label, field.value])).toEqual([
      ['Number of digits', '3'],
      ['Zero-padded', 'true'],
    ])
    const unpadded = updateComponentField(legacy, [1], 'false')
    const wider = updateComponentField(unpadded, [0], '5')
    const source = `{{ ${expressionSource(wider)} }}`
    expect(source).toBe('{{ sequence(5, false) }}')
    expect(renderDisplayTemplate(source, { 'session.sequence': 7 })).toBe('7')
    const padded = `{{ ${expressionSource(updateComponentField(wider, [1], 'true'))} }}`
    expect(renderDisplayTemplate(padded, { 'session.sequence': 7 })).toBe('00007')
    expect(renderDisplayTemplate(padded, { 'session.sequence': 123456 })).toBe('123456')
    expect(
      researchConfigurationSchema.parse({
        code: 'ACTUAL',
        properties: {},
        titleTemplate: `{{session.code}}-${source}`,
      }).titleTemplate,
    ).toContain('sequence(5, false)')
    expect(updateComponentField(wider, [0], '0')).toEqual(wider)
    expect(updateComponentField(wider, [0], '21')).toEqual(wider)
    expect(() => parseDisplayTemplate('{{ sequence(21, true) }}')).toThrow()
    expect(() => parseDisplayTemplate('{{ sequence(0, false) }}')).toThrow()
  })
  it('migrates the legacy default and enforces only one default layer', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec(
        `CREATE TABLE layer(id TEXT PRIMARY KEY); CREATE TABLE fieldResearchSession(id TEXT PRIMARY KEY, layerId TEXT); INSERT INTO layer VALUES ('one'), ('two'); INSERT INTO fieldResearchSession VALUES ('session', 'one');`,
      )
      db.exec(readFileSync('migrations/0261_field_research_configuration.sql', 'utf8'))
      expect(
        db
          .prepare(
            'SELECT layerId, isDefault FROM fieldResearchSessionLayer WHERE sessionId=?',
          )
          .get('session'),
      ).toMatchObject({ layerId: 'one', isDefault: 1 })
      expect(() =>
        db
          .prepare(
            'INSERT INTO fieldResearchSessionLayer(sessionId,layerId,isDefault) VALUES(?,?,1)',
          )
          .run('session', 'two'),
      ).toThrow()
      db.prepare(
        'INSERT INTO fieldResearchSessionLayer(sessionId,layerId,isDefault) VALUES(?,?,0)',
      ).run('session', 'two')
    } finally {
      db.close()
    }
  })
})

it('migrates compatible false values, sparse overrides, removed keys and newly required defaults', () => {
  const source = {
    settings: {
      code: 'A',
      obsolete: 1,
      defaults: { isDraft: false, isVisitable: 'yes' },
      properties: {
        retired: {},
        p: { defaultValue: 'retired-option', isVisible: true },
      },
    },
    layers: [
      {
        layerId: 'l',
        isDefault: true,
        overrides: {
          defaults: { isIntangible: false },
          properties: { p: { isRecordable: false } },
        },
      },
    ],
  }
  const catalogue = {
    types: ['object'],
    layers: new Map([['l', ['object']]]),
    properties: [
      {
        id: 'p',
        type: 'specifier' as const,
        dataType: 'boolean' as const,
        cardinality: 'one' as const,
      },
    ],
  }
  const result = migrateResearchSettings(source, 0, 1, 'session', catalogue)
  expect(result.settings.defaults).toMatchObject({
    isDraft: false,
    isVisitable: true,
    isPendingReview: true,
  })
  expect(result.settings.properties).toEqual({
    p: { isVisible: true, isRecordable: true },
  })
  expect(result.layers[0].overrides).toEqual({
    defaults: { isIntangible: false },
    properties: { p: { isRecordable: false, isVisible: false } },
    fieldVisibility: {},
  })
  expect(result.removed).toEqual(
    expect.arrayContaining([
      'session.obsolete',
      'session.properties.retired',
      'session.properties.p.defaultValue',
      'session.defaults.isVisitable',
    ]),
  )
  expect(result.defaulted).toContain('session.defaults.isPendingReview')
  expect(() => migrateResearchSettings(source, 2, 1, 'session', catalogue)).toThrow()
})

it('copies active layer fields and retains explicit session exclusions', () => {
  const layers = {
    donors: { brand: { isVisible: true, isRecordable: true } },
    dropoff: { grade: { isVisible: false, isRecordable: false } },
  }
  expect(initialResearchProperties([{ id: 'brand' }, { id: 'grade' }], layers)).toEqual(
    {
      brand: { isVisible: true, isRecordable: true },
      grade: { isVisible: false, isRecordable: false },
    },
  )
  expect(
    initialResearchProperties([{ id: 'brand' }], layers, {
      brand: { isVisible: false, isRecordable: false },
    }).brand.isVisible,
  ).toBe(false)
})

it('starts with affirmative feature flags and suggests the most-used allowed type', () => {
  const settings = researchConfigurationSchema.parse({ code: 'NEW', properties: {} })
  expect(settings.defaults).toMatchObject({
    isVisitable: true,
    isIntangible: false,
    isDraft: true,
    isPendingReview: true,
  })
  const types = [{ id: 'object' }, { id: 'place' }, { id: 'retired', enabled: false }]
  expect(
    suggestResearchFeatureType(types, [
      { featureType: 'place', count: 20 },
      { featureType: 'object', count: 2 },
      { featureType: 'retired', count: 100 },
    ]),
  ).toBe('place')
  expect(suggestResearchFeatureType(types, [])).toBe('object')
  expect(suggestResearchFeatureType([{ id: 'retired', enabled: false }], [])).toBeNull()
})
