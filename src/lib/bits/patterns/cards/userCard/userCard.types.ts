export interface UserCardWrapperProps {
  class?: string
  isAnimated?: boolean
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
  value: string
  label: string
}

export interface UserCardActionsProps {
  selectedRole: string
  roleOptions: UserCardActionsRoleOption[]
  roleFieldName?: string
  isRemoving?: boolean
  isEditing?: boolean
  onRoleChange?: (nextRole: string) => void
  onRemove?: () => void
  class?: string
}
