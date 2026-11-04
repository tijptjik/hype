<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// ADAPTER
import { useUserMessagingSettingsModel } from '#lib/adapters/messaging/useUserMessagingSettingsModel.svelte.js'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import TextInputField from '#lib/bits/custom/form/TextInputField.svelte'
// TYPES
import type { MessagingPlatform } from '#lib/messaging/types.js'
let { userId, canVerify = false }: { userId?: string; canVerify?: boolean } = $props()
const model = untrack(() => useUserMessagingSettingsModel(userId, canVerify))
const platforms: MessagingPlatform[] = ['whatsapp', 'telegram']
</script>

<section class="flex min-w-0 flex-col gap-4 rounded-xl border border-border p-4" aria-label="Messaging preferences">
  <h3 class="text-lg font-semibold">Messaging preferences</h3>
  <p class="text-sm text-muted-foreground">Choose how organisations should contact you. Existing conversations stay on their original platform.</p>
  {#if model.error}<p role="alert" class="text-sm">{model.error}</p>{/if}
  {#if model.loading}<p role="status">Loading preferences…</p>{:else}
    <div class="flex flex-wrap gap-2" aria-label="Preferred messaging platform">
      {#each platforms as platform}
        <Button text={platform === 'telegram' ? 'Telegram' : 'WhatsApp'} style={model.settings.platform === platform ? 'soft' : 'outline'} disabled={model.busy} attrs={{ 'aria-pressed': model.settings.platform === platform }} onClick={() => void model.setPreference(platform)} />
      {/each}
      <Button text="Use default (WhatsApp)" style="outline" disabled={model.busy} onClick={() => void model.setPreference(null)} />
    </div>
    {#each platforms as platform}
      {@const identity = model.settings.identities.find(row => row.platform === platform)}
      <div class="flex min-w-0 flex-col gap-2 border-t border-border pt-3">
        <TextInputField label={platform === 'telegram' ? 'Telegram username, phone or user ID' : 'WhatsApp phone number'} bind:value={model.addresses[platform]} disabled={model.busy} inputAttrs={{ autocomplete: 'off' }} />
        <div class="flex flex-wrap items-center gap-2"><Button text="Save identity" style="outline" disabled={model.busy} onClick={() => void model.saveIdentity(platform)} /><span class="text-sm text-muted-foreground">{identity?.verifiedAt ? 'Verified' : identity ? 'Awaiting ownership verification' : 'Not set'}</span></div>
        {#if canVerify && identity && !identity.verifiedAt}
          <p class="text-sm text-muted-foreground">Confirm independently that this messaging identity belongs to this person before verifying it. A matching name is insufficient.</p>
          {#each model.accounts.filter(account => account.platform === platform) as account}
            <Button text={`Confirm ownership using ${account.organisation}`} style="outline" disabled={model.busy || model.addresses[platform] !== identity.address} onClick={() => void model.verify(account.id, identity.address)} />
          {/each}
          {#if !model.accounts.some(account => account.platform === platform)}<p class="text-sm text-muted-foreground">Connect an organisation's {platform === 'telegram' ? 'Telegram' : 'WhatsApp'} account to verify this address.</p>{/if}
        {/if}
      </div>
    {/each}
  {/if}
</section>
