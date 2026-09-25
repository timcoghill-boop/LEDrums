<script lang="ts">
  /* Slice-node editor — the 3D sibling of the Splice inspector, in the same order an author
     thinks about it:
       Slice       — what it cuts (kit / drum / a box of space), along which axis, tilted how,
                     how many slabs, how uneven, how soft their edges, how much velocity counts.
       MOVE AROUND — the same motion, chases and MOVE THROUGH MODE as a splice, applied to slabs.
       Brightness envelope and Slices — shared with the Splice inspector, component for component.
     Labels match the Splice inspector wherever the meaning is the same, so the two nodes read as
     one family; they differ only where the geometry does (Sweep, SLICE CHASE, the axis controls). */
  import type { TriggerLab } from '../../../trigger-lab/store.svelte';
  import type { GraphNode } from '../../../trigger-lab/sim';
  import { voice } from '@ledrums/core';
  import Field from '../../../ui/Field.svelte';
  import SegmentedControl from '../../../ui/SegmentedControl.svelte';
  import Select from '../../../ui/Select.svelte';
  import Slider from '../../../ui/Slider.svelte';
  import CommitInput from '../../../ui/CommitInput.svelte';
  import SpliceTiming from './SpliceTiming.svelte';
  import SpliceEnvelopeFields from './SpliceEnvelopeFields.svelte';
  import SpliceRows from './SpliceRows.svelte';
  import { DIVISION_OPTS } from '../../views/node-options';
  import {
    SLICE_AXIS_OPTS,
    SLICE_CHASE_HINTS,
    SLICE_CHASE_OPTS,
    SLICE_ON_OPTS,
    SPLICE_COLOUR_KEYS,
    SPLICE_DIRECTION_OPTS,
    SPLICE_DRUM_KEYS,
    SPLICE_MOTION_MODE_HINTS,
    SPLICE_MOTION_MODE_OPTS,
    SPLICE_NO_DIVISION,
    SPLICE_ORDER_OPTS,
    SPLICE_PRIMARY_KEYS,
    SPLICE_RATE_KEYS,
    SPLICE_WAIT_MODE_HINTS,
    SPLICE_WAIT_MODE_OPTS,
    spliceOffsetDivisionOptions,
  } from '../../views/splice-options';

  let { store, node }: { store: TriggerLab; node: GraphNode } = $props();

  const on = $derived(node.sliceRegion ? 'space' : node.scope === 'drum' ? 'drum' : 'kit');
  const chase = $derived(node.spliceChase ?? 'off');
  const jitter = $derived(node.spliceJitter ?? 0);
  const waitMode = $derived(node.spliceWaitMode ?? 'lit');
  const motionMode = $derived(node.spliceMotionMode ?? 'restart');
  const velocity = $derived(node.sliceVelocity ?? voice.DEFAULT_SLICE_VELOCITY);
  // The three 0…1 amounts are edited in whole percent: Slider keeps the REAL number in its box
  // and shows a transforming format beside it, so a 0…1 value formatted as a percentage reads
  // "1 100%". Scaling to 0…100 makes the box and the unit agree — "100 %".
  const offsetDivisions = spliceOffsetDivisionOptions(DIVISION_OPTS);
  const drumOptions = $derived(store.kitDrumInfos.map((d) => ({ value: d.id, label: d.label })));

  // Explanations live in each label's ⓘ, never as a paragraph under the field (Field.svelte).
  const ON_INFO = 'Kit slices the whole kit; Drum only one drum; Space only a box of the room you place and size below.';
  const AXIS_INFO = 'The direction the slices are stacked along. Each slice is a flat slab across the kit, facing along this axis.';
  const TILT_INFO = 'Tilts the slices about the world X, Y and Z axes, in degrees — so a slice can cut diagonally through the kit.';
  const VELOCITY_INFO =
    'How much a hit’s velocity sets the brightness. 0% ignores it — every hit is full brightness; 100% makes a soft hit a dim slice and a hard hit a bright one.';
  const SLICE_CHASE_INFO = 'Starts each slice later than the one before it, in the order below — so the light travels through the kit slab by slab.';
  const COLOUR_CHASE_INFO =
    'Brings the colours on one after another instead of all together, in the colour order below. With Pulse each one fades in and out on its own.';
  const DRUM_CHASE_INFO = 'Starts each drum later than the one before it, in the order below — so the slices arrive at the kit one drum at a time.';
  const REGION_INFO = 'The box of space to slice, in millimetres: where its centre sits, and how big it is along each axis.';

  type RegionKey = 'cx' | 'cy' | 'cz' | 'sx' | 'sy' | 'sz';
  const setRegion = (key: RegionKey, value: number): void => {
    const r = node.sliceRegion;
    if (!r || !Number.isFinite(value)) return;
    const next = key.startsWith('s') ? Math.max(1, value) : value;
    store.setSpliceSetting(node, { sliceRegion: { ...r, [key]: next } });
  };
</script>

