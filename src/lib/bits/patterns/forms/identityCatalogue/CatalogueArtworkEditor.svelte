<script lang="ts">
// API
import { uploadIdentityCatalogueLogo } from '#lib/api/identityCatalogue.remote.js'
// COMPONENTS
import CatalogueMarkerArtwork from '#lib/bits/patterns/identity/CatalogueMarkerArtwork.svelte'
// TYPES
import type { IdentityCatalogueContent } from '#lib/locations/identityCatalogue.js'
let {
  content = $bindable(),
  editable,
  organisationId,
}: {
  content: IdentityCatalogueContent
  editable: boolean
  organisationId?: string
} = $props()
let previewTheme = $state('milk'),
  previewMode = $state<'light' | 'dark'>('light')
let slot = $state('logo'),
  background = $state('#ffffff'),
  sourceUrl = $state(''),
  pending = $state(false),
  failure = $state('')
/** Convert a selected source image to the existing bounded PNG upload contract. @param event File input event. @returns Upload completion. */
async function upload(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement,
    file = input.files?.[0]
  if (!file || !editable) return
  pending = true
  failure = ''
  try {
    if (!/^(?:logo|marker)(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(slot))
      throw new Error(
        'Use logo, marker, marker-dark, marker-light or marker-theme-code.',
      )
    if (content.artwork?.[slot])
      throw new Error(
        'Remove the existing variant before replacing it; its saved revision remains in history.',
      )
    if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image under 8 MB.')
    if (sourceUrl && !URL.canParse(sourceUrl))
      throw new Error('Enter a complete source URL.')
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 512
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Image conversion unavailable')
    ctx.fillStyle = background
    ctx.fillRect(0, 0, 512, 512)
    const scale = 512 / Math.max(bitmap.width, bitmap.height)
    ctx.drawImage(
      bitmap,
      (512 - bitmap.width * scale) / 2,
      (512 - bitmap.height * scale) / 2,
      bitmap.width * scale,
      bitmap.height * scale,
    )
    bitmap.close()
    const result = await uploadIdentityCatalogueLogo({
      data: canvas.toDataURL('image/png').split(',')[1],
      organisationId,
    })
    content = {
      ...content,
      artwork: {
        ...content.artwork,
        [slot]: {
          src: result.logo,
          background,
          status: 'candidate',
          ...(sourceUrl ? { sourceUrl } : {}),
        },
      },
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Could not upload artwork'
  } finally {
    pending = false
    input.value = ''
  }
}
</script>
<section class="border-border border-b p-5" aria-label="Logo library">
  <h3 class="font-semibold">Logo library</h3>
  <p class="text-muted-foreground mt-1 text-xs">
    Theme marker → light/dark marker → default marker → general logo with a white ring.
    Candidates stay out of marker selection until approved.
  </p>
  <div class="mt-4 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
    {#each Object.entries(content.artwork ?? {}) as [key, asset] (key)}
      <article class="border-border rounded-lg border p-3" data-artwork-slot={key}>
        <img
          src={asset.src}
          alt={`${key} logo candidate`}
          class="mx-auto size-24 rounded-lg object-contain"
          style:background={asset.background}
        >
        <p class="mt-2 text-sm font-medium break-words">{key}</p>
        <p class="text-muted-foreground text-xs">
          {asset.status === 'approved' ? 'Approved' : 'Needs review'}
        </p>
        {#if asset.sourceUrl}
          <a
            href={asset.sourceUrl}
            target="_blank"
            rel="noreferrer"
            class="text-primary text-xs underline"
            >Source ↗</a
          >
        {/if}
        {#if asset.attribution || asset.license}
          <p class="text-muted-foreground mt-1 text-xs">
            {asset.attribution ?? ''} {asset.license ?? ''}
          </p>
        {/if}
        {#if asset.notes}
          <p class="text-muted-foreground mt-1 text-xs">{asset.notes}</p>
        {/if}
        {#if editable}
          <div class="mt-2 flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              class="text-primary"
              onclick={() => {
                content = {
                  ...content,
                  ...(key === 'logo'
                    ? {
                        logoAttribution:
                          asset.status === 'candidate' || content.logo === asset.src
                            ? undefined
                            : content.logoAttribution,
                        logo:
                          asset.status === 'candidate'
                            ? asset.src
                            : content.logo === asset.src
                              ? null
                              : content.logo,
                      }
                    : {}),
                  artwork: {
                    ...content.artwork,
                    [key]: {
                      ...asset,
                      status: asset.status === 'approved' ? 'candidate' : 'approved',
                    },
                  },
                }
              }}
            >
              {asset.status === 'approved' ? 'Mark for review' : 'Approve'}
            </button>
            <button
              type="button"
              onclick={() => {
                const artwork = { ...content.artwork }
                delete artwork[key]
                content = {
                  ...content,
                  ...(key === 'logo' && content.logo === asset.src
                    ? { logo: null, logoAttribution: undefined }
                    : {}),
                  artwork,
                }
              }}
            >
              Remove
            </button>
          </div>
        {/if}
      </article>
    {/each}
  </div>
  {#if editable}
    <div class="mt-4 grid gap-3 sm:grid-cols-2">
      <label class="grid gap-1 text-xs"
        >Variant code<input
          class="border-border bg-surface rounded border p-2"
          bind:value={slot}
          disabled={pending}
          placeholder="marker-null-space"
        ></label
      >
      <label class="grid gap-1 text-xs"
        >Solid background<input
          type="color"
          bind:value={background}
          disabled={pending}
        ></label
      >
      <label class="grid gap-1 text-xs"
        >Source URL<input
          type="url"
          class="border-border bg-surface rounded border p-2"
          bind:value={sourceUrl}
          disabled={pending}
        ></label
      >
      <label class="grid gap-1 text-xs"
        >Upload artwork<input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={pending}
          onchange={upload}
        ></label
      >
    </div>
  {/if}
  <details class="mt-4 text-xs">
    <summary class="cursor-pointer">Marker fallback preview</summary>
    <div class="mt-3 flex flex-wrap items-end gap-3">
      <label class="grid gap-1"
        >Theme code<input
          class="border-border bg-surface rounded border p-2"
          bind:value={previewTheme}
        ></label
      >
      <label class="grid gap-1"
        >Mode<select
          class="border-border bg-surface rounded border p-2"
          bind:value={previewMode}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select></label
      >
      <div class="size-16 rounded-lg bg-neutral-600 p-2">
        <CatalogueMarkerArtwork
          owner={content}
          theme={previewTheme}
          mode={previewMode}
          label="Selected marker artwork"
        />
      </div>
    </div>
    <p class="text-muted-foreground mt-2">
      Only approved artwork appears here. Save the catalogue entry to publish approvals.
    </p>
  </details>
  {#if failure}
    <p role="alert" class="text-error mt-2 text-sm">{failure}</p>
  {/if}
  {#if content.evidence?.length}
    <details class="mt-4 text-xs">
      <summary class="cursor-pointer">Research sources</summary>
      <ul class="mt-2 grid gap-2">
        {#each content.evidence as evidence}
          <li>
            <a
              class="text-primary underline"
              href={evidence.url}
              target="_blank"
              rel="noreferrer"
              >{evidence.kind}
              ↗</a
            >
            · {evidence.note}
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</section>
