<script lang="ts">
import Button from '$lib/bits/core/button/Button.svelte'
// ICONS
import Icon from '$lib/components/common/Icon.svelte'
import Star from 'virtual:icons/lucide/star'
import { toast } from 'svelte-sonner'
// I18N
import { m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// SERVICES
import { toggleWishlistStatus } from '$lib/client/services/userFeatures'
import type { Feature, UserContributedFeature } from '$lib/db/zod/schema/feature.types'
// TYPES

// PROPS
let { feature }: { feature: Feature | UserContributedFeature } = $props()

// CONTEXT
const appCtx = getAppCtx()

// STATE
let isSubmitting = $state(false)

// DERIVED STATE
let wishlistedFeature = $derived(
  'id' in feature
    ? appCtx.getWishlistUserFeatures().find(uf => uf.featureId === feature.id)
    : undefined,
)
let isWishlisted = $derived(!!wishlistedFeature)
let visitedFeature = $derived(
  'id' in feature
    ? appCtx.getVisitedUserFeatures().find(uf => uf.featureId === feature.id)
    : undefined,
)

// HANDLERS
async function toggleWishlisted() {
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
    <span class="loading loading-ring loading-md"></span>
  {:else}
    <Icon
      src={Star}
      class="h-6 w-6 transition-colors duration-300 {isWishlisted
        ? 'text-primary'
        : 'text-neutral-content'}"
      theme="solid"
    />
  {/if}
{/snippet}

<Button
  text={isWishlisted ? m.weird_short_orangutan_kiss() : m.legal_silly_mammoth_link()}
  icon={wishlistIcon}
  color="neutral"
  class="bits-feature-card__action-button"
  attrs={{
    title: isWishlisted ? m.weird_short_orangutan_kiss() : m.legal_silly_mammoth_link(),
  }}
  onClick={toggleWishlisted}
  disabled={isSubmitting}
/>
