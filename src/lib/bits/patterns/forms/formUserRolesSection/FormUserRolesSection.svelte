<script lang="ts" generics="Role extends string = OrganisationRoleType">
import {
  formSearchHeaderStyles,
  formMemberIssuesHeaderStyles,
} from '../formSurface/formSearchHeader.styles'
import { m } from '#lib/i18n.js'
import { DestructiveDialog } from '#lib/bits/core/index.js'
import { SectionHeader, Search, TransitionStack } from '#lib/bits/custom/index.js'
import { SectionHeaderPrimitive } from '#lib/bits/custom/form/index.js'
import FormGrid from '#lib/bits/patterns/layout/formGrid/FormGrid.svelte'
import { OrganisationRoleType } from '#lib/enums.js'
import { resolveAvatarImageSrc } from '#lib/utils/avatar.js'
import TrashIcon from 'virtual:icons/proicons/delete'
import { UserCard } from '#lib/bits/patterns/cards/userCard/index.js'
import type {
  FormUserRolesSectionProps,
  FormUserRole,
} from './formUserRolesSection.types'
import type { User } from '#lib/db/zod/schema/user.types.js'

type UserRoleCardViewModel = {
  userId: string
  role: Role
  name: string | null
  username: string | null
  displayUsername: string | null
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
    {
      value: OrganisationRoleType.member as Role,
      label: m.profile__role_type__member(),
    },
    { value: OrganisationRoleType.owner as Role, label: m.profile__role_type__owner() },
  ],
  userQueryParams,
  onAddUser,
  onRemoveUser,
  onRoleChange,
  memberDetails,
  class: className = '',
}: FormUserRolesSectionProps<Role> = $props()

let isConfirmingSelfRemoval = $state(false)
let pendingSelfRemovalId = $state<string | null>(null)
let stableRoles = $state<FormUserRole[]>([])
let displayRoleCards = $state<UserRoleCardViewModel[]>([])

