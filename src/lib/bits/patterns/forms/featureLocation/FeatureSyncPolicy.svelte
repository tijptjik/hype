<script lang="ts">
// SVELTE
import { Dialog } from 'bits-ui'
// I18N
import { m } from '#lib/i18n.js'
// API
import { getFeatureLocationSyncPolicy } from '#lib/api/location.remote.js'
// COMPONENTS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
// ICONS
import LinkIcon from 'virtual:icons/lucide/link'
import CloseIcon from 'virtual:icons/lucide/x'
// DOMAIN
import { locationRulesForOrigin } from '#lib/locations/model.js'
// TYPES
import type { LocationChangeRules } from '#lib/locations/model.js'
let { featureId, manual = false }: { featureId: string; manual?: boolean } = $props()
let open = $state(false)
const settings = $derived(open ? getFeatureLocationSyncPolicy({ featureId }) : null)
/** Describe an effective rule without treating missing communications policy as review.
 * @param rule Resolved policy value. @returns Localized behavior.
 */
function describeRule(rule: 'follow' | 'review' | 'fixed' | undefined): string {
  return rule === 'review'
    ? m.location_policy_review()
    : rule === 'fixed'
      ? m.location_policy_fixed()
      : m.location_sync_policy_follow()
}
/** Produce the same source-specific rules used by the update processor.
 * @param rules Rules for a single source. @returns Display rows.
 */
function rows(rules: LocationChangeRules): { label: string; value: string }[] {
  return [
    {
      label: m.location_sync_policy_missing(),
      value: rules.acceptMissing ? m.yes() : m.no(),
    },
    {
      label: m.location_sync_policy_resolved(),
      value: rules.acceptUnresolved ? m.yes() : m.no(),
    },
    {
      label: m.location_policy_establishment(),
      value: describeRule(rules.establishment),
    },
    { label: m.location_communications(), value: describeRule(rules.communications) },
    { label: m.location_policy_address(), value: describeRule(rules.address) },
    { label: m.location_policy_unit(), value: describeRule(rules.unit) },
    {
      label: m.location_policy_coordinates(),
      value:
        rules.coordinates.mode === 'withinDistance'
          ? m.location_sync_policy_distance({ metres: rules.coordinates.maxMetres })
          : describeRule(rules.coordinates.mode),
    },
    { label: m.location_policy_relocation(), value: describeRule(rules.relocation) },
  ]
}
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger
    class="text-primary hover:bg-primary/10 inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm"
  >
    <LinkIcon class="size-4" />{m.location_sync_policy()}
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay class="bits-dialog__overlay" />
    <Dialog.Content
      class="bits-dialog__content bits-theme max-h-[85dvh] w-[min(42rem,calc(100vw-2rem))] overflow-y-auto"
    >
      <div class="flex items-center justify-between gap-3">
        <Dialog.Title class="bits-dialog__title"
          >{m.location_sync_policy()}</Dialog.Title
        >
        <Dialog.Close
          aria-label={m.guest__close()}
          class="hover:bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-md"
          ><CloseIcon class="size-4" /></Dialog.Close
        >
      </div>
      <Dialog.Description class="text-muted-foreground mt-2 text-sm"
        >{m.location_sync_policy_description()}</Dialog.Description
      >
      {#if manual}
        <p class="mt-4 text-sm">{m.location_sync_policy_manual()}</p>
      {/if}
      {#await settings}
        <div
          role="status"
          aria-busy="true"
          aria-label={m.location_policy_loading()}
          class="mt-5 space-y-3"
        >
          {#each Array(7) as _, index (index)}
            <Skeleton class="h-8 w-full" />
          {/each}
        </div>
      {:then value}
        {#if value}
          <p class="mt-4 text-sm font-semibold" data-sync-policy-source={value.source}>
            {value.source === 'project'
              ? m.location_sync_policy_project()
              : value.source === 'organisation'
                ? m.location_sync_policy_organisation()
                : m.location_sync_policy_default()}
          </p>
          <div class="mt-4 grid gap-8 sm:grid-cols-2">
            {#each ['community', 'saanseoi'] as const as origin}
              <section>
                <h3 class="font-semibold">
                  {origin === 'community' ? m.location_visibility_shared() : 'SaanSeoi'}
                </h3>
                <dl class="mt-3 space-y-3">
                  {#each rows(locationRulesForOrigin(value.policy, origin)) as row}
                    <div>
                      <dt class="text-muted-foreground text-xs">{row.label}</dt>
                      <dd class="mt-1 text-sm">{row.value}</dd>
                    </div>
                  {/each}
                </dl>
              </section>
            {/each}
          </div>
          {#if value.layerRelocation}
            <p class="border-border mt-5 border-t pt-4 text-sm">
              {m.location_sync_policy_layer_inactive({
                rule: describeRule(value.layerRelocation),
              })}
            </p>
          {/if}
        {:else}
          <p role="alert" class="mt-4 text-sm">{m.location_policy_unavailable()}</p>
        {/if}
      {:catch}
        <p role="alert" class="mt-4 text-sm">{m.location_policy_unavailable()}</p>
      {/await}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
