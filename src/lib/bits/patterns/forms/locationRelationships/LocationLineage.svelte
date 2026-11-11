<script lang="ts">
// I18N
import * as m from '#lib/paraglide/messages.js'
// BITS
import { Button } from '#lib/bits/core/button/index.js'
import { SelectField, TextInput, TextArea } from '#lib/bits/custom/form/index.js'
import HistoryIcon from 'virtual:icons/lucide/history'
import RelationshipLocationPicker from './RelationshipLocationPicker.svelte'
// API
import {
  getLocationLineage,
  saveLocationTransition,
} from '#lib/api/locationRelationships.remote.js'
let {
  locationId,
  organisationId,
  canEdit = false,
  queryScope = '',
}: {
  locationId: string
  organisationId: string | null
  canEdit?: boolean
  queryScope?: string
} = $props()
let type = $state<'replacement' | 'merge' | 'split' | 'reconfiguration'>('replacement')
const uid = $props.id()
let adding = $state(false)
let before = $state<{ id: string; label: string }[]>([])
let after = $state<{ id: string; label: string }[]>([])
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
      before: before.length ? before.map(item => item.id) : [locationId],
      after: after.map(item => item.id),
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
    before = []
    after = []
    adding = false
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
  (Record<string, unknown> & {
    participants: { locationId: string; side: string; label?: string }[]
  })[]
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
<section class="border-border/50 min-w-0 space-y-4 rounded-xl border p-5">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h4 class="text-sm font-medium">{m.relationship_lineage()}</h4>
    <div class="flex items-center gap-2">
      {#if canEdit}
        <Button
          text={adding ? 'Cancel' : m.lineage_record()}
          size="sm"
          style="ghost"
          disabled={busy}
          onClick={() => (adding = !adding)}
        />
      {/if}
      <Button
        size="sm"
        style={history ? 'soft' : 'ghost'}
        modifier="square"
        iconComponent={HistoryIcon}
        hideLabel
        hideLabelInstantly
        attrs={{
          'aria-pressed': history,
          'data-tooltip': history ? 'Show latest changes' : 'Show version history',
        }}
        type="button"
        text={history ? m.relationship_current() : m.relationship_history()}
        onClick={toggle}
      />
    </div>
  </div>
  <p class="text-muted-foreground max-w-3xl text-sm">{m.relationship_lineage_hint()}</p>
  {#if history}
    <p class="text-primary text-xs font-medium">
      Version history · includes superseded events
    </p>
  {/if}
  {#if !request.ready}
    <div
      class="bg-muted h-16 animate-pulse rounded"
      role="status"
      aria-label={m.relationship_loading()}
    ></div>
  {/if}
  {#each rows as row (String(row.id))}
    <article class="bg-muted/20 space-y-3 rounded-lg p-4 text-sm">
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
          >{participant.side}: {participant.label ?? participant.locationId}</a
        >
      {/each}
    </article>
  {:else}
    {#if request.ready}
      <p class="text-muted-foreground bg-muted/20 rounded-lg px-4 py-6 text-sm">
        {m.relationship_empty()}
      </p>
    {/if}
  {/each}
  {#if request.current?.nextCursor}
    <Button type="button" text={m.relationship_more()} onClick={more} />
  {/if}
  {#if canEdit && adding}
    <fieldset
      disabled={busy}
      class="bg-muted/20 grid min-w-0 gap-6 rounded-xl p-5 md:grid-cols-2"
    >
      <div class="md:col-span-2">
        <SelectField
          triggerClass="bg-transparent! hover:bg-transparent! shadow-none!"
          id={uid + '-type'}
          label={m.lineage_type()}
          value={type}
          items={[
            { value: 'replacement', label: m.lineage_replacement() },
            { value: 'merge', label: m.lineage_merge() },
            { value: 'split', label: m.lineage_split() },
            { value: 'reconfiguration', label: m.lineage_reconfiguration() },
          ]}
          onValueChange={value => (type = value as typeof type)}
        />
      </div>
      <div class="min-w-0 space-y-2">
        <RelationshipLocationPicker
          label="Before · Locations involved"
          selected={before}
          onChange={items => (before = items)}
          {organisationId}
          {queryScope}
          multiple
          disabled={busy}
        />
        <p class="text-muted-foreground text-xs">Leave empty to use this Location.</p>
      </div>
      <RelationshipLocationPicker
        label="After · Resulting Locations"
        selected={after}
        onChange={items => (after = items)}
        {organisationId}
        {queryScope}
        multiple
        disabled={busy}
      />
      <TextInput
        variant="resource"
        id={uid + '-source'}
        name=""
        label={m.lineage_source()}
        inputAttrs={{ inputmode: 'url' }}
        required
        bind:value={sourceUrl}
        class="md:col-span-2"
      />
      <TextArea
        controlClass="bg-transparent!"
        id={uid + '-description'}
        name=""
        label={m.lineage_description()}
        rows={3}
        required
        bind:value={description}
        class="md:col-span-2"
      />
      <p class="text-muted-foreground text-xs md:col-span-2">
        This records a real-world change. It does not merge identities, redirect
        Locations or move Features.
      </p>
      <div class="flex flex-wrap gap-2 md:col-span-2">
        <Button
          text={busy ? 'Recording…' : m.lineage_record()}
          color="primary"
          disabled={busy || !after.length || !sourceUrl || !description.trim()}
          onClick={record}
        />
        <Button
          text="Cancel"
          style="ghost"
          disabled={busy}
          onClick={() => (adding = false)}
        />
      </div>
    </fieldset>
  {/if}
  {#if failure}
    <p role="alert" class="text-destructive text-sm">{failure}</p>
  {/if}
</section>
