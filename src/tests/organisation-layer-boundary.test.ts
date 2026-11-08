import { describe, expect, it } from 'vitest'
import * as browser from '#lib/db/zod/schema/organisation.form.js'
import * as server from '#lib/db/zod/schema/organisation.js'
import { LayerMetadataSchema } from '#lib/db/zod/schema/layerMetadata.js'
import { LayerMetadataSchema as ServerLayerMetadataSchema } from '#lib/db/zod/schema/layer.js'

describe('organisation and layer browser contracts', () => {
  it('shares form validators with the server', () => {
    expect(browser.OrganisationPreflightFormData).toBe(server.OrganisationFormData)
    expect(browser.OrganisationUpdateFormData).toBe(server.OrganisationUpdateFormData)
    expect(LayerMetadataSchema).toBe(ServerLayerMetadataSchema)
  })

  it('requires an owner and excludes audience roles from staff forms', () => {
    for (const userRoles of [
      undefined,
      [],
      [{ userId: 'member', role: 'member' }],
      [{ userId: 'audience', role: 'user' }],
    ]) {
      expect(browser.OrganisationUserRolesFormData.safeParse(userRoles).success).toBe(
        false,
      )
    }
    expect(
      browser.OrganisationUserRolesFormData.parse([
        { userId: 'owner', role: 'owner', viewAnalytics: 'false' },
      ]),
    ).toEqual([{ userId: 'owner', role: 'owner', viewAnalytics: false }])
  })

  it('retains inheritance normalization and extensible metadata', () => {
    expect(
      LayerMetadataSchema.parse({
        markerStyleCode: '',
        cardStyleCode: null,
        mapStyleCode: '',
        allowFeatureDescriptions: 'false',
        extension: { value: 1 },
      }),
    ).toEqual({
      mapStyleCode: null,
      allowFeatureDescriptions: false,
      extension: { value: 1 },
    })
    expect(
      LayerMetadataSchema.safeParse({ mapStyleCode: 'unknown-style' }).success,
    ).toBe(false)
  })
})
