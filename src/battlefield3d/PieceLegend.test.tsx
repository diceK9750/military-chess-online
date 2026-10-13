// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup, render, screen, within} from '@testing-library/react';
import {afterEach, expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import {PIECES, PIECE_TYPES} from '../game/pieces';
import {PIECE_ICONS} from '../ui/PieceFace';
import {PieceLegend} from './PieceLegend';
const battlefieldStyles = readFileSync('src/battlefield3d/battlefield.css', 'utf8');

afterEach(cleanup);

test('shows all 16 formal names with the shared icons and appearance hints without a canvas', () => {
  const {container} = render(<PieceLegend/>);
  const entries = within(screen.getByRole('list', {name:'駒の種類と見分け方'})).getAllByRole('listitem');
  expect(entries).toHaveLength(16);
  PIECE_TYPES.forEach((type, index) => {
    expect(entries[index].querySelector('.piece-name')).toHaveTextContent(PIECES[type].label);
    expect(entries[index].querySelector('.piece-icon')).toHaveTextContent(PIECE_ICONS[type]);
    expect(entries[index].querySelector('.piece-icon')).toHaveAttribute('aria-hidden', 'true');
    expect(entries[index].querySelector('.piece-legend-hint')).not.toBeEmptyDOMElement();
  });
  expect(container.querySelector('canvas')).toBeNull();
});

test('distinguishes every officer family and tier with labeled 3/2/1 insignia', () => {
  render(<PieceLegend/>);
  const expected = [
    ['大将', '将官', '金色', 'gold', '⬡', 3],
    ['中将', '将官', '金色', 'gold', '⬡', 2],
    ['少将', '将官', '金色', 'gold', '⬡', 1],
    ['大佐', '佐官', '銀色', 'silver', '●', 3],
    ['中佐', '佐官', '銀色', 'silver', '●', 2],
    ['少佐', '佐官', '銀色', 'silver', '●', 1],
    ['大尉', '尉官', '水色', 'pale', '■', 3],
    ['中尉', '尉官', '水色', 'pale', '■', 2],
    ['少尉', '尉官', '水色', 'pale', '■', 1],
  ] as const;
  for (const [name, family, color, accent, mark, tier] of expected) {
    const entry = screen.getByText(name).closest('[role="listitem"]')!;
    const insignia = within(entry as HTMLElement).getByRole('img', {name:`${family}・${color}の印${tier}個`});
    expect(insignia).toHaveClass(`piece-legend-insignia--${accent}`);
    expect(insignia.querySelector('.piece-legend-marks')?.textContent).toBe(mark.repeat(tier));
  }
  expect(screen.getAllByRole('img')).toHaveLength(9);
  for (const type of PIECE_TYPES.slice(9)) {
    expect(screen.getByText(PIECES[type].label).closest('[role="listitem"]')?.querySelector('.piece-legend-insignia')).toBeNull();
  }
});

test('legend hints do not override the nested icon and name sizes or face layout', () => {
  const {container} = render(<><style>{battlefieldStyles}</style><PieceLegend/></>);
  const face = container.querySelector('.piece-face')!;
  expect(getComputedStyle(face).display).toBe('flex');
  expect(getComputedStyle(face.querySelector('.piece-icon')!).fontSize).toBe('24px');
  expect(getComputedStyle(face.querySelector('.piece-name')!).fontSize).toBe('14px');
  expect(getComputedStyle(container.querySelector('.piece-legend-hint')!).fontSize).toBe('12px');
});
