import { expect, test } from 'vitest';
import { defaultPlacement } from '../dev/fixtures';
import { createPreset, materializePreset, validateLibrary, readLibrary, writeLibrary, FORMATION_LIMIT } from './library';
test('own formation roundtrip validates all 23 sites and creates fresh IDs without saving any IDs or enemy data', () => {
  const pieces=defaultPlacement(1),preset=createPreset(pieces,' 自作 '),first=materializePreset(preset),second=materializePreset(preset);
  expect(preset.name).toBe('自作');expect(preset.placements).toHaveLength(23);expect(first.map(p=>p.position)).toEqual(pieces.map(p=>p.position));
  expect(first[0].id).not.toBe(second[0].id);expect(JSON.stringify(preset)).not.toContain(pieces[0].id);expect(first.every(p=>p.owner===1)).toBe(true);
  expect(()=>createPreset(defaultPlacement(2),'敵')).toThrow();
});
test.each(['', 'a'.repeat(41), 'bad\nname'])('invalid name %s is rejected', name => expect(()=>createPreset(defaultPlacement(1),name)).toThrow());
test('duplicates, unknown fields, corrupt count, CPU sites and forbidden placement are rejected before applying', () => {
  const p=createPreset(defaultPlacement(1),'陣形');
  for(const bad of [[p,p],[{...p,internalId:'secret'}],[{...p,placements:p.placements.slice(1)}],[{...p,placements:p.placements.map(a=>({...a,site:'HQ-P2'}))}],[{...p,version:2}],[{...p,placements:p.placements.map(a=>({...a,type:'unknown'}))}]])expect(()=>validateLibrary(bad)).toThrow();
  const flag=p.placements.find(a=>a.type==='flag')!,entrance=p.placements.find(a=>a.site==='B4')!;
  expect(()=>validateLibrary([{...p,placements:p.placements.map(a=>a===flag?{...a,site:entrance.site}:a===entrance?{...a,site:flag.site}:a)}])).toThrow();
});
test('storage quota or blocked storage never mutates preset or current placement', () => {
  const pieces=defaultPlacement(1),p=createPreset(pieces,'陣形'),before=JSON.stringify({pieces,p});
  expect(()=>writeLibrary([p],{setItem:()=>{throw new Error('Quota');}})).toThrow('Quota');expect(JSON.stringify({pieces,p})).toBe(before);
  expect(()=>readLibrary({getItem:()=>'{bad'})).toThrow();expect(()=>readLibrary({getItem:()=>{throw new Error('Denied');}})).toThrow();
});
test('library limit and multiple preset changes survive storage roundtrip', () => {
  const presets=Array.from({length:FORMATION_LIMIT},(_,i)=>createPreset(defaultPlacement(1),`陣形 ${i}`));let text='';
  writeLibrary(presets,{setItem:(_,v)=>{text=v;}});expect(readLibrary({getItem:()=>text})).toEqual(presets);
  expect(()=>writeLibrary([...presets,createPreset(defaultPlacement(1),'超過')],{setItem:()=>{}})).toThrow();
});
