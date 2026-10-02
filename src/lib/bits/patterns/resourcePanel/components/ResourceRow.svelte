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
  class="flex min-h-10 items-center gap-3 pl-5 pr-7 py-2 transition-colors {row.active
    ? 'bg-raised'
    : 'hover:bg-surface'}"
  data-resource-id={row.id}
>
  <button
    type="button"
    class="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-override outline-none focus-visible:text-primary"
    aria-label={row.primaryLabel}
    aria-current={row.active ? 'page' : undefined}
    title={narrow ? row.name : undefined}
    onclick={row.onPrimary}
  >
    <span
      class="size-2 shrink-0 rounded-full {row.enabled
        ? `bg-current ${color}`
        : 'bg-base-content/30'}"
      aria-hidden="true"
    ></span>
    {#if !narrow}
      <span class="flex min-w-0 flex-col">
        {#if row.breadcrumbs.length}
          <span
            class="flex min-w-0 items-center gap-0.5 font-mono text-xs uppercase tracking-widest"
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
        <span class="text-base font-light leading-5">{row.name}</span>
      </span>
    {:else}
      <span
        class="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs"
        >{row.name.slice(0, 2)}</span
      >
    {/if}
  </button>
  {#if !narrow}
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
  {/if}
</div>
