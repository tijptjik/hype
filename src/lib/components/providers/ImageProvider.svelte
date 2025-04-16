<script lang="ts">
import { getImageService, setImageService } from '$lib/context/images.svelte';
// TYPES
import type {
  Id,
  ResourceType,
  OrganisationDB,
  ProjectDB,
  GetImageAPI
} from '$lib/types';
import type { ImageServiceMode } from '$lib/context/images.svelte';

type Props = {
  children: any;
  mode: ImageServiceMode;
  isAdminMode: boolean;
  refType: ResourceType;
  refId: Id;
  refOrganisation?: OrganisationDB;
  refProject?: ProjectDB;
  image?: GetImageAPI;
};

let { children, ...settings }: Props = $props();
let lastSet: string | null = $state(null);

$effect(() => {
  if (lastSet !== settings.refId) {
    imageService.init(settings);
    lastSet = settings.refId;
  }
});

setImageService(
  settings.mode,
  settings.isAdminMode,
  settings.refType,
  settings.refId,
  settings.refOrganisation,
  settings.refProject,
  settings.image
);

let imageService = getImageService();
</script>

{@render children()}
