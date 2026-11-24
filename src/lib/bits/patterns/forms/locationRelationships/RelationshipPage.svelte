<script lang="ts">
// THIRD-PARTY
import { draggable, droppable, dndState, type DragDropState } from '@thisux/sveltednd'
// SERVICES
import { getDropIndex } from '#lib/client/services/dragDrop.js'
// ADDRESS
import { compareStreetNumbers } from '#lib/addresses/streetNumber.js'
// COMPONENTS
import { ResourceCard } from '#lib/bits/patterns/cards/resourceCard/index.js'
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
  onAddressChanged,
  actions,
  showOperatingHosts = false,
  editor,
}: {
  showOperatingHosts?: boolean
  onAddressChanged?: () => Promise<void>
  actions?: Snippet
  editor?: Snippet
  locationId: string
  organisationId: string | null
  table: RelationshipTable
  canEdit: boolean
  saving: boolean
  onSave: (row: Record<string, unknown>, suppress?: boolean) => Promise<void>
} = $props()
const instanceId = $props.id()
const container = `location-addresses-${instanceId}`
let history = $state(false)
let afterId = $state<string | undefined>()
let pages = $state<Record<string, unknown>[]>([])
let order = $state<string[]>([])
let busy = $state(false)
let failure = $state('')
const request = $derived(
  getRelationshipPage({ locationId, organisationId, table, history, afterId }),
)
// Establishments occupy hosts; their hosts own the physical membership records.
const hostRequest = $derived(
  table === 'locationMembership' && showOperatingHosts
    ? getRelationshipPage({
        locationId,
        organisationId,
        table: 'locationOccupancy',
        history: false,
      })
    : null,
)
const rows = $derived([...pages, ...(request.current?.rows ?? [])])
const currentAddresses = $derived(
  rows.filter(r => r.addressState === 'current' && r.assertionState === 'asserted'),
)
const canOrder = $derived(
  table === 'locationAddress' &&
    canEdit &&
    !history &&
    request.ready &&
    !request.current?.nextCursor &&
    currentAddresses.length > 0 &&
    currentAddresses.length <= 100,
)
// Current addresses are rendered once, as draggable resource rows while ordering is available.
const displayRows = $derived(
  (canOrder ? rows.filter(row => !currentAddresses.includes(row)) : rows).filter(
    row =>
      history || table !== 'locationMembership' || row.assertionState !== 'suppressed',
  ),
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
/** Reorder addresses using the same insertion-edge handling as Project layer rows.
 * @param state Current Svelte DND state.
 * @param targetId Address receiving the drop.
 * @returns Nothing; priorities are persisted together by Save address order.
 */
function handleDrop(state: DragDropState, targetId: string): void {
  if (busy || saving) return
  const destination = getDropIndex(state, ordered, targetId, container)
  if (destination === null) return
  const dragged = state.draggedItem
  if (
    !dragged ||
    typeof dragged !== 'object' ||
    !('id' in dragged) ||
    typeof dragged.id !== 'string'
  )
    return
  const next = [...ordered]
  const [item] = next.splice(next.indexOf(dragged.id), 1)
  next.splice(destination, 0, item)
  order = next
}
/** Sort the draft list, keeping the editor's current order for equal street numbers.
 * @returns Nothing. Save address order persists the draft.
 */
function sortByStreetNumber(): void {
  const numbers = new Map(
    currentAddresses.map(row => [String(row.id), String(row.streetNumber ?? '')]),
  )
  order = [...ordered].sort((a, b) =>
    compareStreetNumbers(numbers.get(a) ?? '', numbers.get(b) ?? ''),
  )
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
      await onAddressChanged?.()
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
  {#each displayRows as row (String(row.id))}
    <div
      class="bg-muted/20 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg p-4 text-sm"
    >
      {#if table !== 'locationAddress'}
        <span class="text-muted-foreground text-xs"
          >{table === 'locationMembership'
            ? row.parentLocationId === locationId
              ? 'Contains'
              : 'Part of'
            : 'Operates in'}</span
        >
      {/if}
      {#each table === 'locationMembership'
        ? [row.parentLocationId === locationId ? 'childLocationId' : 'parentLocationId']
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
          text={table === 'locationMembership'
            ? row.parentLocationId === locationId
              ? 'Remove constituent'
              : 'Remove from building'
            : organisationId
              ? 'Hide for this organisation'
              : 'Withdraw shared relationship'}
          attrs={{
            'data-tooltip':
              table === 'locationMembership'
                ? organisationId
                  ? 'Remove this incorrect membership for this organisation. Both Locations and the recorded history are retained.'
                  : 'Withdraw this incorrect shared membership. Both Locations and the recorded history are retained.'
                : organisationId
                  ? 'Exclude this relationship from this organisation’s view. Other organisations and version history are unchanged.'
                  : 'Withdraw this shared assertion from current views. Its recorded history remains available.',
          }}
          size="sm"
          style="ghost"
          disabled={saving}
          onClick={() => onSave(row, true)}
        />
      {/if}
    </div>
  {:else}
    {#if request.ready && !displayRows.length && !currentAddresses.length}
      <p class="text-muted-foreground bg-muted/20 rounded-lg px-4 py-6 text-sm">
        {#if hostRequest}
          This establishment has operating locations, not physical membership. Physical
          groupings belong to its host building or complex.
        {:else}
          {m.relationship_empty()}
        {/if}
      </p>
      {#if hostRequest}
        {#await hostRequest then hosts}
          {#each hosts.rows.filter(
            row =>
              row.occupancyState === 'current' &&
              row.containerLocationId &&
              row.assertionState !== 'suppressed',
          ) as host (String(host.id))}
            <a
              class="text-primary block text-sm font-medium hover:underline"
              href={`/admin/locations/${host.containerLocationId}${organisationId ? `?organisation=${encodeURIComponent(organisationId)}` : ''}#relationships`}
              >View physical membership ·
              {String(host.containerLocationIdLabel ?? host.containerLocationId)}</a
            >
          {/each}
        {/await}
      {/if}
    {/if}
  {/each}

  {#if request.current?.nextCursor}
    <Button type="button" text={m.relationship_more()} onClick={more} disabled={busy} />
  {/if}
  {#if canOrder}
    <p class="text-muted-foreground text-xs">
      Sort by street number (ranges first) or drag addresses into order, then save. The
      first address has the highest priority.
    </p>
    <!-- Match Project layer rows: the grip starts dragging and each row owns its insertion gap. -->
    <div
      class="flex min-w-0 flex-col gap-0 py-1.5 [--bits-dnd-gap:0px]"
      data-address-order
    >
      {#each ordered as id, index (id)}
        <div
          data-dnd-item
          data-address-id={id}
          data-dnd-active={dndState.isDragging}
          class="before:bg-foreground! after:bg-foreground! relative py-1.5 before:top-0! after:bottom-0!"
          class:cursor-grab={!busy && !saving}
          use:draggable={{
            container: `${container}-${id}`,
            containerGroup: container,
            dragData: { id },
            disabled: busy || saving,
            handle: '.bits-card__drag-handle',
            interactive: ['a', 'button', 'input', 'label'],
            attributes: { draggingClass: 'opacity-55' },
          }}
          use:droppable={{
            container: `${container}-${id}`,
            containerGroup: container,
            disabled: busy || saving,
            callbacks: { onDrop: state => handleDrop(state, id) },
          }}
        >
          <ResourceCard.Root
            isDraggable={!busy && !saving}
            reserveDragSpace={true}
            class="border-border bg-foreground/4 min-h-14 rounded-lg border bg-none shadow-none before:hidden [&>span]:z-3 [&>span]:cursor-grab [&>span]:active:cursor-grabbing"
          >
            <ResourceCard.Body
              code={String(index + 1)}
              name={String(rows.find(row => row.id === id)?.addressLabel ?? id)}
              wrapTitle
            />
          </ResourceCard.Root>
        </div>
      {/each}
    </div>
    <div class="flex flex-wrap gap-2">
      <Button
        type="button"
        text={m.relationship_sort_by_number()}
        disabled={busy || saving || ordered.length < 2}
        onClick={sortByStreetNumber}
      />
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
