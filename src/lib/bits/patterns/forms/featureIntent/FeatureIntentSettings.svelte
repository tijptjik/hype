<script lang="ts">
// API
import {
  getFeatureIntentSettings,
  updateFeatureIntentSettings,
} from '#lib/api/featureIntents.remote.js'
// DOMAIN
import {
  FEATURE_LOCATION_KINDS,
  FeatureTypesSchema,
  type FeatureType,
} from '#lib/features/intents.js'
// TYPES
import type {
  FeatureIntentScope,
  FeatureIntentPolicy,
} from '#lib/db/services/featureIntentPolicy.js'

let {
  scopeType,
  scopeId,
  disabled = false,
}: {
  scopeType: FeatureIntentScope['type']
  scopeId: string
  disabled?: boolean
} = $props()
let policy = $state<FeatureIntentPolicy | null>(null)
let catalogue = $state<FeatureType[]>([])
let selected = $state<string[]>([])
let inherits = $state(true)
let busy = $state(false)
let message = $state('')
let loadError = $state(false)
let reload = $state(0)
$effect(() => {
  const scope = { type: scopeType, id: scopeId }
  reload
  let cancelled = false
  policy = null
  loadError = false
  getFeatureIntentSettings(scope)
    .then(value => {
      if (cancelled) return
      policy = value
      catalogue = structuredClone(value.types)
      selected = value.types.map(type => type.id)
      inherits = value.definition === null
    })
    .catch(() => {
      if (!cancelled) loadError = true
    })
  return () => {
    cancelled = true
  }
})

/** Save this independently versioned policy without submitting the enclosing profile form.
 * @returns Completion; stale edits remain available for inspection.
 */
async function save(): Promise<void> {
  if (!policy || busy) return
  message = ''
  const definition = $state.snapshot(
    inherits ? null : scopeType === 'layer' ? selected : catalogue,
  )
  if (definition !== null && scopeType !== 'layer') {
    const parsed = FeatureTypesSchema.safeParse(definition)
    if (!parsed.success) {
      message = parsed.error.issues[0].message
      return
    }
  }
  busy = true
  try {
    await updateFeatureIntentSettings({
      scope: { type: scopeType, id: scopeId },
      definition,
      version: policy.version,
      fingerprint: policy.fingerprint,
    })
    message = 'Feature type settings saved.'
    reload += 1
  } catch (cause) {
    message = cause instanceof Error ? cause.message : 'Unable to save settings.'
  } finally {
    busy = false
  }
}
</script>

<section class="flex min-w-0 flex-col gap-4 rounded-lg border p-6">
  <h3 class="text-lg font-semibold">Feature types and locations</h3>
  <p class="text-muted-foreground text-sm">
    Define what contributors publish and how they can locate it. Existing features keep
    their accepted type and location. These settings save separately.
  </p>
  {#if loadError}
    <p role="alert">Unable to load feature type settings.</p>
    <button
      type="button"
      class="rounded border px-3 py-2"
      onclick={() => (reload += 1)}
    >
      Retry
    </button>
  {:else if !policy}
    <p role="status">Loading feature types…</p>
  {:else}
    <fieldset
      disabled={disabled || busy}
      class="flex min-w-0 flex-col gap-4 disabled:opacity-60"
    >
      <label class="flex items-center gap-2">
        <input type="checkbox" bind:checked={inherits}>
        {scopeType === 'hub'
          ? 'Use application defaults'
          : scopeType === 'project'
            ? 'Inherit hub defaults'
            : 'Use all project feature types'}
      </label>
      {#if inherits}
        <p class="text-sm">
          Inherited: {policy.inheritedTypes.map(type => type.label).join(', ')}
        </p>
      {:else if scopeType === 'layer'}
        {#each policy.inheritedTypes as type (type.id)}
          <label class="flex items-center gap-2"
            ><input type="checkbox" value={type.id} bind:group={selected}>
            {type.label}</label
          >
        {/each}
        <p class="text-muted-foreground text-sm">
          A single type is inferred automatically when creating a feature.
        </p>
      {:else}
        {#each catalogue as type, index}
          <div class="grid min-w-0 gap-3 rounded border p-4">
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="grid gap-1 text-sm"
                >Stable identifier<input
                  class="min-w-0 rounded border bg-transparent p-2"
                  bind:value={type.id}
                ></label
              >
              <label class="grid gap-1 text-sm"
                >Display name<input
                  class="min-w-0 rounded border bg-transparent p-2"
                  bind:value={type.label}
                ></label
              >
            </div>
            <fieldset class="flex flex-wrap gap-3">
              <legend class="mb-2 text-sm">Allowed location types</legend>
              {#each FEATURE_LOCATION_KINDS as kind}
                <label class="flex items-center gap-2 text-sm"
                  ><input type="checkbox" value={kind} bind:group={type.locationKinds}>
                  {kind}</label
                >
              {/each}
            </fieldset>
            <label class="grid gap-1 text-sm"
              >Suggested starting point
              <select class="bg-background rounded border p-2" bind:value={type.start}>
                <option value="search">Find a location</option>
                <option value="pin">Place on the map</option>
              </select>
            </label>
            <label class="flex items-center gap-2 text-sm"
              ><input type="checkbox" bind:checked={type.associationRequired}>Require a
              location association before publishing</label
            >
            <button
              type="button"
              class="justify-self-start rounded border px-3 py-2 text-sm"
              onclick={() => (catalogue = catalogue.filter((_, i) => i !== index))}
            >
              Remove type
            </button>
          </div>
        {/each}
        <button
          type="button"
          class="self-start rounded border px-3 py-2"
          onclick={() =>
            (catalogue = [
              ...catalogue,
              {
                id: `type-${catalogue.length + 1}`,
                label: 'New feature type',
                locationKinds: [...FEATURE_LOCATION_KINDS],
                start: 'search',
                associationRequired: false,
              },
            ])}
        >
          Add feature type
        </button>
      {/if}
      <div class="flex flex-wrap gap-3">
        <button type="button" class="rounded border px-3 py-2" onclick={save}>
          {busy ? 'Saving…' : 'Save feature type settings'}
        </button>
        <button
          type="button"
          class="rounded border px-3 py-2"
          onclick={() => {
            message = ''
            reload += 1
          }}
        >
          Discard changes
        </button>
        {#if !inherits}
          <button
            type="button"
            class="rounded border px-3 py-2"
            onclick={() => (inherits = true)}
          >
            Reset to
            {scopeType === 'project'
              ? 'hub'
              : scopeType === 'layer'
                ? 'project'
                : 'application'}
            defaults
          </button>
        {/if}
      </div>
    </fieldset>
  {/if}
  {#if message}
    <p role="status" class="text-sm">{message}</p>
  {/if}
</section>
