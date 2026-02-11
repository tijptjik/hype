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
</script>

<Avatar.Root class={className}>
  {#if src}
    <Avatar.Image {src} alt={resolvedAlt} />
  {/if}
  <Avatar.Fallback>{resolvedFallback}</Avatar.Fallback>
</Avatar.Root>
