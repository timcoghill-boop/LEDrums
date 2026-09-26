<script lang="ts">
  /* One timing in one row, shared by the Splice and Slice inspectors: a dropdown of the musical
     divisions plus "Free (ms)", and the millisecond field only while Free is picked. Replaces a
     Division | Time toggle PLUS a value row that changed shape under it. The mapping to the two
     stored fields lives in the pure `spliceTimingValue` / `spliceTimingPatch`, where it is tested. */
  import type { TriggerLab } from '../../../trigger-lab/store.svelte';
  import type { GraphNode } from '../../../trigger-lab/sim';
  import Field from '../../../ui/Field.svelte';
  import Select from '../../../ui/Select.svelte';
  import CommitInput from '../../../ui/CommitInput.svelte';
  import { spliceTimingOptions, spliceTimingPatch, spliceTimingValue, type SpliceTimingKeys } from '../../views/splice-options';

  type SplicePatch = Parameters<TriggerLab['setSpliceSetting']>[1];

  let {
    store,
    node,
    label,
    info,
    aria,
    keys,
    options,
    fallback,
    msDefault,
    msMin,
    layout = 'row',
  }: {
    store: TriggerLab;
    node: GraphNode;
    label: string;
    info?: string;
    /** Accessible-name stem: the dropdown is "<aria> division", the ms field "<aria> milliseconds". */
    aria: string;
    keys: SpliceTimingKeys;
    options: Array<{ value: string; label: string }>;
    fallback: string;
    msDefault: number;
    msMin: number;
    /** `stack` puts the label above the dropdown — for long labels like THROUGH DRUM, whose ⓘ the
        row layout's label column would clip. */
    layout?: 'row' | 'stack';
  } = $props();
</script>

<Field {layout} {label} {info}>
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
