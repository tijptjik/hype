<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// ICONS
import ChevronDown from 'virtual:icons/proicons/chevron-down'
import GripVertical from 'virtual:icons/lucide/grip-vertical'
import Trash from 'virtual:icons/proicons/delete'
import ObjectIcon from 'virtual:icons/lucide/box'
import PlaceIcon from 'virtual:icons/lucide/map-pin-house'
import AreaIcon from 'virtual:icons/lucide/scan'
import RouteIcon from 'virtual:icons/lucide/route'
// TYPES
import type { Snippet } from 'svelte'
import type { FeatureType } from '#lib/features/intents.js'

let {
  title,
  kind = 'object',
  children,
  disabled = false,
  removeMode = false,
  canRemove = true,
  canMoveUp = false,
  canMoveDown = false,
  collapsedAll = false,
  collapseVersion = 0,
  onMove,
  onRemove,
}: {
  title: string
  kind?: FeatureType['kind']
  children: Snippet
  disabled?: boolean
  removeMode?: boolean
  canRemove?: boolean
  canMoveUp?: boolean
  canMoveDown?: boolean
  collapsedAll?: boolean
  collapseVersion?: number
  onMove?: (direction: -1 | 1) => void
  onRemove?: () => void
} = $props()
let collapsed = $state(false)
let appliedVersion = $state(untrack(() => collapseVersion))
const bodyId = $props.id()
let leftWidth = $state(0),
  rightWidth = $state(0)
const sideWidth = $derived(Math.max(leftWidth, rightWidth))
const Icon = $derived(
  { object: ObjectIcon, place: PlaceIcon, area: AreaIcon, route: RouteIcon }[
    kind ?? 'object'
  ],
)
$effect(() => {
  if (appliedVersion === collapseVersion) return
  appliedVersion = collapseVersion
  collapsed = collapsedAll
})
/** Move via the same ordered draft used by pointer dragging.
 * @param event Key from the six-dot handle. @returns Nothing.
 */
function reorderKey(event: KeyboardEvent): void {
  if (!event.altKey || disabled || removeMode) return
  if (event.key === 'ArrowUp' && canMoveUp) {
    event.preventDefault()
    onMove?.(-1)
  }
  if (event.key === 'ArrowDown' && canMoveDown) {
    event.preventDefault()
    onMove?.(1)
  }
}
</script>

<article class="bits-project-field-card" data-feature-type-section>
  <header
    style:grid-template-columns={`${sideWidth}px minmax(0, 1fr) ${sideWidth}px`}
    class="bits-project-field-card__header bits-form__i18n-card border-glass-100 grid! items-center gap-2 px-3! py-2!"
  >
    <div
      bind:clientWidth={leftWidth}
      class="bits-project-field-card__header-left-rail static! w-max transform-none! justify-self-start"
    >
      <button
        type="button"
        data-type-drag-handle
        aria-label={`Reorder ${title}`}
        title="Drag to reorder. Use Alt + Up or Down with the keyboard."
        disabled={disabled || removeMode || (!canMoveUp && !canMoveDown)}
        onkeydown={reorderKey}
        class="text-foreground/60 hover:bg-foreground/5 focus-visible:outline-primary flex size-10 cursor-grab touch-none items-center justify-center rounded-md focus-visible:outline-2 active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
      >
        <GripVertical class="size-5" />
      </button>
      <Icon class="text-primary size-5" />
    </div>
    <div
      class="bits-project-field-card__title-wrap static! min-w-0 transform-none! px-3"
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        class="bits-project-field-card__title-pill relative max-w-full min-w-0 px-2!"
        onclick={() => (collapsed = !collapsed)}
      >
        <h3
          class="bits-project-field-card__title min-w-0 leading-snug! break-words whitespace-normal"
        >
          {title || 'New feature type'}
        </h3>
        <ChevronDown
          class={`bits-project-field-card__collapse-icon absolute top-1/2 -right-3 -translate-y-1/2 ${collapsed ? 'bits-project-field-card__collapse-icon--collapsed' : ''}`}
        />
      </button>
    </div>
    <div
      bind:clientWidth={rightWidth}
      class="bits-project-field-card__header-right-rail static! w-max transform-none! gap-2 justify-self-end"
    >
      {#if removeMode && !disabled}
        <button
          type="button"
          aria-label={`Remove ${title}`}
          disabled={!canRemove}
          onclick={onRemove}
          class="text-destructive hover:bg-destructive/10 focus-visible:outline-primary inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-xs focus-visible:outline-2 disabled:opacity-30"
        >
          <Trash class="size-4" /><span>Remove</span>
        </button>
      {/if}
    </div>
  </header>
  <!-- Keep editor state mounted while the body slides closed and leaves keyboard navigation. -->
  <div
    id={bodyId}
    class="grid transition-[grid-template-rows] duration-200 ease-in-out motion-reduce:transition-none"
    style:grid-template-rows={collapsed ? '0fr' : '1fr'}
    inert={collapsed}
    aria-hidden={collapsed}
    data-type-body
  >
    <div class="min-h-0 overflow-hidden">
      {@render children()}
    </div>
  </div>
</article>
