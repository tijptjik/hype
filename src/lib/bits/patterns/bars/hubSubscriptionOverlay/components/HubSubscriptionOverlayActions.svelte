<script lang="ts">
// BITS
import { Button } from '$lib/bits/core'
// I18N
import { m } from '$lib/i18n'

type Props = {
  ctaText?: string
  dismissText?: string
  isLoading?: boolean
  isDisabled?: boolean
  onJoin?: () => void | Promise<void>
  onDismiss?: () => void | Promise<void>
}

let {
  ctaText = m.hub__subscription_cta(),
  dismissText = m.hub__subscription_dismiss(),
  isLoading = false,
  isDisabled = false,
  onJoin,
  onDismiss,
}: Props = $props()
</script>

<div class="flex shrink-0 items-center gap-1.5">
  <Button
    text={dismissText}
    color="light"
    style="ghost"
    class="h-11 px-4 text-base text-white/72 hover:text-white"
    disabled={isDisabled || isLoading}
    onClick={() => onDismiss?.()}
  />
  <Button
    text={`${ctaText}${isLoading ? '…' : ''}`}
    color="primary"
    class="h-11 min-w-36 px-6 text-base"
    disabled={isDisabled || isLoading}
    onClick={() => onJoin?.()}
  />
</div>
