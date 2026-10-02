// TYPES
import type { SvelteMap } from 'svelte/reactivity'
import type { FirstClassResource } from '#lib/enums.js'
import type { Id, Key } from '#lib/types.js'
import type { Organisation } from '#lib/db/zod/schema/organisation.types.js'
import type { Project } from '#lib/db/zod/schema/project.types.js'
import type { Layer } from '#lib/db/zod/schema/layer.types.js'
import type {
  FeatureFromCollection,
  Feature,
} from '#lib/db/zod/schema/feature.types.js'
import type { Property } from '#lib/db/zod/schema/property.types.js'
import type { Task } from '#lib/db/zod/index.js'
import type { Hub } from '#lib/db/zod/schema/hub.types.js'
import type { ImageDB } from '#lib/db/zod/schema/image.types.js'
import type { UserProfile } from '#lib/db/zod/schema/user.types.js'

/* ----------------- */
// STATS
/* -------- */

type StatsCache = SvelteMap<
  FirstClassResource,
  SvelteMap<
    Id,
    SvelteMap<Key, { value: unknown; type: 'boolean' | 'count' | 'mean' | 'sum' }>
  >
>

// Define the shape of the cache
export type Cache = {
  organisation: Map<Id, Organisation>
  project: Map<Id, Project>
  layer: Map<Id, Layer>
  feature: Map<Id, FeatureFromCollection | Feature>
  property: Map<Id, Property>
  task: Map<Id, Task>
  hub: Map<Id, Hub>
  image: Map<Id, ImageDB>
  user: Map<Id, UserProfile>
  stats: StatsCache
}
