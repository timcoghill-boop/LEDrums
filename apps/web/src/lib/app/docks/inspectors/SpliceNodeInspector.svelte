<script lang="ts">
  /* Splice-node editor. Three parts, in the order an author thinks about them:
       Cut  — how many splices, over what (hoop / drum / scope), how uneven.
       Move around — chase (content hops splice to splice) or spin (the cut itself rotates), at a
              musical division or free milliseconds.
       Splices — one row each: a colour, an effect, or both (the colour then tints the
              effect), or neither (the splice is blank and you see through it).
     The shared node header (kind selector + remove) lives in the parent Inspector. */
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
    SPLICE_CHASE_HINTS,
    SPLICE_CHASE_OPTS,
    SPLICE_MOTION_MODE_HINTS,
    SPLICE_MOTION_MODE_OPTS,
    SPLICE_WAIT_MODE_HINTS,
    SPLICE_WAIT_MODE_OPTS,
    SPLICE_NO_DIVISION,
    SPLICE_COLOUR_KEYS,
    SPLICE_DRUM_KEYS,
    SPLICE_PRIMARY_KEYS,
    SPLICE_RATE_KEYS,
    SPLICE_ORDER_OPTS,
    SPLICE_DIRECTION_OPTS,
    SPLICE_PARTITION_OPTS,
    spliceOffsetDivisionOptions,
    spliceUnitNoun,
  } from '../../views/splice-options';
  import { SCOPE_OPTS } from '../../views/node-options';

  let { store, node }: { store: TriggerLab; node: GraphNode } = $props();

  const chase = $derived(node.spliceChase ?? 'off');
  const rateMode = $derived(node.spliceRateMode ?? 'beats');
  const jitter = $derived(node.spliceJitter ?? 0);
  const partition = $derived(node.splicePartition ?? 'hoop');
  const offsetMode = $derived(node.spliceOffsetMode ?? 'beats');
  // The cascade offsets ACROSS units, so it means nothing when the whole scope is one unit.
  const canCascade = $derived(partition !== 'scope');
  const drumOffsetMode = $derived(node.spliceDrumOffsetMode ?? 'beats');
  const waitMode = $derived(node.spliceWaitMode ?? 'lit');
  const colorOffsetMode = $derived(node.spliceColorOffsetMode ?? 'beats');
  // The drum axis is only separate from the primary one when cutting per HOOP — cutting per
  // drum already cascades drum by drum, and per scope there is a single unit.
  const canCascadeDrums = $derived(partition === 'hoop' && node.scope !== 'drum' && node.scope !== 'hoop');
  const unitNoun = $derived(spliceUnitNoun(partition));
  const motionMode = $derived(node.spliceMotionMode ?? 'restart');

  // Explanations live in each label's ⓘ, never as a paragraph under the field — the rule
  // Field.svelte records from Trent (2026-08-14). This inspector had nine of them, one printed
  // twice, and they made up most of its height.
  const cascadeInfo = $derived(
    `Starts each ${unitNoun.toLowerCase()} later than the one before it, in the order below — so the motion travels ` +
      `${partition === 'drum' ? 'across the kit' : 'up the drum'} instead of every ${unitNoun.toLowerCase()} moving together.`,
  );
  const COLOUR_CHASE_INFO =
    'Brings the colours on one after another instead of all together, in the colour order below. With Pulse each one fades in and out on its own.';
  const DRUM_CHASE_INFO =
    'Sends the movement round the kit one drum after another, on top of how it travels up each drum. Set both and it spirals; set only this one and whole drums light in turn.';

  const offsetDivisions = spliceOffsetDivisionOptions(DIVISION_OPTS);

  /** Scope-target options, derived from the current scope — same shape the play inspector uses. */
  const targetOptions = $derived.by(() => {
    const infos = store.kitDrumInfos;
    if (node.scope === 'drum') return infos.map((d) => ({ value: d.id, label: d.label }));
    if (node.scope === 'hoop') {
      return infos.flatMap((d) =>
        Array.from({ length: d.hoopCount }, (_, i) => ({ value: `${d.id}#${i + 1}`, label: `${d.label} · Hoop ${i + 1}` })),
      );
    }
    return [];
  });
</script>

