<script lang="ts">
// SVELTE
import { page } from '$app/state'
// I18N
import * as m from '$lib/paraglide/messages'
import { getLocaleKey, toLocaleCode } from '$lib/i18n'
// NAVIGATION
import { resolveTitle } from '$lib/navigation/title'
// COMPONENTS
import HubPolicyDocumentBody from '$lib/bits/patterns/policies/hubPolicyDialog/components/HubPolicyDocumentBody.svelte'
// SERVICES
import {
  createDefaultHubTermsOfService,
  renderPolicyMarkdown,
} from '$lib/services/policy'
// TYPES
import type { TitleEnvironmentLabel } from '$lib/types'
import type { PageProps } from './$types'

let { data }: PageProps = $props()

const localeKey = getLocaleKey()
const localeCode = toLocaleCode(localeKey)

// Resolve hub-level legal copy tokens from the active localized hub content when available.
const localizedHub = $derived(
  data.hub.i18n?.[localeCode] ??
    data.hub.i18n?.en ??
    Object.values(data.hub.i18n ?? {})[0],
)

const html = $derived(
  renderPolicyMarkdown(
    createDefaultHubTermsOfService(
      localeKey,
      localizedHub?.name,
      localizedHub?.nameShort,
      data.hub.legalContactAddress,
    ),
  ),
)
const documentTitle = $derived(
  resolveTitle(
    m.hub__subscription_terms_of_service(),
    page.data.titleEnvironmentLabel as TitleEnvironmentLabel | undefined,
  ),
)
</script>

<svelte:head> <title>{documentTitle}</title> </svelte:head>

<div class="min-h-screen bg-black">
  <main class="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
    <section class="px-2 sm:px-4"><HubPolicyDocumentBody {html} /></section>
  </main>
</div>
