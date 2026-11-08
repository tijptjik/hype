<script lang="ts">
// SVELTE
import { tick, untrack } from 'svelte'
// THIRD-PARTY
import { Dialog } from 'bits-ui'
// API
import {
  getFeatureGalleryRevisionEditor,
  saveFeatureGalleryRevision,
} from '#lib/api/featureRevisions.remote.js'
import { translateContentField } from '#lib/api/translation.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
import { canonicalContentTag, contentFormKey } from '#lib/i18n/contentRecords.js'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/button/index.js'
import TextAreaField from '#lib/bits/custom/form/TextAreaField.svelte'
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
import { contentLocaleOptions } from '../forms/contentLocaleDefaults/contentLocaleOptions'
import FeatureProfileEditor from '../forms/featureLocation/FeatureProfileEditor.svelte'
import { VIEWER_CONTROLS_BUTTON_CLASSES } from '../images/components/controls/ViewerControls.styles'
// ICONS
import TextIcon from 'virtual:icons/proicons/text'
// TYPES
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { ProfileLocaleState } from '../forms/featureLocation/profileLocales'
import type { ProfileValues } from '../forms/featureLocation/profileTranslation'

let {
  featureId = '',
  imageId,
  source,
  onOpenChange,
  hasText = false,
  isDirty = false,
  multilingualExpanded,
  onMultilingualExpandedChange,
  onSaved,
}: {
  featureId?: string
  source?: {
    load: () => Promise<{
      enabled: boolean
      gallery: FeatureRevisionContent['gallery']
      comparisonRevisionId: string
      locales: string[]
    }>
    save: (
      imageId: string,
      text: { caption: Record<string, string>; alt: Record<string, string> },
    ) => Promise<void>
  }
  onOpenChange?: (open: boolean) => void
  imageId: string | null
  hasText?: boolean
  isDirty?: boolean
  multilingualExpanded?: boolean
  onMultilingualExpandedChange?: (expanded: boolean) => void
  onSaved: () => void
} = $props()
type Field = 'caption' | 'alt'
// Generated message namespaces can lag new keys during a live development update.
// Keep the editor usable until the browser receives the rebuilt namespace.
const labels = $derived({
  edit: m.image_text_edit?.() ?? 'Edit image text',
  caption: m.image_text_caption?.() ?? 'Caption',
  alt: m.image_text_alt?.() ?? 'Alt text',
  unavailable:
    m.image_text_unavailable?.() ?? 'Text editing is unavailable for this photo.',
  loadFailed:
    m.image_text_load_failed?.() ?? 'Could not load image text. Close and try again.',
  saveFailed: m.image_text_save_failed?.() ?? 'Could not save image text.',
})
let open = $state(false)
let gallery = $state<FeatureRevisionContent['gallery'] | null>(null)
let baseRevisionId = $state('')
let editingImageId = $state('')
let values = $state<ProfileValues<Field>>({})
let localeState = $state<ProfileLocaleState>({
  selectedLocales: [],
  visibleLocales: [],
  expanded: false,
})
// Task and caption controls share expansion while retaining their own language selections.
const effectiveLocaleState = $derived({
  ...localeState,
  expanded: multilingualExpanded ?? localeState.expanded,
})

/** Updates caption languages and shares multilingual expansion with the task.
 * @param state Caption locale selection and expansion.
 * @returns Nothing.
 */
function updateCaptionLocales(state: ProfileLocaleState): void {
  const expansionChanged = state.expanded !== effectiveLocaleState.expanded
  localeState = state
  if (expansionChanged) onMultilingualExpandedChange?.(state.expanded)
}

let loading = $state(false)
let busy = $state(false)
let message = $state('')
let changed = $state(false)
let loadSequence = 0
let triggerElement: HTMLButtonElement | null = null
let introTransition = $state(false)
let imageBounds = $state<{
  left: number
  top: number
  width: number
  height: number
} | null>(null)

/** Anchor the scrim and editor to the visible image viewport.
 * @returns Nothing; viewport geometry is refreshed during scrolling and resizing.
 */
function updateImageBounds(): void {
  const viewport = triggerElement?.closest('[data-image-editor-viewport]')
  if (!viewport) {
    imageBounds = null
    return
  }
  const rect = viewport.getBoundingClientRect()
  const left = Math.max(0, rect.left)
  const top = Math.max(0, rect.top)
  imageBounds = {
    left,
    top,
    width: Math.max(0, Math.min(innerWidth, rect.right) - left),
    height: Math.max(0, Math.min(innerHeight, rect.bottom) - top),
  }
}

