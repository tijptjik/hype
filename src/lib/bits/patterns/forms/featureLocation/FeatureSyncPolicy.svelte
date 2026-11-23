<script lang="ts">
// SVELTE
import type { Component } from 'svelte'
import { MediaQuery } from 'svelte/reactivity'
// I18N
import { getLocale, m } from '#lib/i18n.js'
// API
import { getFeatureLocationSyncPolicy } from '#lib/api/location.remote.js'
// COMPONENTS
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
import CommunityIcon from '#lib/bits/custom/icon/CommunityIcon.svelte'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
// ICONS
import LinkIcon from 'virtual:icons/lucide/link'
import AcceptIcon from 'virtual:icons/lucide/check'
import ReviewIcon from 'virtual:icons/lucide/clipboard-check'
import KeepIcon from 'virtual:icons/lucide/pin'
import DistanceIcon from 'virtual:icons/lucide/ruler'
import DisabledIcon from 'virtual:icons/lucide/minus'
// DOMAIN
import { locationRulesForOrigin } from '#lib/locations/model.js'
import { resolveContentField } from '#lib/i18n/automatic.js'
// TYPES
import type { PolicyDefinition } from '#lib/db/services/featureSyncPolicy.js'
import type { LocationChangeRules } from '#lib/locations/model.js'
let { featureId, manual = false }: { featureId: string; manual?: boolean } = $props()
let open = $state(false)
const sidePlacement = new MediaQuery('(min-width: 768px)')
const settings = $derived(open ? getFeatureLocationSyncPolicy({ featureId }) : null)
/** Resolve the defining resource's admin name, including legacy stored names.
 * @param definition Persisted policy ancestor. @returns Its localized name or resource ID.
 */
function definitionName(definition: PolicyDefinition): string {
  return (
    resolveContentField(definition.i18n, 'name', getLocale(), false, true).value ||
    definition.id
  )
}
/** Link to the Advanced facet containing the actual policy controls.
 * @param definition Persisted policy ancestor. @returns Local admin settings URL.
 */
function definitionHref(definition: PolicyDefinition): string {
  return `/admin/${definition.kind}s/${encodeURIComponent(definition.id)}#advanced`
}
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
/** Pair policy choices with distinct icons while retaining their text labels.
 * @param rule Effective policy choice. @returns Decorative icon component.
 */
function ruleIcon(
  rule: string | undefined,
): Component<{ class?: string; 'aria-hidden'?: 'true' }> {
  return rule === 'review'
    ? ReviewIcon
    : rule === 'fixed'
      ? KeepIcon
      : rule === 'withinDistance'
        ? DistanceIcon
        : AcceptIcon
}
/** Produce the same source-specific rules used by the update processor.
 * @param rules Rules for a single source. @returns Display rows.
 */
function rows(rules: LocationChangeRules): {
  group: 'sections' | 'special'
  label: string
  value: string
  icon: ReturnType<typeof ruleIcon>
  help?: string
}[] {
  return [
    {
      group: 'sections',
      label: m.location_policy_establishment(),
      icon: ruleIcon(rules.establishment),
      value: describeRule(rules.establishment),
    },
    {
      group: 'sections',
      label: m.location_sync_policy_address_section(),
      icon: ruleIcon(
        rules.address === 'review' || rules.unit === 'review' ? 'review' : 'follow',
      ),
      value:
        rules.address === rules.unit
          ? describeRule(rules.address)
          : `${m.location_policy_address()}: ${describeRule(rules.address)}; ${m.location_policy_unit()}: ${describeRule(rules.unit)}`,
    },
    {
      group: 'sections',
      label: m.location_policy_coordinates(),
      icon: ruleIcon(rules.coordinates.mode),
      value:
        rules.coordinates.mode === 'withinDistance'
          ? m.location_sync_policy_distance({ metres: rules.coordinates.maxMetres })
          : describeRule(rules.coordinates.mode),
    },
    {
      group: 'sections',
      label: m.location_sync_policy_channels(),
      icon: ruleIcon(rules.communications),
      value: describeRule(rules.communications),
    },
    {
      group: 'special',
      label: m.location_sync_policy_missing(),
      value: rules.acceptMissing ? m.yes() : m.no(),
      icon: rules.acceptMissing ? AcceptIcon : DisabledIcon,
      help: m.location_sync_policy_missing_help(),
    },
    {
      group: 'special',
      label: m.location_policy_relocation(),
      icon: ruleIcon(rules.relocation),
      value: describeRule(rules.relocation),
    },
    {
      group: 'special',
      label: m.location_sync_policy_resolved(),
      value: rules.acceptUnresolved ? m.yes() : m.no(),
      icon: rules.acceptUnresolved ? AcceptIcon : DisabledIcon,
      help: m.location_sync_policy_resolved_help(),
    },
  ]
}
</script>

<SimpleTooltip
  bind:open
  showArrow
  triggerProps={{ 'aria-label': m.location_sync_policy(), role: 'button' }}
  contentProps={{
    side: sidePlacement.current ? 'left' : 'bottom',
    align: sidePlacement.current ? 'center' : 'end',
    'aria-label': m.location_sync_policy(),
  }}
  contentClass="w-[38rem] max-w-[calc(100vw-2rem)] p-4 text-left"
