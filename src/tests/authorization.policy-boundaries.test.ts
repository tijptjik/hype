// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

// Browser policy imports must not evaluate database schemas or SQL query helpers.
vi.mock('#lib/db/schema/index.js', () => {
  throw new Error('Database schema reached browser authorization')
})
vi.mock('drizzle-orm', () => {
  throw new Error('SQL runtime reached browser authorization')
})

import { authorizeHubList, toHubAuthActor } from '#lib/api/services/authz/hubPolicy.js'
import {
  resolveLayerActionPermissions,
  toLayerAuthActor,
} from '#lib/api/services/authz/layerPolicy.js'

describe('browser authorization boundaries', () => {
  it('loads hub policy without SQL and denies an absent session', () => {
    expect(
      authorizeHubList(toHubAuthActor(null), { resourceHubId: null }).allowed,
    ).toBe(false)
  })

  it('loads layer policy without SQL and denies editing without a session', () => {
    expect(
      resolveLayerActionPermissions({ actor: toLayerAuthActor({}), resource: null }),
    ).toEqual({
      canEditI18n: false,
      canEditFields: false,
      canPublish: false,
      canArchive: false,
    })
  })
})