$effect(() => {
  if (!open) return
  const viewport = triggerElement?.closest('[data-image-editor-viewport]')
  const observer = new ResizeObserver(updateImageBounds)
  if (viewport) observer.observe(viewport)
  window.addEventListener('resize', updateImageBounds)
  window.addEventListener('scroll', updateImageBounds, true)
  return () => {
    observer.disconnect()
    window.removeEventListener('resize', updateImageBounds)
    window.removeEventListener('scroll', updateImageBounds, true)
  }
})
const overlayStyle = $derived(
  imageBounds
    ? `inset:auto;left:${imageBounds.left}px;top:${imageBounds.top}px;width:${imageBounds.width}px;height:${imageBounds.height}px`
    : undefined,
)
const editorStyle = $derived(
  [
    introTransition ? 'view-transition-name:feature-image-text' : '',
    imageBounds
      ? `left:${imageBounds.left + imageBounds.width / 2}px;top:${imageBounds.top + imageBounds.height / 2}px;max-width:${Math.max(0, imageBounds.width - 32)}px;max-height:${Math.max(0, imageBounds.height - 32)}px`
      : '',
  ]
    .filter(Boolean)
    .join(';'),
)
// Accepted reads and successful saves update the indicator; unsaved drafts do not.
let acceptedText = $state<Record<string, boolean>>({})
const hasImageText = $derived(
  imageId && Object.hasOwn(acceptedText, imageId) ? acceptedText[imageId] : hasText,
)
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
    // Review adapters keep draft text on the proposal instead of publishing a Feature revision.
    const result = source
      ? await source.load()
      : await refreshRemoteQuery(
          getFeatureGalleryRevisionEditor({
            featureId: requested,
            meta: { isAdminRequest: true },
          }),
        )
    if (requested !== featureId || selected !== imageId || sequence !== loadSequence)
      return
    if (!result.enabled || !selected || !result.gallery.entries[selected]) {
      message = labels.unavailable
      return
    }
    gallery = structuredClone(result.gallery)
    baseRevisionId = result.comparisonRevisionId
    editingImageId = selected
    const entry = gallery.entries[selected]
    acceptedText[selected] = [
      ...Object.values(entry.caption),
      ...Object.values(entry.alt),
    ].some(text => text.trim().length > 0)
    // Include stored text locales even when they are absent from the profile defaults.
    const locales = [
      ...new Set(
        [
          ...result.locales,
          ...Object.keys(entry.caption),
          ...Object.keys(entry.alt),
        ].map(canonicalContentTag),
      ),
    ]
    if (!locales.length) locales.push(canonicalContentTag(getLocaleKey()))
    values = {}
    for (const [locale, caption] of Object.entries(entry.caption))
      values[contentFormKey(locale)] = { ...values[contentFormKey(locale)], caption }
    for (const [locale, alt] of Object.entries(entry.alt))
      values[contentFormKey(locale)] = { ...values[contentFormKey(locale)], alt }
    localeState = {
      selectedLocales: locales,
      visibleLocales: [...locales],
      expanded: false,
    }
  } catch (cause) {
    if (sequence === loadSequence)
      message = cause instanceof Error ? cause.message : labels.loadFailed
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
        const stored = Object.keys(text[field]).find(
          tag => contentFormKey(tag) === locale,
        )
        text[field][stored ?? canonicalContentTag(locale)] = row[field]
      }
    }
    if (source) await source.save(editingImageId, text)
    else
      await saveFeatureGalleryRevision({
        featureId,
        meta: { isAdminRequest: true },
        baseRevisionId,
        order: gallery.order,
        text: { [editingImageId]: text },
      })
    acceptedText[editingImageId] = [
      ...Object.values(text.caption),
      ...Object.values(text.alt),
    ].some(value => value.trim().length > 0)
    open = false
    onSaved()
  } catch (cause) {
    message = cause instanceof Error ? cause.message : labels.saveFailed
  } finally {
    busy = false
  }
}

/** Grows the text button into the loaded, centered editor with the native transition API.
 * @returns Completion after the intro; reduced motion and unsupported browsers open immediately.
 * @remarks Load before capture so the transition lands at the editor's actual size.
 */
async function openFromTrigger(): Promise<void> {
  const requestedFeature = featureId
  const requestedImage = imageId
  const source = triggerElement
  updateImageBounds()
  await load()
  if (requestedFeature !== featureId || requestedImage !== imageId || disabled) return
  if (
    !source?.isConnected ||
    !document.startViewTransition ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    open = true
    return
  }

  // Transfer the shared snapshot name from the toolbar button to the centered modal.
  introTransition = true
  source.style.viewTransitionName = 'feature-image-text'
  try {
    await document.startViewTransition(async () => {
      source.style.viewTransitionName = ''
      open = true
      await tick()
    }).finished
  } catch {
    // Skipped or superseded animations leave the dialog's accepted open state intact.
  } finally {
    source.style.viewTransitionName = ''
    introTransition = false
  }
}

/** Opens a fresh draft or dismisses it without saving.
 * @param next Requested dialog visibility. @returns Nothing.
 */
function setOpen(next: boolean): void {
  if (busy) return
  if (next) {
    if (!loading && !introTransition) void openFromTrigger()
    return
  }
  open = false
  loadSequence++
  loading = false
  gallery = null
}

