<script lang="ts">
// THIRD-PARTY
import { Dialog, useId } from 'bits-ui'
// COMPONENTS
import Switch from '#lib/bits/custom/switch/Switch.svelte'
// ICONS
import LockIcon from 'virtual:icons/lucide/lock-keyhole'
import UnlockIcon from 'virtual:icons/lucide/lock-keyhole-open'
import IdentityIcon from 'virtual:icons/lucide/tag'
import AddressIcon from 'virtual:icons/lucide/house'
import MapIcon from 'virtual:icons/lucide/map-pin'
import RelocationIcon from 'virtual:icons/lucide/route'
import CommunicationsIcon from 'virtual:icons/lucide/contact'
// DOMAIN
import {
  CURATION_LOCK_LABELS,
  CURATION_LOCK_GROUPS,
  PUBLIC_CURATION_LOCK_FIELDS,
  countCurationLocks,
} from '#lib/locations/curationLocks.js'
// TYPES
import type {
  CurationLocks,
  CurationOpenFields,
  CurationLockField,
} from '#lib/locations/curationLocks.js'

let {
  load,
  save,
  disabled = false,
  openFields = {},
}: {
  load: () => Promise<CurationLocks>
  save: (
    expectedRevision: string | null,
    openFields: CurationOpenFields,
  ) => Promise<unknown>
  disabled?: boolean
  openFields?: CurationOpenFields
} = $props()
let open = $state(false)
let loading = $state(false)
let saving = $state(false)
let current = $state<CurationLocks | null>(null)
let fields = $state<CurationOpenFields>({})
let failure = $state('')
const controlId = useId()
const groupIcons = [
  IdentityIcon,
  AddressIcon,
  MapIcon,
  RelocationIcon,
  CommunicationsIcon,
]
const groupColumns = [CURATION_LOCK_GROUPS.slice(0, 2), CURATION_LOCK_GROUPS.slice(2)]
const total = PUBLIC_CURATION_LOCK_FIELDS.length
const savedLocked = $derived(countCurationLocks(openFields))
const locked = $derived(countCurationLocks(fields))
/** Toggle one policy area or all public fields; retained internal controls remain untouched.
 * @param keys Public fields to change. @param next Whether to lock them.
 * @returns Nothing; changes remain a draft until Save.
 */
function setLocked(keys: readonly CurationLockField[], next: boolean): void {
  fields = { ...fields, ...Object.fromEntries(keys.map(key => [key, !next])) }
}
/** Load a fresh head whenever the lock controls open.
 * @param next Whether the dialog should be open. @returns Completion after the fresh head is loaded.
 */
async function changeOpen(next: boolean): Promise<void> {
  if (saving) return
  open = next
  if (!next) return
  loading = true
  failure = ''
  current = null
  try {
    const value = await load()
    current = value
    fields = structuredClone(value.openFields)
    if (!value.available) failure = 'Community curation controls are unavailable.'
  } catch {
    failure = 'Could not load community curation controls. Close and try again.'
  } finally {
    loading = false
  }
}
/** Commit boolean controls against the displayed revision; a stale dialog never silently overwrites.
 * @returns Completion after saving or displaying a retryable error.
 */
async function commit(): Promise<void> {
  if (!current?.available || saving) return
  saving = true
  failure = ''
  try {
    await save(current.revision, $state.snapshot(fields))
    open = false
  } catch {
    failure =
      'Could not save. The controls may have changed; close and reopen to reload.'
  } finally {
    saving = false
  }
}
</script>

