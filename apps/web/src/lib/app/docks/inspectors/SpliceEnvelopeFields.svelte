<script lang="ts">
  /* The brightness envelope, shared by the Splice and Slice inspectors — layer, play mode,
     re-hit behaviour and the attack / curve / sustain / decay shape. Lifted verbatim from the
     Splice inspector; only the noun in the accessible names is a prop. The section heading stays
     with each inspector, since the two cut different things. */
  import type { TriggerLab } from '../../../trigger-lab/store.svelte';
  import type { GraphNode } from '../../../trigger-lab/sim';
  import { voice } from '@ledrums/core';
  import Field from '../../../ui/Field.svelte';
  import SegmentedControl from '../../../ui/SegmentedControl.svelte';
  import Select from '../../../ui/Select.svelte';
  import CommitInput from '../../../ui/CommitInput.svelte';
  import EasePicker from '../../../ui/EasePicker.svelte';
  import {
    SPLICE_LOOP_RETRIGGER_HINTS,
    SPLICE_LOOP_RETRIGGER_OPTS,
    SPLICE_PLAY_OPTS,
    spliceLayerOptions,
  } from '../../views/splice-options';

  let { store, node, noun = 'Splice' }: { store: TriggerLab; node: GraphNode; noun?: 'Splice' | 'Slice' } = $props();

  const loopRetrigger = $derived(node.spliceLoopRetrigger ?? 'stop');
  const layerOptions = $derived(spliceLayerOptions(store.buses));
  const layerIsMono = $derived(store.buses.find((b) => b.id === store.busOf(node))?.polyphony === 'mono');
  const layerInfo = $derived(
    layerIsMono
      ? `Mono: a new hit CUTS whatever this layer was playing — including another ${noun.toLowerCase()} fired by the same sequencer. Pick a “sustains” layer to let them overlap.`
      : `Poly: hits SUSTAIN — an earlier ${noun.toLowerCase()} keeps fading on its own envelope while the next starts. Pick a “cuts” layer to have each new hit end the last.`,
  );
  const PLAY_INFO =
    'How long the lights stay up after a hit: attack up, sustain at full, then decay away. One-shot runs the whole shape; Loop stays up until the voice is stopped.';
  const CURVE_INFO = 'A linear attack reads as brightening too fast — an ease-in curve swells more evenly.';
</script>

<!-- Layer names are the show author's, not the app's, and each carries a "· cuts" /
     "· sustains" suffix — exactly the case Select's header excludes from segmenting. -->
<Field layout="row" label="Layer" info={layerInfo}>
  <Select
    value={store.busOf(node)}
    options={layerOptions}
    segment={false}
    onChange={(v) => store.setBus(node, v)}
    ariaLabel="{noun} layer"
  />
</Field>

<Field layout="row" label="Play" info={PLAY_INFO}>
  <SegmentedControl
    value={node.mode === 'oneshot' ? 'oneshot' : 'loop'}
    options={SPLICE_PLAY_OPTS}
    onChange={(v) => store.setMode(node, v as 'oneshot' | 'loop')}
    ariaLabel="{noun} play mode"
  />
</Field>

{#if node.mode !== 'oneshot'}
  <Field layout="row" label="Hit again" info={SPLICE_LOOP_RETRIGGER_HINTS[loopRetrigger]}>
    <SegmentedControl
      value={loopRetrigger}
      options={SPLICE_LOOP_RETRIGGER_OPTS}
      onChange={(v) => store.setSpliceSetting(node, { spliceLoopRetrigger: v as 'stop' | 'restart' })}
      ariaLabel="{noun} loop retrigger"
    />
  </Field>
{/if}

<Field layout="row" label="Attack" unit="ms">
  <CommitInput
    type="number"
    value={node.spliceAttackMs ?? voice.DEFAULT_SPLICE_ATTACK_MS}
    min={0}
    max={voice.MAX_SPLICE_ENVELOPE_MS}
    step={1}
    onCommit={(v) => store.setSpliceSetting(node, { spliceAttackMs: Number(v) })}
    ariaLabel="{noun} attack milliseconds"
  />
</Field>

<!-- Stacked: EasePicker is a family Select PLUS a direction control, which the row
     layout's control column squeezes to the point of clipping. -->
<Field label="Curve" info={CURVE_INFO}>
  <EasePicker
    value={node.spliceAttackEase ?? { fn: 'linear', dir: 'in' }}
    onChange={(v) => store.setSpliceSetting(node, { spliceAttackEase: v })}
    ariaLabel="{noun} attack curve"
  />
</Field>

<Field layout="row" label="Sustain" unit="ms">
  <CommitInput
    type="number"
    value={node.spliceHoldMs ?? voice.DEFAULT_SPLICE_HOLD_MS}
    min={0}
    max={voice.MAX_SPLICE_ENVELOPE_MS}
    step={10}
    onCommit={(v) => store.setSpliceSetting(node, { spliceHoldMs: Number(v) })}
    ariaLabel="{noun} sustain milliseconds"
  />
</Field>

<Field layout="row" label="Decay" unit="ms">
  <CommitInput
    type="number"
    value={node.spliceReleaseMs ?? voice.DEFAULT_SPLICE_RELEASE_MS}
    min={0}
    max={voice.MAX_SPLICE_ENVELOPE_MS}
    step={10}
    onCommit={(v) => store.setSpliceSetting(node, { spliceReleaseMs: Number(v) })}
    ariaLabel="{noun} decay milliseconds"
  />
</Field>
