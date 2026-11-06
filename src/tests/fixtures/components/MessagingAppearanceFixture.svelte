<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import ChatBackgroundSettings from '#lib/bits/patterns/messaging/ChatBackgroundSettings.svelte'
// MESSAGING
import {
  DEFAULT_CHAT_APPEARANCE,
  type ChatAppearance,
} from '#lib/messaging/appearance.js'
setResponsiveCtx()
let appearance = $state<ChatAppearance>({ ...DEFAULT_CHAT_APPEARANCE })
</script>

<ChatBackgroundSettings
  {appearance}
  disabled={false}
  onChange={value => {
    appearance = value
  }}
/>
