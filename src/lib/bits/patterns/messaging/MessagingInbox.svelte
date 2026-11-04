<script lang="ts">
// ADAPTER
import { useMessagingInboxModel } from '#lib/adapters/messaging/useMessagingInboxModel.svelte.js'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import Avatar from '#lib/bits/core/avatar/Avatar.svelte'
import ContextMenu from '#lib/bits/core/contextMenu/ContextMenu.svelte'
import TextInputField from '#lib/bits/custom/form/TextInputField.svelte'
// ICONS
import SettingsIcon from 'virtual:icons/lucide/settings-2'
import ArchiveIcon from 'virtual:icons/lucide/archive'
import ArchiveRestoreIcon from 'virtual:icons/lucide/archive-restore'
import InboxIcon from 'virtual:icons/lucide/inbox'
import PinIcon from 'virtual:icons/lucide/pin'
import PinOffIcon from 'virtual:icons/lucide/pin-off'
// COMPONENTS
import MessagingNotifications from './MessagingNotifications.svelte'
import MessagingAccountCard from './MessagingAccountCard.svelte'
import MessagingPlatformIcon from './MessagingPlatformIcon.svelte'
import MessagingAccountRuntime from './MessagingAccountRuntime.svelte'
import MessagingAppearanceProvider from './MessagingAppearanceProvider.svelte'
import ConversationPane from '#lib/bits/patterns/whatsapp/components/ConversationPane.svelte'
const model = useMessagingInboxModel()
const configurationHref = $derived(
  model.organisation
    ? `/admin/organisations/${encodeURIComponent(model.organisation.code)}#messaging`
    : '',
)
</script>

<div
  class="@container flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-canvas"
