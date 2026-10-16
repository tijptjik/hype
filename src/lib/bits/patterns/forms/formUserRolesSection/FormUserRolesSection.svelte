<script lang="ts">
import { fade } from 'svelte/transition'
import {
  formSearchHeaderStyles,
  formMemberIssuesHeaderStyles,
} from '../formSurface/formSearchHeader.styles'
import { m } from '#lib/i18n.js'
import { DestructiveDialog } from '#lib/bits/core/index.js'
import { SectionHeader, Search, TransitionStack } from '#lib/bits/custom/index.js'
import { SectionHeaderPrimitive } from '#lib/bits/custom/form/index.js'
import { FormGrid } from '#lib/bits/patterns/layout/index.js'
import { OrganisationRoleType } from '#lib/enums.js'
import { resolveAvatarImageSrc } from '#lib/utils/avatar.js'
import TrashIcon from 'virtual:icons/proicons/delete'
import { UserCard } from '#lib/bits/patterns/cards/userCard/index.js'
import type { FormUserRolesSectionProps } from './formUserRolesSection.types'
import type { OrganisationRoleUser } from '#lib/db/zod/schema/organisation.types.js'
import type { User } from '#lib/db/zod/schema/user.types.js'

type UserRoleCardViewModel = {
  userId: string
  role: OrganisationRoleType
  name: string | null
  attribution: string | null
  image: string | null
}

