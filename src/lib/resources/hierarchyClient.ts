// API
import { getOrganisation } from '#lib/api/organisation.remote.js'
import { getProject } from '#lib/api/project.remote.js'
import { getLayer } from '#lib/api/layer.remote.js'
// RESOURCES
import type { ResourceClient } from './resourceClient.svelte.js'
// TYPES
import type { ResourceCollectionInput } from './resourceCollection.js'
import type { ResourceDetail } from './resourceClient.svelte.js'
import type {
  OrganisationProfile,
  OrganisationGetParamsByProfile,
  OrganisationEntityByProfile,
} from '#lib/db/zod/schema/organisation.types.js'
import type {
  ProjectProfile,
  ProjectGetParamsByProfile,
  ProjectEntityByProfile,
} from '#lib/db/zod/schema/project.types.js'
import type {
  LayerProfile,
  LayerGetParamsByProfile,
  LayerEntityByProfile,
} from '#lib/db/zod/schema/layer.types.js'

/**
 * Composes typed hierarchy operations around shared resource mechanics.
 * @param client Scope-bound resource capabilities.
 * @returns Resource-specific APIs preserving remote profile inference.
 */
export function createHierarchyClient(client: ResourceClient) {
  return {
    organisations: {
      /**
       * Creates an inert organisation detail consumer.
       * @param input Reference and explicit response profile.
       * @returns A typed reactive detail handle.
       */
      detail<P extends OrganisationProfile = 'detail'>(
        input: OrganisationGetParamsByProfile<P>,
      ): ResourceDetail<OrganisationEntityByProfile<P>> {
        return client.detail('organisation', input, () => {
          const scopedInput = {
            ...input,
            meta: { ...input.meta, ...client.queryMeta },
          }
          return getOrganisation(scopedInput)
        })
      },
      /** Creates independent organisation traversal. @returns An inert list controller. */
      createList: (defaults: ResourceCollectionInput = {}) =>
        client.createCollection('organisation', defaults),
    },
    projects: {
      /**
       * Creates an inert project detail consumer.
       * @param input Reference and explicit response profile.
       * @returns A typed reactive detail handle.
       */
      detail<P extends ProjectProfile = 'detail'>(
        input: ProjectGetParamsByProfile<P>,
      ): ResourceDetail<ProjectEntityByProfile<P>> {
        return client.detail('project', input, () => {
          const scopedInput = {
            ...input,
            meta: { ...input.meta, ...client.queryMeta },
          }
          return getProject(scopedInput)
        })
      },
      /** Creates independent project traversal. @returns An inert list controller. */
      createList: (defaults: ResourceCollectionInput = {}) =>
        client.createCollection('project', defaults),
    },
    layers: {
      /**
       * Creates an inert layer detail consumer.
       * @param input Reference and explicit response profile.
       * @returns A typed reactive detail handle.
       */
      detail<P extends LayerProfile = 'detail'>(
        input: LayerGetParamsByProfile<P>,
      ): ResourceDetail<LayerEntityByProfile<P>> {
        return client.detail('layer', input, () => {
          const scopedInput = {
            ...input,
            meta: { ...input.meta, ...client.queryMeta },
          }
          return getLayer(scopedInput)
        })
      },
      /** Creates independent layer traversal. @returns An inert list controller. */
      createList: (defaults: ResourceCollectionInput = {}) =>
        client.createCollection('layer', defaults),
    },
  }
}
