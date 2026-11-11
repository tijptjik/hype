<script lang="ts">
// SVELTE
import { page } from '$app/state'
// ICONS
import Tags from 'virtual:icons/lucide/tags'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// API
import {
  importIdentityCatalogue,
  publishIdentityCatalogueLocations,
  findIdentityCatalogue,
  getIdentityCatalogue,
  publishIdentityCatalogue,
  uploadIdentityCatalogueLogo,
} from '#lib/api/identityCatalogue.remote.js'
// COMPONENTS
import { Button } from '#lib/bits/core/index.js'
// DOMAIN
import {
  seedIdentityCatalogue,
  type IdentityCatalogueRecord,
  type IdentityCatalogueContent,
} from '#lib/locations/identityCatalogue.js'

const admin = getAdminCtx(),
  header = getHeaderCtrl()
admin.setResourceType(false)
let importStatus = $state('')
let kind = $state<'brand' | 'group'>('brand')
let search = $state('')
let records = $state<IdentityCatalogueRecord[]>([])
let selected = $state<IdentityCatalogueRecord | null>(null)
let content = $state<IdentityCatalogueContent | null>(null)
let busy = $state(false),
  failed = $state(false),
  saved = $state(false),
  refresh = $state(0)
const organisationId = $derived(page.url.searchParams.get('organisation') ?? undefined)
$effect(() => {
  header.setHeaderForStandAlone('Brands and groups', Tags, {
    showNew: false,
    showFilter: false,
    showFacets: false,
    showViewActions: false,
    showLayoutToggle: false,
    showControlBarToggle: false,
  })
  header.clearFooter()
})
$effect(() => {
  refresh
  const type = kind,
    query = search
  let cancelled = false
  void findIdentityCatalogue({ kind: type, search: query })
    .then(value => {
      if (!cancelled) records = value
    })
    .catch(() => {
      if (!cancelled) failed = true
    })
  return () => {
    cancelled = true
  }
})
$effect(() => {
  const id = page.url.searchParams.get('id')
  if (!id) return
  let cancelled = false
  void getIdentityCatalogue({ id })
    .then(record => {
      if (!cancelled) {
        kind = record.kind
        edit(record)
      }
    })
    .catch(() => {
      if (!cancelled) failed = true
    })
  return () => {
    cancelled = true
  }
})
/** Select a catalogue record without mutating its retained revision.
 * @param record Current record or null for creation. @returns Nothing.
 */
function edit(record: IdentityCatalogueRecord | null): void {
  selected = record
  content = record
    ? structuredClone($state.snapshot({ i18n: record.i18n, logo: record.logo }))
    : seedIdentityCatalogue({ en: 'New name' })
  saved = false
}
/** Save an inspected catalogue revision. @returns Completion with visible success/error. */
async function save(): Promise<void> {
  if (!content || busy) return
  busy = true
  failed = false
  try {
    const record = await publishIdentityCatalogue({
      id: selected?.id ?? crypto.randomUUID(),
      kind: selected?.kind ?? kind,
      expectedVersion: selected?.version ?? 0,
      content: $state.snapshot(content),
      organisationId,
    })
    await findIdentityCatalogue({ kind, search }).refresh()
    selected = record
    await publishLinks(record.id)
    saved = true
    refresh++
  } catch {
    failed = true
  } finally {
    busy = false
  }
}
/** Decode a chosen image and upload a bounded PNG, leaving attachment explicit until Save.
 * @param file Local image selection. @returns Completion after the logo preview is ready.
 */
async function upload(file?: File): Promise<void> {
  if (!file || !content || busy) return
  busy = true
  failed = false
  try {
    if (file.size > 8 * 1024 * 1024) throw Error('Logo too large')
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas'),
      scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height))
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const result = await uploadIdentityCatalogueLogo({
      data: canvas.toDataURL('image/png').split(',')[1],
      organisationId,
    })
    content = { ...content, logo: result.logo }
    saved = false
  } catch {
    failed = true
  } finally {
    busy = false
  }
}

