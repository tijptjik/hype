<script lang="ts">
// BITS
import Button from '$lib/bits/core/button/Button.svelte'
// AUTH
import { requestAccountUpgrade, type UpgradeReason } from '$lib/auth/upgrade'
// I18N
import { m } from '$lib/i18n'

let { reason = 'sync' }: { reason?: UpgradeReason } = $props()
</script>

<aside class="mx-4 my-3 rounded-xl border border-base-content/15 bg-base-100/60 p-4">
  <p class="text-sm leading-5 text-base-content/75">{m.guest__reminder()}</p>
  <Button
    text={m.guest__upgrade_action()}
    color="primary"
    size="sm"
    class="mt-3"
    onClick={() => requestAccountUpgrade(reason, window.location.href)}
  />
</aside>
