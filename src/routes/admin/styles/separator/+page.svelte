<script lang="ts">
// BITS COMPONENTS
import { Separator } from '$lib/bits'
</script>

<main class="h-full overflow-y-auto p-6">
  <section class="bits-theme space-y-8 rounded-xl border border-base-300 bg-base-100 p-6">
    <h1 class="text-xl font-semibold text-foreground">Bits Separator Variations</h1>

    <div>
      <div class="space-y-1">
        <h4 class="font-semibold">Bits UI</h4>
        <p class="text-muted-foreground text-sm">Headless UI components for Svelte.</p>
      </div>
      <Separator />
      <div class="flex h-5 items-center space-x-4 text-sm">
        <div>Blog</div>
        <Separator orientation="vertical" />
        <div>Docs</div>
        <Separator orientation="vertical" />
        <div>Source</div>
      </div>
    </div>
  </section>
</main>
