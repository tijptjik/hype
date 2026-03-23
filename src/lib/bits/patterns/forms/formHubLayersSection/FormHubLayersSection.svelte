<script lang="ts">
import { FormGrid } from '$lib/bits/patterns/layout'
import { SimpleTooltip } from '$lib/bits/core'
import { Card, Icon, SectionHeader, Switch } from '$lib/bits/custom'
import { SectionHeaderPrimitive } from '$lib/bits/custom/form'
import { ResourceCard } from '$lib/bits/patterns/cards/resourceCard'
import { m } from '$lib/i18n'
import ChevronRightIcon from 'virtual:icons/lucide/chevron-right'
import EyeIcon from 'virtual:icons/lucide/eye'
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

<section class={`bits-form__section flex min-h-0 flex-col gap-4 ${className}`}>
  <SectionHeader
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

  <div class="flex min-h-0 flex-col gap-4">
    {#each groupedItems as group (group.id)}
      <section class="flex min-h-0 flex-col gap-3">
        <div
          class="flex h-10 flex-row items-center justify-between gap-2 rounded-2xl px-3 @container"
        >
          <button
            type="button"
            class="flex h-12 cursor-pointer items-center gap-4 transition-opacity hover:opacity-80"
            aria-expanded={!collapsedGroupIds[group.id]}
            onclick={() => setGroupCollapsed(group.id, !collapsedGroupIds[group.id])}
          >
            <div
              class="rotate-90 text-base-content transition-transform duration-200"
              class:rotate-0={collapsedGroupIds[group.id]}
              aria-hidden="true"
            >
              <Icon
                src={ChevronRightIcon}
                size="md"
                strokeWidth={3.5}
                class="h-5 w-5"
              />
            </div>
            <h3 class="shrink text-xl font-bold uppercase text-base-content">
              {group.name}
            </h3>
          </button>

          <small class="hidden select-text pr-3 text-sm text-base-content/50 @sm:block">
            {group.items.length} {m.maps__layers()}
          </small>
        </div>

        {#if !collapsedGroupIds[group.id]}
          <FormGrid minWidth={360}>
            {#each group.items as item (item.id)}
              <ResourceCard.Root>
                <ResourceCard.Body code={item.projectNameShort} name={item.layerName} />
                <Card.Actions
                  padding="md"
                  bg="panel"
                  class="bits-form__parent-resource-actions-rail bits-form__hub-layer-actions-rail"
                >
                  <div
                    class="bits-form__parent-resource-actions bits-form__hub-layer-actions"
                  >
                    <SimpleTooltip>
                      {#snippet trigger()}
                        <label
                          class="bits-form__parent-resource-default bits-form__hub-layer-default"
                        >
                          <span
                            class="bits-form__parent-resource-default-icon bits-form__hub-layer-default-icon"
                          >
                            <EyeIcon />
                          </span>
                          <span
                            class="bits-form__parent-resource-default-label bits-form__hub-layer-default-label"
                          >
                            {m.default_enabled()}
                          </span>
                          <Switch
                            checked={item.isDefaultVisible}
                            disabled={isDisabled}
                            size="md"
                            class="bits-form__hub-layer-default-switch"
                            onCheckedChange={value =>
                              onToggleDefault(item.id, value === true)}
                          />
                        </label>
                      {/snippet}
                      {m.admin__forms_layer_visible_by_default()}
                    </SimpleTooltip>
                  </div>
                </Card.Actions>
              </ResourceCard.Root>
            {/each}
          </FormGrid>
        {/if}
      </section>
    {/each}
  </div>

  <div class="hidden" aria-hidden="true">
    {#each hiddenLayerDefaultInputAttrs as inputAttrs, index (index)}
      <input {...inputAttrs}>
    {/each}
  </div>
</section>
