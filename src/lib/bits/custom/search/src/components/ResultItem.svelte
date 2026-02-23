<script lang="ts">
import type { SearchResultItemProps } from '../../search.types'

let {
  image = null,
  title,
  descriminator = null,
  disabled = false,
  onSelect,
  class: className = '',
}: SearchResultItemProps = $props()

const resolvedDiscriminator = $derived(descriminator?.trim() || null)
let imageLoaded = $state(false)
let imageFailed = $state(false)

$effect(() => {
  image
  imageLoaded = false
  imageFailed = false
})
</script>

<button
  type="button"
  data-search-result-item="true"
  class={`bits-search-result-item ${className}`}
  aria-disabled={disabled}
  {disabled}
  onclick={() => onSelect?.()}
>
  {#if image && !imageFailed}
    <div class="bits-search-result-item__avatar" data-loaded={imageLoaded}>
      <div class="bits-search-result-item__avatar-skeleton" aria-hidden="true"></div>
      <img
        src={image}
        alt={title}
        class="bits-search-result-item__image"
        loading="lazy"
        onload={() => {
          imageLoaded = true
        }}
        onerror={() => {
          imageFailed = true
        }}
      >
    </div>
  {:else}
    <div
      class={`bits-search-result-item__fallback ${imageFailed ? 'bits-search-result-item__fallback--image-failed' : ''}`}
    >
      {title?.charAt(0) ?? '?'}
    </div>
  {/if}
  <div class="bits-search-result-item__title-wrap">
    <p class="bits-search-result-item__title">{title}</p>
  </div>
  {#if resolvedDiscriminator}
    <p class="bits-search-result-item__discriminator">{resolvedDiscriminator}</p>
  {/if}
</button>
