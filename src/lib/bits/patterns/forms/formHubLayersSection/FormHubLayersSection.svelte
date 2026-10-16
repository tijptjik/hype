<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import { SectionHeader, Switch } from '#lib/bits/custom/index.js'
import { SectionHeaderPrimitive } from '#lib/bits/custom/form/index.js'
import FormDisclosureGroup from '../formDisclosureGroup/FormDisclosureGroup.svelte'
// ICONS
import LayersIcon from 'virtual:icons/proicons/layers'
// TYPES
import type { FormHubLayersSectionProps } from './formHubLayersSection.types'

let {
  title,
  subtitle,
  items,
  issues = [],
  hiddenLayerDefaultInputAttrs = [],
  isEditing = true,
  isSubmitting = false,
  onToggleDefault,
  class: className = '',
}: FormHubLayersSectionProps = $props()

const isDisabled = $derived(!isEditing || isSubmitting)
const hasIssues = $derived(issues.length > 0)

let collapsedGroupIds = $state<Record<string, boolean>>({})
let areAllGroupsCollapsed = $state(false)

type HubLayerGroup = {
  id: string
  name: string
  items: FormHubLayersSectionProps['items']
}

const groupedItems = $derived.by(() => {
  const groupsById = new Map<string, HubLayerGroup>()

  for (const item of items) {
    const existingGroup = groupsById.get(item.organisationId)
    if (existingGroup) {
      existingGroup.items.push(item)
      continue
    }

    groupsById.set(item.organisationId, {
      id: item.organisationId,
      name: item.organisationName,
      items: [item],
    })
  }

  return Array.from(groupsById.values())
    .map(group => ({
      ...group,
      items: [...group.items].sort((left, right) =>
        `${left.projectNameShort} ${left.layerName}`.localeCompare(
          `${right.projectNameShort} ${right.layerName}`,
        ),
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
})

function setGroupCollapsed(groupId: string, collapsed: boolean): void {
  collapsedGroupIds = {
    ...collapsedGroupIds,
    [groupId]: collapsed,
  }
}

function handleCollapseAll(nextCollapsed: boolean): void {
  areAllGroupsCollapsed = nextCollapsed
  collapsedGroupIds = Object.fromEntries(
    groupedItems.map(group => [group.id, nextCollapsed]),
  )
}

$effect(() => {
  const nextCollapsedById: Record<string, boolean> = {}

  for (const group of groupedItems) {
    nextCollapsedById[group.id] = collapsedGroupIds[group.id] ?? areAllGroupsCollapsed
  }

  const previousKeys = Object.keys(collapsedGroupIds)
  const nextKeys = Object.keys(nextCollapsedById)
  const hasShapeChanged =
    previousKeys.length !== nextKeys.length ||
    nextKeys.some(key => collapsedGroupIds[key] !== nextCollapsedById[key])

  if (hasShapeChanged) {
    collapsedGroupIds = nextCollapsedById
  }

  areAllGroupsCollapsed =
    groupedItems.length > 0 &&
    groupedItems.every(group => nextCollapsedById[group.id] === true)
})
</script>

<section class={`bits-form__section flex min-h-0 flex-col ${className}`}>
  <SectionHeader
    icon={LayersIcon}
    {title}
    description={subtitle}
    onCollapsableToggle={groupedItems.length > 0 ? handleCollapseAll : undefined}
    isCollapsableCollapsed={areAllGroupsCollapsed}
  >
    {#if hasIssues}
      {#snippet center()}
        <SectionHeaderPrimitive.Issues {issues} />
      {/snippet}
    {/if}
  </SectionHeader>

  <div class="flex min-h-0 flex-col">
    {#each groupedItems as group (group.id)}
      <FormDisclosureGroup
        title={group.name}
        count={`${group.items.length} ${m.maps__layers()}`}
        collapsed={collapsedGroupIds[group.id] ?? false}
        onCollapsedChange={collapsed => setGroupCollapsed(group.id, collapsed)}
      >
        <ul class="px-6">
          {#each group.items as item (item.id)}
            <li
              class="flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border/40 py-4 last:border-b-0"
            >
              <div class="min-w-0 flex-1">
                <p class="break-words text-sm font-medium text-foreground">
                  {item.layerName}
                </p>
                <p class="break-words text-xs text-muted-foreground">
                  {item.projectNameShort}
                </p>
              </div>
              <div
                class="flex shrink-0 items-center gap-3 [&_.bits-switch-label]:sr-only"
                title={m.admin__forms_layer_visible_by_default()}
              >
                <span class="text-xs text-muted-foreground">{m.default_enabled()}</span>
                <Switch
                  checked={item.isDefaultVisible}
                  disabled={isDisabled}
                  rightText={`${item.layerName}: ${m.admin__forms_layer_visible_by_default()}`}
                  size="sm"
                  onCheckedChange={value => onToggleDefault(item.id, value === true)}
                />
              </div>
            </li>
          {/each}
        </ul>
      </FormDisclosureGroup>
    {:else}
      <p class="px-6 py-10 text-sm text-muted-foreground">
        {m.resource_no_results()}
      </p>
    {/each}
  </div>

  <div class="hidden" aria-hidden="true">
    {#each hiddenLayerDefaultInputAttrs as inputAttrs, index (index)}
      <input {...inputAttrs}>
    {/each}
  </div>
</section>
