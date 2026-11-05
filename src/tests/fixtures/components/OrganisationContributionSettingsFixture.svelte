<script lang="ts">
import Settings from '#lib/bits/patterns/organisationUsers/OrganisationUserSettings.svelte'
import { DEFAULT_ORGANISATION_USER_POLICY } from '#lib/organisation-users/policy.js'
let policy = $state({ ...DEFAULT_ORGANISATION_USER_POLICY, enabled: true })
let disabled = $state(false)
</script>
<div class="bits-theme bg-background text-foreground min-h-screen">
  <button type="button" onclick={() => (disabled = !disabled)}>Toggle editing</button>
  <Settings
    {policy}
    {disabled}
    hubId={null}
    hubDomain={null}
    onChange={patch => (policy = { ...policy, ...patch })}
  />
  <output class="sr-only">{JSON.stringify(policy)}</output>
</div>
