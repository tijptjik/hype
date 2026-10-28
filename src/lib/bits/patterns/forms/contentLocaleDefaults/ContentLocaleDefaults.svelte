<script lang="ts">
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
  options: readonly LocaleOption[]
  onChange: (value: string[] | undefined) => void
  disabled?: boolean
  labels?: LocaleControlLabels
  issues?: readonly string[]
} = $props()
const id = $props.id()
const effective = $derived(value ?? inheritedLocales)
const origin = $derived(
  value
    ? scope === 'project'
      ? 'Project override'
      : 'Organisation setting'
    : inheritedOrigin === 'organisation'
      ? 'Inherited from Organisation'
      : 'User-locale default',
)
</script>

<section
  aria-labelledby={`${id}-title`}
  aria-describedby={`${id}-help`}
  class="min-w-0 rounded-xl border border-border bg-foreground/4 p-5"
>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0">
      <h3 id={`${id}-title`} class="text-sm font-semibold">Supported locales</h3>
      <p class="mt-1 text-sm text-muted-foreground">{origin}</p>
    </div>
    {#if value}
      <button
        type="button"
        {disabled}
        onclick={() => onChange(undefined)}
        class="min-h-11 rounded-lg border border-border px-3 text-sm hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
      >
        Reset to inherited
      </button>
    {:else}
      <button
        type="button"
        {disabled}
        onclick={() => onChange([...effective])}
        class="min-h-11 rounded-lg border border-border px-3 text-sm hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
      >
        {scope === 'project' ? 'Override for Project' : 'Set Organisation defaults'}
      </button>
    {/if}
  </div>
  <p id={`${id}-help`} class="mt-3 text-sm text-muted-foreground">
    Default language order for authored content. Individual forms can add languages.
    Existing translations are preserved.
  </p>
  <p class="mt-3 text-xs font-medium text-muted-foreground">Effective order</p>
  {#if value}
    <div class="mt-2">
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
    <ol class="mt-2 flex flex-wrap gap-2">
      {#each effective as tag, index (tag)}
        <li
          class="min-w-0 rounded-lg border border-border px-3 py-2 text-sm whitespace-normal break-words"
        >
          <span class="mr-2 text-muted-foreground">{index + 1}.</span
          ><span lang={tag}
            >{options.find(option => option.tag === tag)?.autonym ?? tag}</span
          ><span class="ml-2 text-xs text-muted-foreground">{tag}</span>
        </li>
      {/each}
    </ol>
  {/if}
  {#each issues as issue}
    <p role="alert" class="mt-2 text-sm text-destructive">{issue}</p>
  {/each}
</section>
