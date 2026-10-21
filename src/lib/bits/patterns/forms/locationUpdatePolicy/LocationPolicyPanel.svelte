<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// API
import { getLocationUpdatePolicy } from '#lib/api/location.remote.js'
// COMPONENTS
import LocationUpdatePolicyForm from './LocationUpdatePolicyForm.svelte'
let {
  projectId,
  isEditing,
  saving,
  resetVersion,
  onChange,
}: {
  projectId: string
  isEditing: boolean
  saving: boolean
  resetVersion: number
  onChange: (value: string | undefined) => void
} = $props()
const settings = $derived(getLocationUpdatePolicy({ projectId }))
</script>

{#await settings}
  <p class="p-6 text-muted-foreground" role="status">{m.location_policy_loading()}</p>
{:then initial}
  <LocationUpdatePolicyForm {initial} {isEditing} {saving} {resetVersion} {onChange} />
{:catch}
  <p class="p-6 text-muted-foreground" role="alert">
    {m.location_policy_unavailable()}
  </p>
{/await}
