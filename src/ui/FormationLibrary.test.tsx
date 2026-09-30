// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { defaultPlacement } from '../dev/fixtures';
import { FORMATION_LIBRARY_KEY, readLibrary } from '../formation/library';
import { FormationLibrary } from './FormationLibrary';
afterEach(()=>{cleanup();localStorage.clear();vi.restoreAllMocks();});
test('named save, overwrite, rename, duplicate, favorite, load and confirmed deletion retain valid placements',()=>{
  const apply=vi.fn(),pieces=defaultPlacement(1);render(<FormationLibrary pieces={pieces} onApply={apply}/>);
  fireEvent.click(screen.getByText(/自作陣形を保存・管理/));fireEvent.change(screen.getByLabelText('自作陣形の名前'),{target:{value:'前衛'}});fireEvent.click(screen.getByRole('button',{name:'新規保存'}));expect(readLibrary()).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'上書き'}));fireEvent.change(screen.getByLabelText('自作陣形の名前'),{target:{value:'防御'}});fireEvent.click(screen.getByRole('button',{name:'名前変更'}));expect(readLibrary()[0].name).toBe('防御');
  fireEvent.click(screen.getByRole('button',{name:'お気に入り 登録'}));expect(readLibrary()[0].favorite).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'複製'}));expect(readLibrary()).toHaveLength(2);fireEvent.click(screen.getByRole('button',{name:'陣形を読み込む'}));expect(apply).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({owner:1})]));
  fireEvent.click(screen.getByRole('button',{name:'削除'}));expect(readLibrary()).toHaveLength(2);fireEvent.click(screen.getByRole('button',{name:'取消'}));expect(readLibrary()).toHaveLength(2);
  fireEvent.click(screen.getByRole('button',{name:'削除'}));fireEvent.click(screen.getByRole('button',{name:'削除する'}));expect(readLibrary()).toHaveLength(1);
});
test('blocked storage and later corruption never apply or destroy the current placement',()=>{
  const pieces=defaultPlacement(1),before=JSON.stringify(pieces),apply=vi.fn();render(<FormationLibrary pieces={pieces} onApply={apply}/>);fireEvent.click(screen.getByText(/自作陣形を保存・管理/));
  const write=vi.spyOn(Storage.prototype,'setItem').mockImplementationOnce(()=>{throw new Error('容量不足');});fireEvent.click(screen.getByRole('button',{name:'新規保存'}));expect(screen.getByRole('status')).toHaveTextContent('容量不足');expect(readLibrary()).toHaveLength(0);
  write.mockRestore();fireEvent.click(screen.getByRole('button',{name:'新規保存'}));localStorage.setItem(FORMATION_LIBRARY_KEY,'broken');fireEvent.click(screen.getByRole('button',{name:'陣形を読み込む'}));expect(apply).not.toHaveBeenCalled();expect(JSON.stringify(pieces)).toBe(before);expect(screen.getByRole('status')).toHaveTextContent('配置は変えていません');
});
