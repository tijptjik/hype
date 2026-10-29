<script lang="ts">
// SVELTE
import { onMount, tick } from 'svelte'
import type { TransitionConfig } from 'svelte/transition'
import { flip } from 'svelte/animate'
import { Popover } from 'bits-ui'
// DRAG AND DROP
import { dragHandleZone, dragHandle, type DndEvent } from 'svelte-dnd-action'
// ICONS
import LanguagesIcon from 'virtual:icons/lucide/languages'
import GripIcon from 'virtual:icons/lucide/grip-vertical'
// LOCAL
import LocaleSearch from './LocaleSearch.svelte'
import { defaultLocaleControlLabels, shortLocaleLabel } from './localeControls.js'
// TYPES
import type { LocaleChange, LocaleToolbarProps } from './localeControls.types.js'

let {
  selectedLocales,
  visibleLocales,
  options,
  expanded,
  onExpandedChange,
  onChange,
  disabled = false,
  mode = 'visibility',
  alwaysExpanded = false,
  labels = defaultLocaleControlLabels,
  class: className = '',
}: LocaleToolbarProps = $props()
const id = $props.id()
let searching = $state(false)
let announcement = $state('')
type LocaleItem = { id: string; tag: string }
let items = $state<LocaleItem[]>([])
let sorting = $state(false)
$effect(() => {
  if (!sorting) items = selectedLocales.map(tag => ({ id: tag, tag }))
})
let addButton = $state<HTMLButtonElement>()
let quietAddFocus = $state(false)
let root: HTMLDivElement
const isExpanded = $derived(alwaysExpanded || expanded)
let reducedMotion = $state(false)
onMount(() => {
  const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  if (!preference) return
  const update = (): void => {
    reducedMotion = preference.matches
  }
  update()
  preference.addEventListener?.('change', update)
  return () => preference.removeEventListener?.('change', update)
})

/** Reveal from the right-hand trigger without resizing/reflowing the locale chips.
 * @param _node Mounted locale strip.
 * @returns A clipped reveal, or an immediate change for reduced motion/settings.
 */
function revealLocales(_node: Element): TransitionConfig {
  return {
    duration: reducedMotion || alwaysExpanded ? 0 : 180,
    css: t => `clip-path: inset(0 0 0 ${(1 - t) * 100}%); opacity: ${t};`,
  }
}

/** Resolve saved tags absent from the current catalogue without dropping them. */
function optionFor(tag: string): { name: string; autonym: string } {
  return options.find(option => option.tag === tag) ?? { name: tag, autonym: tag }
}

/** Announce repeated blocked actions as well as successful intents. */
async function announce(message: string): Promise<void> {
  announcement = ''
  await tick()
  announcement = message
}

/** Return to Add without a focus ring; the next keyboard action restores visible focus. */
function restoreAddFocus(): void {
  quietAddFocus = true
  addButton?.focus({ preventScroll: true })
}

/** Close the overlay while retaining keyboard access to Add. */
function closeSearch(): void {
  searching = false
  restoreAddFocus()
}

/** Emit an atomic add/reveal request; the caller retains ownership of all state. */
async function select(tag: string): Promise<void> {
  if (disabled) return
  const exists = selectedLocales.includes(tag)
  const selected = exists ? [...selectedLocales] : [...selectedLocales, tag]
  const visible = selected.filter(
    locale => locale === tag || visibleLocales.includes(locale),
  )
  const action = exists ? 'reveal' : 'add'
  onChange({ action, locale: tag, selectedLocales: selected, visibleLocales: visible })
  searching = false
  await tick()
  restoreAddFocus()
  void announce(labels.changed(optionFor(tag).name, action))
}

