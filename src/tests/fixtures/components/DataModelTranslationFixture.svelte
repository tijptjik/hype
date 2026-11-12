<script lang="ts">
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
setResponsiveCtx()
import FeatureIntentSettings from '#lib/bits/patterns/forms/featureIntent/FeatureIntentSettings.svelte'
import type { LocaleSelection } from '#lib/bits/custom/localeControls/localeControls.types.js'
let multilingual = $state(false)
let localeSelection = $state<LocaleSelection | null>(null)
let draft = $state<string>()
let saved = $state(0)
</script>
<main
  class="bits-theme"
  data-model-fixture
  data-saved={saved}
  data-expanded={multilingual}
  data-draft={draft}
>
  <form
    onsubmit={event => {
      event.preventDefault()
      saved += 1
    }}
  >
    <button
      type="button"
      onclick={() => {
        multilingual = !multilingual
      }}
    >
      Toggle from Profile
    </button>
    <button type="submit" data-header-save>Save record</button>
    <FeatureIntentSettings
      bind:multilingual
      bind:localeSelection
      scopeType="hub"
      scopeId="core"
      {draft}
      onDraftChange={value => {
        draft = value
      }}
    />
  </form>
</main>
