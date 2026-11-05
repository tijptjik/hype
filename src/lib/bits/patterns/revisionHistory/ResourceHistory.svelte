<script lang="ts">
// SVELTE
import { onMount, untrack } from 'svelte'
// THIRD-PARTY
import { formatDistanceStrict } from 'date-fns'
// PRESENTATION
import { historyStyles as styles } from './organisationHistory.styles'
import { groupChanges } from './presentation'
// COMPONENTS
import HistoryValue from './components/HistoryValue.svelte'
// BITS COMPONENTS
import Avatar from '#lib/bits/core/avatar/Avatar.svelte'
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
import Header from '#lib/bits/custom/header/Header.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
// ICONS
import HistoryIcon from 'virtual:icons/proicons/history'
import ProfileIcon from 'virtual:icons/proicons/person-multiple'
import FieldsIcon from 'virtual:icons/proicons/text'
import ChevronIcon from 'virtual:icons/proicons/chevron-down'
// TYPES
import type { OrganisationHistoryPage } from '#lib/db/services/resourceHistory.js'

let {
  resourceId,
  resourceLabel,
  loadPage,
  showFields = false,
}: {
  resourceId: string
  resourceLabel: string
  loadPage: (
    before?: number,
    kind?: 'profile' | 'fields',
  ) => Promise<OrganisationHistoryPage>
  showFields?: boolean
} = $props()
let historyKind = $state<'profile' | 'fields'>('profile')
let entries = $state<OrganisationHistoryPage['entries']>([])
let available = $state(true)
let recordingEnabled = $state<boolean | undefined>()
let nextCursor = $state<number | null>(null)
let loading = $state(true)
let failed = $state(false)
let retryCursor = $state<number | undefined>()
let generation = 0
let expanded = $state<Record<string, boolean>>({})
let now = $state(new Date())
const allExpanded = $derived(
  entries.filter(entry => !entry.initial).every(entry => expanded[entry.id]),
)

onMount(() => {
  now = new Date()
  const timer = setInterval(() => {
    now = new Date()
  }, 30_000)
  return () => clearInterval(timer)
})

/** Formats the age while the mounted viewer keeps its clock current.
 * @param value Recorded timestamp.
 * @returns Relative timestamp; exact time remains available on hover.
 */
function relative(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? formatDistanceStrict(date, now, { addSuffix: true })
    : 'Unknown time'
}

/** Describes the interval from the actual predecessor, including across page boundaries.
 * @param entry Recorded revision.
 * @returns Elapsed time, or no invented interval when evidence is unavailable.
 */
function interval(entry: OrganisationHistoryPage['entries'][number]): string | null {
  if (!entry.previousCreatedAt) return null
  const previous = new Date(entry.previousCreatedAt),
    current = new Date(entry.createdAt)
  if (
    !Number.isFinite(previous.getTime()) ||
    !Number.isFinite(current.getTime()) ||
    current < previous
  )
    return null
  return current.getTime() === previous.getTime()
    ? 'Recorded together'
    : `${formatDistanceStrict(previous, current)} since previous version`
}

/**
 * Loads fresh authorized history, ignoring responses after navigation or unmount.
 * @param before Optional continuation cursor.
 * @returns Completion of the current request.
 */
async function load(before?: number): Promise<void> {
  const request = ++generation
  loading = true
  failed = false
  retryCursor = before
  try {
    const result = await loadPage(before, historyKind)
    if (request !== generation) return
    entries = before ? [...entries, ...result.entries] : result.entries
    if (!before && result.entries[0]) expanded = { [result.entries[0].id]: true }
    available = result.available
    recordingEnabled = result.recordingEnabled
    nextCursor = result.nextCursor
  } catch {
    if (request === generation) {
      // A scope change may revoke access; do not retain previously visible evidence.
      entries = []
      nextCursor = null
      failed = true
      retryCursor = undefined
    }
  } finally {
    if (request === generation) loading = false
  }
}

/** Toggles a changeset from its surface without intercepting nested controls or text selection.
 * @param event Pointer click bubbling from the changeset.
 * @param entry Revision whose comparison can be expanded.
 * @returns Nothing; initial captures and independent interactive elements are unchanged.
 */
function toggleHistoryBlock(
  event: MouseEvent,
  entry: OrganisationHistoryPage['entries'][number],
): void {
  if (entry.initial || event.defaultPrevented) return
  if (
    event.target instanceof Element &&
    event.target.closest(
      'a, button, input, textarea, select, summary, [contenteditable="true"]',
    )
  )
    return
  if (window.getSelection()?.isCollapsed === false) return
  expanded[entry.id] = !expanded[entry.id]
}

$effect(() => {
  resourceId
  historyKind
  untrack(() => {
    entries = []
    nextCursor = null
    available = true
    recordingEnabled = undefined
    void load()
  })
  return () => {
    generation++
  }
})
</script>

<section
  class="w-full min-w-0 pb-24"
  aria-label={`${resourceLabel[0].toUpperCase()}${resourceLabel.slice(1)} history`}
  aria-busy={loading}