{#if node.kind === 'splice'}
  <div class="kindbody">
    <section class="group">
      <h4 class="grouptitle">Cut</h4>

      <Field label="On">
        <SegmentedControl
          value={node.scope}
          options={SCOPE_OPTS}
          onChange={(v) => store.setScope(node, v as 'kit' | 'drum' | 'hoop')}
          ariaLabel="Splice scope"
        />
      </Field>

      {#if node.scope !== 'kit'}
        <Field layout="row" label="Target">
          <Select
            value={node.targetId ?? ''}
            options={targetOptions}
            segment={false}
            onChange={(v) => store.setTargetId(node, v || undefined)}
            placeholder="Auto (triggering drum)"
            ariaLabel="Splice scope target"
          />
        </Field>
      {/if}

      <Field layout="row" label="Splices">
        <CommitInput
          type="number"
          value={node.spliceCount ?? voice.DEFAULT_SPLICE_COUNT}
          min={voice.MIN_SPLICE_COUNT}
          max={voice.MAX_SPLICE_COUNT}
          step={1}
          onCommit={(v) => store.setSpliceCount(node, Number(v))}
          ariaLabel="Splice count"
        />
      </Field>

      <Field label="Per">
        <SegmentedControl
          value={node.splicePartition ?? 'hoop'}
          options={SPLICE_PARTITION_OPTS}
          onChange={(v) => store.setSpliceSetting(node, { splicePartition: v as voice.SplicePartition })}
          ariaLabel="Splice partition"
        />
      </Field>

      <Field layout="row" label="Rotate" unit="°">
        <CommitInput
          type="number"
          value={node.spliceRotationDeg ?? 0}
          min={0}
          max={360}
          step={1}
          onCommit={(v) => store.setSpliceSetting(node, { spliceRotationDeg: Number(v) })}
          ariaLabel="Splice rotation degrees"
        />
      </Field>

      <Field layout="row" label="Random lengths">
        <Slider
          value={jitter}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => store.setSpliceSetting(node, { spliceJitter: v })}
          format={(v) => `${Math.round(v * 100)}%`}
          ariaLabel="Splice length jitter"
        />
      </Field>

      <Field layout="row" label="Smudge">
        <Slider
          value={node.spliceSmudge ?? 0}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => store.setSpliceSetting(node, { spliceSmudge: v })}
          format={(v) => `${Math.round(v * 100)}%`}
          ariaLabel="Splice smudge"
        />
      </Field>

      {#if jitter > 0}
        <Field layout="row" label="Seed">
          <CommitInput
            type="number"
            value={node.spliceSeed ?? 1}
            min={0}
            max={9999}
            step={1}
            onCommit={(v) => store.setSpliceSetting(node, { spliceSeed: Number(v) })}
            ariaLabel="Splice jitter seed"
          />
        </Field>
      {/if}
    </section>


    <section class="group">
      <h4 class="grouptitle">MOVE AROUND</h4>

      <Field label="Motion" info={SPLICE_CHASE_HINTS[chase]}>
        <SegmentedControl
          value={chase}
          options={SPLICE_CHASE_OPTS}
          onChange={(v) => store.setSpliceSetting(node, { spliceChase: v as voice.SpliceChaseMode })}
          ariaLabel="Splice motion"
        />
      </Field>

      <!-- Motion-only controls. The chases below are deliberately outside this gate: a chase used
           to need motion to mean anything, but a dark/pulse wait makes the chase itself the thing
           that travels, with no motion running at all. -->
      {#if chase !== 'off'}
        <Field label="On each hit" info={SPLICE_MOTION_MODE_HINTS[motionMode]}>
          <SegmentedControl
            value={motionMode}
            options={SPLICE_MOTION_MODE_OPTS}
            onChange={(v) => store.setSpliceSetting(node, { spliceMotionMode: v as voice.SpliceMotionMode })}
            ariaLabel="Splice motion mode"
          />
        </Field>

        <SpliceTiming {store} {node} label="Rate" aria="Splice rate" keys={SPLICE_RATE_KEYS} options={DIVISION_OPTS} fallback={voice.DEFAULT_SPLICE_DIVISION} msDefault={voice.DEFAULT_SPLICE_RATE_MS} msMin={10} />

        {#if chase === 'stagger'}
          <Field layout="row" label="Increment" unit="px">
            <CommitInput
              type="number"
              value={node.spliceIncrementPx ?? voice.DEFAULT_SPLICE_INCREMENT_PX}
              min={0}
              max={voice.MAX_SPLICE_INCREMENT_PX}
              step={1}
              onCommit={(v) => store.setSpliceSetting(node, { spliceIncrementPx: Number(v) })}
              ariaLabel="Splice stagger increment"
            />
          </Field>
        {/if}

        <Field label="MOVE THROUGH">
          <SegmentedControl
            value={String(node.spliceDirection ?? 1)}
            options={SPLICE_DIRECTION_OPTS}
            onChange={(v) => store.setSpliceSetting(node, { spliceDirection: v === '-1' ? -1 : 1 })}
            ariaLabel="Splice move through"
          />
        </Field>
      {/if}

      {#if canCascade}
        <SpliceTiming {store} {node} label={`${unitNoun.toUpperCase()} CHASE`} info={cascadeInfo} aria={`${unitNoun} chase`} keys={SPLICE_PRIMARY_KEYS} options={offsetDivisions} fallback={SPLICE_NO_DIVISION} msDefault={0} msMin={0} />

        <!-- A Select, not a 4-up SegmentedControl: "Outside in" overflows the panel's control
             column by 15px, and the set is likely to grow. `segment={false}` keeps that true now
             the ≤4 rule lives inside Select itself (F3 item 10). -->
        <Field layout="row" label="{unitNoun} order">
          <Select
            value={node.spliceOrder ?? 'up'}
            options={SPLICE_ORDER_OPTS}
            segment={false}
            onChange={(v) => store.setSpliceSetting(node, { spliceOrder: v as voice.SpliceOrder })}
            ariaLabel="{unitNoun} order"
          />
        </Field>

        <Field label="MOVE THROUGH MODE" info={SPLICE_WAIT_MODE_HINTS[waitMode]}>
          <SegmentedControl
            value={waitMode}
            options={SPLICE_WAIT_MODE_OPTS}
            onChange={(v) => store.setSpliceSetting(node, { spliceWaitMode: v as voice.SpliceWaitMode })}
            ariaLabel="Splice move through mode"
          />
        </Field>
      {/if}

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

      {#if canCascadeDrums}
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
      <SpliceEnvelopeFields {store} {node} />
    </section>

    <SpliceRows {store} {node} />
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
</style>
