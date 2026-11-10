<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// ADAPTER
import { useOrganisationMessagingModel } from '#lib/adapters/messaging/useOrganisationMessagingModel.svelte.js'
// MESSAGING
import { messagingIntegrations } from '#lib/messaging/integrations.js'
// ICONS
import AlertIcon from 'virtual:icons/lucide/circle-alert'
import ChatIcon from 'virtual:icons/lucide/message-circle'
// COMPONENTS
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
import MessagingAccountCard from './MessagingAccountCard.svelte'
import ChatBackgroundSettings from './ChatBackgroundSettings.svelte'
// BITS COMPONENTS
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
// TYPES
import type { MessagingPlatform } from '#lib/messaging/types.js'
import type { ChatAppearance } from '#lib/messaging/appearance.js'
let {
  organisationId,
  appearance,
  appearanceDisabled = true,
  appearanceIssues = [],
  onAppearanceChange,
}: {
  organisationId: string
  appearance: ChatAppearance
  appearanceDisabled?: boolean
  appearanceIssues?: string[]
  onAppearanceChange: (appearance: ChatAppearance) => void
} = $props()
// The route keys this component by organisation, keeping leases and login fields isolated.
const model = untrack(() => useOrganisationMessagingModel(organisationId))
const platforms: MessagingPlatform[] = ['whatsapp', 'telegram']
</script>

<FormSurface
  class="mb-0! flex min-w-0 flex-col [--messaging-settings-card-width:360px]"
>
  <SectionHeader
    icon={ChatIcon}
    title="Messaging"
    description="Link accounts shared by this organisation’s authorised operators."
  />
  <div class="px-6 py-6">
    <p class="text-muted-foreground mb-4 max-w-3xl text-sm">
      Connections pause when nobody is viewing messaging. Your accounts stay linked.
    </p>
    {#if model.actionError}
      <p role="alert" class="text-muted-foreground mb-4 flex items-start gap-2 text-sm">
        <AlertIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{model.actionError}</span>
      </p>
    {/if}
    {#if model.loading}
      <div class="flex min-w-0 flex-wrap items-stretch gap-4">
        {#each platforms as platform (platform)}
          <ContentSkeleton
            label={`Loading ${platform} account`}
            class="w-full max-w-[var(--messaging-settings-card-width,360px)]"
          >
            <MessagingAccountCard {platform} busy onAction={async () => {}} />
          </ContentSkeleton>
        {/each}
      </div>
    {:else}
      <div class="flex min-w-0 flex-wrap items-stretch gap-4">
        {#each platforms as platform (platform)}
          {@const account = model.accounts.find(
            account => account.platform === platform,
          )}
          <MessagingAccountCard
            {platform}
            status={model.statuses[platform]}
            connectionError={messagingIntegrations[platform]
              ? model.connectionErrors[platform]
              : `${platform === 'telegram' ? 'Telegram' : 'WhatsApp'} integration is temporarily disabled.`}
            registered={Boolean(account)}
            enabled={account?.enabled}
            busy={model.busy !== null || !messagingIntegrations[platform]}
            pendingAction={model.busy === platform ? model.pendingAction : null}
            onAction={action => model.act(platform, action)}
          />
        {/each}
      </div>
    {/if}
  </div>
  <ChatBackgroundSettings
    {appearance}
    disabled={appearanceDisabled}
    issues={appearanceIssues}
    onChange={onAppearanceChange}
  />
</FormSurface>