let {
  title,
  icon,
  subtitle,
  minCardWidth = 320,
  layout = 'grid',
  transitionEntityKey = null,
  currentUserId,
  removeSelfResourceLabel,
  issues = [],
  userRoles,
  hiddenUserIdInputAttrs = [],
  roleFieldNameByUserId = {},
  isEditing = true,
  isSubmitting = false,
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

let isConfirmingSelfRemoval = $state(false)
let pendingSelfRemovalId = $state<string | null>(null)
let stableRoles = $state<OrganisationRoleUser[]>([])
let displayRoleCards = $state<UserRoleCardViewModel[]>([])

function getUserName(userRole: OrganisationRoleUser): string {
  return userRole.user?.name ?? ''
}

const sortedRoles = $derived(
  [...userRoles].sort((a, b) => getUserName(a).localeCompare(getUserName(b))),
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

function toUserRoleCardViewModel(
  userRole: OrganisationRoleUser,
): UserRoleCardViewModel {
  return {
    userId: userRole.userId,
    role: userRole.role as OrganisationRoleType,
    name: userRole.user?.name ?? null,
    attribution: userRole.user?.attribution ?? null,
    image: toImageSrc(userRole.user?.image),
  }
}

function isDisplayReadyUserRole(userRole: OrganisationRoleUser): boolean {
  const name = userRole.user?.name
  if (typeof name !== 'string') return false

  const trimmedName = name.trim()
  if (trimmedName.length === 0) return false
  if (trimmedName === userRole.userId) return false
  if (typeof userRole.user?.id === 'string') {
    if (trimmedName === userRole.user.id) return false
  }

  return true
}

const rootClass = $derived(
  ['bits-form__section @container rounded-2xl p-0 pb-4', className]
    .filter(Boolean)
    .join(' '),
)
const showModeUi = $derived(isEditing && !isSubmitting)
const renderedRoles = $derived(isSubmitting ? stableRoles : sortedRoles)
const renderedRoleCards = $derived(renderedRoles.map(toUserRoleCardViewModel))
const areRenderedRolesDisplayReady = $derived(
  renderedRoles.every(isDisplayReadyUserRole),
)
const resolvedTransitionKey = $derived(
  transitionEntityKey ?? `static:${typeof title === 'string' ? title : 'default'}`,
)
const transitionPersistenceKey = $derived(
  `form-user-roles:${typeof title === 'string' ? title : 'default'}`,
)

function handleAddUser(user: User): void {
  if (userIdSet.has(user.id)) return
  onAddUser(user)
}

/** Routes self-removal through confirmation before changing the form selection. */
function requestRemoveUser(userId: string): void {
  if (!showModeUi || !userIdSet.has(userId)) return
  if (userId === currentUserId) {
    pendingSelfRemovalId = userId
    isConfirmingSelfRemoval = true
    return
  }
  onRemoveUser(userId)
}

/** Applies only the still-current, explicitly confirmed self-removal. */
function confirmSelfRemoval(): void {
  const userId = pendingSelfRemovalId
  if (
    !isConfirmingSelfRemoval ||
    !showModeUi ||
    !userId ||
    userId !== currentUserId ||
    !userIdSet.has(userId)
  )
    return
  isConfirmingSelfRemoval = false
  pendingSelfRemovalId = null
  onRemoveUser(userId)
}

// A pending confirmation must not carry across resources or signed-in users.
$effect(() => {
  resolvedTransitionKey
  currentUserId
  isConfirmingSelfRemoval = false
  pendingSelfRemovalId = null
})

$effect(() => {
  if (
    !showModeUi ||
    !isConfirmingSelfRemoval ||
    (pendingSelfRemovalId && !userIdSet.has(pendingSelfRemovalId))
  ) {
    isConfirmingSelfRemoval = false
    pendingSelfRemovalId = null
  }
})

$effect(() => {
  if (isSubmitting) return
  stableRoles = sortedRoles
})

$effect(() => {
  if (!areRenderedRolesDisplayReady) return
  displayRoleCards = renderedRoleCards
})
</script>

<section class={rootClass}>
  <SectionHeader
    {title}
    {icon}
    description={subtitle}
    class={issues.length > 0 ? formMemberIssuesHeaderStyles : formSearchHeaderStyles}
  >
    {#snippet right()}
      <div class="flex w-full flex-wrap items-center justify-end gap-3">
        {#if issues.length > 0}
          <SectionHeaderPrimitive.Issues {issues} />
        {/if}
        {#if isEditing}
          <div
            class="w-full min-w-0 max-w-96 flex-1 basis-64"
            transition:fade={{ duration: 140 }}
            inert={!showModeUi}
          >
            <div
              class={isSubmitting ? 'w-full pointer-events-none opacity-50' : 'w-full'}
            >
              <Search
                placeholder={m.admin__forms_add_users_placeholder()}
                focusOnMount={false}
                mountTransitionDuration={0}
                {userQueryParams}
                excludeIds={Array.from(userIdSet)}
                getItemId={(user: User) => user.id}
                onSelect={handleAddUser}
                resultMap={{
                  image: (user: User) => toImageSrc(user.image),
                  title: (user: User) => user.name || '-',
                  descriminator: (user: User) =>
                    user.username ? `@${user.username}` : null,
                }}
                class="w-full [&_.bits-search-bar]:mb-0"
              />
            </div>
          </div>
        {/if}
      </div>
    {/snippet}
  </SectionHeader>

  {#if layout === 'list'}
    <div
      class="mx-6 flex justify-between border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground"
    >
      <!-- Reserve the trash column, then match the role selector's padding, gap and chevron. -->
      <span>Name</span><span class="mr-10 w-36 pr-9 text-right">Role</span>
    </div>
  {/if}

  <TransitionStack
    valueKey={resolvedTransitionKey}
    value={displayRoleCards}
    isReady={true}
    persistenceKey={transitionPersistenceKey}
    duration={160}
  >
    {#snippet children(
      userRoles,
    )}
      <FormGrid
        minWidth={minCardWidth}
        class={layout === 'list' ? '[grid-template-columns:1fr]! gap-0' : ''}
      >
        {#each userRoles as userRole (userRole.userId)}
          <UserCard.Root class="bits-form__user-card-root--full">
            <UserCard.Avatar name={userRole.name} image={userRole.image} />
            <UserCard.Body name={userRole.name} attribution={userRole.attribution} />
            <UserCard.Actions
              selectedRole={userRole.role}
              roleOptions={availableRoles}
              roleFieldName={roleFieldNameByUserId[userRole.userId]}
              isEditing={isEditing && !isSubmitting}
              onRoleChange={role => onRoleChange(userRole.userId, role)}
              onRemove={() => requestRemoveUser(userRole.userId)}
            />
            <div class="flex size-10 shrink-0 items-center justify-center">
              {#if showModeUi}
                <button
                  type="button"
                  aria-label={`${m.watery_trite_shrimp_clip()} ${userRole.name ?? ''}`}
                  class="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-error/10 hover:text-error focus-visible:outline focus-visible:outline-primary"
                  onclick={() => requestRemoveUser(userRole.userId)}
                >
                  <TrashIcon class="size-4" aria-hidden="true" />
                </button>
              {/if}
            </div>
          </UserCard.Root>
        {/each}
      </FormGrid>
    {/snippet}

    {#snippet previous(
      userRoles,
    )}
      <FormGrid
        minWidth={minCardWidth}
        class={layout === 'list' ? '[grid-template-columns:1fr]! gap-0' : ''}
      >
        {#each userRoles as userRole (userRole.userId)}
          <UserCard.Root class="bits-form__user-card-root--full">
            <UserCard.Avatar name={userRole.name} image={userRole.image} />
            <UserCard.Body name={userRole.name} attribution={userRole.attribution} />
            <UserCard.Actions
              selectedRole={userRole.role}
              roleOptions={availableRoles}
              isEditing={false}
            />
            <div class="size-10 shrink-0" aria-hidden="true"></div>
          </UserCard.Root>
        {/each}
      </FormGrid>
    {/snippet}
  </TransitionStack>

  <div class="hidden" aria-hidden="true">
    {#each hiddenUserIdInputAttrs as inputAttrs, index (index)}
      <input {...inputAttrs}>
    {/each}
  </div>
</section>

<DestructiveDialog
  bind:open={isConfirmingSelfRemoval}
  confirmText={m.admin__forms_remove_self_confirm()}
  onConfirm={confirmSelfRemoval}
  overlayProps={{ class: 'bits-dialog__overlay z-[1000]' }}
  contentProps={{
    class: String.raw`bits-dialog__content bits-theme z-[1001] border-error/35! bg-surface! [&_.bits-dialog\_\_title]:font-sans [&_.bits-dialog\_\_title]:text-xl [&_.bits-dialog\_\_description]:text-sm`,
  }}
>
  {#snippet title()}
    {m.admin__forms_remove_self_title()}
  {/snippet}
  {#snippet description()}
    {m.admin__forms_remove_self_warning({
      resource: removeSelfResourceLabel ?? m.resource__organisation_singular(),
    })}
    <span class="mt-3 block text-muted-foreground"
      >{m.admin__forms_remove_self_save_hint()}</span
    >
  {/snippet}
</DestructiveDialog>
