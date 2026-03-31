<script lang="ts">
// TYPES
import type { FormFeatureSectionHeaderProps } from './formFeatureSectionHeader.types'

let {
  title,
  subtitle = '',
  class: className = '',
  left,
  right,
}: FormFeatureSectionHeaderProps = $props()

const rootClass = $derived(
  [
    'bits-feature-section-header',
    subtitle ? 'bits-feature-section-header--with-subtitle' : '',
    left || right ? 'bits-feature-section-header--with-rails' : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)
</script>

<div class={rootClass}>
  <div
    class="bits-feature-section-header__rail bits-feature-section-header__rail--left"
  >
    {#if left}
      {@render left()}
    {/if}
  </div>

  <div class="bits-feature-section-header__content">
    <h2 class="bits-feature-section-header__title">{title}</h2>
    {#if subtitle}
      <p class="bits-feature-section-header__subtitle">{subtitle}</p>
    {/if}
  </div>

  <div
    class="bits-feature-section-header__rail bits-feature-section-header__rail--right"
  >
    {#if right}
      {@render right()}
    {/if}
  </div>
</div>
