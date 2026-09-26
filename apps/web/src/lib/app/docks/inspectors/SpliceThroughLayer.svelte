<script lang="ts">
  /* One MOVE THROUGH layer, shared by the Splice and Slice inspectors: its step timing and — only
     once it is sending light — its order. The drums and hoops take a dragged sequence with the
     patterns as one-click starting orders; a layer without a sequence field (the splices round a
     hoop, a slice's slabs) is ordered by pattern alone. An order for a layer that is off would be a
     control that does nothing, so it stays hidden until the layer has a step. */
  import type { TriggerLab } from '../../../trigger-lab/store.svelte';
  import type { GraphNode } from '../../../trigger-lab/sim';
  import type { voice } from '@ledrums/core';
  import Field from '../../../ui/Field.svelte';
  import SegmentedControl from '../../../ui/SegmentedControl.svelte';
  import Select from '../../../ui/Select.svelte';
  import OrderList from '../../../ui/OrderList.svelte';
  import SpliceTiming from './SpliceTiming.svelte';
  import { DIVISION_OPTS } from '../../views/node-options';
  import {
    SPLICE_AROUND_ORDER_OPTS,
    SPLICE_NO_DIVISION,
    SPLICE_ORDER_OPTS,
    effectiveOrder,
    layerActive,
    spliceOffsetDivisionOptions,
    type ThroughLayer,
  } from '../../views/splice-options';

  type OrderItem = { id: string; label: string };

  let {
    store,
    node,
    label,
    info,
    aria,
    layer,
    items = null,
    orderOptions = SPLICE_AROUND_ORDER_OPTS,
  }: {
    store: TriggerLab;
    node: GraphNode;
    label: string;
    info: string;
    /** Accessible-name stem, e.g. "Through kit" → "Through kit division", "Through kit order". */
    aria: string;
    layer: ThroughLayer;
    /** What the order is OF, for a dragged sequence. Null (or a layer with no sequence field) → a pattern select. */
    items?: OrderItem[] | null;
    /** The pattern choices for a pattern-only layer. */
    orderOptions?: Array<{ value: voice.SpliceOrder; label: string }>;
  } = $props();

  const ORDER_INFO = 'Drag the chips into the order they light, or press ← and → on one. The patterns below are one-click starting orders.';
  const offsetDivisions = spliceOffsetDivisionOptions(DIVISION_OPTS);
  // Same seed resolution as `resolveSplices`, so a Random pattern shows the order it will fire in.
  const seed = $derived(Math.trunc(node.spliceSeed ?? 1) >>> 0);
  const pattern = $derived(((node[layer.pattern] as voice.SpliceOrder | undefined) ?? 'up'));
  const sequence = $derived(layer.sequence ? (node[layer.sequence] as Array<string | number> | undefined) : undefined);

  const ordered = $derived.by((): OrderItem[] => {
    if (!items) return [];
    const byId = new Map(items.map((item) => [item.id, item]));
    return effectiveOrder(items.map((item) => item.id), sequence?.map(String), pattern, seed).map((id) => byId.get(id)!);
  });

  function setSequence(ids: string[]): void {
    if (!layer.sequence) return;
    store.setSpliceSetting(node, { [layer.sequence]: layer.sequence === 'spliceHoopSequence' ? ids.map(Number) : ids });
  }
  /** A pattern REPLACES a dragged order, so it clears the sequence in the same edit. */
  function setPattern(order: voice.SpliceOrder): void {
    store.setSpliceSetting(node, layer.sequence ? { [layer.pattern]: order, [layer.sequence]: undefined } : { [layer.pattern]: order });
  }
</script>

<SpliceTiming {store} {node} {label} {info} {aria} keys={layer.keys} options={offsetDivisions} fallback={SPLICE_NO_DIVISION} msDefault={0} msMin={0} layout="stack" />
{#if layerActive(node, layer.keys)}
  {#if items && layer.sequence}
    <Field label="Order" info={ORDER_INFO}>
      <div class="order">
        <OrderList items={ordered} onReorder={setSequence} ariaLabel="{aria} order" />
        <!-- No pattern lit while a dragged order is in charge: the chips ARE the order then. -->
        <SegmentedControl
          value={sequence?.length ? '' : pattern}
          options={SPLICE_ORDER_OPTS}
          onChange={(v) => setPattern(v as voice.SpliceOrder)}
          ariaLabel="{aria} order pattern"
        />
      </div>
    </Field>
  {:else}
    <Field label="Order">
      <Select
        value={pattern}
        options={orderOptions}
        segment={false}
        onChange={(v) => setPattern(v as voice.SpliceOrder)}
        ariaLabel="{aria} order"
      />
    </Field>
  {/if}
{/if}

<style>
  /* Order: the dragged chips above the one-click patterns, in one field. */
  .order {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }
</style>
