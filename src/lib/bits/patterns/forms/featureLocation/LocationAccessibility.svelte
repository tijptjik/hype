<script lang="ts">
// FORM CONTROLS
import { reverseTabStop } from '#lib/bits/custom/form/reverseTabStop.js'
// SVELTE
import { tick, untrack } from 'svelte'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import AccessibilityFields from './AccessibilityFields.svelte'
// ICONS
import ResetIcon from 'virtual:icons/lucide/rotate-ccw'
// API
import {
  getLocationAccessibility,
  updateLocationAccessibility,
} from '#lib/api/locationAccessibility.remote.js'
// DOMAIN
import {
  ACCESSIBILITY_FIELDS,
  UNKNOWN_ACCESSIBILITY,
} from '#lib/locations/accessibility.js'
// TYPES
import type { Accessibility, AccessibilityView } from '#lib/locations/accessibility.js'

let {
  locationId,
  startEditing = false,
  readOnly = false,
  hideHeading = false,
  onRemove,
}: {
  onRemove?: () => void
  locationId: string
  startEditing?: boolean
  readOnly?: boolean
  hideHeading?: boolean
} = $props()
const uid = $props.id()
const request = $derived(getLocationAccessibility({ locationId }))
let editing = $state(false)
let busy = $state(false)
let failed = $state(false)
let saved = $state(false)
let draft = $state<Accessibility>({ ...UNKNOWN_ACCESSIBILITY })
let baseline = $state<AccessibilityView | null>(null)
const labels = $derived({
  wheelchair: m.accessibility_wheelchair(),
  stepFreeEntrance: m.accessibility_step_free(),
  lift: m.accessibility_lift(),
  toilet: m.accessibility_toilet(),
})
const changed = $derived(
  editing &&
    ACCESSIBILITY_FIELDS.some(
      field =>
        draft[field] !== (baseline?.record?.values ?? UNKNOWN_ACCESSIBILITY)[field],
    ),
)
const values = $derived({
  unknown: m.accessibility_unknown(),
  yes: m.accessibility_yes(),
  no: m.accessibility_no(),
  limited: m.accessibility_limited(),
  not_needed: m.accessibility_not_needed(),
})
// A new subject discards local edit state; a refreshed remote head does not overwrite a user's draft.
$effect(() => {
  locationId
  untrack(() => {
    editing = false
    saved = false
    failed = false
    baseline = null
  })
})
// An added address part opens straight into editing once its shared baseline has loaded.
$effect(() => {
  const view = request.current
  if (!readOnly && startEditing && view)
    untrack(() => {
      if (!baseline) {
        edit(view)
        void tick().then(() =>
          requestAnimationFrame(() =>
            document
              .getElementById(`${uid}-stepFreeEntrance`)
              ?.focus({ preventScroll: true }),
          ),
        )
      }
    })
})
/** Start from the displayed revision, retaining its concurrency tokens until save.
 * @param view Loaded shared facts. @returns Nothing.
 */
function edit(view: AccessibilityView): void {
  baseline = view
  draft = { ...(view.record?.values ?? UNKNOWN_ACCESSIBILITY) }
  editing = true
  saved = failed = false
}
/** Save this shared Location independently of the enclosing Feature/address draft.
 * @returns Nothing; conflicts preserve entered values and require an explicit reload.
 */
async function save(): Promise<void> {
  if (!baseline || busy) return
  const subject = locationId
  busy = true
  failed = false
  try {
    await updateLocationAccessibility({
      locationId: subject,
      expectedId:
        'observationId' in baseline
          ? (baseline.observationId ?? null)
          : (baseline.record?.id ?? null),
      expectedLocationRevisionId: baseline.locationRevisionId,
      values: $state.snapshot(draft),
    })
    if (subject === locationId) {
      editing = false
      saved = true
      await request.refresh()
    }
  } catch {
    if (subject === locationId) failed = true
  } finally {
    busy = false
  }
}
/** Clear shared mobility answers without touching the address record.
 * @param view Current observation and revision tokens. @returns Completion after a successful clear.
 */
async function remove(view: AccessibilityView): Promise<void> {
  if (busy) return
  if (
    view.record &&
    ACCESSIBILITY_FIELDS.some(field => view.record!.values[field] !== 'unknown')
  ) {
    edit(view)
    draft = { ...UNKNOWN_ACCESSIBILITY }
    await save()
    if (!saved) return
  }
  onRemove?.()
}
</script>

