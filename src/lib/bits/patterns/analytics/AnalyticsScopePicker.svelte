<script lang="ts">
// BITS
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
// ICONS
import ProjectIcon from 'virtual:icons/proicons/grid'
import OrganisationIcon from 'virtual:icons/proicons/person-multiple'
import HubIcon from 'virtual:icons/proicons/building-multiple'
import GlobeIcon from 'virtual:icons/proicons/globe'
import InfoIcon from 'virtual:icons/proicons/info'
import ChevronDownIcon from 'virtual:icons/proicons/chevron-down'
// TYPES
import type { AnalyticsScopeOption } from '#lib/api/services/analyticsScope.js'

let {
  options,
  value,
  onChange,
  hosts = [],
  hostname = '',
  hostLabel = 'All hosts',
  onHostChange,
  details = '',
}: {
  options: AnalyticsScopeOption[]
  value: string
  onChange: (value: string) => void
  hosts?: string[]
  hostname?: string
  hostLabel?: string
  onHostChange?: (value: string) => void
  details?: string
} = $props()
const selected = $derived(
  options.find(option => `${option.type}:${option.id ?? ''}` === value),
)
const ScopeIcon = $derived(
  selected?.type === 'project'
    ? ProjectIcon
    : selected?.type === 'organisation'
      ? OrganisationIcon
      : selected?.type === 'hub'
        ? HubIcon
        : GlobeIcon,
)
</script>

<div
  class="inline-flex h-9 w-max shrink-0 flex-nowrap items-center gap-1 text-sm whitespace-nowrap"
  data-analytics-toolbar
>
  <label
    class="focus-within:outline-primary hover:bg-primary/5 relative inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-2 font-medium focus-within:outline focus-within:outline-1"
  >
    <ScopeIcon class="text-primary size-4 shrink-0" aria-hidden="true" />
    <span aria-hidden="true"
      >{selected?.label.replace(/^(Project|Organisation|Hub) · /, '') ??
        'Select perspective'}</span
    >
    <ChevronDownIcon class="text-foreground-alt size-3 shrink-0" aria-hidden="true" />
    <select
      aria-label="Perspective"
      class="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
      {value}
      disabled={!options.length}
      onchange={event => onChange(event.currentTarget.value)}
    >
      {#each options as option}
        <option value={`${option.type}:${option.id ?? ''}`}>{option.label}</option>
      {/each}
    </select>
  </label>
  {#if hosts.length && onHostChange}
    <label
      class="focus-within:outline-primary hover:bg-primary/5 relative inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-2 font-medium focus-within:outline focus-within:outline-1"
    >
      <GlobeIcon class="text-primary size-4 shrink-0" aria-hidden="true" />
      <span aria-hidden="true">{hostname === '*' ? 'All hosts' : hostname}</span>
      <ChevronDownIcon class="text-foreground-alt size-3 shrink-0" aria-hidden="true" />
      <select
        aria-label="Hostname"
        class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        value={hostname}
        onchange={event => onHostChange?.(event.currentTarget.value)}
      >
        {#each hosts as host}
          <option value={host}>{host === '*' ? 'All hosts' : host}</option>
        {/each}
      </select>
    </label>
  {:else}
    <span class="text-foreground-alt inline-flex h-9 shrink-0 items-center gap-2 px-2">
      <GlobeIcon class="text-primary size-4 shrink-0" aria-hidden="true" />
      {hostLabel}
    </span>
  {/if}
  {#if details}
    <SimpleTooltip>
      {#snippet trigger()}
        <button
          type="button"
          aria-label="About this analytics view"
          class="text-foreground-alt hover:bg-primary/5 hover:text-foreground focus-visible:outline-primary inline-flex size-9 shrink-0 items-center justify-center rounded-md focus-visible:outline focus-visible:outline-1"
        >
          <InfoIcon class="size-4" aria-hidden="true" />
        </button>
      {/snippet}
      <span class="block max-w-xs text-sm leading-5 whitespace-pre-line"
        >{details}</span
      >
    </SimpleTooltip>
  {/if}
</div>
