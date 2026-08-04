<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
// ICONS
import Funnel from 'virtual:icons/lucide/filter'
import XMark from 'virtual:icons/lucide/x'
// BITS COMPONENTS
import { Icon } from '$lib/bits'
// I18N
import { getI18n } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// COMPONENTS
import ResourceHierarchyPath from '../ResourceHierarchyPath.svelte'
// TYPES
import type { Project } from '$lib/db/zod/schema/project.types'
import type { PanelProps, ResourceContext } from '$lib/types'

const appCtx = getAppCtx()

type Props = {
  resource: Project
  hierarchy: ResourceContext
  isPrismActive: boolean
  isDefaultLayersActive: boolean
  onPrimaryAction: (event: MouseEvent | KeyboardEvent) => void | Promise<void>
  onTogglePrism: (event: MouseEvent | KeyboardEvent) => void | Promise<void>
} & PanelProps

const {
  resource,
  hierarchy,
  isPrismActive,
  isDefaultLayersActive,
  onPrimaryAction,
  onTogglePrism,
}: Props = $props()

const name = $derived(getI18n(resource, 'name', appCtx.getUserPreferences()))
const primaryActionLabel = $derived(
  isPrismActive ? `Remove ${name} project prism` : `Activate ${name} default layers`,
)
</script>

<div
  class="group flex items-center gap-3 bg-black py-2 pr-4"
  data-prism-active={isPrismActive}
  in:slide={{ axis: 'y', duration: 200 }}
  out:slide={{ axis: 'y', duration: 200 }}
>
  <button
    type="button"
    class="flex min-w-0 flex-1 items-center gap-3 bg-transparent pl-4 text-left"
    aria-label={primaryActionLabel}
    onclick={onPrimaryAction}
  >
    <div
      class="h-2 w-2 shrink-0 rounded-full {isDefaultLayersActive
        ? 'bg-accent'
        : 'bg-base-content/30'}"
      aria-hidden="true"
    ></div>
    <div class="min-w-0">
      <ResourceHierarchyPath hierarchy={{ organisation: hierarchy.organisation }} />
      <p class="font-light">{name}</p>
    </div>
  </button>

  <button
    type="button"
    class="group/funnel inline-flex shrink-0 items-center justify-center {isPrismActive
      ? 'text-accent'
      : 'text-base-content/45 hover:text-base-content/80 focus-visible:text-base-content/80'}"
    aria-label={isPrismActive ? `Remove ${name} project prism` : `Add ${name} project prism`}
    title={isPrismActive ? `Remove ${name} project prism` : `Add ${name} project prism`}
    onclick={onTogglePrism}
  >
    <Icon
      src={Funnel}
      class="h-5 w-5 {isPrismActive
        ? 'group-hover/funnel:hidden group-focus-visible/funnel:hidden'
        : ''}"
      aria-hidden="true"
    />
    {#if isPrismActive}
      <Icon
        src={XMark}
        class="hidden h-5 w-5 group-hover/funnel:block group-focus-visible/funnel:block"
        aria-hidden="true"
      />
    {/if}
  </button>
</div>
