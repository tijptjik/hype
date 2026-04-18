<script lang="ts">
// I18N
import { m } from '$lib/i18n'

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

<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-base-content/65">
  <span>{m.hub__subscription_subject_to()}</span>
  <button
    type="button"
    class="font-medium text-primary underline underline-offset-4 transition hover:text-primary-content"
    onclick={() => onPrivacyClick?.()}
  >
    {privacyText}
  </button>
  <span>{m.filters__and()}</span>
  <button
    type="button"
    class="font-medium text-primary underline underline-offset-4 transition hover:text-primary-content"
    onclick={() => onTermsClick?.()}
  >
    {termsText}
  </button>
</div>
