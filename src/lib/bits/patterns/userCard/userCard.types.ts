import type { OrganisationRoleType } from '$lib/enums'

export interface UserCardWrapperProps {
  class?: string
}

export interface UserCardRootProps {
  class?: string
}

export interface UserCardAvatarProps {
  name?: string | null
  image?: string | null
  class?: string
}

export interface UserCardBodyProps {
  name?: string | null
  attribution?: string | null
  class?: string
}

export interface UserCardActionsRoleOption {
  value: OrganisationRoleType
  label: string
}

export interface UserCardActionsProps {
  selectedRole: OrganisationRoleType
  roleOptions: UserCardActionsRoleOption[]
  isRemoving?: boolean
  isEditing?: boolean
  onRoleChange?: (nextRole: OrganisationRoleType) => void
  onRemove?: () => void
  class?: string
}
