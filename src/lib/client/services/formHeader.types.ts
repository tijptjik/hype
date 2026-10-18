import type {
  HeaderFormActionsState,
  HeaderFacetItem,
} from '#lib/context/headerState.types.js'

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
