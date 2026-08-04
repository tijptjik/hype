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
// LOCAL
import VisitActionDisplay from './VisitActionDisplay.svelte'

type VisitState = {
  isVisited: boolean
  visitedAt: string | null
}

type VisitDisplay = {
  key: string
  label: string
  detail?: string
}

let { feature }: { feature: Feature | UserContributedFeature } = $props()

const appCtx = getAppCtx()

let isSubmitting = $state(false)
let optimisticVisitState = $state<VisitState | null>(null)
let settledVisitState = $state<VisitState | null>(null)
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
const currentVisitState = $derived<VisitState>({
  isVisited,
  visitedAt: visitedFeature?.visitedAt ?? null,
})
const activeVisitState = $derived(
  isVisitError
    ? (settledVisitState ?? currentVisitState)
    : isSubmitting
      ? (optimisticVisitState ?? currentVisitState)
      : (settledVisitState ?? currentVisitState),
)

/**
 * Converts a visit state into its normal display value.
 *
 * @param state Visit state to render.
 * @returns Main label and optional timestamp line.
 */
function getVisitValue(state: VisitState): VisitDisplay {
  if (!state.isVisited || !state.visitedAt) {
    return { key: 'check-in', label: m.noble_fine_ibex_pinch() }
  }

  return {
    key: `last-visited:${state.visitedAt}`,
    label: m.white_dizzy_clownfish_quiz(),
    detail: formatDistanceToNow(new Date(state.visitedAt), {
      addSuffix: true,
      locale: toDateFnsLocale(),
    }).replace('minute', 'min'),
  }
}

/**
 * Converts a visit state into its root-hover display value.
 *
 * @param state Visit state to render.
 * @returns Hover affordance and no timestamp detail.
 */
function getVisitHoverValue(state: VisitState): VisitDisplay | undefined {
  if (!state.isVisited) return undefined

  return {
    key: `remove-visit:${state.visitedAt ?? ''}`,
    label: m.feature_action_remove_visit(),
  }
}

const visitDisplay = $derived<VisitDisplay>(
  isVisitError
    ? { key: `visit-error:${visitErrorMessage}`, label: visitErrorMessage }
    : getVisitValue(activeVisitState),
)
const visitHoverDisplay = $derived(
  isVisitError ? undefined : getVisitHoverValue(activeVisitState),
)

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
  clearVisitError()
  optimisticVisitState = { isVisited: nextIsVisited, visitedAt }
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

    const settled = (response?.data as UserFeature | null) ?? null
    settledVisitState = {
      isVisited: Boolean(settled?.isVisited),
      visitedAt: settled?.visitedAt ?? null,
    }
    appCtx.applyUserFeatureState(feature.id, settled)
  } catch (error) {
    console.error('Error updating visited status:', error)
    const previousVisitState = {
      isVisited: Boolean(previous?.isVisited),
      visitedAt: previous?.visitedAt ?? null,
    }
    optimisticVisitState = previousVisitState
    settledVisitState = previousVisitState
    appCtx.applyUserFeatureState(feature.id, previous)
    const message = 'Failed to update visited status'
    showVisitError(message)
    toast.error(message)
  } finally {
    isSubmitting = false
  }
}
</script>

<VisitActionDisplay
  value={visitDisplay}
  hoverValue={visitHoverDisplay}
  onClick={() => {
    void toggleVisited()
  }}
/>
