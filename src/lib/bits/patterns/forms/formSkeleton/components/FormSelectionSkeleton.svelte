<script lang="ts">
// SVELTE
import type { Component } from 'svelte'
// COMPONENTS
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
// STYLES
import { formSelectionSectionStyles } from '../../formSurface/formSurface.styles.js'
import { formSelectionSearchHeaderStyles } from '../../formSurface/formSearchHeader.styles.js'
let { title, subtitle, icon }: { title: string; subtitle?: string; icon?: Component } =
  $props()
</script>
<section
  class={`bits-form__section bits-form__parent-resource ${formSelectionSectionStyles}`}
  aria-hidden="true"
>
  <SectionHeader
    {title}
    description={subtitle}
    {icon}
    class={formSelectionSearchHeaderStyles}
  />
  <!-- Selected style and parent cards share this 96px preview and the owning section's gutters. -->
  <div class="bits-form__parent-resource-list">
    <article class="flex min-w-0">
      <Skeleton class="size-24 shrink-0 rounded-lg" />
      <div class="min-w-0 flex-1 space-y-2">
        <Skeleton class="h-3 w-16" /><Skeleton class="h-4 w-32 max-w-full" />
        <Skeleton class="h-3 w-40 max-w-full" />
      </div>
    </article>
  </div>
</section>
