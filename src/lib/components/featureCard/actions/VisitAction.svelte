<script lang="ts">
import Button from '$lib/bits/core/button/Button.svelte'
// ICONS
import Icon from '$lib/components/common/Icon.svelte'
import Check from 'virtual:icons/lucide/check'
import { toast } from 'svelte-sonner'
// I18N
import { getLocale } from '$lib/i18n'
import { m } from '$lib/i18n'
// UTILS
import { formatDistanceToNow } from 'date-fns'
import { enGB, zhCN, zhHK } from 'date-fns/locale'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// SERVICES
import { toggleVisitedStatus } from '$lib/client/services/userFeatures'
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
let isVisited = $derived(!!visitedFeature)

// HANDLERS
async function toggleVisited() {
  if (isSubmitting || !('id' in feature)) return
  isSubmitting = true

  try {
    const shouldRemoveFromWishlist = !isVisited && isWishlisted
    const newWishlistStatus = shouldRemoveFromWishlist
      ? false
      : wishlistedFeature?.isWishlisted || false

    await toggleVisitedStatus(appCtx.user?.id, feature.id, isVisited, newWishlistStatus)

    await appCtx.invalidateAndRefresh('userFeatures')
  } catch (error) {
    console.error('Error updating visited status:', error)
    toast.error('Failed to update visited status')
  } finally {
    isSubmitting = false
  }
}
</script>

{#snippet visitIcon()}
  {#if isSubmitting}
    <span class="loading loading-ring loading-md"></span>
  {:else}
    <Icon
      src={Check}
      class="h-6 w-6 font-bold transition-colors duration-300 {isVisited
        ? 'text-primary'
        : 'text-neutral-content'}"
    />
  {/if}
{/snippet}

{#if isVisited}
  <div
    class="flex h-full flex-col items-start justify-center pl-2 text-sm text-neutral-content"
  >
    <p class="text-xs uppercase">{m.white_dizzy_clownfish_quiz()}</p>
    <p class="font-mono text-white">
      {formatDistanceToNow(new Date(visitedFeature!.visitedAt!), {
        addSuffix: true,
        locale:
          getLocale() === 'zh-hant' ? zhHK : getLocale() === 'zh-hans' ? zhCN : enGB
      }).replace('minute', 'min')}
    </p>
  </div>
{:else}
  <Button
    text={isVisited ? 'Forget' : m.noble_fine_ibex_pinch()}
    icon={visitIcon}
    color="neutral"
    labelClasses="hidden min-[30rem]:inline-block"
    class="bits-feature-card__action-button"
    attrs={{ title: isVisited ? 'Forget' : m.noble_fine_ibex_pinch() }}
    onClick={toggleVisited}
    disabled={isSubmitting}
  />
{/if}
