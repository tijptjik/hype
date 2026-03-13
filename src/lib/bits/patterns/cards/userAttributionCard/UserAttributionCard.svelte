<script lang="ts">
import PlusCircle from 'virtual:icons/lucide/plus-circle'
import Eye from 'virtual:icons/lucide/eye'
import { getUserForAttribution } from '$lib/api/server/user.remote'
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
  class: className = '',
}: UserAttributionCardProps = $props()

const appCtx = getAppCtx()

const userProfile = $derived(appCtx.isAdmin() ? 'card' : 'attribution')
const Icon = $derived(type.toLowerCase().includes('contributor') ? PlusCircle : Eye)

const isAdminUser = (user: UserHydrationResult): user is UserHydrationAdminProfile =>
  Boolean(user && 'name' in user && 'image' in user)

const getAttributionUser = (): Promise<UserHydrationResult> => {
  if (!userId) return Promise.resolve(null)
  return getUserForAttribution({
    id: userId,
    meta: {
      profile: userProfile,
      ...(appCtx.isAdmin() ? { isAdminRequest: true } : {}),
    },
  }).then(user => user as UserHydrationResult)
}
</script>

{#if userId}
  {#await getAttributionUser()}
    <article class={`bits-feature-attribution ${className}`}>
      <div class="bits-feature-attribution__avatar"></div>
      <div class="bits-feature-attribution__body">
        <span class="bits-feature-attribution__title">...</span>
      </div>
    </article>
  {:then user}
    {@const adminUser = isAdminUser(user) ? user : null}
    {@const displayName = adminUser?.name ?? user?.attribution ?? 'Unknown User'}
    <article class={`bits-feature-attribution ${className}`}>
      <img
        class="bits-feature-attribution__avatar"
        src={resolveAvatarImageSrc(adminUser?.image) ?? ''}
        alt={displayName}
      >
      <div class="bits-feature-attribution__body">
        <span class="bits-feature-attribution__title">{displayName}</span>
        <span class="bits-feature-attribution__subtitle">
          <RelativeDate {date} friendly={friendlyDate} />
        </span>
      </div>
    </article>
  {:catch _error}
    <article class={`bits-feature-attribution ${className}`}>
      <div class="bits-feature-attribution__body">
        <span class="bits-feature-attribution__title">Unknown User</span>
      </div>
    </article>
  {/await}
{/if}
