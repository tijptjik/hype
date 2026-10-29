<script lang="ts">
import LocationVisibilitySelect from '#lib/bits/patterns/forms/featureLocation/LocationVisibilitySelect.svelte'
import ContentLocaleDefaults from '#lib/bits/patterns/forms/contentLocaleDefaults/ContentLocaleDefaults.svelte'
import { contentLocaleOptions } from '#lib/bits/patterns/forms/contentLocaleDefaults/contentLocaleOptions.js'
import { normalizeContentLocales } from '#lib/content-locales/model.js'
import MultilingualDefaults from '#lib/bits/patterns/forms/contentLocaleDefaults/MultilingualDefaults.svelte'
import { applyContentLocaleSettingsPatch, type ContentLocaleSettings } from '#lib/content-locales/settings.js'
let organisation = $state<ContentLocaleSettings>({})
let project = $state<ContentLocaleSettings>({})
const defaults = ['en', 'zh-Hant', 'zh-Hans']
const options = contentLocaleOptions('en')
</script>
<main class="bits-theme min-h-screen bg-panel p-6 text-foreground">
  <section aria-label="Organisation" class="mb-8"><h2>Organisation · Languages</h2>
    <div data-language-settings-grid class="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,32rem),1fr))] gap-4">
    <ContentLocaleDefaults scope="organisation" value={organisation.contentLocales} inheritedLocales={defaults} inheritedOrigin="user-default" {options} onChange={value => organisation = applyContentLocaleSettingsPatch(organisation, { contentLocales: value ? normalizeContentLocales(value) : null })} />
    <MultilingualDefaults scope="organisation" value={organisation} onChange={patch => organisation = applyContentLocaleSettingsPatch(organisation, patch)} />
    </div>
  </section>
  <section aria-label="Project"><h2>Project · Languages</h2>
    <div data-language-settings-grid class="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,32rem),1fr))] gap-4">
    <ContentLocaleDefaults scope="project" value={project.contentLocales} inheritedLocales={organisation.contentLocales ?? defaults} inheritedOrigin="organisation" {options} onChange={value => project = applyContentLocaleSettingsPatch(project, { contentLocales: value ? normalizeContentLocales(value) : null })} />
    <MultilingualDefaults scope="project" value={project} inherited={organisation} onChange={patch => project = applyContentLocaleSettingsPatch(project, patch)} />
    </div>
  </section>
<section aria-label="Visibility" class="mt-6"><h2>Visibility</h2><LocationVisibilitySelect onChange={() => {}} /></section>
</main>
