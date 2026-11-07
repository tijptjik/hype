<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// THIRD-PARTY
import { Dialog } from 'bits-ui'
// API
import { getFeatureGalleryRevisionEditor, saveFeatureGalleryRevision } from '#lib/api/featureRevisions.remote.js'
import { translateContentField } from '#lib/api/translation.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
import { canonicalContentTag, contentFormKey } from '#lib/i18n/contentRecords.js'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/button/index.js'
import FeatureProfileEditor from '../forms/featureLocation/FeatureProfileEditor.svelte'
import { VIEWER_CONTROLS_BUTTON_CLASSES } from '../images/components/controls/ViewerControls.styles'
// ICONS
import TextIcon from 'virtual:icons/proicons/text'
// TYPES
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { ProfileLocaleState } from '../forms/featureLocation/profileLocales'
import type { ProfileValues } from '../forms/featureLocation/profileTranslation'

let { featureId, imageId, isDirty = false, onSaved }: {
  featureId: string
  imageId: string | null
  isDirty?: boolean
  onSaved: () => void
} = $props()
type Field = 'caption' | 'alt'
let open = $state(false)
let gallery = $state<FeatureRevisionContent['gallery'] | null>(null)
let baseRevisionId = $state('')
let editingImageId = $state('')
let values = $state<ProfileValues<Field>>({})
let localeState = $state<ProfileLocaleState>({ selectedLocales: [], visibleLocales: [], expanded: false })
let loading = $state(false)
let busy = $state(false)
let message = $state('')
let changed = $state(false)
let loadSequence = 0
const disabled = $derived(busy || isDirty)

/** Loads exact accepted membership without exposing other private Feature content.
 * @returns Completion after the selected image's isolated text draft is ready.
 */
async function load(): Promise<void> {
  const requested = featureId
  const selected = imageId
  const sequence = ++loadSequence
  loading = true
  gallery = null
  changed = false
  message = ''
  try {
    const result = await refreshRemoteQuery(getFeatureGalleryRevisionEditor({ featureId: requested, meta: { isAdminRequest: true } }))
    if (!open || requested !== featureId || selected !== imageId || sequence !== loadSequence) return
    if (!result.enabled || !selected || !result.gallery.entries[selected]) {
      message = m.image_text_unavailable()
      return
    }
    gallery = structuredClone(result.gallery)
    baseRevisionId = result.comparisonRevisionId
    editingImageId = selected
    const entry = gallery.entries[selected]
    // Include stored text locales even when they are absent from the profile defaults.
    const locales = [...new Set([...result.locales, ...Object.keys(entry.caption), ...Object.keys(entry.alt)]
      .map(canonicalContentTag))]
    if (!locales.length) locales.push(canonicalContentTag(getLocaleKey()))
    values = {}
    for (const [locale, caption] of Object.entries(entry.caption))
      values[contentFormKey(locale)] = { ...values[contentFormKey(locale)], caption }
    for (const [locale, alt] of Object.entries(entry.alt))
      values[contentFormKey(locale)] = { ...values[contentFormKey(locale)], alt }
    localeState = { selectedLocales: locales, visibleLocales: [...locales], expanded: false }
  } catch (cause) {
    if (sequence === loadSequence) message = cause instanceof Error ? cause.message : m.image_text_load_failed()
  } finally {
    if (sequence === loadSequence) loading = false
  }
}

/** Updates one locale without discarding hidden or untranslated text.
 * @param field Text field being edited. @param locale Content locale tag.
 * @param text Authored or translated text. @returns Nothing.
 */
function edit(field: Field, locale: string, text: string): void {
  const key = contentFormKey(locale)
  values[key] = { ...values[key], [field]: text }
  changed = true
}

/** Saves only the selected image's text with attributed history.
 * @returns Completion after save or a recoverable error; failed drafts remain open.
 */
