<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// ADAPTER
import { useUserMessagingSettingsModel } from '#lib/adapters/messaging/useUserMessagingSettingsModel.svelte.js'

let {
  onModel,
}: { onModel: (model: ReturnType<typeof useUserMessagingSettingsModel>) => void } =
  $props()
const model = useUserMessagingSettingsModel()
untrack(() => onModel(model))
</script>
<p>{model.loading ? 'Loading' : 'Ready'}</p>
