<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'

type Props = {
  privacyText?: string
  termsText?: string
  onPrivacyClick?: () => void
  onTermsClick?: () => void
}

let {
  privacyText = m.hub__subscription_privacy_policy(),
  termsText = m.hub__subscription_terms_of_service(),
  onPrivacyClick,
  onTermsClick,
}: Props = $props()
</script>

<div class="text-base-content/65 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
  <span>{m.hub__subscription_subject_to()}</span>
  <button
    type="button"
    class="text-primary hover:text-primary-content font-medium underline underline-offset-4 transition"
    onclick={() => onPrivacyClick?.()}
  >
    {privacyText}
  </button>
  <span>{m.filters__and()}</span>
  <button
    type="button"
    class="text-primary hover:text-primary-content font-medium underline underline-offset-4 transition"
    onclick={() => onTermsClick?.()}
  >
    {termsText}
  </button>
</div>
