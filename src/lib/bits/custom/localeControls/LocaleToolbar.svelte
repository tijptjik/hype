<script lang="ts">
// SVELTE
import { onMount, tick } from 'svelte'
import type { TransitionConfig } from 'svelte/transition'
import { flip } from 'svelte/animate'
import { Popover } from 'bits-ui'
import { m } from '#lib/i18n.js'
// DRAG AND DROP
import { dndzone, type DndEvent } from 'svelte-dnd-action'
// ICONS
import LanguagesIcon from 'virtual:icons/lucide/languages'
import GripIcon from 'virtual:icons/lucide/grip-vertical'
// COMPONENTS
import EditModeReveal from '#lib/bits/custom/form/EditModeReveal.svelte'
import { localeOverflow } from './localeOverflow'
// LOCAL
import LocaleSearch from './LocaleSearch.svelte'
import {
  defaultLocaleControlLabels,
  displayedLocales,
  shortLocaleLabel,
} from './localeControls.js'
import { languageFont } from '#lib/bits/custom/localeControls/localeFont.js'
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
  allowAdd = false,
  mode = 'visibility',
  alwaysExpanded = false,
  horizontal = false,
  contentLocales = [],
  labels = defaultLocaleControlLabels,
  class: className = '',
}: LocaleToolbarProps = $props()
const id = $props.id()
let searching = $state(false)
// Leaving edit mode also dismisses a picker opened before permission changed.
$effect(() => {
  if (!allowAdd || disabled) searching = false
})
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
const hasHiddenContent = $derived(
  contentLocales.some(
    locale =>
      !displayedLocales({ selectedLocales, visibleLocales }, isExpanded).includes(
        locale,
      ),
  ),
)
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
  if (disabled || !allowAdd) return
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

