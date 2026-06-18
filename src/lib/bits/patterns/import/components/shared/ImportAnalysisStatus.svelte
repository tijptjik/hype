<script lang="ts">
type Props = {
  label: string
}

let { label }: Props = $props()
</script>

<div class="flex min-h-48 items-center justify-center py-8 text-center">
  <div
    class="font-mono text-xs font-semibold uppercase tracking-[0.28em] text-base-content/60"
  >
    {label}
  </div>
</div>