>
  {#each model.accounts as account (account.id)}
    <MessagingAccountRuntime
      account={{ ...account, organisationCode: model.organisation?.code ?? '' }}
      register={model.registerRuntime}
    />
  {/each}
  <header
    class="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-panel px-4 py-2"
  >
    <h2 class="min-w-0 break-words font-semibold">
      {model.organisation?.code ?? 'Messaging'}
    </h2>
    <div class="ml-auto flex flex-wrap items-center justify-end gap-3">
      {#if model.selectedOrganisation}
        {#key model.selectedOrganisation}
          <MessagingNotifications organisationId={model.selectedOrganisation} />
        {/key}
      {/if}
      {#if configurationHref}
        <Button
          text="Configure accounts"
          iconComponent={SettingsIcon}
          hideLabel
          hideLabelInstantly
          modifier="circle"
          style="ghost"
          color="primary"
          size="sm"
          href={configurationHref}
          attrs={{ title: 'Configure accounts' }}
        />
      {/if}
      <fieldset
        aria-label="Messaging account connections"
        class="flex shrink-0 items-center gap-3"
      >
        {#each model.accounts as account (account.id)}
          {@const runtime = model.runtimes[account.id]}
          {@const connected = runtime?.status.connected ?? false}
          {@const status = connected
            ? 'Connected'
            : runtime?.status.qr
              ? 'Scan QR code to reconnect'
              : runtime?.status.loggedOut
                ? 'Signed out'
                : account.enabled
                  ? 'Reconnecting…'
                  : 'Disconnected'}
          <MessagingPlatformIcon
            platform={account.platform}
            {connected}
            {status}
            size="md"
          />
        {/each}
      </fieldset>
    </div>
  </header>
  {#each model.accounts as account (account.id)}
    {#each model.runtimes[account.id]?.calls.incoming ?? [] as call (call.id)}
      {@const conversation = model.conversations.find(
        row =>
          row.accountId === account.id &&
          model.runtimes[account.id]?.canonicalChat(row.chatId) ===
            model.runtimes[account.id]?.canonicalChat(call.peer),
      )}
      {#if conversation}
        <div
          class="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-panel px-4 py-2"
        >
          <p role="status" class="text-sm">
            Incoming {account.platform === 'telegram' ? 'Telegram' : 'WhatsApp'} call
            from {conversation.recipient.name}
          </p>
          <Button
            text="View call"
            style="outline"
            onClick={() => model.selectConversation(conversation.key)}
          />
        </div>
      {/if}
    {/each}
  {/each}
  {#each model.accounts.filter(
    account => account.platform === 'whatsapp',
  ) as account (account.id)}
    {@const runtime = model.runtimes[account.id]}
    {#if runtime &&
      !runtime.status.connected &&
      (runtime.status.loggedOut ||
        runtime.status.qr ||
        runtime.status.lastEvent === 'PairingQrCodesExhausted')}
      <div
        class="min-h-0 max-h-[70%] shrink-0 overflow-y-auto border-b border-border p-4"
      >
        <MessagingAccountCard
          platform="whatsapp"
          status={runtime.status}
          registered={true}
          enabled={account.enabled}
          busy={runtime.busy}
          onAction={async action => {
            if (action === 'connect' || action === 'stop')
              await runtime.connection(action === 'connect')
          }}
        />
      </div>
    {/if}
  {/each}
  {#if model.error}
    <p role="alert" class="shrink-0 border-b border-border px-4 py-2 text-sm">
      {model.error}
    </p>
  {/if}
  {#if model.loading}
    <p role="status" class="p-5 text-sm text-muted-foreground">Loading messaging…</p>
  {:else if !model.selectedOrganisation}
    <p class="p-5 text-sm text-muted-foreground">
      Select an organisation in the sidebar to open its inbox.
    </p>
  {:else if !model.accounts.length}
    <p class="p-5 text-sm text-muted-foreground">
      Link an account in this organisation’s Messaging configuration to start chatting.
    </p>
  {:else}
    <div
      class="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[minmax(100px,0.7fr)_minmax(0,2fr)] overflow-hidden @min-[48rem]:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)] @min-[48rem]:grid-rows-1"
    >
      <aside
        class="flex min-h-0 min-w-0 flex-col overflow-hidden max-h-[34dvh] border-b border-border bg-panel @min-[48rem]:max-h-none @min-[48rem]:border-r @min-[48rem]:border-b-0"
        aria-label="Linked account conversations"
      >
        <div class="shrink-0 p-3">
          <TextInputField
            id="messaging-user-search"
            label="Search chats and HYPE users"
            placeholder="Name, username or number"
            bind:value={model.search}
            inputAttrs={{ autocomplete: 'off' }}
          />
        </div>
        <!-- Forwarding supports existing account chats and the verified HYPE recipient picker. -->
        {#if model.forwarding}
          <div class="p-3 text-sm" role="status">
            Choose a conversation or search for a HYPE user to forward to. You can
            review it before sending.<Button
              text="Cancel forward"
              style="ghost"
              onClick={model.cancelForward}
            />
          </div>
        {/if}
        <nav
          class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2 pb-2"
          aria-label="Conversations"
        >
          {#each model.visibleConversations as conversation (conversation.key)}
            {@const actions = [
              {
                label: conversation.pinnedAt ? 'Unpin chat' : 'Pin chat',
                icon: conversation.pinnedAt ? PinOffIcon : PinIcon,
                disabled: model.pinning.includes(conversation.key),
                onSelect: () => {
                  void model.pinConversation(conversation.key, !conversation.pinnedAt)
                },
              },
              {
                label: conversation.isArchived ? 'Restore thread' : 'Archive thread',
                icon: conversation.isArchived ? ArchiveRestoreIcon : ArchiveIcon,
                disabled:
                  model.preparingForward ||
                  model.archiving.includes(conversation.key) ||
                  model.runtimes[conversation.accountId]?.busy ||
                  model.runtimes[conversation.accountId]?.recording,
                onSelect: () => {
                  void model.archiveConversation(
                    conversation.key,
                    !conversation.isArchived,
                  )
                },
              },
            ]}
            <ContextMenu items={actions}>
              <div
                class="flex min-w-0 items-center rounded-xl border transition-colors {model
                  .selected?.key === conversation.key
                  ? 'border-primary bg-[var(--chat-active-fill,var(--theme-raised))]'
                  : 'border-transparent hover:bg-surface'}"
              >
                <button
                  type="button"
                  aria-current={model.selected?.key === conversation.key
                    ? 'true'
                    : undefined}
                  class="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-xl px-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-focus"
                  onclick={() => model.selectConversation(conversation.key)}
                >
                  <span
                    class="inline-flex rounded-full {!conversation.hypeLinked &&
                    !conversation.isGroup
                      ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-panel'
                      : ''}"
                    title={!conversation.hypeLinked && !conversation.isGroup
                      ? 'Not linked to HYPE'
                      : undefined}
                  >
                    <Avatar
                      name={conversation.recipient.name}
                      src={conversation.recipient.image ||
                        model.runtimes[conversation.accountId]?.profiles[
                          model.runtimes[conversation.accountId]?.canonicalChat(
                            conversation.chatId,
                          ) ?? conversation.chatId
                        ]?.photo}
                    />
                    {#if !conversation.hypeLinked && !conversation.isGroup}
                      <span class="sr-only">Not linked to HYPE</span>
                    {/if}
                  </span>
                  <span class="grid min-w-0 gap-1">
                    <span class="flex min-w-0 items-start gap-1.5">
                      <span class="inline-flex shrink-0 pt-0.5">
                        <MessagingPlatformIcon platform={conversation.platform} />
                      </span>
                      <span
                        class="min-w-0 flex-1 whitespace-normal break-words text-sm font-semibold leading-5"
                        >{conversation.recipient.name}</span
                      >
                      {#if conversation.pinnedAt}
                        <span
                          class="inline-flex shrink-0 text-muted-foreground"
                          title="Pinned chat"
                          role="img"
                          aria-label="Pinned chat"
                          ><PinIcon class="size-3.5" aria-hidden="true" /></span
                        >
                      {/if}
                      {#if conversation.unreadCount}
                        <span
                          role="img"
                          aria-label={`${conversation.unreadCount} unread messages`}
                          class="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none tabular-nums text-primary-content"
                          >{conversation.unreadCount}</span
                        >
                      {/if}
                    </span>
                    <span
                      class="flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-muted-foreground"
                    >
                      <span class="min-w-0 whitespace-normal break-words"
                        >{conversation.recipient.username
                          ? `@${conversation.recipient.username}`
                          : conversation.isGroup
                            ? conversation.platform === 'telegram'
                              ? 'Group / channel'
                              : 'Group chat'
                            : conversation.platform === 'telegram'
                              ? 'Telegram contact'
                              : 'WhatsApp contact'}</span
                      >
                    </span>
                    <span
                      class="line-clamp-1 break-words text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]"
                      title={conversation.preview || undefined}
                      >{conversation.preview || 'No messages yet'}</span
                    >
                  </span>
                </button>
              </div>
            </ContextMenu>
          {:else}
            <p class="p-3 text-sm text-muted-foreground">
              {model.search.trim()
                ? 'No matching chats.'
                : model.archived
                  ? 'No archived conversations.'
                  : 'Chats from your linked accounts will appear here. You can also search for a HYPE user to start chatting.'}
            </p>
          {/each}
          {#if model.hasMoreConversations}
            <Button
              text={model.loadingMore ? 'Loading chats…' : 'Load more chats'}
              disabled={model.loadingMore}
              style="ghost"
              onClick={model.loadMoreConversations}
            />
          {/if}
          {#if model.search.trim()}
            <p class="px-3 pt-3 text-xs font-semibold text-muted-foreground">
              HYPE users
            </p>
          {/if}
          {#if model.search.trim()}
            {#if model.searching}
              <p role="status" class="p-3 text-sm text-muted-foreground">
                Searching HYPE users…
              </p>
            {/if}
            {#each model.results as user (user.userId)}
              <div
                class="flex min-w-0 items-start gap-1 rounded-xl border border-transparent p-1 hover:bg-surface"
              >
                <button
                  type="button"
                  disabled={model.routing || !user.available}
                  class="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg p-2 text-left focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-60"
                  onclick={() => void model.openUser(user)}
                >
                  <Avatar name={user.name} src={user.image} />
                  <span class="grid min-w-0 gap-1"
                    ><span class="break-words text-sm font-semibold">{user.name}</span
                    ><span class="break-words text-xs text-muted-foreground"
                      >@{user.username}</span
                    >
                    {#if !user.available}
                      <span class="text-xs text-muted-foreground"
                        >{user.unavailableReason}</span
                      >
                    {/if}</span
                  >
                </button>
                <span class="mt-2 flex shrink-0 gap-1"
                  >{#each user.channels as channel (channel.platform)}
                    <button
                      type="button"
                      aria-label={`Open ${channel.platform === 'telegram' ? 'Telegram' : 'WhatsApp'} chat with ${user.name}`}
                      disabled={model.routing || !channel.available}
                      class="flex size-9 items-center justify-center rounded-full hover:bg-raised focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-30"
                      title={channel.checking
                        ? `Checking ${channel.platform}…`
                        : channel.available
                          ? `Chat on ${channel.platform}`
                          : (channel.unavailableReason ?? 'Unavailable')}
                      onclick={() => void model.openUser(user, channel.platform)}
                    >
                      <MessagingPlatformIcon platform={channel.platform} />
                    </button>
                  {/each}</span
                >
              </div>
            {:else}
              {#if !model.searching}
                <p class="p-3 text-sm text-muted-foreground">No matching HYPE users.</p>
              {/if}
            {/each}
          {/if}
        </nav>
        <div class="shrink-0 border-t border-border px-3 py-2">
          <button
            type="button"
            disabled={Boolean(model.archiving.length)}
            class="inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
            onclick={() => void model.showArchived(!model.archived)}
          >
            {#if model.archived}
              <InboxIcon class="size-4" aria-hidden="true" />
            {:else}
              <ArchiveIcon class="size-4" aria-hidden="true" />
            {/if}
            {model.archived ? 'Inbox' : 'Archived'}
          </button>
        </div>
      </aside>
      <div class="flex min-h-0 min-w-0 flex-col overflow-hidden">
        {#if model.selected && model.selectedModel}
          {#key model.selectedOrganisation}
            <MessagingAppearanceProvider organisationId={model.selectedOrganisation}>
              <ConversationPane
                organisationName={model.organisation?.name || model.organisation?.code}
                composerDisabled={model.preparingForward}
                onForward={model.beginForward}
                model={model.selectedModel}
                recipientLocked
                displayName={model.selected.recipient.name}
                username={model.selected.recipient.username}
                photo={model.selected.recipient.image}
                hypeLinked={model.selected.hypeLinked}
                isGroup={model.selected.isGroup}
              />
            </MessagingAppearanceProvider>
          {/key}
        {:else}
          <div class="flex min-h-0 flex-1 items-center justify-center p-5">
            <p class="max-w-md text-center text-sm text-muted-foreground">
              Select a conversation or search for a HYPE user. New conversations use
              that user’s verified messaging preference.
            </p>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
