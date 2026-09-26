<script lang="ts">
  /* MOVE AROUND — how the light acts WITHIN its area: motion, what a hit does to it, rate,
     stagger increment and direction. Shared by the Splice and Slice inspectors; the noun picks the
     only things that differ — the motion vocabulary (a slice Sweeps, a splice Spins) and the
     stagger increment (pixels along a splice, percent of the span through a slice). The section
     heading stays with each inspector, as with the envelope. */
  import type { TriggerLab } from '../../../trigger-lab/store.svelte';
  import type { GraphNode } from '../../../trigger-lab/sim';
  import { voice } from '@ledrums/core';
  import Field from '../../../ui/Field.svelte';
  import SegmentedControl from '../../../ui/SegmentedControl.svelte';
  import CommitInput from '../../../ui/CommitInput.svelte';
  import SpliceTiming from './SpliceTiming.svelte';
  import { DIVISION_OPTS } from '../../views/node-options';
  import {
    SLICE_CHASE_HINTS,
    SLICE_CHASE_OPTS,
    SPLICE_CHASE_HINTS,
    SPLICE_CHASE_OPTS,
    SPLICE_DIRECTION_OPTS,
    SPLICE_MOTION_MODE_HINTS,
    SPLICE_MOTION_MODE_OPTS,
    SPLICE_RATE_KEYS,
  } from '../../views/splice-options';

  let { store, node, noun = 'Splice' }: { store: TriggerLab; node: GraphNode; noun?: 'Splice' | 'Slice' } = $props();

  const chase = $derived(node.spliceChase ?? 'off');
  const motionMode = $derived(node.spliceMotionMode ?? 'restart');
  const chaseOpts = $derived(noun === 'Slice' ? SLICE_CHASE_OPTS : SPLICE_CHASE_OPTS);
  const chaseHints = $derived(noun === 'Slice' ? SLICE_CHASE_HINTS : SPLICE_CHASE_HINTS);
  const increment = $derived(
    noun === 'Slice'
      ? { unit: '%', value: node.sliceIncrementPct ?? voice.DEFAULT_SLICE_INCREMENT_PCT, max: voice.MAX_SLICE_INCREMENT_PCT }
      : { unit: 'px', value: node.spliceIncrementPx ?? voice.DEFAULT_SPLICE_INCREMENT_PX, max: voice.MAX_SPLICE_INCREMENT_PX },
  );
  const setIncrement = (v: number): void =>
    store.setSpliceSetting(node, noun === 'Slice' ? { sliceIncrementPct: v } : { spliceIncrementPx: v });
</script>

<Field label="Motion" info={chaseHints[chase]}>
  <SegmentedControl
    value={chase}
    options={chaseOpts}
    onChange={(v) => store.setSpliceSetting(node, { spliceChase: v as voice.SpliceChaseMode })}
    ariaLabel="{noun} motion"
  />
</Field>

{#if chase !== 'off'}
  <Field label="On each hit" info={SPLICE_MOTION_MODE_HINTS[motionMode]}>
    <SegmentedControl
      value={motionMode}
      options={SPLICE_MOTION_MODE_OPTS}
      onChange={(v) => store.setSpliceSetting(node, { spliceMotionMode: v as voice.SpliceMotionMode })}
      ariaLabel="{noun} motion mode"
    />
  </Field>

  <SpliceTiming {store} {node} label="Rate" aria="{noun} rate" keys={SPLICE_RATE_KEYS} options={DIVISION_OPTS} fallback={voice.DEFAULT_SPLICE_DIVISION} msDefault={voice.DEFAULT_SPLICE_RATE_MS} msMin={10} />

  {#if chase === 'stagger'}
    <Field layout="row" label="Increment" unit={increment.unit}>
      <CommitInput
        type="number"
        value={increment.value}
        min={0}
        max={increment.max}
        step={1}
        onCommit={(v) => setIncrement(Number(v))}
        ariaLabel="{noun} stagger increment"
      />
    </Field>
  {/if}

  <Field label="Direction">
    <SegmentedControl
      value={String(node.spliceDirection ?? 1)}
      options={SPLICE_DIRECTION_OPTS}
      onChange={(v) => store.setSpliceSetting(node, { spliceDirection: v === '-1' ? -1 : 1 })}
      ariaLabel="{noun} direction"
    />
  </Field>
{/if}
