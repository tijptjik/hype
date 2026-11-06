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
import ShopIcon from 'virtual:icons/lucide/store'
// DOMAIN
import { ProjectLocationPolicySchema } from '#lib/locations/model.js'
import { stageProjectPolicyDraft } from '#lib/locations/policyDraft.js'
// TYPES
import type { ProjectLocationPolicy } from '#lib/locations/model.js'
import type { ProjectLocationSettings } from '#lib/db/services/location.js'

let {
  initial,
  staged,
  isEditing = true,
  saving = false,
  resetVersion = 0,
  onChange,
}: {
  initial: ProjectLocationSettings
  staged?: string
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
  // All Location policies share the Project form's atomic submission.
  onChange(stageProjectPolicyDraft(initial, staged, candidate.policy))
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
  { value: 'follow', label: m.location_policy_follow() },
])
const relocationItems = $derived([
  { value: 'fixed', label: m.location_policy_fixed() },
  ...reviewItems,
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
    <div
      class="grid auto-rows-fr grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-8"
    >
      {#each [
        {
          key: 'relocation',
          title: m.location_policy_relocation(),
          description: m.location_policy_relocation_help(),
          icon: ShopIcon,
        },
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
        {
          key: 'radius',
          title: m.feature_location_radius(),
          description: m.feature_location_radius_help(),
          icon: MapPinIcon,
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
          {#if setting.key === 'radius'}
            <div class="flex min-h-12 flex-col justify-center gap-2">
              <div
                class="text-muted-foreground flex justify-between text-xs tabular-nums"
              >
                <span>50 m</span>
                <output
                  for="place-discovery-radius"
                  class="text-foreground font-semibold"
                >
                  {policy.discoveryRadiusMetres ?? 300}
                  m
                </output>
                <span>1,000 m</span>
              </div>
              <input
                id="place-discovery-radius"
                type="range"
                min="50"
                max="1000"
                step="50"
                value={policy.discoveryRadiusMetres ?? 300}
                disabled={!isEditing || saving}
                aria-labelledby="place-radius-title"
                aria-describedby="place-radius-help"
                aria-valuetext={`${policy.discoveryRadiusMetres ?? 300} m`}
                class="accent-primary focus-visible:outline-ring h-6 w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default"
                oninput={event => {
                  policy.discoveryRadiusMetres = Number(event.currentTarget.value)
                  stagePolicy()
                }}
              >
            </div>
          {:else}
            <Select
              triggerClass="relative shrink-0 cursor-pointer bg-background/50! border-[var(--form-control-border)]!"
              triggerAttrs={{
                id: `place-${setting.key}`,
                'aria-labelledby': `place-${setting.key}-title`,
                'aria-describedby': `place-${setting.key}-help`,
              }}
              placeholder={setting.title}
              value={setting.key === 'coordinates'
                ? coordinateMode
                : policy[
                    setting.key as 'address' | 'unit' | 'establishment' | 'relocation'
                  ]}
              items={setting.key === 'coordinates'
                ? coordinateItems
                : setting.key === 'relocation'
                  ? relocationItems
                  : reviewItems}
              {isEditing}
              disabled={saving}
              onValueChange={value => {
                if (setting.key === 'coordinates') {
                  coordinateMode = value as typeof coordinateMode
                } else if (setting.key === 'relocation') {
                  policy.relocation = value as 'fixed' | 'review' | 'follow'
                } else {
                  policy[
                    setting.key as 'address' | 'unit' | 'establishment' | 'relocation'
                  ] = value as 'review' | 'follow'
                }
                stagePolicy()
              }}
            />
          {/if}
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
