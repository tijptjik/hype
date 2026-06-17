<script lang="ts">
// BITS
import { Icon } from '$lib/bits'
// THIRD PARTY
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'svelte-sonner'
// I18N
import { m, toDateFnsLocale } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// SERVICES
import { toggleVisitedStatus } from '$lib/client/services/userFeatures'
// TYPES
import type { Feature, UserContributedFeature } from '$lib/db/zod/schema/feature.types'
// ICONS
import Check from 'virtual:icons/lucide/check'
// LOCAL
import {
  getFeatureCardResponsiveWidth,
  shouldCollapseFeatureCardAction,
} from '../../featureCard.utils'
import FeatureCardActionButton from './FeatureCardActionButton.svelte'

let { feature }: { feature: Feature | UserContributedFeature } = $props()

const appCtx = getAppCtx()
const responsiveCtx = getResponsiveCtx()
const VISIT_ACTION_COLLAPSE_WIDTH = 544

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
const isVisited = $derived(Boolean(visitedFeature))
const responsiveWidth = $derived(getFeatureCardResponsiveWidth(responsiveCtx))
const shouldShowCompactVisitedButton = $derived(
  isVisited &&
    shouldCollapseFeatureCardAction(responsiveWidth, VISIT_ACTION_COLLAPSE_WIDTH),
)

async function toggleVisited(): Promise<void> {
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
    <span class="loading loading-ring loading-md text-current"></span>
  {:else}
    <Icon
      src={Check}
      class={isVisited ? 'h-6 w-6 font-bold text-primary' : 'h-6 w-6 font-bold text-neutral-content'}
    />
  {/if}
{/snippet}

{#if isVisited && visitedFeature?.visitedAt && !shouldShowCompactVisitedButton}
  <div
    class="flex h-full flex-col items-start justify-center pl-2 text-sm text-neutral-content"
  >
    <p class="text-xs uppercase">{m.white_dizzy_clownfish_quiz()}</p>
    <p class="font-mono text-white">
      {formatDistanceToNow(new Date(visitedFeature.visitedAt), {
        addSuffix: true,
        locale: toDateFnsLocale(),
      }).replace('minute', 'min')}
    </p>
  </div>
{:else}
  <FeatureCardActionButton
    text={isVisited ? 'Forget' : m.noble_fine_ibex_pinch()}
    icon={visitIcon}
    variant="secondary"
    hideLabelBelow={VISIT_ACTION_COLLAPSE_WIDTH}
    onClick={() => {
      void toggleVisited()
    }}
    disabled={isSubmitting}
  />
{/if}
