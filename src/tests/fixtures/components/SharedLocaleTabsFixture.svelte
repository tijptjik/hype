<script lang="ts">
import { FeatureMultilingualState } from '#lib/context/featureMultilingual.svelte.js'
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
import { contentLocaleOptions } from '#lib/bits/patterns/forms/contentLocaleDefaults/contentLocaleOptions.js'
import FeatureAddress3dFixture from './FeatureAddress3dFixture.svelte'
const session = new FeatureMultilingualState()
let feature = $state(1)
const expanded = $derived(session.get('fixture') ?? false)
const addressExpanded = $derived(session.get('fixture') ?? true)
let tab = $state('profile')
const options = contentLocaleOptions('en')
</script>
<div class="bits-theme bg-panel p-6">
  <button type="button" onclick={() => (tab = 'profile')}>Profile tab</button>
  <button type="button" onclick={() => (tab = 'location')}>Location tab</button>
  <button type="button" onclick={() => feature++}>Next Feature</button>
  <button type="button" onclick={() => feature--}>Previous Feature</button>
  <span>Feature {feature}</span>
  {#key feature}
    {#if tab === 'profile'}
      <LocaleToolbar
        allowAdd={false}
        selectedLocales={['en', 'zh-Hant', 'zh-Hans']}
        visibleLocales={['en', 'zh-Hant', 'zh-Hans']}
        {options}
        {expanded}
        onExpandedChange={value => session.set('fixture', value)}
        onChange={() => {}}
      />
    {:else}
      <FeatureAddress3dFixture
        bind:translations={
          () => addressExpanded,
          value => session.set('fixture', value)
        }
      />
    {/if}
  {/key}
</div>
