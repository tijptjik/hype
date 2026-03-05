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
  center,
  right,
  class: className = '',
}: SectionHeaderProps = $props()

const rootClass = $derived(
  [
    'bits-form__section-header',
    center ? 'bits-form__section-header--with-center' : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
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

  {#if center}
    <div class="bits-form__section-header-center">
      <div class="bits-form__section-header-center-content">{@render center()}</div>
    </div>
  {/if}

  <div class="bits-form__section-header-right">
    {#if right}
      {@render right()}
    {:else}
      {#each actions as action, index (action.key ?? `${action.text ?? 'action'}-${index}`)}
        <SectionHeaderPrimitive.Action {...action} />
      {/each}

      {#each flags as flag, index (flag.key ?? `${flag.label ?? 'flag'}-${index}`)}
        <SectionHeaderPrimitive.Flag {...flag} />
      {/each}

      {#each triggers as trigger, index (trigger.key ?? `${trigger.text ?? 'trigger'}-${index}`)}
        <SectionHeaderPrimitive.Trigger {...trigger} />
      {/each}
    {/if}
  </div>
</header>
