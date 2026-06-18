<script lang="ts">
// BITS
import { cx } from '$lib/bits/utils'
// I18N
import { m } from '$lib/i18n'
// TYPES
import type { UserValidationResult } from '$lib/client/services/import/types'

type Props = {
  user?: UserValidationResult | null
  size?: 'sm' | 'md'
  tone?: 'primary' | 'success'
  emailClass?: string
}

let {
  user,
  size = 'md',
  tone = 'primary',
  emailClass = 'text-base-content/70',
}: Props = $props()

const avatarSizeClass = $derived(
  size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm',
)
const nameClass = $derived(size === 'sm' ? 'text-sm font-medium' : 'font-medium')
const emailTextClass = $derived(cx(size === 'sm' ? 'text-xs' : 'text-sm', emailClass))
const fallbackClass = $derived(
  tone === 'success'
    ? 'bg-success text-success-content'
    : 'bg-primary text-primary-content',
)
const displayName = $derived(user?.name || m.feature_import__user_unknown())
const initial = $derived(displayName.charAt(0).toUpperCase() || '?')
</script>

{#if user?.image}
  <img
    src={user.image}
    alt={displayName}
    class={cx(avatarSizeClass, 'rounded-full object-cover')}
  >
{:else}
  <div
    class={cx(
      'flex shrink-0 items-center justify-center rounded-full font-medium',
      avatarSizeClass,
      fallbackClass,
    )}
  >
    {initial}
  </div>
{/if}

<div class="min-w-0 flex-1">
  <div class={nameClass}>{displayName}</div>
  {#if user?.email}
    <div class={emailTextClass}>
      {user.email}
    </div>
  {/if}
</div>
