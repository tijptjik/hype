<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// THIRD-PARTY
import { formatDistanceStrict } from 'date-fns'
// COMPONENTS
import ChangelogActor from './components/ChangelogActor.svelte'
import HistoryTimestamp from './components/HistoryTimestamp.svelte'
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
// PRESENTATION
import { historyStyles as styles } from './organisationHistory.styles'
import {
  featureReviewLabel,
  featureReviewValue,
} from '#lib/revisions/featureReviewDisplay.js'
// ICONS
import ChevronIcon from 'virtual:icons/proicons/chevron-down'
// TYPES
import type { FeatureRevisionWorkspace } from '#lib/db/services/featureRevisionWorkspace.js'
import type { RevisionDifference } from '#lib/revisions/diff.js'

type Entry = FeatureRevisionWorkspace['history'][number]
type Review = {
  changes: RevisionDifference[]
  redacted: boolean
  baseline?: boolean
  unpublished?: boolean
}
let {
  entries,
  canReview,
  loadReview,
  label = 'Publication history',
  privateHistory = false,
}: {
  entries: Entry[]
  canReview: boolean
  loadReview: (entry: Entry) => Promise<Review>
  label?: string
  privateHistory?: boolean
} = $props()
let expanded = $state<Record<number, boolean>>({})
let reviews = $state<Record<number, Review>>({})
let loading = $state<Record<number, boolean>>({})
let failed = $state<Record<number, boolean>>({})
let now = $state(new Date())
onMount(() => {
  const timer = setInterval(() => {
    now = new Date()
  }, 30_000)
  return () => clearInterval(timer)
})

/** Loads only authorized comparisons when a revision is opened.
 * @param entry Recorded publication to inspect.
 * @returns Completion of the read-only request, with failures retained on the card.
 */
async function inspect(entry: Entry): Promise<void> {
  if (!canReview || loading[entry.generation]) return
  loading[entry.generation] = true
  failed[entry.generation] = false
  try {
    reviews[entry.generation] = await loadReview(entry)
  } catch {
    failed[entry.generation] = true
  } finally {
    loading[entry.generation] = false
  }
}

/** Opens or closes a comparison without changing published content.
 * @param entry Revision selected by the disclosure control.
 * @returns Nothing; the first expansion fetches its authorized comparison.
 */
function toggle(entry: Entry): void {
  expanded[entry.generation] = !expanded[entry.generation]
  if (expanded[entry.generation] && !reviews[entry.generation]) void inspect(entry)
}

/** Toggles the card surface without intercepting independent controls or text selection.
 * @param event Click bubbling from the revision card.
 * @param entry Revision whose comparison should toggle.
 * @returns Nothing; unauthorized rows and interactive descendants retain their behavior.
 */
function toggleSurface(event: MouseEvent, entry: Entry): void {
  if (!canReview || event.defaultPrevented) return
  if (
    event.target instanceof Element &&
    event.target.closest(
      'a, button, input, textarea, select, summary, [contenteditable="true"]',
    )
  )
    return
  if (window.getSelection()?.isCollapsed === false) return
  toggle(entry)
}

/** Formats valid recorded timestamps with a safe fallback.
 * @param value Stored timestamp.
 * @returns Relative age for the metadata row.
 */
function relative(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? formatDistanceStrict(date, now, { addSuffix: true })
    : 'Unknown time'
}
</script>