>
  <!-- Use the same surface-owned heading treatment as Descriptions and Fields. -->
  <FormSurface class="mb-0!">
    <SectionHeader>
      {#snippet left()}
        <Header
          text="History"
          description={`Changes to this ${resourceLabel} · newest first`}
          icon={HistoryIcon}
          size="sm"
          class="bits-form__section-header-heading w-auto! min-w-0"
        />
      {/snippet}
    </SectionHeader>
  </FormSurface>
  <SectionHeader
    class="border-border/50 bg-primary/3 h-auto! min-h-12! gap-y-1 border-y px-5 max-sm:grid-cols-1! [&_.bits-form\_\_section-header-left]:overflow-visible! [&_.bits-form\_\_section-header-right]:[container-type:normal]! max-sm:[&_.bits-form\_\_section-header-right]:justify-end"
    isCollapsableCollapsed={!allExpanded}
    onCollapsableToggle={entries.some(entry => !entry.initial)
      ? collapsed => {
          expanded = Object.fromEntries(entries.map(entry => [entry.id, !collapsed]))
        }
      : undefined}
  >
    {#snippet left()}
      <fieldset
        class="grid w-full min-w-0 grid-cols-2 items-stretch gap-x-4 sm:flex sm:w-auto"
        aria-label="History category"
      >
        <button
          type="button"
          class={styles.tab}
          aria-pressed={historyKind === 'profile'}
          onclick={() => {
            historyKind = 'profile'
          }}
        >
          <ProfileIcon class="size-4 shrink-0" aria-hidden="true" />
          <span class="min-w-0 whitespace-normal">Profile and settings</span>
        </button>
        {#if showFields}
          <button
            type="button"
            class={styles.tab}
            aria-pressed={historyKind === 'fields'}
            onclick={() => {
              historyKind = 'fields'
            }}
          >
            <FieldsIcon class="size-4 shrink-0" aria-hidden="true" />
            <span class="min-w-0 whitespace-normal">Field definitions</span>
          </button>
        {/if}
      </fieldset>
    {/snippet}
  </SectionHeader>
  {#if !failed && available && recordingEnabled === false}
    <p class={styles.notice}>
      Showing stored history. New edits are not being recorded yet.
    </p>
  {/if}
  {#if failed}
    <div class={styles.notice} role="alert">
      <p>History could not be loaded. Your access may have changed.</p>
      <button
        type="button"
        class={styles.button}
        onclick={() => void load(retryCursor)}
      >
        Try again
      </button>
    </div>
  {:else if !available}
    <p class={styles.notice}>History tracking is not yet enabled.</p>
  {:else if !loading && entries.length === 0}
    <p class={styles.notice}>
      No recorded changes yet. Earlier edits are not available.
    </p>
  {/if}
  <ol class="px-6">
    {#each entries as entry, index (entry.id)}
      {@const groups = groupChanges(entry.changes, entry.fieldLabels)}
      <li class="relative min-w-0 pl-6 sm:pl-8">
        <!-- Connect revision markers through comparisons and elapsed-time rows. -->
        {#if index < entries.length - 1 || nextCursor !== null}
          <span
            aria-hidden="true"
            class="border-primary/60 pointer-events-none absolute top-[1.625rem] left-[3.5px] border-l-2"
            style:bottom={index < entries.length - 1 ? '-1.625rem' : '0'}
          ></span>
        {/if}
        <span
          aria-hidden="true"
          class={`absolute top-[1.375rem] left-0 z-10 size-[9px] rounded-full ${index === 0 ? 'bg-primary' : 'border-primary/50 border-2 bg-[var(--form-workspace,var(--color-panel))]'}`}
        ></span>
        <!-- The disclosure button provides keyboard access; the surface adds pointer convenience. -->
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
        <!-- biome-ignore lint/a11y/useKeyWithClickEvents: The sibling disclosure button supplies keyboard access; links and tree controls retain their own semantics. -->
        <article
          class="border-border/50 min-w-0 border-t"
          class:cursor-pointer={!entry.initial}
          onclick={event => toggleHistoryBlock(event, entry)}
        >
          {#snippet metadata()}
            <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <time
                class="text-foreground text-base font-medium"
                datetime={entry.createdAt}
                title={new Date(entry.createdAt).toLocaleString()}
                >{relative(entry.createdAt)}</time
              >
              {#if index === 0}
                <span class="text-primary text-xs">Latest</span>
              {/if}
              {#if entry.origin === 'user' && entry.actor}
                {@const actor = entry.actor}
                {#snippet identity()}
                  <span aria-hidden="true">
                    <Avatar
                      name={actor.name || actor.username}
                      src={actor.image}
                      class="size-6!"
                    />
                  </span>
                  <span class="min-w-0 [overflow-wrap:anywhere] whitespace-normal">
                    {actor.username
                      ? `@${actor.displayUsername || actor.username}`
                      : actor.name || 'User unavailable'}
                  </span>
                {/snippet}
                {#if actor.username}
                  <a
                    href={`/admin/users/${encodeURIComponent(actor.username)}`}
                    class="text-muted-foreground hover:text-primary focus-visible:outline-primary inline-flex max-w-full min-w-0 items-center gap-2 rounded-sm text-xs hover:underline focus-visible:outline-2"
                    >{@render identity()}</a
                  >
                {:else}
                  <span
                    class="text-muted-foreground inline-flex max-w-full min-w-0 items-center gap-2 text-xs"
                    >{@render identity()}</span
                  >
                {/if}
              {:else}
                <span class="text-muted-foreground text-xs" title={entry.actorId}>
                  {entry.origin === 'migration'
                    ? 'Author unknown'
                    : entry.origin === 'system'
                      ? 'System'
                      : 'User unavailable'}
                </span>
              {/if}
            </div>
            {#if entry.reason || entry.initial}
              <p class="text-muted-foreground mt-1 min-w-0 text-sm break-words">
                {entry.reason ?? 'Initial recorded state'}
              </p>
            {/if}
          {/snippet}
          {#if entry.initial}
            <div class="py-4">
              {@render metadata()}
              <p class="text-muted-foreground mt-2 text-xs">
                No earlier comparison is available.
              </p>
            </div>
          {:else}
            <!-- Keep profile navigation independent of the comparison disclosure. -->
            <div class="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2 py-4">
              <div class="min-w-0 flex-1 basis-56">{@render metadata()}</div>
              <button
                type="button"
                class={styles.disclosure}
                aria-expanded={!!expanded[entry.id]}
                aria-controls={`changes-${entry.id}`}
                onclick={() => {
                  expanded[entry.id] = !expanded[entry.id]
                }}
              >
                <span class="text-muted-foreground shrink-0 text-xs tabular-nums"
                  >{entry.changes.length}
                  changed {entry.changes.length === 1 ? 'field' : 'fields'}</span
                >
                <ChevronIcon
                  aria-hidden="true"
                  class={`text-muted-foreground size-4 shrink-0 transition-transform ${expanded[entry.id] ? '' : '-rotate-90'}`}
                />
              </button>
            </div>
            {#if !expanded[entry.id]}
              <p class="text-muted-foreground -mt-1 pb-4 text-xs">
                {groups.map(group => group.label).join(' · ')}
              </p>
            {/if}
            <div id={`changes-${entry.id}`} hidden={!expanded[entry.id]} class="pb-2">
              <div class={styles.columns} aria-hidden="true">
                <span class="hidden sm:block">Field</span
                ><span class="hidden sm:block">Before</span
                ><span class="text-primary hidden sm:block">After</span>
                <span class="sm:hidden">Before → After</span>
              </div>
              {#each groups as group (group.key)}
                <section aria-label={group.label}>
                  <h4
                    class="border-border/40 bg-primary/3 text-muted-foreground border-b px-3 py-2 text-xs font-medium"
                  >
                    {group.label}
                  </h4>
                  <dl class="divide-border/30 divide-y">
                    {#each group.fields as field}
                      <div class={styles.row}>
                        <dt
                          class="min-w-0 py-2 text-sm font-medium break-words sm:py-3"
                          title={field.change.path.join(' › ')}
                        >
                          <span class="mb-1 block text-sm font-medium"
                            >{field.operation}</span
                          >
                          {#if field.label}
                            <code
                              class="border-border/50 bg-primary/5 text-foreground inline-block max-w-full rounded-md border px-2 py-1 font-mono text-xs leading-5 font-normal [overflow-wrap:anywhere] whitespace-normal"
                              >{field.label}</code
                            >
                          {/if}
                        </dt>
                        <dd class={styles.before}>
                          <span class="sr-only">Before: </span>
                          <span
                            aria-hidden="true"
                            class="text-muted-foreground w-3 shrink-0 font-mono sm:hidden"
                            >−</span
                          >
                          <HistoryValue slot={field.change.before} />
                        </dd>
                        <dd class={styles.after}>
                          <span class="sr-only">After: </span>
                          <span
                            aria-hidden="true"
                            class="text-primary w-3 shrink-0 font-mono sm:hidden"
                            >+</span
                          >
                          <HistoryValue slot={field.change.after} />
                        </dd>
                      </div>
                    {/each}
                  </dl>
                </section>
              {/each}
            </div>
          {/if}
          {#if !entry.initial && interval(entry)}
            <p class="text-muted-foreground py-4 text-xs">{interval(entry)}</p>
          {/if}
        </article>
      </li>
    {/each}
  </ol>
  {#if loading}
    <p role="status" class="text-muted-foreground px-6 py-4 text-sm">
      Loading history…
    </p>
  {/if}
  {#if nextCursor !== null && !failed}
    <div class="px-6 py-3">
      <button
        type="button"
        class={styles.button}
        disabled={loading}
        onclick={() => void load(nextCursor ?? undefined)}
      >
        Older changes
      </button>
    </div>
  {/if}
  {#if entries.length}
    <p class="border-border/40 text-muted-foreground mx-6 border-t pt-4 text-xs">
      Read-only history · Staff role assignments are not included.
    </p>
  {/if}
</section>
