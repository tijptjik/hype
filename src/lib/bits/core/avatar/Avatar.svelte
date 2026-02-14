<script lang="ts">
import { Avatar } from 'bits-ui'
// TYPES
import type { AvatarProps } from './avatar.types'

let {
  name = null,
  src = null,
  alt = '',
  fallback = '',
  class: className = ''
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
const rootClass = $derived(
  ['relative inline-flex size-10 shrink-0 overflow-hidden rounded-full', className]
    .filter(Boolean)
    .join(' ')
)
</script>

<Avatar.Root class={rootClass}>
  {#if src}
    <Avatar.Image {src} alt={resolvedAlt} class="h-full w-full object-cover" />
  {/if}
  <Avatar.Fallback
    class="flex h-full w-full items-center justify-center bg-base-200 text-sm font-semibold uppercase text-base-content">
    {resolvedFallback}
  </Avatar.Fallback>
</Avatar.Root>
