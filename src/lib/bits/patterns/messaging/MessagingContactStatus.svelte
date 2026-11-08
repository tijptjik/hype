<script lang="ts">
let {
  linked,
  group = false,
  platform,
}: {
  linked: boolean
  group?: boolean
  platform: 'whatsapp' | 'telegram'
} = $props()
</script>

{#if group}
  <span
    class="border-border bg-surface text-muted-foreground inline-block w-fit max-w-full rounded border px-1.5 py-0.5 text-xs whitespace-normal"
    >{platform === 'telegram' ? 'Group / channel' : 'Group chat'}</span
  >
{:else if !linked}
  <span
    class="border-border bg-surface text-foreground inline-block w-fit max-w-full rounded border px-1.5 py-0.5 text-xs font-medium whitespace-normal"
    title="No verified HYPE user is linked to this contact."
    >Not HYPE User</span
  >
{/if}
