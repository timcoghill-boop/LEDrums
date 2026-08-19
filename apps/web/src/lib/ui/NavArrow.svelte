<script lang="ts">
  /* One step through an ordered list — the ◀ / ▶ of a chip-row stepper (Setlist songs,
     song sections).

     ONE arrow, not a pair, because the two ends of a stepper belong on either side of the
     thing being stepped, and a component that renders both cannot be split across the list
     it flanks.

     Two rules it exists to enforce, so no bar re-decides them:

     1. AT THE END IT GOES DEAD, IT DOES NOT WRAP. The setlist clamps (core
        `navigation.ts`): on a live set a stray extra tap must never teleport the rig back
        to song 1. A disabled arrow is the visible half of that promise, so `disabled` is a
        state the caller reports, never a thing this component guesses.
     2. IT SAYS WHAT ELSE DRIVES IT. The same step is bound to a MIDI note / OSC address in
        Settings → Controls, and a drummer with both hands full needs that far more than the
        mouse-clickable arrow. `binding` puts it in the tooltip; `bindingInvite` is what to
        say when nothing is bound yet. */
  import IconButton from './IconButton.svelte';
  import { navArrowLabel, navArrowTip, type NavArrowDirection } from './nav-arrow-tip';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';

  type Props = {
    direction: NavArrowDirection;
    /** What one press steps, lower-case singular — "song", "section". Builds the label. */
    unit: string;
    /** True when there is nowhere to step (the list clamps at this end). */
    disabled?: boolean;
    /** The MIDI/OSC that also fires this step, e.g. `MIDI C1 · /ledrums/next_song`. */
    binding?: string | null;
    /** Shown instead of `binding` when nothing is bound — where to go to bind it. */
    bindingInvite?: string;
    size?: number;
    onclick?: () => void;
  };

  let { direction, unit, disabled = false, binding = null, bindingInvite, size = 14, onclick }: Props = $props();

  const label = $derived(navArrowLabel(direction, unit));
  const tip = $derived(navArrowTip(direction, unit, disabled, binding, bindingInvite));
</script>

<!-- `label` stays the accessible verb; `tip` is the hover copy. Both tooltip slots get it, so
     the arrow reads the same whether it is live or clamped. -->
<IconButton
  icon={direction === 'prev' ? ChevronLeft : ChevronRight}
  {label}
  {size}
  {disabled}
  {onclick}
  tooltipText={tip}
  disabledReason={tip}
/>
