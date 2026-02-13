<script lang="ts">
// BITS COMPONENTS
import { Separator } from '$lib/bits'
</script>

<main class="h-full overflow-y-auto p-6">
  <section class="bits-theme space-y-8 rounded-xl border border-base-300 bg-base-100 p-6">
    <h1 class="text-xl font-semibold text-foreground">Bits Separator Variations</h1>

    <div class="space-y-1">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">Default</h2>
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

    <div class="space-y-1">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">Dot</h2>
      <div class="flex items-center text-sm">
        <div>Blog</div>
        <Separator orientation="vertical" variant="dot" decorative={true} />
        <div>Docs</div>
        <Separator orientation="vertical" variant="dot" decorative={true} />
        <div>Source</div>
      </div>
    </div>

    <div class="space-y-1">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">
        Dot Vertical
      </h2>
      <div class="flex w-56 flex-col items-center text-sm">
        <div>Blog</div>
        <Separator variant="dot" decorative={true} />
        <div>Docs</div>
        <Separator variant="dot" decorative={true} />
        <div>Source</div>
      </div>
    </div>

    <div class="space-y-1">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-foreground-alt">
        Vertical Aligned
      </h2>
      <div class="w-56 rounded-lg border border-base-300/70 p-3">
        <div class="flex flex-col text-sm">
          <div class="py-1">Dashboard</div>
          <Separator />
          <div class="py-1">Members</div>
          <Separator />
          <div class="py-1">Settings</div>
        </div>
      </div>
    </div>
  </section>
</main>
