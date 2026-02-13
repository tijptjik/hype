<script lang="ts">
import { Toaster as SonnerToaster } from 'svelte-sonner'
</script>

<SonnerToaster
  duration={2500}
  toastOptions={{
    unstyled: true,
    classes: {
      toast:
        'group relative flex w-[22rem] min-h-16 items-start gap-3 rounded-box border border-2 border-base-50 bg-base-100 p-[20px] text-base-content shadow-xl [&_[data-content]]:min-w-0 [&_[data-content]]:flex-1',
      title: 'font-sans text-sm/13px text-inherit',
      description: 'font-sans text-xs text-white/80',
      icon: 'mt-0.5 shrink-0 text-inherit',
      actionButton:
        'bits-btn ml-auto inline-flex h-8 w-auto max-w-fit shrink-0 items-center justify-center self-center whitespace-nowrap rounded-field border border-base-50 bg-base-200 px-3 text-xs font-semibold text-base-content hover:bg-base-100',
      cancelButton:
        'inline-flex h-8 w-auto max-w-fit shrink-0 items-center justify-center self-center whitespace-nowrap rounded-field border border-base-50 bg-base-200 px-3 text-xs font-semibold text-base-content hover:bg-base-100',
      closeButton:
        'absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-field border border-base-50 bg-base-200 text-inherit transition-colors hover:bg-base-100',
      error: 'bg-base-100 border-error/70 text-error',
      success: 'bg-base-100 border-success/70 text-success',
      warning: 'bg-base-100 border-warning/70 text-warning',
      info: 'bg-base-100 border-info/70 text-info',
    },
  }}
/>
