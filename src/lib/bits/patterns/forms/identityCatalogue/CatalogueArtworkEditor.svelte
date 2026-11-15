<script lang="ts">
// API
import { uploadIdentityCatalogueLogo } from '#lib/api/identityCatalogue.remote.js'
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
    if (Math.min(bitmap.width, bitmap.height) < 512) {
      bitmap.close()
      throw new Error(
        'Use an original image at least 512 pixels wide and tall. Enlarging a small icon does not add detail.',
      )
    }
    const sourceWidth = bitmap.width,
      sourceHeight = bitmap.height
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
      ...(slot === 'logo' ? { logo: result.logo, logoAttribution: undefined } : {}),
      artwork: {
        ...content.artwork,
        [slot]: {
          src: result.logo,
          background,
          status: 'approved',
          format: 'png',
          sourceWidth,
          sourceHeight,
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
  <div class="mt-4 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
    {#each Object.entries(content.artwork ?? {}) as [key, asset] (key)}
      <article class="border-border rounded-lg border p-3" data-artwork-slot={key}>
        <img
          src={asset.src}
          alt={key.replaceAll('-', ' ')}
          class="mx-auto size-24 rounded-lg object-contain"
          style:background={asset.background}
        >
        <div class="mt-2 flex flex-wrap items-baseline gap-2">
          <p class="text-sm font-medium break-words">{key.replaceAll('-', ' ')}</p>
          {#if asset.format}
            <span class="text-muted-foreground text-[10px] uppercase"
              >{asset.format}</span
            >
          {/if}
        </div>
        {#if asset.sourceUrl}
          <a
            href={asset.sourceUrl}
            target="_blank"
            rel="noreferrer"
            class="text-primary text-xs underline"
            >Source ↗</a
          >
        {/if}
        {#if editable}
          <label class="mt-2 grid gap-1 text-xs">
            Artwork type
            <select
              class="border-border bg-surface rounded border p-1"
              aria-label={`Artwork type for ${key}`}
              value={asset.composition ?? ''}
              onchange={event => {
                const composition = event.currentTarget.value
                const updated = { ...asset }
                if (composition === 'brand-mark' || composition === 'full-logo')
                  updated.composition = composition
                else delete updated.composition
                content = {
                  ...content,
                  artwork: { ...content.artwork, [key]: updated },
                }
              }}
            >
              <option value="">Unclassified</option>
              <option value="full-logo">Full logo</option>
              <option value="brand-mark">Brand mark</option>
            </select>
          </label>
        {:else if asset.composition}
          <p class="mt-1 text-xs">
            {asset.composition === 'brand-mark' ? 'Brand mark' : 'Full logo'}
          </p>
        {/if}
        {#if editable}
          <div class="mt-2 flex flex-wrap gap-2 text-xs">
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
  {#if failure}
    <p role="alert" class="text-error mt-2 text-sm">{failure}</p>
  {/if}
</section>
