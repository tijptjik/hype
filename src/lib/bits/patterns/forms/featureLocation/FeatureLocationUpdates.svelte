<script lang="ts">
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
import { ADDRESS_LOCALES } from '#lib/addresses/featureAddress.js'
// API
import { getFeatureLocation } from '#lib/api/location.remote.js'
import { reviewLatestLocalLocation } from '#lib/api/locationReview.remote.js'
// COMPONENTS
import LocationResetFields from './LocationResetFields.svelte'
import LocationBrandEditor from './LocationBrandEditor.svelte'
import LocationIdentityReviewSection from './LocationIdentityReviewSection.svelte'
import LocationTasks from './LocationTasks.svelte'
import LocationIcon from '#lib/bits/custom/locationIcon/LocationIcon.svelte'
// ICONS
import SyncIcon from 'virtual:icons/proicons/arrow-sync'
// DOMAIN
import { lifecycleStatus } from '#lib/locations/lifecycle.js'
import { lifecycleLabel } from '#lib/locations/lifecycle.i18n.js'
// BITS COMPONENTS
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
// TYPES
import type { LocationBrandEdit } from '#lib/locations/brandEdit.js'
import type { LocationReset } from '#lib/locations/reset.js'

let {
  featureId,
  organisationId,
  isEditing,
  isDirty,
  reset,
  brandEdit,
  onResetFields,
  onBrandEdit,
  onUnlink,
  onSourceUpdate,
}: {
  featureId: string
  organisationId?: string
  isEditing: boolean
  isDirty: boolean
  reset?: unknown
  brandEdit?: unknown
  onResetFields: (value: LocationReset | undefined) => void
  onBrandEdit: (value: LocationBrandEdit) => void
  onUnlink: (version: string) => Promise<void>
  onSourceUpdate: () => Promise<void>
} = $props()
const accepted = $derived(getFeatureLocation({ featureId }))
let busy = $state(false)
let failed = $state(false)
let reviewed = $state(false)
let taskRefresh = $state(0)
let identityExpanded = $state(false)

/** Prepare review evidence or disconnect while preserving the Feature's current values.
 * @param action Explicit action chosen by the user. @returns Completion after queries refresh.
 * @remarks Opening this tab never adopts a source update or changes a Location.
 */
async function act(action: 'review' | 'unlink'): Promise<void> {
  if (busy || isDirty || !isEditing || !accepted.current) return
  const version = accepted.current.version
  busy = true
  failed = false
  try {
    if (action === 'review') await reviewLatestLocalLocation({ featureId })
    else await onUnlink(version)
    await accepted.refresh()
    taskRefresh += 1
    reviewed = action === 'review'
  } catch {
    failed = true
  } finally {
    busy = false
  }
}
</script>

<div
  class="mx-auto w-full max-w-5xl space-y-6 px-6 py-6 pb-24"
  data-feature-location-updates
