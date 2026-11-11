<script lang="ts">
// SVELTE
import type { Component, Snippet } from 'svelte'
// BITS
import FormI18nSection from '../../formI18nSection/FormI18nSection.svelte'
import FormFieldSkeleton from './FormFieldSkeleton.svelte'
import FeatureProfileEditor from '../../featureLocation/FeatureProfileEditor.svelte'
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
import { restoreProfileLocales } from '../../featureLocation/profileLocales.js'
import { contentLocaleOptions } from '../../contentLocaleDefaults/contentLocaleOptions.js'
import { getLocaleKey } from '#lib/i18n.js'
import { SectionHeader } from '#lib/bits/custom/form/index.js'
// TYPES
import type { LocaleKey } from '#lib/types.js'
let {
  title,
  icon,
  locales,
  fields,
  byField = false,
  expanded = false,
  stackNames = true,
  subtitle,
  afterField,
  toolbarHeader,
  placeholder,
  horizontalToolbar = false,
  stickyFieldHeaders = ['description'],
}: {
  placeholder?: Snippet<[string]>
  toolbarHeader?: Snippet<[Snippet]>
  horizontalToolbar?: boolean
  stickyFieldHeaders?: boolean | string[]
  title: string
  icon?: Component
  locales: LocaleKey[]
  fields: Array<{ key?: string; label: string; multiline?: boolean }>
  byField?: boolean
  expanded?: boolean
  stackNames?: boolean
  subtitle?: string
  afterField?: import('svelte').Snippet<[string]>
} = $props()
const localeState = $derived({ ...restoreProfileLocales(locales, {}), expanded })
const configs = $derived(
  fields.map((field, index) => ({
    key:
      field.key ??
      (field.multiline ? 'description' : index === 0 ? 'name' : 'nameShort'),
    label: field.label,
    kind: field.multiline ? ('textarea' as const) : ('input' as const),
  })),
)
</script>

<div aria-hidden="true" inert>
  {#if byField}
    <div class="mb-4">
      {#snippet localeToolbar()}
        <LocaleToolbar
          horizontal={horizontalToolbar}
          selectedLocales={localeState.selectedLocales}
          visibleLocales={localeState.visibleLocales}
          options={contentLocaleOptions(getLocaleKey())}
          {expanded}
          disabled
          allowAdd={false}
          onExpandedChange={() => {}}
          onChange={() => {}}
        />
      {/snippet}
      {#if toolbarHeader}
        {@render toolbarHeader(localeToolbar)}
      {:else}
        <SectionHeader
          {title}
          {icon}
          description={subtitle}
          class="grid-cols-1! gap-y-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]! [&_.bits-form\_\_section-header-right]:[container-type:normal]! [&_.bits-form\_\_section-header-right]:block [&_.bits-form\_\_section-header-right]:min-w-0"
        >
          {#snippet right()}
            {@render localeToolbar()}
          {/snippet}
        </SectionHeader>
      {/if}
    </div>
    <!-- Use the production field grid and language visibility rather than an expanded approximation. -->
    <FeatureProfileEditor
      loading={!placeholder}
      contextKey={`loading:${title}`}
      {stackNames}
      showToolbar={false}
      showPrimaryLocaleHeader={false}
      localeHeaderPlacement="gutter"
      {stickyFieldHeaders}
      {localeState}
      onLocaleStateChange={() => {}}
      values={{}}
      fieldConfigs={configs}
      {afterField}
      translate={async () => ({ status: 'translated', text: '' })}
      onTranslated={() => {}}
    >
      {#snippet children(field)}
        {#if placeholder}
          {@render placeholder(field)}
        {:else}
          <div
            class={field === 'description'
              ? 'min-h-[calc(42px+1.25rem)] md:min-h-[42px]'
              : 'min-h-[42px]'}
          ></div>
        {/if}
      {/snippet}
    </FeatureProfileEditor>
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
