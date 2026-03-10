<script lang="ts">
import { slide } from 'svelte/transition'
import { m } from '$lib/i18n'
import { SectionHeader, Search } from '$lib/bits/custom'
import { SectionHeaderPrimitive } from '$lib/bits/custom/form'
import { OrganisationRoleType } from '$lib/enums'
import { resolveAvatarImageSrc } from '$lib/utils/avatar'
import * as FormUserRolesSectionPrimitive from './components'
import { UserCard } from '$lib/bits/patterns/cards/userCard'
import type { FormUserRolesSectionProps } from './formUserRolesSection.types'
import type { User } from '$lib/types'
import type { OrganisationRoleUser } from '$lib/db/zod/schema/organisation.types'

let {
  title,
  subtitle,
  issues = [],
  userRoles,
  hiddenUserIdInputAttrs = [],
  roleFieldNameByUserId = {},
  isEditing = true,
  isSubmitting = false,
  isSubmitRequested = false,
  startInAddingMode = false,
  availableRoles = [
    { value: OrganisationRoleType.member, label: m.profile__role_type__member() },
    { value: OrganisationRoleType.owner, label: m.profile__role_type__owner() },
  ],
  userQueryParams,
  onAddUser,
  onRemoveUser,
  onRoleChange,
  class: className = '',
}: FormUserRolesSectionProps = $props()

let isAdding = $state(false)
let isRemoving = $state(false)
let wasSubmitRequested = $state(false)
let hasAutoOpenedAdding = $state(false)
let stableRoles = $state<OrganisationRoleUser[]>([])

const sortedRoles = $derived(
  [...userRoles].sort((a, b) => (a.user.name ?? '').localeCompare(b.user.name ?? '')),
)
const userIdSet = $derived(new Set(userRoles.map(userRole => userRole.userId)))

function toImageSrc(value: unknown): string | null {
  if (typeof value === 'string') return resolveAvatarImageSrc(value)
  if (value && typeof value === 'object' && 'url' in value) {
    const urlValue = (value as { url?: unknown }).url
    return typeof urlValue === 'string' ? resolveAvatarImageSrc(urlValue) : null
  }
  return null
}

const rootClass = $derived(
  ['bits-form__section min-h-60 basis-2/3 rounded-2xl p-0', className]
    .filter(Boolean)
    .join(' '),
)
const showModeUi = $derived(isEditing && !isSubmitting)
const renderedRoles = $derived(isSubmitting ? stableRoles : sortedRoles)

function toggleAdding(): void {
  isAdding = !isAdding
}

function toggleRemoving(): void {
  isRemoving = !isRemoving
}

function handleAddUser(user: User): void {
  if (userIdSet.has(user.id)) return
  onAddUser(user)
}

$effect(() => {
  if (!isRemoving) return
  const handleEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') isRemoving = false
  }
  window.addEventListener('keydown', handleEscape)
  return () => window.removeEventListener('keydown', handleEscape)
})

$effect(() => {
  if (!isAdding) return
  const handleEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') isAdding = false
  }
  window.addEventListener('keydown', handleEscape)
  return () => window.removeEventListener('keydown', handleEscape)
})

$effect(() => {
  if (sortedRoles.length === 0 && isRemoving) {
    isRemoving = false
    isAdding = true
  }
})

$effect(() => {
  if (showModeUi) return
  isAdding = false
  isRemoving = false
})

$effect(() => {
  if (isSubmitRequested && !wasSubmitRequested) {
    isAdding = false
    isRemoving = false
  }
  wasSubmitRequested = isSubmitRequested
})

$effect(() => {
  if (!showModeUi) return
  if (!isSubmitRequested) return
  if (issues.length === 0) return
  isAdding = true
  isRemoving = false
})

$effect(() => {
  if (isSubmitting) return
  stableRoles = sortedRoles
})

$effect(() => {
  if (hasAutoOpenedAdding) return
  if (!startInAddingMode) return
  if (!showModeUi) return
  isAdding = true
  isRemoving = false
  hasAutoOpenedAdding = true
})
</script>

<section class={rootClass}>
  <SectionHeader {title} description={subtitle} class="flex-nowrap items-center">
    {#snippet center()}
      <SectionHeaderPrimitive.Issues {issues} />
    {/snippet}
    {#snippet right()}
      <FormUserRolesSectionPrimitive.Actions
        {isAdding}
        {isRemoving}
        {isEditing}
        {isSubmitting}
        onToggleAdding={toggleAdding}
        onToggleRemoving={toggleRemoving}
      />
    {/snippet}
  </SectionHeader>

  {#if isAdding && showModeUi}
    <div transition:slide={{ duration: showModeUi ? 200 : 0 }}>
      <Search
        placeholder="Search users…"
        focusOnMount={true}
        {userQueryParams}
        excludeIds={Array.from(userIdSet)}
        getItemId={(user: User) => user.id}
        onSelect={handleAddUser}
        resultMap={{
          image: (user: User) => toImageSrc(user.image),
          title: (user: User) => user.name || '-',
          descriminator: (user: User & { email?: string }) => user.email,
        }}
        class="px-2"
      />
    </div>
  {/if}

  {#if isRemoving && showModeUi}
    <div transition:slide={{ duration: showModeUi ? 200 : 0 }}>
      <FormUserRolesSectionPrimitive.WarningBar />
    </div>
  {/if}

  <UserCard.Wrapper class="bits-form__user-card-wrapper--spacious" isAnimated>
    {#each renderedRoles as userRole (userRole.userId)}
      <UserCard.Root class="bits-form__user-card-root--full">
        <UserCard.Avatar
          name={userRole.user.name}
          image={toImageSrc(userRole.user.image)}
        />
        <UserCard.Body
          name={userRole.user.name}
          attribution={userRole.user.attribution}
        />
        <UserCard.Actions
          selectedRole={userRole.role as OrganisationRoleType}
          roleOptions={availableRoles}
          roleFieldName={roleFieldNameByUserId[userRole.userId]}
          {isRemoving}
          isEditing={isEditing && !isSubmitting}
          onRoleChange={role => onRoleChange(userRole.userId, role)}
          onRemove={() => onRemoveUser(userRole.userId)}
        />
      </UserCard.Root>
    {/each}
  </UserCard.Wrapper>

  <div class="hidden" aria-hidden="true">
    {#each hiddenUserIdInputAttrs as inputAttrs, index (index)}
      <input {...inputAttrs}>
    {/each}
  </div>
</section>
