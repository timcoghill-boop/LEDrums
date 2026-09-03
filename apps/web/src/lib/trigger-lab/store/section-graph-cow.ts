/** Section-owned graphs, on first edit — the pass that stops one section's edits landing in
 * another.
 *
 * `SetlistSection.graphs` holds KEYS into the one show-wide `graphs` map, so two sections
 * naming the same key edit the same object: change a node in the Verse and the Chorus changes
 * with it. That is what a reference means, and it is right for a SONG (`cloneSongGraphs`
 * already forks at that boundary) but wrong for a section — sections exist so the same drum
 * zone can light differently as the song moves.
 *
 * Copy on WRITE rather than on section creation, because eager copies are not free to look at:
 * a fresh show has a graph per pad per section, and the Objects view and both graph pickers
 * would list four identical "Kick · Rim tip" rows before the author had done anything.
 *
 * The copy goes to the OTHER sections, and the editing section keeps the original key. That
 * direction is not a detail: a node edit is `Object.assign(node, patch)` on an object the
 * caller already holds, so handing the editor a fresh clone would send the edit into the
 * abandoned original. The other sections take one copy BETWEEN them — their sharing dissolves
 * the same way, when one of them is edited in turn.
 */
import type { Song } from '../../app/setlist';
import type { TriggerGraph } from '../sim';

export interface ForkResult {
  songs: Song[];
  graphs: Record<string, TriggerGraph>;
  graphNames: Record<string, string>;
  /** The key the other sections were moved onto, or null when nothing was shared. */
  forkedTo: string | null;
}

/**
 * Give every section OTHER than `activeSectionId` its own copy of `key`, leaving the active
 * section on the original.
 *
 * A no-op — returning the same object references, so it can sit on the edit path without
 * churning reactivity — when the key is referenced by at most one section, is unknown, or the
 * active section does not reference it at all.
 */
export function forkGraphForActiveSection(
  songs: readonly Song[],
  graphs: Record<string, TriggerGraph>,
  graphNames: Record<string, string>,
  activeSectionId: string | null,
  key: string,
  mintKey: () => string,
  labelOf: (key: string) => string,
  /** Deep-copy one graph. Injected because the store's graphs are rune proxies and must be
      snapshotted before they can be structured-cloned; this module stays free of runes. */
  copyGraph: (graph: TriggerGraph) => TriggerGraph,
): ForkResult {
  const unchanged: ForkResult = { songs: songs as Song[], graphs, graphNames, forkedTo: null };
  const src = graphs[key];
  if (!src || !activeSectionId) return unchanged;

  let holders = 0;
  let activeHolds = false;
  for (const song of songs) {
    for (const sec of song.sections) {
      if (!sec.graphs.includes(key)) continue;
      holders += 1;
      if (sec.id === activeSectionId) activeHolds = true;
    }
  }
  // Not shared, or shared between sections none of which is the one being edited: leave it.
  // The second case matters — an edit to a graph this section does not list must not silently
  // re-point sections the author is not looking at.
  if (holders < 2 || !activeHolds) return unchanged;

  const copyKey = mintKey();
  const nextSongs = songs.map((song) => ({
    ...song,
    sections: song.sections.map((sec) =>
      sec.id === activeSectionId || !sec.graphs.includes(key)
        ? sec
        : { ...sec, graphs: sec.graphs.map((k) => (k === key ? copyKey : k)) },
    ),
  }));
  return {
    songs: nextSongs,
    graphs: { ...graphs, [copyKey]: copyGraph(src) },
    // The copy carries the source's LABEL, not "<name> copy": it is the same graph as far as
    // the author is concerned, just the other sections' version of it. The section name is
    // what says which one you are looking at.
    graphNames: { ...graphNames, [copyKey]: labelOf(key) },
    forkedTo: copyKey,
  };
}
