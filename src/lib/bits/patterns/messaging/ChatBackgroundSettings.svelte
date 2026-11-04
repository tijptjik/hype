<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// ICONS
import UploadIcon from 'virtual:icons/lucide/upload'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
// ADAPTER
import { useMessagingAppearance } from '#lib/adapters/messaging/useMessagingAppearance.svelte.js'
// MESSAGING
import {
  chatAppearanceStyle,
  ChatAppearanceSchema,
  DEFAULT_CHAT_APPEARANCE,
  TOASTIE_CHAT_BACKGROUND,
  type ChatAppearance,
} from '#lib/messaging/appearance.js'

let { organisationId }: { organisationId: string } = $props()
const model = untrack(() => useMessagingAppearance(organisationId))
let draft = $state<ChatAppearance>({ ...DEFAULT_CHAT_APPEARANCE })
let fileInput: HTMLInputElement
let error = $state(''),
  saved = $state(false)
const id = $props.id()
$effect(() => {
  draft = { ...model.appearance }
})
const changed = $derived(JSON.stringify(draft) !== JSON.stringify(model.appearance))

/** Read a small raster tile for durable, provider-independent background storage.
 * @param file Explicitly selected image; no upload occurs until Save background.
 * @returns Completion after validation and a local preview.
 */
async function chooseImage(file?: File): Promise<void> {
  if (!file) return
  error = ''
  saved = false
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 290_000
  ) {
    error = 'Choose a PNG, JPEG or WebP tile under 290 KB.'
    return
  }
  try {
    const image = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Unable to read this image'))
      reader.readAsDataURL(file)
    })
    draft = { ...draft, image }
  } catch {
    error = 'Unable to read this image. Try another file.'
  }
}
</script>

<section
  aria-labelledby={`${id}-title`}
  class="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-panel p-4"
>
  <div>
    <h3 id={`${id}-title`} class="font-semibold">Chat background</h3>
    <p class="mt-1 text-sm text-muted-foreground">
      A quiet repeating image for this organisation’s Telegram and WhatsApp chats.
    </p>
  </div>
  {#if model.loading}
    <p role="status" class="text-sm text-muted-foreground">Loading background…</p>
  {:else}
    <div class="flex flex-wrap items-center gap-2">
      <Button
        text="Toastie & friends"
        style={draft.image === TOASTIE_CHAT_BACKGROUND ? 'soft' : 'ghost'}
        disabled={model.saving}
        onClick={() => {
          draft = { ...DEFAULT_CHAT_APPEARANCE, image: TOASTIE_CHAT_BACKGROUND }
          saved = false
        }}
      />
      <input
        bind:this={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        class="sr-only"
        tabindex="-1"
        aria-label="Choose chat background"
        onchange={event => {
          void chooseImage(event.currentTarget.files?.[0])
          event.currentTarget.value = ''
        }}
      >
      <Button
        text="Upload background"
        iconComponent={UploadIcon}
        style="soft"
        disabled={model.saving}
        onClick={() => fileInput.click()}
      />
      <Button
        text="No background"
        style={draft.image ? 'ghost' : 'soft'}
        disabled={model.saving}
        onClick={() => {
          draft.image = ''
          saved = false
        }}
      />
    </div>
    <label class="flex min-w-0 flex-col gap-1 text-sm"
      >Image URL<input
        aria-label="Background image URL"
        type="url"
        placeholder="https://…"
        class="min-w-0 w-full rounded-lg border border-border bg-surface px-3 py-2"
        value={draft.image.startsWith('data:') ? '' : draft.image}
        disabled={model.saving}
        oninput={event => {
          draft.image = event.currentTarget.value
          error = ''
          saved = false
        }}
      ></label
    >
    <div class="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
      <label class="flex flex-col gap-2 text-sm"
        >Intensity · {Math.round(draft.opacity * 100)}%<input
          aria-label="Background intensity"
          type="range"
          min="0.02"
          max="0.2"
          step="0.01"
          bind:value={draft.opacity}
          disabled={model.saving}
        ></label
      >
      <label class="flex flex-col gap-2 text-sm"
        >Pattern size · {draft.size}px<input
          aria-label="Background pattern size"
          type="range"
          min="160"
          max="640"
          step="20"
          bind:value={draft.size}
          disabled={model.saving}
        ></label
      >
    </div>
    <section
      aria-label="Chat background preview"
      style={chatAppearanceStyle(
        ChatAppearanceSchema.safeParse(draft).success ? draft : DEFAULT_CHAT_APPEARANCE,
      )}
      class="min-w-0 space-y-4 rounded-xl border border-border bg-surface bg-[image:linear-gradient(color-mix(in_srgb,var(--color-surface)_var(--chat-background-mask),transparent),color-mix(in_srgb,var(--color-surface)_var(--chat-background-mask),transparent)),var(--chat-background-image)] bg-[length:auto,var(--chat-background-size)] bg-repeat p-5"
    >
      <p
        class="w-fit max-w-[85%] rounded-2xl border border-border bg-panel px-4 py-3 text-sm shadow-sm"
      >
        Ready for today’s collection?
      </p>
      <p
        class="ml-auto w-fit max-w-[85%] rounded-2xl border border-border bg-raised px-4 py-3 text-sm shadow-sm"
      >
        Yes, see you soon!
      </p>
    </section>
    <div class="flex items-center gap-3">
      <Button
        text={model.saving ? 'Saving…' : 'Save background'}
        disabled={!changed ||
          model.saving ||
          !ChatAppearanceSchema.safeParse(draft).success}
        onClick={async () => {
          saved = await model.save($state.snapshot(draft))
        }}
      />
      {#if saved && !changed}
        <span role="status" class="text-sm text-muted-foreground">Saved</span>
      {/if}
    </div>
  {/if}
  {#if error || model.error}
    <p role="alert" class="text-sm text-error">{error || model.error}</p>
  {/if}
</section>
