<script lang="ts">
type Props = {
  label: string
}

let { label }: Props = $props()
</script>

<div class="flex min-h-48 items-center justify-center py-8 text-center">
  <div
    class="text-base-content/60 font-mono text-xs font-semibold tracking-[0.28em] uppercase"
  >
    {label}
  </div>
</div>
