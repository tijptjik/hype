<script lang="ts">
// SVELTE
import { onDestroy } from 'svelte'
// DRAG AND DROP
import { draggable, droppable, type DragDropState } from '@thisux/sveltednd'
import { getDropIndex } from '#lib/client/services/dragDrop.js'
// COMPONENTS
import { TextInput } from '#lib/bits/custom/index.js'
import FormSection from '#lib/bits/patterns/forms/formI18nSection/components/FormSection.svelte'
// I18N
import { toLocaleKey, getLocaleKey, m } from '#lib/i18n.js'
import type { Locale } from '#lib/types.js'
// ICONS
import GripIcon from 'virtual:icons/lucide/grip-vertical'
import TrashIcon from 'virtual:icons/proicons/delete'
import PlusIcon from 'virtual:icons/proicons/add'
// API
import { translateText } from '#lib/api/translation.remote.js'
import { getLinkTitle } from '#lib/api/link.remote.js'
// VALUE CONTRACT
import { LINK_LIMIT, type LinkItem } from '#lib/properties/value.js'

let {
  value = '',
  cardinality = 'one',
  isEditing = true,
  headerAction = false,
  collapsed = false,
  onChange,
}: {
  collapsed?: boolean
  headerAction?: boolean
  value?: string | null
  cardinality?: 'one' | 'many'
  isEditing?: boolean
  onChange: (value: string) => void
} = $props()
const decoded = $derived.by(() => {
  if (!value) return { items: [] as LinkItem[], available: true }
  try {
    const parsed = JSON.parse(value)
    // Allow incomplete text while editing, but never discard unknown payload fields.
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.items) ||
      parsed.items.length > LINK_LIMIT ||
      Object.keys(parsed).some(key => key !== 'version' && key !== 'items') ||
      parsed.items.some(
        (item: LinkItem) =>
          !item ||
          typeof item.id !== 'string' ||
          typeof item.url !== 'string' ||
          !item.label ||
          typeof item.label !== 'object' ||
          Array.isArray(item.label) ||
          Object.keys(item).some(key => !['id', 'url', 'label'].includes(key)) ||
          Object.entries(item.label).some(
            ([key, label]) =>
              !['en', 'zhHans', 'zhHant'].includes(key) || typeof label !== 'string',
          ),
      ) ||
      new Set(parsed.items.map((item: LinkItem) => item.id)).size !==
        parsed.items.length
    )
      throw new Error('Unsupported value')
    return { items: parsed.items as LinkItem[], available: true }
  } catch {
    return { items: [] as LinkItem[], available: false }
  }
})
let titleStatus = $state<Record<string, string>>({})
const requestedUrls = new Map<string, string>()
let active = true
onDestroy(() => {
  active = false
})
let editGeneration = 0
$effect(() => {
  if (!isEditing) {
    // Ending an edit invalidates pending work even if the editor is reopened later.
    editGeneration += 1
    requestedUrls.clear()
    titleStatus = {}
  }
})

