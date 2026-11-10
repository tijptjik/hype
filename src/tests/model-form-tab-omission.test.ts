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
import { HubFormData } from '#lib/db/zod/schema/hub.form.js'
import { ProjectFormData } from '#lib/db/zod/schema/project.form.js'
import { LayerFormData } from '#lib/db/zod/schema/layer.form.js'

// SVELTEKIT
// @ts-expect-error The private runtime has no declarations; exercise the installed transport decoder.
import { convert_formdata } from '../../node_modules/@sveltejs/kit/src/runtime/form-utils.js'

const resources = [
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
        packet.set(`data.i18n.${locale}.name/tab-test`, 'Name')
        packet.set(`data.i18n.${locale}.nameShort/tab-test`, 'Name')
      }
      const fields = Object.values(MODEL_FORM_TABS[resource]).flat()
      // Invalid controls in unchanged tabs must never reach preflight or persistence.
      for (const field of fields)
        packet.set(`data.${field}/tab-test`, '{invalid unchanged value')
      gateModelFormData(resource, packet, ['profile'])
      const parsed = schema.parse(convert_formdata('tab-test', packet))
      expect(parsed.meta?.submittedTabs).toEqual(['profile'])
      for (const [tab, tabFields] of Object.entries(MODEL_FORM_TABS[resource])) {
        for (const field of tabFields) {
          expect(parsed.data).not.toHaveProperty(field)
          expect(suppliedModelTab(parsed, tab, field)).toBe(false)
        }
      }
    },
  )

  it.each(resources)(
    '$resource includes an emptied Fields tab but not unchanged tabs',
    ({ resource, schema, identity }) => {
      const initial = { data: { properties: [{ id: 'retained' }] } }
      const current = { data: { properties: [] } }
      const tabs = changedModelTabs(resource, initial, current)
      expect(tabs).toEqual(['profile', 'fields'])
      // Removing the final row produces no native property controls; the manifest carries the clear.
      const parsed = schema.parse({
        meta: { mode: 'update', submittedTabs: tabs },
        data: {
          ...identity,
          i18n: {
            en: { name: 'Name', nameShort: 'Name' },
            zhHans: { name: 'Name', nameShort: 'Name' },
            zhHant: { name: 'Name', nameShort: 'Name' },
          },
        },
      })
      expect(suppliedModelTab(parsed, 'fields', 'properties')).toBe(true)
      expect(changedModelTabs(resource, initial, initial)).toEqual(['profile'])
    },
  )

  it.each(['[]', '["profile","profile"]', 'broken', '{}'])(
    'rejects invalid tab manifests: %s',
    value => {
      expect(SubmittedTabsSchema.safeParse(value).success).toBe(false)
    },
  )
})
