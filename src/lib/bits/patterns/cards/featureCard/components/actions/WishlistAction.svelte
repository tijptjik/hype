<script lang="ts">
// BITS
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
import type { FeatureCardWishlistActionDisplay } from '$lib/types'
// LOCAL
import WishlistActionDisplay from './WishlistActionDisplay.svelte'

interface Props {
  feature: Feature | UserContributedFeature
  isIconOnly?: boolean
}

let { feature, isIconOnly }: Props = $props()

const appCtx = getAppCtx()

let isSubmitting = $state(false)
let optimisticWishlisted = $state<boolean | null>(null)
let settledWishlisted = $state<boolean | null>(null)
let isWishlistError = $state(false)
let wishlistErrorMessage = $state('')

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
const optimisticWishlistState = $derived(optimisticWishlisted ?? isWishlisted)
const settledWishlistState = $derived(settledWishlisted ?? isWishlisted)

/**
 * Produces the non-hover label for a wishlist state.
 *
 * @param wishlisted Whether the feature belongs to the wishlist.
 * @returns Action label for the state.
 */
function getWishlistValue(wishlisted: boolean): FeatureCardWishlistActionDisplay {
  return wishlisted
    ? { key: 'starred', icon: true, label: m.feature_action_starred() }
    : { key: 'star', icon: false, label: m.legal_silly_mammoth_link() }
}

/**
 * Produces the root-hover label for a wishlist state.
 *
 * @param wishlisted Whether the feature belongs to the wishlist.
 * @returns Hover action label for the state.
 */
function getWishlistHoverValue(wishlisted: boolean): FeatureCardWishlistActionDisplay {
  return wishlisted
    ? { key: 'unstar', icon: true, label: m.weird_short_orangutan_kiss() }
    : getWishlistValue(wishlisted)
}

$effect(() => {
  if (isSubmitting || isWishlistError) return
  optimisticWishlisted = isWishlisted
  settledWishlisted = isWishlisted
})

function clearWishlistError(): void {
  isWishlistError = false
  wishlistErrorMessage = ''
}

function showWishlistError(message: string): void {
  isWishlistError = true
  wishlistErrorMessage = message
  setTimeout(() => {
    clearWishlistError()
  }, 3000)
}

/**
 * Saves the list change for the feature and account that initiated the action.
 *
 * @returns Nothing after the save and local state reconciliation finish.
 */
async function toggleWishlisted(): Promise<void> {
  if (isSubmitting || !('id' in feature)) return
  const featureId = feature.id
  const userId = appCtx.user?.id

  const previous = wishlistedFeature ?? visitedFeature ?? null
  const nextIsWishlisted = !isWishlisted
  const optimistic = {
    featureId,
    isWishlisted: nextIsWishlisted,
    isVisited: Boolean(visitedFeature),
    visitedAt: visitedFeature?.visitedAt ?? null,
  } as UserFeature

  isSubmitting = true
  clearWishlistError()
  optimisticWishlisted = nextIsWishlisted
  appCtx.applyUserFeatureState(featureId, optimistic)

  try {
    const mutation = nextIsWishlisted
      ? addUserFeatureToList({ featureId, list: 'wishlist' })
      : removeUserFeatureFromList({ featureId, list: 'wishlist' })
    const response = await mutation.updates(
      getUserFeatures({
        userId,
        sorting: { sortBy: 'modifiedAt', sortOrder: 'desc' },
      }).withOverride(current => ({
        ...current,
        data: [
          optimistic,
          ...(current.data ?? []).filter(item => item.featureId !== featureId),
        ],
      })),
    )

    // A response from a previous account must not populate the current account's cache.
    if (appCtx.user?.id !== userId) return
    const settled = (response?.data as UserFeature | null) ?? null
    appCtx.applyUserFeatureState(featureId, settled)
    if (!('id' in feature) || feature.id !== featureId) return
    settledWishlisted = Boolean(settled?.isWishlisted)
  } catch (error) {
    if (appCtx.user?.id !== userId) return
    appCtx.applyUserFeatureState(featureId, previous)
    if (!('id' in feature) || feature.id !== featureId) return
    console.error('Error updating wishlist status:', error)
    optimisticWishlisted = Boolean(previous?.isWishlisted)
    settledWishlisted = Boolean(previous?.isWishlisted)
    const message = 'Failed to update wishlist status'
    showWishlistError(message)
    toast.error(message)
  } finally {
    isSubmitting = false
  }
}
</script>

<WishlistActionDisplay
  currentValue={getWishlistValue(isWishlisted)}
  currentHoverValue={getWishlistHoverValue(isWishlisted)}
  optimisticValue={getWishlistValue(optimisticWishlistState)}
  optimisticHoverValue={getWishlistHoverValue(optimisticWishlistState)}
  settledValue={getWishlistValue(settledWishlistState)}
  settledHoverValue={getWishlistHoverValue(settledWishlistState)}
  isError={isWishlistError}
  errorMessage={wishlistErrorMessage}
  {isIconOnly}
  onClick={() => {
    void toggleWishlisted()
  }}
/>
