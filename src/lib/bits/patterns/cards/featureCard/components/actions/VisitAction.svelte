<script lang="ts">
// BITS
import { Icon } from '$lib/bits'
// THIRD PARTY
import { formatDistanceToNow } from 'date-fns'
import { enGB, zhCN, zhHK } from 'date-fns/locale'
import { toast } from 'svelte-sonner'
// I18N
import { getLocale, m } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// SERVICES
import { toggleVisitedStatus } from '$lib/client/services/userFeatures'
// TYPES
import type { Feature, UserContributedFeature } from '$lib/db/zod/schema/feature.types'
// ICONS
import Check from 'virtual:icons/lucide/check'
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
const isVisited = $derived(Boolean(visitedFeature))

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

function getVisitedLocale() {
  const locale = getLocale()

  if (locale === 'zh-hant') return zhHK
  if (locale === 'zh-hans') return zhCN
  return enGB
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

{#if isVisited && visitedFeature?.visitedAt}
  <div
    class="flex h-full flex-col items-start justify-center pl-2 text-sm text-neutral-content"
  >
    <p class="text-xs uppercase">{m.white_dizzy_clownfish_quiz()}</p>
    <p class="font-mono text-white">
      {formatDistanceToNow(new Date(visitedFeature.visitedAt), {
        addSuffix: true,
        locale: getVisitedLocale(),
      }).replace('minute', 'min')}
    </p>
  </div>
{:else}
  <FeatureCardActionButton
    text={isVisited ? 'Forget' : m.noble_fine_ibex_pinch()}
    icon={visitIcon}
    variant="secondary"
    labelClasses="hidden min-[34rem]:inline-block"
    expandFromClasses="min-[34rem]:w-auto min-[34rem]:px-[calc(var(--btn-padding-x)-0.25rem)]"
    onClick={() => {
      void toggleVisited()
    }}
    disabled={isSubmitting}
  />
{/if}
