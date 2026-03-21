<script lang="ts">
import type { Snippet } from 'svelte'
import type { CardMediaProps } from '../card.types'

type Props = CardMediaProps & {
  children?: Snippet
}

let {
  name = null,
  image = null,
  class: className = '',
  imageClass = '',
  fallbackClass = '',
  size,
  loading = 'eager',
  children,
}: Props = $props()

let imageFailed = $state(false)

function getInitial(value?: string | null): string {
  return value?.trim()?.charAt(0)?.toUpperCase() || '?'
}
</script>

<figure
  class={['bits-card__media', className].filter(Boolean).join(' ')}
  data-size={size}
>
  {#if children}
    {@render children()}
  {:else if image && !imageFailed}
    <img
      src={image}
      alt={name || 'Media'}
      class={['bits-card__media-image', imageClass].filter(Boolean).join(' ')}
      {loading}
      decoding="async"
      onerror={() => {
        imageFailed = true
      }}
    >
  {:else}
    <div class={['bits-card__media-fallback', fallbackClass].filter(Boolean).join(' ')}>
      {getInitial(name)}
    </div>
  {/if}
</figure>
