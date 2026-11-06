<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// API
import { getLocationUpdatePolicy } from '#lib/api/location.remote.js'
// BITS COMPONENTS
import { SectionHeader } from '#lib/bits/custom/index.js'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
// ICONS
import MapPinIcon from 'virtual:icons/proicons/location'
// COMPONENTS
import LocationUpdatePolicyForm from './LocationUpdatePolicyForm.svelte'
let {
  projectId,
  staged,
  isEditing,
  saving,
  resetVersion,
  onChange,
}: {
  projectId: string
  staged?: string
  isEditing: boolean
  saving: boolean
  resetVersion: number
  onChange: (value: string | undefined) => void
} = $props()
const settings = $derived(getLocationUpdatePolicy({ projectId }))
</script>

{#await settings}
  <section aria-busy="true" aria-label={m.location_policy_title()}>
    <SectionHeader
      title={m.location_policy_title()}
      description={m.location_policy_description()}
      icon={MapPinIcon}
    />
    <span class="sr-only" role="status">{m.location_policy_loading()}</span>
    <div
      class="grid auto-rows-fr grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-8 p-4 pb-24 sm:p-6 sm:pb-24"
    >
      {#each Array(6) as _, index (index)}
        <div
          class="flex min-h-56 flex-col gap-5 rounded-xl border border-[var(--form-control-border)] bg-[var(--form-control-edit-fill)] p-5"
        >
          <div class="flex flex-1 items-start gap-3">
            <Skeleton class="size-10 shrink-0 rounded-lg" />
            <div class="flex min-w-0 flex-1 flex-col gap-3">
              <Skeleton class="h-5 w-3/4" />
              <Skeleton class="h-3 w-full" />
              <Skeleton class="h-3 w-5/6" />
            </div>
          </div>
          <Skeleton class="h-12 w-full rounded-lg" />
        </div>
      {/each}
    </div>
  </section>
{:then initial}
  <LocationUpdatePolicyForm
    {initial}
    {staged}
    {isEditing}
    {saving}
    {resetVersion}
    {onChange}
  />
{:catch}
  <p class="text-muted-foreground p-6" role="alert">
    {m.location_policy_unavailable()}
  </p>
{/await}
