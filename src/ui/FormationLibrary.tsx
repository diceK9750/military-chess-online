import { useEffect, useRef, useState } from 'react';
import type { Piece } from '../game/types';
import { anchors } from '../game/board';
import { PIECES } from '../game/pieces';
import { createPreset, FORMATION_LIMIT, formationName, materializePreset, readLibrary, writeLibrary, type FormationPreset } from '../formation/library';

const GUIDE_KEY='military-chess:formation-guide:v1';
const signature=(placements: FormationPreset['placements'])=>placements.map(p=>`${p.site}:${p.type}`).sort().join('|');
const ownSignature=(pieces:readonly Piece[])=>signature(pieces.filter(p=>p.owner===1&&p.position!==null).map(p=>({site:p.position!,type:p.type})));
function Preview({preset}:{preset:FormationPreset}){
 return <svg className="formation-preview" role="img" aria-label={`陣形プレビュー ${preset.name}`} viewBox="0 0 146 100">{preset.placements.map(p=>{
  const a=anchors(p.site),x=a[0].x*24+2,y=(4-a[0].y)*24+2,w=a.length*24-2;
  return <g key={p.site}><rect x={x} y={y} width={w} height={22} rx={3} fill={PIECES[p.type].captures?'#315e72':'#647450'}/><text x={x+w/2} y={y+14} textAnchor="middle" fill="#fff6dc" fontSize="8">{PIECES[p.type].label}</text></g>;
 })}</svg>;
}
export function FormationLibrary({ pieces, onApply }: { pieces: readonly Piece[]; onApply(pieces: readonly Piece[]): void }) {
 const [loaded]=useState(()=>{try{return {presets:readLibrary(),error:''};}catch{return {presets:[],error:'陣形ライブラリを読み込めません。破損記録は適用せず保持しています。'};}});
 const [presets,setPresets]=useState<readonly FormationPreset[]>(loaded.presets);
 const [activeId,setActiveId]=useState(()=>loaded.presets.find(p=>signature(p.placements)===ownSignature(pieces))?.id??'');
 const [selected,setSelected]=useState(activeId),[name,setName]=useState(''),[editing,setEditing]=useState<'save'|'rename'|null>(null),[deleting,setDeleting]=useState(false);
 const [notice,setNotice]=useState({text:loaded.error,success:false});
 const [guide,setGuide]=useState(()=>{try{return localStorage.getItem(GUIDE_KEY)!=='done';}catch{return true;}});
 const nameInput=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(editing)nameInput.current?.focus();},[editing]);
 useEffect(()=>{if(guide){try{localStorage.setItem(GUIDE_KEY,'done');}catch{/* Optional guide. */}}},[guide]);
 const current=presets.find(p=>p.id===selected),active=presets.find(p=>p.id===activeId);
 const dirty=!active||signature(active.placements)!==ownSignature(pieces);
 const fail=(error:unknown,fallback:string)=>setNotice({text:error instanceof Error?error.message:fallback,success:false});
 function commit(next:readonly FormationPreset[],message:string,id?:string){
  try{if(loaded.error)throw Error(loaded.error);writeLibrary(next);setPresets(next);if(id!==undefined)setSelected(id);setNotice({text:message,success:true});return true;}
  catch(error){fail(error,'陣形を保存できません。現在の配置は変えていません。');return false;}
 }
 function submit(){
  try{
   if(editing==='save'){
    if(presets.length>=FORMATION_LIMIT)throw Error(`保存上限は${FORMATION_LIMIT}件です。`);
    const preset=createPreset(pieces,name);
    if(commit([...presets,preset],`「${preset.name}」を保存しました。`,preset.id)){setActiveId(preset.id);setEditing(null);}
   }else if(editing==='rename'&&current){const value=formationName(name);if(commit(presets.map(p=>p.id===current.id?{...p,name:value,updatedAt:new Date().toISOString()}:p),`「${value}」へ名前を変更しました。`))setEditing(null);}
  }catch(error){fail(error,'保存できませんでした。');}
 }
 function update(kind:'overwrite'|'favorite'){
  if(!current)return;
  try{const replacement=kind==='overwrite'?{...current,placements:createPreset(pieces,current.name).placements}:{...current,favorite:!current.favorite};
   if(commit(presets.map(p=>p.id===current.id?{...replacement,updatedAt:new Date().toISOString()}:p),kind==='overwrite'?`「${current.name}」へ現在の配置を上書き保存しました。`:'お気に入りを更新しました。')&&kind==='overwrite')setActiveId(current.id);
  }catch(error){fail(error,'更新できませんでした。');}
 }
 function load(){
  try{const fresh=readLibrary().find(p=>p.id===selected);if(!fresh)throw Error('保存陣形が見つかりません。');onApply(materializePreset(fresh));setActiveId(fresh.id);setNotice({text:`「${fresh.name}」を適用しました。`,success:true});}
  catch{setNotice({text:'保存陣形が不正です。配置は変えていません。',success:false});}
 }
 return <section className="formation-library" aria-label="自作陣形">
  <div className="formation-heading"><strong>自作陣形</strong><span>{presets.length}/{FORMATION_LIMIT}件</span></div>
  {guide&&<div className="formation-help"><p>この画面から自分の陣形を保存できます。配置を整えたら、名前を付けて保存しましょう。</p><button onClick={()=>{setGuide(false);try{localStorage.setItem(GUIDE_KEY,'done');}catch{/* Optional guide. */}}}>案内を閉じる</button></div>}
  <p className={'formation-state '+(dirty?'is-dirty':'is-saved')} role="status" aria-label="陣形の保存状態">{active?`編集中：${active.name} · ${dirty?'未保存変更あり':'保存済み'}`:'名前付き陣形は未保存'}<small>配置の自動保存とは別に、名前付きで残せます。</small></p>
  <button className="primary wide" onClick={()=>{setName(`自作陣形 ${presets.length+1}`);setEditing('save');setDeleting(false);}}>現在の配置を保存</button>
  {editing&&<form className="formation-name-form" aria-label={editing==='save'?'陣形を新規保存':'陣形の名前変更'} onSubmit={e=>{e.preventDefault();submit();}}><label>保存名 <input ref={nameInput} aria-label="自作陣形の名前" maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label><small>1〜40文字。現在の配置はそのままです。</small><div className="actions"><button className="primary" type="submit">{editing==='save'?'陣形を保存':'名前を変更する'}</button><button type="button" onClick={()=>setEditing(null)}>入力を取消</button></div></form>}
  {notice.text&&<p className={'formation-notice '+(notice.success?'is-success':'is-error')} role="status">{notice.text}</p>}
  <label className="formation-picker">保存済み陣形を選ぶ <select aria-label="保存済み陣形を選ぶ" value={selected} onChange={e=>{setSelected(e.target.value);setDeleting(false);setEditing(null);}}><option value="">選択してください</option>{[...presets].sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.updatedAt.localeCompare(a.updatedAt)||a.name.localeCompare(b.name)).map(p=><option key={p.id} value={p.id}>{p.favorite?'★ ':''}{p.name}</option>)}</select></label>
  {current&&<div className="formation-card"><Preview preset={current}/><div><strong>{current.favorite?'★ ':''}{current.name}</strong><small>更新 {new Date(current.updatedAt).toLocaleString('ja-JP')}</small><button onClick={load}>この陣形で適用</button><small>選ぶだけでは配置は変わりません。</small></div></div>}
  <div className="actions">
   <button disabled={!current} onClick={()=>update('overwrite')}>上書き保存</button><button disabled={!current} onClick={()=>{setName(current!.name);setEditing('rename');}}>名前変更</button>
   <button disabled={!current} onClick={()=>{try{if(presets.length>=FORMATION_LIMIT)throw Error('保存上限に達しました。');const copy=createPreset(materializePreset(current!),`${[...current!.name].slice(0,35).join('')} コピー`);commit([...presets,copy],`「${copy.name}」を複製しました。`,copy.id);}catch(error){fail(error,'陣形を複製できませんでした。');}}}>複製</button>
   <button disabled={!current} aria-pressed={current?.favorite??false} onClick={()=>update('favorite')}>お気に入り {current?.favorite?'解除':'登録'}</button><button disabled={!current} onClick={()=>setDeleting(true)}>削除</button>
  </div>
  {deleting&&current&&<div role="dialog" aria-label="陣形削除の確認"><p>「{current.name}」を削除しますか？ 現在の配置は残ります。</p><button onClick={()=>{if(commit(presets.filter(p=>p.id!==selected),'陣形を削除しました。','')){setDeleting(false);if(activeId===selected)setActiveId('');}}}>削除する</button><button onClick={()=>setDeleting(false)}>取消</button></div>}
 </section>;
}
