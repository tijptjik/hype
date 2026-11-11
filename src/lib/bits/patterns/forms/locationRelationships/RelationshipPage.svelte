<script lang="ts">
// I18N
import * as m from '#lib/paraglide/messages.js'
// BITS
import { Button } from '#lib/bits/core/button/index.js'
// API
import {
  getRelationshipPage,
  reorderAddresses,
} from '#lib/api/locationRelationships.remote.js'
// ICONS
import HistoryIcon from 'virtual:icons/lucide/history'
// TYPES
import type { Snippet } from 'svelte'
import type { RelationshipTable } from '#lib/db/services/locationRelationships.js'
let {
  locationId,
  organisationId,
  table,
  canEdit,
  saving,
  onSave,
  actions,
  editor,
}: {
  actions?: Snippet
  editor?: Snippet
  locationId: string
  organisationId: string | null
  table: RelationshipTable
  canEdit: boolean
  saving: boolean
  onSave: (row: Record<string, unknown>, suppress?: boolean) => Promise<void>
} = $props()
let history = $state(false)
let afterId = $state<string | undefined>()
let pages = $state<Record<string, unknown>[]>([])
let order = $state<string[]>([])
let busy = $state(false)
let failure = $state('')
const request = $derived(
  getRelationshipPage({ locationId, organisationId, table, history, afterId }),
)
const rows = $derived([...pages, ...(request.current?.rows ?? [])])
const currentAddresses = $derived(
  rows.filter(r => r.addressState === 'current' && r.assertionState === 'asserted'),
)
const ordered = $derived(
  order.length
    ? order
    : [...currentAddresses]
        .sort(
          (a, b) =>
            Number(a.priority ?? Infinity) - Number(b.priority ?? Infinity) ||
            String(a.id).localeCompare(String(b.id)),
        )
        .map(r => String(r.id)),
)
/** Reset traversal when switching between resolved assertions and immutable versions. */
function toggleHistory(): void {
  history = !history
  afterId = undefined
  pages = []
  order = []
}
/** Advance only after retaining the settled page. */
function more(): void {
  if (request.current?.nextCursor) {
    pages = rows
    afterId = request.current.nextCursor
  }
}
/** Adjust a draft; one save commits every address priority together. */
function move(index: number, offset: number): void {
  const next = [...ordered]
  const other = index + offset
  if (other < 0 || other >= next.length) return
  ;[next[index], next[other]] = [next[other], next[index]]
  order = next
}
/** Save exact immutable heads and reject stale or incomplete address lists. */
async function saveOrder(clear = false): Promise<void> {
  busy = true
  failure = ''
  try {
    const result = await reorderAddresses({
      locationId,
      organisationId,
      expectedIds: currentAddresses.map(r => String(r.id)),
      orderedIds: clear ? [] : ordered,
      operationId: crypto.randomUUID(),
    })
    if (result.status === 'conflict') failure = m.relationship_conflict()
    else {
      pages = []
      afterId = undefined
      order = []
      await request.refresh()
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : m.relationship_conflict()
  } finally {
    busy = false
  }
}
</script>
<section class="border-border/50 min-w-0 space-y-4 rounded-xl border p-5">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h4 class="text-sm font-medium">
      {table === 'locationMembership'
        ? 'Physical membership'
        : table === 'locationOccupancy'
          ? 'Operating periods'
          : 'Address choices'}
    </h4>
    <div class="flex items-center gap-2">
      {@render actions?.()}
      <Button
        size="sm"
        style={history ? 'soft' : 'ghost'}
        modifier="square"
        iconComponent={HistoryIcon}
        hideLabel
        hideLabelInstantly
        attrs={{
          'aria-pressed': history,
          'data-tooltip': history
            ? 'Show latest relationships'
            : 'Show version history',
        }}
        type="button"
        text={history ? m.relationship_current() : m.relationship_history()}
        onClick={toggleHistory}
      />
    </div>
  </div>
  <p class="text-muted-foreground max-w-3xl text-sm">
    {table === 'locationMembership'
      ? 'The physical complex this place belongs to, or the parts it contains.'
      : table === 'locationOccupancy'
        ? 'Where an establishment operates. Current, former and unconfirmed periods are kept separately.'
        : 'Addresses associated with this place. Rank current choices in Edit mode; an address is separate from the place’s identity.'}
  </p>
  {#if history}
    <p class="text-primary text-xs font-medium">
      Version history · includes superseded assertions
    </p>
  {/if}
  {@render editor?.()}
  {#if !request.ready}
    <div
      class="bg-muted h-16 animate-pulse rounded-md"
      role="status"
      aria-label={m.relationship_loading()}
    ></div>
  {/if}
  {#each rows as row (String(row.id))}
    <div
      class="bg-muted/20 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg p-4 text-sm"
    >
      {#if table !== 'locationAddress'}
        <span class="text-muted-foreground text-xs"
          >{table === 'locationMembership' ? 'Part of' : 'Operates in'}</span
        >
      {/if}
      {#each table === 'locationMembership'
        ? ['childLocationId', 'parentLocationId']
        : table === 'locationOccupancy'
          ? ['establishmentLocationId', 'containerLocationId']
          : ['locationId'] as endpoint, endpointIndex}
        {#if row[endpoint]}
          {#if endpointIndex > 0}
            <span aria-hidden="true" class="text-muted-foreground">→</span>
          {/if}
          <a
            class="min-w-0 font-medium break-words whitespace-normal hover:underline"
            href={`/admin/locations/${row[endpoint]}${organisationId ? `?organisation=${encodeURIComponent(organisationId)}` : ''}`}
            >{String(row[endpoint + 'Label'] ?? row[endpoint])}</a
          >
        {/if}
      {/each}
      <span class="text-muted-foreground"
        >{String(
          row.assertionState === 'suppressed'
            ? 'Suppressed in this scope'
            : (row.occupancyState ?? row.membershipState ?? row.addressState),
        )}</span
      >
      {#if row.effectiveFrom || row.effectiveTo}
        <span
          >{String(row.effectiveFrom ?? 'Unknown')}
          – {String(row.effectiveTo ?? 'Unknown')}</span
        >
      {/if}
      {#if table === 'locationAddress'}
        <span>{String(row.addressLabel || 'Canonical address')}</span>
        <span>{row.priority === null ? 'Unranked' : `Priority ${row.priority}`}</span>
      {/if}
      {#if canEdit && !history && row.assertionState !== 'suppressed'}
        {#if table !== 'locationAddress' &&
          (row.occupancyState ?? row.membershipState) !== 'former'}
          <Button
            text="Mark former"
            size="sm"
            style="ghost"
            disabled={saving}
            onClick={() =>
              onSave({
                ...row,
                [table === 'locationOccupancy' ? 'occupancyState' : 'membershipState']:
                  'former',
              })}
          />
        {/if}
        <Button
          text="Suppress in this scope"
          size="sm"
          style="ghost"
          disabled={saving}
          onClick={() => onSave(row, true)}
        />
      {/if}
    </div>
  {:else}
    {#if request.ready}
      <p class="text-muted-foreground bg-muted/20 rounded-lg px-4 py-6 text-sm">
        {m.relationship_empty()}
      </p>
    {/if}
  {/each}

  {#if request.current?.nextCursor}
    <Button type="button" text={m.relationship_more()} onClick={more} disabled={busy} />
  {/if}
  {#if table === 'locationAddress' &&
    canEdit &&
    !history &&
    request.ready &&
    !request.current?.nextCursor &&
    currentAddresses.length > 0 &&
    currentAddresses.length <= 100}
    <ol class="space-y-2">
      {#each ordered as id, index}
        <li class="flex items-center gap-2 text-sm">
          <span
            >{index + 1}.
            {String(rows.find(r => r.id === id)?.addressLabel ?? id)}</span
          >
          <Button
            type="button"
            text={m.relationship_up()}
            disabled={busy || index === 0}
            onClick={() => move(index, -1)}
          />
          <Button
            type="button"
            text={m.relationship_down()}
            disabled={busy || index === ordered.length - 1}
            onClick={() => move(index, 1)}
          />
        </li>
      {/each}
    </ol>
    <div class="flex flex-wrap gap-2">
      <Button
        type="button"
        text={m.relationship_order()}
        disabled={busy || saving}
        onClick={() => saveOrder()}
      />
      <Button
        type="button"
        text={m.relationship_clear_order()}
        disabled={busy || saving}
        onClick={() => saveOrder(true)}
      />
    </div>
  {/if}
  {#if failure}
    <p role="alert" class="text-destructive text-sm">{failure}</p>
  {/if}
</section>
