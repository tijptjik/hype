export interface ProfileSectionProps {
  avatarSrc?: string | null
  userDisplayName?: string | null
  userAttribution?: string | null
  hideActions?: boolean
  hideEditableFields?: boolean
  isEditingUsername?: boolean
  isLoadingUsername?: boolean
  showSuccessIndicator?: boolean
  showErrorIndicator?: boolean
  editedUsername?: string
  onEditedUsernameChange?: (value: string) => void
  usernameInputPlaceholder?: string
  openProfileText?: string
  logoutText?: string
  onStartEditingUsername?: () => void
  onSaveUsername?: () => void | Promise<void>
  onCancelEdit?: () => void
  onOpenProfile?: () => void
  onLogout?: () => void | Promise<void>
}
