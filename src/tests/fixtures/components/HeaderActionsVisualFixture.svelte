<script lang="ts">
// CONTEXT
import { setResponsiveCtx } from '#lib/context/responsive.svelte'
// COMPONENTS
import Header from '#lib/bits/patterns/layout/header/Header.svelte'
// ICONS
import Profile from 'virtual:icons/proicons/person'
import Shield from 'virtual:icons/proicons/shield-checkmark'
import Tag from 'virtual:icons/proicons/tag'
import Photo from 'virtual:icons/proicons/photo'
import Edit from 'virtual:icons/proicons/pencil'
import Eye from 'virtual:icons/proicons/eye'
import Save from 'virtual:icons/proicons/save'
import Close from 'virtual:icons/proicons/cancel'
setResponsiveCtx()
let editing = $state(false)
let published = $state(false)
let active = $state('core')
const items = [
  { ref: 'core', label: 'Profile', icon: Profile },
  { ref: 'capabilities', label: 'Capabilities', icon: Shield },
  { ref: 'fields', label: 'Fields', icon: Tag },
  { ref: 'images', label: 'Image', icon: Photo },
]
</script>
<div class="bits-theme">
  <Header
    contentStart={348}
    brand={{ src: '/favicon.svg', alt: 'HYPE', monochrome: true }}
    title={{
      text: 'Hong Kong Ghost Signs',
      icon: Profile,
      crumbs: [{ name: 'HK Ghost Signs' }],
      menuAction: {
        isVisible: true,
        ariaLabel: 'Resource actions',
        items: [{ label: 'Resource action' }],
      },
    }}
    facets={{ items, active, onFacetChange: value => (active = value) }}
    avatar={{ isVisible: false }}
    formActions={{
      isVisible: true,
      primaryAction: {
        text: editing ? 'Cancel' : 'Edit',
        icon: editing ? Close : Edit,
        color: 'neutral',
        style: editing ? 'ghost' : 'soft',
        class: 'bits-pattern-header__form-action-main',
        onClick: () => (editing = !editing),
      },
      saveAction: editing
        ? {
            text: 'Save',
            icon: Save,
            color: 'primary',
            style: 'none',
            class: 'bits-pattern-header__form-action-publish',
            onClick: () => (editing = false),
          }
        : null,
      publishAction: {
        kind: 'button',
        text: published ? 'Unpublish' : 'Publish',
        icon: Eye,
        color: published ? 'neutral' : 'primary',
        style: published ? 'outline' : 'none',
        class: 'bits-pattern-header__form-action-publish',
        onClick: () => (published = !published),
      },
    }}
  />
  <div
    class="ml-[348px] h-64 border-l border-t border-primary/50 bg-primary/5 px-6 py-4 text-xl"
  >
    Main panel
  </div>
</div>
