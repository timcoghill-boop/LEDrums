// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, within } from '@testing-library/svelte';
import type { GraphNode } from '../../../trigger-lab/sim';
import type { TriggerLab } from '../../../trigger-lab/store.svelte';
import { makeNode } from '../../../trigger-lab/sim';
import SliceNodeInspector from './SliceNodeInspector.svelte';

/* The Slice inspector: what it shows for each way of cutting, that it speaks the same movement
   language as Splice, and that it keeps the no-paragraphs rule the Splice pass established. The
   controls are shared components, so what is worth pinning here is WHICH appear WHEN. */

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

const sliceNode = (over: Partial<GraphNode> = {}): GraphNode =>
  makeNode('slice', 'slice', 0, 0, { splices: [{ color: '#ff0000' }, { color: '#0000ff' }], spliceCount: 2, ...over });

const stubStore = () =>
  ({
    effects: [],
    buses: [{ id: 'base', name: 'Base', polyphony: 'poly' }],
    kitDrumInfos: [{ id: 'kick', label: 'Kick', hoopCount: 2 }],
    busOf: () => 'base',
    setSliceOn: vi.fn(),
    setTargetId: vi.fn(),
    setSpliceCount: vi.fn(),
    setSpliceSetting: vi.fn(),
    setBus: vi.fn(),
    setMode: vi.fn(),
    addSplice: vi.fn(),
    setSpliceAt: vi.fn(),
    removeSplice: vi.fn(),
  }) as unknown as TriggerLab;

const renderInspector = (over: Partial<GraphNode> = {}, store = stubStore()) =>
  render(SliceNodeInspector, { props: { store, node: sliceNode(over) } });

const REGION = { cx: 0, cy: 0, cz: 0, sx: 400, sy: 400, sz: 400 };

describe('SliceNodeInspector — what it cuts', () => {
  it('offers Kit, Drum and Space, with the axis, tilt, count, lengths, smudge and velocity', () => {
    const { getByLabelText } = renderInspector();
    for (const name of ['Slice scope', 'Slice axis', 'Slice tilt X', 'Slice tilt Y', 'Slice tilt Z', 'Slice count', 'Slice random lengths', 'Slice smudge', 'Slice velocity sensitivity']) {
      expect(getByLabelText(name), name).toBeTruthy();
    }
  });

  it('shows the box controls only for a SPACE slice', () => {
    const kit = renderInspector();
    expect(within(kit.container).queryByLabelText('Slice region centre X')).toBeNull();

    const space = renderInspector({ sliceRegion: REGION });
    for (const name of ['centre X', 'centre Y', 'centre Z', 'size X', 'size Y', 'size Z']) {
      expect(within(space.container).getByLabelText(`Slice region ${name}`), name).toBeTruthy();
    }
  });

  it('shows the drum picker only for a DRUM slice', () => {
    const kit = renderInspector();
    expect(within(kit.container).queryByLabelText('Slice drum')).toBeNull();
    const drum = renderInspector({ scope: 'drum' });
    expect(within(drum.container).getByLabelText('Slice drum')).toBeTruthy();
  });

  it('routes a scope change through ONE store action', () => {
    // Space is a scope plus a region: one action keeps it one undo step.
    const store = stubStore();
    const { getByText } = renderInspector({}, store);
    // Segment labels are written in sentence case and uppercased by CSS.
    getByText('Space').click();
    expect(store.setSliceOn).toHaveBeenCalledWith(expect.anything(), 'space');
  });
});

describe('SliceNodeInspector — the same movement language as Splice', () => {
  it('heads the motion MOVE AROUND and names the direction MOVE THROUGH', () => {
    const { getAllByText } = renderInspector({ spliceChase: 'step' });
    expect(getAllByText('MOVE AROUND')).toHaveLength(1);
    expect(getAllByText('MOVE THROUGH')).toHaveLength(1);
  });

  it('calls continuous motion SWEEP — slabs travel along an axis, they do not spin', () => {
    const { getByText, queryByText } = renderInspector();
    expect(getByText('Sweep')).toBeTruthy();
    expect(queryByText('Spin')).toBeNull();
  });

  it('has SLICE CHASE and MOVE THROUGH MODE, and COLOUR CHASE once the wait is not Lit', () => {
    const lit = renderInspector();
    expect(within(lit.container).getByLabelText('Slice chase division')).toBeTruthy();
    expect(within(lit.container).getByLabelText('Slice move through mode')).toBeTruthy();
    expect(within(lit.container).queryByLabelText('Colour chase division')).toBeNull();

    const pulse = renderInspector({ spliceWaitMode: 'pulse' });
    expect(within(pulse.container).getByLabelText('Colour chase division')).toBeTruthy();
  });

  it('hides DRUM CHASE for a one-drum slice — there is nothing to stagger across', () => {
    const kit = renderInspector();
    expect(within(kit.container).getByLabelText('Drum chase division')).toBeTruthy();
    const drum = renderInspector({ scope: 'drum' });
    expect(within(drum.container).queryByLabelText('Drum chase division')).toBeNull();
  });

  it('measures a stagger in percent of the span, not pixels', () => {
    const { container } = renderInspector({ spliceChase: 'stagger' });
    expect(within(container).getByLabelText('Slice stagger increment')).toBeTruthy();
    expect(container.textContent).toContain('%');
    expect(container.textContent).not.toMatch(/\bpx\b/);
  });
});

describe('SliceNodeInspector — shared sections', () => {
  it('names its envelope and rows for a slice, not a splice', () => {
    const { getByLabelText, getByRole } = renderInspector();
    expect(getByLabelText('Slice layer')).toBeTruthy();
    expect(getByLabelText('Slice 1 colour')).toBeTruthy();
    // "Slices" is also the count field's label, so ask for the heading specifically.
    expect(getByRole('heading', { name: 'Slices' })).toBeTruthy();
  });

  it('prints no help paragraphs once the slices are filled in — explanations live in the ⓘ', () => {
    const { container, getByLabelText } = renderInspector({ spliceWaitMode: 'pulse' });
    expect(container.querySelectorAll('p.hint')).toHaveLength(0);
    for (const label of ['On', 'Axis', 'Tilt', 'Velocity', 'SLICE CHASE', 'MOVE THROUGH MODE', 'COLOUR CHASE', 'DRUM CHASE']) {
      expect(getByLabelText(`About ${label}`), label).toBeTruthy();
    }
  });
});