{#await request}
  <p class="text-muted-foreground text-sm">{m.accessibility_loading()}</p>
{:then view}
  {#if view}
    <section class="space-y-3 py-3" aria-label={m.accessibility_title()}>
      {#if !hideHeading}
        <h2 class="text-muted-foreground text-xs font-medium">
          {m.accessibility_title()}
        </h2>
      {/if}
      <div class="flex items-center justify-between gap-4">
        <div class="group/subsection flex items-center gap-2">
          <h3 class="text-sm font-semibold">{m.accessibility_mobility_heading()}</h3>
          {#if !readOnly && onRemove}
            <button
              type="button"
              disabled={busy}
              use:reverseTabStop
              aria-label={m.forms__reset()}
              class="text-muted-foreground hover:text-primary focus-visible:outline-primary flex size-7 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-focus-within/subsection:opacity-100 group-hover/subsection:opacity-100 focus-visible:opacity-100 focus-visible:outline-2"
              onclick={() => {
                if (changed) {
                  edit(baseline ?? view)
                  if (!baseline?.record) onRemove?.()
                } else void remove(view)
              }}
            >
              <ResetIcon class="size-4" />
            </button>
          {/if}
        </div>
        {#if !readOnly && !editing}
          <Button
            type="button"
            text={m.accessibility_edit()}
            onClick={() => edit(view)}
          />
        {/if}
      </div>
      {#if view.record?.stale}
        <p role="status" class="text-sm text-amber-600">{m.accessibility_stale()}</p>
      {/if}
      {#if !readOnly && editing}
        <AccessibilityFields
          {uid}
          value={draft}
          disabled={busy}
          onChange={value => {
            draft = { ...draft, ...value }
          }}
        />
        <div class="flex flex-wrap gap-3">
          <Button
            type="button"
            text={m.accessibility_save()}
            disabled={busy}
            onClick={save}
          />
          <Button
            type="button"
            text={m.accessibility_cancel()}
            disabled={busy}
            onClick={() => {
              editing = false
              failed = false
            }}
          />
        </div>
        {#if failed}
          <p role="alert" class="text-destructive text-sm">
            {m.accessibility_save_failed()}
          </p>
        {/if}
      {:else}
        <dl class="grid gap-3 sm:grid-cols-2">
          {#each ACCESSIBILITY_FIELDS as field}
            <div>
              <dt class="text-muted-foreground text-sm">{labels[field]}</dt>
              <dd class="font-medium">
                {values[(view.record?.values ?? UNKNOWN_ACCESSIBILITY)[field]]}
              </dd>
            </div>
          {/each}
        </dl>
      {/if}
      {#if view.record}
        <p class="text-muted-foreground text-xs">
          {m.accessibility_updated()} {view.record.recordedAt.slice(0, 10)}
        </p>
      {/if}
      {#if saved}
        <p role="status" class="text-muted-foreground text-sm">
          {m.accessibility_saved()}
        </p>
      {/if}
      {#if view.venues.length}
        <div class="border-border space-y-4 border-t pt-4">
          <h3 class="font-semibold">{m.accessibility_venues_title()}</h3>
          <p class="text-muted-foreground text-sm">{m.accessibility_venues_help()}</p>
          {#each view.venues as venue (venue.locationId)}
            <div class="border-border space-y-2 rounded-lg border p-4">
              <a
                class="font-semibold underline"
                href={`/admin/locations/${venue.locationId}`}
                >{venue.names[
                  getLocaleKey() === 'zhHant'
                    ? 'zh-hant'
                    : getLocaleKey() === 'zhHans'
                      ? 'zh-hans'
                      : 'en'
                ] ||
                  venue.names.en ||
                  Object.values(venue.names)[0] ||
                  venue.locationId}</a
              >
              <dl class="grid gap-2 sm:grid-cols-2">
                {#each ACCESSIBILITY_FIELDS as field}
                  <div>
                    <dt class="text-muted-foreground text-xs">{labels[field]}</dt>
                    <dd class="text-sm">{values[venue.record.values[field]]}</dd>
                  </div>
                {/each}
              </dl>
              <p class="text-muted-foreground text-xs">
                {m.accessibility_updated()} {venue.record.recordedAt.slice(0, 10)}
              </p>
            </div>
          {/each}
        </div>
      {/if}
      {#if view.moreVenues}
        <p class="text-muted-foreground text-sm">{m.accessibility_more_venues()}</p>
      {/if}
    </section>
  {/if}
{:catch}
  <p role="alert" class="text-destructive text-sm">{m.accessibility_load_failed()}</p>
{/await}
