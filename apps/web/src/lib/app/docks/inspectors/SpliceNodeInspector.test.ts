// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, within } from '@testing-library/svelte';
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
    kitDrumInfos: [],
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

const renderInspector = (overrides: Partial<GraphNode> = {}) =>
  render(SpliceNodeInspector, { props: { store: stubStore(), node: spliceNode(overrides) } });

describe('SpliceNodeInspector movement language', () => {
  it('uses the movement headings and accessible chase names for a hoop partition', () => {
    const { container, getByLabelText, getAllByText } = renderInspector();

    // The section is MOVE AROUND and its direction control is MOVE THROUGH — Tim's call
    // (2026-09-25), replacing the earlier heading-and-control double of MOVE THROUGH.
    expect(getAllByText('MOVE AROUND')).toHaveLength(1);
    expect(getAllByText('MOVE THROUGH')).toHaveLength(1);
    expect(container.textContent).toContain('MOVE THROUGH MODE');
    expect(container.textContent).toContain('HOOP CHASE');
    expect(container.textContent).toContain('DRUM CHASE');
    expect(container.textContent).toContain('COLOUR CHASE');
    expect(container.textContent).not.toMatch(/offset|Before its turn|Direction/);

    expect(getByLabelText('Splice move through')).toBeTruthy();
    expect(getByLabelText('Splice move through mode')).toBeTruthy();
    expect(getByLabelText('Hoop chase division')).toBeTruthy();
    expect(getByLabelText('Hoop chase milliseconds')).toBeTruthy();
    expect(getByLabelText('Drum chase division')).toBeTruthy();
    expect(getByLabelText('Colour chase division')).toBeTruthy();
  });

  it('names the primary axis DRUM CHASE and hides the secondary drum chase for drum cuts', () => {
    const { container, getByLabelText, queryByLabelText } = renderInspector({ splicePartition: 'drum' });

    expect(container.textContent).toContain('DRUM CHASE');
    expect(container.textContent).not.toContain('HOOP CHASE');
    expect(getByLabelText('Drum chase division')).toBeTruthy();
    expect(queryByLabelText('Hoop chase division')).toBeNull();
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
    expect(within(free.container).getByLabelText('Hoop chase milliseconds')).toBeTruthy();

    const synced = withSplices({ spliceOffsetMode: 'beats' });
    expect(within(synced.container).queryByLabelText('Hoop chase milliseconds')).toBeNull();
  });

  it('prints no help paragraphs once the splices are filled in', () => {
    // Nine used to sit under the fields, one of them twice — against the rule Field.svelte
    // records from Trent (2026-08-14): explanations go in the label's ⓘ.
    const { container } = withSplices();
    expect(container.querySelectorAll('p.hint')).toHaveLength(0);
  });

  it('keeps every explanation reachable from the label it explains', () => {
    const { getByLabelText } = withSplices({ splicePartition: 'hoop' });
    for (const label of ['Motion', 'On each hit', 'HOOP CHASE', 'MOVE THROUGH MODE', 'COLOUR CHASE', 'DRUM CHASE', 'Layer', 'Play', 'Curve']) {
      expect(getByLabelText(`About ${label}`), label).toBeTruthy();
    }
  });

  it('keeps the one explanation that earns its space: the empty state', () => {
    const { container } = renderInspector({ splices: [{}, {}] });
    expect(container.querySelectorAll('p.hint')).toHaveLength(1);
  });
});
