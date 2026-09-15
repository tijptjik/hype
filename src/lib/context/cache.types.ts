// TYPES
import type { SvelteMap } from 'svelte/reactivity'
import type { FirstClassResource } from '$lib/enums'
import type { Id, Key } from '$lib/types'
import type { Organisation } from '$lib/db/zod/schema/organisation.types'
import type { Project } from '$lib/db/zod/schema/project.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type { FeatureFromCollection, Feature } from '$lib/db/zod/schema/feature.types'
import type { Property } from '$lib/db/zod/schema/property.types'
import type { Task } from '$lib/db/zod'
import type { Hub } from '$lib/db/zod/schema/hub.types'
import type { ImageDB } from '$lib/db/zod/schema/image.types'
import type { UserProfile } from '$lib/db/zod/schema/user.types'

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
