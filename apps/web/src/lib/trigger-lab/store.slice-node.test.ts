import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TriggerLab } from './store.svelte';
import type { GraphNode } from './sim';
import type { WSClient } from '../ws/client';

/* Store-level coverage for the Slice node. Slice shares every store action with Splice, and the
   failure worth guarding against is the one that hit Splice THREE times: an action that lists the
   kinds it accepts, silently does nothing for a kind it forgot, and leaves an inspector control
   that looks live but is not. So the core of this file is one test per shared action, asserting
   the edit actually lands on a slice node. */

class MemStorage {
  private m = new Map<string, string>();
  get length(): number { return this.m.size; }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  removeItem(k: string): void { this.m.delete(k); }
  clear(): void { this.m.clear(); }
}

const fakeClient = (): WSClient => ({ on() {}, connect() {}, close() {}, send() {} }) as unknown as WSClient;

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = new MemStorage() as unknown as Storage;
});
afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

function withSlice(): { store: TriggerLab; node: GraphNode } {
  const store = new TriggerLab(fakeClient);
  store.createGraph('test');
  const node = store.addNode('slice', 200, 0)!;
  return { store, node };
}

describe('addNode("slice")', () => {
  it('seeds four distinct colour slices along X, fully velocity sensitive', () => {
    const { node } = withSlice();
    expect(node.kind).toBe('slice');
    expect(node.spliceCount).toBe(4);
    expect(new Set((node.splices ?? []).map((s) => s.color)).size).toBe(4);
    expect(node.sliceAxis).toBe('x');
    expect(node.sliceVelocity).toBe(1);
  });

  it('carries no splice partition — a slice has none', () => {
    expect(withSlice().node.splicePartition).toBeUndefined();
  });

  it('auto-wires to the Output anchor, like a Splice', () => {
    const { store, node } = withSlice();
    const graph = store.selectedGraph!;
    const output = graph.nodes.find((n) => n.kind === 'output')!;
    expect(graph.edges.some((e) => e.from === node.id && e.to === output.id)).toBe(true);
  });
});

describe('every shared action lands on a slice (the kind-guard trap)', () => {
  it('setSpliceSetting — including the slice-only fields', () => {
    const { store, node } = withSlice();
    store.setSpliceSetting(node, { spliceChase: 'smooth', sliceAxis: 'z', sliceRotY: 30, sliceVelocity: 0.4 });
    expect(node.spliceChase).toBe('smooth');
    expect(node.sliceAxis).toBe('z');
    expect(node.sliceRotY).toBe(30);
    expect(node.sliceVelocity).toBe(0.4);
  });

  it('setSpliceCount', () => {
    const { store, node } = withSlice();
    store.setSpliceCount(node, 6);
    expect(node.spliceCount).toBe(6);
    expect(node.splices).toHaveLength(6);
  });

  it('setSpliceAt / addSplice / removeSplice', () => {
    const { store, node } = withSlice();
    store.setSpliceAt(node, 0, { color: '#123456' });
    expect(node.splices?.[0]?.color).toBe('#123456');
    store.addSplice(node);
    expect(node.splices).toHaveLength(5);
    store.removeSplice(node, 0);
    expect(node.splices).toHaveLength(4);
  });

  it('setMode — Loop reaches a slice', () => {
    const { store, node } = withSlice();
    store.setMode(node, 'loop');
    expect(node.mode).toBe('loop');
  });

  it('setBus / busOf — the layer picker reaches a slice', () => {
    const { store, node } = withSlice();
    const other = store.buses.find((b) => b.id !== store.busOf(node))!;
    store.setBus(node, other.id);
    expect(store.busOf(node)).toBe(other.id);
  });

  it('setTargetId — the drum picker reaches a slice', () => {
    const { store, node } = withSlice();
    store.setSliceOn(node, 'drum');
    const drum = store.kitDrumInfos[0]!.id;
    store.setTargetId(node, drum);
    expect(node.targetId).toBe(drum);
  });
});

describe('MOVE THROUGH sequences reach the store', () => {
  it('a dragged drum and hoop order land on a splice and a slice alike', () => {
    const { store, node: slice } = withSlice();
    store.setSpliceSetting(slice, { spliceDrumSequence: ['snare', 'kick'] });
    expect(slice.spliceDrumSequence).toEqual(['snare', 'kick']);

    const splice = store.addNode('splice', 400, 0)!;
    store.setSpliceSetting(splice, { spliceDrumSequence: ['snare', 'kick'], spliceHoopSequence: [3, 1, 2] });
    expect(splice.spliceHoopSequence).toEqual([3, 1, 2]);
    store.setSpliceSetting(splice, { spliceDrumOrder: 'down', spliceDrumSequence: undefined });
    expect(splice.spliceDrumSequence, 'a pattern clears the dragged order').toBeUndefined();
  });
});

describe('setSliceOn — KIT / DRUM / SPACE', () => {
  it('SPACE adds a region the size of the kit, so nothing visibly changes on the first frame', () => {
    const { store, node } = withSlice();
    store.setSliceOn(node, 'space');
    const { min, max } = store.labModel.pm.bounds;
    expect(node.scope).toBe('kit');
    expect(node.sliceRegion).toBeDefined();
    expect(node.sliceRegion!.sx).toBe(Math.max(1, Math.round(max.x - min.x)));
    expect(node.sliceRegion!.cx).toBe(Math.round((min.x + max.x) / 2));
  });

  it('DRUM clears the region and scopes to a drum', () => {
    const { store, node } = withSlice();
    store.setSliceOn(node, 'space');
    store.setSliceOn(node, 'drum');
    expect(node.sliceRegion).toBeUndefined();
    expect(node.scope).toBe('drum');
  });

  it('KIT clears the region and any drum target', () => {
    const { store, node } = withSlice();
    store.setSliceOn(node, 'drum');
    store.setTargetId(node, store.kitDrumInfos[0]!.id);
    store.setSliceOn(node, 'kit');
    expect(node.scope).toBe('kit');
    expect(node.targetId).toBeUndefined();
    expect(node.sliceRegion).toBeUndefined();
  });

  it('is ONE undo step, even though it changes two fields', () => {
    const { store, node } = withSlice();
    store.setSliceOn(node, 'space');
    store.undo();
    const restored = store.selectedGraph!.nodes.find((n) => n.id === node.id)!;
    expect(restored.sliceRegion).toBeUndefined();
    expect(restored.scope).toBe('kit');
  });

  it('does nothing to a splice — SPACE is a slice-only idea', () => {
    const store = new TriggerLab(fakeClient);
    store.createGraph('test');
    const splice = store.addNode('splice', 200, 0)!;
    store.setSliceOn(splice, 'space');
    expect(splice.sliceRegion).toBeUndefined();
  });
});
