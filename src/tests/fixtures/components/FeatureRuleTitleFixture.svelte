<script lang="ts">
import FeatureRuleTitleField from '#lib/bits/patterns/forms/featureIntent/FeatureRuleTitleField.svelte'
import FeatureProfileEditor from '#lib/bits/patterns/forms/featureLocation/FeatureProfileEditor.svelte'
import { restoreProfileLocales } from '#lib/bits/patterns/forms/featureLocation/profileLocales.js'
let override = $state<string | undefined>()
let generated = $state(true)
let inherited = $state(true)
let localeState = $state(
  restoreProfileLocales(['en'], { en: { title: 'Garden — donor' } }),
)
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
    onIndependentName={() => (inherited = false)}
    onUseName={() => {
      override = undefined
      inherited = true
    }}
    onEditLocation={() => {}}
    translate={async () => ({
      status: 'unsupported',
      message: 'Fixture has no translation provider',
    })}
    onTranslated={() => {}}
  >
    {#snippet children(_field, _locale, onEditStart, prefix)}
      <FeatureRuleTitleField
        value={override ?? 'Garden — donor'}
        {override}
        {generated}
        label="Title · English"
        {prefix}
        editable={!inherited}
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
