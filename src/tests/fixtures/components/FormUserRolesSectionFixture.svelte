<script lang="ts">
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import AnalyticsGrant from '#lib/bits/patterns/analytics/AnalyticsGrant.svelte'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import FormUserRolesSection from '#lib/bits/patterns/forms/formUserRolesSection/FormUserRolesSection.svelte'
import type { OrganisationRoleUser } from '#lib/db/zod/schema/organisation.types.js'

const defaultUserRoles = [
  {
    userId: 'self',
    role: 'owner',
    user: {
      id: 'self',
      name: 'Alex Self',
      username: 'alex',
      displayUsername: 'Alex',
    },
  },
  { userId: 'other', role: 'member', user: { id: 'other', name: 'Robin Other' } },
] as OrganisationRoleUser[]

let {
  onRemoveUser = (_id: string) => {},
  currentUserId = 'self',
  resourceKey = 'organisation-one',
  isEditing = true,
  userRoles = defaultUserRoles,
}: {
  onRemoveUser?: (id: string) => void
  currentUserId?: string
  resourceKey?: string
  isEditing?: boolean
  userRoles?: OrganisationRoleUser[]
} = $props()
setResponsiveCtx()
</script>

<div class="bits-theme" data-theme="hype-black">
  <FormSurface>
    <FormUserRolesSection
      title="Members"
      layout="list"
      {currentUserId}
      {userRoles}
      {isEditing}
      transitionEntityKey={resourceKey}
      {onRemoveUser}
      onAddUser={() => {}}
      onRoleChange={() => {}}
    >
      {#snippet memberDetails(userId, role)}
        <AnalyticsGrant {userId} isOwner={role === 'owner'} {isEditing} />
      {/snippet}
    </FormUserRolesSection>
  </FormSurface>
</div>
