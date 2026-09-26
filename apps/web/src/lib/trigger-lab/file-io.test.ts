// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import { openTextFile, safeFileName, saveTextFile } from './file-io';

/* The file panel adapter. The desktop route asks the shell for its native panels; the browser route
   downloads / picks. What matters here: the desktop commands are called with the right arguments, a
   cancel reads as a cancel, and an OLDER desktop shell (no such command) falls back to the browser
   route instead of failing. */

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  invoke.mockReset();
  vi.restoreAllMocks();
});

const asDesktop = () => ((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {});

describe('safeFileName', () => {
  it('replaces path and reserved characters, and falls back when nothing is left', () => {
    expect(safeFileName('Chorus: a/b?', 'graph')).toBe('Chorus- a-b-');
    expect(safeFileName('  Kick   rim  ', 'graph')).toBe('Kick rim');
    expect(safeFileName('...hidden', 'graph')).toBe('hidden');
    expect(safeFileName('   ', 'node')).toBe('node');
  });
});

describe('desktop route', () => {
  it('saves through the shell’s panel', async () => {
    asDesktop();
    invoke.mockResolvedValueOnce(true);
    expect(await saveTextFile('Kick.ledrums-graph.json', '{}')).toBe('saved');
    expect(invoke).toHaveBeenCalledWith('save_text_file', { suggestedName: 'Kick.ledrums-graph.json', contents: '{}' });
  });

  it('reads a closed panel as a cancel', async () => {
    asDesktop();
    invoke.mockResolvedValueOnce(false);
    expect(await saveTextFile('a.json', '{}')).toBe('cancelled');
    invoke.mockResolvedValueOnce(null);
    expect(await openTextFile()).toBe('cancelled');
  });

  it('returns the picked file’s name and text', async () => {
    asDesktop();
    invoke.mockResolvedValueOnce({ name: 'Kick.ledrums-graph.json', contents: '{"a":1}' });
    expect(await openTextFile()).toEqual({ name: 'Kick.ledrums-graph.json', text: '{"a":1}' });
  });

  it('falls back to a browser download when the shell has no such command', async () => {
    asDesktop();
    invoke.mockRejectedValueOnce(new Error('command save_text_file not found'));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    expect(await saveTextFile('a.json', '{}')).toBe('saved');
    expect(click).toHaveBeenCalled();
  });
});

describe('browser route', () => {
  it('downloads under the suggested name when there is no save picker', async () => {
    let downloaded = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download;
    });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    expect(await saveTextFile('Kick.ledrums-graph.json', '{}')).toBe('saved');
    expect(downloaded).toBe('Kick.ledrums-graph.json');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('opens a .json file through a file input, and reads a cancel as a cancel', async () => {
    let input: HTMLInputElement | null = null;
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      input = this;
    });
    const pending = openTextFile();
    await vi.waitFor(() => expect(input).not.toBeNull());
    expect(input!.accept).toContain('.json');
    input!.dispatchEvent(new Event('cancel'));
    expect(await pending).toBe('cancelled');
  });
});
