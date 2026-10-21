<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// DOMAIN
import { lifecycleLabel } from '#lib/locations/lifecycle.i18n.js'
import { lifecycleStatus } from '#lib/locations/lifecycle.js'
// TYPES
import type { LocationLifecycleSummary } from '#lib/locations/lifecycle.js'
let { value }: { value?: LocationLifecycleSummary | null } = $props()
const status = $derived(lifecycleStatus(value))
</script>

{#if status !== 'unknown'}
  <span
    class="inline-flex rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
    title={m.location_lifecycle_title()}
    >{lifecycleLabel(status)}</span
  >
{/if}
