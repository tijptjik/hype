<script lang="ts">
// CONTEXT
import { OmniCtx } from '#lib/context/omni.svelte.js'
// TYPES
import type { AppCtx } from '#lib/context/app.svelte.js'

let { app, onReady }: { app: AppCtx; onReady: (omni: OmniCtx) => void } = $props()
// The context owns component lifecycle cleanup and must be constructed during mount.
// svelte-ignore state_referenced_locally
onReady(new OmniCtx(app))
</script>
