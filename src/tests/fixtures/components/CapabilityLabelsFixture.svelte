<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// I18N
import { getLocaleOrder } from '#lib/i18n.js'
import { contentFormKey } from '#lib/i18n/contentRecords.js'
// COMPONENTS
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import { resourceTabsStyles } from '#lib/bits/patterns/forms/formSurface/resourceTabs.styles.js'
import OrganisationCapabilities from '#lib/bits/patterns/capabilities/organisationCapabilities/OrganisationCapabilities.svelte'
// TYPES
import type { CapabilityKey } from '#lib/capabilities.types.js'
import type { LocaleKey } from '#lib/types.js'

setResponsiveCtx()
let currentLocaleKey = $state<LocaleKey>('en')
const locales = $derived(getLocaleOrder(currentLocaleKey))
const keys: CapabilityKey[] = ['manageBakeries', 'manageVolunteers', 'manageDropOffs']
// Synthetic fields exercise wrapping without adding capabilities to the domain schema.
const extraKeys = [
  'fixtureFour',
  'fixtureFive',
  'fixtureSix',
] as unknown as CapabilityKey[]
const labels = ['Donor Manager', 'Event Manager', 'Drop Point Manager']
let count = $state(3)
let editing = $state(false)
let multilingual = $state(false)
let calls = $state('')
let mountVersion = $state(0)
let values = $state<Record<string, Record<string, string>>>(
  Object.fromEntries(
    [...keys, ...extraKeys].map((key, index) => [
      key,
      {
        en: labels[index] ?? `Capability ${index + 1}`,
        zhHant: '管理麵包店儀表板',
        zhHans: '管理面包店仪表板',
      },
    ]),
  ),
)
const selected = $derived([...keys, ...extraKeys].slice(0, count))
const fields = $derived(
  Object.fromEntries(
    [...keys, ...extraKeys].map(key => [
      key,
      {
        i18n: Object.fromEntries(
          Object.keys(values[key]).map(locale => [
            locale,
            {
              as: () => ({
                name: `data.capabilities.${key}.i18n.${locale}`,
                value: values[key][locale],
                oninput: (event: Event) => {
                  values[key][locale] = (event.currentTarget as HTMLInputElement).value
                },
              }),
              set: (value: string) => {
                values[key][locale] = value
              },
              issues: () => [],
            },
          ]),
        ),
      },
    ]),
  ),
)
</script>

<main class="bits-theme bg-background text-foreground min-h-screen min-w-0">
  <div class="flex flex-wrap gap-4 p-4">
    <button
      type="button"
      onclick={() => {
        editing = !editing
      }}
    >
      Toggle editing
    </button>
    <button
      type="button"
      onclick={() => {
        currentLocaleKey = 'zhHant'
      }}
    >
      Use Traditional Chinese
    </button>
    <button
      type="button"
      onclick={() => {
        count = count === 3 ? 6 : 3
      }}
    >
      Toggle six capabilities
    </button>
    <output aria-label="Translation calls">{calls}</output>
    <button
      type="button"
      onclick={() => {
        mountVersion++
      }}
    >
      Remount form
    </button>
  </div>
  <FormSurface class={resourceTabsStyles}>
    {#key `${currentLocaleKey}:${mountVersion}`}
      <OrganisationCapabilities
        bind:multilingual
        selectedCapabilityKeys={selected}
        capabilitySearchOptions={[]}
        selectedCapabilityIds={selected}
        {currentLocaleKey}
        {locales}
        capabilityLocales={Object.values(values).flatMap(row => Object.keys(row))}
        isEditing={editing}
        capabilityLabelsByKey={{}}
        formCapabilityFields={fields}
        isRequiredInPreflight={() => false}
        getCapabilityDisplayLabel={key => values[key]?.en ?? key}
        onAddCapability={() => {}}
        onRemoveCapability={() => {}}
        onAddLocale={locale => {
          for (const key of [...keys, ...extraKeys])
            values[key][contentFormKey(locale)] ??= ''
        }}
        onEnterEditMode={() => {
          editing = true
        }}
        onTranslate={async (source, target, capabilityKey) => {
          calls = `${capabilityKey}: ${source} → ${target}`
          if (capabilityKey)
            values[capabilityKey][contentFormKey(target)] = `Translated from ${source}`
          return true
        }}
        onResetLocale={target => {
          calls = `reset ${target}`
        }}
      />
    {/key}
  </FormSurface>
</main>
