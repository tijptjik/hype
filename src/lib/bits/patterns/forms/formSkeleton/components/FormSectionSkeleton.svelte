<script lang="ts">
// SVELTE
import type { Component, Snippet } from 'svelte'
// BITS
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import { formSearchHeaderStyles } from '../../formSurface/formSearchHeader.styles.js'
import { cx } from '#lib/bits/utils.js'
import { formSectionDividerStyles } from '../../formSurface/formSurface.styles'
let {
  title,
  subtitle,
  icon,
  divided = true,
  reserveSearch = false,
  children,
}: {
  title: string
  subtitle?: string
  icon?: Component
  divided?: boolean
  reserveSearch?: boolean
  children: Snippet
} = $props()
</script>

<div class={cx(divided && formSectionDividerStyles)} aria-hidden="true">
  <section class="bits-form__section @container {reserveSearch ? 'pb-2!' : ''}">
    <SectionHeader
      {title}
      {icon}
      description={subtitle}
      class={reserveSearch ? formSearchHeaderStyles : ''}
    >
      {#snippet right()}
        {#if reserveSearch}
          <div class="h-10 w-full max-w-96"></div>
        {/if}
      {/snippet}
    </SectionHeader>
    {@render children()}
  </section>
</div>
