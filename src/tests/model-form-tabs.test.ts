// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  changedModelTabs,
  gateModelFormData,
  suppliedModelTab,
  validateModelTabs,
} from '#lib/forms/modelTabs.js'
import {
  FeatureIntentSettingsFormData,
  DEFAULT_FEATURE_TYPES,
} from '#lib/features/intents.js'
import { HubEntityFormData } from '#lib/db/zod/schema/hub.form.js'
import { ProjectEntityFormData } from '#lib/db/zod/schema/project.form.js'
import { LayerEntityFormData } from '#lib/db/zod/schema/layer.form.js'

describe('model form tab submission', () => {
  it('omits unchanged model/field tabs without mutating the draft', () => {
    const initial = {
      data: {
        code: 'old',
        properties: [{ key: 'broken' }],
        featureIntentSettings: undefined,
      },
    }
    const draft = { data: { ...initial.data, code: 'new' } }
    const tabs = changedModelTabs('project', initial, draft)
    expect(tabs).toEqual(['profile'])
    const packet = new FormData()
    packet.set('data.code', 'new')
    packet.set('data.properties[0].key', 'broken')
    gateModelFormData('project', packet, tabs)
    expect([...packet.keys()]).toEqual(['data.code', 'meta.submittedTabs'])
    expect(draft.data.properties).toEqual(initial.data.properties)
  })
  it('preserves native remote-form binding suffixes and removes typed controls', () => {
    const packet = new FormData()
    packet.set('meta.id/action-hash/form', 'project')
    packet.set('b:data.properties[0].isRequired/action-hash/form', 'on')
    packet.set('data.featureIntentSettings/action-hash/form', 'bad json')
    gateModelFormData('project', packet, ['profile'])
    expect([...packet.keys()]).toEqual([
      'meta.id/action-hash/form',
      'meta.submittedTabs/action-hash/form',
    ])
  })
  it('includes an explicit empty replacement and keeps omission distinct', () => {
    expect(
      changedModelTabs(
        'hub',
        { data: { properties: [{ id: 'one' }] } },
        { data: { properties: [] } },
      ),
    ).toEqual(['profile', 'fields'])
    expect(
      suppliedModelTab(
        { meta: { submittedTabs: ['profile', 'fields'] }, data: {} },
        'fields',
        'properties',
      ),
    ).toBe(true)
    expect(
      suppliedModelTab(
        { meta: { submittedTabs: ['profile'] }, data: {} },
        'fields',
        'properties',
      ),
    ).toBe(false)
    expect(suppliedModelTab({ data: { properties: [] } }, 'fields', 'properties')).toBe(
      true,
    )
  })
  it('rejects hidden payloads and missing required dependency tabs', () => {
    const schema = z
      .object({
        meta: z.object({ mode: z.string(), submittedTabs: z.array(z.string()) }),
        data: z.record(z.string(), z.unknown()),
      })
      .superRefine((value, ctx) => validateModelTabs('project', value, ctx))
    expect(
      schema.safeParse({
        meta: { mode: 'update', submittedTabs: ['profile'] },
        data: { properties: [] },
      }).success,
    ).toBe(false)
    expect(
      schema.safeParse({
        meta: { mode: 'update', submittedTabs: ['location'] },
        data: {},
      }).success,
    ).toBe(false)
    expect(
      schema.safeParse({
        meta: { mode: 'update', submittedTabs: ['profile', 'location'] },
        data: {},
      }).success,
    ).toBe(true)
  })
  it('retains the last-user invariant for an explicitly emptied hub Members tab', () => {
    const schema = z
      .object({
        meta: z.object({ mode: z.string(), submittedTabs: z.array(z.string()) }),
        data: z.record(z.string(), z.unknown()),
      })
      .superRefine((value, ctx) => validateModelTabs('hub', value, ctx))
    expect(
      schema.safeParse({
        meta: { mode: 'update', submittedTabs: ['profile', 'members'] },
        data: {},
      }).success,
    ).toBe(false)
    expect(
      schema.safeParse({
        meta: { mode: 'update', submittedTabs: ['profile'] },
        data: {},
      }).success,
    ).toBe(true)
  })
  it('does not default missing relation tabs to replacement arrays', () => {
    expect(HubEntityFormData.shape.properties.parse(undefined)).toBeUndefined()
    expect(HubEntityFormData.shape.organisations.parse(undefined)).toBeUndefined()
    expect(HubEntityFormData.shape.userRoles.parse(undefined)).toBeUndefined()
    expect(ProjectEntityFormData.shape.properties.parse(undefined)).toBeUndefined()
    expect(LayerEntityFormData.shape.properties.parse(undefined)).toBeUndefined()
  })
  it('validates the model only when its field is supplied', () => {
    expect(FeatureIntentSettingsFormData.parse(undefined)).toBeUndefined()
    expect(FeatureIntentSettingsFormData.safeParse('{broken').success).toBe(false)
    expect(
      FeatureIntentSettingsFormData.parse(
        JSON.stringify({
          definition: DEFAULT_FEATURE_TYPES,
          version: 0,
          fingerprint: 'before',
        }),
      )?.definition,
    ).toEqual(DEFAULT_FEATURE_TYPES)
  })
})
