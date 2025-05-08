<script lang="ts">
import { getImageContext, setImageContext } from '$lib/context/images.svelte';
// TYPES
import type {
  Id,
  ResourceType,
  OrganisationDB,
  ProjectDB,
  GetImageAPI,
  ImageCtxMode
} from '$lib/types';

type Props = {
  children: any;
  mode: ImageCtxMode;
  isAdminMode: boolean;
  refType: ResourceType;
  refId: Id;
  refOrganisation?: OrganisationDB;
  refProject?: ProjectDB;
  image?: GetImageAPI;
};

// STATE
let lastSet: string | null = $state(null);

// PROPS
let { children, ...settings }: Props = $props();

// CONTEXT
setImageContext(
  settings.mode,
  settings.isAdminMode,
  settings.refType,
  settings.refId,
  settings.refOrganisation,
  settings.refProject,
  settings.image
);

let imageCtx = getImageContext();

// EFFECTS
$effect(() => {
  if (lastSet !== settings.refId) {
    imageCtx.setContext(settings);
    lastSet = settings.refId;
  }
});
</script>

{@render children()}
