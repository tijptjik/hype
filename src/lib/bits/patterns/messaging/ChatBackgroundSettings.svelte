<script lang="ts">
// ICONS
import UploadIcon from 'virtual:icons/lucide/upload'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import Select from '#lib/bits/core/select/Select.svelte'
// COMPONENTS
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
import ChatBackgroundPreview from './ChatBackgroundPreview.svelte'
import ImageIcon from 'virtual:icons/proicons/photo'
// MESSAGING
import {
  chatAppearanceStyle,
  ChatAppearanceSchema,
  DEFAULT_CHAT_APPEARANCE,
  TOASTIE_CHAT_BACKGROUND,
  type ChatAppearance,
} from '#lib/messaging/appearance.js'

let {
  appearance,
  disabled = true,
  issues = [],
  onChange,
}: {
  appearance: ChatAppearance
  disabled?: boolean
  issues?: string[]
  onChange: (appearance: ChatAppearance) => void
} = $props()
const draft = $derived(appearance)
let fileInput = $state<HTMLInputElement>()
let error = $state('')
let imageReadVersion = 0
// Leaving edit mode or replacing the form draft also invalidates in-flight file reads.
$effect(() => {
  appearance
  disabled
  imageReadVersion += 1
  error = ''
})
const backgroundChoice = $derived(
  !draft.image
    ? 'none'
    : draft.image === TOASTIE_CHAT_BACKGROUND
      ? 'toastie'
      : 'custom',
)
const backgroundOptions = $derived([
  { value: 'none', label: 'No background' },
  { value: 'toastie', label: 'Toastie & friends' },
  ...(backgroundChoice === 'custom'
    ? [
        {
          value: 'custom',
          label: 'Uploaded image',
        },
      ]
    : []),
])

/** Read a small raster tile for durable, provider-independent background storage.
 * @param file Explicitly selected image; the organisation form owns persistence.
 * @returns Completion after validation and a local preview.
 */
async function chooseImage(file?: File): Promise<void> {
  if (!file || disabled) return
  const version = imageReadVersion
  error = ''
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
    if (!disabled && version === imageReadVersion) onChange({ ...draft, image })
  } catch {
    if (disabled || version !== imageReadVersion) return
    error = 'Unable to read this image. Try another file.'
  }
}
</script>

<section
  aria-label="Chat background"
  class="border-border @container flex w-full max-w-full min-w-0 flex-col border-t"
>
  <SectionHeader
    icon={ImageIcon}
    title="Chat background"
    description="Shared across this organisation’s Telegram and WhatsApp chats."
  />
  <div class="px-6 py-6">
    <div
      class="grid min-w-0 grid-cols-1 items-start gap-6 @min-[52rem]:grid-cols-[var(--messaging-settings-card-width,360px)_minmax(0,1fr)]"
    >
      <div
        class="border-border bg-foreground/2 flex w-full max-w-[var(--messaging-settings-card-width,360px)] min-w-0 flex-col gap-5 rounded-xl border p-5"
      >
        <fieldset class="min-w-0">
          <legend class="mb-2 text-sm font-medium">Background image</legend>
          <input
            bind:this={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            class="sr-only"
            tabindex="-1"
            aria-label="Choose chat background"
            {disabled}
            onchange={event => {
              void chooseImage(event.currentTarget.files?.[0])
              event.currentTarget.value = ''
            }}
          >
          <div
            class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3"
          >
            <Select
              value={backgroundChoice}
              items={backgroundOptions}
              placeholder="Background image"
              triggerAttrs={{ 'aria-label': 'Background image' }}
              triggerClass="h-auto! min-h-9! min-w-0 gap-2 py-1.5! text-sm! [&>span]:overflow-visible! [&>span]:pl-0! [&>span]:whitespace-normal!"
              {disabled}
              onValueChange={value => {
                if (value === 'custom') return
                if (disabled) return
                onChange({
                  ...draft,
                  image: value === 'toastie' ? TOASTIE_CHAT_BACKGROUND : '',
                })
                error = ''
              }}
            />
            <span aria-hidden="true" class="border-border h-6 border-l"></span>
            <Button
              text="Upload background"
              size="sm"
              iconComponent={UploadIcon}
              modifier="square"
              hideLabelInstantly
              class="size-9! shrink-0 rounded-lg!"
              attrs={{ title: 'Upload background' }}
              style="ghost"
              {disabled}
              onClick={() => fileInput?.click()}
            />
          </div>
        </fieldset>
        <div class="grid min-w-0 grid-cols-1 gap-5">
          <label class="flex flex-col gap-2 text-sm"
            ><span class="flex items-center justify-between gap-3"
              ><span class="font-medium">Intensity</span
              ><span class="text-muted-foreground tabular-nums"
                >{Math.round(draft.opacity * 100)}%</span
              ></span
            ><input
              aria-label="Background intensity"
              type="range"
              class="accent-primary w-full min-w-0"
              min="0.02"
              max="0.2"
              step="0.01"
              value={draft.opacity}
              oninput={event => {
                if (!disabled)
                  onChange({ ...draft, opacity: event.currentTarget.valueAsNumber })
              }}
              {disabled}
            ></label
          >
          <label class="flex flex-col gap-2 text-sm"
            ><span class="flex items-center justify-between gap-3"
              ><span class="font-medium">Pattern size</span
              ><span class="text-muted-foreground tabular-nums"
                >{draft.size}px</span
              ></span
            ><input
              aria-label="Background pattern size"
              type="range"
              class="accent-primary w-full min-w-0"
              min="160"
              max="640"
              step="20"
              value={draft.size}
              oninput={event => {
                if (!disabled)
                  onChange({ ...draft, size: event.currentTarget.valueAsNumber })
              }}
              {disabled}
            ></label
          >
        </div>
      </div>
      <div class="flex min-w-0 flex-col gap-2">
        <span class="text-sm font-medium">Preview</span>
        <section
          aria-label="Chat background preview"
          style={chatAppearanceStyle(
            ChatAppearanceSchema.safeParse(draft).success
              ? draft
              : DEFAULT_CHAT_APPEARANCE,
          )}
          class="border-border bg-surface min-h-64 min-w-0 flex-1 rounded-xl border bg-[image:linear-gradient(color-mix(in_srgb,var(--color-surface)_var(--chat-background-mask),transparent),color-mix(in_srgb,var(--color-surface)_var(--chat-background-mask),transparent)),var(--chat-background-image)] bg-[length:auto,var(--chat-background-size)] bg-repeat p-5"
        >
          <ChatBackgroundPreview />
        </section>
      </div>
    </div>
    {#if error}
      <p role="alert" class="text-error text-sm">{error}</p>
    {/if}
    {#each issues as issue}
      <p role="alert" class="text-error text-sm">{issue}</p>
    {/each}
  </div>
</section>
