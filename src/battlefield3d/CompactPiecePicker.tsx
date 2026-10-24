import {useEffect,useRef,useState,type KeyboardEvent} from 'react';
import {PIECES} from '../game/pieces';
import type {Site} from '../game/types';
import {PieceFace} from '../ui/PieceFace';
import type {BattlefieldPiece,BattlefieldViewState} from './state';

/** Uses only the same allowlisted display state and site handler as the canvas. */
export function CompactPiecePicker({state,busy,onSiteSelect}:{state:BattlefieldViewState;busy:boolean;onSiteSelect(site:Site):void}){
 const [open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 const replay=state.phase==='replay',readOnly=replay||state.finished,enabled=state.interaction.interactionEnabled&&!busy&&!readOnly;
 const pieces=state.pieces.filter((p):p is Extract<BattlefieldPiece,{unknown:false}>=>!p.unknown&&(p.owner===state.viewer||readOnly));
 const selected=pieces.find(p=>p.position===state.interaction.selectedSite);
 const targets=[...new Set(state.interaction.legalTargets)];
 const close=()=>{setOpen(false);trigger.current?.focus();};
 useEffect(()=>{if(open)panel.current?.querySelector<HTMLButtonElement>('button')?.focus();},[open]);
 const pick=(site:Site)=>{if(!enabled)return;onSiteSelect(site);close();};
 function keys(e:KeyboardEvent){
  if(e.key==='Escape'){e.preventDefault();close();}
  if(e.key==='Tab'){
   const buttons=[...panel.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  }
 }
 return <><button ref={trigger} className="compact-picker-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}>{readOnly?'駒名':'駒一覧'}</button>{open&&<div className="compact-picker-backdrop"><div ref={panel} className="compact-picker" role="dialog" aria-modal="true" aria-label={readOnly?'駒名を確認':'駒・移動先を選ぶ'} onKeyDown={keys}>
  <header><strong>{readOnly?'駒名と現在位置':'駒・移動先を選ぶ'}</strong><button onClick={close}>一覧を閉じる</button></header>
  <p>{readOnly?'公開済みの駒を表示しています。':!enabled?'CPU手番・演出中は選択できません。':selected?`${PIECES[selected.type].label} ${selected.position} · ${state.phase==='setup'?'交換先':'移動先'}を選ぶ`:state.phase==='setup'?'駒名と交換先を選ぶと入れ替わります。最後に「配置確定」で対局を開始。':'駒名をタップして選択。移動先を選んだ後、確定ボタンで実行。'}</p>
  {!readOnly&&selected&&<section aria-label="選択駒の合法地点"><h4>{state.phase==='setup'?'交換先':'移動先'} · {targets.length}地点</h4><div className="compact-targets">{targets.map(site=>{const occupant=state.pieces.find(p=>p.position===site);return <button key={site} aria-label={site} disabled={!enabled} onClick={()=>pick(site)}>{site}{occupant?<small>{occupant.owner===state.viewer&&!occupant.unknown?PIECES[occupant.type].label:'敵駒'}</small>:null}</button>;})}</div>{!targets.length&&<p>この駒の移動先はありません。別の自軍駒を選んでください。</p>}</section>}
  <section aria-label="名前から駒を選ぶ"><h4>{readOnly?'盤上の駒':'自軍の駒'}</h4><div className="compact-piece-list">{pieces.map(piece=>{const contents=<><span>{piece.position}{readOnly?piece.owner===state.viewer?' · 自軍':' · CPU':''}</span><PieceFace type={piece.type}/></>;return readOnly?<div key={piece.position}>{contents}</div>:<button key={piece.position} aria-label={`${piece.position} ${PIECES[piece.type].label}`} aria-pressed={selected?.position===piece.position} disabled={!enabled} onClick={()=>pick(piece.position)}>{contents}</button>;})}</div></section>
 </div></div>}</>;
}