/** Toggle presentation only, or explicitly remove membership in settings mode. */
function toggle(tag: string): void {
  if (disabled) return
  const removing = mode === 'membership'
  const visible = selectedLocales.filter(locale => visibleLocales.includes(locale))
  if (
    (removing && selectedLocales.length <= 1) ||
    (!removing && visible.includes(tag) && visible.length <= 1)
  ) {
    void announce(labels.atLeastOne)
    return
  }
  const selected = removing
    ? selectedLocales.filter(locale => locale !== tag)
    : [...selectedLocales]
  const nextVisible = removing
    ? selected
    : selected.filter(locale =>
        locale === tag ? !visible.includes(tag) : visible.includes(locale),
      )
  const action = removing ? 'remove' : 'toggle'
  onChange({
    action,
    locale: tag,
    selectedLocales: selected,
    visibleLocales: nextVisible,
  })
  void announce(labels.changed(optionFor(tag).name, action))
  if (removing) {
    void tick().then(() => addButton?.focus())
  }
}

/** Reorder one locale by identity; visibility and content are preserved. */
function move(tag: string, to: number, restoreFocus = true): void {
  if (disabled) return
  const from = selectedLocales.indexOf(tag)
  if (from < 0 || to < 0 || to >= selectedLocales.length || from === to) return
  const selected = [...selectedLocales]
  selected.splice(from, 1)
  selected.splice(to, 0, tag)
  const change: LocaleChange = {
    action: 'reorder',
    locale: tag,
    from,
    to,
    selectedLocales: selected,
    visibleLocales: selected.filter(locale => visibleLocales.includes(locale)),
  }
  onChange(change)
  if (restoreFocus)
    void tick().then(() =>
      Array.from(root.querySelectorAll<HTMLButtonElement>('[data-locale]'))
        .find(button => button.dataset.locale === tag)
        ?.focus(),
    )
  void announce(labels.moved(optionFor(tag).name, to + 1, selected.length))
}

/** Lift the library's pointer-following clone above the stationary chips.
 * @param element Floating clone. @returns Nothing.
 */
function liftDraggedChip(element?: HTMLElement): void {
  if (!element) return
  element.style.boxShadow = '0 10px 24px rgb(0 0 0 / 0.18)'
  element.style.cursor = 'grabbing'
}

/** Preview the insertion slot without persisting transient shadow items.
 * @param event Drag-zone preview. @returns Nothing.
 */
function considerOrder(event: CustomEvent<DndEvent<LocaleItem>>): void {
  sorting = event.detail.info.trigger !== 'dragStopped'
  items = event.detail.items
}

/** Commit the dropped order once while preserving visibility and caller ownership.
 * @param event Final drag-zone order. @returns Nothing.
 */
function finalizeOrder(event: CustomEvent<DndEvent<LocaleItem>>): void {
  items = event.detail.items
  const tag = String(event.detail.info.id)
  const to = items.findIndex(item => item.tag === tag)
  move(tag, to, event.detail.info.source !== 'keyboard')
  sorting = false
}

/** Alt+Arrow keys reorder locales without requiring pointer dragging. */
function keydown(event: KeyboardEvent, tag: string, index: number): void {
  if (
    event.altKey &&
    ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
  ) {
    event.preventDefault()
    move(tag, index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1))
  }
}
</script>

<div
  data-locale-toolbar
  bind:this={root}
  class={`group/locale-toolbar min-w-0 ${className}`}
