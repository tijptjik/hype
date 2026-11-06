<script lang="ts">
// BITS COMPONENTS
import * as Main from '#lib/bits/custom/main/index.js'
import { SectionHeader } from '#lib/bits/custom/form/index.js'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import AdminUserProfile from './AdminUserProfile.svelte'
// ICONS
import PersonIcon from 'virtual:icons/proicons/person'
// TYPES
import type { AdminUserProfile as ProfileData } from '#lib/db/zod/schema/user.types.js'
import type { UserContributionsModel } from '#lib/adapters/panels/userContributions.js'

let {
  data,
  model,
  isVisible,
}: {
  data: ProfileData
  model: UserContributionsModel
  isVisible: boolean
} = $props()
</script>

<Main.Facet {isVisible} fillHeight edgeToEdge>
  <FormSurface class="mb-0 flex min-h-0 flex-1 shrink flex-col">
    <SectionHeader
      title="Contributions"
      description="Contributions you can view, including unpublished records you manage"
      icon={PersonIcon}
    />
    {#if isVisible}
      <AdminUserProfile {data} {model} showIdentity={false} />
    {/if}
  </FormSurface>
</Main.Facet>
