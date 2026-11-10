<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
setResponsiveCtx()
// COMPONENTS
import FeatureIntentSettings from '#lib/bits/patterns/forms/featureIntent/FeatureIntentSettings.svelte'
// DOMAIN
import { FeatureIntentSettingsFormData } from '#lib/features/intents.js'
let scope = $state<'project' | 'layer'>('project')
let draft = $state<string | undefined>()
let revision = $state(0)
/** Simulate the parent form transport; database behavior is tested separately.
 * @returns Nothing; records the exact validated payload for browser assertions.
 */
function save(): void {
  const patch = FeatureIntentSettingsFormData.parse(draft)
  if (!patch) return
  const state = globalThis as typeof globalThis & {
    namingPolicies?: Record<string, unknown>
    lastNamingSave?: unknown
  }
  state.namingPolicies ??= {}
  state.namingPolicies[scope] = patch
  state.lastNamingSave = patch
  draft = undefined
  revision++
}
</script>
<main class="bits-theme min-w-0 p-4">
  <nav class="mb-4 flex flex-wrap gap-3">
    <button
      type="button"
      onclick={() => {
        scope = 'project'
        draft = undefined
      }}
    >
      Project settings
    </button>
    <button
      type="button"
      onclick={() => {
        scope = 'layer'
        draft = undefined
      }}
    >
      Layer settings
    </button>
    <button type="button" onclick={save} disabled={!draft}>Save settings</button>
    <button type="button" onclick={() => (draft = undefined)} disabled={!draft}>
      Discard changes
    </button>
  </nav>
  <h1 class="mb-4 text-xl">{scope === 'project' ? 'Project' : 'Layer'} title rules</h1>
  <FeatureIntentSettings
    scopeType={scope}
    scopeId={scope}
    revision={String(revision)}
    {draft}
    onDraftChange={value => (draft = value)}
  />
  <pre
    class="mt-4 break-all whitespace-pre-wrap"
    data-naming-draft
  >{draft ?? 'unchanged'}</pre>
</main>
