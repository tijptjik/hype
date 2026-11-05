<script lang="ts">
// BITS COMPONENTS
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import Badge from '#lib/bits/custom/badge/Badge.svelte'
import SimpleTooltip from '#lib/bits/core/tooltip/SimpleTooltip.svelte'
import UserAccessPermissions from './UserAccessPermissions.svelte'
// STYLES
import { formSectionDividerStyles } from '#lib/bits/patterns/forms/formSurface/formSurface.styles.js'
// I18N
import { getCapabilityLabel } from '#lib/capabilities.js'
// ICONS
import HubIcon from 'virtual:icons/proicons/building-multiple'
import OrganisationIcon from 'virtual:icons/proicons/person-multiple'
import ProjectIcon from 'virtual:icons/proicons/grid'
import AccessIcon from 'virtual:icons/proicons/shield-checkmark'
import InfoIcon from 'virtual:icons/lucide/info'
// TYPES
import type { UserAccessOverview } from '#lib/users/access.types.js'

let { access }: { access: UserAccessOverview } = $props()
const groups = $derived([
  { title: 'Hubs', path: 'hubs', icon: HubIcon, rows: access.hubs },
  {
    title: 'Organizations',
    path: 'organisations',
    icon: OrganisationIcon,
    rows: access.organisations,
  },
  { title: 'Projects', path: 'projects', icon: ProjectIcon, rows: access.projects },
])
</script>

<section aria-label="Roles and capabilities" class="min-w-0">
  <SectionHeader
    title="Roles and capabilities"
    description="Direct assignments; permissions include inherited access"
    icon={AccessIcon}
    class="[&_[data-header-title-text]]:whitespace-normal! [&>div:last-child]:[container-type:normal]"
  >
    {#snippet right()}
      <SimpleTooltip
        triggerClass="flex size-8 items-center justify-center rounded-md hover:bg-primary/10"
        triggerProps={{ 'aria-label': 'About inherited access', role: 'button' }}
        contentClass="max-w-96 space-y-3 p-4 text-sm"
      >
        {#snippet trigger()}
          <InfoIcon class="text-muted-foreground size-4" />
        {/snippet}
        {#snippet children()}
          <p>
            Hub admins also administer their hub’s organizations and projects.
            Organization owners inherit management access to their projects. Core hub
            admins have SuperAdmin access across HYPE.
          </p>
          <p>
            Inherited access and implicit public access do not create additional
            assignments below. Resource permissions include inherited authority; field
            and content restrictions still apply.
          </p>
          <p>
            Manage assignments from each resource’s role settings. This overview is
            read-only.
          </p>
        {/snippet}
      </SimpleTooltip>
    {/snippet}
  </SectionHeader>
  {#if access.scope === 'managed'}
    <p class="text-muted-foreground px-6 py-4 text-sm">
      Only assignments on resources whose roles you can manage are shown.
    </p>
  {/if}
  {#each groups as group (group.path)}
    <section aria-label={group.title} class={`min-w-0 ${formSectionDividerStyles}`}>
      <SectionHeader
        title={group.title}
        icon={group.icon}
        class="[&>div:last-child]:[container-type:normal]"
      >
        {#snippet right()}
          <span class="text-muted-foreground text-sm tabular-nums"
            >{group.rows.length}</span
          >
        {/snippet}
      </SectionHeader>
      {#if group.rows.length === 0}
        <p class="text-muted-foreground px-6 py-5 text-sm">
          No direct assignments{access.scope === 'managed'
            ? ' visible in your scope'
            : ''}.
        </p>
      {:else}
        <ul class="divide-border/40 divide-y px-6">
          {#each group.rows as row (row.id)}
            <li
              class="grid min-w-0 gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-6"
            >
              <div class="min-w-0 space-y-2">
                <a
                  href={`/admin/${group.path}/${encodeURIComponent(row.id)}`}
                  class="text-primary block min-w-0 font-semibold break-words whitespace-normal underline-offset-4 hover:underline"
                  >{row.name}</a
                >
                <p class="text-muted-foreground text-xs break-words">
                  {row.parent ? `${row.parent} / ` : ''}{row.code}
                </p>
                <div class="flex flex-wrap gap-2">
                  <Badge
                    text={row.role}
                    class="border-primary/20 bg-primary/5 text-foreground text-xs tracking-normal capitalize"
                  />
                  {#if row.isArchived}
                    <Badge
                      text="Archived"
                      class="text-xs tracking-normal normal-case"
                    />
                  {/if}
                </div>
              </div>
              <div
                class="border-border/40 min-w-0 space-y-4 border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
              >
                <UserAccessPermissions permissions={row.permissions} />
                {#if group.path === 'projects'}
                  <div class="space-y-2">
                    <h3 class="text-muted-foreground text-xs font-medium">
                      Assigned capabilities
                    </h3>
                    {#if row.capabilities.length}
                      <ul class="flex min-w-0 flex-wrap gap-2">
                        {#each row.capabilities as capability (capability.key)}
                          <li class="max-w-full min-w-0 space-y-1">
                            <Badge
                              text={getCapabilityLabel(capability.key, 'en')}
                              class="border-primary/20 bg-primary/5 text-foreground max-w-full shrink text-xs tracking-normal whitespace-normal normal-case"
                            />
                            {#if !capability.available}
                              <p class="text-muted-foreground px-2 text-xs">
                                Not currently assignable
                              </p>
                            {/if}
                          </li>
                        {/each}
                      </ul>
                    {:else}
                      <p class="text-muted-foreground text-sm">-</p>
                    {/if}
                  </div>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
</section>
