<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// ADAPTER
import { useOrganisationMessagingModel } from '#lib/adapters/messaging/useOrganisationMessagingModel.svelte.js'
// COMPONENTS
import MessagingAccountCard from './MessagingAccountCard.svelte'
import ChatBackgroundSettings from './ChatBackgroundSettings.svelte'
// TYPES
import type { MessagingPlatform } from '#lib/messaging/types.js'
let { organisationId }: { organisationId: string } = $props()
// The route keys this component by organisation, keeping leases and login fields isolated.
const model = untrack(() => useOrganisationMessagingModel(organisationId))
const platforms: MessagingPlatform[] = ['whatsapp', 'telegram']
</script>

<div class="flex min-w-0 max-w-full flex-col gap-5 p-5">
  <div>
    <h2 class="text-xl font-semibold">Messaging</h2>
    <p class="mt-2 text-sm text-muted-foreground">
      Link this organisation's accounts. Everyone with access uses the same linked
      accounts. Connections pause when nobody is viewing messaging; your accounts stay
      linked.
    </p>
  </div>
  {#if model.error}
    <p role="alert" class="rounded-lg border border-border p-3 text-sm">
      {model.error}
    </p>
  {/if}
  {#if model.loading}
    <p role="status">Loading messaging accounts…</p>
  {:else}
    <div class="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[repeat(2,minmax(0,1fr))]">
      {#each platforms as platform (platform)}
        {@const account = model.accounts.find(account => account.platform === platform)}
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
  <ChatBackgroundSettings {organisationId} />
</div>
