import { expect, test } from 'vitest';
import { TapGesture } from './gesture';
test('small pointer motion is a tap, independent of double-tap timing', () => {
  const gesture = new TapGesture(); gesture.down(1, 20, 30); expect(gesture.up(1, 22, 32)).toBe(true);
  gesture.down(1, 20, 30); expect(gesture.up(1, 20, 30)).toBe(true);
});
test('drag returning to its origin cannot select', () => {
  const gesture = new TapGesture(); gesture.down(1, 20, 30); gesture.move(1, 40, 50); expect(gesture.up(1, 20, 30)).toBe(false);
});
test('pinch never selects when either pointer is released', () => {
  const gesture = new TapGesture(); gesture.down(1, 20, 30); gesture.down(2, 40, 50);
  expect(gesture.up(1, 20, 30)).toBe(false); expect(gesture.up(2, 40, 50)).toBe(false);
  gesture.down(3, 20, 30); expect(gesture.up(3, 20, 30)).toBe(true);
});
test('cancel and unmatched pointer up cannot select', () => {
  const gesture = new TapGesture(); gesture.down(1, 20, 30); gesture.cancel(1);
  expect(gesture.up(1, 20, 30)).toBe(false); expect(gesture.up(9, 20, 30)).toBe(false);
});
