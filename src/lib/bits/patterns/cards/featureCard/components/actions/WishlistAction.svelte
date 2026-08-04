<script lang="ts">
// SVELTE
import { crossfade, fade } from 'svelte/transition'
// BITS
import { Icon } from '$lib/bits'
// THIRD PARTY
import { toast } from 'svelte-sonner'
// I18N
import { m } from '$lib/i18n'
// API
import {
  addUserFeatureToList,
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
const [send, receive] = crossfade({
  duration: 180,
  fallback: node => fade(node, { duration: 180 }),
})

let isSubmitting = $state(false)
let isStarActionHovered = $state(false)

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
const transitionKey = $derived(`wishlist-${'id' in feature ? feature.id : ''}`)

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
  appCtx.applyUserFeatureState(feature.id, optimistic)

  try {
    const response = nextIsWishlisted
      ? await addUserFeatureToList({ featureId: feature.id, list: 'wishlist' })
      : await removeUserFeatureFromList({ featureId: feature.id, list: 'wishlist' })

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

{#snippet unstarredIcon()}
  <Icon src={Star} class="h-6 w-6 text-neutral-content" />
{/snippet}

{#snippet starredIcon()}
  <Icon src={Star} class="h-6 w-6 text-primary" filled />
{/snippet}

{#if isWishlisted}
  <div in:receive={{ key: transitionKey }} out:send={{ key: transitionKey }}>
    <FeatureCardActionButton
      text={isStarActionHovered ? m.weird_short_orangutan_kiss() : m.feature_action_starred()}
      title={m.weird_short_orangutan_kiss()}
      icon={starredIcon}
      variant="ghost"
      hideLabelBelow={544}
      onClick={() => {
        void toggleWishlisted()
      }}
      onMouseEnter={() => (isStarActionHovered = true)}
      onMouseLeave={() => (isStarActionHovered = false)}
      onFocus={() => (isStarActionHovered = true)}
      onBlur={() => (isStarActionHovered = false)}
      disabled={isSubmitting}
    />
  </div>
{:else}
  <div in:receive={{ key: transitionKey }} out:send={{ key: transitionKey }}>
    <FeatureCardActionButton
      text={m.legal_silly_mammoth_link()}
      icon={unstarredIcon}
      variant="ghost"
      hideLabelBelow={544}
      onClick={() => {
        void toggleWishlisted()
      }}
      disabled={isSubmitting}
    />
  </div>
{/if}
