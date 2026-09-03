import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TriggerLab } from './store.svelte';
import type { WSClient } from '../ws/client';
import type { ClientMessage } from '../ws/protocol-types';

/* U4 — sections as flat graph lists, the merged active section, and hit-resolution off the
   active section's source-matched graphs. The store seeds one song whose sections each hold
   EVERY pad's graph key; each pad graph carries a `drum` source from its padKey (hydrate),
   so a hit fires only the matching pad's graph — the pre-section per-zone behaviour, now
   expressed as a flat list + source filter. */

class MemStorage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

const fakeClient = (): WSClient => ({ on() {}, connect() {}, close() {}, send() {} }) as unknown as WSClient;
const capturing = (sent: ClientMessage[]): (() => WSClient) =>
  () =>
    ({ on() {}, connect() {}, close() {}, send(m: ClientMessage) { sent.push(m); } }) as unknown as WSClient;

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = new MemStorage() as unknown as Storage;
});
afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

const kickCentre = (store: TriggerLab) => store.pads.find((p) => p.drumId === 'kick' && p.zone === 0)!;

describe('seed: sections are flat graph lists of every pad', () => {
  it('every section lists every pad graph key (and defaults the first section active)', () => {
    const store = new TriggerLab(fakeClient);
    const padKeys = store.pads.map((p) => `${p.drumId}:${p.zone}`);
    expect(store.activeSong!.sections.length).toBeGreaterThan(0);
    for (const sec of store.activeSong!.sections) expect(sec.graphs).toEqual(padKeys);
    expect(store.activeSectionId).toBe(store.activeSong!.sections[0]!.id);
    expect(store.activeSection?.id).toBe(store.activeSectionId);
  });
});

describe('setActiveSection / selectGraphInSection (merged active+arrange)', () => {
  it('setActiveSection sets the active section id', () => {
    const store = new TriggerLab(fakeClient);
    const id = store.activeSong!.sections[1]!.id;
    store.setActiveSection(id);
    expect(store.activeSectionId).toBe(id);
  });

  it('selectGraphInSection activates the section AND opens the graph (highlight)', () => {
    const store = new TriggerLab(fakeClient);
    const id = store.activeSong!.sections[1]!.id;
    const key = store.activeSong!.sections[1]!.graphs[0]!;
    store.selectGraphInSection(id, key);
    expect(store.activeSectionId).toBe(id); // section made active
    expect(store.selectedPadKey).toBe(key); // graph opened in the canvas
  });

  it('selectGraphInSection ignores an unknown graph key but still activates the section', () => {
    const store = new TriggerLab(fakeClient);
    const id = store.activeSong!.sections[1]!.id;
    store.selectGraphInSection(id, 'no-such-graph');
    expect(store.activeSectionId).toBe(id);
    expect(store.selectedPadKey).not.toBe('no-such-graph');
  });
});

describe('section graph-list mutators', () => {
  it('addGraphToSection appends (idempotent) + removeGraphFromSection removes', () => {
    const store = new TriggerLab(fakeClient);
    const key = store.createGraph('Authored'); // an authored graph, not yet in any section
    const id = store.activeSong!.sections[0]!.id;
    store.addGraphToSection(id, key);
    expect(store.activeSong!.sections[0]!.graphs).toContain(key);
    store.addGraphToSection(id, key); // idempotent — no duplicate
    expect(store.activeSong!.sections[0]!.graphs.filter((k) => k === key)).toHaveLength(1);
    store.removeGraphFromSection(id, key);
    expect(store.activeSong!.sections[0]!.graphs).not.toContain(key);
  });

  it('moveSection reorders sections in the active song', () => {
    const store = new TriggerLab(fakeClient);
    const ids = store.activeSong!.sections.map((s) => s.id);
    store.moveSection(ids[0]!, 2);
    expect(store.activeSong!.sections.map((s) => s.id)).toEqual([ids[1], ids[0], ids[2], ...ids.slice(3)]);
  });

  it('moveGraphPlacement reorders a graph inside one section', () => {
    const store = new TriggerLab(fakeClient);
    const section = store.activeSong!.sections[0]!;
    const [first, second, third] = section.graphs;
    store.moveGraphPlacement(section.id, first!, section.id, 2);
    expect(store.activeSong!.sections[0]!.graphs.slice(0, 3)).toEqual([second, first, third]);
  });

  it('moveGraphPlacement moves a graph between sections', () => {
    const store = new TriggerLab(fakeClient);
    const from = store.activeSong!.sections[0]!;
    const to = store.activeSong!.sections[1]!;
    const graph = from.graphs[0]!;
    store.removeGraphFromSection(to.id, graph);
    store.moveGraphPlacement(from.id, graph, to.id, 0);
    expect(store.activeSong!.sections[0]!.graphs).not.toContain(graph);
    expect(store.activeSong!.sections[1]!.graphs[0]).toBe(graph);
  });
});

