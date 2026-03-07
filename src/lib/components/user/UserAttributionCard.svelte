<script lang="ts">
import Icon from '$lib/components/common/Icon.svelte'
import { Eye, PlusCircle } from '@steeze-ui/heroicons'
import { formatDate } from '$lib'
import { resolveAvatarImageSrc } from '$lib/utils/avatar'
import { formatDistanceToNow } from 'date-fns'
import { getUserForAttribution } from '$lib/api/server/user.remote'
import { getAppCtx } from '$lib/context/app.svelte'
import Image from '../common/Image.svelte'
import type { UserHydrationAdminProfile, UserHydrationResult } from '$lib/types'

type Props = {
  userId: string | null
  date: string | undefined
  type?: 'contributor' | 'publisher' | 'imageContributor'
  class?: string
  friendlyDate?: boolean
  bgClass?: string
}

// STATE : PROPS
let {
  userId,
  date,
  type = 'imageContributor',
  class: className = '',
  friendlyDate = true,
  bgClass = 'bg-glass-result',
}: Props = $props()
const appCtx = getAppCtx()

// STATE : DERIVED
let formattedDate = $derived(
  date
    ? friendlyDate
      ? formatDistanceToNow(new Date(date), { addSuffix: true })
      : formatDate(date)
    : '',
)
let userProfile: 'card' | 'attribution' = $derived(
  appCtx.isAdmin() ? 'card' : 'attribution',
)

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

<!-- <div class="opacity-0 transition-opacity duration-200 group-hover:opacity-100"> -->
<div>
  {#if userId}
    {#await getAttributionUser()}
      <div
        class="flex min-w-50 items-center gap-3 rounded-lg {bgClass} p-3 backdrop-blur-sm transition-all duration-200"
      >
        <div class="loading loading-ring loading-md min-h-12"></div>
      </div>
    {:then user}
      {@const adminUser = isAdminUser(user) ? user : null}
      {@const displayName = adminUser?.name ?? user?.attribution ?? 'Unknown User'}
      <div
        class="flex min-w-50 items-center gap-3 rounded-lg {bgClass} p-3 backdrop-blur-sm"
      >
        <Image
          src={resolveAvatarImageSrc(adminUser?.image) ?? ''}
          alt={displayName}
          class="h-12 w-12 rounded-full object-cover"
        />
        <div class="flex flex-col">
          <span class="font-medium">{displayName}</span>
          <div class="flex items-center gap-1 text-sm text-base-content/60">
            <Icon
              src={type.toLowerCase().includes('contributor') ? PlusCircle : Eye}
              class="h-4 w-4"
            />
            <span>{formattedDate}</span>
          </div>
        </div>
      </div>
    {:catch error}
      <div
        class="flex min-w-[200px] items-center gap-3 rounded-lg bg-error/10 p-3 backdrop-blur-sm transition-all duration-200"
      >
        <span class="text-sm text-error">{error.message}</span>
      </div>
    {/await}
  {/if}
</div>