/** Publish all bounded pages, preserving locked or concurrently edited Locations for retry.
 * @param id Catalogue identity. @returns Completion after the final page.
 */
async function publishLinks(id: string): Promise<void> {
  let after: string | null = null
  let changed = 0,
    failures = 0
  do {
    const result: Awaited<ReturnType<typeof publishIdentityCatalogueLocations>> =
      await publishIdentityCatalogueLocations({
        id,
        after,
        organisationId,
      })
    changed += result.linked
    failures += result.failed.length
    after = result.next
    importStatus = `${changed} community locations updated; ${failures} locked or changed locations need retry.`
  } while (after)
}
/** Import existing source-brand evidence without inventing groups, formats or branches.
 * @returns Completion after the last bounded Location page.
 */
async function importBrands(): Promise<void> {
  if (busy) return
  busy = true
  failed = false
  let after: string | null = null,
    linked = 0,
    scanned = 0,
    failures = 0
  try {
    do {
      const result: Awaited<ReturnType<typeof importIdentityCatalogue>> =
        await importIdentityCatalogue({ after })
      linked += result.linked
      scanned += result.scanned
      failures += result.failed.length
      after = result.next
      importStatus = `${linked} linked · ${scanned} inspected · ${failures} need retry`
    } while (after)
    await findIdentityCatalogue({ kind, search }).refresh()
    refresh++
  } catch {
    failed = true
  } finally {
    busy = false
  }
}
</script>
<div
  class="bg-base-100 text-base-content grid min-h-0 min-w-0 flex-1 content-start gap-8 overflow-y-auto p-6 lg:grid-cols-[18rem_minmax(0,1fr)]"
>
  <aside class="grid content-start gap-3">
    <label class="grid gap-1 text-sm"
      >Kind<select
        bind:value={kind}
        disabled={busy}
        class="border-input bg-background min-w-0 rounded-md border p-2"
      >
        <option value="brand">Brand</option>
        <option value="group">Group</option>
      </select></label
    >
    <label class="grid gap-1 text-sm"
      >Search<input
        bind:value={search}
        class="border-input bg-background min-w-0 rounded-md border p-2"
      ></label
    >
    <Button
      text={kind === 'brand' ? 'New brand' : 'New group'}
      onClick={() => edit(null)}
      disabled={busy}
    />
    {#each records as record (record.id)}
      <button
        type="button"
        disabled={busy}
        class="border-border hover:bg-muted rounded-md border p-3 text-left text-sm"
        onclick={() => edit(record)}
      >
        {record.i18n.en.name}
      </button>
    {/each}
  </aside>
  <section class="grid max-w-3xl min-w-0 content-start gap-4">
    <Button
      text="Link imported brands"
      style="outline"
      disabled={busy}
      onClick={importBrands}
    />
    {#if importStatus}
      <p role="status" class="text-sm">{importStatus}</p>
    {/if}
    {#if failed}
      <p role="alert">Unable to load or save the catalogue. Reload and try again.</p>
    {/if}
    {#if content}
      {#if content.logo}
        <img
          src={content.logo}
          alt="Catalogue logo"
          class="h-32 w-32 rounded-md object-contain"
        >
      {/if}
      <label class="grid gap-1 text-sm"
        >Upload logo<input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onchange={event => upload(event.currentTarget.files?.[0])}
        ></label
      >
      {#each ['en', 'zh-Hant', 'zh-Hans'] as locale (locale)}
        <label class="grid gap-1 text-sm"
          >Name · {locale}<input
            bind:value={content.i18n[locale].name}
            disabled={busy}
            class="border-input bg-background min-w-0 rounded-md border p-2"
          ></label
        >
      {/each}
      <Button text="Save catalogue record" onClick={save} disabled={busy} />
      {#if selected}
        <a
          class="text-sm underline"
          href={`/admin/catalogue?id=${selected.id}${organisationId ? `&organisation=${organisationId}` : ''}`}
          >Link to this {selected.kind}</a
        >
      {/if}
      {#if saved}
        <p role="status">Catalogue saved</p>
      {/if}
    {/if}
  </section>
</div>
