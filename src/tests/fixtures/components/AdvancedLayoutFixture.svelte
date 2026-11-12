<script lang="ts">
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
import OrganisationAdvancedSettings from '#lib/bits/patterns/organisationEditor/OrganisationAdvancedSettings.svelte'
import { contentLocaleOptions } from '#lib/bits/patterns/forms/contentLocaleDefaults/contentLocaleOptions.js'
let disabled = $state(true)
let translationPromptOnce = $state(false)
</script>
<main class="bits-theme bg-background text-foreground min-h-screen">
  <button type="button" onclick={() => (disabled = !disabled)}>Toggle editing</button>
  <OrganisationAdvancedSettings
    name="HKFoodWorks"
    onTranslationPromptOnceChange={value => {
      translationPromptOnce = value
    }}
    settings={{
      translationPromptOnce,
      contentLocales: ['en', 'zh-Hant', 'zh-Hans'].map(canonicalContentTag),
    }}
    inheritedLocales={['en']}
    options={contentLocaleOptions('en')}
    {disabled}
    issues={[]}
    visibility="shared"
    visibilityAttrs={{}}
    onVisibilityChange={() => {}}
    permitted={true}
    canManagePermissions={true}
    onPermissionChange={() => {}}
    onContentLocalesChange={() => {}}
    onMultilingualDefaultsChange={() => {}}
  />
</main>
