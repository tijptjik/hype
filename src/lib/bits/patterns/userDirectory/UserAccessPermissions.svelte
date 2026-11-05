<script lang="ts">
// BITS COMPONENTS
import Badge from '#lib/bits/custom/badge/Badge.svelte'
// ICONS
import HubIcon from 'virtual:icons/proicons/building-multiple'
import OrganisationIcon from 'virtual:icons/proicons/person-multiple'
import ProjectIcon from 'virtual:icons/proicons/grid'
import RolesIcon from 'virtual:icons/proicons/shield'
import CapabilitiesIcon from 'virtual:icons/proicons/shield-checkmark'
// TYPES
import type { Component } from 'svelte'

let { permissions }: { permissions: string[] } = $props()
const definitions: { label: string; icon: Component; actions: [string, string][] }[] = [
  {
    label: 'Hub',
    icon: HubIcon,
    actions: [
      ['Edit hub', 'Edit'],
      ['Publish hub', 'Publish'],
      ['Delete hub', 'Delete'],
      ['Create hubs', 'Create'],
    ],
  },
  {
    label: 'Organization',
    icon: OrganisationIcon,
    actions: [
      ['Edit organisation', 'Edit'],
      ['Publish organisation', 'Publish'],
      ['Delete organisation', 'Delete'],
      ['Create organisations', 'Create'],
    ],
  },
  {
    label: 'Project',
    icon: ProjectIcon,
    actions: [
      ['Edit project', 'Edit'],
      ['Translate project', 'Translate'],
      ['Publish project', 'Publish'],
      ['Delete project', 'Delete'],
      ['Create projects', 'Create'],
    ],
  },
  { label: 'Roles', icon: RolesIcon, actions: [['Manage roles', 'Manage']] },
  {
    label: 'Capabilities',
    icon: CapabilitiesIcon,
    actions: [
      ['Configure capabilities', 'Configure'],
      ['Assign capabilities', 'Assign'],
    ],
  },
]
const groups = $derived(
  definitions
    .map(group => ({
      ...group,
      actions: group.actions.filter(([permission]) => permissions.includes(permission)),
    }))
    .filter(group => group.actions.length),
)
// Preserve unfamiliar permissions until their resource grouping is defined.
const other = $derived(
  permissions.filter(
    permission =>
      !definitions.some(group => group.actions.some(([label]) => label === permission)),
  ),
)
</script>

{#if permissions.length}
  <dl aria-label="Resource permissions" class="grid min-w-0 gap-2.5">
    {#each groups as group (group.label)}
      <div
        class="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-2.5 sm:grid-cols-[8rem_minmax(0,1fr)]"
      >
        <dt
          class="text-muted-foreground flex min-h-7 items-center gap-2 text-xs"
          title={group.label}
        >
          <group.icon class="text-primary size-4 shrink-0" aria-hidden="true" />
          <span class="sr-only sm:not-sr-only">{group.label}</span>
        </dt>
        <dd class="flex min-w-0 flex-wrap gap-1.5">
          {#each group.actions as [permission, verb] (permission)}
            <span title={permission}>
              <Badge
                text={verb}
                class="border-primary/20 bg-primary/5 text-foreground min-h-7 px-3 text-xs font-medium tracking-normal normal-case"
              />
            </span>
          {/each}
        </dd>
      </div>
    {/each}
    {#if other.length}
      <div>
        <dt class="sr-only">Other permissions</dt>
        <dd class="flex flex-wrap gap-1.5">
          {#each other as permission (permission)}
            <Badge
              text={permission}
              class="min-h-7 shrink tracking-normal whitespace-normal normal-case"
            />
          {/each}
        </dd>
      </div>
    {/if}
  </dl>
{:else}
  <p class="text-muted-foreground text-sm">No management permissions</p>
{/if}
