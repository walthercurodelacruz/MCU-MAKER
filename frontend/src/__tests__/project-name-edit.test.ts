import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../store/useProjectStore';

describe('useProjectStore — project name editing', () => {
  beforeEach(() => {
    useProjectStore.getState().clearCurrentProject();
  });

  it('initializes with null currentProject when cleared', () => {
    expect(useProjectStore.getState().currentProject).toBeNull();
  });

  it('updates project name on a null project and initializes it', () => {
    useProjectStore.getState().setProjectName('Mi Circuito ESP32');
    const proj = useProjectStore.getState().currentProject;
    expect(proj).not.toBeNull();
    expect(proj?.slug).toBe('Mi Circuito ESP32');
  });

  it('updates project slug on an existing project', () => {
    useProjectStore.getState().setCurrentProject({
      id: 'proj-123',
      slug: 'Proyecto Inicial',
      ownerUsername: 'walther',
      isPublic: false,
    });
    expect(useProjectStore.getState().currentProject?.slug).toBe('Proyecto Inicial');

    useProjectStore.getState().setProjectName('Proyecto Actualizado');
    expect(useProjectStore.getState().currentProject?.slug).toBe('Proyecto Actualizado');
    expect(useProjectStore.getState().currentProject?.id).toBe('proj-123');
  });

  it('ignores empty or whitespace-only names', () => {
    useProjectStore.getState().setProjectName('Test Project');
    useProjectStore.getState().setProjectName('   ');
    expect(useProjectStore.getState().currentProject?.slug).toBe('Test Project');
  });

  it('trims leading and trailing spaces', () => {
    useProjectStore.getState().setProjectName('   ESP32 Robot   ');
    expect(useProjectStore.getState().currentProject?.slug).toBe('ESP32 Robot');
  });
});
