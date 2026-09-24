import type { TriggerLab } from '../trigger-lab/store.svelte';
import type { ContextMenuAction } from '../ui/ContextMenu.svelte';
import ArrowLeft from '@lucide/svelte/icons/arrow-left';
import ArrowRight from '@lucide/svelte/icons/arrow-right';
import ArrowLeftToLine from '@lucide/svelte/icons/arrow-left-to-line';
import ArrowRightToLine from '@lucide/svelte/icons/arrow-right-to-line';
import CopyPlus from '@lucide/svelte/icons/copy-plus';
import Copy from '@lucide/svelte/icons/copy';
import ClipboardPaste from '@lucide/svelte/icons/clipboard-paste';
import Pencil from '@lucide/svelte/icons/pencil';
import ListPlus from '@lucide/svelte/icons/list-plus';
import Trash2 from '@lucide/svelte/icons/trash-2';

export function sectionActions(store: TriggerLab, sectionId: string, rename: () => void): ContextMenuAction[] {
  const sections = store.activeSongById?.sections ?? [];
  const index = sections.findIndex((section) => section.id === sectionId);
  const disabled = !store.canEditActiveSong || index < 0;
  const first = disabled || index === 0;
  const last = disabled || index === sections.length - 1;
  return [
    { label: 'Move left', icon: ArrowLeft, disabled: first, onSelect: () => store.moveSection(sectionId, index - 1) },
    { label: 'Move right', icon: ArrowRight, disabled: last, onSelect: () => store.moveSection(sectionId, index + 2) },
    { label: 'Move to start', icon: ArrowLeftToLine, disabled: first, onSelect: () => store.moveSection(sectionId, 0) },
    { label: 'Move to end', icon: ArrowRightToLine, disabled: last, onSelect: () => store.moveSection(sectionId, sections.length) },
    { label: 'Duplicate', icon: CopyPlus, disabled, onSelect: () => store.duplicateSection(sectionId) },
    { label: 'Rename', icon: Pencil, disabled, onSelect: rename },
    { label: 'Copy', icon: Copy, disabled, onSelect: () => void store.copySectionToClipboard(sectionId) },
    { label: 'Paste', icon: ClipboardPaste, disabled, onSelect: () => void store.pasteSectionFromClipboard() },
    { label: 'Add all missing default drum zone graphs', icon: ListPlus, disabled, onSelect: () => store.addMissingDrumZoneGraphs(sectionId) },
    { label: 'Delete', icon: Trash2, disabled, danger: true, onSelect: () => store.removeSection(sectionId) },
  ];
}
