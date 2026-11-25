<script lang="ts">
// I18N
import { t } from './i18n'
// API
import { photoThumbnail, retryOriginal } from './hype'
// DOMAIN
import {
  recorderPhotoLimit,
  recorderPhotoTypes,
} from '../../../../src/lib/fieldResearch/recorderPhotos'
// TYPES
import type { PendingPhoto } from './recordDraft'

let {
  photos = $bindable(),
  revisions,
  editable,
  busy,
}: {
  photos: PendingPhoto[]
  revisions: string[]
  editable: boolean
  busy: boolean
} = $props()
let camera = $state<HTMLInputElement>()
let gallery = $state<HTMLInputElement>()
let issue = $state('')

function capture(input: HTMLInputElement): void {
  issue = ''
  for (const file of input.files ?? []) {
    if (
      !recorderPhotoTypes.includes(file.type) ||
      !file.size ||
      file.size > recorderPhotoLimit
    ) {
      issue = t('unsupported_photo')
      continue
    }
    photos = [...photos, { id: crypto.randomUUID(), file, selected: true }]
  }
  input.value = ''
}

function preview(node: HTMLImageElement, file: File): { destroy(): void } {
  const url = URL.createObjectURL(file)
  node.src = url
  return { destroy: () => URL.revokeObjectURL(url) }
}
</script>

{#if editable || revisions.length}
  <section
    aria-labelledby="record-photos"
    class="border-line bg-panel grid gap-2 rounded-xl border px-3.5 py-3"
  >
    <div class="flex flex-wrap items-center justify-between gap-x-3">
      <h2 id="record-photos" class="text-base font-semibold">{t('photos')}</h2>
      {#if editable}
        <div class="flex items-center gap-1.5">
          <input
            hidden
            bind:this={camera}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy}
            onchange={event => capture(event.currentTarget)}
          >
          <input
            hidden
            bind:this={gallery}
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            onchange={event => capture(event.currentTarget)}
          >
          <button
            type="button"
            class="border-line inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2 text-sm font-medium"
            disabled={busy}
            onclick={() => gallery?.click()}
          >
            <svg
              aria-hidden="true"
              class="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linejoin="round"
            >
              <path d="M3 4h18v16H3zm0 13 6-6 4 4 3-3 5 5" />
              <circle cx="16" cy="8" r="1" />
            </svg>
            {t('gallery')}
          </button>
          <button
            type="button"
            class="bg-accent text-on-accent inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold"
            disabled={busy}
            onclick={() => camera?.click()}
          >
            <svg
              aria-hidden="true"
              class="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linejoin="round"
            >
              <path d="M3 7h4l2-3h6l2 3h4v13H3z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            {t('take_photo')}
          </button>
        </div>
      {/if}
    </div>
    {#if revisions.length}
      <ul
        aria-label={t('saved_photos')}
        class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,5.5rem),1fr))] gap-1.5"
      >
        {#each revisions as revision, index (revision)}
          <li>
            <img
              loading="lazy"
              class="bg-surface aspect-square w-full rounded-lg object-cover"
              src={photoThumbnail(revision)}
              onerror={event => retryOriginal(event.currentTarget)}
              alt={t('saved_photo', { number: index + 1 })}
            >
          </li>
        {/each}
      </ul>
    {/if}
    {#if editable}
      {#if photos.length}
        <p class="text-muted text-sm">
          {t('photos_selected', {
            selected: photos.filter(photo => photo.selected).length,
            total: photos.length,
          })}
        </p>
        <ul class="grid grid-cols-2 gap-2">
          {#each photos as photo, index (photo.id)}
            <li class="border-line overflow-hidden rounded-xl border">
              <label class="grid cursor-pointer">
                <img
                  use:preview={photo.file}
                  loading="lazy"
                  class="bg-surface aspect-square w-full object-cover"
                  alt={t('photo_preview', { number: index + 1 })}
                >
                <span class="flex min-h-11 items-center gap-2 px-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={busy}
                    bind:checked={photo.selected}
                    aria-label={t('select_photo', { number: index + 1 })}
                  >
                  {t('upload_photo')}
                </span>
              </label>
              <button
                type="button"
                disabled={busy}
                class="text-muted min-h-11 w-full text-sm"
                aria-label={t('remove_photo', { number: index + 1 })}
                onclick={() => (photos = photos.filter(item => item.id !== photo.id))}
              >
                {t('remove')}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if issue}
        <p role="alert" class="text-danger">{issue}</p>
      {/if}
    {/if}
  </section>
{/if}
