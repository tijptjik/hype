<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// BITS COMPONENTS
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import { resourceTabsStyles } from '#lib/bits/patterns/forms/formSurface/resourceTabs.styles.js'
import ProjectCapabilities from '#lib/bits/patterns/capabilities/projectCapabilities/ProjectCapabilities.svelte'
import FormProjectLayersSection from '#lib/bits/patterns/forms/formProjectLayersSection/FormProjectLayersSection.svelte'
setResponsiveCtx()
let editing = $state(false)
let tab = $state('capabilities')
let enabled = $state<import('#lib/capabilities.types.js').CapabilityKey[]>([
  'manageBakeries',
  'manageVolunteers',
  'manageDropOffs',
])
let visible = $state(true)
let assigned = $state<Record<string, Record<string, boolean>>>({
  member: { manageVolunteers: true },
})
const noop = (): void => {}
/**
 * Select a project tab and mode for browser visual checks.
 * @param next - Tab to display.
 * @param edit - Whether controls are editable.
 * @returns Nothing.
 */
export function setView(next: string, edit: boolean): void {
  tab = next
  editing = edit
}
</script>

<div class="bits-theme">
  <main class="bits-admin-shell__main">
    <FormSurface class={resourceTabsStyles}>
      {#if tab === 'capabilities'}
        <ProjectCapabilities
          availableCapabilityKeys={[
            'manageBakeries',
            'manageVolunteers',
            'manageDropOffs',
          ]}
          enabledCapabilityKeys={enabled}
          capabilityLabelByKey={{
            manageBakeries: 'Donor Manager',
            manageVolunteers: 'Event Manager',
            manageDropOffs: 'Dropoff Point Manager',
          }}
          matrixRows={[
            {
              userId: 'member',
              name: 'Alex Chan',
              role: 'owner',
              capabilities: assigned.member,
            },
            {
              userId: 'second',
              name: 'Jamie Wong',
              role: 'member',
              capabilities: assigned.second,
            },
          ]}
          isEditing={editing}
          onToggleCapability={(key, value) =>
            (enabled = value
              ? [...enabled, key]
              : enabled.filter(item => item !== key))}
          onToggleCell={({ userId, capabilityKey, value }) =>
            (assigned = {
              ...assigned,
              [userId]: { ...assigned[userId], [capabilityKey]: value },
            })}
        />
      {:else}
        <FormProjectLayersSection
          title="Layer Order"
          subtitle="Drag layers to control project order and choose which ones appear when the project is added to the map."
          items={[
            {
              id: 'layer',
              projectNameShort: 'Food support',
              layerName: 'Community collection points',
              isDefaultVisible: visible,
            },
          ]}
          isEditing={editing}
          onToggleDefault={(_, value) => (visible = value)}
          onMove={noop}
        />
      {/if}
    </FormSurface>
  </main>
</div>