/** Fills an empty label only while the same pasted URL still belongs to this item. */
async function lookupTitle(id: string, url: string): Promise<void> {
  if (
    !active ||
    !isEditing ||
    !/^https?:\/\//i.test(url) ||
    requestedUrls.get(id) === url
  )
    return
  const generation = editGeneration
  requestedUrls.set(id, url)
  titleStatus[id] = 'Looking up page title…'
  try {
    const result = await getLinkTitle({ url, meta: { isAdminRequest: true } })
    // A detached or read-only editor no longer owns delayed autofill results.
    if (!active || !isEditing || generation !== editGeneration) return
    const current = decoded.items.find(item => item.id === id)
    if (!current || current.url !== url) return
    if (result && !current.label[result.locale]?.trim()) {
      update(id, result.locale, result.title)
      titleStatus[id] = 'Page title added — you can edit it.'
    } else titleStatus[id] = result ? '' : 'No title available. Enter link text below.'
  } catch {
    if (
      active &&
      isEditing &&
      generation === editGeneration &&
      decoded.items.some(item => item.id === id && item.url === url)
    )
      titleStatus[id] = 'Could not fetch the title. Enter link text below.'
  }
}
const dragId = $props.id()
const dragGroup = `feature-links-${dragId}`
const locales = ['en', 'zhHant', 'zhHans'] as const
function save(items: LinkItem[]): void {
  onChange(JSON.stringify({ version: 1, items }))
}
function update(
  id: string,
  field: 'url' | (typeof locales)[number],
  value: string,
): void {
  save(
    decoded.items.map(item =>
      item.id !== id
        ? item
        : field === 'url'
          ? { ...item, url: value }
          : { ...item, label: { ...item.label, [field]: value } },
    ),
  )
}
function move(index: number, offset: number): void {
  if (index + offset < 0 || index + offset >= decoded.items.length) return
  const items = [...decoded.items]
  const [item] = items.splice(index, 1)
  items.splice(index + offset, 0, item)
  save(items)
}
/** Reorders only links from this field, retaining IDs and all locale text. */
function dropLink(state: DragDropState, targetId: string): void {
  const ids = decoded.items.map(item => item.id)
  const index = getDropIndex(state, ids, targetId, dragGroup)
  const dragged = state.draggedItem as { id?: string } | null
  if (index === null || !dragged?.id) return
  const from = ids.indexOf(dragged.id)
  move(from, index - from)
}
/** Uses the same translation service as descriptor forms, without overwriting newer edits. */
async function translateLabel(
  id: string,
  source: Locale,
  target: Locale,
): Promise<void | boolean> {
  const sourceKey = toLocaleKey(source),
    targetKey = toLocaleKey(target)
  const item = decoded.items.find(item => item.id === id)
  const text = item?.label[sourceKey]?.trim()
  if (!active || !isEditing || !item || !text) return false
  const generation = editGeneration
  const previous = item.label[targetKey] ?? ''
  const [translated] = await translateText({
    source: sourceKey,
    target: targetKey,
    texts: [text],
  })
  const current = decoded.items.find(item => item.id === id)
  if (
    active &&
    isEditing &&
    generation === editGeneration &&
    translated &&
    current?.url === item.url &&
    current.label[sourceKey]?.trim() === text &&
    (current.label[targetKey] ?? '') === previous
  )
    update(id, targetKey, translated.slice(0, 256))
}
/** Whether there are link rows to collapse.
 * @returns True when at least one supported link exists.
 */
export function hasItems(): boolean {
  return decoded.available && decoded.items.length > 0
}
/** Whether this collection permits another link.
 * @returns True for editable supported values below the cardinality limit.
 */
export function canAdd(): boolean {
  return (
    decoded.available &&
    decoded.items.length < (cardinality === 'many' ? LINK_LIMIT : 1)
  )
}
/** Append an empty link while preserving stable IDs.
 * @returns Nothing; emits the updated collection.
 */
export function add(): void {
  if (canAdd())
    save([...decoded.items, { id: crypto.randomUUID(), url: '', label: {} }])
}
</script>

<div
  class={[
    '@container/links flex min-w-0 flex-1 flex-col',
    collapsed ? 'gap-0' : 'gap-4',
  ]}
