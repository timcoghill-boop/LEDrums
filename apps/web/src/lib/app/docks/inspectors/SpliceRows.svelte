<script lang="ts">
  /* The content rows, shared by the Splice and Slice inspectors: one row per splice or slice — a
     colour, an effect, or both (the colour then tints the effect), or neither (it stays blank).
     Lifted verbatim from the Splice inspector; only the noun is a prop. */
  import type { TriggerLab } from '../../../trigger-lab/store.svelte';
  import type { GraphNode } from '../../../trigger-lab/sim';
  import Field from '../../../ui/Field.svelte';
  import Select from '../../../ui/Select.svelte';
  import Slider from '../../../ui/Slider.svelte';
  import ColorField from '../../../ui/ColorField.svelte';
  import IconButton from '../../../ui/IconButton.svelte';
  import Toggle from '../../../ui/Toggle.svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { SPLICE_NO_EFFECT, describeSpliceRow, spliceEffectOptions, spliceRows } from '../../views/splice-options';

  let { store, node, noun = 'Splice' }: { store: TriggerLab; node: GraphNode; noun?: 'Splice' | 'Slice' } = $props();

  const rows = $derived(spliceRows(node));
  const effectOpts = $derived(spliceEffectOptions(store.effects));
  const tint = $derived(node.spliceTint ?? 1);
  const anyTinted = $derived(rows.some((r) => r.color && r.effectId && !r.muted));
  const effectName = (id: string) => store.effects.find((e) => e.id === id)?.name ?? id;
  const TINT_INFO = $derived(`How strongly a ${noun.toLowerCase()}'s colour recolours the effect inside it. A ${noun.toLowerCase()} with no colour is never tinted.`);
</script>

<section class="group">
  <div class="grouphead">
    <h4 class="grouptitle">{noun}s</h4>
    <IconButton
      icon={Plus}
      label="Add {noun.toLowerCase()}"
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
              ariaLabel="{noun} {row.index + 1} on"
            />
            <IconButton
              icon={Trash2}
              label="Remove {noun.toLowerCase()} {row.index + 1}"
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
            ariaLabel="{noun} {row.index + 1} colour"
          />
          <!-- Effect names come from the show, so a three-effect show must not turn this
               into three segments of ellipsised text — stay a dropdown at every length. -->
          <Select
            value={row.effectId ?? SPLICE_NO_EFFECT}
            options={effectOpts}
            segment={false}
            onChange={(v) => store.setSpliceAt(node, row.index, { effectId: v === SPLICE_NO_EFFECT ? undefined : v })}
            ariaLabel="{noun} {row.index + 1} effect"
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
        ariaLabel="{noun} tint amount"
      />
    </Field>
  {:else if rows.every((r) => r.blank)}
    <!-- The one explanation that earns its space: the empty state, where nothing on screen
         says yet what a splice row is for. -->
    <p class="hint">Give a {noun.toLowerCase()} a colour, an effect, or both — with both, the colour tints the effect.</p>
  {/if}
</section>

<style>
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
