<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// ICONS
import Funnel from 'virtual:icons/proicons/filter'
import Crosshair from 'virtual:icons/proicons/target'
import X from 'virtual:icons/proicons/cancel'
// TYPES
import type { ResourceRowProps } from './resourcePanelPrimitives.types'
let { row, tone, narrow = false }: ResourceRowProps = $props()
const color = $derived(
  tone === 'primary'
    ? 'text-primary'
    : tone === 'secondary'
      ? 'text-secondary'
      : 'text-tertiary',
)
</script>

<div
  class="relative w-full min-w-0 overflow-hidden transition-colors {row.active
    ? 'bg-raised'
    : 'hover:bg-surface'}"
  data-resource-id={row.id}
>
  <span
    class="pointer-events-none absolute left-[32px] top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full {row.enabled
      ? `bg-current ${color}`
      : 'bg-base-content/30'}"
    aria-hidden="true"
  ></span>
  <button
    type="button"
    class="block min-h-10 w-full min-w-0 py-2 text-left focus-override outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
    aria-label={row.primaryLabel}
    aria-current={row.active ? 'page' : undefined}
    title={narrow ? row.name : undefined}
    onclick={row.onPrimary}
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
          class="flex h-4 min-w-0 items-center gap-0.5 font-mono text-xs uppercase tracking-widest"
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
      <span class="block h-5 w-full truncate text-base font-light leading-5"
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
