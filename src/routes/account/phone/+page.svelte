<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import PhoneCompletionForm from '#lib/bits/patterns/auth/PhoneCompletionForm.svelte'
// TYPES
import type { PageProps } from './$types'

let { form }: PageProps = $props()
</script>

<svelte:head><title>{m.breadline__phone_title()} · Breadline</title></svelte:head>

<PhoneCompletionForm problem={form?.problem} telephone={form?.telephone} />
