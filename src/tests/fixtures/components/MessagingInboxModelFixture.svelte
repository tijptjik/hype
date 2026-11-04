<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// ADAPTER
import { useMessagingInboxModel } from '#lib/adapters/messaging/useMessagingInboxModel.svelte.js'
let { pins = [], onScope, onModel }: {
  pins?: string[]
  onScope: (scope: { prisms: { organisation: string[] }; selectOrganisation: (id: string | null) => Promise<void> }) => void
  onModel: (model: ReturnType<typeof useMessagingInboxModel>) => void
} = $props()
let organisation = $state(untrack(() => [...pins]))
const scope = {
  prisms: { get organisation() { return organisation } },
  async selectOrganisation(id: string | null): Promise<void> { organisation = id ? [id] : [] },
}
untrack(() => onScope(scope))
const model = useMessagingInboxModel()
untrack(() => onModel(model))
</script>
<p data-testid="selection">{model.selectedOrganisation}</p>
<p data-testid="loading">{String(model.loading)}</p>
<p data-testid="conversations">{model.conversations.length}</p>
