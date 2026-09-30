// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Intelligence, readIntelligence, INTELLIGENCE_KEY } from './Intelligence';
import { tacticalView } from '../intelligence/public';
import { inferEnemies } from '../intelligence/inference';
import { defaultPlacement } from '../dev/fixtures';
import { startGame } from '../game/game';
afterEach(()=>{cleanup();localStorage.clear();});
const view=()=>tacticalView(startGame(defaultPlacement(1),defaultPlacement(2),1),1);
test('OFF hides advice, ON shows at most three explanations and never a win probability',()=>{
 const v=view(),toggle=vi.fn(); const rendered=render(<Intelligence view={v} enabled={false} onToggle={toggle} hypotheses={[]} focus={null} onFocus={vi.fn()}/>);
 expect(screen.queryByLabelText('戦術候補1')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'AI参謀 ONにする'}));expect(toggle).toHaveBeenCalledOnce();
 rendered.rerender(<Intelligence view={v} enabled onToggle={toggle} hypotheses={inferEnemies(v)} focus={null} onFocus={vi.fn()}/>);
 expect(screen.getAllByRole('article')).toHaveLength(3);expect(screen.getByText('公開情報のみから解析')).toBeInTheDocument();expect(screen.queryByText(/勝率|%/)).not.toBeInTheDocument();
});
test('enemy inspection shows candidate names and public evidence without executing moves',()=>{
 const v=view(),focus=vi.fn(),hypotheses=inferEnemies(v),first=hypotheses[0];
 render(<Intelligence view={v} enabled onToggle={vi.fn()} hypotheses={hypotheses} focus={first.position} onFocus={focus}/>);
 fireEvent.click(screen.getByRole('button',{name:`${first.position} · 候補${first.candidates.length}種`}));expect(focus).toHaveBeenCalledWith(first.position);expect(screen.getByRole('status')).toHaveTextContent('候補');expect(screen.queryByRole('button',{name:'確定して実行'})).not.toBeInTheDocument();
});
test('preference defaults OFF and uses its own key',()=>{expect(readIntelligence()).toBe(false);localStorage.setItem(INTELLIGENCE_KEY,'true');expect(readIntelligence()).toBe(true);expect(localStorage.getItem('military-chess:cpu-match:v1')).toBeNull();});
