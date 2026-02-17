<script lang="ts">
import type { SearchResultItemProps } from '../../search.types'

let {
  image = null,
  title,
  descriminator = null,
  onSelect,
  class: className = '',
}: SearchResultItemProps = $props()

const resolvedDiscriminator = $derived(descriminator?.trim() || null)
</script>

<button
  type="button"
  data-search-result-item="true"
  class={`bits-search-result-item ${className}`}
  onclick={() => onSelect?.()}
>
  {#if image}
    <img src={image} alt={title} class="bits-search-result-item__image" loading="lazy">
  {:else}
    <div class="bits-search-result-item__fallback">{title?.charAt(0) ?? '?'}</div>
  {/if}
  <div class="bits-search-result-item__title-wrap">
    <p class="bits-search-result-item__title">{title}</p>
  </div>
  {#if resolvedDiscriminator}
    <p class="bits-search-result-item__discriminator">{resolvedDiscriminator}</p>
  {/if}
</button>
