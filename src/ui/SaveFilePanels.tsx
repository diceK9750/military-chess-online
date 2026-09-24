import { useState, type FormEvent } from 'react';
import { decryptMatch, encryptMatch, saveFileName, SAVE_EXTENSION, MAX_ENCRYPTED_FILE_LENGTH, EncryptedFileError } from '../save/encryptedFile';
import type { SavedCpuMatch } from '../save/match';

const importMessages: Record<string, string> = {
  INVALID_FILE: '対局ファイルの形式が正しくありません。',
  UNSUPPORTED_FILE_FORMAT: 'この対局ファイルの形式には対応していません。',
  DECRYPT_FAILED: 'パスワードが違うか、ファイルが破損・改ざんされています。',
  UNSUPPORTED_SAVE_FORMAT: 'この保存形式版には対応していません。',
  UNSUPPORTED_RULESET: 'このゲームルール版には対応していません。',
  INVALID_SAVE: '復号した対局データに不整合があります。',
};

function PasswordField({ label, value, onChange, visible }: { label: string; value: string; onChange(value: string): void; visible: boolean }) {
  return <label className="save-field">{label}<input type={visible ? 'text' : 'password'} value={value} autoComplete="off" onChange={event => onChange(event.target.value)} /></label>;
}

export function ExportPanel({ match, onClose }: { match: SavedCpuMatch; onClose(): void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) { setError('パスワードは8文字以上で入力してください。'); return; }
    if (password !== confirmation) { setError('確認用パスワードが一致しません。'); return; }
    setBusy(true); setError('');
    try {
      const content = await encryptMatch(match, password);
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = saveFileName(match);
      document.body.append(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPassword(''); setConfirmation('');
      onClose();
    } catch {
      setError('対局ファイルを生成できませんでした。もう一度お試しください。');
    } finally { setBusy(false); }
  }

  return <section className="save-panel"><p className="eyebrow">LOCAL BACKUP</p><h1>対局を保存</h1>
    <p>対局をパスワードで暗号化して、この端末へファイルを保存します。パスワードを忘れると復元できません。</p>
    <form onSubmit={submit}>
      <PasswordField label="パスワード" value={password} onChange={setPassword} visible={visible} />
      <PasswordField label="パスワード（確認）" value={confirmation} onChange={setConfirmation} visible={visible} />
      <label className="save-toggle"><input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)} /> パスワードを表示</label>
      {error && <p role="alert" className="save-error">{error}</p>}
      {busy && <p role="status">暗号化しています…</p>}
      <div className="actions"><button className="primary" type="submit" disabled={busy}>ファイルを保存</button><button className="secondary" type="button" onClick={onClose} disabled={busy}>戻る</button></div>
    </form>
  </section>;
}

export function ImportPanel({ onLoaded, onClose }: { onLoaded(match: SavedCpuMatch): void; onClose(): void }) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || !file.name.toLowerCase().endsWith(SAVE_EXTENSION) || file.size > MAX_ENCRYPTED_FILE_LENGTH) { setError('有効な .mcsave ファイルを選択してください。'); return; }
    if (!password) { setError('パスワードを入力してください。'); return; }
    setBusy(true); setError('');
    try {
      const match = await decryptMatch(await file.text(), password);
      setPassword('');
      onLoaded(match);
    } catch (cause) {
      setError(cause instanceof EncryptedFileError ? importMessages[cause.code] : '対局ファイルを読み込めませんでした。');
    } finally { setBusy(false); }
  }

  return <section className="save-panel"><p className="eyebrow">RESTORE MATCH</p><h1>保存した対局を読み込む</h1>
    <p>パスワード付き .mcsave ファイルを選びます。検証が終わるまで現在の対局は変更しません。</p>
    <form onSubmit={submit}>
      <label className="save-field">対局ファイル<input type="file" accept={SAVE_EXTENSION} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
      <PasswordField label="パスワード" value={password} onChange={setPassword} visible={visible} />
      <label className="save-toggle"><input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)} /> パスワードを表示</label>
      {error && <p role="alert" className="save-error">{error}</p>}
      {busy && <p role="status">復号と対局の検証をしています…</p>}
      <div className="actions"><button className="primary" type="submit" disabled={busy}>対局を読み込む</button><button className="secondary" type="button" onClick={onClose} disabled={busy}>戻る</button></div>
    </form>
  </section>;
}
