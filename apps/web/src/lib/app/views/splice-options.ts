/* Option arrays + row derivation for the Splice node editor.
   Pure TS (no runes, no `.svelte`) so the row logic — which is the only part with any real
   decisions in it — is unit-testable without a DOM, like `node-options.ts` beside it. */
import { voice } from '@ledrums/core';
import type { Bus, EffectDef, GraphNode } from '../../trigger-lab/sim';

export const SPLICE_PARTITION_OPTS: Array<{ value: voice.SplicePartition; label: string }> = [
  { value: 'hoop', label: 'Hoop' },
  { value: 'drum', label: 'Drum' },
  { value: 'scope', label: 'Scope' },
];

export const SPLICE_CHASE_OPTS: Array<{ value: voice.SpliceChaseMode; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'step', label: 'Chase' },
  { value: 'smooth', label: 'Spin' },
  { value: 'stagger', label: 'Stagger' },
];

/** One-line explanation of what each motion actually moves — the three are easy to confuse. */
export const SPLICE_CHASE_HINTS: Record<voice.SpliceChaseMode, string> = {
  off: '',
  step: 'Each splice hands its content to the next one, a splice per interval.',
  smooth: 'The whole cut glides around, one full lap per interval.',
  stagger: 'The whole cut jumps by a set number of pixels each interval — the same movement as Spin, but landing on steps instead of gliding.',
};

/**
 * Slice motion: the same four modes as a splice, named for what they do to SLABS. `smooth` is
 * SWEEP rather than Spin — a splice's cut rotates round a circular hoop, but a slice's slabs travel
 * along a straight axis, and "spin" would promise a rotation this node does not do.
 */
export const SLICE_CHASE_OPTS: Array<{ value: voice.SpliceChaseMode; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'step', label: 'Chase' },
  { value: 'smooth', label: 'Sweep' },
  { value: 'stagger', label: 'Stagger' },
];

export const SLICE_CHASE_HINTS: Record<voice.SpliceChaseMode, string> = {
  off: '',
  step: 'Each slice hands its content to the next one, a slice per interval.',
  smooth: 'The slices glide along the axis through the kit, one whole span per interval, wrapping round at the end.',
  stagger: 'The slices jump along the axis by a set share of the span each interval — the same movement as Sweep, landing on steps instead of gliding.',
};

/** What a slice cuts. SPACE is a box of the room you place and size. */
export const SLICE_ON_OPTS: Array<{ value: 'kit' | 'drum' | 'space'; label: string }> = [
  { value: 'kit', label: 'Kit' },
  { value: 'drum', label: 'Drum' },
  { value: 'space', label: 'Space' },
];

export const SLICE_AXIS_OPTS: Array<{ value: voice.SliceAxis; label: string }> = [
  { value: 'x', label: 'X' },
  { value: 'y', label: 'Y' },
  { value: 'z', label: 'Z' },
];

export const SPLICE_DIRECTION_OPTS: Array<{ value: string; label: string }> = [
  { value: '1', label: 'Forward' },
  { value: '-1', label: 'Reverse' },
];

/** Sentinel for "no offset division". An empty string reads as UNSET to the Select, which then
    shows its placeholder instead of the option's own label. */
export const SPLICE_NO_DIVISION = '@none';

/**
 * The Select value that stands for "free time in milliseconds" in a merged timing dropdown.
 *
 * Every splice timing used to be TWO controls — a Division | Time toggle, then a row that changed
 * shape underneath it — repeated four times (rate, and the hoop, drum and colour chases). One
 * dropdown carries both now: the musical divisions, then "Free (ms)", which reveals the
 * millisecond field in place. Same two modes, same stored fields, one fewer row each.
 */
export const SPLICE_FREE_MS = '@ms';

/** The stored fields behind one timing. Four timings share one shape — the motion rate and the
    three chases — across both the Splice and Slice inspectors, so they are named once, here. */
export interface SpliceTimingKeys {
  mode: keyof GraphNode;
  division: keyof GraphNode;
  ms: keyof GraphNode;
}
export const SPLICE_RATE_KEYS: SpliceTimingKeys = { mode: 'spliceRateMode', division: 'spliceDivision', ms: 'spliceRateMs' };
export const SPLICE_PRIMARY_KEYS: SpliceTimingKeys = { mode: 'spliceOffsetMode', division: 'spliceOffsetDivision', ms: 'spliceOffsetMs' };
export const SPLICE_COLOUR_KEYS: SpliceTimingKeys = { mode: 'spliceColorOffsetMode', division: 'spliceColorOffsetDivision', ms: 'spliceColorOffsetMs' };
export const SPLICE_DRUM_KEYS: SpliceTimingKeys = { mode: 'spliceDrumOffsetMode', division: 'spliceDrumOffsetDivision', ms: 'spliceDrumOffsetMs' };

