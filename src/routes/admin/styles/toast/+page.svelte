<script lang="ts">
import { Button } from '#lib/bits/index.js'
import { toast } from 'svelte-sonner'

function showDefault(): void {
  toast('Default toast')
}

function showSuccess(): void {
  toast.success('Success toast')
}

function showError(): void {
  toast.error('Error toast')
}

function showWarning(): void {
  toast.warning('Warning toast')
}

function showInfo(): void {
  toast.info('Info toast')
}

function showLongDuration(): void {
  toast('30s toast', { duration: 30000 })
}

function showWithDescription(): void {
  toast.success('Saved changes', {
    description: 'Your settings were updated successfully.',
  })
}

function showAction(): void {
  toast('New update available', {
    action: {
      label: 'Reload',
      onClick: () => window.location.reload(),
    },
  })
}

function showManualClose(): void {
  toast.info('Manual close required', {
    description: 'This toast stays open until you close it.',
    closeButton: true,
    duration: Number.POSITIVE_INFINITY,
  })
}
</script>

<main class="h-full overflow-y-auto p-6">
  <section
    class="bits-theme border-base-300 bg-base-100 space-y-10 rounded-xl border p-6"
  >
    <header class="space-y-2">
      <h1 class="text-foreground text-xl font-semibold">Toast Variations</h1>
      <p class="text-foreground-alt text-sm">
        Trigger all supported toast variants and options.
      </p>
    </header>

    <div class="space-y-4">
      <h2 class="text-foreground-alt text-sm font-semibold tracking-wide uppercase">
        Variants
      </h2>
      <div class="flex flex-wrap gap-3">
        <Button text="Default" color="neutral" onClick={showDefault} />
        <Button text="Success" color="success" onClick={showSuccess} />
        <Button text="Error" color="error" onClick={showError} />
        <Button text="Warning" color="warning" onClick={showWarning} />
        <Button text="Info" color="info" onClick={showInfo} />
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-foreground-alt text-sm font-semibold tracking-wide uppercase">
        Options
      </h2>
      <div class="flex flex-wrap gap-3">
        <Button text="30s Duration" color="primary" onClick={showLongDuration} />
        <Button
          text="With Description"
          color="secondary"
          onClick={showWithDescription}
        />
        <Button text="With Action" color="accent" onClick={showAction} />
        <Button
          text="Manual Close"
          color="neutral"
          style="outline"
          onClick={showManualClose}
        />
      </div>
    </div>
  </section>
</main>
