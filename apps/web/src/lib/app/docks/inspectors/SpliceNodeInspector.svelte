<script lang="ts">
  /* Splice-node editor, in the order an author thinks about it (Tim's layout, 2026-09-26):
       Splice       — the initial properties: how many splices, over what (hoop / drum / scope), where
                      the cut sits, how uneven, how soft.
       MOVE AROUND  — how the light acts WITHIN that area: chase, spin or stagger, at a rate, which way.
       MOVE THROUGH — where the light is SENT, if anywhere: through the kit drum to drum, through each
                      drum hoop to hoop, around each hoop splice to splice — any mix, each in an order
                      you drag or pick — and whether waiting parts are lit, dark, fading or pulsing.
       Brightness envelope and the rows follow, shared with the Slice inspector.
     The shared node header (kind selector + remove) lives in the parent Inspector. */
  import type { TriggerLab } from '../../../trigger-lab/store.svelte';
  import type { GraphNode } from '../../../trigger-lab/sim';
  import { voice } from '@ledrums/core';
  import Field from '../../../ui/Field.svelte';
  import SegmentedControl from '../../../ui/SegmentedControl.svelte';
  import Select from '../../../ui/Select.svelte';
  import Slider from '../../../ui/Slider.svelte';
  import CommitInput from '../../../ui/CommitInput.svelte';
  import SpliceMoveAround from './SpliceMoveAround.svelte';
  import SpliceEnvelopeFields from './SpliceEnvelopeFields.svelte';
  import SpliceRows from './SpliceRows.svelte';
  import SpliceThroughLayer from './SpliceThroughLayer.svelte';
  import {
    SPLICE_WAIT_MODE_HINTS,
    SPLICE_WAIT_MODE_OPTS,
    AROUND_LAYER,
    THROUGH_DRUM_LAYER,
    aroundLabel,
    throughKitLayer,
    SPLICE_PARTITION_OPTS,
  } from '../../views/splice-options';
  import { SCOPE_OPTS } from '../../views/node-options';

  let { store, node }: { store: TriggerLab; node: GraphNode } = $props();

  const jitter = $derived(node.spliceJitter ?? 0);
  const partition = $derived(node.splicePartition ?? 'hoop');
  const waitMode = $derived(node.spliceWaitMode ?? 'lit');

  // Which layers can send light anywhere, given what the splice covers and how it is cut. Through
  // the kit needs more than one drum and a cut that has drums as units; through a drum needs hoops.
  const showThroughKit = $derived(node.scope === 'kit' && partition !== 'scope');
  const showThroughDrum = $derived(partition === 'hoop' && node.scope !== 'hoop');
  const kitLayer = $derived(throughKitLayer(partition));

  // Explanations live in each label's ⓘ, never as a paragraph under the field (Field.svelte).
  const THROUGH_KIT_INFO =
    'Sends the light from drum to drum across the kit, one step apart, in the order below. With THROUGH DRUM as well, it spirals.';
  const THROUGH_DRUM_INFO = 'Sends the light from hoop to hoop up each drum, one step apart, in the order below.';
  const AROUND_INFO = 'Brings each splice on after the one before it, one step apart, in the order below.';

  type OrderItem = { id: string; label: string };
  const drumItems = $derived(store.kitDrumInfos.map((d) => ({ id: d.id, label: d.label })));
  // Hoops are numbered within their drum. On a drum-scoped splice the list is that drum's hoops;
  // across the kit it covers the most hoops any drum has, since drums may differ.
  const hoopItems = $derived.by((): OrderItem[] => {
    const infos = store.kitDrumInfos;
    const target = node.scope === 'drum' ? infos.find((d) => d.id === node.targetId) : undefined;
    const count = target ? target.hoopCount : Math.max(1, ...infos.map((d) => d.hoopCount));
    return Array.from({ length: count }, (_, i) => ({ id: String(i + 1), label: `Hoop ${i + 1}` }));
  });

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
      <h4 class="grouptitle">Splice</h4>

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

      <SpliceMoveAround {store} {node} />
    </section>

    <section class="group">
      <h4 class="grouptitle">MOVE THROUGH</h4>

      <Field label="Mode" info={SPLICE_WAIT_MODE_HINTS[waitMode]}>
        <SegmentedControl
          value={waitMode}
          options={SPLICE_WAIT_MODE_OPTS}
          onChange={(v) => store.setSpliceSetting(node, { spliceWaitMode: v as voice.SpliceWaitMode })}
          ariaLabel="Splice move through mode"
        />
      </Field>

      {#if showThroughKit}
        <SpliceThroughLayer {store} {node} label="THROUGH KIT" info={THROUGH_KIT_INFO} aria="Through kit" layer={kitLayer} items={drumItems} />
      {/if}
      {#if showThroughDrum}
        <SpliceThroughLayer {store} {node} label="THROUGH DRUM" info={THROUGH_DRUM_INFO} aria="Through drum" layer={THROUGH_DRUM_LAYER} items={hoopItems} />
      {/if}
      <!-- Round-the-hoop arrival is a REVEAL: with Lit every splice is already on, so there is
           nothing for it to do until the mode hides the parts that are waiting. -->
      {#if waitMode !== 'lit'}
        <SpliceThroughLayer {store} {node} label={aroundLabel(partition)} info={AROUND_INFO} aria="Around" layer={AROUND_LAYER} />
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