/** A merged timing dropdown's options: the given divisions, then the free-time entry. */
export const spliceTimingOptions = (divisions: Array<{ value: string; label: string }>): Array<{ value: string; label: string }> => [
  ...divisions,
  { value: SPLICE_FREE_MS, label: 'Free (ms)' },
];

/** The value a merged timing dropdown shows for a stored `(mode, division)` pair. */
export function spliceTimingValue(mode: 'beats' | 'time' | undefined, division: string | undefined, fallback: string): string {
  if (mode === 'time') return SPLICE_FREE_MS;
  return division ?? fallback;
}

/**
 * Translate a merged timing dropdown's choice back into the node's two stored fields.
 *
 * Picking a division also sets the mode back to `beats`, so leaving Free is one click rather
 * than a trip to a separate toggle. The "none" sentinel stores `undefined`, exactly as the
 * division Select it replaces did — so a show saved before this change reads back identically.
 */
export function spliceTimingPatch(
  choice: string,
  keys: { mode: string; division: string },
): Record<string, 'beats' | 'time' | string | undefined> {
  if (choice === SPLICE_FREE_MS) return { [keys.mode]: 'time' };
  return { [keys.mode]: 'beats', [keys.division]: choice === SPLICE_NO_DIVISION ? undefined : choice };
}

/** Division options for a cascade offset, with an explicit "no offset" entry first. */
export const spliceOffsetDivisionOptions = (divisions: Array<{ value: string; label: string }>): Array<{ value: string; label: string }> => [
  { value: SPLICE_NO_DIVISION, label: 'None (together)' },
  ...divisions,
];

/**
 * Play modes a splice offers. `hold` is deliberately absent: nothing in the engine or the server
 * branches on it — only `oneshot` vs not — so it and `loop` were the same thing under two names.
 * A persisted `hold` still resolves (it is "not oneshot"); the editor just shows it as Loop.
 */
export const SPLICE_PLAY_OPTS: Array<{ value: 'oneshot' | 'loop'; label: string }> = [
  { value: 'oneshot', label: 'One-shot' },
  { value: 'loop', label: 'Loop' },
];

export const SPLICE_LOOP_RETRIGGER_OPTS: Array<{ value: 'stop' | 'restart'; label: string }> = [
  { value: 'stop', label: 'Stop' },
  { value: 'restart', label: 'Restart' },
];

export const SPLICE_LOOP_RETRIGGER_HINTS: Record<'stop' | 'restart', string> = {
  stop: 'Hit again to stop the loop — the node toggles itself, so repeated hits never stack loops.',
  restart: 'Hit again to re-sync the loop from the top, replacing the one already running.',
};

/** The order the units start moving in when a cascade offset is set. */
export const SPLICE_ORDER_OPTS: Array<{ value: voice.SpliceOrder; label: string }> = [
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
  { value: 'outside-in', label: 'Outside in' },
  { value: 'random', label: 'Random' },
];

export const SPLICE_MOTION_MODE_OPTS: Array<{ value: voice.SpliceMotionMode; label: string }> = [
  { value: 'restart', label: 'Restart' },
  { value: 'continuous', label: 'Continuous' },
  { value: 'latched', label: 'Latched' },
];

/** What a hit does to the motion — the pair is easy to mix up, so each says it outright. */
export const SPLICE_MOTION_MODE_HINTS: Record<voice.SpliceMotionMode, string> = {
  restart: 'Every hit puts the movement back to its starting position.',
  continuous: 'The movement free-runs, even while the kit is dark — a hit lands wherever it has travelled unseen.',
  latched: 'The movement only runs while the lights are up: it stops where the fade left it, and the next hit carries on from there.',
};

/**
 * Layer options for a splice, with each layer's polyphony spelled out — because that rule IS
 * the sustain-or-cut choice: a MONO layer releases whatever it was already playing when a new
 * voice starts (so a sequencer stepping between splice nodes cuts each hoop as it moves on),
 * while a POLY layer lets them overlap and fade out on their own envelopes.
 */