>
  <div
    class={alwaysExpanded
      ? 'min-w-0'
      : 'flex min-h-10 min-w-0 flex-wrap items-center justify-end gap-2 sm:flex-nowrap'}
  >
    {#if isExpanded}
      <div
        id={`${id}-strip`}
        transition:revealLocales
        inert={!isExpanded}
        aria-hidden={!isExpanded}
        class={alwaysExpanded
          ? 'min-w-0'
          : 'order-2 min-w-0 basis-full sm:order-none sm:basis-auto sm:max-w-[calc(100%_-_8rem)]'}
      >
        <div class="min-w-0 overflow-hidden">
          <div
            class="flex min-w-0 flex-wrap items-center {alwaysExpanded
              ? 'justify-start'
              : 'justify-end'} gap-1.5 p-0.5"
          >
            <!-- biome-ignore lint/a11y/useSemanticElements: This drag zone groups locale controls rather than form fields. -->
            <div
              use:dragHandleZone={{
                items,
                type: id,
                flipDurationMs: reducedMotion ? 0 : 160,
                dragDisabled: disabled,
                dropFromOthersDisabled: true,
                dropTargetStyle: {},
                transformDraggedElement: liftDraggedChip,
                delayTouchStart: true,
              }}
              onconsider={considerOrder}
              onfinalize={finalizeOrder}
              role="group"
              aria-label={labels.multilingual}
              class="flex min-w-0 flex-wrap items-center {alwaysExpanded
                ? 'justify-start'
                : 'justify-end'} gap-1.5"
              data-locale-dnd-zone
            >
              {#each items as item, index (item.id)}
                {@const tag = item.tag}
                {@const option = optionFor(tag)}
                <!-- biome-ignore lint/a11y/useSemanticElements: This labels a compact locale action group, not a separate form fieldset. -->
                <div
                  role="group"
                  aria-label={option.name}
                  animate:flip={{ duration: reducedMotion ? 0 : 160 }}
                  class="flex max-w-full min-w-0 items-center rounded-md border border-border bg-panel text-foreground shadow-sm"
                >
                  <button
                    type="button"
                    use:dragHandle
                    {disabled}
                    aria-label={`Reorder ${option.name}`}
                    data-locale-handle={tag}
                    class="flex min-h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-l-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing disabled:opacity-50"
                  >
                    <GripIcon class="size-3" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    data-locale={tag}
                    aria-label={mode === 'membership'
                      ? labels.remove(option.name)
                      : option.name}
                    aria-pressed={mode === 'visibility'
                      ? visibleLocales.includes(tag)
                      : undefined}
                    {disabled}
                    aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
                    onkeydown={event => keydown(event, tag, index)}
                    onclick={() => toggle(tag)}
                    class={`inline-flex min-h-8 min-w-0 flex-1 items-center gap-1 rounded-r-md pr-2 pl-1 text-left text-xs whitespace-normal break-words focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 ${mode === 'membership' || visibleLocales.includes(tag) ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                  >
                    <span lang={tag}
                      >{mode === 'visibility'
                        ? shortLocaleLabel(tag)
                        : option.autonym}</span
                    >
                    {#if mode === 'membership'}
                      <span aria-hidden="true" class="ml-2">×</span>
                    {/if}
                  </button>
                </div>
              {/each}
            </div>
            <Popover.Root bind:open={searching}>
              <Popover.Trigger {disabled}>
                {#snippet child({ props })}
                  <button
                    {...props}
                    bind:this={addButton}
                    type="button"
                    onblur={() => (quietAddFocus = false)}
                    onkeydown={() => (quietAddFocus = false)}
                    class="min-h-8 rounded-md border border-dashed border-border px-2 text-xs {quietAddFocus
                      ? 'outline-none! ring-0!'
                      : 'focus-visible:outline-2 focus-visible:outline-primary'}"
                  >
                    + {labels.add}
                  </button>
                {/snippet}
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  sideOffset={8}
                  align="start"
                  collisionPadding={16}
                  onOpenAutoFocus={event => event.preventDefault()}
                  onCloseAutoFocus={event => {
                    event.preventDefault()
                    if (!searching) restoreAddFocus()
                  }}
                  class="bits-theme z-[100] w-[min(24rem,calc(100vw-2rem))] outline-none"
                >
                  <LocaleSearch
                    {options}
                    {selectedLocales}
                    {labels}
                    onSelect={select}
                    onClose={closeSearch}
                  />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
        </div>
      </div>
    {/if}
    {#if !alwaysExpanded}
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`${id}-strip`}
        {disabled}
        onclick={() => {
          searching = false
          onExpandedChange(!expanded)
        }}
        class="inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
      >
        <LanguagesIcon class="size-4" />{labels.multilingual}
      </button>
    {/if}
  </div>
  <span role="status" aria-live="polite" aria-atomic="true" class="sr-only"
    >{announcement}</span
  >
</div>
