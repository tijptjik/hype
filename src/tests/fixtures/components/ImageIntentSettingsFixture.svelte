<script lang="ts">
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { setRootCTX } from '#lib/context/root.svelte.js'
import { setThemeModel } from '#lib/themes/theme.svelte.js'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import ImageIntentSettings from '#lib/bits/patterns/images/ImageIntentSettings.svelte'
import PublishUnclassifiedImagesDialog from '#lib/bits/patterns/images/PublishUnclassifiedImagesDialog.svelte'
setRootCTX(setResponsiveCtx())
setThemeModel()
let prompt = $state(false)
let isEditing = $state(true)
let draft = $state<string | undefined>()
let resetVersion = $state(0)
</script>
<main class="flex w-full min-w-0 flex-col">
  <form
    onsubmit={event => {
      event.preventDefault()
      ;(globalThis as unknown as { intentDraft: unknown }).intentDraft = draft
        ? JSON.parse(draft)
        : undefined
    }}
  >
    <button type="button" onclick={() => (isEditing = !isEditing)}>
      Toggle edit mode
    </button>
    <button type="submit" disabled={!draft}>Save form</button>
    <button
      type="button"
      onclick={() => {
        draft = undefined
        resetVersion++
      }}
    >
      Reset form
    </button>
    <FormSurface>
      <ImageIntentSettings
        scopeType="project"
        scopeId="project"
        disabled={!isEditing}
        {resetVersion}
        onChange={value => (draft = value)}
      />
    </FormSurface>
  </form>
  <button type="button" onclick={() => (prompt = true)}>Preview publication</button>
  {#if prompt}
    <PublishUnclassifiedImagesDialog
      scopeType="project"
      scopeId="project"
      onDone={() => (prompt = false)}
    />
  {/if}
</main>
