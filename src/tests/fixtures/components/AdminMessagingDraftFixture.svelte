<script lang="ts">
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import AdminUserMessagingFields from '#lib/bits/patterns/userDirectory/AdminUserMessagingFields.svelte'
import { createAdminMessagingDraft } from '#lib/users/adminMessagingDraft.js'
setResponsiveCtx()
let { phoneNumber = '', editing = true }: { phoneNumber?: string; editing?: boolean } =
  $props()
const saved = { platform: 'whatsapp' as const, preferredPlatform: null, identities: [] }
let draft = $state(createAdminMessagingDraft(saved))
const baseline = JSON.stringify(draft)
</script>
<AdminUserMessagingFields
  {phoneNumber}
  bind:value={draft}
  {editing}
  onChange={() => {}}
/>
<button type="button" onclick={() => (draft = createAdminMessagingDraft(saved))}>
  Reset
</button>
<p data-testid="dirty">{JSON.stringify(draft) !== baseline ? 'Dirty' : 'Clean'}</p>
