// @vitest-environment node
// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
// DRIZZLE
import { sql } from 'drizzle-orm'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
// TYPES
import type { Database } from '#lib/types.js'

const mocks = vi.hoisted(() => ({ delivery: vi.fn(), probe: vi.fn(), admin: vi.fn() }))
vi.mock('#lib/db/services/imageRevisionDelivery.js', () => ({ readImageRevisionDelivery: mocks.delivery }))
vi.mock('#lib/db/services/feature.js', () => ({ probeFeatureQuery: mocks.probe }))
vi.mock('#lib/db/services/featureCommandScope.js', () => ({ buildFeatureCommandScopeGuard: () => sql`1` }))
vi.mock('#lib/api/services/authz/feature', () => ({ authorizeFeatureAdminReadForProbe: mocks.admin }))
import { readFeatureImageRevisionPreview } from '#lib/api/services/imageRevisionPreview.js'

const db = { get: async () => ({n:0}) } as unknown as Database
const actor = { user: { id: 'contributor', isAnonymous: false }, userRoles: [] } as Parameters<typeof readFeatureImageRevisionPreview>[3]
const pin = { imageId: 'image', revisionId: 'revision', metadata: { private: 'metadata' } }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.delivery.mockResolvedValue(null)
  mocks.probe.mockResolvedValue({ id: 'feature', organisationId: 'org', projectId: 'project', layerId: 'layer', resourceHubId: null })
  mocks.admin.mockReturnValue({ allowed: false })
})
it('never treats a claimed Feature ID as private preview permission', async () => {
  expect(await readFeatureImageRevisionPreview(db, 'revision', 'feature')).toBeNull()
  expect(mocks.probe).not.toHaveBeenCalled()
  expect(mocks.delivery).toHaveBeenCalledTimes(1)
})
it('denies full metadata to a contributor even when the image is public', async () => {
  mocks.delivery.mockResolvedValue(pin)
  expect(await readFeatureImageRevisionPreview(db, 'revision', 'feature', actor, true)).toBeNull()
  expect(mocks.delivery).toHaveBeenCalledTimes(1)
})
it('requires current persisted Feature scope for private staff previews', async () => {
  mocks.probe.mockResolvedValue(null)
  mocks.admin.mockReturnValue({ allowed: true })
  expect(await readFeatureImageRevisionPreview(db, 'revision', 'feature', actor)).toBeNull()
  expect(mocks.delivery).toHaveBeenCalledTimes(1)
})
it('passes a server-owned evidence predicate for contributor previews', async () => {
  mocks.delivery.mockResolvedValueOnce(null).mockResolvedValueOnce(pin)
  expect(await readFeatureImageRevisionPreview(db, 'revision', 'feature', actor)).toBe(pin)
  expect(mocks.delivery).toHaveBeenLastCalledWith(db, 'revision', expect.any(Object))
})
it.each([0,1])('grants approved private history only to current staff when storage exists (%s)', async n => {
  const staffDb = { get: vi.fn().mockResolvedValue({ n }) } as unknown as Database
  mocks.admin.mockReturnValue({allowed:true})
  mocks.delivery.mockResolvedValueOnce(null).mockResolvedValueOnce(pin)
  expect(await readFeatureImageRevisionPreview(staffDb,'revision','feature',actor)).toBe(pin)
  const query = new SQLiteSyncDialect().sqlToQuery(mocks.delivery.mock.calls[1][2]).sql
  expect(query.includes('FROM featurePrivateCapture capture')).toBe(Boolean(n))
  if (n) expect(query).toContain('capture.featureId')
})
