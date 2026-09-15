// TYPES
import type { Id } from '$lib/types'
import type { UserContributedFeature } from '$lib/db/zod/schema/feature.types'

/* ----------------- */
// FEATURES : USER CONTRIBUTED
/* -------- */

// Base task creation data
export type BaseTaskData = {
  layerId: Id
  organisationId: Id
  projectId: Id
  contributorId: Id
}

export type NewFeatureTask = BaseTaskData & {
  type: 'newFeature'
  feature: UserContributedFeature
  taskId?: Id
  featureId?: Id
}
