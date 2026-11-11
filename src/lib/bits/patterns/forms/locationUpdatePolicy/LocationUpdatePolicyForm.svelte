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
import BrandIcon from 'virtual:icons/proicons/tag'
import MapPinIcon from 'virtual:icons/proicons/location'
import ShopIcon from 'virtual:icons/lucide/store'
import ContactIcon from 'virtual:icons/lucide/contact'
// DOMAIN
import {
  DEFAULT_PROJECT_LOCATION_POLICY,
  ProjectLocationPolicySchema,
} from '#lib/locations/model.js'
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
  { value: 'follow', label: 'Accept changes' },
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
    <div class="flex flex-wrap items-center justify-between gap-4">
      <a
        href="https://saanseoi.hk"
        target="_blank"
        rel="noreferrer"
        class="inline-flex items-center gap-2 text-sm font-medium"
      >
        <span
          aria-hidden="true"
          class="size-6 bg-current [mask:url(/logos/saanseoi.svg)_center/contain_no-repeat]"
        ></span>
        SaanSeoi
      </a>
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={policy.sameSources ?? false}
          disabled={!isEditing || saving}
          onchange={event => {
            policy.sameSources = event.currentTarget.checked
            stagePolicy()
          }}
        >
        Same policy for community changes
      </label>
    </div>
    <div class="flex flex-wrap gap-6 text-sm">
      {#each policy.sameSources ? ['saanseoi'] : ['saanseoi', 'community'] as origin}
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 font-medium">
            {policy.sameSources
              ? 'Exceptions'
              : origin === 'community'
                ? 'Community exceptions'
                : 'SaanSeoi exceptions'}
          </legend>
          {#each [
            { key: 'acceptMissing', label: 'Accept when our value is empty' },
            { key: 'acceptUnresolved', label: 'Accept newly resolved addresses' },
          ] as exception}
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={!isEditing || saving}
                checked={(origin === 'community' ? policy.community : policy)?.[
                  exception.key as 'acceptMissing' | 'acceptUnresolved'
                ] ?? false}
                onchange={event => {
                  if (origin === 'community') {
                    policy.community ??= {
                      coordinates: { mode: 'review' },
                      address: 'review',
                      unit: 'review',
                      establishment: 'review',
                      relocation: 'review',
                    }
                    policy.community[
                      exception.key as 'acceptMissing' | 'acceptUnresolved'
                    ] = event.currentTarget.checked
                  } else
                    policy[exception.key as 'acceptMissing' | 'acceptUnresolved'] =
                      event.currentTarget.checked
                  stagePolicy()
                }}
              >
              {exception.label}
            </label>
          {/each}
        </fieldset>
      {/each}
    </div>
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
          title: 'Address',
          description: 'Street address, building, floor and unit.',
          icon: BuildingIcon,
        },
        {
          key: 'establishment',
          title: 'Identity',
          description:
            'Names, group, brand, format, branch, identifiers and classification.',
          icon: BrandIcon,
        },
        {
          key: 'communications',
          title: 'Communications',
          description: 'Phone numbers, websites and socials.',
          icon: ContactIcon,
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
            <span class="text-muted-foreground text-xs"
              >{policy.sameSources ? 'All changes' : 'SaanSeoi changes'}</span
            >
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
                : setting.key === 'address'
                  ? policy.address === 'review' || policy.unit === 'review'
                    ? 'review'
                    : 'follow'
                  : (policy[
                      setting.key as
                        | 'address'
                        | 'unit'
                        | 'establishment'
                        | 'relocation'
                        | 'communications'
                    ] ?? 'follow')}
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
                    setting.key as
                      | 'address'
                      | 'unit'
                      | 'establishment'
                      | 'relocation'
                      | 'communications'
                  ] = value as 'review' | 'follow'
                }
                if (setting.key === 'address') policy.unit = policy.address
                stagePolicy()
              }}
            />
          {/if}
          {#if setting.key !== 'radius' && !policy.sameSources}
            {@const community = policy.community ?? DEFAULT_PROJECT_LOCATION_POLICY}
            <span class="text-muted-foreground text-xs">Community changes</span>
            <Select
              triggerClass="relative shrink-0 cursor-pointer bg-background/50! border-[var(--form-control-border)]!"
              triggerAttrs={{ 'aria-label': `${setting.title}: community changes` }}
              value={setting.key === 'coordinates'
                ? community.coordinates.mode
                : setting.key === 'address'
                  ? community.address === 'review' || community.unit === 'review'
                    ? 'review'
                    : 'follow'
                  : (community[
                      setting.key as
                        | 'address'
                        | 'unit'
                        | 'establishment'
                        | 'relocation'
                        | 'communications'
                    ] ?? 'follow')}
              items={setting.key === 'relocation'
                ? relocationItems
                : setting.key === 'coordinates'
                  ? coordinateItems
                  : reviewItems}
              {isEditing}
              disabled={saving}
              onValueChange={value => {
                const next = structuredClone(
                  $state.snapshot(policy.community ?? DEFAULT_PROJECT_LOCATION_POLICY),
                )
                if (setting.key === 'coordinates')
                  next.coordinates =
                    value === 'withinDistance'
                      ? { mode: 'withinDistance', maxMetres: 50 }
                      : { mode: value as 'review' | 'follow' }
                else if (setting.key === 'relocation')
                  next.relocation = value as 'fixed' | 'review' | 'follow'
                else
                  next[
                    setting.key as
                      | 'address'
                      | 'unit'
                      | 'establishment'
                      | 'communications'
                  ] = value as 'review' | 'follow'
                if (setting.key === 'address') next.unit = next.address
                const { version: _version, ...rules } = next as typeof next & {
                  version?: number
                }
                policy.community = rules
                stagePolicy()
              }}
            />
            {#if setting.key === 'coordinates' &&
              community.coordinates.mode === 'withinDistance'}
              <TextInput
                id="community-distance"
                name=""
                label={m.location_policy_metres()}
                value={String(community.coordinates.maxMetres)}
                inputType="number"
                inputAttrs={{ min: 0, step: 'any' }}
                {isEditing}
                disabled={saving}
                onValueChange={value => {
                  if (policy.community?.coordinates.mode === 'withinDistance') {
                    policy.community.coordinates.maxMetres = Number(value)
                    stagePolicy()
                  }
                }}
              />
            {/if}
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
