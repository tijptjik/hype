<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import ResetIcon from 'virtual:icons/lucide/rotate-ccw'
// BITS COMPONENTS
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
import { languageFont } from '#lib/bits/custom/localeControls/localeFont.js'
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
  class="border-border bg-foreground/4 min-w-0 rounded-xl border p-5"
>
  <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <h3 id={`${id}-title`} class="text-sm font-semibold">
          {m.content_languages_order()}
        </h3>
      </div>
      <p class="text-muted-foreground mt-1 text-sm">
        {organisationName
          ? m.content_languages_help_named({ name: organisationName })
          : m.content_languages_help()}
      </p>
    </div>
    <button
      type="button"
      aria-label={m.content_languages_reset()}
      data-tooltip={m.content_languages_reset()}
      disabled={disabled || !differs}
      tabindex={!disabled && differs ? 0 : -1}
      aria-hidden={disabled || !differs}
      style:opacity={!disabled && differs ? 1 : 0}
      onclick={() => onChange(undefined)}
      class="text-muted-foreground hover:text-primary focus-visible:outline-primary flex size-9 shrink-0 items-center justify-center rounded transition-opacity duration-200 focus-visible:outline-2 disabled:pointer-events-none motion-reduce:transition-none"
    >
      <ResetIcon class="size-4" aria-hidden="true" />
    </button>
  </div>
  <!-- Both presentations share a grid cell so editing never changes the card height. -->
  <div class="mt-4 grid">
    <div
      class="col-start-1 row-start-1"
      class:invisible={disabled}
      inert={disabled}
      aria-hidden={disabled}
    >
      <LocaleToolbar
        allowAdd={true}
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
    <ol
      class="col-start-1 row-start-1 flex flex-wrap content-start items-start gap-2"
      class:invisible={!disabled}
      inert={!disabled}
      aria-hidden={!disabled}
    >
      {#each effective as tag, index (tag)}
        <li
          class="border-border/30 bg-foreground/3 min-w-0 rounded-lg border px-3 py-2 text-sm break-words whitespace-normal"
        >
          <span class="text-muted-foreground mr-2">{index + 1}.</span
          ><span lang={tag} dir="auto" style:font-family={languageFont(tag)}
            >{options.find(option => option.tag === tag)?.autonym ?? tag}</span
          >
        </li>
      {/each}
    </ol>
  </div>
  {#each issues as issue}
    <p role="alert" class="text-destructive mt-2 text-sm">{issue}</p>
  {/each}
</section>
