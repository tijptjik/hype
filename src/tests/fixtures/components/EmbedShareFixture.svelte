<script lang="ts">
import Header from '#lib/bits/patterns/layout/header/Header.svelte'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
import FeatureIcon from 'virtual:icons/proicons/location'
import UsersIcon from 'virtual:icons/proicons/person-multiple'
import ShareIcon from 'virtual:icons/proicons/share'
import ShareEmbedPanel from '#lib/bits/patterns/embed/ShareEmbedPanel.svelte'
setResponsiveCtx()
let open = $state(false)
let visited = $state(false)
const rows = [
  {
    id: '-HIXEjblPzoP',
    code: 'trees',
    name: 'Trees',
    projectId: 'WZ76ff-FpBgi',
    projectName: 'Old and Valuable Trees',
    organisationId: 'org',
    organisationCode: 'mapping-hong-kong',
    organisationName: 'Cultural & Media Education Foundation',
    hubId: 'hub',
    hubName: 'Mapping Hong Kong',
  },
  {
    id: 'RfWMLs_jW6QJ',
    code: 'books',
    name: 'Independent bookstores with a deliberately long readable label',
    projectId: 'books',
    projectName: 'Independent Bookstores',
    organisationId: 'org',
    organisationCode: 'mapping-hong-kong',
    organisationName: 'Cultural & Media Education Foundation',
    hubId: 'hub',
    hubName: 'Mapping Hong Kong',
  },
]
</script>
<Header
  title={{ text: 'Mapping Hong Kong' }}
  avatar={{ isVisible: false }}
  formActions={{
    featuresAction: { text: 'Features', icon: FeatureIcon },
    usersAction: { text: 'Users', icon: UsersIcon },
  }}
  shareAction={{
    text: 'Share map',
    icon: ShareIcon,
    style: open ? 'soft' : 'outline',
    color: open ? 'primary' : 'neutral',
    attrs: { 'aria-pressed': open },
    onClick: () => {
      open = true
      visited = true
    },
  }}
  facets={{
    items: [
      { ref: 'core', label: 'Profile', icon: FeatureIcon },
      { ref: 'share', label: 'Share', icon: ShareIcon },
    ],
    active: open ? 'share' : 'core',
    onFacetChange: ref => {
      open = ref === 'share'
      if (open) visited = true
    },
  }}
/>
{#if visited}
  <div class={open ? 'h-[calc(100vh-72px)]' : 'hidden'}>
    <ShareEmbedPanel
      initialTheme="breadline-light"
      initialMapStyle="quercus"
      targetType="organisation"
      targetId="mapping-hong-kong"
      loadResources={async () => rows}
    />
  </div>
{/if}
