// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { BattlefieldOverview } from './BattlefieldOverview';
import { toBattlefieldView } from './state';
import { scenario } from '../dev/fixtures';
afterEach(cleanup);
test('overview preserves position and ownership without exposing enemy identities',()=>{
 const view=toBattlefieldView(scenario('highFlight'),1);
 const {container}=render(<BattlefieldOverview state={view}/>);
 expect(screen.getByRole('img',{name:'全体位置図'})).toBeTruthy();
 expect(container.querySelectorAll('circle').length).toBe(view.pieces.length);
 expect(container.textContent).toBe('敵軍 ↑自軍 ↓ · 全体位置');
 expect(container.innerHTML).not.toMatch(/aircraft|flag|general|飛行機|軍旗/);
});
