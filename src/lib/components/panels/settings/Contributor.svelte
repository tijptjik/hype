<script lang="ts">
import * as m from '$lib/paraglide/messages';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Trophy } from '@steeze-ui/heroicons';
import Section from '$lib/components/panels/common/Section.svelte';
// STORES
import { page } from '$app/stores';

const { session } = $page.data;

let contributorName = $state(session?.user?.attribution);
let timer: number;

const debounce = async (value: string) => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    await fetch(`/api/users/${session?.user?.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ attribution: value })
    });
  }, 500);
  session!.user.attribution = value;
};
</script>

<Section
  title={m.settings_contributor_title()}
  description={m.settings_contributor_description()}
  icon="/contributor.svg">
  <div class="flex flex-col gap-2 bg-base-200">
    <div class="flex h-11 flex-row items-center justify-between gap-4 px-4">
      <div class="flex w-full flex-row items-center gap-4">
        <Icon src={Trophy} class="h-5 w-5" />
        <input
          type="text"
          class="h-full w-full bg-base-200 outline-none"
          placeholder={m.settings_contributor_placeholder()}
          bind:value={contributorName}
          oninput={({ target }) => debounce((target as HTMLInputElement).value)} />
      </div>
    </div>
  </div>
</Section>
