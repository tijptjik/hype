<script lang="ts">
// COMPONENTS
import * as ProfileSectionPrimitive from './components'
// TYPES
import type { ProfileSectionProps } from './profileSection.types'

let {
  avatarSrc = null,
  userDisplayName = null,
  userAttribution = null,
  isGuest = false,
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
  upgradeText = '',
  onStartEditingUsername,
  onSaveUsername,
  onCancelEdit,
  onOpenProfile,
  onLogout,
  onUpgrade,
}: ProfileSectionProps = $props()
</script>

<div
  class={`bits-theme relative flex w-full flex-col items-center overflow-hidden ${
    isGuest ? 'min-h-[17rem] justify-center' : ''
  }`}
>
  <ProfileSectionPrimitive.ProfileSectionBackground {isGuest} />

  <div
    class={`flex flex-col items-center gap-3 ${
      isGuest ? 'absolute inset-x-0 top-1/2 -translate-y-1/2' : 'py-4'
    }`}
  >
    <ProfileSectionPrimitive.ProfileSectionAvatar {avatarSrc} {isGuest} />
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
      {isGuest}
      {hideActions}
      {openProfileText}
      {logoutText}
      {upgradeText}
      {onOpenProfile}
      {onLogout}
      {onUpgrade}
    />
  </div>
</div>
