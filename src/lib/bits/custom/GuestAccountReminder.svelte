<script lang="ts">
// BITS
import Button from '$lib/bits/core/button/Button.svelte'
// AUTH
import { requestAccountUpgrade, type UpgradeReason } from '$lib/auth/upgrade'
// I18N
import { m } from '$lib/i18n'

let { reason = 'sync' }: { reason?: UpgradeReason } = $props()

let isDismissed = $state(false)
</script>

{#if !isDismissed}
  <aside class="mx-4 my-3 rounded-xl bg-base-100/60 p-4">
    <p class="text-sm leading-5 text-base-content/75">{m.guest__reminder()}</p>
    <div class="mt-3 flex justify-end gap-2">
      <Button
        text={m.guest__close()}
        color="neutral"
        style="ghost"
        size="sm"
        onClick={() => (isDismissed = true)}
      />
      <Button
        text={m.guest__upgrade_action()}
        color="primary"
        size="sm"
        onClick={() => requestAccountUpgrade(reason, window.location.href)}
      />
    </div>
  </aside>
{/if}
