<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import { SectionHeader, SelectField, TextInput } from '#lib/bits/custom/index.js'
import MapPinIcon from 'virtual:icons/proicons/location'
// API
import { setPlaceUpdatePolicy } from '#lib/api/place.remote.js'
// DOMAIN
import { ProjectPlacePolicySchema } from '#lib/places/model.js'
// TYPES
import type { ProjectPlacePolicy } from '#lib/places/model.js'
import type { ProjectPlaceSettings } from '#lib/db/services/place.js'

let {
  projectId,
  initial,
  isEditing = true,
}: { projectId: string; initial: ProjectPlaceSettings; isEditing?: boolean } = $props()
let policy = $state<ProjectPlacePolicy>(
  untrack(() => ProjectPlacePolicySchema.parse(initial.policy)),
)
let savedPolicy = $state<ProjectPlacePolicy>(
  untrack(() => ProjectPlacePolicySchema.parse(initial.policy)),
)
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
 * @returns Completion after the authorized command has saved or reported a conflict.
 */
async function save(): Promise<void> {
  if (saving || !isEditing) return
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
    failure = m.place_policy_invalid()
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
    savedPolicy = ProjectPlacePolicySchema.parse(saved.policy)
    revision = saved.revision
    notice = m.place_policy_saved()
  } catch (cause) {
    failure =
      cause instanceof Error && cause.message.includes('PLACE_POLICY_CHANGED')
        ? m.place_policy_conflict()
        : m.place_policy_failed()
  } finally {
    saving = false
  }
}
// Leaving edit mode discards unsaved policy edits just like the project editor.
$effect(() => {
  if (!isEditing) {
    const baseline = untrack(() => ProjectPlacePolicySchema.parse(savedPolicy))
    policy = baseline
    coordinateMode = baseline.coordinates.mode
    maxMetres =
      baseline.coordinates.mode === 'withinDistance'
        ? baseline.coordinates.maxMetres
        : undefined
    failure = ''
  }
})

const reviewItems = $derived([
  { value: 'review', label: m.place_policy_review() },
  { value: 'automatic', label: m.place_policy_automatic() },
])
const coordinateItems = $derived([
  reviewItems[0],
  { value: 'withinDistance', label: m.place_policy_distance() },
  reviewItems[1],
])
</script>

<section>
  <SectionHeader
    title={m.place_policy_title()}
    description={m.place_policy_description()}
    icon={MapPinIcon}
  />
  <div class="flex flex-col gap-6 p-6">
    <p class="max-w-3xl text-sm text-muted-foreground">{m.place_policy_inactive()}</p>
    <div class="grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2">
      <SelectField
        triggerClass="bg-[var(--form-control-edit-fill)]! border-[var(--form-control-border)]!"
        id="place-coordinates"
        label={m.place_policy_coordinates()}
        placeholder={m.place_policy_coordinates()}
        value={coordinateMode}
        items={coordinateItems}
        {isEditing}
        disabled={saving}
        onValueChange={value => (coordinateMode = value as typeof coordinateMode)}
      />
      {#if coordinateMode === 'withinDistance'}
        <TextInput
          id="place-distance"
          name=""
          label={m.place_policy_metres()}
          value={maxMetres?.toString() ?? ''}
          inputType="number"
          inputAttrs={{ min: 0, step: 'any' }}
          {isEditing}
          disabled={saving}
          onValueChange={value =>
            (maxMetres = value.trim() ? Number(value) : undefined)}
        />
      {/if}
      <SelectField
        triggerClass="bg-[var(--form-control-edit-fill)]! border-[var(--form-control-border)]!"
        id="place-address"
        label={m.place_policy_address()}
        placeholder={m.place_policy_address()}
        bind:value={policy.address}
        items={reviewItems}
        {isEditing}
        disabled={saving}
      />
      <SelectField
        triggerClass="bg-[var(--form-control-edit-fill)]! border-[var(--form-control-border)]!"
        id="place-unit"
        label={m.place_policy_unit()}
        placeholder={m.place_policy_unit()}
        bind:value={policy.unit}
        items={reviewItems}
        {isEditing}
        disabled={saving}
      />
      <SelectField
        triggerClass="bg-[var(--form-control-edit-fill)]! border-[var(--form-control-border)]!"
        id="place-establishment"
        label={m.place_policy_establishment()}
        placeholder={m.place_policy_establishment()}
        bind:value={policy.establishment}
        items={reviewItems}
        {isEditing}
        disabled={saving}
      />
    </div>
    <p class="max-w-3xl text-sm text-muted-foreground">{m.place_policy_note()}</p>
    {#if isEditing}
      <Button
        type="button"
        color="primary"
        style="soft"
        class="self-start"
        disabled={saving}
        onClick={save}
        text={saving ? m.place_policy_saving() : m.place_policy_save()}
      />
    {/if}
    {#if notice}
      <p role="status" class="text-sm">{notice}</p>
    {/if}
    {#if failure}
      <p role="alert" class="text-sm text-destructive">{failure}</p>
    {/if}
  </div>
</section>
