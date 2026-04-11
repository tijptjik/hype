<script lang="ts">
type Props = {
  privacyText?: string
  termsText?: string
  onPrivacyClick?: () => void
  onTermsClick?: () => void
}

let {
  privacyText = 'Privacy',
  termsText = 'Terms',
  onPrivacyClick,
  onTermsClick,
}: Props = $props()
</script>

<div
  class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/48 md:justify-end"
>
  <button
    type="button"
    class="font-medium text-white/64 underline underline-offset-4 transition hover:text-white"
    onclick={() => onPrivacyClick?.()}
  >
    {privacyText}
  </button>
  <button
    type="button"
    class="font-medium text-white/64 underline underline-offset-4 transition hover:text-white"
    onclick={() => onTermsClick?.()}
  >
    {termsText}
  </button>
</div>
