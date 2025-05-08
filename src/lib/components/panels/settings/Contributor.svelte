<script lang="ts">
import { m } from '$lib/i18n';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { Trophy } from '@steeze-ui/heroicons';
import Section from '$lib/components/panels/common/Section.svelte';
// STORES
import { page } from '$app/stores';

const { session } = $page.data;

let contributorName = $state(session?.user?.attribution);
let timer: ReturnType<typeof setTimeout>;

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
  icon="/contributor.svg"
  position="right">
  <div
    class="my-2 ml-5 flex flex-row items-center gap-2 rounded-l-md rounded-r-none bg-base-200">
    <input
      name="attribution"
      type="text"
      class="input m-0 h-12 w-full rounded-l-md rounded-r-none border-0 bg-base-200 pl-[26px] pr-10 text-sm placeholder:text-base-content/40 focus:border-none focus:outline-none"
      placeholder={m.settings_contributor_placeholder()}
      bind:value={contributorName}
      oninput={({ target }) => debounce((target as HTMLInputElement).value)} />
    <div class="mr-8">
      <Icon src={Trophy} class="h-6 w-6 stroke-1 text-base-content/60" />
    </div>
  </div>
</Section>
