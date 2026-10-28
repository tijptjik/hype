<!-- biome-ignore-all lint/a11y/noHeaderScope: scope is a Svelte component prop, not an HTML attribute. -->
<script lang="ts">
// BITS COMPONENTS
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
import ContentLocaleDefaults from '#lib/bits/patterns/forms/contentLocaleDefaults/ContentLocaleDefaults.svelte'
// LOCALES
import { displayedLocales } from '#lib/bits/custom/localeControls/localeControls.js'
import { contentLocaleOptions } from '#lib/bits/patterns/forms/contentLocaleDefaults/contentLocaleOptions.js'
import { resolveContentLocales } from '#lib/content-locales/resolve.js'
// TYPES
import type { LocaleSelection } from '#lib/bits/custom/localeControls/localeControls.types.js'

let { acceptChanges = true }: { acceptChanges?: boolean } = $props()
let selection: LocaleSelection = $state({
  selectedLocales: ['en', 'zh-Hant', 'zh-Hans'],
  visibleLocales: ['en', 'zh-Hant', 'zh-Hans'],
})
let expanded = $state(true)
let override = $state<string[] | undefined>(undefined)
let organisationOverride = $state<string[] | undefined>(undefined)
let changes = $state(0)
const options = contentLocaleOptions('en')
const inherited = resolveContentLocales({ userLocale: 'en' })
// Values are intentionally independent of toolbar presentation and settings changes.
const values = {
  en: 'English content',
  'zh-Hant': '繁體內容',
  'zh-Hans': '简体内容',
  ja: '日本語の内容',
}
</script>

<main class="bits-theme min-h-screen bg-background px-4 py-8 text-foreground">
  <div class="mx-auto flex max-w-5xl min-w-0 flex-col gap-8">
    <section aria-label="Profile languages" class="min-w-0">
      <h1 class="mb-6 text-xl font-semibold">Locale controls</h1>
      <LocaleToolbar
        {...selection}
        {expanded}
        {options}
        onExpandedChange={value => (expanded = value)}
        onChange={change => {
          changes++
          if (acceptChanges)
            selection = {
              selectedLocales: change.selectedLocales,
              visibleLocales: change.visibleLocales,
            }
        }}
      />
      <ol aria-label="Visible field rows" class="mt-6 flex flex-col gap-2">
        {#each displayedLocales(selection, expanded) as locale (locale)}
          <li data-field-locale={locale}>
            {locale}: {values[locale as keyof typeof values] ?? '—'}
          </li>
        {/each}
      </ol>
      <button
        type="button"
        class="mt-4 rounded border border-border p-2"
        onclick={() =>
          (selection = { selectedLocales: ['ja', 'en'], visibleLocales: ['ja'] })}
      >
        Replace caller state
      </button>
    </section>
    <ContentLocaleDefaults
      value={override}
      inheritedLocales={organisationOverride ?? inherited.locales}
      inheritedOrigin={organisationOverride ? 'organisation' : 'user-default'}
      scope="project"
      {options}
      onChange={value => {
        changes++
        override = value
      }}
    />
    <ContentLocaleDefaults
      value={organisationOverride}
      inheritedLocales={inherited.locales}
      inheritedOrigin="user-default"
      scope="organisation"
      {options}
      onChange={value => {
        changes++
        organisationOverride = value
      }}
    />
    <output
      data-locale-state={JSON.stringify({
        ...selection,
        expanded,
        override,
        organisationOverride,
        changes,
        values,
      })}
    ></output>
  </div>
</main>
