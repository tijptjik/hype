<script lang="ts">
// I18N
import * as m from '#lib/paraglide/messages.js'
// BITS
import { Button } from '#lib/bits/core/button/index.js'
// API
import {
  getLocationLineage,
  saveLocationTransition,
} from '#lib/api/locationRelationships.remote.js'
let {
  locationId,
  organisationId,
  canEdit = false,
}: { locationId: string; organisationId: string | null; canEdit?: boolean } = $props()
let type = $state<'replacement' | 'merge' | 'split' | 'reconfiguration'>('replacement')
let before = $state('')
let after = $state('')
let sourceUrl = $state('')
let description = $state('')
let busy = $state(false)
let failure = $state('')
/** Append an evidenced real-world event; identity deduplication uses its separate impact review. */
async function record(): Promise<void> {
  busy = true
  failure = ''
  try {
    const id = crypto.randomUUID()
    await saveLocationTransition({
      id,
      relationshipId: id,
      previousRevisionId: null,
      scopeOrganisationId: organisationId,
      assertionState: 'asserted',
      type,
      basis: 'real_world',
      before: (before || locationId)
        .split(',')
        .map(v => v.trim())
        .filter(Boolean),
      after: after
        .split(',')
        .map(v => v.trim())
        .filter(Boolean),
      observedAt: new Date().toISOString(),
      verifiedAt: null,
      effectiveFrom: null,
      effectiveTo: null,
      evidence: [
        {
          source: { kind: 'url', url: sourceUrl, accessedAt: new Date().toISOString() },
          supports: ['before', 'after'],
          quotedText: null,
          description,
          sourceDate: null,
        },
      ],
    })
    pages = []
    afterId = undefined
    await request.refresh()
    before = ''
    after = ''
    sourceUrl = ''
    description = ''
  } catch (error) {
    failure = error instanceof Error ? error.message : m.relationship_conflict()
  } finally {
    busy = false
  }
}
let history = $state(false)
let afterId = $state<string | undefined>()
let pages = $state<
  (Record<string, unknown> & { participants: { locationId: string; side: string }[] })[]
>([])
const request = $derived(
  getLocationLineage({ locationId, organisationId, history, afterId }),
)
const rows = $derived([...pages, ...(request.current?.rows ?? [])])
/** Retain the settled page before advancing the cursor. */
function more(): void {
  if (request.current?.nextCursor) {
    pages = rows
    afterId = request.current.nextCursor
  }
}
/** Reset the immutable cursor when changing the view. */
function toggle(): void {
  history = !history
  pages = []
  afterId = undefined
}
</script>
<section class="border-border space-y-3 border-t pt-4">
  <h4 class="font-medium">{m.relationship_lineage()}</h4>
  <p class="text-muted-foreground text-sm">{m.relationship_lineage_hint()}</p>
  <Button
    type="button"
    text={history ? m.relationship_current() : m.relationship_history()}
    onClick={toggle}
  />
  {#if !request.ready}
    <div
      class="bg-muted h-16 animate-pulse rounded"
      role="status"
      aria-label={m.relationship_loading()}
    ></div>
  {/if}
  {#each rows as row (String(row.id))}
    <article class="border-border space-y-2 rounded border p-3 text-sm">
      <p>
        {String(row.type)}
        · {String(row.basis)} · {String(row.effectiveFrom ?? '')}
      </p>
      {#each row.participants as participant}
        <a
          class="mr-3 underline"
          href={'/admin/locations/' +
            participant.locationId +
            (organisationId
              ? '?organisation=' + encodeURIComponent(organisationId)
              : '')}
          >{participant.side}: {participant.locationId}</a
        >
      {/each}
    </article>
  {:else}
    <p class="text-muted-foreground text-sm">{m.relationship_empty()}</p>
  {/each}
  {#if request.current?.nextCursor}
    <Button type="button" text={m.relationship_more()} onClick={more} />
  {/if}
  {#if canEdit}
    <details class="space-y-3">
      <summary class="cursor-pointer text-sm font-medium">{m.lineage_record()}</summary>
      <p class="text-muted-foreground text-sm">{m.lineage_id_hint()}</p>
      <label class="block text-sm"
        >{m.lineage_type()}
        <select
          class="border-border bg-background rounded border p-2"
          bind:value={type}
        >
          <option value="replacement">{m.lineage_replacement()}</option>
          <option value="merge">{m.lineage_merge()}</option>
          <option value="split">{m.lineage_split()}</option>
          <option value="reconfiguration">{m.lineage_reconfiguration()}</option>
        </select></label
      >
      <label class="block text-sm"
        >{m.lineage_before()}<input
          class="border-border bg-background mt-1 w-full rounded border p-2"
          bind:value={before}
          placeholder={locationId}
        ></label
      >
      <label class="block text-sm"
        >{m.lineage_after()}<input
          class="border-border bg-background mt-1 w-full rounded border p-2"
          bind:value={after}
        ></label
      >
      <label class="block text-sm"
        >{m.lineage_source()}<input
          class="border-border bg-background mt-1 w-full rounded border p-2"
          type="url"
          bind:value={sourceUrl}
        ></label
      >
      <label class="block text-sm"
        >{m.lineage_description()}<textarea
          class="border-border bg-background mt-1 w-full rounded border p-2"
          bind:value={description}
        ></textarea></label
      >
      <Button
        type="button"
        text={m.lineage_record()}
        disabled={busy || !after.trim() || !sourceUrl || !description.trim()}
        onClick={record}
      />
    </details>
  {/if}
  {#if failure}
    <p role="alert" class="text-destructive text-sm">{failure}</p>
  {/if}
</section>
