import { describe, expect, it } from 'vitest';
import type { TriggerGraph } from '../sim';
import { makeSection, type Song } from '../../app/setlist';
import { forkGraphForActiveSection } from './section-graph-cow';

/* Sections exist so the same drum zone can light differently as the song moves. They could
   not: every section named the same graph KEY, so one object backed all of them and an edit in
   the Verse landed in the Chorus. These pin the fork — including its DIRECTION, which is the
   part that is easy to get backwards and impossible to see in a diff. */

const graph = (nodeId: string): TriggerGraph =>
  ({ version: 3, nodes: [{ id: nodeId, kind: 'trigger', x: 0, y: 0 }], edges: [] }) as unknown as TriggerGraph;

const song = (id: string, sections: Array<[string, string[]]>): Song => ({
  id,
  name: id,
  sections: sections.map(([sid, keys]) => makeSection(sid, sid, keys)),
});

const mint = (): (() => string) => {
  let n = 0;
  return () => `copy-${++n}`;
};
const labelOf = (key: string): string => `label:${key}`;
const copyGraph = (g: TriggerGraph): TriggerGraph => structuredClone(g);

const fork = (songs: Song[], graphs: Record<string, TriggerGraph>, active: string, key: string, names = {}) =>
  forkGraphForActiveSection(songs, graphs, names, active, key, mint(), labelOf, copyGraph);

describe('forkGraphForActiveSection', () => {
  it('leaves the editing section on the original key and moves the others onto a copy', () => {
    // The direction is the whole point: a node edit mutates an object the caller already holds,
    // so if the editor were handed the clone its edit would land in the abandoned original.
    const songs = [song('s', [['verse', ['kick:3']], ['chorus', ['kick:3']]])];
    const res = fork(songs, { 'kick:3': graph('n1') }, 'verse', 'kick:3');

    expect(res.songs[0]!.sections[0]!.graphs[0], 'the editor keeps the original').toBe('kick:3');
    expect(res.songs[0]!.sections[1]!.graphs[0], 'the other section moves to the copy').toBe(res.forkedTo);
    expect(res.graphs[res.forkedTo!]!.nodes[0]!.id).toBe('n1');
  });

  it('the two sections no longer share an object', () => {
    const songs = [song('s', [['verse', ['kick:3']], ['chorus', ['kick:3']]])];
    const res = fork(songs, { 'kick:3': graph('n1') }, 'verse', 'kick:3');

    res.graphs['kick:3']!.nodes[0]!.id = 'edited-in-verse';
    expect(res.graphs[res.forkedTo!]!.nodes[0]!.id, 'the chorus is untouched').toBe('n1');
  });

  it('the other sections take ONE copy between them, not one each', () => {
    // Their sharing dissolves the same way this one did: when one of them is edited in turn.
    const songs = [song('s', [['a', ['kick:3']], ['b', ['kick:3']], ['c', ['kick:3']]])];
    const res = fork(songs, { 'kick:3': graph('n1') }, 'a', 'kick:3');
    const [, b, c] = res.songs[0]!.sections;
    expect(b!.graphs[0]).toBe(c!.graphs[0]);
    expect(Object.keys(res.graphs).length).toBe(2);
  });

  it('forks across songs as well as within one', () => {
    const songs = [song('one', [['a', ['kick:3']]]), song('two', [['b', ['kick:3']]])];
    const res = fork(songs, { 'kick:3': graph('n1') }, 'a', 'kick:3');
    expect(res.songs[1]!.sections[0]!.graphs[0]).toBe(res.forkedTo);
  });

  it('is identity when only one section holds the key', () => {
    const songs = [song('s', [['a', ['kick:3']], ['b', ['snare:0']]])];
    const graphs = { 'kick:3': graph('n1'), 'snare:0': graph('n2') };
    const res = forkGraphForActiveSection(songs, graphs, {}, 'a', 'kick:3', mint(), labelOf, copyGraph);

    expect(res.forkedTo).toBeNull();
    expect(res.songs).toBe(songs);
    expect(res.graphs).toBe(graphs);
  });

  it('does not re-point sections when the ACTIVE section does not hold the key', () => {
    // Editing a graph the open section does not list must not silently rewrite sections the
    // author is not looking at — the fork is about who is editing, not about who is sharing.
    const songs = [song('s', [['a', ['snare:0']], ['b', ['kick:3']], ['c', ['kick:3']]])];
    const res = fork(songs, { 'kick:3': graph('n1'), 'snare:0': graph('n2') }, 'a', 'kick:3');
    expect(res.forkedTo).toBeNull();
    expect(res.songs).toBe(songs);
  });

  it('is identity for an unknown key or with no active section', () => {
    const songs = [song('s', [['a', ['kick:3']], ['b', ['kick:3']]])];
    const graphs = { 'kick:3': graph('n1') };
    expect(forkGraphForActiveSection(songs, graphs, {}, 'a', 'ghost', mint(), labelOf, copyGraph).forkedTo).toBeNull();
    expect(forkGraphForActiveSection(songs, graphs, {}, null, 'kick:3', mint(), labelOf, copyGraph).forkedTo).toBeNull();
  });

  it('the copy carries the source label, so the picker does not show a raw key', () => {
    const songs = [song('s', [['a', ['kick:3']], ['b', ['kick:3']]])];
    const res = fork(songs, { 'kick:3': graph('n1') }, 'a', 'kick:3');
    expect(res.graphNames[res.forkedTo!]).toBe('label:kick:3');
  });

  it('a section listing several graphs keeps the rest of its list untouched', () => {
    const songs = [song('s', [['a', ['kick:3']], ['b', ['snare:0', 'kick:3', 'tom1:0']]])];
    const res = fork(songs, { 'kick:3': graph('n1'), 'snare:0': graph('n2'), 'tom1:0': graph('n3') }, 'a', 'kick:3');
    expect(res.songs[0]!.sections[1]!.graphs).toEqual(['snare:0', res.forkedTo, 'tom1:0']);
  });
});
