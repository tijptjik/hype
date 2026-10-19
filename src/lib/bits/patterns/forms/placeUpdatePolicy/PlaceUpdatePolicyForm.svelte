<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import { SectionHeader, SelectField, TextInput } from '#lib/bits/custom/index.js'
import MapPinIcon from 'virtual:icons/proicons/location'
// DOMAIN
import { ProjectPlacePolicySchema } from '#lib/places/model.js'
// TYPES
import type { ProjectPlacePolicy } from '#lib/places/model.js'
import type { ProjectPlaceSettings } from '#lib/db/services/place.js'

let {
  initial,
  isEditing = true,
  saving = false,
  resetVersion = 0,
  onChange,
}: {
  initial: ProjectPlaceSettings
  isEditing?: boolean
  saving?: boolean
  resetVersion?: number
  onChange: (value: string | undefined) => void
} = $props()
let lastResetVersion = $state(-1)
let policy = $state<ProjectPlacePolicy>(
  untrack(() => ProjectPlacePolicySchema.parse(initial.policy)),
)
let coordinateMode = $state(untrack(() => initial.policy.coordinates.mode))
let maxMetres = $state<number | undefined>(
  untrack(() =>
    initial.policy.coordinates.mode === 'withinDistance'
      ? initial.policy.coordinates.maxMetres
      : undefined,
  ),
)
/**
 * Stage the complete policy in the owning Project form without writing separately.
 * @returns Nothing; validation and persistence belong to the Project submission.
 */
function stagePolicy(): void {
  const candidate = {
    policy: {
      ...policy,
      coordinates:
        coordinateMode === 'withinDistance'
          ? { mode: coordinateMode, maxMetres }
          : { mode: coordinateMode },
    },
    expectedRevision: initial.revision,
  }
  onChange(
    JSON.stringify(candidate.policy) === JSON.stringify(initial.policy)
      ? undefined
      : JSON.stringify(candidate),
  )
}

// Project Cancel and successful refresh restore the last committed settings.
$effect(() => {
  if (!isEditing || resetVersion !== untrack(() => lastResetVersion)) {
    lastResetVersion = resetVersion
    policy = ProjectPlacePolicySchema.parse(initial.policy)
    coordinateMode = initial.policy.coordinates.mode
    maxMetres =
      initial.policy.coordinates.mode === 'withinDistance'
        ? initial.policy.coordinates.maxMetres
        : undefined
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
  <div class="flex flex-col gap-6 p-6 pb-24">
    <p class="max-w-3xl text-sm text-muted-foreground">{m.place_policy_inactive()}</p>
    <div class="flex max-w-5xl flex-col divide-y divide-[var(--form-control-border)]">
      <div class="grid gap-4 pb-6 md:grid-cols-2 md:gap-8">
        <div>
          <h3 class="font-medium">{m.place_policy_coordinates()}</h3>
          <p class="mt-1 text-sm text-muted-foreground">
            {m.place_policy_coordinates_help()}
          </p>
        </div>
        <div class="flex flex-col gap-4">
          <SelectField
            triggerClass="bg-[var(--form-control-edit-fill)]! border-[var(--form-control-border)]!"
            id="place-coordinates"
            label={m.place_policy_rule()}
            placeholder={m.place_policy_coordinates()}
            value={coordinateMode}
            items={coordinateItems}
            {isEditing}
            disabled={saving}
            onValueChange={value => {
              coordinateMode = value as typeof coordinateMode
              stagePolicy()
            }}
          />
          <TextInput
            id="place-distance"
            name=""
            label={m.place_policy_metres()}
            value={maxMetres?.toString() ?? ''}
            inputType="number"
            inputAttrs={{ min: 0, step: 'any' }}
            {isEditing}
            disabled={saving || coordinateMode !== 'withinDistance'}
            onValueChange={value => {
              maxMetres = value.trim() ? Number(value) : undefined
              stagePolicy()
            }}
          />
          <p class="text-sm text-muted-foreground">{m.place_policy_distance_help()}</p>
        </div>
      </div>
      {#each [
        {
          key: 'address',
          title: m.place_policy_address(),
          description: m.place_policy_address_help(),
        },
        {
          key: 'unit',
          title: m.place_policy_unit(),
          description: m.place_policy_unit_help(),
        },
        {
          key: 'establishment',
          title: m.place_policy_establishment(),
          description: m.place_policy_establishment_help(),
        },
      ] as setting (setting.key)}
        <div class="grid gap-4 py-6 md:grid-cols-2 md:gap-8">
          <div>
            <h3 class="font-medium">{setting.title}</h3>
            <p class="mt-1 text-sm text-muted-foreground">{setting.description}</p>
          </div>
          <SelectField
            triggerClass="bg-[var(--form-control-edit-fill)]! border-[var(--form-control-border)]!"
            id={`place-${setting.key}`}
            label={m.place_policy_rule()}
            placeholder={setting.title}
            value={policy[setting.key as 'address' | 'unit' | 'establishment']}
            onValueChange={value => {
              policy[setting.key as 'address' | 'unit' | 'establishment'] = value as
                | 'review'
                | 'automatic'
              stagePolicy()
            }}
            items={reviewItems}
            {isEditing}
            disabled={saving}
          />
        </div>
      {/each}
    </div>
    <p class="max-w-3xl text-sm text-muted-foreground">{m.place_policy_note()}</p>
  </div>
</section>
