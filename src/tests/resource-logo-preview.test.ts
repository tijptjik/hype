// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import type { Database } from '#lib/types.js'
const mocks = vi.hoisted(() => ({
  delivery: vi.fn(),
  probe: vi.fn(),
  authorize: vi.fn(),
}))
vi.mock('#lib/db/services/imageRevisionDelivery.js', () => ({
  readImageRevisionDelivery: mocks.delivery,
}))
vi.mock('#lib/db/services/organisation.js', () => ({
  probeOrganisationQuery: mocks.probe,
}))
vi.mock('#lib/db/services/project.js', () => ({ probeProjectForUpdate: mocks.probe }))
vi.mock('#lib/db/services/hub.js', () => ({ probeHubForUpdate: mocks.probe }))
vi.mock('#lib/api/services/authz/index', () => ({
  authorizeOrganisationUpdateForSubmission: mocks.authorize,
  authorizeProjectUpdateForSubmission: mocks.authorize,
  authorizeHubUpdateForSubmission: mocks.authorize,
}))
import { readResourceLogoPreview } from '#lib/api/services/resourceLogoPreview.js'
const actor = {
  user: { id: 'editor', isAnonymous: false },
  userRoles: [],
} as unknown as Parameters<typeof readResourceLogoPreview>[2]
const db = {
  get: vi.fn(async () => ({ n: 4 })),
  all: vi.fn(async () => [{ resource: 'project', id: 'p' }]),
} as unknown as Database
beforeEach(() => {
  vi.clearAllMocks()
  mocks.probe.mockResolvedValue({ id: 'p', organisationId: 'o', hubId: 'h' })
  mocks.authorize.mockReturnValue({ allowed: false })
  mocks.delivery.mockResolvedValue({ revisionId: 'r' })
})
it('denies unauthenticated and unauthorized historical previews', async () => {
  expect(await readResourceLogoPreview(db, 'r')).toBeNull()
  expect(await readResourceLogoPreview(db, 'r', actor)).toBeNull()
  expect(mocks.delivery).not.toHaveBeenCalled()
})
it('requires current owner ancestry and a matching immutable historical pin', async () => {
  mocks.authorize.mockReturnValue({ allowed: true })
  expect(await readResourceLogoPreview(db, 'r', actor)).toEqual({ revisionId: 'r' })
  const query = new SQLiteSyncDialect().sqlToQuery(mocks.delivery.mock.calls[0][2])
  expect(query.sql).toContain('p.organisationId=')
  expect(query.sql).toContain('o.hubId IS')
  expect(query.sql).toContain('p.imageId=i.id')
  expect(query.params).toContain('p')
  expect(query.params).toContain('r')
})
it('denies a disappeared owner even if the former role was sufficient', async () => {
  mocks.authorize.mockReturnValue({ allowed: true })
  mocks.probe.mockResolvedValue(null)
  expect(await readResourceLogoPreview(db, 'r', actor)).toBeNull()
  expect(mocks.delivery).not.toHaveBeenCalled()
})
