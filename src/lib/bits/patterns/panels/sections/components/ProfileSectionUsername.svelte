<script lang="ts">
// BITS CORE
import { Button } from '$lib/bits/core'
// BITS COMPONENTS
import Icon from '$lib/bits/custom/icon/Icon.svelte'
// BITS
import { cx } from '$lib/bits/utils'
// ICONS
import PencilSquare from 'virtual:icons/lucide/square-pen'
import Check from 'virtual:icons/lucide/check'
import ArrowPath from 'virtual:icons/lucide/refresh-cw'
import XMark from 'virtual:icons/lucide/x'

type Props = {
  userDisplayName?: string | null
  userAttribution?: string | null
  hideEditableFields?: boolean
  isEditingUsername?: boolean
  isLoadingUsername?: boolean
  showSuccessIndicator?: boolean
  showErrorIndicator?: boolean
  editedUsername?: string
  usernameInputPlaceholder?: string
  onEditedUsernameChange?: (value: string) => void
  onStartEditingUsername?: () => void
  onSaveUsername?: () => void | Promise<void>
  onCancelEdit?: () => void
}

let {
  userDisplayName = null,
  userAttribution = null,
  hideEditableFields = false,
  isEditingUsername = false,
  isLoadingUsername = false,
  showSuccessIndicator = false,
  showErrorIndicator = false,
  editedUsername = '',
  usernameInputPlaceholder = '',
  onEditedUsernameChange,
  onStartEditingUsername,
  onSaveUsername,
  onCancelEdit,
}: Props = $props()

let usernameInput: HTMLInputElement | undefined
let wasEditingUsername = $state(false)
let usernameValue = $state('')
const usernameActionIconSize = 'sm'
const MIN_USERNAME_INPUT_WIDTH_CH = 8

$effect(() => {
  if (!isEditingUsername || wasEditingUsername || !usernameInput) {
    wasEditingUsername = isEditingUsername
    return
  }

  usernameInput.focus()
  usernameInput.select()
  wasEditingUsername = true
})

$effect(() => {
  if (isEditingUsername) {
    usernameValue = editedUsername
  } else {
    usernameValue = userDisplayName ?? ''
  }
})

const displayedUsername = $derived(usernameValue || usernameInputPlaceholder)

const usernameInputWidthCh = $derived.by(() => {
  if (isEditingUsername) {
    return Math.max(
      MIN_USERNAME_INPUT_WIDTH_CH,
      displayedUsername.length,
      usernameInputPlaceholder.length,
    )
  }

  return Math.max(1, usernameValue.length)
})

const usernameActionState = $derived.by(() => {
  if (isLoadingUsername) return 'loading'
  if (showErrorIndicator) return 'error'
  if (showSuccessIndicator) return 'success'
  if (isEditingUsername) return 'editing'
  return 'idle'
})

function handleUsernameKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    void onSaveUsername?.()
    return
  }

  if (event.key === 'Escape') {
    onCancelEdit?.()
  }
}

function handleUsernameInput(event: Event): void {
  const nextValue = (event.currentTarget as HTMLInputElement).value
  usernameValue = nextValue
  onEditedUsernameChange?.(nextValue)
}

function handleUsernameAction(): void {
  if (isEditingUsername) {
    void onSaveUsername?.()
    return
  }

  onStartEditingUsername?.()
}
</script>

{#snippet usernameActionIcon()}
  {#key usernameActionState}
    {#if usernameActionState === 'loading'}
      <Icon src={ArrowPath} size={usernameActionIconSize} animation="spin" />
    {:else if usernameActionState === 'error'}
      <Icon src={XMark} size={usernameActionIconSize} tone="error" />
    {:else if usernameActionState === 'success'}
      <Icon src={Check} size={usernameActionIconSize} tone="success" />
    {:else if usernameActionState === 'editing'}
      <Icon src={Check} size={usernameActionIconSize} />
    {:else}
      <Icon src={PencilSquare} size={usernameActionIconSize} />
    {/if}
  {/key}
{/snippet}

<div class="z-20 -mt-6 rounded-full bg-black/80 px-4 py-1">
  <div class="relative flex min-w-0 items-center justify-center">
    {#if hideEditableFields}
      <span
        class="tooltip font-medium text-white"
        data-tip={userAttribution || 'No attribution set'}
      >
        {userDisplayName}
      </span>
    {:else}
      <input
        type="text"
        bind:this={usernameInput}
        value={usernameValue}
        readonly={!isEditingUsername}
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        class={cx(
          'border-none bg-transparent px-2 text-center font-medium text-white outline-none transition-[width] duration-200 ease-[ease]',
          'placeholder:text-center placeholder:text-white/60 focus:outline-none disabled:pointer-events-none',
          isEditingUsername ? 'min-w-24' : 'min-w-0 cursor-default',
        )}
        style={`width:${usernameInputWidthCh}ch;`}
        oninput={handleUsernameInput}
        onkeydown={handleUsernameKeydown}
        placeholder={usernameInputPlaceholder}
        aria-readonly={!isEditingUsername}
      >

      <Button
        text={isEditingUsername ? 'Save username' : 'Edit username'}
        icon={usernameActionIcon}
        onClick={handleUsernameAction}
        type="button"
        style="ghost"
        size="sm"
        modifier="square"
        hideLabel={true}
        hideLabelInstantly={true}
        class="min-h-0 h-4 w-4 rounded-none border-0 p-0 text-white/80 shadow-none [--btn-size:1rem] [--btn-icon-ratio:1] hover:text-white focus-visible:text-white"
        attrs={{
          title: isEditingUsername ? 'Save username' : 'Edit username',
        }}
      />
    {/if}
  </div>
</div>
