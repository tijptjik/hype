<script lang="ts">
// SVELTE
import { untrack, type Snippet } from 'svelte'
// ADAPTER
import { useMessagingAppearance } from '#lib/adapters/messaging/useMessagingAppearance.svelte.js'
// MESSAGING
import { chatAppearanceStyle } from '#lib/messaging/appearance.js'
let { organisationId, children }: { organisationId: string; children: Snippet } =
  $props()
const model = untrack(() => useMessagingAppearance(organisationId))
</script>

<div
  class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
  style={chatAppearanceStyle(model.appearance)}
>
  {@render children()}
</div>