describe('copy / paste section (clipboard)', () => {
  it('paste appends an independent clone (fresh id, "<name> copy") and activates it', () => {
    const store = new TriggerLab(fakeClient);
    const src = store.activeSong!.sections[0]!;
    const before = store.activeSong!.sections.length;

    store.copySection(src.id);
    expect(store.sectionClipboard).not.toBeNull();
    store.pasteSection();

    const sections = store.activeSong!.sections;
    expect(sections).toHaveLength(before + 1);
    const pasted = sections[sections.length - 1]!;
    expect(pasted.id).not.toBe(src.id); // fresh id
    expect(pasted.name).toBe(`${src.name} copy`);
    expect(pasted.graphs).toEqual(src.graphs); // same graph references (reuse), copied list
    expect(store.activeSectionId).toBe(pasted.id); // the new section is now active
  });

  it('the pasted section is independent — editing one does not touch the other', () => {
    const store = new TriggerLab(fakeClient);
    const src = store.activeSong!.sections[0]!;
    const key = src.graphs[0]!;
    store.duplicateSection(src.id);
    const pasted = store.activeSong!.sections.at(-1)!;

    // remove a graph from the COPY → the original section keeps it
    store.removeGraphFromSection(pasted.id, key);
    expect(store.activeSong!.sections.find((s) => s.id === pasted.id)!.graphs).not.toContain(key);
    expect(store.activeSong!.sections.find((s) => s.id === src.id)!.graphs).toContain(key);
  });

  it('the clipboard is a snapshot — editing the source after copy does not change a later paste', () => {
    const store = new TriggerLab(fakeClient);
    const src = store.activeSong!.sections[0]!;
    const key = src.graphs[0]!;
    store.copySection(src.id);
    store.removeGraphFromSection(src.id, key); // mutate the source AFTER copying
    store.pasteSection();
    expect(store.activeSong!.sections.at(-1)!.graphs).toContain(key); // paste reflects copy-time list
  });

  it('paste with an empty clipboard is a no-op', () => {
    const store = new TriggerLab(fakeClient);
    const before = store.activeSong!.sections.length;
    expect(store.sectionClipboard).toBeNull();
    store.pasteSection();
    expect(store.activeSong!.sections).toHaveLength(before); // nothing added
  });

  it('copySection ignores an id that is not a section of the active song', () => {
    const store = new TriggerLab(fakeClient);
    store.copySection('no-such-section');
    expect(store.sectionClipboard).toBeNull();
  });
});

describe('hit resolution = active section graphs whose drum source matches the pad', () => {
  it('fires only the matching pad graph (each zone fires its own)', () => {
    const store = new TriggerLab(fakeClient);
    store.hit(kickCentre(store));
    expect(store.log).toHaveLength(1); // exactly one graph fired
    expect(store.log[0]!.pad).toBe(store.graphLabel('kick:0'));
  });

  it('fires nothing when the active section has no graph matching the pad', () => {
    const store = new TriggerLab(fakeClient);
    store.removeGraphFromSection(store.activeSectionId!, 'kick:0');
    store.hit(kickCentre(store));
    expect(store.log).toHaveLength(0); // the section gates resolution — no fallback while active
  });

  it('layers two section graphs that share a source (both fire on the hit)', () => {
    const store = new TriggerLab(fakeClient);
    // an authored graph bound to the SAME drum source as kick:0 → layered onto kick centre
    const layer = store.createGraph('Kick layer');
    store.setTriggerSource(layer, { kind: 'drum', drumId: 'kick', zone: '0' });
    store.addGraphToSection(store.activeSectionId!, layer);
    store.hit(kickCentre(store));
    expect(store.log).toHaveLength(2); // kick:0 + the layered graph
    expect(store.log.map((l) => l.pad)).toEqual(
      expect.arrayContaining([store.graphLabel('kick:0'), 'Kick layer']),
    );
  });

  it('falls back to the pad’s own graph when there is NO active section (pre-section behaviour)', () => {
    const store = new TriggerLab(fakeClient);
    store.activeSectionId = null;
    store.hit(kickCentre(store));
    expect(store.log).toHaveLength(1);
    expect(store.log[0]!.pad).toBe('Kick · center');
  });
});

