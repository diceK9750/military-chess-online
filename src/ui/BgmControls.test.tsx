// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AUDIO_SETTINGS_KEY, BgmControls } from './BgmControls';
beforeEach(() => { vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(); vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {}); });
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
test('audio is off, unloaded until a gesture, and can stop; preferences persist', async () => {
  const view = render(<BgmControls />);
  const audio = view.container.querySelector('audio')!;
  expect(audio).not.toHaveAttribute('src'); expect(audio.play).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('slider'), { target: { value: '40' } });
  fireEvent.click(screen.getByRole('button', { name: 'BGM ONにする' }));
  await screen.findByRole('button', { name: 'BGM OFFにする' });
  expect(audio.volume).toBe(.4); expect(audio).toHaveAttribute('src', '/audio/shenyang.mp3');
  expect(JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY)!)).toEqual({ enabled: true, volume: .4 });
  fireEvent.click(screen.getByRole('button', { name: 'BGM OFFにする' }));
  expect(audio.pause).toHaveBeenCalled(); expect(JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY)!).enabled).toBe(false);
});
test('stored ON never bypasses gesture requirement and unmount stops audio', async () => {
  localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify({ enabled: true, volume: .6 }));
  const view = render(<BgmControls />);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(screen.getByRole('slider')).toHaveValue('60');
  fireEvent.click(screen.getByRole('button', { name: 'BGM 再生' }));
  await screen.findByRole('button', { name: 'BGM OFFにする' });
  view.unmount(); expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
});
test('rejected playback is retryable and never falsely reports ON', async () => {
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('blocked'));
  render(<BgmControls />); fireEvent.click(screen.getByRole('button'));
  expect(await screen.findByRole('status')).toHaveTextContent('再生できません');
  expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button')); await waitFor(() => expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true'));
});
test('corrupt and unavailable preference storage do not prevent audio controls', () => {
  localStorage.setItem(AUDIO_SETTINGS_KEY, '{broken');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  render(<BgmControls />); expect(screen.getByRole('slider')).toHaveValue('25');
});
test('pending playback completion after unmount cannot start a stale session', async () => {
  let resolve!: () => void;
  vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(() => new Promise<void>(done => { resolve = done; }));
  const view = render(<BgmControls />); fireEvent.click(screen.getByRole('button')); view.unmount();
  await act(async () => resolve());
  expect(JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY)!).enabled).toBe(false);
});
