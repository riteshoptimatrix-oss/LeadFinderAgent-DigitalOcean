import { create } from 'zustand';

interface SidebarState {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  toggleCollapse: () => void;
  setCollapsed: (collapsed: boolean) => void;
  toggleMobile: () => void;
  setMobileOpen: (open: boolean) => void;
  collapsedSections: Record<string, boolean>;
  toggleSection: (title: string) => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isCollapsed: false,
  isMobileOpen: false,
  toggleCollapse: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
  setCollapsed: (collapsed: boolean) => set({ isCollapsed: collapsed }),
  toggleMobile: () => set((state) => ({ isMobileOpen: !state.isMobileOpen })),
  setMobileOpen: (open: boolean) => set({ isMobileOpen: open }),
  collapsedSections: {},
  toggleSection: (title: string) =>
    set((state) => ({
      collapsedSections: {
        ...state.collapsedSections,
        [title]: !state.collapsedSections[title],
      },
    })),
}));

