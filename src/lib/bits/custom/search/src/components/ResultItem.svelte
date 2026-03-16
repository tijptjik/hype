<script lang="ts">
import type { SearchResultItemProps } from '../../search.types'

let {
  image = null,
  title,
  descriminator = null,
  disabled = false,
  disabledMeta = null,
  onSelect,
  class: className = '',
}: SearchResultItemProps = $props()

const resolvedDiscriminator = $derived(descriminator?.trim() || null)
const resolvedDisabledLabel = $derived(disabledMeta?.label?.trim() || null)
const resolvedDisabledValue = $derived(disabledMeta?.value?.trim() || null)
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
  data-disabled={disabled}
  aria-disabled={disabled}
  {disabled}
  onclick={() => onSelect?.()}
>
  <div class="bits-search-result-item__content">
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
  </div>

  {#if disabled && resolvedDisabledLabel}
    <div class="bits-search-result-item__disabled-callout" aria-hidden="true">
      <span class="bits-search-result-item__disabled-label"
        >{resolvedDisabledLabel}</span
      >
      {#if resolvedDisabledValue}
        <span class="bits-search-result-item__disabled-value"
          >@ {resolvedDisabledValue}</span
        >
      {/if}
    </div>
  {/if}
</button>
