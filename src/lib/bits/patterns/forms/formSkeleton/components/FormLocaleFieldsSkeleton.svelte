<script lang="ts">
// SVELTE
import type { Component } from 'svelte'
// BITS
import FormI18nSection from '../../formI18nSection/FormI18nSection.svelte'
import FormFieldSkeleton from './FormFieldSkeleton.svelte'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import { SectionHeader } from '#lib/bits/custom/form/index.js'
// TYPES
import type { LocaleKey } from '#lib/types.js'
let {
  title,
  icon,
  locales,
  fields,
  byField = false,
}: {
  title: string
  icon?: Component
  locales: LocaleKey[]
  fields: Array<{ label: string; multiline?: boolean }>
  byField?: boolean
} = $props()
</script>

<div aria-hidden="true">
  {#if byField}
    <SectionHeader {title} {icon} />
    <div class="px-6 pt-6 pb-6">
      <div class="border-border/50 mb-6 flex justify-end border-b pb-3">
        <Skeleton class="h-8 w-28" />
      </div>
      <div class="grid min-w-0 gap-6 md:grid-cols-3 md:grid-rows-[min-content_1fr]">
        {#each fields as field, index}
          <section
            class="min-w-0 {field.multiline
              ? 'md:col-span-2 md:col-start-2 md:row-span-2 md:row-start-1 md:h-full md:border-l md:border-border/50 md:pl-6'
              : index === 1
                ? 'md:col-start-1 md:row-start-2'
                : 'md:col-start-1 md:row-start-1'}"
          >
            <h3 class="flex min-h-7 items-center text-sm font-semibold">
              {field.label}
            </h3>
            <div class="mt-3 space-y-2">
              {#each locales as locale}
                <FormFieldSkeleton label={`${field.label} ${locale}`} inline />
              {/each}
            </div>
          </section>
        {/each}
      </div>
    </div>
  {:else}
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
            <Icon class="text-primary size-6" />
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
  {/if}
</div>
