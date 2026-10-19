import { create } from 'zustand';
import type { ProjectVisibility } from '../services/projectService';

interface CurrentProject {
  id: string;
  slug: string;
  ownerUsername: string;
  isPublic: boolean;
  // Phase 1 D1.3 — three-level visibility. Kept in sync with isPublic
  // (which legacy callers still read) by setVisibility().
  visibility?: ProjectVisibility;
}

interface ProjectState {
  currentProject: CurrentProject | null;
  /**
   * Gallery example currently loaded in the editor (null when the workspace
   * came from a project, a file or scratch). Set by loadExample, cleared
   * whenever a project takes over — analytics only: compiles/runs stamp it
   * so "which examples get compiled most" is answerable.
   */
  currentExampleId: string | null;
  setCurrentProject: (project: CurrentProject) => void;
  setProjectName: (name: string) => void;
  clearCurrentProject: () => void;
  setCurrentExampleId: (id: string | null) => void;
  // Updated to accept either the legacy boolean OR the new enum so the
  // ShareModal callsite and any older callers keep working uniformly.
  setVisibility: (next: boolean | ProjectVisibility) => void;
}

const getInitialProject = (): CurrentProject | null => {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('mcu_maker_project_name') : null;
    if (saved && saved.trim()) {
      return {
        id: 'local-default',
        slug: saved.trim(),
        ownerUsername: 'local',
        isPublic: false,
        visibility: 'private',
      };
    }
  } catch {
    // ignore
  }
  return null;
};

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: getInitialProject(),
  currentExampleId: null,
  // Loading a real project supersedes the example context.
  setCurrentProject: (project) => {
    try {
      if (typeof window !== 'undefined') localStorage.setItem('mcu_maker_project_name', project.slug);
    } catch {
      // ignore
    }
    set({ currentProject: project, currentExampleId: null });
  },
  setProjectName: (name) =>
    set((s) => {
      const trimmed = name.trim();
      if (!trimmed) return s;
      try {
        if (typeof window !== 'undefined') localStorage.setItem('mcu_maker_project_name', trimmed);
      } catch {
        // ignore
      }
      if (s.currentProject) {
        return {
          currentProject: { ...s.currentProject, slug: trimmed },
        };
      }
      return {
        currentProject: {
          id: 'local-' + Date.now(),
          slug: trimmed,
          ownerUsername: 'local',
          isPublic: false,
          visibility: 'private',
        },
      };
    }),
  // Also drops the example context: every caller (new project, blank
  // workspace, logout cleanup) means "this workspace is no longer that".
  // loadExample re-stamps its id right after calling this.
  clearCurrentProject: () => {
    try {
      if (typeof window !== 'undefined') localStorage.removeItem('mcu_maker_project_name');
    } catch {
      // ignore
    }
    set({ currentProject: null, currentExampleId: null });
  },
  setCurrentExampleId: (id) => set({ currentExampleId: id }),
  setVisibility: (next) =>
    set((s) => {
      if (!s.currentProject) return s;
      // Translate boolean → enum and vice versa so both fields are
      // always coherent.
      let isPublic: boolean;
      let visibility: ProjectVisibility;
      if (typeof next === 'boolean') {
        isPublic = next;
        visibility = next ? 'public' : 'private';
      } else {
        visibility = next;
        isPublic = next === 'public';
      }
      return {
        currentProject: { ...s.currentProject, isPublic, visibility },
      };
    }),
}));
