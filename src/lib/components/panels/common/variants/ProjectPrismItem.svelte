<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
// ICONS
import Funnel from 'virtual:icons/lucide/filter'
import XMark from 'virtual:icons/lucide/x'
import { Icon } from '$lib/bits'
// I18N
import { getI18n } from '$lib/i18n'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// COMPONENTS
import ResourceHierarchyPath from '../ResourceHierarchyPath.svelte'
// TYPES
import type { PanelProps, Project, ResourceContext } from '$lib/types'

const appCtx = getAppCtx()

type Props = {
  resource: Project
  hierarchy: ResourceContext
  isSelected: boolean
  isReplaceState: boolean
  onPrimaryAction: (event: MouseEvent | KeyboardEvent) => void | Promise<void>
  onToggleFilter: (event: MouseEvent | KeyboardEvent) => void | Promise<void>
} & PanelProps

const {
  resource,
  hierarchy,
  isSelected,
  isReplaceState,
  onPrimaryAction,
  onToggleFilter,
}: Props = $props()

const name = $derived(getI18n(resource, 'name', appCtx.getUserPreferences()))
</script>

<div
  class="project-prism-item group"
  data-selected={isSelected}
  in:slide={{ axis: 'y', duration: 200 }}
  out:slide={{ axis: 'y', duration: 200 }}
>
  <button
    type="button"
    class="project-prism-item__main"
    onclick={onPrimaryAction}
    onkeydown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onPrimaryAction(event)
      }
    }}
  >
    <div
      class="project-prism-item__dot"
      class:project-prism-item__dot--selected={isSelected}
      aria-hidden="true"
    ></div>
    <div class="project-prism-item__copy">
      <ResourceHierarchyPath hierarchy={{ organisation: hierarchy.organisation }} />
      <p class="project-prism-item__name">{name}</p>
    </div>
  </button>

  <div class="project-prism-item__side">
    <span class="project-prism-item__badge" aria-hidden="true">
      {isReplaceState ? 'replace' : 'add'}
    </span>
    <button
      type="button"
      class="project-prism-item__filter"
      aria-label={isSelected ? 'Clear project filter' : 'Filter project'}
      onclick={onToggleFilter}
    >
      <Icon
        src={isSelected ? XMark : Funnel}
        class="project-prism-item__filter-icon"
        aria-hidden="true"
      />
    </button>
  </div>
</div>

<style>
.project-prism-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: black;
  padding: 0.5rem 1rem 0.5rem 0;
}

.project-prism-item__main {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  gap: 0.75rem;
  background: transparent;
  padding-left: 1rem;
  color: inherit;
  text-align: left;
}

.project-prism-item__dot {
  height: 0.5rem;
  width: 0.5rem;
  flex: 0 0 auto;
  border-radius: 9999px;
  background: rgb(163 163 163 / 0.3);
}

.project-prism-item__dot--selected {
  background: var(--color-accent, currentColor);
}

.project-prism-item__copy {
  min-width: 0;
}

.project-prism-item__name {
  font-weight: 300;
}

.project-prism-item__side {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.project-prism-item__badge {
  opacity: 0;
  transform: translateX(0.125rem);
  border: 1px solid rgb(255 255 255 / 0.12);
  border-radius: 9999px;
  padding: 0.1rem 0.45rem;
  font-size: 0.625rem;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgb(255 255 255 / 0.7);
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}

.group:hover .project-prism-item__badge,
.group:focus-within .project-prism-item__badge {
  opacity: 1;
  transform: translateX(0);
}

.project-prism-item__filter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: rgb(255 255 255 / 0.45);
}

.project-prism-item__filter:hover,
.project-prism-item__filter:focus-visible {
  color: rgb(255 255 255 / 0.82);
}

.project-prism-item__filter-icon {
  height: 1.25rem;
  width: 1.25rem;
}
</style>
