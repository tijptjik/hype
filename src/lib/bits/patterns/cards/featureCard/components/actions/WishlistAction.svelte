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
// LOCAL
import WishlistActionDisplay from './WishlistActionDisplay.svelte'

let { feature }: { feature: Feature | UserContributedFeature } = $props()

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
function getWishlistValue(wishlisted: boolean): string {
  return wishlisted ? m.feature_action_starred() : m.legal_silly_mammoth_link()
}

/**
 * Produces the root-hover label for a wishlist state.
 *
 * @param wishlisted Whether the feature belongs to the wishlist.
 * @returns Hover action label for the state.
 */
function getWishlistHoverValue(wishlisted: boolean): string {
  return wishlisted ? m.weird_short_orangutan_kiss() : m.legal_silly_mammoth_link()
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

const wishlistActionText = $derived(getWishlistValue(settledWishlistState))

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

  isSubmitting = true
  clearWishlistError()
  optimisticWishlisted = nextIsWishlisted
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

    const settled = (response?.data as UserFeature | null) ?? null
    settledWishlisted = Boolean(settled?.isWishlisted)
    appCtx.applyUserFeatureState(feature.id, settled)
  } catch (error) {
    console.error('Error updating wishlist status:', error)
    optimisticWishlisted = Boolean(previous?.isWishlisted)
    settledWishlisted = Boolean(previous?.isWishlisted)
    appCtx.applyUserFeatureState(feature.id, previous)
    const message = 'Failed to update wishlist status'
    showWishlistError(message)
    toast.error(message)
  } finally {
    isSubmitting = false
  }
}
</script>

<WishlistActionDisplay
  currentIcon={isWishlisted}
  optimisticIcon={optimisticWishlistState}
  settledIcon={settledWishlistState}
  currentValue={getWishlistValue(isWishlisted)}
  currentHoverValue={getWishlistHoverValue(isWishlisted)}
  optimisticValue={getWishlistValue(optimisticWishlistState)}
  optimisticHoverValue={getWishlistHoverValue(optimisticWishlistState)}
  settledValue={wishlistActionText}
  settledHoverValue={getWishlistHoverValue(settledWishlistState)}
  isError={isWishlistError}
  errorMessage={wishlistErrorMessage}
  onClick={() => {
    void toggleWishlisted()
  }}
/>
