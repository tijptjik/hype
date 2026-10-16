<script lang="ts">
// SVELTE
import type { Component, Snippet } from 'svelte'
// BITS
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import { cx } from '#lib/bits/utils.js'
import { formSectionDividerStyles } from '../../formSurface/formSurface.styles'
let {
  title,
  subtitle,
  icon,
  divided = true,
  children,
}: {
  title: string
  subtitle?: string
  icon?: Component
  divided?: boolean
  children: Snippet
} = $props()
</script>

<div class={cx(divided && formSectionDividerStyles)} aria-hidden="true">
  <section class="bits-form__section">
    <SectionHeader {title} {icon} description={subtitle} />
    {@render children()}
  </section>
</div>
