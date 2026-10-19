<script lang="ts">
// THIRD-PARTY
import { draggable, droppable, dndState, type DragDropState } from '@thisux/sveltednd'
// SERVICES
import { getDropIndex } from '#lib/client/services/dragDrop.js'
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import Funnel from 'virtual:icons/proicons/filter'
import Crosshair from 'virtual:icons/proicons/target'
import X from 'virtual:icons/proicons/cancel'
import Drag from 'virtual:icons/proicons/cursor-drag'
// TYPES
import type { ResourceRowProps } from './resourcePanelPrimitives.types'
let {
  row,
  tone,
  narrow = false,
  reorder,
  onLabelShow,
  onLabelHide,
}: ResourceRowProps = $props()
const color = $derived(
  tone === 'primary'
    ? 'text-primary'
    : tone === 'secondary'
      ? 'text-secondary'
      : 'text-tertiary',
)

/**
 * Applies a same-list drop using the complete active order, including offscreen layers.
 * @param state - Current drag state with the target edge and source group.
 * @returns Nothing; stale and foreign drops leave layer visibility and order intact.
 */
function handleDrop(state: DragDropState): void {
  if (!reorder) return
  const destination = getDropIndex(state, reorder.ids, row.id, reorder.group)
  if (destination === null) return
  const dragged = state.draggedItem as { id: string }
  reorder.onMove(dragged.id, destination)
}

/**
 * Moves the focused layer with arrow keys while retaining its handle focus.
 * @param event - Keyboard action on the reorder handle.
 * @returns Nothing; keys never activate, isolate or navigate to a layer.
 */
function handleReorderKey(event: KeyboardEvent): void {
  if (!reorder || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  const index = reorder.ids.indexOf(row.id)
  const destination =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? reorder.ids.length - 1
        : index + (event.key === 'ArrowUp' ? -1 : 1)
  reorder.onMove(row.id, destination)
}
</script>

<div
  class="group/layer relative w-full min-w-0 overflow-hidden transition-colors [&.drop-before]:shadow-[inset_0_2px_var(--color-secondary)] [&.drop-after]:shadow-[inset_0_-2px_var(--color-secondary)] {row.active
    ? 'bg-[var(--resource-row-active-fill)]'
    : 'hover:bg-surface'}"
  data-resource-id={row.id}
  use:droppable={{
    container: `${reorder?.group}-${row.id}`,
    containerGroup: reorder?.group,
    disabled: !reorder,
    callbacks: { onDrop: handleDrop },
  }}
>
  <span
    class="pointer-events-none absolute left-[32px] top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full {row.enabled
      ? `bg-current ${color}`
      : 'bg-base-content/30'} {reorder
      ? 'group-hover/layer:opacity-0 group-focus-within/layer:opacity-0'
      : ''}"
    aria-hidden="true"
  ></span>
  {#if reorder}
    <button
      type="button"
      data-layer-drag-handle
      use:draggable={{
        container: `${reorder.group}-${row.id}`,
        containerGroup: reorder.group,
        dragData: { id: row.id },
        handle: '[data-layer-drag-handle]',
        attributes: { draggingClass: 'opacity-55' },
      }}
      class="absolute left-[32px] top-1/2 z-10 flex size-6 -translate-x-1/2 -translate-y-1/2 touch-none cursor-grab items-center justify-center rounded text-secondary opacity-0 group-hover/layer:opacity-100 group-focus-within/layer:opacity-100 active:cursor-grabbing focus-override focus-visible:outline-2 focus-visible:outline-focus"
      aria-label={m.panel__reorder_layer({ name: row.name })}
      title={m.panel__reorder_layer({ name: row.name })}
      onkeydown={handleReorderKey}
      onclick={event => event.stopPropagation()}
    >
      <Drag class="size-4" />
    </button>
  {/if}
  <button
    type="button"
    class="block w-full min-w-0 overflow-hidden text-left transition-[height,padding] duration-500 motion-reduce:transition-none {narrow
      ? 'py-0'
      : 'py-2'} focus-override outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
    aria-label={row.primaryLabel}
    aria-current={row.active ? 'page' : undefined}
    style:height={narrow ? '24px' : row.breadcrumbs.length ? '3.25rem' : '2.5rem'}
    onpointerenter={event => {
      if (narrow) onLabelShow?.(row.name, event.currentTarget)
    }}
    onpointerleave={() => onLabelHide?.()}
    onfocus={event => {
      if (narrow) onLabelShow?.(row.name, event.currentTarget)
    }}
    onblur={() => onLabelHide?.()}
    onkeydown={event => {
      if (event.key === 'Escape') onLabelHide?.()
    }}
    onclick={() => {
      if (!dndState.isDragging) row.onPrimary()
    }}
  >
    <!-- Keep text mounted with explicit dimensions: Firefox can collapse the intrinsic height of a clipped single-line label. -->
    <span
      class="block w-[max(0px,calc(100%-8rem))] min-w-0 overflow-hidden mx-16 transition-opacity duration-500 motion-reduce:transition-none"
      style:height={row.breadcrumbs.length ? '2.25rem' : '1.25rem'}
      style:opacity={narrow ? 0 : 1}
      aria-hidden={narrow}
    >
      {#if row.breadcrumbs.length}
        <span
          class="flex h-4 min-w-0 items-center gap-0.5 font-mono text-xs uppercase tracking-widest opacity-95"
        >
          {#each row.breadcrumbs as breadcrumb, index}
            {#if index}
              <span aria-hidden="true">›</span>
            {/if}
            <span
              class="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap {index ===
              0
                ? 'text-primary'
                : 'text-tertiary'}"
              >{breadcrumb}</span
            >
          {/each}
        </span>
      {/if}
      <!-- Clip at the outer wrapper; avoid truncate on the name itself (Firefox zero-size rendering). -->
      <span class="block h-5 w-full whitespace-nowrap text-base font-light leading-5"
        >{row.name}</span
      >
    </span>
  </button>
  <div
    class="absolute right-7 top-1/2 flex -translate-y-1/2 items-center transition-opacity duration-500 motion-reduce:transition-none"
    style:opacity={narrow ? 0 : 1}
    inert={narrow}
    aria-hidden={narrow}
  >
    {#if !row.onIsolate}
      <button
        type="button"
        class="group/funnel inline-flex size-6 shrink-0 items-center justify-center rounded-lg focus-override outline-none hover:bg-raised focus-visible:text-primary {row.selected
          ? color
          : 'text-base-content/45'}"
        aria-label={row.toggleLabel}
        aria-pressed={row.selected}
        title={row.toggleLabel}
        onclick={row.onToggle}
      >
        <Funnel
          class="size-5 {row.selected
            ? 'group-hover/funnel:hidden group-focus-visible/funnel:hidden'
            : ''}"
        />
        {#if row.selected}
          <X
            class="hidden size-5 group-hover/funnel:block group-focus-visible/funnel:block"
          />
        {/if}
      </button>
    {/if}
    {#if row.onIsolate}
      <button
        type="button"
        class="inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-base-content/45 hover:bg-raised focus-override outline-none focus-visible:text-primary"
        aria-label={m.panel__isolate_layer({ name: row.name })}
        onclick={row.onIsolate}
      >
        <Crosshair class="size-5" />
      </button>
    {/if}
  </div>
</div>