{#snippet addControl()}
  <Popover.Root bind:open={searching}>
    <Popover.Trigger {disabled}>
      {#snippet child({ props })}
        <button
          {...props}
          aria-label={mode === 'visibility'
            ? m.address_neighbourhood_add()
            : labels.add}
          title={mode === 'visibility' ? m.address_neighbourhood_add() : labels.add}
          bind:this={addButton}
          type="button"
          onblur={() => (quietAddFocus = false)}
          onkeydown={() => (quietAddFocus = false)}
          class="min-h-8 rounded-md border border-dashed border-border px-2 text-xs {quietAddFocus
            ? 'outline-none! ring-0!'
            : 'focus-visible:outline-2 focus-visible:outline-primary'}"
        >
          <span aria-hidden="true">+</span>
          <span data-control-label
            >{mode === 'visibility' ? m.address_neighbourhood_add() : labels.add}</span
          >
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
        class="bits-theme z-[300] w-[min(24rem,calc(100vw-2rem))] outline-none"
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
{/snippet}

<div
  data-locale-toolbar
  bind:this={root}
  class={`group/locale-toolbar min-w-0 ${className}`}
>
  <div
    class={horizontal
      ? 'flex min-h-10 min-w-0 items-center gap-2'
      : alwaysExpanded
        ? 'min-w-0'
        : 'flex min-h-10 min-w-0 flex-wrap items-center justify-end gap-2 sm:flex-nowrap'}
  >
    {#if isExpanded}
      <div
        id={`${id}-strip`}
        transition:revealLocales
        inert={!isExpanded}
        aria-hidden={!isExpanded}
        class={horizontal
          ? 'max-w-96 min-w-0 flex-1'
          : alwaysExpanded
            ? 'min-w-0'
            : 'order-2 min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto'}
      >
        <div
          use:localeOverflow={horizontal}
          class={horizontal
            ? 'min-w-0 [scrollbar-width:thin] overflow-x-auto overscroll-x-contain'
            : 'min-w-0 overflow-hidden'}
          data-locale-scroll={horizontal || undefined}
        >
          <div
            class="flex min-w-0 {horizontal
              ? 'w-max flex-nowrap'
              : 'flex-wrap'} items-center {alwaysExpanded
              ? 'justify-start'
              : 'justify-end'} gap-1.5 p-0.5"
          >
            {#if mode === 'visibility'}
              <EditModeReveal visible={allowAdd} reserveSpace
                >{@render addControl()}</EditModeReveal
              >
            {/if}
            <!-- biome-ignore lint/a11y/useSemanticElements: This drag zone groups locale controls rather than form fields. -->
            <div
              use:dndzone={{
                zoneItemTabIndex: -1,
                zoneTabIndex: -1,
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
              class="flex min-w-0 {horizontal
                ? 'w-max flex-nowrap'
                : 'flex-wrap'} items-center {alwaysExpanded
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
                  class="border-border bg-panel text-foreground flex max-w-full min-w-0 cursor-grab items-center rounded-md border shadow-sm select-none"
                >
                  <span
                    aria-hidden="true"
                    class="text-muted-foreground flex min-h-8 w-5 shrink-0 items-center justify-center"
                  >
                    <GripIcon class="size-3" />
                  </span>
                  <!-- biome-ignore lint/a11y/useSemanticElements: A native button blocks the drag library's pointer initiation on its padding. -->
                  <span
                    role="button"
                    tabindex={disabled ? -1 : 0}
                    data-locale={tag}
                    aria-label={option.name}
                    aria-disabled={disabled}
                    aria-pressed={mode === 'visibility'
                      ? visibleLocales.includes(tag)
                      : undefined}
                    aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
                    onkeydown={event => {
                      keydown(event, tag, index)
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        event.stopPropagation()
                        if (mode === 'visibility') toggle(tag)
                      }
                    }}
                    onclick={() => {
                      if (mode === 'visibility') toggle(tag)
                    }}
                    class={`focus-visible:outline-primary inline-flex min-h-8 min-w-0 flex-1 cursor-grab items-center gap-1 rounded-md pr-2 pl-1 text-left text-xs break-words whitespace-normal focus-visible:outline-2 active:cursor-grabbing ${mode === 'membership' || visibleLocales.includes(tag) ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
                  >
                    <span lang={tag} dir="auto" style:font-family={languageFont(tag)}
                      >{mode === 'visibility'
                        ? shortLocaleLabel(tag)
                        : option.autonym}</span
                    >
                  </span>
                  {#if mode === 'membership'}
                    <button
                      type="button"
                      {disabled}
                      aria-label={labels.remove(option.name)}
                      onmousedown={event => event.stopPropagation()}
                      ontouchstart={event => event.stopPropagation()}
                      onclick={() => toggle(tag)}
                      class="hover:text-primary focus-visible:outline-primary flex min-h-8 w-6 shrink-0 items-center justify-center rounded-r-md text-xs focus-visible:outline-2 disabled:opacity-50"
                    >
                      ×
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
            {#if mode === 'membership'}
              <EditModeReveal visible={allowAdd} reserveSpace
                >{@render addControl()}</EditModeReveal
              >
            {/if}
          </div>
        </div>
      </div>
    {/if}
    {#if !alwaysExpanded}
      <button
        type="button"
        aria-label={labels.multilingual}
        title={labels.multilingual}
        aria-expanded={expanded}
        aria-controls={`${id}-strip`}
        {disabled}
        onclick={() => {
          searching = false
          onExpandedChange(!expanded)
        }}
        class="text-muted-foreground hover:bg-muted focus-visible:outline-primary inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs focus-visible:outline-2 disabled:opacity-50"
      >
        <LanguagesIcon class="size-4" />
        <span data-control-label>{labels.multilingual}</span>
        {#if hasHiddenContent}
          <span
            role="img"
            aria-label="Hidden multilingual content"
            title="Hidden multilingual content"
            class="size-1.5 shrink-0 rounded-full bg-current"
          ></span>
        {/if}
      </button>
    {/if}
  </div>
  <span role="status" aria-live="polite" aria-atomic="true" class="sr-only"
    >{announcement}</span
  >
</div>
