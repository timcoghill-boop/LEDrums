import { describe, expect, it, vi } from 'vitest';
import { defaultProject, voice, withGlobalControlBinding } from '@ledrums/core';
import type { PixelOutput } from '@ledrums/io';
import { OutputManager } from './output-manager';
import { VoiceEngineHost } from './voice-engine-host';

/* The engine → clients recall echo.

   Relative navigation ("next song") is resolved INSIDE the engine, against the engine's own
   active position, at queue-drain time (core `navigation.ts` explains why it cannot be resolved
   at the server boundary). Nothing outside the engine can predict where it landed — so the host
   has to be TOLD, and then tell the clients, or a footswitch advances the rig while every Setlist
   bar in the room keeps pointing at the song the set already left.

   These use the REAL engine on purpose: the diagnostic under test is the engine's, and a fake
   engine would assert nothing but that a callback field exists. */

class FakeOutput implements PixelOutput {
  nextFrame(): void {}
  send(): void {}
  close(): void {}
}

/** Two songs, two sections each — enough to step both axes and to clamp. */
function twoSongShow(): voice.Show {
  return {
    ...voice.emptyShow(),
    songs: [
      {
        id: 'songA',
        name: 'A',
        sections: [
          { id: 'a0', name: 'A0', slots: {} },
          { id: 'a1', name: 'A1', slots: {} },
        ],
      },
      {
        id: 'songB',
        name: 'B',
        sections: [
          { id: 'b0', name: 'B0', slots: {} },
          { id: 'b1', name: 'B1', slots: {} },
        ],
      },
    ],
  };
}

/** A host on the real engine, with `note` bound to `action` and a recorded recall sink. */
function hostBoundTo(action: 'nextSong' | 'nextSection' | 'prevSection', note: number) {
  const project = defaultProject();
  const host = new VoiceEngineHost(project, null, new OutputManager(() => new FakeOutput()));
  host.setInputMap({ ...project.inputMap, globalControls: withGlobalControlBinding({}, action, { midiNote: note }) });
  host.setShow(twoSongShow());
  const recalled = vi.fn();
  host.onSectionRecalled = recalled;
  return { host, recalled };
}

/** A note the default zone-map does NOT claim, so the binding is the only thing that can fire. */
const FREE_NOTE = 100;

describe('engine recall → onSectionRecalled', () => {
  it('reports where a bound MIDI note moved the set', () => {
    const { host, recalled } = hostBoundTo('nextSection', FREE_NOTE);

    host.applyInput({ kind: 'noteOn', note: FREE_NOTE, velocity: 1 });
    host.step(16); // the engine resolves navigation at queue drain, not at applyInput

    expect(recalled).toHaveBeenCalledWith('songA', 'a1');
  });

  it('reports a song-axis move landing on the target song FIRST section', () => {
    const { host, recalled } = hostBoundTo('nextSong', FREE_NOTE);

    host.applyInput({ kind: 'noteOn', note: FREE_NOTE, velocity: 1 });
    host.step(16);

    expect(recalled).toHaveBeenCalledWith('songB', 'b0');
  });

  it('stays quiet when the move is clamped, so nothing re-recalls the section already up', () => {
    const { host, recalled } = hostBoundTo('prevSection', FREE_NOTE);

    host.applyInput({ kind: 'noteOn', note: FREE_NOTE, velocity: 1 });
    host.step(16);

    expect(recalled).not.toHaveBeenCalled();
  });

  // The host's own activeSongId is what CC #0 section recall resolves against. A global-control
  // song change never passes through applyInput's `recallSection` branch, so before the
  // diagnostic sync it went stale — and the next CC #0 indexed into the song the set had left.
  it('follows the engine song, so CC #0 resolves against where the set actually is', () => {
    const { host } = hostBoundTo('nextSong', FREE_NOTE);
    expect(host.getActiveSongId()).toBe('songA');

    host.applyInput({ kind: 'noteOn', note: FREE_NOTE, velocity: 1 });
    host.step(16);

    expect(host.getActiveSongId()).toBe('songB');
  });

  it('also reports an ordinary absolute recall, so clients converge either way', () => {
    const { host, recalled } = hostBoundTo('nextSection', FREE_NOTE);

    host.applyInput({ kind: 'recallSection', songId: 'songB', sectionId: 'b1' });
    host.step(16);

    expect(recalled).toHaveBeenCalledWith('songB', 'b1');
  });
});
