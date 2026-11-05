<script lang="ts">
// ICONS
import Google from 'virtual:icons/logos/google-icon'
import Facebook from 'virtual:icons/simple-icons/facebook'
import Link from 'virtual:icons/lucide/link'
import Mail from 'virtual:icons/lucide/mail'
// AUTH
import { AUTH_PROVIDER_REGISTRY } from '#lib/auth/providers.js'
// TYPES
import type { AdminUserProfile } from '#lib/db/zod/schema/user.types.js'
let { accounts = [] }: { accounts?: AdminUserProfile['linkedAccounts'] } = $props()
const icons = { google: Google, facebook: Facebook, credential: Mail }
</script>

<section class="min-w-0 space-y-4" aria-label="Linked login services">
  <h3 class="text-muted-foreground text-sm font-medium">Linked to HYPE</h3>
  {#each accounts as account}
    {@const Icon = icons[account.providerId as keyof typeof icons] ?? Link}
    {@const label =
      account.providerId === 'credential'
        ? 'Email and password'
        : (AUTH_PROVIDER_REGISTRY.find(row => row.id === account.providerId)?.label ??
          account.providerId)}
    <div class="flex min-w-0 items-start gap-3">
      <Icon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div class="min-w-0">
        <p class="text-sm font-medium">{label}</p>
        {#if account.providerId !== 'credential'}
          <p class="text-muted-foreground mt-1 text-sm break-words">
            {account.email ?? 'Email not recorded'}
          </p>
          {#if account.email && account.emailSource === 'sign-in'}
            <p class="text-muted-foreground text-xs">From saved sign-in</p>
          {/if}
        {/if}
      </div>
    </div>
  {:else}
    <p class="text-muted-foreground text-sm">No linked login services</p>
  {/each}
</section>
