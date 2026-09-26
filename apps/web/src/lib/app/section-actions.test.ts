import { describe, expect, it, vi } from 'vitest';
import type { TriggerLab } from '../trigger-lab/store.svelte';
import { sectionActions } from './section-actions';

/* The section menu's file verb: "Load graph from file…" adds a saved graph to THIS section, and is
   off whenever the section's song can't be edited — the same gate as every other section verb. */

const stubStore = (canEdit: boolean) =>
  ({
    activeSongById: { sections: [{ id: 's1' }, { id: 's2' }] },
    canEditActiveSong: canEdit,
    loadGraphFileIntoSection: vi.fn(async () => null),
  }) as unknown as TriggerLab;

describe('sectionActions — Load graph from file', () => {
  it('loads a graph file into this section', () => {
    const store = stubStore(true);
    const load = sectionActions(store, 's2', () => {}).find((action) => action.label === 'Load graph from file…')!;
    expect(load.disabled).toBe(false);
    load.onSelect();
    expect(store.loadGraphFileIntoSection).toHaveBeenCalledWith('s2');
  });

  it('is disabled when the song is read-only', () => {
    const load = sectionActions(stubStore(false), 's1', () => {}).find((action) => action.label === 'Load graph from file…')!;
    expect(load.disabled).toBe(true);
  });
});
