<script lang="ts">
import { fade } from 'svelte/transition'
import type { MainSectionProps } from './main.types'

let {
  children,
  class: className = '',
  isVisible = true,
  transition = 'none',
}: MainSectionProps = $props()

const sectionClass = $derived(
  ['bits-theme bits-main__section', className].filter(Boolean).join(' '),
)
</script>

{#if transition === 'fade'}
  {#if isVisible}
    <section
      class={sectionClass}
      in:fade={{ duration: 180 }}
      out:fade={{ duration: 180 }}
    >
      {@render children?.()}
    </section>
  {/if}
{:else}
  <section
    class={[
      sectionClass,
      isVisible ? '' : 'bits-main__section--hidden',
    ]
      .filter(Boolean)
      .join(' ')}
  >
    {@render children?.()}
  </section>
{/if}