async function save(): Promise<void> {
  if (!gallery || disabled || loading || !changed || editingImageId !== imageId) return
  busy = true
  message = ''
  try {
    const entry = gallery.entries[editingImageId]
    const text = { caption: { ...entry.caption }, alt: { ...entry.alt } }
    // Retain existing storage aliases while writing new locales as canonical content tags.
    for (const field of ['caption', 'alt'] as const) {
      for (const [locale, row] of Object.entries(values)) {
        if (row?.[field] == null) continue
        const stored = Object.keys(text[field]).find(tag => contentFormKey(tag) === locale)
        text[field][stored ?? canonicalContentTag(locale)] = row[field]
      }
    }
    await saveFeatureGalleryRevision({ featureId, meta: { isAdminRequest: true }, baseRevisionId,
      order: gallery.order, text: { [editingImageId]: text } })
    open = false
    onSaved()
  } catch (cause) {
    message = cause instanceof Error ? cause.message : m.image_text_save_failed()
  } finally { busy = false }
}

/** Opens a fresh draft or dismisses it without saving.
 * @param next Requested dialog visibility. @returns Nothing.
 */
function setOpen(next: boolean): void {
  if (busy) return
  open = next
  if (next) void load()
  else { loadSequence++; loading = false; gallery = null }
}

$effect(() => {
  featureId
  imageId
  untrack(() => { if (open && !busy) setOpen(false) })
})
</script>

<Dialog.Root {open} onOpenChange={setOpen}>
  <Dialog.Trigger type="button" disabled={disabled || !imageId}>
    {#snippet child({ props })}
      <Button attrs={props} type="button" text={m.image_text_edit()} iconComponent={TextIcon}
        iconClasses="h-[22px] w-[22px]" class={VIEWER_CONTROLS_BUTTON_CLASSES}
        style="transparent" modifier="circle" hideLabel={true} disabled={disabled || !imageId}
        onClick={event => { if (typeof props.onclick === 'function') props.onclick(event) }} />
    {/snippet}
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay class="bits-dialog__overlay" />
    <Dialog.Content class="fixed left-1/2 top-1/2 z-[71] flex max-h-[calc(100dvh-2rem)] w-[56rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-panel text-foreground shadow-xl bits-theme"
      onEscapeKeydown={event => { if (busy) event.preventDefault() }}
      onInteractOutside={event => { if (busy) event.preventDefault() }}>
      <Dialog.Title class="px-6 pt-6 pb-4 text-lg font-semibold">{m.image_text_edit()}</Dialog.Title>
      <div class="min-h-0 overflow-y-auto" aria-busy={loading || busy}>
        {#if gallery && !loading}
          <FeatureProfileEditor {localeState} onLocaleStateChange={state => { localeState = state }}
            {values} contextKey={`${featureId}:${editingImageId}:${open}`} isEditing={!disabled}
            fieldConfigs={[{ key: 'caption', label: m.image_text_caption() }, { key: 'alt', label: m.image_text_alt() }]}
            translate={(source, target, text) => translateContentField({ source, target, text })}
            onTranslated={edit}>
            {#snippet children(field, locale, onEditStart, prefix)}
              <label class="grid min-w-0 gap-2 text-sm">
                <span class="sr-only">{field === 'caption' ? m.image_text_caption() : m.image_text_alt()} · {locale}</span>
                {#if prefix}<span class="text-xs text-muted-foreground">{prefix}</span>{/if}
                <textarea class="min-h-28 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-foreground outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
                  lang={canonicalContentTag(locale)} disabled={disabled} maxlength={field === 'caption' ? 4000 : 2000}
                  value={values[contentFormKey(locale)]?.[field] ?? ''}
                  oninput={event => { onEditStart(); edit(field, locale, event.currentTarget.value) }}></textarea>
              </label>
            {/snippet}
          </FeatureProfileEditor>
        {:else if loading}
          <p role="status" class="px-6 pb-6 text-sm text-muted-foreground">{m.image__metadata_loading()}</p>
        {/if}
        {#if message}<p role="status" class="px-6 pb-4 text-sm text-error">{message}</p>{/if}
      </div>
      <div class="flex justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" text={m.cancel()} style="transparent" disabled={busy} onClick={() => setOpen(false)} />
        <Button type="button" text={m.forms__save()} disabled={disabled || loading || !gallery || !changed} onClick={() => void save()} />
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
