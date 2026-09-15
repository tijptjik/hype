// TYPES
import type {
  HeaderButtonActionConfig,
  HeaderLayoutRegionConfig,
} from '$lib/bits/patterns/layout/header/header.types'
import type {
  HeaderFormActionsState,
  HeaderFacetItem,
} from '$lib/context/headerState.types'

type HeaderTaskActionsController = {
  setTaskActions: (actions: HeaderButtonActionConfig[]) => void
  setTaskActionContent: (
    component: HeaderLayoutRegionConfig['component'],
    props?: HeaderLayoutRegionConfig['props'],
  ) => void
}

export type HeaderTransitionSnapshot = Pick<
  HeaderFormActionsState,
  | 'canEdit'
  | 'canPublish'
  | 'showDeleteAction'
  | 'showPublishAction'
  | 'isPublished'
  | 'isDeleted'
> & {
  facets: HeaderFacetItem[]
}

type OrganisationToggleField = 'isPublished' | 'isArchived'
