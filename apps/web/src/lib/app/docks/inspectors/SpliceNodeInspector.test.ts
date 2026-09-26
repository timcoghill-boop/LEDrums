// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, within } from '@testing-library/svelte';
import type { GraphNode } from '../../../trigger-lab/sim';
import type { TriggerLab } from '../../../trigger-lab/store.svelte';
import { makeNode } from '../../../trigger-lab/sim';
import SpliceNodeInspector from './SpliceNodeInspector.svelte';

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

const spliceNode = (overrides: Partial<GraphNode> = {}): GraphNode =>
  makeNode('splice', 'splice', 0, 0, {
    spliceChase: 'step',
    splicePartition: 'hoop',
    spliceWaitMode: 'fade',
    spliceOffsetMode: 'time',
    spliceColorOffsetMode: 'time',
    ...overrides,
  });

const stubStore = (): TriggerLab =>
  ({
    effects: [],
    buses: [{ id: 'base', name: 'Base', polyphony: 'mono' }],
    kitDrumInfos: [{ id: 'kick', label: 'Kick', hoopCount: 3 }, { id: 'snare', label: 'Snare', hoopCount: 3 }],
    busOf: () => 'base',
    setScope: vi.fn(),
    setTargetId: vi.fn(),
    setSpliceCount: vi.fn(),
    setSpliceSetting: vi.fn(),
    setBus: vi.fn(),
    setMode: vi.fn(),
    addSplice: vi.fn(),
    setSpliceAt: vi.fn(),
    removeSplice: vi.fn(),
  }) as unknown as TriggerLab;

const renderInspector = (overrides: Partial<GraphNode> = {}, store: TriggerLab = stubStore()) =>
  render(SpliceNodeInspector, { props: { store, node: spliceNode(overrides) } });

/* Tim's layout (2026-09-26): SPLICE sets the cut, MOVE AROUND is how light acts WITHIN it, MOVE
   THROUGH is where light is SENT — through the kit drum to drum, through each drum hoop to hoop,
   around each hoop splice to splice, in any mix. It replaced Trent's earlier pin of the chase names
   (HOOP / DRUM / COLOUR CHASE, MOVE THROUGH MODE, MOVE THROUGH as both heading and direction). */
describe('SpliceNodeInspector — SPLICE, MOVE AROUND, MOVE THROUGH', () => {
  it('has the three driving sections, with the direction back inside MOVE AROUND', () => {
    const { container, getAllByText, getByLabelText } = renderInspector();
    const headings = [...container.querySelectorAll('h4')].map((h) => h.textContent?.trim());
    expect(headings.slice(0, 3)).toEqual(['Splice', 'MOVE AROUND', 'MOVE THROUGH']);
    expect(getAllByText('MOVE THROUGH'), 'only the heading now').toHaveLength(1);
    expect(getByLabelText('Splice direction')).toBeTruthy();
    expect(getByLabelText('Splice move through mode')).toBeTruthy();
    expect(container.textContent).not.toMatch(/HOOP CHASE|DRUM CHASE|COLOUR CHASE|MOVE THROUGH MODE/);
  });

  it('offers all three layers on a kit-wide hoop cut', () => {
    const { getByLabelText } = renderInspector();
    for (const name of ['Through kit division', 'Through drum division', 'Around division']) expect(getByLabelText(name), name).toBeTruthy();
  });

  it('hides AROUND under Lit — arrival is a reveal, and with Lit every splice is already on', () => {
    const { queryByLabelText } = renderInspector({ spliceWaitMode: 'lit' });
    expect(queryByLabelText('Around division')).toBeNull();
  });

  it('a drum cut sends light through the kit and around each drum, with no hoop layer', () => {
    const { getByLabelText, queryByLabelText, getByText } = renderInspector({ splicePartition: 'drum' });
    expect(getByLabelText('Through kit division')).toBeTruthy();
    expect(queryByLabelText('Through drum division')).toBeNull();
    expect(getByText('AROUND DRUM')).toBeTruthy();
  });

  it('a one-drum splice has no kit to send light through; a one-hoop splice has no drum either', () => {
    const drum = renderInspector({ scope: 'drum' });
    expect(within(drum.container).queryByLabelText('Through kit division')).toBeNull();
    expect(within(drum.container).getByLabelText('Through drum division')).toBeTruthy();
    const hoop = renderInspector({ scope: 'hoop' });
    expect(within(hoop.container).queryByLabelText('Through drum division')).toBeNull();
  });

  it('a scope cut is one run — only AROUND is left', () => {
    const { queryByLabelText, getByText } = renderInspector({ splicePartition: 'scope' });
    expect(queryByLabelText('Through kit division')).toBeNull();
    expect(queryByLabelText('Through drum division')).toBeNull();
    expect(getByText('ALONG THE CUT')).toBeTruthy();
  });
});

