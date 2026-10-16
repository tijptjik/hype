<script lang="ts">
import { setResponsiveCtx } from '#lib/context/responsive.svelte'
import FormUserRolesSection from '#lib/bits/patterns/forms/formUserRolesSection/FormUserRolesSection.svelte'
import type { OrganisationRoleUser } from '#lib/db/zod/schema/organisation.types'

let {
  onRemoveUser = (_id: string) => {},
  currentUserId = 'self',
  resourceKey = 'organisation-one',
  isEditing = true,
}: {
  onRemoveUser?: (id: string) => void
  currentUserId?: string
  resourceKey?: string
  isEditing?: boolean
} = $props()
setResponsiveCtx()
const userRoles = [
  { userId: 'self', role: 'owner', user: { id: 'self', name: 'Alex Self' } },
  { userId: 'other', role: 'member', user: { id: 'other', name: 'Robin Other' } },
] as OrganisationRoleUser[]
</script>

<div class="bits-theme" data-theme="hype-black">
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
  />
</div>
