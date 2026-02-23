<script lang="ts">
import type { CardAvatarProps } from '../card.types'

let {
  name = null,
  image = null,
  class: className = '',
  imageClass = '',
  fallbackClass = '',
}: CardAvatarProps = $props()

let imageFailed = $state(false)

function getInitial(value?: string | null): string {
  return value?.trim()?.charAt(0)?.toUpperCase() || '?'
}
</script>

<figure class={className}>
  {#if image && !imageFailed}
    <img
      src={image}
      alt={name || 'Avatar'}
      class={imageClass}
      loading="lazy"
      onerror={() => {
        imageFailed = true
      }}
    >
  {:else}
    <div class={fallbackClass}>{getInitial(name)}</div>
  {/if}
</figure>
