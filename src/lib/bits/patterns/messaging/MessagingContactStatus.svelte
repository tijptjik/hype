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
    class="inline-block w-fit max-w-full whitespace-normal rounded border border-border bg-surface px-1.5 py-0.5 text-xs text-muted-foreground"
    >{platform === 'telegram' ? 'Group / channel' : 'Group chat'}</span
  >
{:else if !linked}
  <span
    class="inline-block w-fit max-w-full whitespace-normal rounded border border-border bg-surface px-1.5 py-0.5 text-xs font-medium text-foreground"
    title="No verified HYPE user is linked to this contact."
    >Not HYPE User</span
  >
{/if}
