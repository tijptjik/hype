<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// BITS COMPONENTS
import { SectionHeader, Switch } from '#lib/bits/custom/index.js'
import { SectionHeaderPrimitive } from '#lib/bits/custom/form/index.js'
import { Button } from '#lib/bits/core/index.js'
import EmptyState from '#lib/bits/custom/emptyState/EmptyState.svelte'
import Avatar from '#lib/bits/core/avatar/Avatar.svelte'
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
  onAdd,
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

<section
  class={`bits-form__section @container flex min-h-0 flex-1 flex-col ${className}`}
>
  <SectionHeader
    icon={LayersIcon}
    {title}
    description={subtitle}
    class="[&_.bits-form\_\_section-header-right]:[container-type:normal]!"
    onCollapsableToggle={groupedItems.length > 0 ? handleCollapseAll : undefined}
    isCollapsableCollapsed={areAllGroupsCollapsed}
  >
    {#if hasIssues}
      {#snippet center()}
        <SectionHeaderPrimitive.Issues {issues} />
      {/snippet}
    {/if}
  </SectionHeader>

  <div class="flex min-h-0 flex-1 flex-col">
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
              class="border-border/40 grid min-h-16 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 border-b py-3 last:border-b-0"
            >
              <Avatar
                src={`/api/mapRenders/layers/${encodeURIComponent(item.id)}/asset`}
                name={item.layerName}
                alt={item.layerName}
                shape="square"
                class="size-10 rounded-lg"
              />
              <div class="min-w-0 flex-1">
                <p class="text-foreground text-sm font-medium break-words">
                  {item.layerName}
                </p>
                <p class="text-muted-foreground text-xs break-words">
                  {item.projectNameShort}
                </p>
              </div>
              <div
                class="flex shrink-0 items-center gap-3 [&_.bits-switch-label]:sr-only"
                data-tooltip={m.admin__forms_layer_visible_by_default()}
              >
                <span class="text-muted-foreground hidden text-xs @min-[28rem]:inline"
                  >{m.default_enabled()}</span
                >
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
      <EmptyState
        title={m.admin__forms_hub_layers_empty_title()}
        description={m.admin__forms_hub_layers_empty_description()}
        actions={onAdd ? emptyActions : undefined}
      />
      {#snippet emptyActions()}
        <Button
          text={m.map__select_layer()}
          color="primary"
          iconComponent={LayersIcon}
          onClick={() => onAdd?.()}
          disabled={isSubmitting}
        />
      {/snippet}
    {/each}
  </div>

  <div class="hidden" aria-hidden="true">
    {#each hiddenLayerDefaultInputAttrs as inputAttrs, index (index)}
      <input {...inputAttrs}>
    {/each}
  </div>
</section>
