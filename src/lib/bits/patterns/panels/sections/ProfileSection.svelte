<script lang="ts">
// COMPONENTS
import * as ProfileSectionPrimitive from './components'
// TYPES
import type { ProfileSectionProps } from './profileSection.types'

let {
  avatarSrc = null,
  userDisplayName = null,
  userAttribution = null,
  hideActions = false,
  hideEditableFields = false,
  isEditingUsername = false,
  isLoadingUsername = false,
  showSuccessIndicator = false,
  showErrorIndicator = false,
  editedUsername = '',
  onEditedUsernameChange,
  usernameInputPlaceholder = '',
  openProfileText = '',
  logoutText = '',
  onStartEditingUsername,
  onSaveUsername,
  onCancelEdit,
  onOpenProfile,
  onLogout,
}: ProfileSectionProps = $props()
</script>

<div class="bits-theme relative flex w-full flex-col items-center overflow-hidden">
  <ProfileSectionPrimitive.ProfileSectionBackground />

  <div class="flex flex-col items-center gap-3 py-4">
    <ProfileSectionPrimitive.ProfileSectionAvatar {avatarSrc} />
    <ProfileSectionPrimitive.ProfileSectionUsername
      {userDisplayName}
      {userAttribution}
      {hideEditableFields}
      {isEditingUsername}
      {isLoadingUsername}
      {showSuccessIndicator}
      {showErrorIndicator}
      {editedUsername}
      {onEditedUsernameChange}
      {usernameInputPlaceholder}
      {onStartEditingUsername}
      {onSaveUsername}
      {onCancelEdit}
    />
    <ProfileSectionPrimitive.ProfileSectionActions
      {hideActions}
      {openProfileText}
      {logoutText}
      {onOpenProfile}
      {onLogout}
    />
  </div>
</div>
