// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { defaultPlacement } from '../dev/fixtures';
import { FORMATION_LIBRARY_KEY, readLibrary } from '../formation/library';
import { FormationLibrary } from './FormationLibrary';
afterEach(()=>{cleanup();localStorage.clear();vi.restoreAllMocks();});
function save(name='前衛') {fireEvent.click(screen.getByRole('button',{name:'現在の配置を保存'}));fireEvent.change(screen.getByLabelText('自作陣形の名前'),{target:{value:name}});fireEvent.click(screen.getByRole('button',{name:'陣形を保存'}));}
const swapped=()=>defaultPlacement(1).map(p=>({...p,position:p.position==='A2'?'B2' as const:p.position==='B2'?'A2' as const:p.position}));
test('named save, overwrite, rename, duplicate, favorite, load and confirmed deletion retain valid placements',()=>{
 const apply=vi.fn(),pieces=defaultPlacement(1);render(<FormationLibrary pieces={pieces} onApply={apply}/>);
 expect(screen.getByRole('button',{name:'現在の配置を保存'})).toBeVisible();save();expect(readLibrary()).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'上書き保存'}));fireEvent.click(screen.getByRole('button',{name:'名前変更'}));fireEvent.change(screen.getByLabelText('自作陣形の名前'),{target:{value:'防御'}});fireEvent.click(screen.getByRole('button',{name:'名前を変更する'}));expect(readLibrary()[0].name).toBe('防御');
 fireEvent.click(screen.getByRole('button',{name:'お気に入り 登録'}));expect(readLibrary()[0].favorite).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'複製'}));expect(readLibrary()).toHaveLength(2);fireEvent.click(screen.getByRole('button',{name:'この陣形で適用'}));expect(apply).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({owner:1})]));
 fireEvent.click(screen.getByRole('button',{name:'削除'}));expect(readLibrary()).toHaveLength(2);fireEvent.click(screen.getByRole('button',{name:'取消'}));expect(readLibrary()).toHaveLength(2);
 fireEvent.click(screen.getByRole('button',{name:'削除'}));fireEvent.click(screen.getByRole('button',{name:'削除する'}));expect(readLibrary()).toHaveLength(1);
});
test('blocked storage and later corruption never apply or destroy the current placement',()=>{
 const pieces=defaultPlacement(1),before=JSON.stringify(pieces),apply=vi.fn();render(<FormationLibrary pieces={pieces} onApply={apply}/>);
 const write=vi.spyOn(Storage.prototype,'setItem').mockImplementationOnce(()=>{throw new Error('容量不足');});save();expect(screen.getByText('容量不足')).toBeVisible();expect(readLibrary()).toHaveLength(0);
 write.mockRestore();fireEvent.click(screen.getByRole('button',{name:'陣形を保存'}));localStorage.setItem(FORMATION_LIBRARY_KEY,'broken');fireEvent.click(screen.getByRole('button',{name:'この陣形で適用'}));expect(apply).not.toHaveBeenCalled();expect(JSON.stringify(pieces)).toBe(before);expect(screen.getByText(/配置は変えていません/)).toBeVisible();
});
test('dirty state follows applied placement, not catalog selection or regenerated IDs',()=>{
 const apply=vi.fn(),pieces=defaultPlacement(1),view=render(<FormationLibrary pieces={pieces} onApply={apply}/>);save('元の陣形');const first=readLibrary()[0].id;
 view.rerender(<FormationLibrary pieces={pieces.map(p=>({...p,id:'fresh-'+p.id}))} onApply={apply}/>);expect(screen.getByRole('status',{name:'陣形の保存状態'})).toHaveTextContent('保存済み');
 view.rerender(<FormationLibrary pieces={swapped()} onApply={apply}/>);expect(screen.getByRole('status',{name:'陣形の保存状態'})).toHaveTextContent('未保存変更あり');save('別の陣形');
 fireEvent.change(screen.getByLabelText('保存済み陣形を選ぶ'),{target:{value:first}});expect(screen.getByRole('status',{name:'陣形の保存状態'})).toHaveTextContent('編集中：別の陣形');expect(apply).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'この陣形で適用'}));view.rerender(<FormationLibrary pieces={apply.mock.calls[0][0]} onApply={apply}/>);expect(screen.getByRole('status',{name:'陣形の保存状態'})).toHaveTextContent('編集中：元の陣形 · 保存済み');
});
test('overwrite clears dirty state only after a successful validated write',()=>{
 const apply=vi.fn(),view=render(<FormationLibrary pieces={defaultPlacement(1)} onApply={apply}/>);save();view.rerender(<FormationLibrary pieces={swapped()} onApply={apply}/>);
 const before=JSON.stringify(readLibrary());vi.spyOn(Storage.prototype,'setItem').mockImplementationOnce(()=>{throw Error('Quota');});fireEvent.click(screen.getByRole('button',{name:'上書き保存'}));expect(screen.getByRole('status',{name:'陣形の保存状態'})).toHaveTextContent('未保存変更あり');expect(JSON.stringify(readLibrary())).toBe(before);
 fireEvent.click(screen.getByRole('button',{name:'上書き保存'}));expect(screen.getByRole('status',{name:'陣形の保存状態'})).toHaveTextContent('保存済み');expect(readLibrary()[0].placements).toEqual(swapped().map(p=>({site:p.position,type:p.type})));
});
test('guide appears only on the first visit; preview adds no save-schema fields',()=>{
 const view=render(<FormationLibrary pieces={defaultPlacement(1)} onApply={vi.fn()}/>);expect(screen.getByRole('button',{name:'案内を閉じる'})).toBeVisible();save();expect(screen.getByRole('img',{name:/陣形プレビュー/}).querySelectorAll('rect')).toHaveLength(23);expect(Object.keys(readLibrary()[0]).sort()).toEqual(['createdAt','favorite','id','name','placements','updatedAt','version']);view.unmount();render(<FormationLibrary pieces={defaultPlacement(1)} onApply={vi.fn()}/>);expect(screen.queryByRole('button',{name:'案内を閉じる'})).toBeNull();expect(screen.getByRole('status',{name:'陣形の保存状態'})).toHaveTextContent('保存済み');
});
