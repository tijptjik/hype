// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  search: vi.fn(),
  authorize: vi.fn(),
  ctx: { user: { id: 'admin', superAdmin: true, isAnonymous: false }, db: {} },
}))
vi.mock('#lib/api/server/guarded.js', () => {
  const wrap =
    (kind: 'query' | 'command') =>
    (
      schema: { parse: (value: unknown) => unknown },
      handler: (input: unknown, ctx: unknown) => unknown,
    ) =>
      withRemoteMeta(
        async (input: unknown) => handler(schema.parse(input), mocks.ctx),
        kind,
      )
  return { guardedCommand: wrap('command'), guardedQuery: wrap('query') }
})
vi.mock('#lib/api/services/locationOwnership', () => ({
  requireLocationOrganisationManager: mocks.authorize,
}))
vi.mock('#lib/db/services/identityCatalogue.js', () => ({
  readIdentityCatalogue: mocks.read,
  saveIdentityCatalogue: mocks.save,
  readIdentityCatalogueByCode: vi.fn(),
  searchIdentityCatalogue: mocks.search,
  listGroupBrands: vi.fn(),
  listSubgroups: vi.fn(),
}))
import {
  archiveIdentityCatalogue,
  findIdentityCatalogue,
  publishIdentityCatalogue,
} from '#lib/api/identityCatalogue.remote.js'
import { seedIdentityCatalogue } from '#lib/locations/identityCatalogue.js'
const content = seedIdentityCatalogue({ en: 'Brand' })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.ctx.user.superAdmin = true
  mocks.ctx.user.isAnonymous = false
  mocks.read.mockResolvedValue({ id: 'entry', kind: 'brand', version: 2, ...content })
  mocks.save.mockImplementation(async (_db, input) => ({
    id: input.id,
    kind: input.kind,
    version: 3,
    ...input.content,
  }))
})
it('denies archive and restore to non-SuperAdmins before reading or writing', async () => {
  mocks.ctx.user.superAdmin = false
  for (const isArchived of [true, false])
    await expect(
      archiveIdentityCatalogue({ id: 'entry', expectedVersion: 2, isArchived }),
    ).rejects.toMatchObject({ status: 403 })
  expect(mocks.read).not.toHaveBeenCalled()
  expect(mocks.save).not.toHaveBeenCalled()
})
it('archives and restores through versioned writes', async () => {
  expect(
    await archiveIdentityCatalogue({
      id: 'entry',
      expectedVersion: 2,
      isArchived: true,
    }),
  ).toMatchObject({ isArchived: true, version: 3 })
  expect(
    await archiveIdentityCatalogue({
      id: 'entry',
      expectedVersion: 2,
      isArchived: false,
    }),
  ).toMatchObject({ isArchived: false })
})
it('rejects stale archive requests', async () => {
  await expect(
    archiveIdentityCatalogue({ id: 'entry', expectedVersion: 1, isArchived: true }),
  ).rejects.toMatchObject({ status: 409 })
  expect(mocks.save).not.toHaveBeenCalled()
})
it('prevents normal catalogue publishing from changing archive state', async () => {
  await expect(
    publishIdentityCatalogue({
      id: 'entry',
      kind: 'brand',
      expectedVersion: 2,
      content: { ...content, isArchived: true },
    }),
  ).rejects.toMatchObject({ status: 403 })
  mocks.read.mockResolvedValue({
    id: 'entry',
    kind: 'brand',
    version: 2,
    ...content,
    isArchived: true,
  })
  await expect(
    publishIdentityCatalogue({
      id: 'entry',
      kind: 'brand',
      expectedVersion: 2,
      content,
    }),
  ).rejects.toMatchObject({ status: 403 })
  expect(mocks.save).not.toHaveBeenCalled()
})

it('restricts archived search to SuperAdmins while keeping active search available', async () => {
  mocks.ctx.user.superAdmin = false
  for (const isArchived of [true, null]) {
    await expect(
      findIdentityCatalogue({ kind: 'brand', search: '', isArchived }),
    ).rejects.toMatchObject({ status: 403 })
  }
  expect(mocks.search).not.toHaveBeenCalled()
  await findIdentityCatalogue({ kind: 'brand', search: '' })
  expect(mocks.search).toHaveBeenCalledWith(
    mocks.ctx.db,
    'brand',
    '',
    undefined,
    undefined,
    undefined,
  )
  mocks.ctx.user.superAdmin = true
  await findIdentityCatalogue({ kind: 'brand', search: '', isArchived: null })
  expect(mocks.search).toHaveBeenLastCalledWith(
    mocks.ctx.db,
    'brand',
    '',
    undefined,
    null,
    undefined,
  )
})
