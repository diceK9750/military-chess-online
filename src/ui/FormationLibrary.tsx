import { useState } from 'react';
import type { Piece } from '../game/types';
import { createPreset, FORMATION_LIMIT, formationName, materializePreset, readLibrary, writeLibrary, type FormationPreset } from '../formation/library';

export function FormationLibrary({ pieces, onApply }: { pieces: readonly Piece[]; onApply(pieces: readonly Piece[]): void }) {
  const [loaded] = useState(() => { try { return { presets: readLibrary(), error: '' }; } catch { return { presets: [], error: '陣形ライブラリを読み込めません。破損記録は適用せず保持しています。' }; } });
  const [presets, setPresets] = useState<readonly FormationPreset[]>(loaded.presets);
  const [name, setName] = useState(`自作陣形 ${loaded.presets.length + 1}`), [selected, setSelected] = useState(''), [notice, setNotice] = useState(loaded.error), [deleting, setDeleting] = useState(false);
  const current = presets.find(p => p.id === selected);
  function commit(next: readonly FormationPreset[], message: string, id?: string) {
    try { if (loaded.error) throw new Error(loaded.error); writeLibrary(next); setPresets(next); if (id !== undefined) setSelected(id); setNotice(message); }
    catch (e) { setNotice(e instanceof Error ? e.message : '陣形を保存できません。現在の配置は変えていません。'); }
  }
  function save() {
    try { if (presets.length >= FORMATION_LIMIT) throw new Error(`保存上限は${FORMATION_LIMIT}件です。`); const preset = createPreset(pieces, name); commit([...presets, preset], '自作陣形を保存しました。', preset.id); }
    catch (e) { setNotice(e instanceof Error ? e.message : '保存できませんでした。'); }
  }
  function update(kind: 'overwrite' | 'rename' | 'favorite') {
    if (!current) return;
    try {
      const replacement = kind === 'overwrite' ? { ...current, placements: createPreset(pieces, current.name).placements } : kind === 'rename' ? { ...current, name: formationName(name) } : { ...current, favorite: !current.favorite };
      commit(presets.map(p => p.id === current.id ? { ...replacement, updatedAt: new Date().toISOString() } : p), '自作陣形を更新しました。');
    } catch (e) { setNotice(e instanceof Error ? e.message : '更新できませんでした。'); }
  }
  return <details className="formation-library"><summary>自作陣形を保存・管理（{presets.length}/{FORMATION_LIMIT}）</summary>
    <label>陣形名 <input aria-label="自作陣形の名前" maxLength={40} value={name} onChange={e => setName(e.target.value)} /></label>
    <div className="actions"><button onClick={() => save()}>新規保存</button></div>
    <label>自作陣形 <select aria-label="自作陣形" value={selected} onChange={e => { setSelected(e.target.value); const p = presets.find(p => p.id === e.target.value); if (p) setName(p.name); setDeleting(false); }}><option value="">選択してください</option>{[...presets].sort((a,b) => Number(b.favorite)-Number(a.favorite)).map(p => <option key={p.id} value={p.id}>{p.favorite ? '★ ' : ''}{p.name}</option>)}</select></label>
    <div className="actions">
      <button disabled={!current} onClick={() => { try { const fresh = readLibrary().find(p => p.id === selected); if (!fresh) throw new Error(); onApply(materializePreset(fresh)); setNotice('自作陣形を読み込みました。'); } catch { setNotice('保存陣形が不正です。配置は変えていません。'); } }}>陣形を読み込む</button>
      <button disabled={!current} onClick={() => update('overwrite')}>上書き</button><button disabled={!current} onClick={() => update('rename')}>名前変更</button>
      <button disabled={!current} onClick={() => { if (current) { try { if (presets.length >= FORMATION_LIMIT) throw new Error('保存上限に達しました。'); const copy = createPreset(materializePreset(current), `${current.name.slice(0,35)} コピー`); commit([...presets,copy], '陣形を複製しました。', copy.id); } catch { setNotice('陣形を複製できませんでした。'); } } }}>複製</button>
      <button disabled={!current} aria-pressed={current?.favorite ?? false} onClick={() => update('favorite')}>お気に入り {current?.favorite ? '解除' : '登録'}</button><button disabled={!current} onClick={() => setDeleting(true)}>削除</button>
    </div>
    {deleting && current && <div role="dialog" aria-label="陣形削除の確認"><p>「{current.name}」を削除しますか？ 現在の配置は残ります。</p><button onClick={() => { commit(presets.filter(p => p.id !== selected), '陣形を削除しました。', ''); setDeleting(false); }}>削除する</button><button onClick={() => setDeleting(false)}>取消</button></div>}
    {notice && <p role="status">{notice}</p>}
  </details>;
}