<section class="@container w-full min-w-0" aria-label={label}>
  <SectionHeader
    class="border-border/50 bg-primary/3 h-auto! min-h-12! border-y px-5"
    isCollapsableCollapsed={!entries.length ||
      !entries.every(entry => expanded[entry.generation])}
    onCollapsableToggle={canReview && entries.length
      ? collapsed => {
          for (const entry of entries) {
            expanded[entry.generation] = !collapsed
            if (!collapsed && !reviews[entry.generation]) void inspect(entry)
          }
        }
      : undefined}
  >
    {#snippet left()}
      <h3 class="text-sm font-medium">{label} · newest first</h3>
    {/snippet}
  </SectionHeader>
  {#if !entries.length}
    <p class={styles.notice}>
      No recorded changes yet. Earlier edits are not available.
    </p>
  {/if}
  <ol class="px-3 py-5 @[36rem]:px-5">
    {#each entries as entry, index (entry.generation)}
      {@const review = reviews[entry.generation]}
      <li class="relative min-w-0 pb-5 pl-5 last:pb-0 @[36rem]:pl-7">
        {#if index < entries.length - 1}
          <span
            aria-hidden="true"
            class="border-primary/25 pointer-events-none absolute top-6 -bottom-6 left-[3.5px] border-l"
          ></span>
        {/if}
        <span
          aria-hidden="true"
          class={`absolute top-6 left-0 z-10 size-[9px] rounded-full ${index === 0 ? 'bg-primary' : 'border-primary/50 border-2 bg-[var(--form-workspace,var(--color-panel))]'}`}
        ></span>
        <!-- The disclosure button provides keyboard access; the surface adds pointer convenience. -->
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
        <!-- biome-ignore lint/a11y/useKeyWithClickEvents: The disclosure button supplies keyboard access; nested controls retain their semantics. -->
        <article
          class={styles.entry}
          class:cursor-pointer={canReview}
          onclick={event => toggleSurface(event, entry)}
        >
          <header
            class="bg-primary/3 flex min-w-0 flex-wrap items-start gap-x-8 gap-y-3 p-4"
          >
            <div class="max-w-[min(100%,480px)] min-w-0 flex-none">
              <div class="mb-1 flex flex-wrap items-center gap-2 text-xs">
                <span class="text-muted-foreground"
                  >{privateHistory
                    ? 'Recorded while unpublished'
                    : entry.revisionId
                      ? 'Published'
                      : 'Unpublished'}</span
                >
                {#if index === 0}
                  <span class="text-primary font-medium">Latest</span>
                {/if}
              </div>
              <h4
                class="text-foreground text-sm leading-relaxed font-medium break-words"
              >
                {entry.reason ??
                  (privateHistory
                    ? 'Approved maintenance'
                    : entry.revisionId
                      ? 'Feature published'
                      : 'Feature unpublished')}
              </h4>
            </div>
            <dl class={styles.metadata}>
              <div class="min-w-0 space-y-1">
                <dt class={styles.label}>Changed</dt>
                <dd>
                  <HistoryTimestamp
                    class="text-foreground text-sm"
                    value={entry.createdAt}
                    exact={new Date(entry.createdAt).toLocaleString()}
                    label={relative(entry.createdAt)}
                  />
                </dd>
              </div>
              <div class="max-w-full min-w-0 space-y-1">
                <dt class={styles.label}>Actor</dt>
                <dd class="min-w-0">
                  <ChangelogActor
                    prominent
                    entry={{
                      ...entry,
                      actorName: null,
                      actorUsername: null,
                      actorDisplayUsername: null,
                    }}
                  />
                </dd>
              </div>
              <div class="min-w-0 space-y-1">
                <dt class={styles.label}>Source</dt>
                <dd class="text-foreground text-sm break-words capitalize">
                  {entry.origin}
                </dd>
              </div>
            </dl>
            {#if canReview}
              <button
                type="button"
                class={styles.disclosure}
                aria-expanded={!!expanded[entry.generation]}
                aria-controls={`feature-changes-${entry.generation}`}
                onclick={() => toggle(entry)}
              >
                <span class="text-xs tabular-nums"
                  >{review
                    ? `${review.changes.length} changed ${review.changes.length === 1 ? 'field' : 'fields'}`
                    : 'View changes'}</span
                >
                <ChevronIcon
                  aria-hidden="true"
                  class={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${expanded[entry.generation] ? '' : '-rotate-90'}`}
                />
              </button>
            {/if}
          </header>
          {#if canReview && expanded[entry.generation]}
            <div
              id={`feature-changes-${entry.generation}`}
              class="border-border/50 bg-muted/10 grid min-w-0 gap-5 border-t p-4"
              aria-busy={!!loading[entry.generation]}
            >
              {#if loading[entry.generation]}
                <p class="text-muted-foreground text-sm" role="status">
                  Loading changes…
                </p>
              {/if}
              {#if failed[entry.generation]}
                <div role="alert" class="text-sm">
                  <p>Changes could not be loaded. Your access may have changed.</p>
                  <button
                    type="button"
                    class={styles.button}
                    onclick={() => void inspect(entry)}
                  >
                    Try again
                  </button>
                </div>
              {/if}
              {#if review}
                {#if review.baseline}
                  <p class="text-muted-foreground text-sm">
                    Starting record. Earlier changes were not recorded.
                  </p>
                {/if}
                {#if review.unpublished}
                  <p class="text-muted-foreground text-sm">
                    Publication was stopped; the previous content is retained.
                  </p>
                {/if}
                {#each review.changes as change}
                  <section
                    class={styles.comparison}
                    aria-label={featureReviewLabel(change.path)}
                  >
                    <dl class={styles.fieldHeading}>
                      <div class="min-w-0 space-y-1">
                        <dt class={styles.label}>Field</dt>
                        <dd class="text-sm font-medium break-words">
                          {featureReviewLabel(change.path)}
                        </dd>
                      </div>
                      <div class="min-w-0 space-y-1">
                        <dt class={styles.label}>Action</dt>
                        <dd class="text-sm font-medium">
                          {!change.before.present
                            ? 'Added'
                            : !change.after.present
                              ? 'Removed'
                              : 'Updated'}
                        </dd>
                      </div>
                    </dl>
                    <dl class={styles.values}>
                      {#each ['before', 'after'] as side}
                        {@const key = side as 'before' | 'after'}
                        <div class={key === 'before' ? styles.before : styles.after}>
                          <dt class={styles.label}>
                            {key === 'before' ? 'Before' : 'After'}
                          </dt>
                          <dd class="min-w-0 text-sm break-words whitespace-pre-wrap">
                            {featureReviewValue(change, key)}
                          </dd>
                        </div>
                      {/each}
                    </dl>
                  </section>
                {/each}
                {#if !review.changes.length &&
                  !review.baseline &&
                  !review.unpublished &&
                  !review.redacted}
                  <p class="text-muted-foreground text-sm">
                    No changed fields in this record.
                  </p>
                {/if}
                {#if review.redacted}
                  <p class="text-muted-foreground text-sm">
                    Some changes are restricted by your current field permissions.
                  </p>
                {/if}
              {/if}
            </div>
          {/if}
        </article>
      </li>
    {/each}
  </ol>
</section>