export function spliceLayerOptions(buses: readonly Bus[]): Array<{ value: string; label: string }> {
  return buses.map((b) => ({ value: b.id, label: `${b.name} · ${b.polyphony === 'mono' ? 'cuts' : 'sustains'}` }));
}

export const SPLICE_WAIT_MODE_OPTS: Array<{ value: voice.SpliceWaitMode; label: string }> = [
  { value: 'lit', label: 'Lit' },
  { value: 'dark', label: 'Dark' },
  { value: 'fade', label: 'Fade' },
  { value: 'pulse', label: 'Pulse' },
];

/** What a unit does before the cascade reaches it — the difference is whether the LIGHT travels
    or only the movement does. */
export const SPLICE_WAIT_MODE_HINTS: Record<voice.SpliceWaitMode, string> = {
  lit: 'Everything lights at once and holds still until the movement reaches it.',
  dark: 'Nothing lights until its turn comes, so the light itself travels across the kit.',
  fade: 'Each one fades up as its turn arrives and then stays lit — so every colour eases in, not just the first.',
  pulse: 'Each one runs its own attack, hold and fade as the cascade reaches it, then goes dark again — a pulse travelling across the kit.',
};

/** What one partition unit IS, for labelling the cascade controls — the offset runs across
    hoops under the hoop partition and across drums under the drum partition, so the controls
    say which rather than making the author infer it. */
export function spliceUnitNoun(partition: voice.SplicePartition | undefined): string {
  return partition === 'drum' ? 'Drum' : 'Hoop';
}

/** Sentinel for "this splice has no effect" in the per-row effect Select. Empty string is the
    Select's own placeholder state, so the no-effect choice needs a value of its own. */
export const SPLICE_NO_EFFECT = '@none';

/**
 * Effect options for one splice row: every selectable effect, grouped by collection order so
 * the list reads like the gallery rather than like a hash-map dump, with "No effect" first —
 * because colour-only is the DEFAULT thing a splice is, not an edge case.
 */
export function spliceEffectOptions(effects: readonly EffectDef[]): Array<{ value: string; label: string }> {
  const selectable = effects.filter((e) => !e.deprecated);
  const order = new Map(['hits', 'waves', 'particles', 'textures', 'ambient', 'meters', 'canvas'].map((t, i) => [t, i] as const));
  const sorted = [...selectable].sort((a, b) => {
    const ai = order.get(a.playType ?? 'ambient') ?? 99;
    const bi = order.get(b.playType ?? 'ambient') ?? 99;
    return ai - bi || a.name.localeCompare(b.name);
  });
  return [{ value: SPLICE_NO_EFFECT, label: 'No effect' }, ...sorted.map((e) => ({ value: e.id, label: e.name }))];
}

/** One editable splice row, resolved for display. */
export interface SpliceRow {
  index: number;
  color: string | null;
  effectId: string | null;
  muted: boolean;
  /** No colour AND no effect (or muted) — this splice renders nothing. */
  blank: boolean;
  /** This row's values come from the cycling fallback, not from an authored row of its own. */
  cycled: boolean;
}

/**
 * The rows the inspector edits: exactly `spliceCount` of them, since that is how many bands
 * actually render. Slots past the authored list show the values they will really render with
 * (the cycling fallback) and are flagged `cycled`, so an author sees what slot 5 does before
 * touching it — editing one simply materialises it.
 */
export function spliceRows(node: GraphNode): SpliceRow[] {
  const authored = node.splices ?? [];
  const count = Math.max(voice.MIN_SPLICE_COUNT, Math.min(voice.MAX_SPLICE_COUNT, node.spliceCount ?? voice.DEFAULT_SPLICE_COUNT));
  return Array.from({ length: count }, (_, index) => {
    const def = voice.spliceDefAt(authored, index);
    return {
      index,
      color: typeof def?.color === 'string' && def.color.length > 0 ? def.color : null,
      effectId: typeof def?.effectId === 'string' && def.effectId.length > 0 ? def.effectId : null,
      muted: !!def?.muted,
      blank: voice.isBlankSplice(def),
      cycled: index >= authored.length,
    };
  });
}

/** Short "what is in this splice" line for a row: its effect, its colour, or that it is blank. */
export function describeSpliceRow(row: SpliceRow, effectName: (id: string) => string): string {
  if (row.muted) return 'muted';
  if (row.effectId) return row.color ? `${effectName(row.effectId)} · tinted` : effectName(row.effectId);
  if (row.color) return 'colour';
  return 'blank';
}
