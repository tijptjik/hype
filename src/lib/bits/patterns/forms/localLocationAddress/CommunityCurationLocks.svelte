<script lang="ts">
// THIRD-PARTY
import { Dialog } from 'bits-ui'
// ICONS
import LockIcon from 'virtual:icons/lucide/lock-keyhole'
import UnlockIcon from 'virtual:icons/lucide/lock-keyhole-open'
// DOMAIN
import { CURATION_LOCK_LABELS } from '#lib/locations/curationLocks.js'
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
const hasLockedFields = $derived(
  Object.values(openFields).some(value => value === false),
)
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
    title={hasLockedFields
      ? 'Some community curation fields are locked'
      : 'Community curation fields are open'}
    class="hover:bg-primary/10 focus-visible:outline-ring inline-flex size-9 shrink-0 items-center justify-center rounded-lg focus-visible:outline-2 disabled:opacity-50"
  >
    {#if hasLockedFields}
      <LockIcon class="size-4" />
    {:else}
      <UnlockIcon class="size-4" />
    {/if}
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-[70] bg-black/40" />
    <Dialog.Content
      class="bits-theme border-border bg-panel text-foreground fixed top-1/2 left-1/2 z-[71] flex max-h-[calc(100dvh-2rem)] w-[30rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border shadow-xl"
    >
      <div class="border-border border-b p-5">
        <Dialog.Title class="text-lg font-semibold"
          >Community curation locks</Dialog.Title
        >
        <Dialog.Description class="text-muted-foreground mt-2 text-sm"
          >Choose which fields are open to new community changes. Only SuperAdmin can
          change these controls. Internal customizations remain
          available.</Dialog.Description
        >
      </div>
      <div class="min-h-0 overflow-y-auto p-5" aria-busy={loading || saving}>
        {#if failure}
          <p role="alert" class="text-error mb-4 text-sm">{failure}</p>
        {/if}
        {#if loading}
          <p class="text-muted-foreground text-sm">Loading controls…</p>
        {:else if current?.available}
          <p class="text-muted-foreground mb-3 text-xs">
            Checked = open · Unchecked = locked
          </p>
          <div class="grid gap-1">
            {#each Object.entries(CURATION_LOCK_LABELS) as [key, label]}
              {@const field = key as CurationLockField}
              <label
                class="hover:bg-primary/5 flex cursor-pointer items-center justify-between gap-4 rounded-lg px-3 py-2 text-sm"
              >
                <span>{label}</span>
                <input
                  type="checkbox"
                  class="accent-primary size-4 shrink-0"
                  aria-label={`${label} open to community changes`}
                  checked={fields[field] !== false}
                  disabled={saving}
                  onchange={event =>
                    (fields = { ...fields, [field]: event.currentTarget.checked })}
                >
              </label>
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
