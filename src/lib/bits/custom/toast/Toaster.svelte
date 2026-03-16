<script lang="ts">
import { Toaster as SonnerToaster } from 'svelte-sonner'
</script>

<SonnerToaster
  duration={2500}
  toastOptions={{
    unstyled: true,
    classes: {
      toast: 'bits-theme bits-toast',
      title: 'bits-toast__title',
      description: 'bits-toast__description',
      icon: 'bits-toast__icon',
      actionButton: 'bits-toast__action',
      cancelButton: 'bits-toast__cancel',
      closeButton: 'bits-toast__close',
      error: 'bits-toast--error',
      success: 'bits-toast--success',
      warning: 'bits-toast--warning',
      info: 'bits-toast--info',
    },
  }}
/>
