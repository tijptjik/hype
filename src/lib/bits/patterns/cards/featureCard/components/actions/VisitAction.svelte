<script lang="ts">
// SVELTE
import { crossfade, fade } from 'svelte/transition'
// BITS
import { Icon } from '$lib/bits'
// THIRD PARTY
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'svelte-sonner'
// I18N
import { m, toDateFnsLocale } from '$lib/i18n'
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
import Check from 'virtual:icons/lucide/check'
// LOCAL
import FeatureCardActionButton from './FeatureCardActionButton.svelte'

let { feature }: { feature: Feature | UserContributedFeature } = $props()

const appCtx = getAppCtx()
const [send, receive] = crossfade({
  duration: 180,
  fallback: node => fade(node, { duration: 180 }),
})

let isSubmitting = $state(false)
let isLastVisitedHovered = $state(false)

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
const isVisited = $derived(Boolean(visitedFeature))
const visitActionState = $derived(
  isVisited ? (isSubmitting ? 'visited' : 'last-visited') : 'check-in',
)
const transitionKey = $derived(`visit-${'id' in feature ? feature.id : ''}`)

async function toggleVisited(): Promise<void> {
  if (isSubmitting || !('id' in feature)) return

  const previous = visitedFeature ?? wishlistedFeature ?? null
  const nextIsVisited = !isVisited
  const visitedAt = nextIsVisited ? new Date().toISOString() : null
  const optimistic = {
    featureId: feature.id,
    isWishlisted: Boolean(wishlistedFeature),
    isVisited: nextIsVisited,
    visitedAt,
  } as UserFeature

  isSubmitting = true
  appCtx.applyUserFeatureState(feature.id, optimistic)

  try {
    const response = nextIsVisited
      ? await addUserFeatureToList({
          featureId: feature.id,
          list: 'visited',
          visitedAt,
        })
      : await removeUserFeatureFromList({ featureId: feature.id, list: 'visited' })

    appCtx.applyUserFeatureState(
      feature.id,
      (response?.data as UserFeature | null) ?? null,
    )
  } catch (error) {
    console.error('Error updating visited status:', error)
    appCtx.applyUserFeatureState(feature.id, previous)
    toast.error('Failed to update visited status')
  } finally {
    isSubmitting = false
  }
}
</script>

{#snippet checkIcon()}
  <Icon src={Check} class="h-6 w-6 font-bold text-neutral-content" />
{/snippet}

{#snippet visitedIcon()}
  <Icon src={Check} class="h-6 w-6 font-bold text-primary" />
{/snippet}

{#if visitActionState === 'last-visited' && visitedFeature?.visitedAt}
  <button
    type="button"
    class="flex h-full flex-col items-start justify-center pl-2 text-left text-sm text-neutral-content transition-colors hover:text-primary focus-visible:outline-none focus-visible:text-primary"
    title={m.feature_action_remove_visit()}
    onmouseenter={() => (isLastVisitedHovered = true)}
    onmouseleave={() => (isLastVisitedHovered = false)}
    onfocus={() => (isLastVisitedHovered = true)}
    onblur={() => (isLastVisitedHovered = false)}
    onclick={() => {
      void toggleVisited()
    }}
  >
    <div in:receive={{ key: transitionKey }} out:send={{ key: transitionKey }}>
      {#if isLastVisitedHovered}
        <p class="text-xs uppercase">{m.feature_action_remove_visit()}</p>
      {:else}
        <p class="text-xs uppercase">{m.white_dizzy_clownfish_quiz()}</p>
        <p class="font-mono text-white">
          {formatDistanceToNow(new Date(visitedFeature.visitedAt), {
            addSuffix: true,
            locale: toDateFnsLocale(),
          }).replace('minute', 'min')}
        </p>
      {/if}
    </div>
  </button>
{:else if visitActionState === 'visited'}
  <div in:receive={{ key: transitionKey }} out:send={{ key: transitionKey }}>
    <FeatureCardActionButton
      text={m.feature_action_visited()}
      icon={visitedIcon}
      variant="secondary"
      hideLabelBelow={544}
      disabled
    />
  </div>
{:else}
  <div in:receive={{ key: transitionKey }} out:send={{ key: transitionKey }}>
    <FeatureCardActionButton
      text={m.noble_fine_ibex_pinch()}
      icon={checkIcon}
      variant="secondary"
      hideLabelBelow={544}
      onClick={() => {
        void toggleVisited()
      }}
      disabled={isSubmitting}
    />
  </div>
{/if}
