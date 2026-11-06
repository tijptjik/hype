<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import { SectionHeader, TextInput } from '#lib/bits/custom/index.js'
import { Select } from '#lib/bits/core/index.js'
// ICONS
import BuildingIcon from 'virtual:icons/proicons/building-multiple'
import DoorIcon from 'virtual:icons/proicons/door'
import BrandIcon from 'virtual:icons/proicons/tag'
import MapPinIcon from 'virtual:icons/proicons/location'
// DOMAIN
import { ProjectLocationPolicySchema } from '#lib/locations/model.js'
// TYPES
import type { ProjectLocationPolicy } from '#lib/locations/model.js'
import type { ProjectLocationSettings } from '#lib/db/services/location.js'

let {
  initial,
  isEditing = true,
  saving = false,
  resetVersion = 0,
  onChange,
}: {
  initial: ProjectLocationSettings
  isEditing?: boolean
  saving?: boolean
  resetVersion?: number
  onChange: (value: string | undefined) => void
} = $props()
let lastResetVersion = $state(-1)
let policy = $state<ProjectLocationPolicy>(
  untrack(() => ProjectLocationPolicySchema.parse(initial.policy)),
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
    policy = ProjectLocationPolicySchema.parse(initial.policy)
    coordinateMode = initial.policy.coordinates.mode
    maxMetres =
      initial.policy.coordinates.mode === 'withinDistance'
        ? initial.policy.coordinates.maxMetres
        : undefined
  }
})

const reviewItems = $derived([
  { value: 'review', label: m.location_policy_review() },
  { value: 'automatic', label: m.location_policy_automatic() },
])
const coordinateItems = $derived([
  reviewItems[0],
  { value: 'withinDistance', label: m.location_policy_distance() },
  reviewItems[1],
])
</script>

<section>
  <SectionHeader
    title={m.location_policy_title()}
    description={m.location_policy_description()}
    icon={MapPinIcon}
  />
  <div class="flex flex-col gap-8 p-4 pb-24 sm:p-6 sm:pb-24">
    <div class="max-w-md">
      <TextInput
        id="place-discovery-radius"
        name=""
        label={m.feature_location_radius()}
        value={String(policy.discoveryRadiusMetres ?? 300)}
        inputType="number"
        inputAttrs={{ min: 50, max: 1000, step: 50 }}
        {isEditing}
        disabled={saving}
        onValueChange={value => {
          policy.discoveryRadiusMetres = value.trim() ? Number(value) : undefined
          stagePolicy()
        }}
      />
      <p class="text-muted-foreground mt-2 text-sm">
        {m.feature_location_radius_help()}
      </p>
    </div>
    <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-8">
      {#each [
        {
          key: 'coordinates',
          title: m.location_policy_coordinates(),
          description: m.location_policy_coordinates_help(),
          icon: MapPinIcon,
        },
        {
          key: 'address',
          title: m.location_policy_address(),
          description: m.location_policy_address_help(),
          icon: BuildingIcon,
        },
        {
          key: 'unit',
          title: m.location_policy_unit(),
          description: m.location_policy_unit_help(),
          icon: DoorIcon,
        },
        {
          key: 'establishment',
          title: m.location_policy_establishment(),
          description: m.location_policy_establishment_help(),
          icon: BrandIcon,
        },
      ] as setting (setting.key)}
        <div
          class="flex flex-col gap-5 rounded-xl border border-[var(--form-control-border)] bg-[var(--form-control-edit-fill)] p-5"
        >
          <div class="flex flex-1 items-start gap-3">
            <span
              class="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg"
              aria-hidden="true"
            >
              <setting.icon class="size-5" />
            </span>
            <div class="min-w-0">
              <h3 id={`place-${setting.key}-title`} class="font-medium">
                {setting.title}
              </h3>
              <p
                id={`place-${setting.key}-help`}
                class="text-muted-foreground mt-1 text-sm leading-relaxed"
              >
                {setting.description}
              </p>
            </div>
          </div>
          <Select
            triggerClass="bg-background/50! border-[var(--form-control-border)]!"
            triggerAttrs={{
              id: `place-${setting.key}`,
              'aria-labelledby': `place-${setting.key}-title`,
              'aria-describedby': `place-${setting.key}-help`,
            }}
            placeholder={setting.title}
            value={setting.key === 'coordinates'
              ? coordinateMode
              : policy[setting.key as 'address' | 'unit' | 'establishment']}
            items={setting.key === 'coordinates' ? coordinateItems : reviewItems}
            {isEditing}
            disabled={saving}
            onValueChange={value => {
              if (setting.key === 'coordinates') {
                coordinateMode = value as typeof coordinateMode
              } else {
                policy[setting.key as 'address' | 'unit' | 'establishment'] = value as
                  | 'review'
                  | 'automatic'
              }
              stagePolicy()
            }}
          />
          {#if setting.key === 'coordinates' && coordinateMode === 'withinDistance'}
            <div
              class="flex flex-col gap-2 border-t border-[var(--form-control-border)] pt-4"
            >
              <TextInput
                id="place-distance"
                name=""
                label={m.location_policy_metres()}
                value={maxMetres?.toString() ?? ''}
                inputType="number"
                inputAttrs={{ min: 0, step: 'any' }}
                {isEditing}
                disabled={saving}
                onValueChange={value => {
                  maxMetres = value.trim() ? Number(value) : undefined
                  stagePolicy()
                }}
              />
              <p class="text-muted-foreground text-xs leading-relaxed">
                {m.location_policy_distance_help()}
              </p>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</section>
