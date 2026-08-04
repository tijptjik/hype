<script lang="ts">
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
  getUserFeatures,
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

let isSubmitting = $state(false)
let isLastVisitedHovered = $state(false)
let hasLeftLastVisitedButton = $state(true)

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

  // Do not turn a newly created visited button into "Remove Visit" while the pointer is still
  // resting where the check-in button was. A real leave is required before that hover affordance.
  if (nextIsVisited) {
    hasLeftLastVisitedButton = false
    isLastVisitedHovered = false
  }

  isSubmitting = true
  appCtx.applyUserFeatureState(feature.id, optimistic)

  try {
    const mutation = nextIsVisited
      ? addUserFeatureToList({
          featureId: feature.id,
          list: 'visited',
          visitedAt,
        })
      : removeUserFeatureFromList({ featureId: feature.id, list: 'visited' })
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
    class="flex h-full w-[calc(12ch+2.125rem)] min-w-[calc(12ch+2.125rem)] flex-col items-start justify-center pl-2 text-left text-sm text-neutral-content transition-colors hover:text-primary focus-visible:outline-none focus-visible:text-primary"
    title={m.feature_action_remove_visit()}
    onmouseenter={() => {
      isLastVisitedHovered = hasLeftLastVisitedButton
    }}
    onmouseleave={() => {
      hasLeftLastVisitedButton = true
      isLastVisitedHovered = false
    }}
    onfocus={() => {
      isLastVisitedHovered = hasLeftLastVisitedButton
    }}
    onblur={() => (isLastVisitedHovered = false)}
    onclick={() => {
      void toggleVisited()
    }}
  >
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
  </button>
{:else if visitActionState === 'visited'}
  <FeatureCardActionButton
    text={m.feature_action_visited()}
    icon={visitedIcon}
    variant="secondary"
    hideLabelBelow={544}
    expandedClass="w-[calc(12ch+2.125rem)] min-w-[calc(12ch+2.125rem)]"
    disabled
  />
{:else}
  <FeatureCardActionButton
    text={m.noble_fine_ibex_pinch()}
    icon={checkIcon}
    variant="secondary"
    hideLabelBelow={544}
    expandedClass="w-[calc(12ch+2.125rem)] min-w-[calc(12ch+2.125rem)]"
    onClick={() => {
      void toggleVisited()
    }}
    disabled={isSubmitting}
  />
{/if}