describe('SpliceNodeInspector — MOVE THROUGH order', () => {
  const kitOn = { spliceDrumOffsetMode: 'time' as const, spliceDrumOffsetMs: 200 };

  it('shows a layer\'s order only once the layer is sending light', () => {
    const off = renderInspector();
    expect(within(off.container).queryByLabelText('Through kit order')).toBeNull();
    const on = renderInspector(kitOn);
    expect(within(on.container).getByLabelText('Through kit order')).toBeTruthy();
  });

  it('the chips read in the order the pattern fires — Down puts the snare first', () => {
    const { getByLabelText } = renderInspector({ ...kitOn, spliceDrumOrder: 'down' });
    const chips = [...getByLabelText('Through kit order').querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(chips).toEqual(['Snare', 'Kick']);
  });

  it('nudging a chip stores a dragged drum sequence', () => {
    const store = stubStore();
    const { getByLabelText } = renderInspector(kitOn, store);
    const kick = getByLabelText('Through kit order').querySelector('button')!;
    kick.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(store.setSpliceSetting).toHaveBeenCalledWith(expect.anything(), { spliceDrumSequence: ['snare', 'kick'] });
  });

  it('a hoop sequence is stored as hoop NUMBERS, the shape the engine reads', () => {
    const store = stubStore();
    const { getByLabelText } = renderInspector({ spliceOffsetMode: 'time', spliceOffsetMs: 100 }, store);
    const hoop1 = getByLabelText('Through drum order').querySelector('button')!;
    hoop1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(store.setSpliceSetting).toHaveBeenCalledWith(expect.anything(), { spliceHoopSequence: [2, 1, 3] });
  });

  it('picking a pattern replaces a dragged order in the same edit', () => {
    const store = stubStore();
    const { getByLabelText } = renderInspector({ ...kitOn, spliceDrumSequence: ['snare', 'kick'] }, store);
    within(getByLabelText('Through kit order pattern')).getByText('Down').click();
    expect(store.setSpliceSetting).toHaveBeenCalledWith(expect.anything(), { spliceDrumOrder: 'down', spliceDrumSequence: undefined });
  });

  it('lights no pattern while a dragged order is in charge', () => {
    const { getByLabelText } = renderInspector({ ...kitOn, spliceDrumSequence: ['snare', 'kick'] });
    const on = getByLabelText('Through kit order pattern').querySelectorAll('[data-state="on"]');
    expect(on).toHaveLength(0);
  });

  it('on a drum cut, THROUGH KIT\'s pattern is the primary order — the drums are the units there', () => {
    const store = stubStore();
    const { getByLabelText } = renderInspector({ splicePartition: 'drum', spliceOffsetMode: 'time', spliceOffsetMs: 200 }, store);
    within(getByLabelText('Through kit order pattern')).getByText('Down').click();
    expect(store.setSpliceSetting).toHaveBeenCalledWith(expect.anything(), { spliceOrder: 'down', spliceDrumSequence: undefined });
  });
});

/* The simplification pass. It changed no stored field and no label — only how much the panel
   asks you to read. These pin the two things it bought, so a later edit cannot quietly put
   them back: one control per timing, and explanations in the ⓘ rather than under the field. */
describe('SpliceNodeInspector simplification', () => {
  const withSplices = (over: Partial<GraphNode> = {}) =>
    renderInspector({ splices: [{ color: '#ff0000' }, { color: '#0000ff' }], ...over });

  it('has no Division | Time toggles left — each timing is one dropdown', () => {
    const { queryByLabelText, queryAllByText } = withSplices();
    for (const gone of ['Splice rate mode', 'Hoop chase mode', 'Drum chase mode', 'Colour chase mode']) {
      expect(queryByLabelText(gone), gone).toBeNull();
    }
    // The toggle's two segment labels were the visible tell of the old four-times pattern.
    expect(queryAllByText('DIVISION')).toHaveLength(0);
  });

  it('shows the milliseconds field only for a timing set to Free', () => {
    // Scoped to each render's own container: both stay mounted for the life of the test.
    const free = withSplices({ spliceOffsetMode: 'time' });
    expect(within(free.container).getByLabelText('Through drum milliseconds')).toBeTruthy();

    const synced = withSplices({ spliceOffsetMode: 'beats' });
    expect(within(synced.container).queryByLabelText('Through drum milliseconds')).toBeNull();
  });

  it('prints no help paragraphs once the splices are filled in', () => {
    // Nine used to sit under the fields, one of them twice — against the rule Field.svelte
    // records from Trent (2026-08-14): explanations go in the label's ⓘ.
    const { container } = withSplices();
    expect(container.querySelectorAll('p.hint')).toHaveLength(0);
  });

  it('keeps every explanation reachable from the label it explains', () => {
    const { getByLabelText } = withSplices({ splicePartition: 'hoop' });
    for (const label of ['Motion', 'On each hit', 'Mode', 'THROUGH KIT', 'THROUGH DRUM', 'AROUND HOOP', 'Layer', 'Play', 'Curve']) {
      expect(getByLabelText(`About ${label}`), label).toBeTruthy();
    }
  });

  it('keeps the one explanation that earns its space: the empty state', () => {
    const { container } = renderInspector({ splices: [{}, {}] });
    expect(container.querySelectorAll('p.hint')).toHaveLength(1);
  });
});

describe('SpliceNodeInspector — MOVE AROUND stagger', () => {
  it('commits the increment to the splice’s own field', async () => {
    const store = stubStore();
    const { getByLabelText } = renderInspector({ spliceChase: 'stagger' }, store);
    const input = getByLabelText('Splice stagger increment') as HTMLInputElement;
    input.focus();
    await fireEvent.input(input, { target: { value: '7' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(store.setSpliceSetting).toHaveBeenCalledWith(expect.anything(), { spliceIncrementPx: 7 });
  });
});
