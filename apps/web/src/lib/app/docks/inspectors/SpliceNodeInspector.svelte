<script lang="ts">
  /* Splice-node editor. Three parts, in the order an author thinks about them:
       Cut  — how many splices, over what (hoop / drum / scope), how uneven.
       Move through — chase (content hops splice to splice) or spin (the cut itself rotates), at a
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
  import ColorField from '../../../ui/ColorField.svelte';
  import IconButton from '../../../ui/IconButton.svelte';
  import EasePicker from '../../../ui/EasePicker.svelte';
  import Toggle from '../../../ui/Toggle.svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { DIVISION_OPTS } from '../../views/node-options';
  import {
    SPLICE_CHASE_HINTS,
    SPLICE_CHASE_OPTS,
    SPLICE_MOTION_MODE_HINTS,
    SPLICE_MOTION_MODE_OPTS,
    SPLICE_LOOP_RETRIGGER_HINTS,
    SPLICE_LOOP_RETRIGGER_OPTS,
    SPLICE_PLAY_OPTS,
    SPLICE_WAIT_MODE_HINTS,
    SPLICE_WAIT_MODE_OPTS,
    SPLICE_NO_DIVISION,
    spliceTimingOptions,
    spliceTimingPatch,
    spliceTimingValue,
    SPLICE_ORDER_OPTS,
    SPLICE_DIRECTION_OPTS,
    SPLICE_NO_EFFECT,
    SPLICE_PARTITION_OPTS,
    describeSpliceRow,
    spliceEffectOptions,
    spliceLayerOptions,
    spliceOffsetDivisionOptions,
    spliceRows,
    spliceUnitNoun,
  } from '../../views/splice-options';
  import { SCOPE_OPTS } from '../../views/node-options';

  let { store, node }: { store: TriggerLab; node: GraphNode } = $props();

  const rows = $derived(spliceRows(node));
  const effectOpts = $derived(spliceEffectOptions(store.effects));
  const chase = $derived(node.spliceChase ?? 'off');
  const rateMode = $derived(node.spliceRateMode ?? 'beats');
  const jitter = $derived(node.spliceJitter ?? 0);
  const tint = $derived(node.spliceTint ?? 1);
  const anyTinted = $derived(rows.some((r) => r.color && r.effectId && !r.muted));
  const effectName = (id: string) => store.effects.find((e) => e.id === id)?.name ?? id;
  const partition = $derived(node.splicePartition ?? 'hoop');
  const offsetMode = $derived(node.spliceOffsetMode ?? 'beats');
  // The cascade offsets ACROSS units, so it means nothing when the whole scope is one unit.
  const canCascade = $derived(partition !== 'scope');
  const drumOffsetMode = $derived(node.spliceDrumOffsetMode ?? 'beats');
  const waitMode = $derived(node.spliceWaitMode ?? 'lit');
  const colorOffsetMode = $derived(node.spliceColorOffsetMode ?? 'beats');
  const loopRetrigger = $derived(node.spliceLoopRetrigger ?? 'stop');
  // The drum axis is only separate from the primary one when cutting per HOOP — cutting per
  // drum already cascades drum by drum, and per scope there is a single unit.
  const canCascadeDrums = $derived(partition === 'hoop' && node.scope !== 'drum' && node.scope !== 'hoop');
  const unitNoun = $derived(spliceUnitNoun(partition));
  const motionMode = $derived(node.spliceMotionMode ?? 'restart');
  const layerOptions = $derived(spliceLayerOptions(store.buses));
  const layerIsMono = $derived(store.buses.find((b) => b.id === store.busOf(node))?.polyphony === 'mono');

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
  const PLAY_INFO =
    'How long the lights stay up after a hit: attack up, sustain at full, then decay away. One-shot runs the whole shape; Loop stays up until the voice is stopped.';
  const CURVE_INFO = 'A linear attack reads as brightening too fast — an ease-in curve swells more evenly.';
  const TINT_INFO = "How strongly a splice's colour recolours the effect inside it. A splice with no colour is never tinted.";
  const layerInfo = $derived(
    layerIsMono
      ? 'Mono: a new hit CUTS whatever this layer was playing — including another splice fired by the same sequencer. Pick a “sustains” layer to let them overlap.'
      : 'Poly: hits SUSTAIN — an earlier splice keeps fading on its own envelope while the next starts. Pick a “cuts” layer to have each new hit end the last.',
  );

  /** The stored fields behind one timing. Four timings share the same shape — the motion rate and
      the three chases — so one snippet renders them all instead of four hand-kept copies. */
  type TimingKeys = { mode: keyof GraphNode; division: keyof GraphNode; ms: keyof GraphNode };
  const RATE: TimingKeys = { mode: 'spliceRateMode', division: 'spliceDivision', ms: 'spliceRateMs' };
  const PRIMARY: TimingKeys = { mode: 'spliceOffsetMode', division: 'spliceOffsetDivision', ms: 'spliceOffsetMs' };
  const COLOUR: TimingKeys = { mode: 'spliceColorOffsetMode', division: 'spliceColorOffsetDivision', ms: 'spliceColorOffsetMs' };
  const DRUM: TimingKeys = { mode: 'spliceDrumOffsetMode', division: 'spliceDrumOffsetDivision', ms: 'spliceDrumOffsetMs' };
  const offsetDivisions = spliceOffsetDivisionOptions(DIVISION_OPTS);
  type SplicePatch = Parameters<TriggerLab['setSpliceSetting']>[1];

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

    <!-- One timing, in one row: the divisions plus "Free (ms)" in a single dropdown, and the ms
         field only while Free is picked. Replaces a Division | Time toggle PLUS a value row that
         changed shape under it, which this section repeated four times. -->
    {#snippet timing(label: string, info: string | undefined, aria: string, keys: TimingKeys, options: Array<{ value: string; label: string }>, fallback: string, msDefault: number, msMin: number)}
      <Field layout="row" {label} {info}>
        <Select
          value={spliceTimingValue(node[keys.mode] as 'beats' | 'time' | undefined, node[keys.division] as string | undefined, fallback)}
          options={spliceTimingOptions(options)}
          onChange={(v) => store.setSpliceSetting(node, spliceTimingPatch(v, keys) as SplicePatch)}
          ariaLabel="{aria} division"
        />
      </Field>
      {#if node[keys.mode] === 'time'}
        <Field layout="row" label="Time" unit="ms">
          <CommitInput
            type="number"
            value={(node[keys.ms] as number | undefined) ?? msDefault}
            min={msMin}
            max={60000}
            step={1}
            onCommit={(v) => store.setSpliceSetting(node, { [keys.ms]: Number(v) } as SplicePatch)}
            ariaLabel="{aria} milliseconds"
          />
        </Field>
      {/if}
    {/snippet}

    <section class="group">
      <h4 class="grouptitle">MOVE THROUGH</h4>

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

        {@render timing('Rate', undefined, 'Splice rate', RATE, DIVISION_OPTS, voice.DEFAULT_SPLICE_DIVISION, voice.DEFAULT_SPLICE_RATE_MS, 10)}

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
        {@render timing(`${unitNoun.toUpperCase()} CHASE`, cascadeInfo, `${unitNoun} chase`, PRIMARY, offsetDivisions, SPLICE_NO_DIVISION, 0, 0)}

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
        {@render timing('COLOUR CHASE', COLOUR_CHASE_INFO, 'Colour chase', COLOUR, offsetDivisions, SPLICE_NO_DIVISION, 0, 0)}

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
        {@render timing('DRUM CHASE', DRUM_CHASE_INFO, 'Drum chase', DRUM, offsetDivisions, SPLICE_NO_DIVISION, 0, 0)}

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

      <!-- Layer names are the show author's, not the app's, and each carries a "· cuts" /
           "· sustains" suffix — exactly the case Select's header excludes from segmenting. -->
      <Field layout="row" label="Layer" info={layerInfo}>
        <Select
          value={store.busOf(node)}
          options={layerOptions}
          segment={false}
          onChange={(v) => store.setBus(node, v)}
          ariaLabel="Splice layer"
        />
      </Field>

      <Field layout="row" label="Play" info={PLAY_INFO}>
        <SegmentedControl
          value={node.mode === 'oneshot' ? 'oneshot' : 'loop'}
          options={SPLICE_PLAY_OPTS}
          onChange={(v) => store.setMode(node, v as 'oneshot' | 'loop')}
          ariaLabel="Splice play mode"
        />
      </Field>

      {#if node.mode !== 'oneshot'}
        <Field layout="row" label="Hit again" info={SPLICE_LOOP_RETRIGGER_HINTS[loopRetrigger]}>
          <SegmentedControl
            value={loopRetrigger}
            options={SPLICE_LOOP_RETRIGGER_OPTS}
            onChange={(v) => store.setSpliceSetting(node, { spliceLoopRetrigger: v as 'stop' | 'restart' })}
            ariaLabel="Splice loop retrigger"
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
          ariaLabel="Splice attack milliseconds"
        />
      </Field>

      <!-- Stacked: EasePicker is a family Select PLUS a direction control, which the row
           layout's control column squeezes to the point of clipping. -->
      <Field label="Curve" info={CURVE_INFO}>
        <EasePicker
          value={node.spliceAttackEase ?? { fn: 'linear', dir: 'in' }}
          onChange={(v) => store.setSpliceSetting(node, { spliceAttackEase: v })}
          ariaLabel="Splice attack curve"
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
          ariaLabel="Splice sustain milliseconds"
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
          ariaLabel="Splice decay milliseconds"
        />
      </Field>

    </section>

    <section class="group">
      <div class="grouphead">
        <h4 class="grouptitle">Splices</h4>
        <IconButton
          icon={Plus}
          label="Add splice"
          variant="soft"
          size={14}
          onclick={() => store.addSplice(node)}
        />
      </div>

      <ul class="rows">
        {#each rows as row (row.index)}
          <li class="row" class:blank={row.blank}>
            <div class="rowhead">
              <span class="idx">{row.index + 1}</span>
              <span class="rowdesc">{describeSpliceRow(row, effectName)}</span>
              <span class="rowactions">
                <Toggle
                  pressed={!row.muted}
                  onChange={(on) => store.setSpliceAt(node, row.index, { muted: !on })}
                  ariaLabel="Splice {row.index + 1} on"
                />
                <IconButton
                  icon={Trash2}
                  label="Remove splice {row.index + 1}"
                  variant="soft"
                  size={13}
                  disabled={rows.length <= 1}
                  onclick={() => store.removeSplice(node, row.index)}
                />
              </span>
            </div>

            <div class="rowbody">
              <ColorField
                value={row.color}
                onChange={(v) => store.setSpliceAt(node, row.index, { color: v })}
                ariaLabel="Splice {row.index + 1} colour"
              />
              <!-- Effect names come from the show, so a three-effect show must not turn this
                   into three segments of ellipsised text — stay a dropdown at every length. -->
              <Select
                value={row.effectId ?? SPLICE_NO_EFFECT}
                options={effectOpts}
                segment={false}
                onChange={(v) => store.setSpliceAt(node, row.index, { effectId: v === SPLICE_NO_EFFECT ? undefined : v })}
                ariaLabel="Splice {row.index + 1} effect"
              />
            </div>
          </li>
        {/each}
      </ul>

      {#if anyTinted}
        <Field layout="row" label="Tint" info={TINT_INFO}>
          <Slider
            value={tint}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => store.setSpliceSetting(node, { spliceTint: v })}
            format={(v) => `${Math.round(v * 100)}%`}
            ariaLabel="Splice tint amount"
          />
        </Field>
      {:else if rows.every((r) => r.blank)}
        <!-- The one explanation that earns its space: the empty state, where nothing on screen
             says yet what a splice row is for. -->
        <p class="hint">Give a splice a colour, an effect, or both — with both, the colour tints the effect.</p>
      {/if}
    </section>
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
  .grouphead {
    display: flex;
    align-items: center;
    justify-content: space-between;
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
  .hint {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--text-muted);
    line-height: var(--leading-normal);
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
    border-radius: var(--radius-2);
    background: var(--surface-raised);
    box-shadow: inset 0 0 0 1px var(--border-faint);
  }
  /* A blank splice renders nothing on the kit — say so quietly rather than hiding the row. */
  .row.blank .rowdesc {
    opacity: 0.6;
    font-style: italic;
  }
  .rowhead {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .idx {
    flex: none;
    min-width: 1.4em;
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .rowdesc {
    flex: 1 1 auto;
    min-width: 0;
    font-size: var(--text-xs);
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rowactions {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  /* One control per line: at the inspector's real width a colour well + a full effect
     name side by side truncates both (the hex reads "#F…" and the effect name wraps). */
  .rowbody {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }
</style>
