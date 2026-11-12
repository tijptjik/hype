<script lang="ts">
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import LocationLocaleField from '#lib/bits/patterns/forms/localLocationAddress/LocationLocaleField.svelte'
import DraftLocationNameFields from '#lib/bits/patterns/forms/featureLocation/DraftLocationNameFields.svelte'
import FormI18nCapabilities from '#lib/bits/patterns/forms/formI18nSection/components/FormI18nCapabilities.svelte'
setResponsiveCtx()
let names = $state<Record<string, string>>({ en: 'Community kitchen', 'zh-Hant': '' })
let labels = $state<Record<string, string>>({ en: 'Manage bakeries', 'zh-Hant': '' })
let branch = $state<Record<string, string>>({ en: 'Central', 'zh-Hant': '' })
let saved = $state(0)
const locales = ['en', 'zh-Hant']
const fields = {
  manageBakeries: {
    i18n: Object.fromEntries(
      locales.map(locale => [
        locale,
        {
          as: () => ({ value: labels[locale] }),
          set: (text: string) => {
            labels[locale] = text
          },
          issues: () => undefined,
        },
      ]),
    ),
  },
}
</script>
<main
  class="bits-theme bg-panel text-foreground min-h-screen p-4"
  data-rollout-fixture
  data-saved={saved}
  data-names={JSON.stringify(names)}
  data-labels={JSON.stringify(labels)}
  data-branch={JSON.stringify(branch)}
>
  <form
    onsubmit={event => {
      event.preventDefault()
      saved++
    }}
  >
    <button type="submit" data-header-save>Save record</button>
    <section data-translation-tab="location">
      <DraftLocationNameFields
        {names}
        kind="establishment"
        isEditing
        translations={false}
        localeState={{
          selectedLocales: locales,
          visibleLocales: ['en'],
          expanded: false,
        }}
        onChange={next => {
          names = next
        }}
      />
      <LocationLocaleField
        label="Branch"
        value={branch}
        localeState={{
          selectedLocales: locales,
          visibleLocales: ['en'],
          expanded: false,
        }}
        onChange={value => {
          branch = value
        }}
      />
    </section>
    <section data-translation-tab="capabilities">
      <FormI18nCapabilities
        {fields}
        capabilityKeys={['manageBakeries']}
        {locales}
        visibleLocales={locales}
        expanded
        currentLocaleKey="en"
        isEditing
        isRequiredInPreflight={() => false}
      />
    </section>
  </form>
</main>
