<script lang="ts">
// I18N
import { m } from '$lib/i18n';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
// ICONS
import { Map, BuildingLibrary as Building, MapPin } from '@steeze-ui/heroicons';

// PROPS
type Props = {
  title: string;
  group: 'walks' | 'neighbourhoods' | 'features';
};

let { title, group }: Props = $props();

const icons = {
  walks: Map,
  neighbourhoods: Building,
  features: MapPin
};

const displayTitle = {
  walks: m.omni__title_walks(),
  neighbourhoods: m.omni__title_neighbourhoods(),
  features: m.omni__title_features()
};
</script>

<div class="flex items-center justify-between px-4 py-2">
  <span class="text-xs uppercase tracking-widest text-base-content/60"
    >{displayTitle[group]}</span>
  <Icon src={icons[group]} class="h-4 w-4 text-base-content/60" theme="solid" />
</div>
