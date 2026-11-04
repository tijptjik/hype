<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import UserMessagingSettings from '#lib/bits/patterns/messaging/UserMessagingSettings.svelte'
let { canVerify = false }: { canVerify?: boolean } = $props()
const responsive = setResponsiveCtx()
let width = $state(0)
let height = $state(0)
$effect(() => responsive.setWindowDimensions(width, height))
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />

<main class="mx-auto w-full max-w-lg p-4">
  <UserMessagingSettings userId="synthetic-user" {canVerify} />
</main>
