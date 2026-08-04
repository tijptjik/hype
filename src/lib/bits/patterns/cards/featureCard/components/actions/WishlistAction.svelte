<script lang="ts">
// BITS
import { Icon } from '$lib/bits'
// THIRD PARTY
import { toast } from 'svelte-sonner'
// I18N
import { m } from '$lib/i18n'
// API
import {
  addUserFeatureToList,
  getUserFeatures,
  removeUserFeatureFromList,
} from '$lib/api/server/user.remote'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// TYPES
import type { Feature, UserContributedFeature } from '$lib/db/zod/schema/feature.types'
import type { UserFeature } from '$lib/db/zod/schema/user.types'
// ICONS
import Star from 'virtual:icons/lucide/star'
// LOCAL
import FeatureCardActionButton from './FeatureCardActionButton.svelte'

let { feature }: { feature: Feature | UserContributedFeature } = $props()

const appCtx = getAppCtx()

let isSubmitting = $state(false)
let isStarActionHovered = $state(false)
let hasLeftStarredButton = $state(true)

const wishlistedFeature = $derived(
  'id' in feature
    ? appCtx.getWishlistUserFeatures().find(uf => uf.featureId === feature.id)
    : undefined,
)
const visitedFeature = $derived(
  'id' in feature
    ? appCtx.getVisitedUserFeatures().find(uf => uf.featureId === feature.id)
    : undefined,
)
const isWishlisted = $derived(Boolean(wishlistedFeature))
const wishlistActionText = $derived(
  isWishlisted
    ? isStarActionHovered
      ? m.weird_short_orangutan_kiss()
      : m.feature_action_starred()
    : m.legal_silly_mammoth_link(),
)

async function toggleWishlisted(): Promise<void> {
  if (isSubmitting || !('id' in feature)) return

  const previous = wishlistedFeature ?? visitedFeature ?? null
  const nextIsWishlisted = !isWishlisted
  const optimistic = {
    featureId: feature.id,
    isWishlisted: nextIsWishlisted,
    isVisited: Boolean(visitedFeature),
    visitedAt: visitedFeature?.visitedAt ?? null,
  } as UserFeature

  // A replacement button appears under the pointer after an optimistic star. Require a real
  // pointer leave before exposing the destructive follow-up action on that replacement.
  if (nextIsWishlisted) {
    hasLeftStarredButton = false
    isStarActionHovered = false
  }

  isSubmitting = true
  appCtx.applyUserFeatureState(feature.id, optimistic)

  try {
    const mutation = nextIsWishlisted
      ? addUserFeatureToList({ featureId: feature.id, list: 'wishlist' })
      : removeUserFeatureFromList({ featureId: feature.id, list: 'wishlist' })
    const response = await mutation.updates(
      getUserFeatures({
        userId: appCtx.user?.id,
        sorting: { sortBy: 'modifiedAt', sortOrder: 'desc' },
      }).withOverride(current => ({
        ...current,
        data: [
          optimistic,
          ...(current.data ?? []).filter(item => item.featureId !== feature.id),
        ],
      })),
    )

    appCtx.applyUserFeatureState(
      feature.id,
      (response?.data as UserFeature | null) ?? null,
    )
  } catch (error) {
    console.error('Error updating wishlist status:', error)
    appCtx.applyUserFeatureState(feature.id, previous)
    toast.error('Failed to update wishlist status')
  } finally {
    isSubmitting = false
  }
}
</script>

{#snippet wishlistIcon()}
  <Icon
    src={Star}
    class={isWishlisted ? 'h-6 w-6 text-primary' : 'h-6 w-6 text-neutral-content'}
    filled={isWishlisted}
  />
{/snippet}

<FeatureCardActionButton
  text={wishlistActionText}
  title={isWishlisted ? m.weird_short_orangutan_kiss() : m.legal_silly_mammoth_link()}
  icon={wishlistIcon}
  variant="ghost"
  hideLabelBelow={544}
  expandedClass="w-[calc(7ch+2.125rem)] min-w-[calc(7ch+2.125rem)]"
  onClick={() => {
    void toggleWishlisted()
  }}
  onMouseEnter={() => {
    isStarActionHovered = isWishlisted && hasLeftStarredButton
  }}
  onMouseLeave={() => {
    if (isWishlisted) hasLeftStarredButton = true
    isStarActionHovered = false
  }}
  onFocus={() => {
    isStarActionHovered = isWishlisted && hasLeftStarredButton
  }}
  onBlur={() => (isStarActionHovered = false)}
  disabled={isSubmitting}
/>
