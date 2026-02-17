<script lang="ts">
import { Avatar } from 'bits-ui'
import { resolveAvatarImageSrc } from '$lib/utils/avatar'
// TYPES
import type { AvatarProps } from './avatar.types'

let {
  name = null,
  src = null,
  alt = '',
  fallback = '',
  shape = 'circle',
  fitHeight = false,
  class: className = '',
}: AvatarProps = $props()

function getInitials(value?: string | null): string {
  if (!value) return '?'

  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
}

const resolvedAlt = $derived(alt || (name ? `${name} avatar` : 'Avatar'))
const resolvedFallback = $derived(fallback || getInitials(name))
const resolvedSrc = $derived(
  typeof src === 'string' && src.trim().length > 0 ? resolveAvatarImageSrc(src) : null,
)
const rootClass = $derived(
  [
    'relative inline-flex shrink-0 overflow-hidden',
    shape === 'circle' ? 'size-10 rounded-full' : 'size-10 rounded-none',
    fitHeight ? 'h-full w-auto aspect-square' : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)
</script>

<Avatar.Root class={rootClass}>
  {#if resolvedSrc}
    <Avatar.Image
      src={resolvedSrc}
      alt={resolvedAlt}
      class="h-full w-full object-cover"
    />
  {/if}
  <Avatar.Fallback
    class="flex h-full w-full items-center justify-center bg-base-200 text-sm font-semibold uppercase text-base-content"
  >
    {resolvedFallback}
  </Avatar.Fallback>
</Avatar.Root>
