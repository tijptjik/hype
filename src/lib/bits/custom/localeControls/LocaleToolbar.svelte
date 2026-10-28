<script lang="ts">
// SVELTE
import { tick } from 'svelte'
// LOCAL
import LocaleSearch from './LocaleSearch.svelte'
import { defaultLocaleControlLabels } from './localeControls.js'
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
let dragged: string | null = $state(null)
let addButton: HTMLButtonElement
let root: HTMLDivElement
const isExpanded = $derived(alwaysExpanded || expanded)

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

/** Restore focus to the invoking Add button when dismissing search. */
function closeSearch(): void {
  searching = false
  addButton?.focus()
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
  const button = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-locale]'),
  ).find(button => button.dataset.locale === tag)
  ;(button ?? addButton)?.focus()
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
function move(tag: string, to: number): void {
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
  void tick().then(() =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('[data-locale]'))
      .find(button => button.dataset.locale === tag)
      ?.focus(),
  )
  void announce(labels.moved(optionFor(tag).name, to + 1, selected.length))
}

/** Alt+Arrow keys provide a shortcut in addition to explicit touch/keyboard buttons. */
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

<div bind:this={root} class={`min-w-0 ${className}`}>
  <div class={alwaysExpanded ? 'min-w-0' : 'flex min-w-0 flex-wrap items-start gap-2'}>
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
        class="min-h-11 rounded-lg border border-border px-3 text-sm font-medium hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
      >
        {labels.multilingual}
      </button>
    {/if}
    <div
      id={`${id}-strip`}
      inert={!isExpanded}
      aria-hidden={!isExpanded}
      class="grid min-w-0 flex-1 origin-left transition-[grid-template-columns,opacity,max-width] duration-200 motion-reduce:transition-none motion-reduce:duration-0"
      style:flex-basis={isExpanded ? '16rem' : '0px'}
      style:max-width={isExpanded ? '100%' : '0px'}
      style:max-height={isExpanded ? undefined : '0px'}
      style:grid-template-columns={isExpanded ? '1fr' : '0fr'}
      style:opacity={isExpanded ? 1 : 0}
    >
      <div class="min-w-0 overflow-hidden">
        <div class="flex min-w-0 flex-wrap items-center gap-2 p-0.5">
          {#each selectedLocales as tag, index (tag)}
            {@const option = optionFor(tag)}
            <!-- biome-ignore lint/a11y/useSemanticElements: This labels a compact locale action group, not a separate form fieldset. -->
            <div
              role="group"
              aria-label={option.name}
              class="flex max-w-full min-w-0 flex-wrap items-center rounded-lg border border-border bg-foreground/4"
            >
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
                draggable={!disabled}
                ondragstart={event => {
                  dragged = tag
                  event.dataTransfer?.setData('text/plain', tag)
                }}
                ondragend={() => (dragged = null)}
                ondragover={event => {
                  if (dragged) event.preventDefault()
                }}
                ondrop={event => {
                  event.preventDefault()
                  if (dragged) move(dragged, index)
                  dragged = null
                }}
                onkeydown={event => keydown(event, tag, index)}
                onclick={() => toggle(tag)}
                class={`min-h-11 min-w-0 flex-1 rounded-lg px-3 text-left text-sm whitespace-normal break-words focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 ${mode === 'membership' || visibleLocales.includes(tag) ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
              >
                <span lang={tag}>{option.autonym}</span>
                {#if mode === 'membership'}
                  <span aria-hidden="true" class="ml-2">×</span>
                {/if}
              </button>
              <div class="flex shrink-0">
                <button
                  type="button"
                  aria-label={labels.moveEarlier(option.name)}
                  disabled={disabled || index === 0}
                  onclick={() => move(tag, index - 1)}
                  class="min-h-11 min-w-9 rounded-md hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30"
                >
                  ←
                </button>
                <button
                  type="button"
                  aria-label={labels.moveLater(option.name)}
                  disabled={disabled || index === selectedLocales.length - 1}
                  onclick={() => move(tag, index + 1)}
                  class="min-h-11 min-w-9 rounded-md hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30"
                >
                  →
                </button>
              </div>
            </div>
          {/each}
          <button
            bind:this={addButton}
            type="button"
            {disabled}
            aria-expanded={searching && isExpanded}
            aria-controls={`${id}-search`}
            onclick={() => (searching = !searching)}
            class="min-h-11 rounded-lg border border-dashed border-border px-3 text-sm hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
          >
            + {labels.add}
          </button>
        </div>
      </div>
    </div>
  </div>
  {#if searching && isExpanded && !disabled}
    <div id={`${id}-search`}>
      <LocaleSearch
        {options}
        {selectedLocales}
        {labels}
        onSelect={select}
        onClose={closeSearch}
      />
    </div>
  {/if}
  <span role="status" aria-live="polite" aria-atomic="true" class="sr-only"
    >{announcement}</span
  >
</div>
