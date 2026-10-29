<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import InfoIcon from 'virtual:icons/lucide/info'
import ResetIcon from 'virtual:icons/lucide/rotate-ccw'
import EditIcon from 'virtual:icons/lucide/pencil'
// BITS COMPONENTS
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
// TYPES
import type {
  LocaleControlLabels,
  LocaleOption,
} from '#lib/bits/custom/localeControls/localeControls.types.js'

let {
  value,
  inheritedLocales,
  inheritedOrigin,
  scope,
  organisationName = '',
  options,
  onChange,
  disabled = false,
  labels,
  issues = [],
}: {
  /** Missing means inherit. Merely rendering this component must never emit a write. */
  value: string[] | undefined
  inheritedLocales: string[]
  inheritedOrigin: 'organisation' | 'user-default'
  scope: 'organisation' | 'project'
  organisationName?: string
  options: readonly LocaleOption[]
  onChange: (value: string[] | undefined) => void
  disabled?: boolean
  labels?: LocaleControlLabels
  issues?: readonly string[]
} = $props()
const id = $props.id()
let editing = $state(false)
const effective = $derived(value ?? inheritedLocales)
const differs = $derived(effective.length !== inheritedLocales.length || effective.some((tag, index) => tag !== inheritedLocales[index]))
const origin = $derived(
  value
    ? scope === 'project'
      ? m.content_languages_project()
      : m.content_languages_org()
    : inheritedOrigin === 'organisation'
      ? m.content_languages_inherited()
      : m.content_languages_user(),
)
</script>

<section
  aria-labelledby={`${id}-title`}
  class="min-w-0 rounded-xl border border-border bg-foreground/4 p-5"
>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <h3 id={`${id}-title`} class="text-sm font-semibold">{m.content_languages_order()}</h3>
        <SimpleTooltip triggerProps={{ 'aria-label': m.content_languages_info(), role: 'button' }} triggerClass="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
          {#snippet trigger()}<InfoIcon class="size-4" aria-hidden="true" />{/snippet}
          {organisationName ? m.content_languages_help_named({ name: organisationName }) : m.content_languages_help()}
        </SimpleTooltip>
      </div>
      <p class="mt-1 text-sm text-muted-foreground">{origin}</p>
    </div>
    {#if !disabled}
      <button type="button" aria-label={differs ? m.content_languages_reset() : m.forms__edit()} title={differs ? m.content_languages_reset() : m.forms__edit()}
        onclick={() => { if (differs) onChange(undefined); else editing = true }}
        class="flex h-9 min-w-9 items-center justify-center gap-2 rounded px-2 text-sm text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
        {#if differs}<ResetIcon class="size-4" aria-hidden="true" />{:else}<EditIcon class="size-4" aria-hidden="true" /><span>{m.forms__edit()}</span>{/if}
      </button>
    {/if}
  </div>
  {#if (editing || value) && !disabled}
    <div class="mt-4">
      <LocaleToolbar
        selectedLocales={effective}
        visibleLocales={effective}
        {options}
        {labels}
        expanded={true}
        alwaysExpanded
        mode="membership"
        {disabled}
        onExpandedChange={() => {}}
        onChange={change => onChange(change.selectedLocales)}
      />
    </div>
  {:else}
    <ol class="mt-4 flex flex-wrap gap-2">
      {#each effective as tag, index (tag)}
        <li
          class="min-w-0 rounded-lg border border-border/30 bg-foreground/3 px-3 py-2 text-sm whitespace-normal break-words"
        >
          <span class="mr-2 text-muted-foreground">{index + 1}.</span
          ><span lang={tag}
            >{options.find(option => option.tag === tag)?.autonym ?? tag}</span
          >
        </li>
      {/each}
    </ol>
  {/if}
  {#each issues as issue}
    <p role="alert" class="mt-2 text-sm text-destructive">{issue}</p>
  {/each}
</section>
