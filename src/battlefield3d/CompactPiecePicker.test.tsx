// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {CompactPiecePicker} from './CompactPiecePicker';
import {toBattlefieldView} from './state';
import {scenario} from '../dev/fixtures';
afterEach(cleanup);
test('own names are readable and only the canonical site handler is called',()=>{
 const state=toBattlefieldView(scenario('highFlight'),1,{selectedSite:null,legalTargets:[],pendingSite:null,laneCandidates:[],selectedLane:undefined,interactionEnabled:true}),select=vi.fn();render(<CompactPiecePicker state={state} busy={false} onSiteSelect={select}/>);
 fireEvent.click(screen.getByRole('button',{name:'駒一覧'}));const panel=screen.getByRole('dialog');expect(within(panel).queryByText(/CPU/)).not.toBeInTheDocument();
 const piece=state.pieces.find(p=>p.owner===1&&!p.unknown)!;const button=within(panel).getAllByRole('button').find(b=>b.getAttribute('aria-label')?.startsWith(piece.position+' '))!;fireEvent.click(button);expect(select).toHaveBeenCalledExactlyOnceWith(piece.position);expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'駒一覧'})).toHaveFocus();
});
test('legal destinations use the same site handler and never disclose the target enemy type',()=>{
 const state=toBattlefieldView(scenario('highFlight'),1,{selectedSite:null,legalTargets:[],pendingSite:null,laneCandidates:[],selectedLane:undefined,interactionEnabled:true}),select=vi.fn(),own=state.pieces.find(p=>p.owner===1)!,enemy=state.pieces.find(p=>p.owner!==1)!;
 render(<CompactPiecePicker state={{...state,interaction:{...state.interaction,selectedSite:own.position,legalTargets:[enemy.position]}}} busy={false} onSiteSelect={select}/>);fireEvent.click(screen.getByRole('button',{name:'駒一覧'}));const targets=screen.getByRole('region',{name:'選択駒の合法地点'});expect(targets).toHaveTextContent('敵駒');fireEvent.click(within(targets).getByRole('button'));expect(select).toHaveBeenCalledExactlyOnceWith(enemy.position);
});
test('CPU or animation lock blocks all selections, including when the picker was already open',()=>{
 const state=toBattlefieldView(scenario('highFlight'),1,{selectedSite:null,legalTargets:[],pendingSite:null,laneCandidates:[],selectedLane:undefined,interactionEnabled:true}),select=vi.fn();const view=render(<CompactPiecePicker state={state} busy={false} onSiteSelect={select}/>);fireEvent.click(screen.getByRole('button',{name:'駒一覧'}));view.rerender(<CompactPiecePicker state={state} busy onSiteSelect={select}/>);const buttons=within(screen.getByRole('region',{name:'名前から駒を選ぶ'})).getAllByRole('button');for(const b of buttons){expect(b).toBeDisabled();fireEvent.click(b);}expect(select).not.toHaveBeenCalled();fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
test('replay displays known names as read-only information and no internal identifiers',()=>{
 const state=toBattlefieldView(scenario('highFlight'),1,{selectedSite:null,legalTargets:[],pendingSite:null,laneCandidates:[],selectedLane:undefined,interactionEnabled:true}),select=vi.fn();render(<CompactPiecePicker state={{...state,phase:'replay'}} busy={false} onSiteSelect={select}/>);fireEvent.click(screen.getByRole('button',{name:'駒名'}));expect(screen.getByRole('dialog').textContent).not.toContain('local-');expect(within(screen.getByRole('region',{name:'名前から駒を選ぶ'})).queryByRole('button')).not.toBeInTheDocument();expect(select).not.toHaveBeenCalled();
});