>
  {#snippet trigger()}
    <span
      class="text-primary hover:bg-primary/10 inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm"
    >
      <LinkIcon class="size-4" aria-hidden="true" />{m.location_sync_policy()}
    </span>
  {/snippet}
  <div
    class="max-h-[min(calc(100dvh-5rem),calc(var(--bits-popover-content-available-height,100dvh)-2.5rem))] space-y-4 overflow-y-auto"
    data-sync-policy-content
  >
    <header class="space-y-2">
      <h2 class="text-[15px] leading-snug font-semibold">{m.location_sync_policy()}</h2>
      <p class="text-muted-foreground text-sm">
        {m.location_sync_policy_description()}
      </p>
    </header>
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
        <div
          class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 text-sm"
        >
          <p class="font-semibold" data-sync-policy-source={value.source}>
            {value.source === 'project'
              ? m.location_sync_policy_project()
              : value.source === 'organisation'
                ? m.location_sync_policy_organisation()
                : m.location_sync_policy_default()}
          </p>
          <p
            class="text-muted-foreground ml-auto flex flex-wrap items-baseline justify-end gap-x-1 text-right text-xs"
          >
            {m.location_sync_policy_using()}
            {#if value.definition}
              <a
                class="text-primary font-semibold underline underline-offset-2"
                href={definitionHref(value.definition)}
                data-sync-policy-definition
                >{definitionName(value.definition)}</a
              >
            {:else}
              <span class="text-foreground font-semibold"
                >{m.location_sync_policy_hype_defaults()}</span
              >
            {/if}
          </p>
        </div>
        {@const upstreamRows = rows(locationRulesForOrigin(value.policy, 'saanseoi'))}
        {@const communityRows = rows(locationRulesForOrigin(value.policy, 'community'))}
        <div class="border-border/50 border-t pt-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-1 text-center">
              <h3
                class="flex items-center justify-center gap-2 text-[15px] font-semibold"
              >
                <LinkIcon class="size-4" aria-hidden="true" />SaanSeoi
              </h3>
              <p class="text-muted-foreground text-xs">
                {m.location_sync_policy_upstream_source()}
              </p>
            </div>
            <div class="space-y-1 text-center">
              <h3
                class="flex items-center justify-center gap-2 text-[15px] font-semibold"
              >
                <CommunityIcon class="size-4" aria-hidden="true" />
                {m.location_visibility_shared()}
              </h3>
              <p class="text-muted-foreground text-xs">
                {m.location_sync_policy_other_users()}
              </p>
            </div>
          </div>
          {#each ['sections', 'special'] as const as group}
            <section class="mt-5 space-y-3" data-sync-policy-group={group}>
              <h4 class="border-border/50 border-b pb-2 text-sm font-semibold">
                {group === 'sections'
                  ? m.location_sync_policy_sections()
                  : m.location_sync_policy_special()}
              </h4>
              <dl class="space-y-4">
                {#each upstreamRows.filter(row => row.group === group) as row, index}
                  {@const other = communityRows.filter(row => row.group === group)[
                    index
                  ]}
                  {@const shared = row.value === other.value && row.icon === other.icon}
                  <div data-sync-policy-shared={shared}>
                    <dt class="text-muted-foreground text-center text-xs">
                      {row.label}
                    </dt>
                    {#if shared}
                      <dd class="mt-1 space-y-1 text-sm">
                        <div class="flex items-center gap-3">
                          <span
                            class="border-border/60 h-2 flex-1 rounded-bl border-b border-l"
                            aria-hidden="true"
                          ></span>
                          <span
                            class="flex items-center justify-center gap-2"
                            data-sync-policy-choice
                          >
                            <row.icon class="size-4 shrink-0" aria-hidden="true" />
                            <span>{row.value}</span>
                          </span>
                          <span
                            class="border-border/60 h-2 flex-1 rounded-br border-r border-b"
                            aria-hidden="true"
                          ></span>
                        </div>
                        {#if row.help}
                          <p
                            class="text-muted-foreground mx-auto max-w-sm text-center text-xs leading-relaxed"
                          >
                            {row.help}
                          </p>
                        {/if}
                      </dd>
                    {:else}
                      <dd class="mt-2 grid grid-cols-2 gap-4 text-sm">
                        {#each [row, other] as choice, source}
                          <div
                            class="border-primary/20 bg-primary/5 rounded-lg border px-3 py-2 text-center"
                          >
                            <span class="sr-only"
                              >{source === 0
                                ? 'SaanSeoi'
                                : m.location_visibility_shared()}:
                            </span>
                            <span
                              class="flex items-center justify-center gap-2"
                              data-sync-policy-choice
                            >
                              <choice.icon class="size-4 shrink-0" aria-hidden="true" />
                              <span>{choice.value}</span>
                            </span>
                            {#if choice.help}
                              <p
                                class="text-muted-foreground mt-1 text-xs leading-relaxed"
                              >
                                {choice.help}
                              </p>
                            {/if}
                          </div>
                        {/each}
                      </dd>
                    {/if}
                  </div>
                {/each}
              </dl>
            </section>
          {/each}
        </div>
      {:else}
        <p role="alert" class="mt-4 text-sm">{m.location_policy_unavailable()}</p>
      {/if}
    {:catch}
      <p role="alert" class="mt-4 text-sm">{m.location_policy_unavailable()}</p>
    {/await}
  </div>
</SimpleTooltip>
