<script lang="ts">
// LIB
import { page } from '$app/state';
// I18N
import { m } from '$lib/i18n';
// ENUMS
import { FirstClassResource, ResourcePath } from '$lib/enums';
// ICONS
import { EyeSlash, Eye } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';

// STATE : PAGE :: DATA
const { session } = page.data;

// STATE : PROPS
let {
  isPublished,
  isPendingReview,
  resourceType,
  resourceId,
  onStatusChange
}: {
  isPublished: boolean;
  isPendingReview: boolean;
  resourceType?: FirstClassResource;
  resourceId?: string;
  onStatusChange?: (newStatus: {
    isPublished: boolean;
    publishedAt: string | null;
    publisherId: string | null;
  }) => void;
} = $props();

// STATE : UI
let isLoading = $state(false);

const handleToggle = async (e: Event) => {
  e.preventDefault();
  e.stopPropagation();

  if (isLoading || !resourceType || !resourceId) return;

  isLoading = true;

  try {
    const response: Response = await fetch(
      `/api/${ResourcePath[resourceType]}/${resourceId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isPublished: !isPublished,
          publishedAt: !isPublished ? new Date().toISOString() : null,
          publisherId: !isPublished ? session?.user.id : null
        })
      }
    );

    if (!response.ok) throw new Error('Failed to update publication state');

    const result = await response.json();

    if (result && result.type === 'success') {
      // Call the callback if provided
      if (onStatusChange) {
        onStatusChange({
          isPublished: result.data.isPublished,
          publishedAt: result.data.publishedAt,
          publisherId: result.data.publisherId
        });
      }

      // EMIT EVENT: Signal to Image Context to refresh images if record was published
      if (result.data.isPublished) {
        const refreshImagesEvent = new CustomEvent('refreshImages', {
          detail: {
            resourceType: resourceType,
            resourceId: resourceId
          }
        });
        window.dispatchEvent(refreshImagesEvent);
      }
    }
  } catch (err) {
    console.error('Failed to toggle publication status:', err);
    // TODO: Show error toast
  } finally {
    isLoading = false;
  }
};
</script>

{#if resourceType && resourceId}
  <button
    class="badge w-[100px] rounded-lg border-none bg-glass-neutral px-3 py-5 text-xs uppercase transition-colors duration-500 disabled:opacity-60"
    class:text-orange-500={isPendingReview}
    class:text-ok={isPublished}
    class:text-error={!isPublished && !isPendingReview}
    onclick={handleToggle}
    disabled={isLoading}>
    <div class="flex items-center gap-1">
      {#if isPublished}
        <Icon src={EyeSlash} class="h-3 w-3" />
      {:else}
        <Icon src={Eye} class="h-3 w-3" />
      {/if}
      {isPendingReview
        ? m.tangy_zany_capybara_arise()
        : isPublished
          ? m.published()
          : m.weak_super_guppy_nail()}
    </div>
  </button>
{:else}
  <span
    class="badge w-[100px] rounded-lg border-none bg-glass-neutral px-3 py-5 text-xs uppercase"
    class:text-orange-500={isPendingReview}
    class:text-ok={isPublished}
    class:text-error={!isPublished && !isPendingReview}>
    {isPendingReview
      ? m.tangy_zany_capybara_arise()
      : isPublished
        ? m.published()
        : m.weak_super_guppy_nail()}
  </span>
{/if}