>
  {#if !decoded.available}
    <p role="status">
      This value requires a newer editor. The stored value is preserved.
    </p>
  {:else}
    {#each decoded.items as item, index (item.id)}
      <section
        aria-label={`Link ${index + 1}`}
        class={[
          'border-border min-w-0 border-b last:border-0',
          collapsed ? 'py-2' : 'space-y-3 pb-5',
        ]}
        use:draggable={{
          container: `${dragGroup}-${item.id}`,
          containerGroup: dragGroup,
          dragData: { id: item.id },
          handle: '[data-link-drag-handle]',
          disabled: !isEditing || decoded.items.length < 2,
          attributes: { draggingClass: 'opacity-40' },
        }}
        use:droppable={{
          container: `${dragGroup}-${item.id}`,
          containerGroup: dragGroup,
          disabled: !isEditing,
          callbacks: { onDrop: state => dropLink(state, item.id) },
          attributes: { dragOverClass: 'ring-2' },
        }}
      >
        <div class="grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div class="flex min-w-0 items-center gap-2">
            {#if isEditing && (collapsed || decoded.items.length > 1)}
              <button
                type="button"
                data-link-drag-handle
                disabled={decoded.items.length < 2}
                aria-label={`Reorder link ${index + 1}`}
                data-tooltip="Drag to reorder; Alt + arrow keys to move"
                class="text-muted-foreground hover:bg-primary/10 hover:text-primary flex size-8 shrink-0 cursor-grab items-center justify-center rounded active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
                onkeydown={event => {
                  if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
                    event.preventDefault()
                    move(index, event.key === 'ArrowUp' ? -1 : 1)
                  }
                }}
              >
                <GripIcon class="size-5" />
              </button>
            {/if}
            {#if collapsed}
              <span
                class="text-foreground block min-w-0 flex-1 text-base leading-6 font-medium break-words"
                data-tooltip={item.label[getLocaleKey()]?.trim() ||
                  item.label.en?.trim() ||
                  m.property__link_untitled()}
                >{item.label[getLocaleKey()]?.trim() ||
                  item.label.en?.trim() ||
                  m.property__link_untitled()}</span
              >
            {:else}
              <label
                for={`${dragId}-${item.id}-url`}
                class="text-muted-foreground text-xs font-semibold"
                >URL</label
              >
            {/if}
          </div>
          {#if isEditing}
            <button
              type="button"
              aria-label={`Remove link ${index + 1}`}
              data-tooltip="Remove link"
              class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex size-8 items-center justify-center rounded"
              onclick={() => save(decoded.items.filter(link => link.id !== item.id))}
            >
              <TrashIcon class="size-5" />
            </button>
          {/if}
        </div>
        {#if !collapsed}
          <TextInput
            name=""
            id={`${dragId}-${item.id}-url`}
            label=""
            value={item.url}
            {isEditing}
            placeholder="https://"
            inputAttrs={{
              type: 'url',
              maxlength: 2048,
              required: true,
              onpaste: (event: ClipboardEvent) => {
                const pasted = event.clipboardData?.getData('text').trim() ?? ''
                if (/^https?:\/\//i.test(pasted)) {
                  event.preventDefault()
                  update(item.id, 'url', pasted)
                  void lookupTitle(item.id, pasted)
                }
              },
              onblur: (event: FocusEvent) => {
                void lookupTitle(
                  item.id,
                  (event.currentTarget as HTMLInputElement).value.trim(),
                )
              },
            }}
            onValueChange={text => update(item.id, 'url', text)}
          />
          {#if isEditing && titleStatus[item.id]}
            <p role="status" class="text-muted-foreground text-xs">
              {titleStatus[item.id]}
            </p>
          {/if}
          <div class="grid min-w-0 grid-cols-1 gap-y-4 @min-[780px]/links:grid-cols-3">
            {#each locales as locale}
              <FormSection
                {locale}
                {isEditing}
                showTranslationBar={true}
                cardClass={String.raw`relative min-w-0 border-border px-0 pt-10 [&_.bits-form\_\_i18n-translation]:top-0! [&_.bits-form\_\_i18n-translation]:right-0! [&_.bits-form\_\_i18n-translation-bar]:mt-0! [&_.bits-form\_\_i18n-translation-bar]:absolute [&_.bits-form\_\_i18n-translation-bar]:top-0 @min-[780px]/links:px-3 @min-[780px]/links:first:pl-0 @min-[780px]/links:last:pr-0 @min-[780px]/links:border-r @min-[780px]/links:last:border-0`}
                contentClass="pb-1"
                localeCodeClass="relative! right-auto! top-auto! flex h-8 items-center text-xs font-semibold uppercase tracking-widest text-primary"
                onTranslate={(source, target) =>
                  translateLabel(item.id, source, target)}
                onResetLocale={target => update(item.id, toLocaleKey(target), '')}
              >
                <label
                  for={`${dragId}-${item.id}-${locale}`}
                  class="text-muted-foreground absolute top-0 left-0 flex h-8 items-center text-xs font-semibold @min-[780px]/links:left-3"
                  >Link text</label
                >
                <TextInput
                  name=""
                  id={`${dragId}-${item.id}-${locale}`}
                  label=""
                  value={item.label[locale] ?? ''}
                  {locale}
                  isTranslated={locale !== getLocaleKey()}
                  {isEditing}
                  inputAttrs={{
                    maxlength: 256,
                    'aria-label': `Link text — ${locale === 'en' ? 'English' : locale === 'zhHant' ? '繁體中文' : '简体中文'}`,
                  }}
                  onValueChange={text => update(item.id, locale, text)}
                />
              </FormSection>
            {/each}
          </div>
        {/if}
      </section>
    {/each}
    {#if isEditing && !headerAction && canAdd()}
      <button
        type="button"
        class="border-primary/25 text-primary hover:bg-primary/10 inline-flex min-h-9 items-center gap-2 self-start rounded border px-3 text-sm"
        onclick={add}
      >
        <PlusIcon class="size-4" />Add link
      </button>
    {/if}
  {/if}
</div>
