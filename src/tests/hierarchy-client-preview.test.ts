// TESTS
import { expect, it, vi } from 'vitest'
// RESOURCES
import { CacheCtx } from '#lib/context/cache.svelte.js'
import { ResourceClient } from '#lib/resources/resourceClient.svelte.js'
import { createHierarchyClient } from '#lib/resources/hierarchyClient.js'
// TYPES
import type { PublicationPreview } from '#lib/publication/preview.js'

const remotes = vi.hoisted(() => ({
  organisation: vi.fn(),
  project: vi.fn(),
  layer: vi.fn(),
}))
vi.mock('#lib/api/organisation.remote.js', () => ({
  getOrganisation: remotes.organisation,
}))
vi.mock('#lib/api/project.remote.js', () => ({ getProject: remotes.project }))
vi.mock('#lib/api/layer.remote.js', () => ({ getLayer: remotes.layer }))

it.each(['organisation', 'project', 'layer'] as const)(
  'clears captured preview metadata when %s details reload outside preview',
  async type => {
    const remote = remotes[type]
    remote.mockImplementation(() =>
      Object.assign(Promise.resolve({ data: { id: 'one' } }), {
        current: { data: { id: 'one' } },
        ready: true,
        refresh: async () => {},
      }),
    )
    let preview: PublicationPreview | null = {
      type: 'project',
      id: 'draft',
      publishChildren: true,
    }
    const cache = new CacheCtx()
    const client = new ResourceClient(
      cache,
      () => JSON.stringify(preview),
      cache.entities,
      () => false,
      () => preview,
    )
    const hierarchy = createHierarchyClient(client)
    const provider =
      type === 'organisation'
        ? hierarchy.organisations
        : type === 'project'
          ? hierarchy.projects
          : hierarchy.layers
    const detail = provider.detail({
      ref: 'one',
      meta: { profile: 'detail', publicationPreview: preview },
    })
    try {
      await detail.load()
      expect(remote).toHaveBeenLastCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({ publicationPreview: preview }),
        }),
      )
      preview = null
      expect(detail.data).toBeUndefined()
      await detail.load()
      expect(remote).toHaveBeenLastCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            publicationPreview: undefined,
            profile: 'detail',
            isAdminRequest: false,
          }),
        }),
      )
    } finally {
      client.release()
    }
  },
)
