<script lang="ts">
// COMPONENTS
import VisualSection from '#lib/bits/custom/main/VisualSection.svelte'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
import AdminUserMessagingFields from './AdminUserMessagingFields.svelte'
import { createAdminMessagingDraft } from '#lib/users/adminMessagingDraft.js'
import FormFieldSkeleton from '#lib/bits/patterns/forms/formSkeleton/components/FormFieldSkeleton.svelte'
</script>
<div
  role="status"
  aria-label="Loading profile"
  aria-busy="true"
  class="h-full w-full min-w-0"
>
  <FormSurface>
    <VisualSection
      expandedHeight={208}
      minimumHeight={160}
      showImage={false}
      showControls={false}
    >
      {#snippet map()}
        <div class="flex h-full w-full gap-px">
          <Skeleton class="h-full w-44 shrink-0 rounded-none sm:w-52" />
          <Skeleton class="h-full flex-1 rounded-none" />
        </div>
      {/snippet}
    </VisualSection>
    <div class="grid grid-cols-1 xl:grid-cols-3">
      {#each [
        { title: 'Names', fields: ['Name', 'Username', 'Public attribution'] },
        {
          title: 'Phone',
          fields: ['Phone number'],
        },
        { title: 'Web', fields: ['Email'] },
      ] as section}
        <section
          class="min-w-0 {section.title !== 'Names'
            ? 'xl:border-border/70 xl:border-l'
            : ''}"
        >
          <SectionHeader title={section.title} class="h-[68px]! min-h-[68px]!" />
          <div class="space-y-4 px-6 py-6">
            {#each section.fields as label}
              <FormFieldSkeleton {label} />
            {/each}
            {#if section.title === 'Phone'}
              <fieldset disabled class="min-w-0">
                <ContentSkeleton
                  class="[&_.bits-form\_\_label-text]:text-muted-foreground! [&_span.text-muted-foreground]:text-muted-foreground! [&_input]:placeholder:text-transparent!"
                >
                  <AdminUserMessagingFields
                    value={createAdminMessagingDraft()}
                    editing={false}
                    disabled
                    onChange={() => {}}
                  />
                </ContentSkeleton>
              </fieldset>
            {/if}
            {#if section.title === 'Web'}
              <section class="space-y-4" aria-hidden="true">
                <h3 class="text-muted-foreground text-sm font-medium">
                  Linked to HYPE
                </h3>
                <div class="flex items-start gap-3">
                  <Skeleton class="mt-0.5 size-4" />
                  <div class="min-w-0 flex-1 space-y-2">
                    <Skeleton class="h-3.5 w-32" />
                    <Skeleton class="h-3 w-48 max-w-full" />
                  </div>
                </div>
              </section>
            {/if}
          </div>
        </section>
      {/each}
    </div>
  </FormSurface>
</div>