$effect(() => {
  onOpenChange?.(open)
})

$effect(() => {
  featureId
  imageId
  untrack(() => {
    if (open && !busy) setOpen(false)
  })
})
</script>

<Dialog.Root {open} onOpenChange={setOpen}>
  <Dialog.Trigger
    type="button"
    disabled={disabled || loading || introTransition || !imageId}
  >
    {#snippet child({ props })}
      <!-- Keep opening under our control until the loaded modal can replace the button snapshot. -->
      <Button
        attrs={{ ...props, onclick: undefined, onkeydown: undefined }}
        type="button"
        text={labels.edit}
        iconComponent={TextIcon}
        iconClasses={`h-[22px] w-[22px] ${hasImageText ? 'text-blue-500 dark:text-info' : ''}`}
        class={VIEWER_CONTROLS_BUTTON_CLASSES}
        style="transparent"
        modifier="circle"
        hideLabel={true}
        disabled={disabled || loading || introTransition || !imageId}
        onClick={event => {
          if (event.currentTarget instanceof HTMLButtonElement)
            triggerElement = event.currentTarget
          setOpen(true)
        }}
      />
    {/snippet}
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay class="bits-dialog__overlay" style={overlayStyle} />
    <Dialog.Content
      style={editorStyle}
      class="border-border bg-panel text-foreground bits-theme fixed top-1/2 left-1/2 z-[71] flex max-h-[calc(100dvh-2rem)] w-[56rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border shadow-xl"
      onEscapeKeydown={event => {
        if (busy) event.preventDefault()
      }}
      onInteractOutside={event => {
        if (busy) event.preventDefault()
      }}
    >
      <div class="flex min-w-0 shrink-0 items-center gap-3 px-6 pt-5 pb-4">
        <Dialog.Title class="shrink-0 text-lg font-semibold"
          >{labels.edit}</Dialog.Title
        >
        <LocaleToolbar
          {...effectiveLocaleState}
          options={contentLocaleOptions(getLocaleKey())}
          class="ml-auto min-w-0 max-sm:[&_[data-control-label]]:hidden"
          horizontal
          allowAdd={!disabled && !!gallery && !loading}
          disabled={disabled || !gallery || loading}
          onExpandedChange={expanded =>
            updateCaptionLocales({ ...effectiveLocaleState, expanded })}
          onChange={change => {
            localeState = {
              ...localeState,
              selectedLocales: change.selectedLocales,
              visibleLocales: change.visibleLocales,
            }
          }}
        />
      </div>
      <div class="min-h-0 overflow-y-auto" aria-busy={loading || busy}>
        {#if gallery && !loading}
          <FeatureProfileEditor
            showToolbar={false}
            localeState={effectiveLocaleState}
            onLocaleStateChange={updateCaptionLocales}
            {values}
            contextKey={`${featureId}:${editingImageId}:${open}`}
            isEditing={!disabled}
            fieldConfigs={[
              { key: 'caption', label: labels.caption },
              { key: 'alt', label: labels.alt },
            ]}
            translate={(source, target, text) =>
              translateContentField({ source, target, text })}
            onTranslated={edit}
          >
            {#snippet children(field, locale, onEditStart, prefix)}
              <TextAreaField
                id={`image-text-${field}-${contentFormKey(locale)}`}
                label={prefix || undefined}
                class={prefix ? '' : '[&>.bits-form__label]:hidden'}
                value={values[contentFormKey(locale)]?.[field] ?? ''}
                placeholder=" "
                {disabled}
                rows={3}
                textareaAttrs={{
                  'aria-label': `${field === 'caption' ? labels.caption : labels.alt} · ${locale}`,
                  lang: canonicalContentTag(locale),
                  maxlength: field === 'caption' ? 4000 : 2000,
                  onfocus: onEditStart,
                }}
                onValueChange={text => {
                  onEditStart()
                  edit(field, locale, text)
                }}
              />
            {/snippet}
          </FeatureProfileEditor>
        {:else if loading}
          <p role="status" class="text-muted-foreground px-6 pb-6 text-sm">
            {m.image__metadata_loading()}
          </p>
        {/if}
        {#if message}
          <p role="status" class="text-error px-6 pb-4 text-sm">{message}</p>
        {/if}
      </div>
      <div class="flex shrink-0 justify-end gap-2 px-6 py-4">
        <Button
          type="button"
          text={m.cancel()}
          style="transparent"
          disabled={busy}
          onClick={() => setOpen(false)}
        />
        <Button
          type="button"
          text={m.forms__save()}
          disabled={disabled || loading || !gallery || !changed}
          onClick={() => void save()}
        />
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
:global(::view-transition-group(feature-image-text)) {
  animation-duration: 320ms;
  animation-timing-function: cubic-bezier(0.2, 0, 0, 1);
}
:global(::view-transition-old(feature-image-text)),
:global(::view-transition-new(feature-image-text)) {
  height: 100%;
  overflow: clip;
}
</style>
