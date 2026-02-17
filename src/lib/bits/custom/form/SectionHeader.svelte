<script lang="ts">
import Header from '$lib/bits/custom/header/Header.svelte'
import * as SectionHeaderPrimitive from './src/sectionHeader/components'
import type { SectionHeaderProps } from './sectionHeader.types'

let {
  title,
  description,
  size = 'sm',
  flags = [],
  actions = [],
  triggers = [],
  left,
  right,
  class: className = '',
}: SectionHeaderProps = $props()

const rootClass = $derived(
  ['bits-form__section-header', className].filter(Boolean).join(' '),
)
</script>

<header class={rootClass}>
  <div class="bits-form__section-header-left">
    {#if left}
      {@render left()}
    {:else if title || description}
      <Header
        text={title}
        {description}
        {size}
        class="bits-form__section-header-heading"
      />
    {/if}
  </div>

  <div class="bits-form__section-header-right">
    {#if right}
      {@render right()}
    {:else}
      {#each actions as action}
        <SectionHeaderPrimitive.Action {...action} />
      {/each}

      {#each flags as flag}
        <SectionHeaderPrimitive.Flag {...flag} />
      {/each}

      {#each triggers as trigger}
        <SectionHeaderPrimitive.Trigger {...trigger} />
      {/each}
    {/if}
  </div>
</header>
