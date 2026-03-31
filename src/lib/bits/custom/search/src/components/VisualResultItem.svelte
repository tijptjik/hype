<script lang="ts">
import type { SearchResultItemProps } from '../../search.types'

let {
  title,
  descriminator = null,
  previewImage = null,
  disabled = false,
  disabledMeta = null,
  staggerIndex = 0,
  onSelect,
  class: className = '',
  previewClass = '',
}: SearchResultItemProps = $props()

const resolvedDiscriminator = $derived(descriminator?.trim() || null)
const resolvedDisabledLabel = $derived(disabledMeta?.label?.trim() || null)
const resolvedDisabledValue = $derived(disabledMeta?.value?.trim() || null)
</script>

<button
  type="button"
  data-search-result-item="true"
  data-search-result-variant="visual"
  data-staggered-entrance="true"
  class={`bits-search-result-item bits-search-result-item--visual ${className}`}
  data-disabled={disabled}
  aria-disabled={disabled}
  style={`--bits-search-result-delay: ${Math.min(staggerIndex, 5) * 32}ms;`}
  {disabled}
  onclick={() => onSelect?.()}
>
  <div
    class="bits-search-result-item__content bits-search-result-item__content--visual"
  >
    <div class={`bits-search-result-item__preview ${previewClass}`}>
      {#if previewImage}
        <img
          src={previewImage}
          alt={title}
          class="bits-search-result-item__preview-image"
          loading="lazy"
        >
      {:else}
        <div class="bits-search-result-item__preview-fallback">
          {title?.charAt(0) ?? '?'}
        </div>
      {/if}
    </div>

    <div class="bits-search-result-item__copy">
      <div class="bits-search-result-item__title-wrap">
        <p class="bits-search-result-item__title">{title}</p>
      </div>
      {#if resolvedDiscriminator}
        <p class="bits-search-result-item__discriminator">{resolvedDiscriminator}</p>
      {/if}
    </div>
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
