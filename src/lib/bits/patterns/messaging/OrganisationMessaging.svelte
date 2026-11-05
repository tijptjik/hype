<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// ADAPTER
import { useOrganisationMessagingModel } from '#lib/adapters/messaging/useOrganisationMessagingModel.svelte.js'
// ICONS
import AlertIcon from 'virtual:icons/lucide/circle-alert'
import ChatIcon from 'virtual:icons/lucide/message-circle'
// COMPONENTS
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
import MessagingAccountCard from './MessagingAccountCard.svelte'
import ChatBackgroundSettings from './ChatBackgroundSettings.svelte'
// TYPES
import type { MessagingPlatform } from '#lib/messaging/types.js'
let { organisationId }: { organisationId: string } = $props()
// The route keys this component by organisation, keeping leases and login fields isolated.
const model = untrack(() => useOrganisationMessagingModel(organisationId))
const platforms: MessagingPlatform[] = ['whatsapp', 'telegram']
</script>

<FormSurface class="mb-0! flex min-w-0 flex-col">
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
      <p role="status">Loading messaging accounts…</p>
    {:else}
      <div
        class="grid min-w-0 grid-cols-1 items-stretch gap-4 lg:grid-cols-[repeat(3,minmax(0,1fr))]"
      >
        {#each platforms as platform (platform)}
          {@const account = model.accounts.find(
            account => account.platform === platform,
          )}
          <MessagingAccountCard
            {platform}
            status={model.statuses[platform]}
            connectionError={model.connectionErrors[platform]}
            registered={Boolean(account)}
            enabled={account?.enabled}
            busy={model.busy !== null}
            pendingAction={model.busy === platform ? model.pendingAction : null}
            onAction={action => model.act(platform, action)}
          />
        {/each}
      </div>
    {/if}
  </div>
  <ChatBackgroundSettings {organisationId} />
</FormSurface>
