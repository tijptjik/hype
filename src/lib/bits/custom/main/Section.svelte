<script lang="ts">
import type { MainSectionProps } from './main.types'

let {
  children,
  class: className = '',
  isVisible = true,
  transition = 'none',
}: MainSectionProps = $props()

const sectionClass = $derived(
  [
    'bits-theme bits-main__section',
    transition === 'fade' ? 'bits-main__section--fade' : '',
    transition === 'fade' && !isVisible ? 'bits-main__section--faded' : '',
    transition !== 'fade' && !isVisible ? 'bits-main__section--hidden' : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)
</script>

{#if transition === 'fade'}
  <section class={sectionClass} aria-hidden={!isVisible} inert={!isVisible}>
    {@render children?.()}
  </section>
{:else}
  <section class={sectionClass} hidden={!isVisible} aria-hidden={!isVisible}>
    {@render children?.()}
  </section>
{/if}
