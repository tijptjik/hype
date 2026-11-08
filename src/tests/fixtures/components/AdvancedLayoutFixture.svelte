<script lang="ts">
import OrganisationAdvancedSettings from '#lib/bits/patterns/organisationEditor/OrganisationAdvancedSettings.svelte'
import { contentLocaleOptions } from '#lib/bits/patterns/forms/contentLocaleDefaults/contentLocaleOptions.js'
let disabled = $state(true)
</script>
<main class="bits-theme bg-background text-foreground min-h-screen">
  <button type="button" onclick={() => (disabled = !disabled)}>Toggle editing</button>
  <OrganisationAdvancedSettings
    name="HKFoodWorks"
    settings={{ contentLocales: ['en', 'zh-Hant', 'zh-Hans'] }}
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
