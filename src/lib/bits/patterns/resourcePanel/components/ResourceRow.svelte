<script lang="ts">
// I18N
import { m } from '$lib/i18n'
// ICONS
import Funnel from 'virtual:icons/lucide/filter'
import Crosshair from 'virtual:icons/lucide/crosshair'
import X from 'virtual:icons/lucide/x'
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
  class="flex min-h-14 items-center gap-2 rounded-xl px-3 py-2 transition-colors {row.active ? 'bg-raised' : 'hover:bg-surface'}"
  data-resource-id={row.id}
>
  <button
    type="button"
    class="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-offset-4 focus-visible:outline-2 focus-visible:outline-focus"
    aria-label={row.primaryLabel}
    aria-current={row.active ? 'page' : undefined}
    title={narrow ? row.name : undefined}
    onclick={row.onPrimary}
  >
    <span
      class="size-2 shrink-0 rounded-full {row.enabled ? `bg-current ${color}` : 'bg-base-content/20'}"
      aria-hidden="true"
    ></span>
    {#if !narrow}
      <span class="flex min-w-0 flex-col gap-1">
        {#if row.breadcrumbs.length}
          <span
            class="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
            >{row.breadcrumbs.join(' / ')}</span
          >
        {/if}
        <span class="text-sm font-medium leading-5">{row.name}</span>
      </span>
    {:else}
      <span class="truncate text-xs">{row.name.slice(0, 2)}</span>
    {/if}
  </button>
  {#if !narrow}
    <button
      type="button"
      class="rounded-lg p-2 outline-offset-2 hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus {row.selected ? color : 'text-muted-foreground'}"
      aria-label={row.toggleLabel}
      aria-pressed={row.selected}
      title={row.toggleLabel}
      onclick={row.onToggle}
    >
      {#if row.selected}
        <X class="size-4" />
      {:else}
        <Funnel class="size-4" />
      {/if}
    </button>
    {#if row.onIsolate}
      <button
        type="button"
        class="rounded-lg p-2 text-muted-foreground hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus"
        aria-label={m.panel__isolate_layer({ name: row.name })}
        onclick={row.onIsolate}
      >
        <Crosshair class="size-4" />
      </button>
    {/if}
  {/if}
</div>
