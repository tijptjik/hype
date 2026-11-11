<script lang="ts">
let { multilingual = false }: { multilingual?: boolean } = $props()
import FeatureTitleSource from '#lib/bits/patterns/forms/featureIntent/FeatureTitleSource.svelte'
import type { FeatureNameRule } from '#lib/features/locationPolicy.js'
import FeatureRuleTitleField from '#lib/bits/patterns/forms/featureIntent/FeatureRuleTitleField.svelte'
import FeatureProfileEditor from '#lib/bits/patterns/forms/featureLocation/FeatureProfileEditor.svelte'
import { restoreProfileLocales } from '#lib/bits/patterns/forms/featureLocation/profileLocales.js'
let override = $state<string | undefined>()
let generated = $state(true)
const inherited = $derived(override === undefined)
const rule: FeatureNameRule = {
  base: 'location',
  conditions: [
    {
      propertyId: 'donor',
      locales: {
        en: {
          true: 'donor',
          false: '',
          null: '',
          placement: 'suffix',
          separator: ' — ',
        },
      },
    },
  ],
}
let localeState = $state({
  ...restoreProfileLocales(multilingual ? ['en', 'zh-Hant'] : ['en'], {
    en: { title: 'Garden — donor' },
  }),
  expanded: multilingual,
})
const fields = {
  title: {
    as: (_type: 'hidden', value: string) => ({
      type: 'hidden',
      name: 'baseName',
      value,
    }),
    issues: () => undefined,
  },
  titleGen: {
    as: (_type: 'hidden', value: string) => ({
      type: 'hidden',
      name: 'titleGen',
      value,
    }),
  },
}
</script>
<div
  class="bits-theme bg-background text-foreground min-h-screen p-6"
  data-state={JSON.stringify({ override, generated })}
>
  <FeatureProfileEditor
    {localeState}
    onLocaleStateChange={value => (localeState = value)}
    values={{ en: { title: override ?? 'Garden — donor' } }}
    contextKey="rule-title"
    isEditing
    allowDescriptions={false}
    {inherited}
    offerName={!inherited}
    locationNames={{ en: 'Garden' }}
    onIndependentName={() => (override = 'Garden — donor')}
    onUseName={() => {
      override = undefined
    }}
    onEditLocation={() => {}}
    translate={async () => ({
      status: 'unsupported',
      message: 'Fixture has no translation provider',
    })}
    onTranslated={() => {}}
  >
    {#snippet titleSource(locale)}
      <FeatureTitleSource
        {rule}
        scopeId="1msQMcuqfHrP"
        {locale}
        fromLocation
        custom={locale === 'en' && override !== undefined}
        editable
        onCustomize={() => (override = 'Garden — donor')}
        onRestore={() => (override = undefined)}
        onLocation={() => {}}
      />
    {/snippet}
    {#snippet children(_field, locale, onEditStart, prefix)}
      <FeatureRuleTitleField
        value={locale === 'en' ? (override ?? 'Garden — donor') : '花園'}
        {override}
        {generated}
        label={locale === 'en' ? 'Title · English' : 'Title · 繁體中文'}
        {prefix}
        editable={locale === 'en' && !inherited}
        {fields}
        baseName="Garden"
        required={false}
        onChange={(value, gen) => {
          override = value
          generated = gen
        }}
        {onEditStart}
      />
    {/snippet}
  </FeatureProfileEditor>
</div>
