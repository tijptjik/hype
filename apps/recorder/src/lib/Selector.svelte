<script lang="ts">
// I18N
import { t } from './i18n'
import { selectorIcons } from './selectorIcons'
// TYPES
import type { RecorderOption } from '../../../../src/lib/fieldResearch/recorder'

let {
  label,
  icon,
  options,
  value,
  onchange,
  disabled = false,
  wheel = false,
  searchable = false,
  showLabel = true,
}: {
  label: string
  icon: keyof typeof selectorIcons
  options: Option[]
  value: string
  onchange: (id: string) => void
  showLabel?: boolean
  searchable?: boolean
  wheel?: boolean
  disabled?: boolean
} = $props()
type Option = RecorderOption & {
  kind?: keyof typeof selectorIcons
  address?: string
  iconPath?: string | null
}
const descriptionId = $props.id()
let trigger: HTMLButtonElement
let dialog: HTMLDialogElement
let expanded = $state(false)
let selected = $derived(options.find(option => option.id === value))

let search = $state('')
let filtered = $derived(
  options.filter(
    item =>
      !search.trim() ||
      [item.name, item.address].some(text =>
        text?.toLowerCase().includes(search.trim().toLowerCase()),
      ),
  ),
)

function open(): void {
  search = ''
  dialog.showModal()
  expanded = true
  const current =
    dialog.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ??
    dialog.querySelector<HTMLButtonElement>('[aria-pressed]')
  current?.focus()
}

let startY: number | null = null
let swiped = false

function step(direction: number): void {
  const index = options.findIndex(option => option.id === value)
  const next = options[Math.max(0, Math.min(index + direction, options.length - 1))]
  if (!disabled && next && next.id !== value) onchange(next.id)
}

// Keep wheel flicks on the closed map selector, including trackpad momentum.
$effect(() => {
  if (!wheel || disabled) return
  let lastStep = -Infinity
  function scroll(event: WheelEvent): void {
    if (
      event.ctrlKey ||
      !event.deltaY ||
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
    )
      return
    event.preventDefault()
    if (event.timeStamp - lastStep < 160) return
    lastStep = event.timeStamp
    step(Math.sign(event.deltaY))
  }
  trigger.addEventListener('wheel', scroll, { passive: false })
  return () => trigger.removeEventListener('wheel', scroll)
})
</script>

{#snippet symbol(option?: Option)}
  <svg
    aria-hidden="true"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d={option?.iconPath ?? selectorIcons[option?.kind ?? icon]} />
  </svg>
{/snippet}

<button
  bind:this={trigger}
  type="button"
  {disabled}
  aria-label={label}
  aria-describedby={descriptionId}
  aria-haspopup="dialog"
  aria-expanded={expanded}
  class="border-line bg-panel text-ink focus-visible:outline-accent grid min-h-20 w-full min-w-0 touch-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border px-4 py-3 text-left disabled:opacity-50"
  onpointerdown={() => (swiped = false)}
  ontouchstart={event => {
    startY = event.touches.length === 1 ? event.touches[0].clientY : null
    swiped = false
  }}
  ontouchcancel={() => {
    startY = null
  }}
  ontouchend={event => {
    if (startY !== null) {
      const delta = event.changedTouches[0].clientY - startY
      if (Math.abs(delta) >= 24) {
        if (event.cancelable) event.preventDefault()
        swiped = true
        step(delta < 0 ? 1 : -1)
      }
    }
    startY = null
  }}
  onclick={event => {
    if (swiped) {
      event.preventDefault()
      swiped = false
    } else open()
  }}
  onkeydown={event => {
    swiped = false
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      step(event.key === 'ArrowDown' ? 1 : -1)
    }
  }}
>
  <span class="text-muted">{@render symbol(selected)}</span>
  <span id={descriptionId} class="grid min-w-0 gap-0.5">
    {#if showLabel}
      <span aria-hidden="true" class="text-muted text-xs font-medium">{label}</span>
    {/if}
    <span class="font-semibold break-words"
      >{selected?.name ?? t('choose_field', { field: label.toLowerCase() })}</span
    >
    {#if selected?.address}
      <small class="text-muted text-sm break-words">{selected.address}</small>
    {/if}
  </span>
  <svg
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    class="text-muted"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
</button>

<dialog
  bind:this={dialog}
  aria-label={label}
  onclose={() => (expanded = false)}
  class="border-line bg-panel text-ink m-auto w-[min(92vw,28rem)] max-w-none overflow-hidden rounded-2xl border p-0 shadow-xl backdrop:bg-black/65"
>
  <header
    class="border-line flex items-center justify-between gap-4 border-b py-2 pr-2 pl-5"
  >
    <h2 class="font-semibold">{label}</h2>
    <button
      type="button"
      aria-label={t('close')}
      onclick={() => dialog.close()}
      class="text-muted grid size-11 place-items-center rounded-xl"
    >
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="m6 6 12 12M6 18 18 6" />
      </svg>
    </button>
  </header>
  {#if searchable}
    <input
      type="search"
      bind:value={search}
      aria-label={t('filter_locations')}
      placeholder={t('filter_locations')}
      class="border-line bg-surface mx-2 mt-2 min-h-11 w-[calc(100%-1rem)] rounded-xl border px-3"
    >
  {/if}
  <div
    class="grid max-h-[min(64dvh,30rem)] gap-1 overflow-y-auto overscroll-contain p-2"
  >
    {#each filtered as option (option.id)}
      <button
        type="button"
        aria-pressed={value === option.id}
        class={[
          'focus-visible:outline-accent grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border px-3 py-2.5 text-left focus-visible:-outline-offset-2',
          value === option.id
            ? 'border-accent bg-accent/10'
            : 'hover:bg-surface border-transparent',
        ]}
        onclick={() => {
          dialog.close()
          onchange(option.id)
        }}
      >
        <span
          class={[
            'grid size-9 place-items-center rounded-lg',
            value === option.id ? 'bg-accent text-on-accent' : 'bg-surface text-muted',
          ]}
          >{@render symbol(option)}</span
        >
        <span class="grid min-w-0 gap-0.5 break-words whitespace-normal">
          <span class="font-semibold">{option.name}</span>
          {#if option.address}
            <small class="text-muted text-sm">{option.address}</small>
          {/if}
        </span>
      </button>
    {:else}
      <p class="text-muted p-3">{t('no_matching_locations')}</p>
    {/each}
  </div>
</dialog>