<!-- One row of three numeric fields, X / Y / Z — the shape the tilt, centre and size all share. -->
{#snippet xyz(label: string, info: string | undefined, values: [number, number, number], unit: string, ariaStem: string, onCommit: (axis: 0 | 1 | 2, v: number) => void)}
  <Field layout="row" {label} {info} {unit}>
    <div class="xyz">
      {#each ['X', 'Y', 'Z'] as axisName, i (axisName)}
        <CommitInput
          type="number"
          value={values[i]!}
          step={1}
          onCommit={(v) => onCommit(i as 0 | 1 | 2, Number(v))}
          ariaLabel="{ariaStem} {axisName}"
        />
      {/each}
    </div>
  </Field>
{/snippet}

{#if node.kind === 'slice'}
  <div class="kindbody">
    <section class="group">
      <h4 class="grouptitle">Slice</h4>

      <Field label="On" info={ON_INFO}>
        <SegmentedControl
          value={on}
          options={SLICE_ON_OPTS}
          onChange={(v) => store.setSliceOn(node, v as 'kit' | 'drum' | 'space')}
          ariaLabel="Slice scope"
        />
      </Field>

      {#if on === 'drum'}
        <Field layout="row" label="Target">
          <Select
            value={node.targetId ?? ''}
            options={drumOptions}
            segment={false}
            onChange={(v) => store.setTargetId(node, v || undefined)}
            placeholder="Auto (triggering drum)"
            ariaLabel="Slice drum"
          />
        </Field>
      {/if}

      {#if node.sliceRegion}
        {@const r = node.sliceRegion}
        {@render xyz('Centre', REGION_INFO, [r.cx, r.cy, r.cz], 'mm', 'Slice region centre', (i, v) => setRegion((['cx', 'cy', 'cz'] as const)[i], v))}
        {@render xyz('Size', undefined, [r.sx, r.sy, r.sz], 'mm', 'Slice region size', (i, v) => setRegion((['sx', 'sy', 'sz'] as const)[i], v))}
      {/if}

      <Field label="Axis" info={AXIS_INFO}>
        <SegmentedControl
          value={node.sliceAxis ?? voice.DEFAULT_SLICE_AXIS}
          options={SLICE_AXIS_OPTS}
          onChange={(v) => store.setSpliceSetting(node, { sliceAxis: v as voice.SliceAxis })}
          ariaLabel="Slice axis"
        />
      </Field>

      {@render xyz('Tilt', TILT_INFO, [node.sliceRotX ?? 0, node.sliceRotY ?? 0, node.sliceRotZ ?? 0], '°', 'Slice tilt', (i, v) =>
        store.setSpliceSetting(node, { [(['sliceRotX', 'sliceRotY', 'sliceRotZ'] as const)[i]]: v }),
      )}

      <Field layout="row" label="Slices">
        <CommitInput
          type="number"
          value={node.spliceCount ?? voice.DEFAULT_SPLICE_COUNT}
          min={voice.MIN_SPLICE_COUNT}
          max={voice.MAX_SPLICE_COUNT}
          step={1}
          onCommit={(v) => store.setSpliceCount(node, Number(v))}
          ariaLabel="Slice count"
        />
      </Field>

      <Field layout="row" label="Random lengths">
        <Slider
          value={Math.round((jitter) * 100)}
          min={0}
          max={100}
          step={1}
          onChange={(v) => store.setSpliceSetting(node, { spliceJitter: v / 100 })}
          format={(v) => `${v}%`}
          ariaLabel="Slice random lengths"
        />
      </Field>

      <Field layout="row" label="Smudge">
        <Slider
          value={Math.round((node.spliceSmudge ?? 0) * 100)}
          min={0}
          max={100}
          step={1}
          onChange={(v) => store.setSpliceSetting(node, { spliceSmudge: v / 100 })}
          format={(v) => `${v}%`}
          ariaLabel="Slice smudge"
        />
      </Field>

      {#if jitter > 0}
        <Field layout="row" label="Seed">
          <CommitInput
            type="number"
            value={node.spliceSeed ?? 1}
            min={0}
            step={1}
            onCommit={(v) => store.setSpliceSetting(node, { spliceSeed: Number(v) })}
            ariaLabel="Slice jitter seed"
          />
        </Field>
      {/if}

      <Field layout="row" label="Velocity" info={VELOCITY_INFO}>
        <Slider
          value={Math.round((velocity) * 100)}
          min={0}
          max={100}
          step={1}
          onChange={(v) => store.setSpliceSetting(node, { sliceVelocity: v / 100 })}
          format={(v) => `${v}%`}
          ariaLabel="Slice velocity sensitivity"
        />
      </Field>
    </section>

    <section class="group">
      <h4 class="grouptitle">MOVE AROUND</h4>

      <Field label="Motion" info={SLICE_CHASE_HINTS[chase]}>
        <SegmentedControl
          value={chase}
          options={SLICE_CHASE_OPTS}
          onChange={(v) => store.setSpliceSetting(node, { spliceChase: v as voice.SpliceChaseMode })}
          ariaLabel="Slice motion"
        />
      </Field>

      {#if chase !== 'off'}
        <Field label="On each hit" info={SPLICE_MOTION_MODE_HINTS[motionMode]}>
          <SegmentedControl
            value={motionMode}
            options={SPLICE_MOTION_MODE_OPTS}
            onChange={(v) => store.setSpliceSetting(node, { spliceMotionMode: v as voice.SpliceMotionMode })}
            ariaLabel="Slice motion mode"
          />
        </Field>

        <SpliceTiming {store} {node} label="Rate" aria="Slice rate" keys={SPLICE_RATE_KEYS} options={DIVISION_OPTS} fallback={voice.DEFAULT_SPLICE_DIVISION} msDefault={voice.DEFAULT_SPLICE_RATE_MS} msMin={10} />

        {#if chase === 'stagger'}
          <Field layout="row" label="Increment" unit="%">
            <CommitInput
              type="number"
              value={node.sliceIncrementPct ?? voice.DEFAULT_SLICE_INCREMENT_PCT}
              min={0}
              max={voice.MAX_SLICE_INCREMENT_PCT}
              step={1}
              onCommit={(v) => store.setSpliceSetting(node, { sliceIncrementPct: Number(v) })}
              ariaLabel="Slice stagger increment"
            />
          </Field>
        {/if}

        <Field label="MOVE THROUGH">
          <SegmentedControl
            value={String(node.spliceDirection ?? 1)}
            options={SPLICE_DIRECTION_OPTS}
            onChange={(v) => store.setSpliceSetting(node, { spliceDirection: v === '-1' ? -1 : 1 })}
            ariaLabel="Slice move through"
          />
        </Field>
      {/if}

      <SpliceTiming {store} {node} label="SLICE CHASE" info={SLICE_CHASE_INFO} aria="Slice chase" keys={SPLICE_PRIMARY_KEYS} options={offsetDivisions} fallback={SPLICE_NO_DIVISION} msDefault={0} msMin={0} />

      <Field layout="row" label="Slice order">
        <Select
          value={node.spliceOrder ?? 'up'}
          options={SPLICE_ORDER_OPTS}
          segment={false}
          onChange={(v) => store.setSpliceSetting(node, { spliceOrder: v as voice.SpliceOrder })}
          ariaLabel="Slice order"
        />
      </Field>

      <Field label="MOVE THROUGH MODE" info={SPLICE_WAIT_MODE_HINTS[waitMode]}>
        <SegmentedControl
          value={waitMode}
          options={SPLICE_WAIT_MODE_OPTS}
          onChange={(v) => store.setSpliceSetting(node, { spliceWaitMode: v as voice.SpliceWaitMode })}
          ariaLabel="Slice move through mode"
        />
      </Field>

      {#if waitMode !== 'lit'}
        <SpliceTiming {store} {node} label="COLOUR CHASE" info={COLOUR_CHASE_INFO} aria="Colour chase" keys={SPLICE_COLOUR_KEYS} options={offsetDivisions} fallback={SPLICE_NO_DIVISION} msDefault={0} msMin={0} />

        <Field layout="row" label="Colour order">
          <Select
            value={node.spliceColorOrder ?? 'up'}
            options={SPLICE_ORDER_OPTS}
            segment={false}
            onChange={(v) => store.setSpliceSetting(node, { spliceColorOrder: v as voice.SpliceOrder })}
            ariaLabel="Colour order"
          />
        </Field>
      {/if}

      <!-- One drum has nothing to stagger across, so a DRUM slice hides the drum axis. -->
      {#if on !== 'drum'}
        <SpliceTiming {store} {node} label="DRUM CHASE" info={DRUM_CHASE_INFO} aria="Drum chase" keys={SPLICE_DRUM_KEYS} options={offsetDivisions} fallback={SPLICE_NO_DIVISION} msDefault={0} msMin={0} />

        <Field layout="row" label="Drum order">
          <Select
            value={node.spliceDrumOrder ?? 'up'}
            options={SPLICE_ORDER_OPTS}
            segment={false}
            onChange={(v) => store.setSpliceSetting(node, { spliceDrumOrder: v as voice.SpliceOrder })}
            ariaLabel="Drum order"
          />
        </Field>
      {/if}
    </section>

    <section class="group">
      <h4 class="grouptitle">Brightness envelope</h4>
      <SpliceEnvelopeFields {store} {node} noun="Slice" />
    </section>

    <SpliceRows {store} {node} noun="Slice" />
  </div>
{/if}

<style>
  .kindbody {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-3);
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .grouptitle {
    margin: 0;
    font-size: var(--text-2xs);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  /* Three numbers on one row: equal columns that shrink together, never wrapping to a second
     line, so X, Y and Z always read left to right in that order. */
  .xyz {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-1);
    min-width: 0;
  }
</style>
