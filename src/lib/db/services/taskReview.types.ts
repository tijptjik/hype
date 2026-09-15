// TYPES
import type { TaskDB } from '$lib/db/zod'
import type { Id } from '$lib/types'
import type { FeatureDB } from '$lib/db/zod/schema/feature.types'

export type TaskReviewCommitContext = {
  task: Pick<
    TaskDB,
    'id' | 'featureId' | 'projectId' | 'organisationId' | 'modifiedAt' | 'type'
  >
  resourceHubId: string | null
  reviewerId: Id
  reason?: string | null
}

export type TaskFeatureReviewCommit = TaskReviewCommitContext & {
  feature: Pick<FeatureDB, 'id' | 'modifiedAt'>
  action: 'accept' | 'reject' | 'setIntangible' | 'setUnpublished' | 'setArchived'
}
