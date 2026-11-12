// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  context: { user: { isAnonymous: false, superAdmin: false }, db: { get: vi.fn() } },
  list: vi.fn().mockResolvedValue([]),
  save: vi.fn(),
  manager: vi.fn(),
}))
vi.mock('#lib/api/server/guarded', () => {
  const guarded = (
    schema: { parse: (input: unknown) => unknown },
    handler: (input: unknown, context: unknown) => unknown,
  ) =>
    Object.assign((input: unknown) => handler(schema.parse(input), mocks.context), {
      __: { type: 'query' },
    })
  return { guardedQuery: guarded, guardedCommand: guarded }
})
vi.mock('#lib/api/services/locationOwnership', () => ({
  requireLocationOrganisationManager: mocks.manager,
}))
vi.mock('#lib/db/services/displayTemplate.js', () => ({
  listDisplayTemplates: mocks.list,
  saveDisplayTemplate: mocks.save,
}))
import {
  getDisplayTemplates,
  publishDisplayTemplate,
} from '../lib/api/displayTemplates.remote'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.context.user.isAnonymous = false
  mocks.context.user.superAdmin = false
})
it('allows signed-in central reads without granting central publishing', async () => {
  await expect(getDisplayTemplates({ organisationId: null })).resolves.toEqual([])
  await expect(
    publishDisplayTemplate({
      organisationId: null,
      id: 'new',
      expectedVersion: 0,
      definition: {
        name: 'Name',
        code: 'name',
        target: 'feature' as const,
        locales: { en: '{{ feature.name }}' },
      },
    }),
  ).rejects.toMatchObject({ status: 403 })
  expect(mocks.save).not.toHaveBeenCalled()
})
it('rejects anonymous reads and unauthorized private catalogue reads', async () => {
  mocks.context.user.isAnonymous = true
  await expect(getDisplayTemplates({ organisationId: null })).rejects.toMatchObject({
    status: 403,
  })
  mocks.context.user.isAnonymous = false
  mocks.manager.mockRejectedValueOnce(new Error('Denied'))
  await expect(getDisplayTemplates({ organisationId: 'private' })).rejects.toThrow(
    'Denied',
  )
  expect(mocks.list).not.toHaveBeenCalled()
})

it('lets only a superadmin publish a central template using a project prerequisite', async () => {
  const input = {
    organisationId: null,
    projectId: 'breadline',
    id: 'original',
    expectedVersion: 1,
    definition: {
      name: 'Breadline Donor',
      code: 'breadline-donor',
      target: 'feature' as const,
      locales: { en: '{{ cases(properties.paid, "Paid", "", "") }}' },
    },
  }
  await expect(publishDisplayTemplate(input)).rejects.toMatchObject({ status: 403 })
  mocks.context.user.superAdmin = true
  mocks.context.db.get.mockResolvedValue({ id: 'breadline' })
  mocks.save.mockResolvedValue({ id: 'original', version: 2 })
  await expect(publishDisplayTemplate(input)).resolves.toEqual({
    id: 'original',
    version: 2,
  })
  expect(mocks.save).toHaveBeenCalledWith(
    mocks.context.db,
    expect.objectContaining({
      organisationId: null,
      context: { projectId: 'breadline' },
    }),
  )
  mocks.context.db.get.mockResolvedValue(undefined)
  await expect(publishDisplayTemplate(input)).rejects.toMatchObject({ status: 400 })
})
