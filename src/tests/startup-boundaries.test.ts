// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

// Browser policy and catalogue entry points must never evaluate database or style builders.
vi.mock('#lib/db/schema/index.js', () => {
  throw new Error('Database schema reached browser startup')
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

describe('browser startup boundaries', () => {
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