describe('keyboard graph firing', () => {
  it('connected: sends the fireGraph intent for a MIDI-sourced section graph — not a synthetic {t:midi} (S13)', () => {
    const sent: ClientMessage[] = [];
    const store = new TriggerLab(capturing(sent));
    const key = store.createGraph('Midi graph');
    store.setTriggerSource(key, { kind: 'midi', note: 36 });
    store.addGraphToSection(store.activeSectionId!, key);
    store.link = 'open';

    const index = store.activeSection!.graphs.indexOf(key);
    store.fireSectionGraph(index);

    // S13: the server fires the EXACT graph by key. We no longer forward a synthetic {t:'midi'}
    // (which the server re-resolved AND echoed back → the old keyboard triple-fire); the sim
    // stays silent locally.
    expect(sent).toContainEqual({ t: 'fireGraph', graphKey: key, velocity: store.velocity });
    expect(sent.some((m) => m.t === 'midi')).toBe(false);
    expect(store.localPreviewActive).toBe(false);
  });

  it('a connected keyboard graph fire stays server-authoritative and never previews the local sim (S12)', () => {
    const store = new TriggerLab(fakeClient);
    const key = store.createGraph('Midi graph');
    store.setTriggerSource(key, { kind: 'midi', note: 36 });
    store.addGraphToSection(store.activeSectionId!, key);
    store.link = 'open';
    store.serverModel = store.labModel.model;
    store.serverFrame = new Uint8Array(store.frameBuf.length);

    expect(store.useServer).toBe(true);
    store.fireSectionGraph(store.activeSection!.graphs.indexOf(key));

    // S12 authority principle: connected, the sim never fires — no local preview flash, and the
    // visualiser keeps rendering the server's frames.
    expect(store.localPreviewActive).toBe(false);
    expect(store.useServer).toBe(true);
    expect(store.previewFrame).toBe(store.serverFrame);
  });
});

describe('rename / delete section', () => {
  it('renameSection relabels the section (no-op-safe on an unknown id)', () => {
    const store = new TriggerLab(fakeClient);
    const id = store.activeSong!.sections[0]!.id;
    store.renameSection(id, 'Big Chorus');
    expect(store.activeSong!.sections.find((s) => s.id === id)!.name).toBe('Big Chorus');

    const names = store.activeSong!.sections.map((s) => s.name);
    store.renameSection('no-such-section', 'X'); // no-op
    expect(store.activeSong!.sections.map((s) => s.name)).toEqual(names);
  });

  it('removeSection drops the section (no-op-safe on an unknown id)', () => {
    const store = new TriggerLab(fakeClient);
    const before = store.activeSong!.sections.length;
    const id = store.activeSong!.sections[1]!.id; // a non-active section
    store.removeSection(id);
    expect(store.activeSong!.sections.map((s) => s.id)).not.toContain(id);
    expect(store.activeSong!.sections).toHaveLength(before - 1);

    const after = store.activeSong!.sections.length;
    store.removeSection('no-such-section'); // no-op
    expect(store.activeSong!.sections).toHaveLength(after);
  });

  it('deleting the active section re-points activeSectionId to its left neighbour', () => {
    const store = new TriggerLab(fakeClient);
    store.addSongSection('A');
    const a = store.activeSectionId!;
    store.addSongSection('B');
    const b = store.activeSectionId!;
    store.addSongSection('C'); // a, b, c are consecutive at the tail
    store.setActiveSection(b);
    store.removeSection(b);
    expect(store.activeSectionId).toBe(a); // moved one to the left
  });

  it('deleting the active FIRST section re-points to the new first', () => {
    const store = new TriggerLab(fakeClient);
    const first = store.activeSong!.sections[0]!.id;
    const second = store.activeSong!.sections[1]!.id;
    store.setActiveSection(first);
    store.removeSection(first);
    expect(store.activeSectionId).toBe(second); // the new first section
  });

  it('clears activeSectionId once the last section is removed', () => {
    const store = new TriggerLab(fakeClient);
    for (const s of [...store.activeSong!.sections]) store.removeSection(s.id);
    expect(store.activeSong!.sections).toHaveLength(0);
    expect(store.activeSectionId).toBeNull();
  });

  it('persists a rename + delete across a reload (autosave → hydrate)', () => {
    // Drive the real autosave: start() registers the persist $effect; a no-op RAF keeps the
    // render loop from running in node. stop() flushes the serialized authored slice to
    // localStorage synchronously. Constructing a fresh store = a reload (it hydrates).
    const raf = globalThis.requestAnimationFrame;
    const caf = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
    try {
      const store = new TriggerLab(fakeClient);
      store.start();
      store.addSongSection('Victim'); // a guaranteed extra section, now active
      const victim = store.activeSectionId!;
      const keep = store.activeSong!.sections[0]!.id;
      store.renameSection(keep, 'Persisted');
      store.removeSection(victim);
      store.stop(); // flush authored → localStorage

      const reloaded = new TriggerLab(fakeClient);
      expect(reloaded.activeSong!.sections.find((s) => s.id === keep)!.name).toBe('Persisted');
      expect(reloaded.activeSong!.sections.map((s) => s.id)).not.toContain(victim);
    } finally {
      globalThis.requestAnimationFrame = raf;
      globalThis.cancelAnimationFrame = caf;
    }
  });
});

