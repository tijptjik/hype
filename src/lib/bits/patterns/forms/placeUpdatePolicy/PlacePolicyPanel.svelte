<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// API
import { getPlaceUpdatePolicy } from '#lib/api/place.remote.js'
// COMPONENTS
import PlaceUpdatePolicyForm from './PlaceUpdatePolicyForm.svelte'
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
const settings = $derived(getPlaceUpdatePolicy({ projectId }))
</script>

{#await settings}
  <p class="p-6 text-muted-foreground" role="status">{m.place_policy_loading()}</p>
{:then initial}
  <PlaceUpdatePolicyForm {initial} {isEditing} {saving} {resetVersion} {onChange} />
{:catch}
  <p class="p-6 text-muted-foreground" role="alert">{m.place_policy_unavailable()}</p>
{/await}
