<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// ADAPTER
import { useUserMessagingSettingsModel } from '#lib/adapters/messaging/useUserMessagingSettingsModel.svelte.js'

let {
  onModel,
  initialSettings,
}: {
  initialSettings?: import('#lib/messaging/contactValidation.js').MessagingProfileSettings
  onModel: (model: ReturnType<typeof useUserMessagingSettingsModel>) => void
} = $props()
const model = untrack(() =>
  useUserMessagingSettingsModel(undefined, false, initialSettings),
)
untrack(() => onModel(model))
</script>
<p>{model.loading ? 'Loading' : 'Ready'}</p>