<Dialog.Root {open} onOpenChange={value => void changeOpen(value)}>
  <Dialog.Trigger
    type="button"
    {disabled}
    aria-label="Community curation locks"
    title={`${savedLocked}/${total} community fields locked`}
    class="hover:bg-primary/10 focus-visible:outline-ring inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 focus-visible:outline-2 disabled:opacity-50"
  >
    {#if savedLocked > 0}
      <LockIcon class="size-4" />
    {:else}
      <UnlockIcon class="size-4" />
    {/if}
    {#if savedLocked > 0 && savedLocked < total}
      <span class="text-xs tabular-nums">{savedLocked}/{total}</span>
    {/if}
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-[70] bg-black/40" />
    <Dialog.Content
      class="bits-theme border-border bg-panel text-foreground fixed top-1/2 left-1/2 z-[71] flex max-h-[calc(100dvh-2rem)] w-[56rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border shadow-xl"
    >
      <div class="border-border flex items-center gap-3 border-b px-5 py-3">
        <button
          type="button"
          aria-label="Lock all community fields"
          title={locked === total ? 'Unlock all fields' : 'Lock all fields'}
          aria-pressed={locked === total ? true : locked > 0 ? 'mixed' : false}
          disabled={loading || saving || !current?.available}
          onclick={() => setLocked(PUBLIC_CURATION_LOCK_FIELDS, locked !== total)}
          class="text-primary hover:bg-primary/10 focus-visible:outline-ring inline-flex size-9 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2 disabled:opacity-50 {locked >
          0
            ? 'bg-primary/10'
            : ''}"
        >
          {#if locked > 0}
            <LockIcon class="size-5" />
          {:else}
            <UnlockIcon class="size-5" />
          {/if}
        </button>
        <Dialog.Title class="text-lg font-semibold"
          >Community curation locks</Dialog.Title
        >
        <Dialog.Description class="sr-only">On means locked.</Dialog.Description>
      </div>
      <div class="min-h-0 overflow-y-auto p-5" aria-busy={loading || saving}>
        {#if failure}
          <p role="alert" class="text-error mb-4 text-sm">{failure}</p>
        {/if}
        {#if loading}
          <p class="text-muted-foreground text-sm">Loading controls…</p>
        {:else if current?.available}
          <div class="grid items-start gap-4 md:grid-cols-2">
            {#each groupColumns as groups}
              <div class="grid gap-4">
                {#each groups as group}
                  {@const groupIndex = CURATION_LOCK_GROUPS.indexOf(group)}
                  {@const Icon = groupIcons[groupIndex]}
                  {@const count = countCurationLocks(fields, group.fields)}
                  <section class="border-border overflow-hidden rounded-xl border">
                    <div
                      class="bg-primary/5 flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <label
                        for={`${controlId}-group-${groupIndex}`}
                        class="flex min-w-0 cursor-pointer flex-wrap items-center gap-x-2 gap-y-1"
                      >
                        <Icon class="size-4 shrink-0" aria-hidden="true" />
                        <span class="font-semibold">{group.label}</span>
                        <span class="text-muted-foreground text-xs tabular-nums"
                          >{count}/{group.fields.length}
                          <span class="sr-only">locked</span></span
                        >
                      </label>
                      <Switch
                        id={`${controlId}-group-${groupIndex}`}
                        checked={count === group.fields.length}
                        disabled={saving}
                        onCheckedChange={value =>
                          setLocked(group.fields, value === true)}
                      />
                    </div>
                    <div class="grid gap-1 p-2">
                      {#each group.fields as field}
                        <div
                          class="flex items-center justify-between gap-4 rounded-lg px-2 py-2 text-sm"
                        >
                          <label
                            for={`${controlId}-${field}`}
                            class="min-w-0 cursor-pointer break-words"
                            >{CURATION_LOCK_LABELS[field]}</label
                          >
                          <Switch
                            id={`${controlId}-${field}`}
                            size="sm"
                            checked={fields[field] === false}
                            disabled={saving}
                            onCheckedChange={value =>
                              setLocked([field], value === true)}
                          />
                        </div>
                      {/each}
                    </div>
                  </section>
                {/each}
              </div>
            {/each}
          </div>
        {/if}
      </div>
      <div class="border-border flex justify-end gap-3 border-t p-4">
        <Dialog.Close
          type="button"
          disabled={saving}
          class="rounded-lg border px-4 py-2 text-sm"
          >Cancel</Dialog.Close
        >
        <button
          type="button"
          disabled={loading || saving || !current?.available}
          onclick={() => void commit()}
          class="bg-primary text-primary-content rounded-lg px-4 py-2 text-sm disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save locks'}
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
