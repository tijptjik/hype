<script lang="ts">
// SVELTE
import type { Component } from 'svelte'
// BITS
import FormI18nSection from '../../formI18nSection/FormI18nSection.svelte'
import FormFieldSkeleton from './FormFieldSkeleton.svelte'
// TYPES
import type { LocaleKey } from '#lib/types.js'
let {
  title,
  icon,
  locales,
  fields,
}: {
  title: string
  icon?: Component
  locales: LocaleKey[]
  fields: Array<{ label: string; multiline?: boolean }>
} = $props()
</script>

<div aria-hidden="true">
  <FormI18nSection
    {title}
    {locales}
    isEditing={false}
    localeCodeClass="absolute right-6 top-3 text-base font-medium uppercase text-muted-foreground"
  >
    {#snippet left()}
      <div class="flex items-center gap-3">
        {#if icon}
          {@const Icon = icon}
          <Icon class="size-6 text-primary" />
        {/if}
        <h2 class="text-xl font-semibold tracking-tight">{title}</h2>
      </div>
    {/snippet}
    {#snippet children()}
      {#each fields as field}
        <FormFieldSkeleton {...field} />
      {/each}
    {/snippet}
  </FormI18nSection>
</div>
