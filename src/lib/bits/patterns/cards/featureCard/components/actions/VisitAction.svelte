<script lang="ts">
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
import type { FeatureCardActionDisplay, FeatureCardVisitState } from '$lib/types'
// LOCAL
import VisitActionDisplay from './VisitActionDisplay.svelte'

interface Props {
  feature: Feature | UserContributedFeature
  isIconOnly?: boolean
}

let { feature, isIconOnly }: Props = $props()

const appCtx = getAppCtx()

let isSubmitting = $state(false)
let optimisticVisitState = $state<FeatureCardVisitState | null>(null)
let settledVisitState = $state<FeatureCardVisitState | null>(null)
let isVisitError = $state(false)
let visitErrorMessage = $state('')

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
const currentVisitState = $derived<FeatureCardVisitState>({
  isVisited,
  visitedAt: visitedFeature?.visitedAt ?? null,
})
const optimisticVisitValue = $derived(optimisticVisitState ?? currentVisitState)
const settledVisitValue = $derived(settledVisitState ?? currentVisitState)

/**
 * Converts a visit state into its normal display value.
 *
 * @param state Visit state to render.
 * @returns Main label and optional timestamp line.
 */
function getVisitValue(state: FeatureCardVisitState): FeatureCardActionDisplay {
  if (!state.isVisited || !state.visitedAt) {
    return {
      key: 'check-in',
      state: 'check-in',
      label: m.noble_fine_ibex_pinch(),
    }
  }

  return {
    key: `last-visited:${state.visitedAt}`,
    state: 'last-visited',
    label: m.white_dizzy_clownfish_quiz(),
    detail: formatDistanceToNow(new Date(state.visitedAt), {
      addSuffix: true,
      locale: toDateFnsLocale(),
    }).replace('minute', 'min'),
  }
}

/**
 * Converts an optimistic visit state into its immediate confirmation label.
 *
 * @param state Optimistic state requested by the user.
 * @returns The short-lived action content before the server settles it.
 */
function getOptimisticVisitValue(
  state: FeatureCardVisitState,
): FeatureCardActionDisplay {
  return state.isVisited
    ? { key: 'visited', state: 'visited', label: m.feature_action_visited() }
    : getVisitValue(state)
}

/**
 * Converts a visit state into its root-hover display value.
 *
 * @param state Visit state to render.
 * @returns Hover affordance and no timestamp detail.
 */
function getVisitHoverValue(
  state: FeatureCardVisitState,
): FeatureCardActionDisplay | undefined {
  if (!state.isVisited) return undefined

  return {
    key: `remove-visit:${state.visitedAt ?? ''}`,
    state: 'remove-visit',
    label: m.feature_action_remove_visit(),
  }
}

function clearVisitError(): void {
  isVisitError = false
  visitErrorMessage = ''
}

function showVisitError(message: string): void {
  isVisitError = true
  visitErrorMessage = message
  setTimeout(() => {
    clearVisitError()
  }, 3000)
}

$effect(() => {
  if (isSubmitting || isVisitError) return
  optimisticVisitState = currentVisitState
  settledVisitState = currentVisitState
})
/**
 * Saves the list change for the feature and account that initiated the action.
 *
 * @returns Nothing after the save and local state reconciliation finish.
 */
async function toggleVisited(): Promise<void> {
  if (isSubmitting || !('id' in feature)) return
  const featureId = feature.id
  const userId = appCtx.user?.id

  const previous = visitedFeature ?? wishlistedFeature ?? null
  const nextIsVisited = !isVisited
  const visitedAt = nextIsVisited ? new Date().toISOString() : null
  const optimistic = {
    featureId,
    isWishlisted: Boolean(wishlistedFeature),
    isVisited: nextIsVisited,
    visitedAt,
  } as UserFeature

  isSubmitting = true
  clearVisitError()
  optimisticVisitState = { isVisited: nextIsVisited, visitedAt }
  appCtx.applyUserFeatureState(featureId, optimistic)

  try {
    const mutation = nextIsVisited
      ? addUserFeatureToList({
          featureId,
          list: 'visited',
          visitedAt,
        })
      : removeUserFeatureFromList({ featureId, list: 'visited' })
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
    settledVisitState = {
      isVisited: Boolean(settled?.isVisited),
      visitedAt: settled?.visitedAt ?? null,
    }
  } catch (error) {
    if (appCtx.user?.id !== userId) return
    appCtx.applyUserFeatureState(featureId, previous)
    if (!('id' in feature) || feature.id !== featureId) return
    console.error('Error updating visited status:', error)
    const previousVisitState = {
      isVisited: Boolean(previous?.isVisited),
      visitedAt: previous?.visitedAt ?? null,
    }
    optimisticVisitState = previousVisitState
    settledVisitState = previousVisitState
    const message = 'Failed to update visited status'
    showVisitError(message)
    toast.error(message)
  } finally {
    isSubmitting = false
  }
}
</script>

<VisitActionDisplay
  currentValue={getVisitValue(currentVisitState)}
  currentHoverValue={getVisitHoverValue(currentVisitState)}
  optimisticValue={getOptimisticVisitValue(optimisticVisitValue)}
  optimisticHoverValue={getVisitHoverValue(optimisticVisitValue)}
  settledValue={getVisitValue(settledVisitValue)}
  settledHoverValue={getVisitHoverValue(settledVisitValue)}
  isError={isVisitError}
  errorMessage={visitErrorMessage}
  {isIconOnly}
  onClick={() => {
    void toggleVisited()
  }}
/>