>
  <header class="flex items-start gap-3">
    <SyncIcon class="text-primary mt-1 size-6 shrink-0" aria-hidden="true" />
    <div class="space-y-1">
      <h2 class="text-xl font-semibold">{m.feature_updates_title()}</h2>
      <p class="text-muted-foreground max-w-2xl text-sm leading-relaxed">
        {m.feature_updates_help()}
      </p>
    </div>
  </header>
  {#await accepted}
    <ContentSkeleton label={m.feature_location_loading()}
      ><section class="border-border space-y-4 rounded-xl border p-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0 space-y-2">
            <h3 class="text-sm font-semibold">{m.feature_updates_connection()}</h3>
            <p class="font-semibold">Location name</p>
          </div>
          <button type="button" class="rounded-lg border px-3 py-2 text-sm">
            {m.feature_updates_manage_location()}
          </button>
        </div>
      </section></ContentSkeleton
    >
  {:then association}
    {#if association}
      {@const locationHref = `/admin/locations/${encodeURIComponent(association.locationId)}${organisationId ? `?organisation=${encodeURIComponent(organisationId)}` : ''}`}
      {@const status = lifecycleStatus(association.effective)}
      <section
        class="border-border space-y-4 rounded-xl border p-5"
        aria-label={m.feature_updates_connection()}
      >
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0 space-y-2">
            <h3 class="text-muted-foreground text-sm font-semibold">
              {m.feature_updates_connection()}
            </h3>
            <a
              href={locationHref}
              class="text-primary inline-flex min-w-0 items-center gap-2 font-semibold hover:underline"
              ><LocationIcon kind={association.kind} class="size-5 shrink-0" />
              <span class="min-w-0 break-words whitespace-normal"
                >{association.effective.names[ADDRESS_LOCALES[getLocaleKey()]] ||
                  Object.values(association.effective.names).find(Boolean)}</span
              ></a
            >
          </div>
          <a
            href={locationHref}
            class="border-border text-primary hover:bg-primary/10 rounded-lg border px-3 py-2 text-sm"
            >{m.feature_updates_manage_location()}</a
          >
        </div>
        {#if status !== 'unknown' || association.effective.successorLocationId}
          <div class="border-border/50 space-y-2 border-t pt-4">
            <h3 class="font-semibold">{m.feature_updates_status()}</h3>
            {#if status !== 'unknown'}
              <p class="text-sm">{lifecycleLabel(status)}</p>
            {/if}
            <p class="text-muted-foreground text-sm leading-relaxed">
              {m.feature_updates_status_help()}
            </p>
            {#if association.effective.successorLocationId}
              <a
                class="text-primary text-sm underline"
                href={`/admin/locations/${encodeURIComponent(association.effective.successorLocationId)}`}
                >{m.feature_updates_successor()}</a
              >
            {/if}
          </div>
        {/if}
        {#if association.occupancyRevisionId ||
          association.addressRevisionId ||
          association.membershipRevisionIds.length}
          <p
            class="border-border/50 text-muted-foreground border-t pt-4 text-sm leading-relaxed"
          >
            {m.feature_updates_placement_help()}
          </p>
        {/if}
      </section>
      <section class="space-y-4" aria-label={m.feature_updates_review()}>
        {#if isEditing}
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="max-w-2xl space-y-1">
              <h3 class="text-lg font-semibold">{m.feature_updates_review()}</h3>
              <p class="text-muted-foreground text-sm leading-relaxed">
                {m.feature_updates_review_help()}
              </p>
            </div>
            {#if isEditing}
              <button
                type="button"
                disabled={busy || isDirty}
                class="bg-primary rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                onclick={() => act('review')}
              >
                {m.location_address_review_latest()}
              </button>
            {/if}
          </div>
          {#if reviewed}
            <p role="status" class="text-muted-foreground text-sm">
              {m.feature_updates_checked()}
            </p>
          {/if}
        {/if}
        <LocationTasks
          {featureId}
          refreshKey={`${association.version}:${taskRefresh}`}
        />
      </section>
      {#if isEditing}
        <details
          bind:open={identityExpanded}
          class="border-border rounded-xl border p-5"
        >
          <summary class="cursor-pointer font-semibold">
            {m.location_identity_title()}
          </summary>
          <p class="text-muted-foreground mt-3 text-sm leading-relaxed">
            {m.feature_updates_identity_help()}
          </p>
          <div class="mt-4">
            {#if identityExpanded}
              {#key featureId + ':' + association.locationId}
                <LocationIdentityReviewSection
                  {featureId}
                  locationId={association.locationId}
                  {isDirty}
                  onCommitted={onSourceUpdate}
                />
              {/key}
            {/if}
          </div>
        </details>
        <details class="border-border rounded-xl border p-5">
          <summary class="cursor-pointer font-semibold">
            {m.feature_updates_overrides()}
          </summary>
          <div class="mt-4 space-y-4">
            <LocationResetFields
              version={association.version}
              {reset}
              onChange={onResetFields}
            />
            <LocationBrandEditor
              {association}
              edit={brandEdit}
              {isEditing}
              onChange={onBrandEdit}
            />
            <div class="border-border/50 space-y-3 border-t pt-4">
              <p class="text-muted-foreground text-sm leading-relaxed">
                {m.feature_updates_unlink_help()}
              </p>
              <button
                type="button"
                disabled={busy || isDirty}
                class="border-border text-primary hover:bg-primary/10 rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
                onclick={() => act('unlink')}
              >
                {m.feature_location_unlink()}
              </button>
            </div>
          </div>
        </details>
        {#if isDirty}
          <p class="text-muted-foreground text-sm">{m.feature_updates_save_first()}</p>
        {/if}
      {/if}
    {:else}
      <div class="border-border space-y-3 rounded-xl border p-5">
        <p>{m.feature_location_no_association()}</p>
        <a
          href={`/admin/features/${encodeURIComponent(featureId)}#location`}
          class="text-primary text-sm underline"
          >{m.feature_updates_choose_location()}</a
        >
      </div>
    {/if}
  {:catch}
    <p role="alert" class="text-error text-sm">{m.feature_location_failed()}</p>
  {/await}
  {#if failed}
    <p role="alert" class="text-error text-sm">{m.feature_location_failed()}</p>
  {/if}
</div>
