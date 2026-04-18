<script lang="ts">
// BITS
import { Icon } from '$lib/bits'
// THIRD PARTY
import { toast } from 'svelte-sonner'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// SERVICES
import { toggleWishlistStatus } from '$lib/client/services/userFeatures'
// TYPES
import type { Feature, UserContributedFeature } from '$lib/db/zod/schema/feature.types'
// ICONS
import Star from 'virtual:icons/lucide/star'
// LOCAL
import FeatureCardActionButton from './FeatureCardActionButton.svelte'

let { feature }: { feature: Feature | UserContributedFeature } = $props()

const appCtx = getAppCtx()

let isSubmitting = $state(false)

const wishlistedFeature = $derived(
  'id' in feature
    ? appCtx.getWishlistUserFeatures().find(uf => uf.featureId === feature.id)
    : undefined,
)
const isWishlisted = $derived(Boolean(wishlistedFeature))
const visitedFeature = $derived(
  'id' in feature
    ? appCtx.getVisitedUserFeatures().find(uf => uf.featureId === feature.id)
    : undefined,
)

async function toggleWishlisted(): Promise<void> {
  if (isSubmitting || !('id' in feature)) return

  isSubmitting = true

  try {
    await toggleWishlistStatus(
      appCtx.user?.id,
      feature.id,
      isWishlisted,
      visitedFeature?.isVisited || false,
      visitedFeature?.visitedAt || null,
    )

    await appCtx.invalidateAndRefresh('userFeatures')
  } catch (error) {
    console.error('Error updating wishlist status:', error)
    toast.error('Failed to update wishlist status')
  } finally {
    isSubmitting = false
  }
}
</script>

{#snippet wishlistIcon()}
  {#if isSubmitting}
    <span class="loading loading-ring loading-md text-current"></span>
  {:else}
    <Icon
      src={Star}
      class={isWishlisted ? 'h-6 w-6 text-primary' : 'h-6 w-6 text-neutral-content'}
      theme="solid"
    />
  {/if}
{/snippet}

<FeatureCardActionButton
  text={isWishlisted ? m.weird_short_orangutan_kiss() : m.legal_silly_mammoth_link()}
  icon={wishlistIcon}
  variant="ghost"
  hideLabelBelow={544}
  onClick={() => {
    void toggleWishlisted()
  }}
  disabled={isSubmitting}
/>
