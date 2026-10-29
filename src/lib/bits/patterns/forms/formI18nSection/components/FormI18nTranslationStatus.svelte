<script lang="ts">
let { message }: { message: string } = $props()
let visible = $state(false)
$effect(() => {
  visible = Boolean(message)
  if (!message) return
  const timer = setTimeout(() => { visible = false }, 3000)
  return () => clearTimeout(timer)
})
</script>

<span role="status" aria-hidden={!visible} class="min-w-0 text-right text-xs text-muted-foreground transition-opacity duration-200 motion-reduce:transition-none" style:opacity={visible ? 1 : 0}>
  {message}
</span>
