<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import ResetIcon from 'virtual:icons/lucide/rotate-ccw'
// BITS COMPONENTS
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
const effective = $derived(value ?? inheritedLocales)
const differs = $derived(
  effective.length !== inheritedLocales.length ||
    effective.some((tag, index) => tag !== inheritedLocales[index]),
)
</script>

<section
  aria-labelledby={`${id}-title`}
  class="min-w-0 rounded-xl border border-border bg-foreground/4 p-5"
>
  <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <h3 id={`${id}-title`} class="text-sm font-semibold">
          {m.content_languages_order()}
        </h3>
      </div>
      <p class="mt-1 text-sm text-muted-foreground">
        {organisationName
          ? m.content_languages_help_named({ name: organisationName })
          : m.content_languages_help()}
      </p>
    </div>
    {#if !disabled}
      <button
        type="button"
        aria-label={m.content_languages_reset()}
        title={m.content_languages_reset()}
        disabled={!differs}
        tabindex={differs ? 0 : -1}
        aria-hidden={!differs}
        style:opacity={differs ? 1 : 0}
        onclick={() => onChange(undefined)}
        class="flex size-9 shrink-0 items-center justify-center rounded text-muted-foreground transition-opacity duration-200 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary disabled:pointer-events-none motion-reduce:transition-none"
      >
        <ResetIcon class="size-4" aria-hidden="true" />
      </button>
    {/if}
  </div>
  {#if !disabled}
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
