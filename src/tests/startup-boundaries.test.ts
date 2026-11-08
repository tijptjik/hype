// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

// Browser policy and catalogue entry points must never evaluate database or style builders.
vi.mock('#lib/db/schema/index.js', () => {
  throw new Error('Database schema reached browser startup')
})
vi.mock('drizzle-zod', () => {
  throw new Error('Database schema factory reached browser startup')
})
vi.mock('drizzle-orm', () => {
  throw new Error('SQL runtime reached browser startup')
})
vi.mock('#lib/map/styles/builders.js', () => {
  throw new Error('Style builders reached catalogue startup')
})
vi.mock('@protomaps/basemaps', () => {
  throw new Error('Basemap builder reached catalogue startup')
})

import { authorizeHubList, toHubAuthActor } from '#lib/api/services/authz/hubPolicy.js'
import { resolveLayerActionPermissions } from '#lib/api/services/authz/layerPolicy.js'
import { canViewAnalytics } from '#lib/client/services/auth.js'
import {
  MAP_STYLE_KEYS,
  isMapStyleKey,
  listMapStyleCatalog,
} from '#lib/map/styles/metadata.js'
import { adminIntentOrder } from '#lib/images/intentOrder.js'

import { ProjectPreflightFormData } from '#lib/db/zod/schema/project.form.js'
import { ProjectPropertiesFormData } from '#lib/db/zod/schema/property.form.js'

import { OrganisationPreflightFormData } from '#lib/db/zod/schema/organisation.form.js'
import { LayerMetadataSchema } from '#lib/db/zod/schema/layerMetadata.js'

import { OrganisationAdminProfileAPI } from '#lib/db/zod/schema/organisation.profile.js'
import { HubPreflightFormData } from '#lib/db/zod/schema/hub.form.js'
import { LayerPreflightFormData } from '#lib/db/zod/schema/layer.form.js'
import { FeaturePreflightFormData } from '#lib/db/zod/schema/feature.form.js'
import { FeatureI18nBase } from '#lib/db/zod/schema/featureI18n.js'
import { ImageMetadataFullSchema } from '#lib/db/zod/schema/imageMetadata.js'
import { parseSessionSettings } from '#lib/auth/session-settings.js'
import { PropertyDetailProfileAPI } from '#lib/db/zod/schema/property.profile.js'

describe('browser startup boundaries', () => {
  it('loads browser form validation without database schema factories', () => {
    expect(ProjectPreflightFormData.shape.data.shape.organisationId.parse('org')).toBe(
      'org',
    )
    expect(
      ProjectPropertiesFormData.safeParse({ data: { properties: [] } }).success,
    ).toBe(true)
  })

  it('loads organisation and layer validation without database dependencies', () => {
    expect(
      OrganisationPreflightFormData.shape.data.shape.code.parse('organisation'),
    ).toBe('organisation')
    expect(
      LayerMetadataSchema.parse({
        markerStyleCode: '',
        cardStyleCode: '',
        mapStyleCode: '',
      }),
    ).toEqual({ mapStyleCode: null })
  })

  it('loads every remaining editor and import contract without SQL', () => {
    expect(OrganisationAdminProfileAPI.shape.id.parse('org')).toBe('org')
    expect(HubPreflightFormData.shape.data.shape.code.parse('hub')).toBe('hub')
    expect(LayerPreflightFormData.shape.data.shape.projectId.parse('project')).toBe(
      'project',
    )
    expect(FeaturePreflightFormData.shape.data.shape.projectId.parse('project')).toBe(
      'project',
    )
    expect(FeatureI18nBase.shape.title.parse('title')).toBe('title')
    expect(PropertyDetailProfileAPI.shape.key.parse('field')).toBe('field')
    expect(ImageMetadataFullSchema.parse({})).toEqual({})
    expect(
      parseSessionSettings(undefined, undefined).experimental?.contributorMode,
    ).toBe(false)
  })

  it('loads permission helpers without SQL and keeps anonymous access denied', () => {
    expect(
      authorizeHubList(toHubAuthActor(null), { resourceHubId: null }).allowed,
    ).toBe(false)
    expect(canViewAnalytics(null)).toBe(false)
    expect(typeof resolveLayerActionPermissions).toBe('function')
  })

  it('provides picker metadata without importing style builders', () => {
    expect(MAP_STYLE_KEYS).toContain('ghostery')
    expect(isMapStyleKey('ghostery')).toBe(true)
    expect(isMapStyleKey('unknown-style')).toBe(false)
    expect(listMapStyleCatalog().every(entry => !('buildStyle' in entry))).toBe(true)
    expect(adminIntentOrder[0]).toBe('undefined')
  })
})
