<script lang="ts">
import { getUserForAttribution } from '$lib/api/server/user.remote'
import { TransitionStack } from '$lib/bits/custom/transition'
import { getAppCtx } from '$lib/context/app.svelte'
import { resolveAvatarImageSrc } from '$lib/utils/avatar'
import RelativeDate from './components/RelativeDate.svelte'
import type { UserAttributionCardProps } from './userAttributionCard.types'
import type {
  UserHydrationAdminProfile,
  UserHydrationResult,
} from '$lib/db/zod/schema/user.types'

let {
  userId,
  date,
  type = 'imageContributor',
  friendlyDate = true,
  openDirection = 'right',
  isOpen = false,
  class: className = '',
}: UserAttributionCardProps = $props()

type AttributionCardDisplay = {
  key: string
  user: UserHydrationResult
  date?: string
  friendlyDate: boolean
}

const appCtx = getAppCtx()

const userProfile = $derived(appCtx.isAdmin() ? 'card' : 'attribution')
const persistenceKey = $derived(
  `user-attribution-card:${type}:${appCtx.isAdmin() ? 'admin' : 'public'}`,
)

const isAdminUser = (user: UserHydrationResult): user is UserHydrationAdminProfile =>
  Boolean(user && 'name' in user && 'image' in user)

const toDisplayState = (
  user: UserHydrationResult,
  nextUserId: string,
  nextDate?: string,
  nextFriendlyDate = true,
): AttributionCardDisplay => ({
  key: [nextUserId, nextDate ?? '', nextFriendlyDate ? 'friendly' : 'absolute'].join(
    ':',
  ),
  user,
  date: nextDate,
  friendlyDate: nextFriendlyDate,
})

let resolvedAttribution = $state<AttributionCardDisplay | null>(null)
let hasResolvedAttribution = $state(false)
let attributionRequestVersion = 0

$effect(() => {
  if (!userId) {
    attributionRequestVersion += 1
    resolvedAttribution = null
    hasResolvedAttribution = false
    return
  }

  const requestVersion = ++attributionRequestVersion
  const nextUserId = userId
  const nextDate = date
  const nextFriendlyDate = friendlyDate
  const nextProfile = userProfile
  const isAdminRequest = appCtx.isAdmin()

  void getUserForAttribution({
    id: nextUserId,
    meta: {
      profile: nextProfile,
      ...(isAdminRequest ? { isAdminRequest: true } : {}),
    },
  })
    .then(user => {
      if (requestVersion !== attributionRequestVersion) return
      resolvedAttribution = toDisplayState(
        user as UserHydrationResult,
        nextUserId,
        nextDate,
        nextFriendlyDate,
      )
      hasResolvedAttribution = true
    })
    .catch(() => {
      if (requestVersion !== attributionRequestVersion) return
      resolvedAttribution = toDisplayState(null, nextUserId, nextDate, nextFriendlyDate)
      hasResolvedAttribution = true
    })
})

const getDisplayName = (user: UserHydrationResult): string => {
  const adminUser = isAdminUser(user) ? user : null
  return adminUser?.name ?? user?.attribution ?? 'Unknown User'
}
</script>

{#if userId && resolvedAttribution}
  {#snippet AttributionContent(attribution: AttributionCardDisplay)}
    {@const adminUser = isAdminUser(attribution.user) ? attribution.user : null}
    {@const displayName = getDisplayName(attribution.user)}
    <div class="bits-feature-attribution__body">
      <span class="bits-feature-attribution__title">{displayName}</span>
      <span class="bits-feature-attribution__subtitle" style="line-height:1.15">
        <RelativeDate date={attribution.date} friendly={attribution.friendlyDate} />
      </span>
    </div>
  {/snippet}

  {@const adminUser = isAdminUser(resolvedAttribution.user) ? resolvedAttribution.user : null}
  {@const displayName = getDisplayName(resolvedAttribution.user)}
  {#if isOpen}
    <article
      class={`bits-feature-attribution-shell ${className}`}
      data-direction={openDirection}
      data-open="true"
    >
      <div class="bits-feature-attribution-shell__panel">
        <div class="bits-feature-attribution-shell__visible">
          {@render AttributionContent(resolvedAttribution)}
        </div>
      </div>

      <div class="bits-feature-attribution-shell__trigger" aria-hidden="true">
        <img
          class="bits-feature-attribution__avatar"
          src={resolveAvatarImageSrc(adminUser?.image) ?? ''}
          alt={displayName}
        >
      </div>
    </article>
  {:else}
    <article
      class={`bits-feature-attribution-shell ${className}`}
      data-direction={openDirection}
      data-open="false"
    >
      <div class="bits-feature-attribution-shell__panel">
        <div class="bits-feature-attribution-shell__visible">
          <TransitionStack
            valueKey={resolvedAttribution.key}
            value={resolvedAttribution}
            isReady={hasResolvedAttribution}
            duration={180}
            {persistenceKey}
          >
            {#snippet children(attribution: AttributionCardDisplay)}
              {@render AttributionContent(attribution)}
            {/snippet}
          </TransitionStack>
        </div>
      </div>

      <button
        type="button"
        class="bits-feature-attribution-shell__trigger"
        aria-label={displayName}
      >
        <img
          class="bits-feature-attribution__avatar"
          src={resolveAvatarImageSrc(adminUser?.image) ?? ''}
          alt={displayName}
        >
      </button>
    </article>
  {/if}
{/if}
