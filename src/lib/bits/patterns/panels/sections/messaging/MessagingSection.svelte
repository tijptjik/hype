<script lang="ts">
// ICONS
import Messages from 'virtual:icons/tabler/messages'
// COMPONENTS
import UserMessagingSettings from '#lib/bits/patterns/messaging/UserMessagingSettings.svelte'
import Section from '#lib/bits/patterns/panels/components/common/Section.svelte'
// TYPES
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'

let { ...panelProps }: PanelProps = $props()
</script>

<Section {...panelProps} title="Messaging" icon={Messages} defaultOpen={false}>
  <div class="px-6 pt-2 pb-6">
    <UserMessagingSettings embedded />
  </div>
</Section>
