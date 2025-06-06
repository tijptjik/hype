import { getContext } from 'svelte';
import { setContext } from 'svelte';
// ENUM
import { HierarchicalResource } from '$lib/enums';

type SidebarStateState = {
  isOpen: boolean;
  isSectionOpen: Record<HierarchicalResource, boolean | null>;
};

class SidebarState {
  state: SidebarStateState = $state({
    isOpen: true,
    isSectionOpen: {
      organisation: null,
      project: null,
      layer: null,
      feature: true,
      task: null
    }
  });

  width = {
    isOpen: 400,
    isClosed: 80
  };
  toggleSidebar = () => {
    this.state.isOpen = !this.state.isOpen;
  };

  toggleSection = (section: HierarchicalResource) => {
    this.state.isSectionOpen[section] = !this.state.isSectionOpen[section];
  };

  openSection = (section: HierarchicalResource, exclusive: boolean = true) => {
    if (exclusive) {
      Object.keys(this.state.isSectionOpen).forEach((key) => {
        if (key !== HierarchicalResource.feature) {
          this.state.isSectionOpen[key as HierarchicalResource] = false;
        }
      });
    }
    this.state.isSectionOpen[section] = true;
  };

  closeSection = (section: HierarchicalResource) => {
    this.state.isSectionOpen[section] = false;
  };

  getWidth = () => {
    return this.state.isOpen ? this.width.isOpen : this.width.isClosed;
  };

  isOpen = () => {
    return this.state.isOpen;
  };

  isSectionOpen = (section: HierarchicalResource) => {
    return this.state.isSectionOpen[section];
  };
}

export const SIDEBAR_STATE_KEY = Symbol('sidebarState');

export const setSidebarState = () => setContext(SIDEBAR_STATE_KEY, new SidebarState());

export const getSidebarState = (): ReturnType<typeof setSidebarState> =>
  getContext(SIDEBAR_STATE_KEY);
