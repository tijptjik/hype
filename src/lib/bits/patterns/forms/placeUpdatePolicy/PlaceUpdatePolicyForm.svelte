<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// API
import { setPlaceUpdatePolicy } from '#lib/api/place.remote.js'
// DOMAIN
import { ProjectPlacePolicySchema } from '#lib/places/model.js'
// TYPES
import type { ProjectPlacePolicy } from '#lib/places/model.js'
import type { ProjectPlaceSettings } from '#lib/db/services/place.js'

let { projectId, initial }: { projectId: string; initial: ProjectPlaceSettings } =
  $props()
let policy = $state<ProjectPlacePolicy>(untrack(() => structuredClone(initial.policy)))
let revision = $state(untrack(() => initial.revision))
let coordinateMode = $state(untrack(() => initial.policy.coordinates.mode))
let maxMetres = $state<number | undefined>(
  untrack(() =>
    initial.policy.coordinates.mode === 'withinDistance'
      ? initial.policy.coordinates.maxMetres
      : undefined,
  ),
)
let saving = $state(false)
let notice = $state('')
let failure = $state('')

/**
 * Persist the complete policy with the revision loaded by this editor.
 * @param event Native form submission.
 * @returns Completion after the authorized command has saved or reported a conflict.
 */
async function save(event: SubmitEvent): Promise<void> {
  event.preventDefault()
  if (saving) return
  notice = ''
  failure = ''
  const candidate = ProjectPlacePolicySchema.safeParse({
    ...policy,
    coordinates:
      coordinateMode === 'withinDistance'
        ? { mode: coordinateMode, maxMetres }
        : { mode: coordinateMode },
  })
  if (!candidate.success) {
    failure = 'Enter a valid maximum distance in metres.'
    return
  }
  saving = true
  try {
    const saved = await setPlaceUpdatePolicy({
      projectId,
      policy: candidate.data,
      expectedRevision: revision,
    })
    policy = saved.policy
    revision = saved.revision
    notice = 'Saved. These settings apply to future source updates.'
  } catch (cause) {
    failure =
      cause instanceof Error && cause.message.includes('PLACE_POLICY_CHANGED')
        ? 'These settings changed in another session. Reload before saving again.'
        : 'Could not save these settings. Check your access and try again.'
  } finally {
    saving = false
  }
}
</script>

<form onsubmit={save} class="flex max-w-xl flex-col gap-6">
  <p>
    Choose how this project adopts location and establishment changes from SaanSeoi.
    Feature overrides remain in place.
  </p>
  <fieldset disabled={saving} class="flex flex-col gap-5">
    <label class="flex flex-col gap-2">
      <span class="font-medium">Coordinate corrections</span>
      <select
        bind:value={coordinateMode}
        class="rounded border border-current/25 bg-transparent p-2"
      >
        <option value="review">Review all changes</option>
        <option value="withinDistance">Automatically accept within a distance</option>
        <option value="automatic">Automatically accept all coordinate changes</option>
      </select>
    </label>
    {#if coordinateMode === 'withinDistance'}
      <label class="flex flex-col gap-2">
        <span class="font-medium">Maximum displacement (metres)</span>
        <input
          type="number"
          min="0"
          step="any"
          required
          bind:value={maxMetres}
          class="rounded border border-current/25 bg-transparent p-2"
        >
      </label>
    {/if}
    {#each [
      { key: 'address', label: 'Address identity changes' },
      { key: 'unit', label: 'Shop or unit changes' },
      { key: 'establishment', label: 'Establishment identity changes' },
    ] as field}
      <label class="flex flex-col gap-2">
        <span class="font-medium">{field.label}</span>
        <select
          bind:value={policy[field.key as 'address' | 'unit' | 'establishment']}
          class="rounded border border-current/25 bg-transparent p-2"
        >
          <option value="review">Require review</option>
          <option value="automatic">Automatically accept</option>
        </select>
      </label>
    {/each}
    <p class="text-sm">
      Any required location review holds the geometry, address and unit together.
      Establishment review also holds the other Place facts. Saving does not reconsider
      previously pending or rejected changes.
    </p>
    <button
      type="submit"
      class="self-start rounded border border-current/25 px-4 py-2 font-medium disabled:opacity-50"
    >
      {saving ? 'Saving…' : 'Save settings'}
    </button>
  </fieldset>
  {#if notice}
    <p role="status">{notice}</p>
  {/if}
  {#if failure}
    <p role="alert">{failure}</p>
  {/if}
</form>
