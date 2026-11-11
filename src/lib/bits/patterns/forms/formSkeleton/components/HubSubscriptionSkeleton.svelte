<script lang="ts">
// COMPONENTS
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
import { Switch } from '#lib/bits/custom/index.js'
import FormFieldSkeleton from './FormFieldSkeleton.svelte'
import FeatureProfileEditor from '../../featureLocation/FeatureProfileEditor.svelte'
import { restoreProfileLocales } from '../../featureLocation/profileLocales.js'
// TYPES
import type { LocaleKey } from '#lib/types.js'
// STYLES
import { fieldLabelStyles } from '#lib/bits/custom/form/fieldTypography.styles.js'
// ICONS
import SubscriptionIcon from 'virtual:icons/proicons/mail'
let { locales, expanded = false }: { locales: LocaleKey[]; expanded?: boolean } =
  $props()
const localeState = $derived({ ...restoreProfileLocales(locales, {}), expanded })
</script>
<section class="bits-form__section" aria-hidden="true">
  <SectionHeader
    title="Subscription"
    description="Configure newsletter promotion for this hub."
    icon={SubscriptionIcon}
  >
    {#snippet right()}
      <Switch disabled />
    {/snippet}
  </SectionHeader>
  <div class="grid min-w-0 gap-6 px-6 pt-6 md:grid-cols-3">
    <div class="min-w-0 space-y-6">
      {#each ['Service', 'Publication ID', 'Substack Session Cookie'] as label}
        <FormFieldSkeleton {label} readOnly />
      {/each}
    </div>
    <div
      class="md:border-border/50 min-w-0 md:border-l md:pl-6 [&>[data-feature-profile-editor]]:px-0"
    >
      <FeatureProfileEditor
        loading
        contextKey="subscription-loading"
        {localeState}
        onLocaleStateChange={() => {}}
        values={{}}
        showToolbar={false}
        fieldConfigs={[{ key: 'subscriptionBenefits', label: 'Subscription Benefits' }]}
        translate={async () => ({ status: 'translated', text: '' })}
        onTranslated={() => {}}
      >
        {#snippet children()}
          <div class="min-h-[62px] md:min-h-[42px]"></div>
        {/snippet}
      </FeatureProfileEditor>
    </div>
    <section class="md:border-border/50 min-w-0 md:border-l md:pl-6">
      <h3 class={`mb-2 flex min-h-7 items-center ${fieldLabelStyles}`}>Placement</h3>
      <div
        class="divide-border/20 border-border bg-foreground/4 flex min-w-0 flex-col divide-y rounded-xl border px-5"
      >
        {#each ['Top Bar', 'Hub Panel', 'Menu'] as label}
          <div class="flex items-center justify-between gap-3 py-4">
            <span class="min-w-0 flex-1 text-sm font-medium">{label}</span>
            <Switch disabled />
          </div>
        {/each}
      </div>
    </section>
  </div>
</section>