function getUserName(userRole: FormUserRole): string {
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

function toUserRoleCardViewModel(userRole: FormUserRole): UserRoleCardViewModel {
  return {
    userId: userRole.userId,
    role: userRole.role as Role,
    name:
      (userRole.user?.name !== userRole.userId ? userRole.user?.name : null) ||
      (userRole.user?.displayUsername !== userRole.userId
        ? userRole.user?.displayUsername
        : null) ||
      (userRole.user?.username !== userRole.userId ? userRole.user?.username : null) ||
      'Unnamed user',
    username: userRole.user?.username ?? null,
    displayUsername: userRole.user?.displayUsername ?? null,
    attribution: userRole.user?.attribution ?? null,
    image: toImageSrc(userRole.user?.image),
  }
}

const rootClass = $derived(
  [
    'bits-form__section @container rounded-2xl p-0',
    layout === 'list' ? 'pb-2!' : 'pb-4',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)
const showModeUi = $derived(isEditing && !isSubmitting)
const renderedRoles = $derived(isSubmitting ? stableRoles : sortedRoles)
const renderedRoleCards = $derived(renderedRoles.map(toUserRoleCardViewModel))
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
// Update every row independently of display metadata availability.
$effect(() => {
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
        <!-- Keep the search row in view mode so member rows never jump. -->
        <div
          class="w-full max-w-96 min-w-0 flex-1 basis-64 transition-opacity duration-180 ease-in-out motion-reduce:transition-none"
          style:opacity={isEditing ? 1 : 0}
          aria-hidden={!isEditing}
          inert={!showModeUi}
        >
          <div
            class={isSubmitting ? 'pointer-events-none w-full opacity-50' : 'w-full'}
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
                  user.username ? `@${user.displayUsername ?? user.username}` : null,
              }}
              class="w-full [&_.bits-search-bar]:mb-0"
            />
          </div>
        </div>
      </div>
    {/snippet}
  </SectionHeader>

  {#if layout === 'list'}
    <div
      class="border-border text-muted-foreground mx-6 mt-4 flex justify-between border-b px-3 py-2 text-xs font-medium"
    >
      <!-- Reserve the trash column, then match the role selector's padding, gap and chevron. -->
      <span>Name</span
      ><span class="mr-10 w-24 pr-9 text-right @min-[40rem]:w-36">Role</span>
    </div>
  {/if}

  <TransitionStack
    valueKey={resolvedTransitionKey}
    value={displayRoleCards}
    isReady={true}
    persistenceKey={transitionPersistenceKey}
    duration={160}
  >
    {#snippet children(userRoles)}
      <FormGrid
        minWidth={minCardWidth}
        class={layout === 'list' ? '[grid-template-columns:1fr]! gap-0' : ''}
      >
        {#each userRoles as userRole (userRole.userId)}
          <div
            class={layout === 'list'
              ? 'border-border min-w-0 border-b last:border-b-0'
              : 'min-w-0'}
          >
            <UserCard.Root
              class={`bits-form__user-card-root--full ${layout === 'list' ? 'border-b-0! py-2' : ''}`}
            >
              <UserCard.Avatar name={userRole.name} image={userRole.image} />
              <div
                class="flex min-w-0 flex-1 flex-col gap-1 @min-[40rem]:flex-row @min-[40rem]:items-center @min-[40rem]:gap-6"
              >
                <UserCard.Body
                  wrapTitle={layout === 'list'}
                  name={userRole.name}
                  username={userRole.username}
                  displayUsername={userRole.displayUsername}
                  attribution={userRole.attribution}
                />
                {@render memberDetails?.(userRole.userId, userRole.role)}
              </div>
              <UserCard.Actions
                class={memberDetails ? 'w-24! @min-[40rem]:w-36!' : ''}
                selectedRole={userRole.role}
                roleOptions={availableRoles}
                roleFieldName={roleFieldNameByUserId[userRole.userId]}
                isEditing={isEditing && !isSubmitting}
                onRoleChange={role => onRoleChange(userRole.userId, role as Role)}
                onRemove={() => requestRemoveUser(userRole.userId)}
              />
              <div class="flex size-10 shrink-0 items-center justify-center">
                <button
                  type="button"
                  aria-label={`${m.watery_trite_shrimp_clip()} ${userRole.name ?? ''}`}
                  inert={!showModeUi}
                  aria-hidden={!showModeUi}
                  style:opacity={showModeUi ? 1 : 0}
                  class="text-muted-foreground hover:bg-error/10 hover:text-error focus-visible:outline-primary flex size-9 items-center justify-center rounded-md transition-[color,background-color,opacity] duration-180 ease-in-out focus-visible:outline motion-reduce:transition-none"
                  onclick={() => requestRemoveUser(userRole.userId)}
                >
                  <TrashIcon class="size-4" aria-hidden="true" />
                </button>
              </div>
            </UserCard.Root>
          </div>
        {/each}
      </FormGrid>
    {/snippet}

    {#snippet previous(userRoles)}
      <FormGrid
        minWidth={minCardWidth}
        class={layout === 'list' ? '[grid-template-columns:1fr]! gap-0' : ''}
      >
        {#each userRoles as userRole (userRole.userId)}
          <div
            class={layout === 'list'
              ? 'border-border min-w-0 border-b last:border-b-0'
              : 'min-w-0'}
          >
            <UserCard.Root
              class={`bits-form__user-card-root--full ${layout === 'list' ? 'border-b-0! py-2' : ''}`}
            >
              <UserCard.Avatar name={userRole.name} image={userRole.image} />
              <UserCard.Body
                wrapTitle={layout === 'list'}
                name={userRole.name}
                username={userRole.username}
                displayUsername={userRole.displayUsername}
                attribution={userRole.attribution}
              />
              <UserCard.Actions
                class={memberDetails ? 'w-24! @min-[40rem]:w-36!' : ''}
                selectedRole={userRole.role}
                roleOptions={availableRoles}
                isEditing={false}
              />
              <div class="size-10 shrink-0" aria-hidden="true"></div>
            </UserCard.Root>
          </div>
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
    <span class="text-muted-foreground mt-3 block"
      >{m.admin__forms_remove_self_save_hint()}</span
    >
  {/snippet}
</DestructiveDialog>
