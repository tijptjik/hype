<script lang="ts">
// COMPONENTS
import { Toaster as SonnerToaster } from 'svelte-sonner'
</script>

<SonnerToaster
  duration={2500}
  toastOptions={{
    unstyled: true,
    classes: {
      toast: 'group bits-theme bits-toast',
      title: 'font-mono text-sm font-medium leading-5 tracking-tight text-inherit',
      description: 'mt-1 font-sans text-xs font-normal leading-4 text-base-content/60',
      icon: 'mt-0.5 shrink-0 text-inherit',
      actionButton: 'bits-toast__action',
      cancelButton: 'bits-toast__cancel',
      closeButton:
        'absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-base-50 bg-base-200 text-inherit transition-colors hover:bg-base-100',
      error: 'bits-toast--error',
      success: 'bits-toast--success',
      warning: 'bits-toast--warning',
      info: 'bits-toast--info',
    },
  }}
/>
