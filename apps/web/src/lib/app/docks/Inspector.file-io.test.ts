// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { TriggerLab } from '../../trigger-lab/store.svelte';
import { ShellStore } from '../shell-store.svelte';
import type { WSClient } from '../../ws/client';
import Inspector from './Inspector.svelte';

/* The inspector's Save / Load node buttons: present on every node you can move between graphs,
   absent on the graph anchors, named after the node, and — when a loaded file lands as a NEW node
   (a different kind) — the selection follows it. What a save / load does to the show is pinned in
   store.file-io.test.ts. */

class MemStorage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
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

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = new MemStorage() as unknown as Storage;
});
afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
  vi.restoreAllMocks();
});

function setup(kind: 'splice' | 'effect' | 'lfo') {
  const store = new TriggerLab(fakeClient);
  const shell = new ShellStore();
  const node = store.addNode(kind, 200, 0)!;
  shell.select({ kind: 'node', nodeId: node.id });
  return { store, shell, node, view: render(Inspector, { props: { store, shell } }) };
}

describe('Inspector — Save / Load node', () => {
  it('offers Save and Load on a node, naming the file after it', () => {
    const { store, node, view } = setup('splice');
    const saveNode = vi.spyOn(store, 'saveNodeToFile').mockResolvedValue('saved');
    view.getByRole('button', { name: 'Save node to file' }).click();
    expect(saveNode).toHaveBeenCalledWith(expect.objectContaining({ id: node.id }), 'Splice');
    expect(view.getByRole('button', { name: 'Load node from file' })).toBeTruthy();
  });

  it('names an Effect node’s file after its effect', () => {
    const { store, node, view } = setup('effect');
    const saveNode = vi.spyOn(store, 'saveNodeToFile').mockResolvedValue('saved');
    view.getByRole('button', { name: 'Save node to file' }).click();
    expect(saveNode).toHaveBeenCalledWith(expect.anything(), store.effectOf(store.selectedGraph!.nodes.find((n) => n.id === node.id)!)!.name);
  });

  it('has them on a modulation source too', () => {
    const { view } = setup('lfo');
    expect(view.getByRole('button', { name: 'Save node to file' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Load node from file' })).toBeTruthy();
  });

  it('follows the selection to a node that a load ADDED', async () => {
    const { store, shell, view } = setup('splice');
    vi.spyOn(store, 'loadNodeFromFile').mockResolvedValue({ ok: true, message: 'added', nodeId: 'n-new' });
    view.getByRole('button', { name: 'Load node from file' }).click();
    await vi.waitFor(() => expect(shell.selection).toEqual({ kind: 'node', nodeId: 'n-new' }));
  });

  it('keeps the selection when the load replaced this node in place', async () => {
    const { store, shell, node, view } = setup('splice');
    vi.spyOn(store, 'loadNodeFromFile').mockResolvedValue({ ok: true, message: 'loaded', nodeId: node.id });
    view.getByRole('button', { name: 'Load node from file' }).click();
    await Promise.resolve();
    expect(shell.selection).toEqual({ kind: 'node', nodeId: node.id });
  });

  it('has neither on the trigger anchor', () => {
    const store = new TriggerLab(fakeClient);
    const shell = new ShellStore();
    shell.select({ kind: 'node', nodeId: store.selectedGraph!.nodes.find((n) => n.kind === 'trigger')!.id });
    const view = render(Inspector, { props: { store, shell } });
    expect(view.queryByRole('button', { name: 'Save node to file' })).toBeNull();
  });
});
