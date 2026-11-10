// @vitest-environment node
// TESTING
import { describe, expect, it } from 'vitest'
// FORM CONTRACTS
import {
  MODEL_FORM_TABS,
  SubmittedTabsSchema,
  changedModelTabs,
  gateModelFormData,
  suppliedModelTab,
} from '#lib/forms/modelTabs.js'
import { OrganisationFormData } from '#lib/db/zod/schema/organisation.form.js'
import { FeatureFormData } from '#lib/db/zod/schema/feature.form.js'
import { HubFormData } from '#lib/db/zod/schema/hub.form.js'
import { ProjectFormData } from '#lib/db/zod/schema/project.form.js'
import { LayerFormData } from '#lib/db/zod/schema/layer.form.js'

// SVELTEKIT
// @ts-expect-error The private runtime has no declarations; exercise the installed transport decoder.
import { convert_formdata } from '../../node_modules/@sveltejs/kit/src/runtime/form-utils.js'

const resources = [
  {
    resource: 'organisation',
    schema: OrganisationFormData,
    identity: { code: 'org', url: '' },
  },
  {
    resource: 'feature',
    schema: FeatureFormData,
    identity: { organisationId: 'org', projectId: 'project', layerId: 'layer' },
  },
  { resource: 'hub', schema: HubFormData, identity: { code: 'core', domain: '' } },
  {
    resource: 'project',
    schema: ProjectFormData,
    identity: { code: 'project', organisationId: 'org' },
  },
  { resource: 'layer', schema: LayerFormData, identity: { projectId: 'project' } },
] as const

describe('model form tab submission', () => {
  it.each(resources)(
    '$resource preserves every omitted tab through native decoding and the full schema',
    ({ resource, schema, identity }) => {
      const packet = new FormData()
      packet.set('meta.mode/tab-test', 'update')
      packet.set('meta.id/tab-test', 'record')
      packet.set('meta.updatedAt/tab-test', 'before')
      for (const [key, value] of Object.entries(identity))
        packet.set(`data.${key}/tab-test`, value)
      for (const locale of ['en', 'zhHans', 'zhHant']) {
        packet.set(`data.i18n.${locale}.title/tab-test`, 'Name')
        packet.set(`data.i18n.${locale}.name/tab-test`, 'Name')
        packet.set(`data.i18n.${locale}.nameShort/tab-test`, 'Name')
      }
      const fields = Object.entries(MODEL_FORM_TABS[resource])
        .filter(([tab]) => tab !== 'profile')
        .flatMap(([, fields]) => fields)
      // Invalid controls in unchanged tabs must never reach preflight or persistence.
      for (const field of fields)
        packet.set(`data.${field}/tab-test`, '{invalid unchanged value')
      gateModelFormData(resource, packet, ['profile'])
      const parsed = schema.parse(convert_formdata('tab-test', packet))
      expect(parsed.meta?.submittedTabs).toEqual(['profile'])
      for (const [tab, tabFields] of Object.entries(MODEL_FORM_TABS[resource])) {
        if (tab === 'profile') continue
        for (const field of tabFields) {
          expect(parsed.data).not.toHaveProperty(field)
          expect(suppliedModelTab(parsed, tab, field)).toBe(false)
        }
      }
    },
  )

  it.each(resources)(
    '$resource includes an emptied Fields tab but not unchanged tabs',
    ({ resource, schema }) => {
      const initial = { data: { properties: [{ id: 'retained' }] } }
      const current = { data: { properties: [] } }
      const tabs = changedModelTabs(resource, initial, current)
      expect(tabs).toEqual(['fields'])
      // Removing the final row produces no native property controls; the manifest carries the clear.
      const parsed = schema.parse({
        meta: {
          mode: 'update',
          id: 'record',
          updatedAt: 'before',
          submittedTabs: tabs,
        },
        data: {},
      })
      expect(suppliedModelTab(parsed, 'fields', 'properties')).toBe(true)
      expect(changedModelTabs(resource, initial, initial)).toEqual([])
    },
  )

  it.each(['["profile","profile"]', 'broken', '{}'])(
    'rejects invalid tab manifests: %s',
    value => {
      expect(SubmittedTabsSchema.safeParse(value).success).toBe(false)
    },
  )
})

// Exercise the real schema: absent profile defaults must never become update values.
it.each(resources)(
  '$resource accepts settings-only updates and rejects hidden ownership',
  ({ resource, schema }) => {
    const meta = {
      mode: 'update',
      id: 'record',
      updatedAt: 'revision',
      submittedTabs: ['fields'],
    }
    const parsed = schema.parse({ meta, data: { properties: [] } })
    expect(parsed.data).toEqual({ properties: [] })
    for (const field of MODEL_FORM_TABS[resource].profile) {
      expect(
        schema.safeParse({ meta, data: { properties: [], [field]: 'forged' } }).success,
      ).toBe(false)
    }
    expect(
      schema.safeParse({
        meta: { ...meta, updatedAt: undefined },
        data: { properties: [] },
      }).success,
    ).toBe(false)
    expect(
      schema.safeParse({ meta: { mode: 'create' }, data: { properties: [] } }).success,
    ).toBe(false)
    expect(
      schema.safeParse({ meta: { ...meta, submittedTabs: ['profile'] }, data: {} })
        .success,
    ).toBe(false)
  },
)

it('validates Hub profile dependencies under the partial tab contract', () => {
  expect(
    HubFormData.safeParse({
      meta: {
        id: 'hub',
        updatedAt: 'revision',
        mode: 'update',
        submittedTabs: ['profile'],
      },
      data: {
        code: 'hub',
        domain: '',
        i18n: {},
        isSubscriptionAvailable: true,
        subscriptionService: null,
      },
    }).success,
  ).toBe(false)
})
