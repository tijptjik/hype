import { describe, expect, it } from 'vitest'
import * as browser from '#lib/db/zod/schema/project.form.js'
import * as server from '#lib/db/zod/schema/project.js'
import * as propertyBrowser from '#lib/db/zod/schema/property.form.js'
import * as propertyServer from '#lib/db/zod/schema/property.js'
import { ProjectRoleType } from '#lib/enums.js'

describe('shared project form contract', () => {
  it('uses the same validators for browser preflight and server submission', () => {
    expect(server.ProjectFormData).toBe(browser.ProjectPreflightFormData)
    expect(server.ProjectEntityFormData).toBe(browser.ProjectEntityFormData)
    expect(propertyServer.ProjectPropertyFormData).toBe(
      propertyBrowser.ProjectPropertyFormData,
    )
    expect(propertyServer.ProjectPropertiesFormData).toBe(
      propertyBrowser.ProjectPropertiesFormData,
    )
  })

  it('keeps form role acceptance aligned with the database enum', () => {
    for (const role of [
      ...Object.values(ProjectRoleType),
      'admin',
      '',
      null,
      undefined,
      1,
    ]) {
      expect(browser.ProjectRoleFormData.shape.role.safeParse(role)).toEqual(
        server.ProjectRoleBase.shape.role.safeParse(role),
      )
    }
  })

  it('preserves repeated JSON controls, defaults, and form boolean coercion', () => {
    const schema = browser.ProjectEntityFormData.pick({
      capabilities: true,
      flags: true,
      layers: true,
      markerStyleCode: true,
    })
    expect(
      schema.parse({
        capabilities: ['', '{"manageBakeries":true}'],
        layers: [{ id: 'layer', rank: '2', isDefaultVisible: 'false' }],
        markerStyleCode: '',
      }),
    ).toEqual({
      capabilities: {
        manageBakeries: true,
        manageVolunteers: false,
        manageDropOffs: false,
        viewAnalytics: false,
      },
      flags: {},
      layers: [{ id: 'layer', rank: 2, isDefaultVisible: false }],
      markerStyleCode: null,
    })
  })
})