/* Sections exist so the same drum zone can light differently as the song moves — and until
   this, they could not: every section referenced the same graph KEY, so a node edited in the
   Verse changed in the Chorus with it. The copy is made on the first EDIT rather than when a
   section is created, so an untouched show still shows one row per pad in the pickers. */
describe('a section owns the graph it edits (copy-on-write)', () => {
  /** Open `key` for editing inside `sectionId`, then move a node in it. */
  function editNodeIn(store: TriggerLab, sectionId: string, key: string, x: number): void {
    store.setActiveSection(sectionId);
    store.selectedPadKey = key;
    const node = store.graphs[key]!.nodes[0]!;
    store.moveNode(node, x, 0);
  }

  it('editing a shared graph in one section leaves the other sections alone', () => {
    const store = new TriggerLab(fakeClient);
    const [verse, chorus] = store.activeSong!.sections;
    const key = verse!.graphs[0]!;
    expect(chorus!.graphs[0], 'the seed shares one key across sections').toBe(key);

    editNodeIn(store, verse!.id, key, 999);

    const chorusKey = store.activeSong!.sections[1]!.graphs[0]!;
    expect(chorusKey, 'the chorus moved onto its own copy').not.toBe(key);
    expect(store.graphs[chorusKey]!.nodes[0]!.x, 'and did not take the edit').not.toBe(999);
  });

  it('the edit lands where the author is looking', () => {
    // The fork hands the COPY to the other sections and keeps the editor on the original,
    // because the mutation in flight already holds a reference into that graph object.
    const store = new TriggerLab(fakeClient);
    const [verse] = store.activeSong!.sections;
    const key = verse!.graphs[0]!;

    editNodeIn(store, verse!.id, key, 999);

    expect(store.activeSong!.sections[0]!.graphs[0], 'the editing section keeps the key').toBe(key);
    expect(store.graphs[key]!.nodes[0]!.x).toBe(999);
  });

  it('each section diverges on its own first edit, and later edits stay put', () => {
    const store = new TriggerLab(fakeClient);
    const sections = store.activeSong!.sections;
    const key = sections[0]!.graphs[0]!;

    editNodeIn(store, sections[0]!.id, key, 111);
    const chorusKey = store.activeSong!.sections[1]!.graphs[0]!;
    editNodeIn(store, sections[1]!.id, chorusKey, 222);

    const after = store.activeSong!.sections;
    expect(store.graphs[after[0]!.graphs[0]!]!.nodes[0]!.x).toBe(111);
    expect(store.graphs[after[1]!.graphs[0]!]!.nodes[0]!.x).toBe(222);
    expect(after[0]!.graphs[0], 'two sections, two graphs').not.toBe(after[1]!.graphs[0]);
  });

  it('mints no copies until something is actually edited', () => {
    // Eager forking would fill the Objects view and both pickers with identical rows.
    const store = new TriggerLab(fakeClient);
    const before = Object.keys(store.graphs).length;
    store.setActiveSection(store.activeSong!.sections[1]!.id);
    store.selectedPadKey = store.activeSong!.sections[1]!.graphs[0]!;
    expect(Object.keys(store.graphs).length, 'selecting a graph copies nothing').toBe(before);
  });

  it('the copy keeps the source label, so no raw key shows in the picker', () => {
    const store = new TriggerLab(fakeClient);
    const sections = store.activeSong!.sections;
    const key = sections[0]!.graphs[0]!;
    const label = store.graphLabel(key);

    editNodeIn(store, sections[0]!.id, key, 999);

    const chorusKey = store.activeSong!.sections[1]!.graphs[0]!;
    expect(store.graphLabel(chorusKey)).toBe(label);
  });
});
